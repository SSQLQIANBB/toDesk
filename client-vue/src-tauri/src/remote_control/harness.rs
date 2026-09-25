//! Test-key, recording-input-only command line harness. Not a desktop invoke.
use super::{
    authorization::{ObservedTransport, PinnedKey, PinnedKeys, SignedEnvelope},
    guard::{ReleasePlan, StopReason},
    host_process::{ProcessMediaDriver, VerifiedProgram},
    host_runtime::{Availability, HostRuntime, HostSupervisor},
    identity::{self, Decision, IdentityState},
    input::{InputAction, InputEnvironment, InputError, InputExecutor},
    ipc::IpcMessage,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Value};
use std::{
    ffi::OsString,
    io::{self, BufRead, Read, Write},
    path::Path,
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
struct RecordingInput;
impl InputExecutor for RecordingInput {
    fn preflight(&mut self) -> Result<InputEnvironment, InputError> {
        Ok(InputEnvironment {
            screen_id: "primary".into(),
            layout_version: 1,
        })
    }
    fn execute(&mut self, _: &InputAction, _: Instant) -> Result<(), InputError> {
        Ok(())
    }
    fn release(&mut self, _: &ReleasePlan) -> Result<(), InputError> {
        Ok(())
    }
}
fn emit(value: Value) {
    let stdout = io::stdout();
    let mut out = stdout.lock();
    let _ = writeln!(out, "{value}");
    let _ = out.flush();
}
fn string<'a>(value: &'a Value, key: &str) -> Result<&'a str, &'static str> {
    value[key].as_str().ok_or("INVALID_HARNESS_MESSAGE")
}
fn decode_channel(payload: &Value) -> Result<(&str, Vec<u8>), &'static str> {
    let label = string(payload, "label")?;
    let data = string(payload, "data")?;
    let bytes = URL_SAFE_NO_PAD
        .decode(data)
        .map_err(|_| "INVALID_HARNESS_CHANNEL")?;
    if bytes.len() > 4096 || URL_SAFE_NO_PAD.encode(&bytes) != data {
        return Err("INVALID_HARNESS_CHANNEL");
    }
    Ok((label, bytes))
}
pub(super) fn run() -> Result<(), &'static str> {
    let mut args = std::env::args().skip(1);
    let mut program = None;
    let mut program_hash = None;
    let mut script = None;
    let mut script_hash = None;
    let mut sidecar_args = Vec::new();
    while let Some(arg) = args.next() {
        let value = args.next().ok_or("INVALID_HARNESS_ARGUMENTS")?;
        match arg.as_str() {
            "--program" => program = Some(value),
            "--program-sha256" => program_hash = Some(value),
            "--script" => script = Some(value),
            "--script-sha256" => script_hash = Some(value),
            "--sidecar-arg" => sidecar_args.push(OsString::from(value)),
            _ => return Err("INVALID_HARNESS_ARGUMENTS"),
        }
    }
    let mut program = Some(VerifiedProgram::harness(
        Path::new(&program.ok_or("HARNESS_PROGRAM_REQUIRED")?),
        &program_hash.ok_or("HARNESS_HASH_REQUIRED")?,
    )?);
    let mut script = Some(VerifiedProgram::harness(
        Path::new(&script.ok_or("HARNESS_SCRIPT_REQUIRED")?),
        &script_hash.ok_or("HARNESS_HASH_REQUIRED")?,
    )?);
    let (commands, receive) = mpsc::sync_channel(32);
    thread::spawn(move || {
        let stdin = io::stdin();
        let mut reader = stdin.lock();
        loop {
            let mut line = Vec::new();
            let count = reader.by_ref().take(131073).read_until(b'\n', &mut line);
            if !matches!(count,Ok(n) if n>0) || line.len() > 131072 {
                break;
            }
            let command =
                serde_json::from_slice::<Value>(&line).map_err(|_| "INVALID_HARNESS_JSON");
            if commands.send(command).is_err() {
                break;
            }
        }
    });
    let mut identity: Option<Arc<Mutex<IdentityState>>> = None;
    let mut keys = None;
    let mut driver: Option<ProcessMediaDriver> = None;
    let mut events: Option<mpsc::Receiver<IpcMessage>> = None;
    let mut supervisor: Option<HostSupervisor> = None;
    let mut negotiation = None;
    let mut dtls = None;
    let mut pending_channel = Vec::new();
    let mut challenge_sent = false;
    let mut last_supervisor = Instant::now();
    let mut closing = false;
    let mut last_health = None;
    let result = (|| {
        loop {
            let command = match receive.recv_timeout(Duration::from_millis(20)) {
                Ok(value) => Some(value?),
                Err(mpsc::RecvTimeoutError::Timeout) => None,
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    closing = true;
                    None
                }
            };
            if let Some(command) = command {
                match string(&command,"type")? {
                    "init"=>{
                        if identity.is_some(){return Err("HARNESS_ALREADY_INITIALIZED");}
                        let pinned:Vec<PinnedKey>=serde_json::from_value(command["keys"].clone()).map_err(|_| "INVALID_HARNESS_KEYS")?;
                        let pinned=PinnedKeys::new(pinned).map_err(|_| "INVALID_HARNESS_KEYS")?;
                        let approval:SignedEnvelope=serde_json::from_value(command["approval"].clone()).map_err(|_| "INVALID_HARNESS_APPROVAL")?;
                        let decision=match string(&command,"decision")? {"view"=>Decision::View,"control"=>Decision::Control,_=>return Err("INVALID_HARNESS_DECISION")};
                        let (state,response)=identity::approve_harness_fixture(&pinned,&approval,decision,identity::wall_ms()?,Instant::now())?;
                        let serialized=serde_json::to_value(response).map_err(|_| "INVALID_HARNESS_CONSENT")?;
                        let envelope=&serialized["consent"];
                        let body=URL_SAFE_NO_PAD.decode(string(envelope,"payload")?).map_err(|_| "INVALID_HARNESS_CONSENT")?;
                        let claims:Value=serde_json::from_slice(&body).map_err(|_| "INVALID_HARNESS_CONSENT")?;
                        let session_id=string(&command,"sessionId")?;
                        if claims["sessionId"]!=session_id {return Err("INVALID_HARNESS_SESSION");}
                        let (process,reader)=ProcessMediaDriver::spawn(program.take().unwrap(),script.take(),&sidecar_args,session_id)?;
                        emit(json!({"event":"consent","payload":claims,"envelope":envelope,"enginePid":process.pid()?}));
                        identity=Some(Arc::new(Mutex::new(state)));keys=Some(pinned);driver=Some(process);events=Some(reader);
                    },
                    "offer"=>{
                        if negotiation.is_some(){return Err("HARNESS_OFFER_REPLAY");}
                        let id=string(&command,"negotiationId")?;if !super::authorization::uuid(id){return Err("INVALID_HARNESS_NEGOTIATION");}
                        negotiation=Some(id.to_owned());driver.as_ref().ok_or("HARNESS_NOT_INITIALIZED")?.send("offer",json!({"sdp":string(&command,"sdp")?}))?;
                    },
                    "ice"=>driver.as_ref().ok_or("HARNESS_NOT_INITIALIZED")?.send("ice",json!({"candidate":string(&command,"candidate")?,"sdpMLineIndex":command["sdpMLineIndex"]}))?,
                    "connection"=>{
                        if supervisor.is_some(){return Err("HARNESS_CONNECTION_REPLAY");}
                        let observed:Value=dtls.clone().ok_or("HARNESS_NATIVE_DTLS_REQUIRED")?;
                        let transport=ObservedTransport{negotiation_id:negotiation.clone().ok_or("HARNESS_OFFER_REQUIRED")?,host_fingerprint:string(&observed,"hostFingerprint")?.into(),controller_fingerprint:string(&observed,"controllerFingerprint")?.into()};
                        let proof:SignedEnvelope=serde_json::from_value(command["envelope"].clone()).map_err(|_| "INVALID_HARNESS_CONNECTION")?;
                        let host=HostRuntime::connect(identity.as_ref().ok_or("HARNESS_NOT_INITIALIZED")?.clone(),keys.clone().ok_or("HARNESS_NOT_INITIALIZED")?,&proof,transport,
                            Box::new(driver.as_ref().unwrap().clone()),Box::new(RecordingInput),Box::new(||Availability{capture:super::platform::permissions().0 == super::platform::PermissionState::Granted,input:true}),1,identity::wall_ms()?,Instant::now())?;
                        supervisor=Some(HostSupervisor::spawn(host));
                        emit(json!({"event":"ready","enginePid":driver.as_ref().unwrap().pid()?}));
                    },
                    "lease"=>{
                        let proof=serde_json::from_value(command["envelope"].clone()).map_err(|_| "INVALID_HARNESS_LEASE")?;
                        supervisor.as_ref().ok_or("HARNESS_CONNECTION_REQUIRED")?.runtime().lock().map_err(|_| "HARNESS_STATE_FAILED")?.accept_lease(&proof,identity::wall_ms()?,Instant::now())?;
                        emit(json!({"event":"lease-installed"}));
                    },
                    "challenge"=>{
                        let lease=supervisor.as_ref().ok_or("HARNESS_CONNECTION_REQUIRED")?.runtime().lock().map_err(|_| "HARNESS_STATE_FAILED")?.challenge(Instant::now())?;
                        emit(json!({"event":"challenge","challenge":lease.challenge,"leaseSeq":lease.lease_seq}));
                    },
                    "pause"=>{supervisor.as_ref().ok_or("HARNESS_CONNECTION_REQUIRED")?.runtime().lock().map_err(|_| "HARNESS_STATE_FAILED")?.pause(StopReason::LocalStop)?;},
                    "heartbeat"=>{}, // Operator traffic never substitutes for actual controller DataChannel heartbeats.
                    "stop"=>closing=true,
                    _=>return Err("INVALID_HARNESS_COMMAND"),
                }
            }
            if let Some(supervisor) = &supervisor {
                if supervisor
                    .runtime()
                    .lock()
                    .map_err(|_| "HARNESS_STATE_FAILED")?
                    .ended()
                {
                    closing = true;
                }
            }
            if let Some(events) = &events {
                while let Ok(mut event) = events.try_recv() {
                    if event.kind == "stopped" {
                        closing = true;
                    }
                    if event.kind == "pipe-closed" {
                        if closing {
                            continue;
                        } else {
                            return Err("REMOTE_ENGINE_PIPE_CLOSED");
                        }
                    }

                    if event.kind == "ready" {
                        event.payload["pid"] = json!(driver.as_ref().unwrap().pid()?);
                    }
                    if event.kind == "dtls" {
                        if dtls.is_some() {
                            return Err("HARNESS_DTLS_REPLACED");
                        }
                        dtls = Some(event.payload.clone());
                    }
                    if event.kind == "channel-data" {
                        pending_channel.push(event.payload.clone());
                        if pending_channel.len() > 32 {
                            return Err("HARNESS_CHANNEL_BACKPRESSURE");
                        }
                    }
                    let failed = event.kind == "error";
                    emit(json!({"event":"sidecar","kind":event.kind,"payload":event.payload}));
                    if failed && !closing {
                        return Err("REMOTE_ENGINE_FAILED");
                    }
                }
            }
            if let Some(supervisor) = &supervisor {
                let shared = supervisor.runtime();
                let mut runtime = shared.lock().map_err(|_| "HARNESS_STATE_FAILED")?;
                if runtime.ended() {
                    pending_channel.clear();
                }
                for payload in pending_channel.drain(..) {
                    let (label, bytes) = decode_channel(&payload)?;
                    match label {
                        "rc-state-v1" | "rc-input-v1" => {
                            let result = if label == "rc-state-v1" {
                                runtime.state_message(&bytes, Instant::now())
                            } else {
                                runtime.input_message(&bytes, Instant::now())
                            };
                            match result {
                                Err(
                                    reason @ ("REMOTE_MEDIA_NOT_LIVE"
                                    | "REMOTE_CONTROL_NOT_ALLOWED"),
                                ) => emit(json!({"event":"input-denied","reason":reason})),
                                other => other?,
                            }
                        }
                        _ => return Err("HARNESS_CHANNEL_REJECTED"),
                    }
                }
                let health = runtime.media_health();
                if last_health != Some(health) {
                    emit(
                        json!({"event":"media-health","status":health.status,"state":health.status,"stage":health.stage}),
                    );
                    last_health = Some(health);
                }
                if runtime.is_ready() && !challenge_sent {
                    let lease = runtime.challenge(Instant::now())?;
                    challenge_sent = true;
                    emit(
                        json!({"event":"challenge","challenge":lease.challenge,"leaseSeq":lease.lease_seq}),
                    );
                }
                if runtime.ended() {
                    closing = true;
                }
            }
            if closing {
                break;
            }
            if Instant::now().duration_since(last_supervisor) >= Duration::from_millis(500) {
                if let Some(driver) = &driver {
                    driver.send("heartbeat", json!({}))?;
                }
                if let Some(supervisor) = &supervisor {
                    let shared = supervisor.runtime();
                    let mut runtime = shared.lock().map_err(|_| "HARNESS_STATE_FAILED")?;
                    runtime.supervisor_heartbeat(Instant::now())?;
                }
                last_supervisor = Instant::now();
            }
        }
        Ok(())
    })();
    // A proven native expiry may race a final heartbeat/challenge. Do not
    // classify arbitrary failures as normal merely because cleanup follows.
    let result = match result {
        Err(error)
            if supervisor.as_ref().is_some_and(|host| {
                host.runtime()
                    .lock()
                    .is_ok_and(|runtime| runtime.expected_terminal_error(error))
            }) =>
        {
            Ok(())
        }
        result => result,
    };
    if let Some(supervisor) = &mut supervisor {
        let _ = supervisor.stop(StopReason::LocalStop);
    }
    if let Some(driver) = &driver {
        driver.terminate_bounded()?;
    }
    if let Some(events) = &events {
        for event in events.try_iter() {
            if event.kind != "error" {
                emit(json!({"event":"sidecar","kind":event.kind,"payload":event.payload}));
            }
        }
    }
    if result.is_ok() {
        let reason = supervisor
            .as_ref()
            .and_then(|host| {
                host.runtime()
                    .lock()
                    .ok()
                    .and_then(|runtime| runtime.stop_reason())
            })
            .map(|reason| format!("{reason:?}"));
        emit(
            json!({"event":"stopped","enginePid":driver.as_ref().and_then(|p|p.pid().ok()),"noOsInput":true,"reason":reason,"stopReason":reason}),
        );
    }
    result
}
