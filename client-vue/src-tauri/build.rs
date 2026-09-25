fn main() {
    println!("cargo:rerun-if-changed=remote-control-trusted-keys.json");
    println!("cargo:rerun-if-changed=remote-control-sidecars.json");
    // App commands otherwise bypass the per-window capability allowlist.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "remote_control_capabilities",
            "remote_control_stop",
            "remote_control_register_device",
            "remote_control_confirm_request",
            "remote_control_reset_identity",
        ]),
    ))
    .expect("failed to build desktop command permissions");
}
