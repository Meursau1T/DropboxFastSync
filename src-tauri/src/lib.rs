mod oauth;

use std::fs;
use tauri::Manager;
use tauri::tray::{TrayIconEvent, MouseButtonState};


#[tauri::command]
fn start_oauth(app: tauri::AppHandle) -> Result<u16, String> {
    oauth::start_oauth_server(app)
}

#[tauri::command]
fn read_file(path: String) -> Result<Vec<u8>, String> {
    eprintln!("[read_file] reading: {}", path);
    let data = fs::read(&path).map_err(|e| format!("read error '{}': {}", path, e))?;
    eprintln!("[read_file] read {} bytes from {}", data.len(), path);
    Ok(data)
}

fn toggle_tray_panel(app: &tauri::AppHandle, position: tauri::PhysicalPosition<f64>) {
    let panel_label = "tray-panel";

    if let Some(window) = app.get_webview_window(panel_label) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.set_position(tauri::PhysicalPosition::new(
                position.x as i32 - 175,
                position.y as i32,
            ));
            let _ = window.show();
            let _ = window.set_focus();
        }
    } else {
        let window = tauri::WebviewWindowBuilder::new(
            app,
            panel_label,
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("fastShare")
        .inner_size(350.0, 500.0)
        .position(
            (position.x as f64) - 175.0,
            position.y as f64,
        )
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(true)
        .build();

        if let Ok(win) = window {
            let _ = win.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![start_oauth, read_file])
        .setup(|app| {
            // Set up tray icon click handler
            if let Some(tray) = app.tray_by_id("main-tray") {
                let app_handle = app.handle().clone();
                tray.on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click { position, button_state: MouseButtonState::Up, .. } = event {
                        toggle_tray_panel(&app_handle, position);
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
