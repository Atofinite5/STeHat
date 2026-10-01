// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use whispermesh_core::crypto::{CryptoEngine, IdentityKeys};
use tauri::Manager;
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[tauri::command]
fn get_or_create_device_identity() -> Result<IdentityKeys, String> {
    // Generate device identity using OS entropy
    let host_id = format!("mac-{}", uuid::Uuid::new_v4().to_string()[..8].to_string());
    let identity = CryptoEngine::generate_identity(host_id);
    Ok(identity)
}

#[tauri::command]
fn sign_challenge(private_seed_b64: String, challenge: String) -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;
    let seed = BASE64.decode(private_seed_b64).map_err(|e| e.to_string())?;
    CryptoEngine::sign_message(&seed, challenge.as_bytes())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                .expect("Unsupported platform for vibrancy");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_or_create_device_identity,
            sign_challenge
        ])
        .run(tauri::generate_context!())
        .expect("error while running WhisperMesh desktop application");
}
