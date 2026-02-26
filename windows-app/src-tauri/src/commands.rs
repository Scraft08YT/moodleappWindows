use tauri::command;

/// Returns the application version from Cargo.toml.
#[command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Applies a window background effect (Mica, Acrylic, or None).
#[command]
pub fn set_window_effect(window: tauri::WebviewWindow, effect: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::{apply_acrylic, apply_mica, clear_mica, clear_acrylic};
        match effect.as_str() {
            "mica" => apply_mica(&window, Some(true)).map_err(|e| e.to_string())?,
            "acrylic" => apply_acrylic(&window, Some((18u8, 18u8, 18u8, 200u8))).map_err(|e| e.to_string())?,
            "none" => {
                let _ = clear_mica(&window);
                let _ = clear_acrylic(&window);
            }
            _ => return Err(format!("Unknown effect: {effect}")),
        }
    }
    Ok(())
}
