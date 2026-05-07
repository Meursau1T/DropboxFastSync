mod oauth;

use std::fs;


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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![start_oauth, read_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
