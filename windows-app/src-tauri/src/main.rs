// Moodle Desktop – Tauri v2 Application Entry Point
// Provides native Windows integration: custom titlebar, system tray,
// file downloads, and Moodle API proxy commands.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::set_window_effect,
        ])
        .setup(|app| {
            // Apply Mica effect on Windows 11
            let window = app.get_webview_window("main").unwrap();
            #[cfg(target_os = "windows")]
            {
                use window_vibrancy::apply_mica;
                let _ = apply_mica(&window, Some(true));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Moodle Desktop");
}
