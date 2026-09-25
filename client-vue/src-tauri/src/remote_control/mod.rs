//! Native authorization, supervision and input adapters. Production engine
//! activation remains disabled; real media is exercised only by the explicit
//! development harness. No webview boolean can create a LocalConsent.

mod authorization;
mod device_store;
mod guard;
#[cfg(feature = "remote-control-harness")]
mod harness;
mod host_process;
mod host_runtime;
mod input;
mod ipc;
mod media_liveness;
#[cfg(feature = "remote-control-harness")]
pub fn run_host_harness() -> Result<(), &'static str> {
    harness::run()
}
mod identity;
mod platform;
#[cfg(all(feature = "remote-control-harness", not(debug_assertions)))]
compile_error!("remote-control-harness is a debug-only development binary; never enable it in a packaged release");

use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogResult};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlCapabilities {
    runtime: &'static str,
    platform: &'static str,
    os_version: String,
    arch: &'static str,
    protocol_version: u32,
    engine_ready: bool,
    can_capture: bool,
    can_inject_input: bool,
    device_registration_ready: bool,
    device_identity_reset_ready: bool,
    consent_prompt_ready: bool,
    permissions: Permissions,
    reason: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Permissions {
    screen_capture: &'static str,
    input_control: &'static str,
}

#[derive(Default)]
pub struct RemoteControlState {
    host: Mutex<Option<host_runtime::HostSupervisor>>,
    identity: Arc<Mutex<identity::IdentityState>>,
}

impl RemoteControlState {
    pub fn stop(&self) -> Result<(), &'static str> {
        self.identity
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .stop();
        self.stop_host()
    }
    fn stop_host(&self) -> Result<(), &'static str> {
        let mut host = self.host.lock().map_err(|_| "REMOTE_STATE_UNAVAILABLE")?;
        if let Some(host) = host.as_mut() {
            host.stop(guard::StopReason::LocalStop)?;
        }
        *host = None;
        Ok(())
    }
    /// The trusted native transport adapter is the sole caller; no invoke can
    /// supply a driver, consent, trust anchor, readiness, or OS executor.
    #[allow(dead_code, clippy::too_many_arguments)]
    fn connect_native_host(
        &self,
        connection: &authorization::SignedEnvelope,
        transport: authorization::ObservedTransport,
        driver: Box<dyn host_runtime::MediaDriver>,
        input: Box<dyn input::InputExecutor>,
        probe: host_runtime::AvailabilityProbe,
        layout_version: u64,
    ) -> Result<Arc<Mutex<host_runtime::HostRuntime>>, &'static str> {
        let mut slot = self.host.lock().map_err(|_| "REMOTE_STATE_UNAVAILABLE")?;
        if let Some(host) = slot.as_mut() {
            if !host
                .runtime()
                .lock()
                .map_err(|_| "REMOTE_STATE_UNAVAILABLE")?
                .ended()
            {
                return Err("REMOTE_LOCAL_SESSION_BUSY");
            }
            host.stop(guard::StopReason::LocalStop)?;
            *slot = None;
        }
        let runtime = host_runtime::HostRuntime::connect(
            self.identity.clone(),
            identity::trusted_keys()?,
            connection,
            transport,
            driver,
            input,
            probe,
            layout_version,
            identity::wall_ms()?,
            Instant::now(),
        )?;
        let host = host_runtime::HostSupervisor::spawn(runtime);
        let runtime = host.runtime();
        *slot = Some(host);
        Ok(runtime)
    }
}

#[tauri::command]
pub fn remote_control_capabilities(
    window: tauri::WebviewWindow,
) -> Result<RemoteControlCapabilities, &'static str> {
    require_main_window(window.label())?;
    Ok(capabilities())
}

fn capabilities() -> RemoteControlCapabilities {
    let probe = platform::probe();
    RemoteControlCapabilities {
        runtime: "tauri",
        platform: probe.platform,
        os_version: probe.os_version,
        arch: probe.arch,
        protocol_version: guard::PROTOCOL_VERSION,
        // Neither TCC permission nor an OS version makes an absent engine ready.
        // No config/env/browser-provided flag can override these capabilities.
        engine_ready: false,
        can_capture: false,
        can_inject_input: false,
        device_registration_ready: probe.candidate_platform,
        device_identity_reset_ready: probe.candidate_platform,
        consent_prompt_ready: probe.candidate_platform
            && identity::trusted_keys()
                .ok()
                .zip(identity::wall_ms().ok())
                .is_some_and(|(keys, now)| keys.has_current_key(now)),
        permissions: Permissions {
            screen_capture: probe.screen_capture.as_str(),
            input_control: probe.input_control.as_str(),
        },
        reason: if probe.candidate_platform {
            "ENGINE_NOT_READY"
        } else {
            "PLATFORM_UNSUPPORTED"
        },
    }
}

/// The only registration signature operation. Payload, platform and public key
/// are built by native code; the key remains in the OS store/native memory.
#[tauri::command]
pub async fn remote_control_register_device(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, RemoteControlState>,
    challenge: identity::DeviceChallenge,
    alias: String,
) -> Result<identity::RegistrationProof, &'static str> {
    require_main_window(window.label())?;
    let state = state.identity.clone();
    let operation = state
        .lock()
        .map_err(|_| "REMOTE_STATE_UNAVAILABLE")?
        .begin()?;
    let worker_state = state.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let result = identity::register(
            &device_store::OsSeedStore,
            challenge,
            alias,
            identity::wall_ms()?,
        );
        worker_state
            .lock()
            .map_err(|_| "REMOTE_STATE_UNAVAILABLE")?
            .check(operation)?;
        result
    })
    .await
    .map_err(|_| "REMOTE_NATIVE_WORKER_FAILED");
    state
        .lock()
        .map_err(|_| "REMOTE_STATE_UNAVAILABLE")?
        .finish(operation)?;
    result?
}

/// Verify the compiled trust anchor and device binding before showing a native
/// OS dialog. Neither the dialog's decision nor its text is invoke-controlled.
#[tauri::command]
pub async fn remote_control_confirm_request(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, RemoteControlState>,
    request: authorization::SignedEnvelope,
) -> Result<identity::ConsentResponse, &'static str> {
    require_main_window(window.label())?;
    let keys = identity::trusted_keys()?;
    let state = state.identity.clone();
    let operation = state
        .lock()
        .map_err(|_| "REMOTE_STATE_UNAVAILABLE")?
        .begin()?;
    let worker_state = state.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let verified = identity::VerifiedApproval::verify(
            &device_store::OsSeedStore,
            &keys,
            &request,
            identity::wall_ms()?,
            Instant::now(),
        )?;
        let verified = worker_state
            .lock()
            .map_err(|_| "REMOTE_STATE_UNAVAILABLE")?
            .prepare(operation, verified, Instant::now())?;
        let wants_control = verified.wants_control();
        let grant_control = verified.is_grant_control();
        // Cancellation must never be mapped to approval: plugin-dialog maps a
        // window close/Escape to the custom cancel label on every platform.
        // The initial/default button is reject; only an explicit second-button
        // choice opens scope selection for a control request.
        let selected = app
            .dialog()
            .message(verified.message())
            .title("ToDesk · 本机远程协助确认")
            .buttons(MessageDialogButtons::YesNoCancelCustom(
                "拒绝".into(),
                if wants_control {
                    "继续选择权限".into()
                } else {
                    "允许查看".into()
                },
                "取消".into(),
            ))
            .blocking_show_with_result();
        let selected = if wants_control
            && matches!(&selected, MessageDialogResult::Custom(text) if text == "继续选择权限")
        {
            verified.check_live(Instant::now())?;
            worker_state
                .lock()
                .map_err(|_| "REMOTE_STATE_UNAVAILABLE")?
                .check(operation)?;
            app.dialog()
                .message(verified.message())
                .title("ToDesk · 选择本机授权范围")
                .buttons(MessageDialogButtons::YesNoCancelCustom(
                    "仅允许查看".into(),
                    "允许控制".into(),
                    "取消".into(),
                ))
                .blocking_show_with_result()
        } else {
            selected
        };
        let decision = match selected {
            MessageDialogResult::Custom(ref text) if text == "允许控制" && wants_control => {
                identity::Decision::Control
            }
            MessageDialogResult::Custom(ref text) if text == "允许查看" || text == "仅允许查看" => {
                identity::Decision::View
            }
            _ => identity::Decision::Reject,
        };
        let response = worker_state
            .lock()
            .map_err(|_| "REMOTE_STATE_UNAVAILABLE")?
            .approve(
                operation,
                verified,
                decision,
                identity::wall_ms()?,
                Instant::now(),
            )?;
        if grant_control && decision == identity::Decision::Control {
            let native = app.state::<RemoteControlState>();
            let host = native.host.lock().map_err(|_| "REMOTE_STATE_UNAVAILABLE")?;
            if let Some(host) = host.as_ref() {
                let shared = host.runtime();
                let mut runtime = shared.lock().map_err(|_| "REMOTE_STATE_UNAVAILABLE")?;
                if let Err(error) = runtime.refresh_local_consent(Instant::now()) {
                    let _ = runtime.stop(guard::StopReason::NotAuthorized);
                    return Err(error);
                }
            }
        }
        Ok(response)
    })
    .await
    .map_err(|_| "REMOTE_NATIVE_WORKER_FAILED");
    state
        .lock()
        .map_err(|_| "REMOTE_STATE_UNAVAILABLE")?
        .finish(operation)?;
    result?
}

#[derive(Serialize)]
pub struct IdentityResetResult {
    reset: bool,
}

/// Rotating a registered key is never an automatic retry. This separate native
/// confirmation explicitly changes the OS identity; old server trust is not
/// inherited or silently revoked.
#[tauri::command]
pub async fn remote_control_reset_identity(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, RemoteControlState>,
    user_id: u64,
) -> Result<IdentityResetResult, &'static str> {
    require_main_window(window.label())?;
    let identity = state.identity.clone();
    let operation = identity
        .lock()
        .map_err(|_| "REMOTE_STATE_UNAVAILABLE")?
        .begin()?;
    let worker_state = identity.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(IdentityResetResult, identity::Operation), &'static str> {
        let previous = identity::identity_fingerprint(&device_store::OsSeedStore, user_id)?;
        worker_state.lock().map_err(|_| "REMOTE_STATE_UNAVAILABLE")?.check(operation)?;
        let decision = app.dialog().message(format!("账号：{user_id}\n当前设备公钥指纹：{previous}\n\n重建将替换本机该账号的设备私钥并清除本地协助授权。旧设备记录及撤销状态仍保留在服务端，新的身份需要重新登记和取得协助许可。"))
            .title("ToDesk · 重建设备身份")
            .buttons(MessageDialogButtons::YesNoCancelCustom("保留原身份".into(), "重建身份".into(), "取消".into()))
            .blocking_show_with_result();
        worker_state.lock().map_err(|_| "REMOTE_STATE_UNAVAILABLE")?.check(operation)?;
        if !matches!(decision, MessageDialogResult::Custom(ref label) if label == "重建身份") {
            return Ok((IdentityResetResult { reset: false }, operation));
        }
        // Fail closed before the first OS write: a write can succeed even when
        // its following confirmation read fails. The current reset alone gets
        // a replacement ticket; all previous local authority is destroyed.
        let native = app.state::<RemoteControlState>();
        let operation = worker_state.lock().map_err(|_| "REMOTE_STATE_UNAVAILABLE")?.invalidate_for_reset(operation)?;
        native.stop_host()?;
        identity::reset_identity(&device_store::OsSeedStore, user_id, &previous)?;
        worker_state.lock().map_err(|_| "REMOTE_STATE_UNAVAILABLE")?.check(operation)?;
        Ok((IdentityResetResult { reset: true }, operation))
    }).await.map_err(|_| "REMOTE_NATIVE_WORKER_FAILED").and_then(|result| result);
    let mut state = identity.lock().map_err(|_| "REMOTE_STATE_UNAVAILABLE")?;
    match result {
        Ok((result, completed)) => {
            state.finish(completed)?;
            Ok(result)
        }
        Err(error) => {
            state.release(operation);
            Err(error)
        }
    }
}

#[tauri::command]
pub fn remote_control_stop(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, RemoteControlState>,
) -> Result<(), &'static str> {
    require_main_window(window.label())?;
    state.stop()
}

fn require_main_window(label: &str) -> Result<(), &'static str> {
    if label == "main" {
        Ok(())
    } else {
        Err("REMOTE_CONTROL_WINDOW_NOT_ALLOWED")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capabilities_never_advertise_an_absent_engine() {
        let result = capabilities();
        assert_eq!(result.protocol_version, 1);
        assert!(!result.engine_ready);
        assert!(!result.can_capture);
        assert!(!result.can_inject_input);
        assert_eq!(result.platform, std::env::consts::OS);
        assert_eq!(result.arch, std::env::consts::ARCH);
        assert!(!result.os_version.is_empty());
    }

    #[test]
    fn secondary_windows_cannot_invoke_remote_control_commands() {
        assert!(require_main_window("main").is_ok());
        for label in ["", "remote", "approval", "main-2"] {
            assert!(require_main_window(label).is_err());
        }
    }

    #[test]
    fn repeated_local_stop_is_safe() {
        let state = RemoteControlState::default();
        state.stop().unwrap();
        state.stop().unwrap();
    }
}
