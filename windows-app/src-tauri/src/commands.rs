use tauri::command;

/// Returns the application version from Cargo.toml.
#[command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Opens a file using the system default application.
///
/// Security: only files inside the user's Downloads folder are allowed.
#[command]
pub fn open_file(path: String) -> Result<(), String> {
    let target = std::path::Path::new(&path);

    if !target.is_file() {
        return Err("File not found".into());
    }

    // Canonicalize to resolve symlinks / relative segments
    let canonical = target
        .canonicalize()
        .map_err(|e| format!("Cannot resolve path: {e}"))?;

    // Determine Downloads directory from %USERPROFILE%
    let user_profile = std::env::var("USERPROFILE")
        .map_err(|_| "Cannot determine user profile directory".to_string())?;
    let downloads = std::path::PathBuf::from(&user_profile).join("Downloads");
    let downloads_canonical = downloads
        .canonicalize()
        .map_err(|e| format!("Cannot resolve Downloads directory: {e}"))?;

    if !canonical.starts_with(&downloads_canonical) {
        return Err("File must be inside the Downloads folder".into());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        std::process::Command::new("cmd")
            .args(["/c", "start", ""])
            .arg(&canonical)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to open file: {e}"))?;
    }

    Ok(())
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
