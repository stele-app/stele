#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Write any panic to %TEMP%\stele-panic.log so we can diagnose release-build
    // crashes (release builds detach stderr via windows_subsystem="windows").
    std::panic::set_hook(Box::new(|info| {
        let log_path = std::env::temp_dir().join("stele-panic.log");
        let msg = format!(
            "=== Stele panic ===\n{info}\n\nLocation: {:?}\nPayload: {:?}\n",
            info.location(),
            info.payload().downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| info.payload().downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "<non-string panic payload>".to_string())
        );
        let _ = std::fs::write(&log_path, msg);
    }));

    stele_lib::run()
}
