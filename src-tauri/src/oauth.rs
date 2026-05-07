use std::thread;

use tauri::{AppHandle, Emitter};

pub fn start_oauth_server(app: AppHandle) -> Result<u16, String> {
    let server = tiny_http::Server::http("127.0.0.1:1420")
        .map_err(|e| format!("Failed to start OAuth server on port 1420: {}", e))?;
    let port = server.server_addr().to_ip().unwrap().port();

    thread::spawn(move || {
        if let Ok(request) = server.recv() {
            let url = request.url().to_string();
            let code = extract_code(&url);

            let body = if code.is_some() {
                "<html><body style=\"font-family:sans-serif;text-align:center;padding-top:80px\"><h2>Authentication successful!</h2><p>You may close this window and return to the app.</p></body></html>"
            } else {
                "<html><body style=\"font-family:sans-serif;text-align:center;padding-top:80px\"><h2>Authentication failed</h2><p>No authorization code received.</p></body></html>"
            };
            request.respond(tiny_http::Response::from_string(body)).ok();

            if let Some(c) = code {
                app.emit("oauth-code", c).ok();
            }
        }
    });

    Ok(port)
}

fn extract_code(url: &str) -> Option<String> {
    let query = url.split('?').nth(1)?;
    for param in query.split('&') {
        let mut kv = param.splitn(2, '=');
        if let (Some(key), Some(val)) = (kv.next(), kv.next()) {
            if key == "code" {
                return Some(val.to_string());
            }
        }
    }
    None
}
