use tauri::{Emitter, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

fn is_artifact_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".jsx")
        || lower.ends_with(".tsx")
        || lower.ends_with(".html")
        || lower.ends_with(".svg")
        || lower.ends_with(".md")
        || lower.ends_with(".mermaid")
}

fn file_arg_from_args(args: impl Iterator<Item = String>) -> Option<String> {
    args.skip(1)
        .find(|a| !a.starts_with('-') && is_artifact_file(a))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create initial tables",
        sql: include_str!("../migrations/001_initial.sql"),
        kind: MigrationKind::Up,
    }];

    // Capture file path from initial CLI args
    let file_arg = file_arg_from_args(std::env::args());

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:atelier.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Second instance launched — extract file arg and emit to existing window
            if let Some(path) = file_arg_from_args(args.into_iter().map(|s| s.to_string())) {
                let _ = app.emit("open-file", path);
            }
            // Focus the existing window
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![read_file])
        .setup(move |app| {
            if let Some(path) = file_arg {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    let _ = handle.emit("open-file", path);
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Atelier");
}
