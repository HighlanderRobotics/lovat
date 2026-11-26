// Native shell for the Lovat Dashboard. All app logic lives in the Svelte
// frontend; Rust only provides plugins: HTTP without CORS, Auth0 deep-link
// callbacks, credential storage, and native save dialogs.

#[cfg(any(target_os = "macos", target_os = "ios"))]
mod web_auth;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)] // only desktop builds add the single-instance plugin
    let mut builder = tauri::Builder::default();

    // On Windows and Linux, the OS starts a second process for the Auth0
    // redirect URL. Forward it to the running window instead, which then
    // receives it through the deep-link plugin.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(handlers())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                // Registers the URL scheme for unbundled dev builds too.
                let _ = app.deep_link().register_all();
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Lovat Dashboard");
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn handlers<R: tauri::Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![web_auth::web_auth]
}

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
fn handlers<R: tauri::Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![]
}
