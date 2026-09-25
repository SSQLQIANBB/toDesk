//! Explicit CLI development harness. Never enabled in a packaged desktop build.
#[allow(dead_code)]
mod remote_control;
fn main() {
    if let Err(code) = remote_control::run_host_harness() {
        println!("{}", serde_json::json!({"event":"error","code":code}));
        std::process::exit(1);
    }
}
