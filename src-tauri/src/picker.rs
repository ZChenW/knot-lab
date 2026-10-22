//! The open/save dialog. On Linux this is the KDE file dialog, run through `kdialog`:
//! the GTK chooser that the toolkit and the desktop portal offer gives no hover or
//! press feedback under some GTK themes. When `kdialog` is not installed the command
//! reports that, and the frontend falls back to the portal dialog.

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_fs::FsExt;

/// The folder each kind of dialog was last used in, for this run of the app.
#[derive(Default)]
pub struct LastFolder(Mutex<HashMap<String, PathBuf>>);

/// Told to the frontend when there is no `kdialog` to run.
const UNAVAILABLE: &str = "unavailable";

fn config_home() -> Option<PathBuf> {
    std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
}

fn icon_theme_installed(name: &str) -> bool {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(data) = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from) {
        roots.push(data.join("icons"));
    } else if let Some(home) = &home {
        roots.push(home.join(".local/share/icons"));
    }
    if let Some(home) = &home {
        roots.push(home.join(".icons"));
    }
    let dirs =
        std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    roots.extend(
        dirs.split(':')
            .filter(|d| !d.is_empty())
            .map(|d| Path::new(d).join("icons")),
    );
    roots
        .iter()
        .any(|root| root.join(name).join("index.theme").is_file())
}

/// The value of `key` in `[section]` of a KDE config file.
fn ini_value<'a>(text: &'a str, section: &str, key: &str) -> Option<&'a str> {
    let mut inside = false;
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            inside = line == format!("[{section}]");
        } else if inside {
            if let Some((k, v)) = line.split_once('=') {
                if k.trim() == key {
                    return Some(v.trim());
                }
            }
        }
    }
    None
}

/// Whether a KDE colour (`#rrggbb` or `r,g,b`) is a dark one.
fn is_dark(colour: &str) -> bool {
    let rgb: Vec<u32> = if let Some(hex) = colour.strip_prefix('#') {
        (0..3)
            .filter_map(|i| {
                hex.get(i * 2..i * 2 + 2)
                    .and_then(|h| u32::from_str_radix(h, 16).ok())
            })
            .collect()
    } else {
        colour
            .split(',')
            .filter_map(|c| c.trim().parse().ok())
            .collect()
    };
    rgb.len() == 3 && (299 * rgb[0] + 587 * rgb[1] + 114 * rgb[2]) / 1000 < 128
}

/// `kdeglobals` with the icon theme set to `theme`.
fn with_icon_theme(text: &str, theme: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let (mut inside, mut done) = (false, false);
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            if inside && !done {
                out.push(format!("Theme={theme}"));
                done = true;
            }
            inside = trimmed == "[Icons]";
        } else if inside
            && trimmed
                .split_once('=')
                .is_some_and(|(k, _)| k.trim() == "Theme")
        {
            if !done {
                out.push(format!("Theme={theme}"));
                done = true;
            }
            continue;
        }
        out.push(line.to_string());
    }
    if !done {
        if !inside {
            out.push("[Icons]".into());
        }
        out.push(format!("Theme={theme}"));
    }
    out.join("\n") + "\n"
}

/// When the user's KDE settings name an icon theme that is not installed, the dialog
/// would draw dark icons on a dark surface. Returns a private config directory whose
/// `kdeglobals` is the user's with a Breeze icon theme that suits their colours, or
/// `None` when their settings can be used as they are. Nothing of the user's is changed.
fn private_config(app: &AppHandle) -> Option<PathBuf> {
    let text = fs::read_to_string(config_home()?.join("kdeglobals")).ok()?;
    let theme = ini_value(&text, "Icons", "Theme").unwrap_or("breeze");
    if icon_theme_installed(theme) {
        return None;
    }
    let dark = ini_value(&text, "Colors:Window", "BackgroundNormal").is_some_and(is_dark);
    let dir = app.path().app_cache_dir().ok()?.join("kde-config");
    fs::create_dir_all(&dir).ok()?;
    fs::write(
        dir.join("kdeglobals"),
        with_icon_theme(&text, if dark { "breeze-dark" } else { "breeze" }),
    )
    .ok()?;
    Some(dir)
}

fn start_folder(app: &AppHandle, place: &str) -> PathBuf {
    let path = app.path();
    let preferred = match place {
        "pictures" => path.picture_dir(),
        _ => path.document_dir(),
    };
    preferred
        .ok()
        .filter(|p| p.is_dir())
        .or_else(|| path.home_dir().ok())
        .unwrap_or_else(|| PathBuf::from("/"))
}

/// Shows the dialog and returns the chosen path, or `None` when it was cancelled.
/// The chosen file becomes readable and writable through the fs plugin.
#[tauri::command]
pub async fn pick_path(
    app: AppHandle,
    last: State<'_, LastFolder>,
    save: bool,
    title: String,
    place: String,
    name: Option<String>,
    filter: String,
    extensions: Vec<String>,
) -> Result<Option<String>, String> {
    let folder = last
        .0
        .lock()
        .unwrap()
        .get(&place)
        .filter(|p| p.is_dir())
        .cloned()
        .unwrap_or_else(|| start_folder(&app, &place));
    let start = match (&name, save) {
        (Some(name), true) => folder.join(name),
        _ => folder,
    };
    let patterns: Vec<String> = extensions.iter().map(|e| format!("*.{e}")).collect();
    let mut command = Command::new("kdialog");
    command
        .arg("--title")
        .arg(&title)
        .arg(if save {
            "--getsavefilename"
        } else {
            "--getopenfilename"
        })
        .arg(&start)
        .arg(format!("{filter} ({})", patterns.join(" ")))
        // the KDE file dialog and the user's KDE colours come with this platform theme
        .env("QT_QPA_PLATFORMTHEME", "kde");
    if let Some(dir) = private_config(&app) {
        command.env("XDG_CONFIG_HOME", dir);
    }
    let output = tauri::async_runtime::spawn_blocking(move || command.output())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                UNAVAILABLE.to_string()
            } else {
                e.to_string()
            }
        })?;
    let chosen = String::from_utf8_lossy(&output.stdout).trim().to_string();
    // kdialog exits with 1 when the dialog is cancelled
    if chosen.is_empty() {
        return if output.status.success() || output.status.code() == Some(1) {
            Ok(None)
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        };
    }
    let mut path = PathBuf::from(chosen);
    if save && path.extension().is_none() {
        if let Some(extension) = extensions.first() {
            let named = path.with_extension(extension);
            // the dialog asked about overwriting the name it was given, not this one
            if named.exists() {
                // a code, not a sentence: the frontend words it in the interface language
                return Err(format!("exists:{}", named.display()));
            }
            path = named;
        }
    }
    if let Some(parent) = path.parent() {
        last.0.lock().unwrap().insert(place, parent.to_path_buf());
    }
    app.fs_scope()
        .allow_file(&path)
        .map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const GLOBALS: &str = "[General]\nColorScheme=Darkly\n\n[Icons]\nTheme=WhiteSur-dark\n\n[KDE]\nwidgetStyle=Darkly\n";

    #[test]
    fn reads_values_by_section() {
        assert_eq!(ini_value(GLOBALS, "Icons", "Theme"), Some("WhiteSur-dark"));
        assert_eq!(ini_value(GLOBALS, "KDE", "widgetStyle"), Some("Darkly"));
        assert_eq!(ini_value(GLOBALS, "KDE", "Theme"), None);
    }

    #[test]
    fn replaces_the_icon_theme_only() {
        let patched = with_icon_theme(GLOBALS, "breeze-dark");
        assert_eq!(ini_value(&patched, "Icons", "Theme"), Some("breeze-dark"));
        assert_eq!(
            ini_value(&patched, "General", "ColorScheme"),
            Some("Darkly")
        );
        assert_eq!(patched.matches("Theme=").count(), 1);
    }

    #[test]
    fn adds_the_icon_section_when_missing() {
        let patched = with_icon_theme("[KDE]\nwidgetStyle=Breeze\n", "breeze");
        assert_eq!(ini_value(&patched, "Icons", "Theme"), Some("breeze"));
        let patched = with_icon_theme("[Icons]\n[KDE]\nwidgetStyle=Breeze\n", "breeze");
        assert_eq!(ini_value(&patched, "Icons", "Theme"), Some("breeze"));
        assert_eq!(ini_value(&patched, "KDE", "widgetStyle"), Some("Breeze"));
    }

    #[test]
    fn tells_dark_colours_from_light() {
        assert!(is_dark("#282828"));
        assert!(is_dark("40,40,40"));
        assert!(!is_dark("#ebdbb2"));
        assert!(!is_dark("239,240,241"));
        assert!(!is_dark("nonsense"));
    }
}
