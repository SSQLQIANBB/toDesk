//! Standalone probe shares the production platform implementation; no Cargo or
//! network dependencies, no screen frames or input injection.
#[path = "../client-vue/src-tauri/src/remote_control/platform.rs"]
mod platform;

fn main() {
    let probe = platform::probe();
    println!(
        "{{\"platform\":{:?},\"osVersion\":{:?},\"arch\":{:?},\"candidatePlatform\":{},\"protocolVersion\":1,\"engineReady\":false,\"canCapture\":false,\"canInjectInput\":false,\"permissions\":{{\"screenCapture\":{:?},\"inputControl\":{:?}}}}}",
        probe.platform,
        probe.os_version,
        probe.arch,
        probe.candidate_platform,
        probe.screen_capture.as_str(),
        probe.input_control.as_str(),
    );
}
