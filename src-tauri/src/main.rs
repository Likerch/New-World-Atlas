// The Atlas as a Windows app: the built page (dist) in a window of its own. The page does all the work; the window
// adds the system's "Save as" dialog for exports and world files, and remembers its size and place.

// No console window beside the app in a release build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::ipc::{InvokeBody, Request};

/// Saves a file the page made where the GM chooses: the system's "Save as" window, then the bytes written there.
/// The bytes come as the request's body, the suggested name (URI-encoded) in its `x-name` header. Nothing is written
/// anywhere the GM did not pick; false when the GM cancels.
#[tauri::command]
async fn save_file(window: tauri::Window, request: Request<'_>) -> Result<bool, String> {
  let InvokeBody::Raw(data) = request.body() else {
    return Err("save_file takes the file's bytes".into());
  };
  let encoded = request.headers().get("x-name").and_then(|value| value.to_str().ok()).unwrap_or("map");
  let name = percent_encoding::percent_decode_str(encoded).decode_utf8_lossy().into_owned();
  let mut dialog = rfd::AsyncFileDialog::new().set_file_name(&name).set_parent(&window);
  if let Some((_, extension)) = name.rsplit_once('.') {
    dialog = dialog.add_filter(extension.to_uppercase(), &[extension]);
  }
  let Some(file) = dialog.save_file().await else {
    return Ok(false);
  };
  std::fs::write(file.path(), data).map_err(|error| format!("{}: {error}", file.path().display()))?;
  Ok(true)
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .invoke_handler(tauri::generate_handler![save_file])
    .run(tauri::generate_context!())
    .expect("error while running New World Atlas");
}
