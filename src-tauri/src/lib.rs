mod handoff;
mod picker;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // open/save dialogs (see picker.rs; the dialog plugin is the fallback), and
        // reading/writing the files chosen in them
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(picker::LastFolder::default())
        .manage(handoff::Handoff::default())
        .invoke_handler(tauri::generate_handler![
            picker::pick_path,
            handoff::handoff_start,
            handoff::handoff_stop,
            handoff::handoff_take
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // The phone relay (cloudflared) must not outlive the window.
            if let tauri::RunEvent::Exit = event {
                use tauri::Manager;
                app.state::<handoff::Handoff>().shutdown();
            }
        });
}
