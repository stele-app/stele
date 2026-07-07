use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

fn is_artifact_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".stele")
        || lower.ends_with(".jsx")
        || lower.ends_with(".tsx")
        || lower.ends_with(".html")
        || lower.ends_with(".svg")
        || lower.ends_with(".md")
        || lower.ends_with(".mermaid")
}

/// A local artifact file passed on the command line (file association / CLI).
/// Excludes `stele://` deep links, which are routed separately — otherwise a
/// link like `stele://view?src=…/a.tsx` would be misread as a file path.
fn file_arg_from_args(args: impl Iterator<Item = String>) -> Option<String> {
    args.skip(1)
        .find(|a| !a.starts_with('-') && !a.starts_with("stele://") && is_artifact_file(a))
}

/// A `stele://…` deep link passed on the command line. This is how Windows and
/// Linux deliver a deep link (as an argv entry to a fresh or second instance);
/// macOS delivers it through `on_open_url` instead.
fn deep_link_from_args(args: impl Iterator<Item = String>) -> Option<String> {
    args.skip(1).find(|a| a.starts_with("stele://"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add artifact_permissions table",
            sql: include_str!("../migrations/002_permissions.sql"),
            kind: MigrationKind::Up,
        },
    ];

    // Capture the initial CLI args: either a local artifact file (file
    // association) or a stele:// deep link (Windows/Linux cold start).
    let file_arg = file_arg_from_args(std::env::args());
    let deep_link_arg = deep_link_from_args(std::env::args());

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:stele.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Second launch — could be a file open or a stele:// deep link.
            // A deep link takes precedence (it can't also be a file path).
            let owned: Vec<String> = args.into_iter().map(|s| s.to_string()).collect();
            if let Some(url) = deep_link_from_args(owned.iter().cloned()) {
                let _ = app.emit("open-deep-link", url);
            } else if let Some(path) = file_arg_from_args(owned.into_iter()) {
                let _ = app.emit("open-file", path);
            }
            // Bring the existing window forward either way.
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        // Deep-link plugin is registered after single-instance so the already
        // running instance receives stele:// links on Windows/Linux.
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![read_file])
        .setup(move |app| {
            // Cold-start file open (file association / CLI). The 500 ms delay
            // lets the webview mount its `open-file` listener first.
            if let Some(path) = file_arg {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    let _ = handle.emit("open-file", path);
                });
            }

            // Cold-start deep link on Windows/Linux (delivered via argv). Same
            // delay so the `open-deep-link` listener is ready.
            if let Some(url) = deep_link_arg {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    let _ = handle.emit("open-deep-link", url);
                });
            }

            // Runtime deep links. macOS delivers every stele:// link here (cold
            // and warm); the plugin buffers the launching URL until this handler
            // is registered. The webview parses the URL and opens the artifact.
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let _ = handle.emit("open-deep-link", url.to_string());
                }
                if let Some(w) = handle.get_webview_window("main") {
                    let _ = w.set_focus();
                }
            });

            // Dev convenience: register the scheme at runtime so `tauri dev` can
            // receive stele:// links. Installed builds register it via the
            // bundler, where this is a harmless refresh. Not supported on macOS.
            #[cfg(any(windows, target_os = "linux"))]
            {
                let _ = app.deep_link().register_all();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Stele");
}
