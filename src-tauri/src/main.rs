#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod music_match;
mod nas;
use lofty::{
    file::{AudioFile, TaggedFileExt},
    tag::Accessor,
};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Song {
    path: String,
    title: String,
    artist: String,
    album: String,
    duration: f64,
    #[serde(default)]
    stamp: String,
    #[serde(default)]
    cover: String,
    #[serde(default)]
    edited: bool,
}
#[derive(Default, Clone, Serialize, Deserialize)]
pub(crate) struct Library {
    roots: Vec<String>,
    songs: Vec<Song>,
    warnings: Vec<String>,
}
struct State {
    library: Mutex<Library>,
    busy: Mutex<bool>,
}
fn library_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("library.json"))
}
fn save(app: &tauri::AppHandle, lib: &Library) -> Result<(), String> {
    let p = library_file(app)?;
    std::fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_vec(lib).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if cfg!(windows) && p.exists() {
        std::fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    std::fs::rename(tmp, p).map_err(|e| e.to_string())
}
fn audio(path: &Path) -> bool {
    path.extension()
        .and_then(|x| x.to_str())
        .map(|x| {
            matches!(
                x.to_ascii_lowercase().as_str(),
                "mp3"
                    | "flac"
                    | "m4a"
                    | "aac"
                    | "wav"
                    | "ogg"
                    | "opus"
                    | "aiff"
                    | "aif"
                    | "wma"
                    | "ape"
                    | "alac"
            )
        })
        .unwrap_or(false)
}
fn scan(roots: Vec<String>, previous: &[Song], progress: impl Fn(usize)) -> Library {
    let roots: Vec<String> = roots
        .into_iter()
        .map(|r| {
            if r.starts_with("nas:") {
                r
            } else {
                Path::new(&r)
                    .canonicalize()
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or(r)
            }
        })
        .collect();
    let mut lib = Library {
        roots: roots.clone(),
        ..Default::default()
    };
    let cache: std::collections::HashMap<_, _> =
        previous.iter().map(|s| (s.path.as_str(), s)).collect();
    let mut seen = std::collections::HashSet::new();
    for root in roots {
        if root.starts_with("nas:") {
            continue;
        }
        if !Path::new(&root).is_dir() {
            lib.warnings
                .push(format!("目录不可用，已保留原歌曲：{root}"));
            lib.songs.extend(
                previous
                    .iter()
                    .filter(|s| Path::new(&s.path).starts_with(&root))
                    .cloned(),
            );
            continue;
        }
        for entry in walkdir::WalkDir::new(&root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                e.depth() == 0 || {
                    let n = e.file_name().to_string_lossy();
                    !n.starts_with('.')
                        && !n.starts_with('@')
                        && !n.starts_with('#')
                        && n != "node_modules"
                }
            })
        {
            let entry = match entry {
                Ok(x) => x,
                Err(e) => {
                    lib.warnings.push(e.to_string());
                    continue;
                }
            };
            let p = entry.path();
            if !entry.file_type().is_file() || !audio(p) {
                continue;
            }
            let canonical = match p.canonicalize() {
                Ok(p) => p,
                Err(_) => continue,
            };
            if !seen.insert(canonical.clone()) {
                continue;
            }
            let stamp = std::fs::metadata(p)
                .ok()
                .map(|m| {
                    format!(
                        "{}:{}",
                        m.len(),
                        m.modified()
                            .ok()
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_nanos())
                            .unwrap_or(0)
                    )
                })
                .unwrap_or_default();
            if let Some(old) = cache.get(canonical.to_string_lossy().as_ref()) {
                if old.stamp == stamp {
                    lib.songs.push((**old).clone());
                    continue;
                }
            }
            let mut song = Song {
                stamp,
                cover: [
                    "cover.jpg",
                    "cover.png",
                    "folder.jpg",
                    "folder.png",
                    "front.jpg",
                ]
                .iter()
                .map(|n| p.parent().unwrap_or(Path::new(".")).join(n))
                .find(|p| p.is_file())
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default(),
                edited: false,
                path: canonical.to_string_lossy().into(),
                title: p.file_stem().unwrap_or_default().to_string_lossy().into(),
                artist: "未知歌手".into(),
                album: p
                    .parent()
                    .and_then(Path::file_name)
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into(),
                duration: 0.0,
            };
            match lofty::read_from_path(p) {
                Ok(f) => {
                    song.duration = f.properties().duration().as_secs_f64();
                    if let Some(t) = f.primary_tag().or_else(|| f.first_tag()) {
                        if let Some(x) = t.title() {
                            song.title = x.into()
                        }
                        if let Some(x) = t.artist() {
                            song.artist = x.into()
                        }
                        if let Some(x) = t.album() {
                            song.album = x.into()
                        }
                    }
                }
                Err(e) => lib.warnings.push(format!("{}：{}", p.display(), e)),
            }
            if let Some(old) = cache.get(song.path.as_str()) {
                if old.edited {
                    song.title = old.title.clone();
                    song.artist = old.artist.clone();
                    song.album = old.album.clone();
                    song.cover = old.cover.clone();
                    song.edited = true;
                }
            }
            lib.songs.push(song);
            if lib.songs.len() % 100 == 0 {
                progress(lib.songs.len());
            }
        }
    }
    lib.songs.sort_by(|a, b| a.title.cmp(&b.title));
    lib
}
#[tauri::command]
fn get_library(state: tauri::State<State>) -> Library {
    state.library.lock().unwrap().clone()
}
#[tauri::command]
async fn import_folder(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Option<Library>, String> {
    let folder = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_title("导入音乐文件夹")
        .pick_folder()
        .await;
    let Some(folder) = folder else {
        return Ok(None);
    };
    let root = folder
        .path()
        .canonicalize()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();
    update_library(app, Some(root)).await.map(Some)
}
#[tauri::command]
async fn rescan(app: tauri::AppHandle) -> Result<Library, String> {
    update_library(app, None).await
}
async fn update_library(app: tauri::AppHandle, root: Option<String>) -> Result<Library, String> {
    let state = app.state::<State>();
    {
        let mut b = state.busy.lock().unwrap();
        if *b {
            return Err("正在扫描，请稍候".into());
        }
        *b = true;
    }
    let mut roots = state.library.lock().unwrap().roots.clone();
    if let Some(root) = root {
        if !roots.contains(&root) {
            roots.push(root)
        }
    }
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        for root in &roots {
            if root.starts_with("nas:") {
                continue;
            }
            handle
                .asset_protocol_scope()
                .allow_directory(root, true)
                .map_err(|e| e.to_string())?;
        }
        let remote: Vec<Song> = handle
            .state::<State>()
            .library
            .lock()
            .unwrap()
            .songs
            .iter()
            .filter(|s| s.path.starts_with("nas:"))
            .cloned()
            .collect();
        let old = handle
            .state::<State>()
            .library
            .lock()
            .unwrap()
            .songs
            .clone();
        let mut lib = scan(roots, &old, |n| {
            let _ = handle.emit("scan-progress", n);
        });
        lib.songs.extend(remote);
        save(&handle, &lib)?;
        Ok::<_, String>(lib)
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|x| x);
    *state.busy.lock().unwrap() = false;
    if let Ok(ref lib) = result {
        *state.library.lock().unwrap() = lib.clone()
    }
    result
}
#[tauri::command]
fn lyrics(path: String, state: tauri::State<State>) -> Result<String, String> {
    if !state
        .library
        .lock()
        .unwrap()
        .songs
        .iter()
        .any(|s| s.path == path)
    {
        return Err("歌曲不在音乐库中".into());
    }
    let p = PathBuf::from(path).with_extension("lrc");
    if !p.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(p).map_err(|e| e.to_string())
}
#[tauri::command]
async fn confirm_action(window: tauri::WebviewWindow, message: String) -> bool {
    rfd::AsyncMessageDialog::new()
        .set_parent(&window)
        .set_title("聆境音乐")
        .set_description(message)
        .set_buttons(rfd::MessageButtons::YesNo)
        .show()
        .await
        == rfd::MessageDialogResult::Yes
}
#[tauri::command]
fn edit_metadata(
    app: tauri::AppHandle,
    path: String,
    title: String,
    artist: String,
    album: String,
    cover: String,
) -> Result<Song, String> {
    let state = app.state::<State>();
    if *state.busy.lock().unwrap() {
        return Err("扫描期间请稍后再编辑".into());
    }
    let mut lib = state.library.lock().unwrap().clone();
    let song = lib
        .songs
        .iter_mut()
        .find(|s| s.path == path)
        .ok_or("歌曲不存在")?;
    song.title = title;
    song.artist = artist;
    song.album = album;
    if !cover.is_empty() {
        song.cover = cover;
    }
    song.edited = true;
    let result = song.clone();
    save(&app, &lib)?;
    *state.library.lock().unwrap() = lib;
    Ok(result)
}
#[tauri::command]
fn remove_source(app: tauri::AppHandle, path: String) -> Result<Library, String> {
    let state = app.state::<State>();
    if *state.busy.lock().unwrap() {
        return Err("正在扫描，请稍候".into());
    }
    let mut lib = state.library.lock().unwrap().clone();
    lib.roots.retain(|r| r != &path);
    lib.songs.retain(|s| !Path::new(&s.path).starts_with(&path));
    save(&app, &lib)?;
    *state.library.lock().unwrap() = lib.clone();
    Ok(lib)
}
fn main() {
    tauri::Builder::default()
        .manage(State {
            library: Mutex::new(Library::default()),
            busy: Mutex::new(false),
        })
        .manage(nas::NasState::default())
        .register_asynchronous_uri_scheme_protocol("nas", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                responder.respond(nas::stream(&app, request));
            });
        })
        .setup(|app| {
            let handle = app.handle();
            let covers = handle.path().app_cache_dir()?.join("covers");
            handle
                .asset_protocol_scope()
                .allow_directory(covers, true)?;
            if let Ok(p) = library_file(handle) {
                if let Ok(bytes) = std::fs::read(p) {
                    if let Ok(lib) = serde_json::from_slice::<Library>(&bytes) {
                        for root in &lib.roots {
                            if root.starts_with("nas:") {
                                continue;
                            }
                            let _ = handle.asset_protocol_scope().allow_directory(root, true);
                        }
                        *app.state::<State>().library.lock().unwrap() = lib;
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_library,
            import_folder,
            rescan,
            lyrics,
            nas::connect_nas,
            nas::import_nas,
            nas::browse_nas,
            nas::disconnect_nas,
            remove_source,
            edit_metadata,
            confirm_action,
            music_match::match_songs,
            music_match::cache_cover
        ])
        .run(tauri::generate_context!())
        .expect("聆境音乐启动失败");
}

#[cfg(test)]
mod tests {
    use super::*;
    static FIXTURE_ID: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    fn fixture() -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "lingjing-test-{}-{}-{}",
            FIXTURE_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(p.join("中文专辑")).unwrap();
        p
    }
    fn wav() -> Vec<u8> {
        let mut v = Vec::new();
        v.extend(b"RIFF");
        v.extend(16036u32.to_le_bytes());
        v.extend(b"WAVEfmt ");
        v.extend(16u32.to_le_bytes());
        v.extend(1u16.to_le_bytes());
        v.extend(1u16.to_le_bytes());
        v.extend(8000u32.to_le_bytes());
        v.extend(16000u32.to_le_bytes());
        v.extend(2u16.to_le_bytes());
        v.extend(16u16.to_le_bytes());
        v.extend(b"data");
        v.extend(16000u32.to_le_bytes());
        v.extend(vec![0u8; 16000]);
        v
    }
    #[test]
    fn recursive_scan_deduplicates_and_reads_audio() {
        let p = fixture();
        let album = p.join("中文专辑");
        std::fs::write(album.join("测试歌曲.WAV"), wav()).unwrap();
        std::fs::write(album.join("说明.txt"), "不应导入").unwrap();
        let lib = scan(
            vec![p.to_string_lossy().into(), album.to_string_lossy().into()],
            &[],
            |_| {},
        );
        assert_eq!(lib.songs.len(), 1);
        assert_eq!(lib.songs[0].title, "测试歌曲");
        assert_eq!(lib.songs[0].album, "中文专辑");
        assert!(lib.songs[0].duration > 0.0);
        let cached = scan(lib.roots.clone(), &lib.songs, |_| {});
        assert_eq!(cached.songs[0].stamp, lib.songs[0].stamp);
        std::fs::remove_dir_all(p).unwrap();
    }
    #[test]
    fn unavailable_root_preserves_previous_library() {
        let p = fixture();
        std::fs::write(p.join("曲目.wav"), wav()).unwrap();
        let lib = scan(vec![p.to_string_lossy().into()], &[], |_| {});
        std::fs::remove_dir_all(p).unwrap();
        let result = scan(lib.roots.clone(), &lib.songs, |_| {});
        assert_eq!(result.songs.len(), 1);
        assert_eq!(result.warnings.len(), 1);
    }
    #[test]
    fn removed_song_is_removed_on_rescan() {
        let p = fixture();
        let f = p.join("song.wav");
        std::fs::write(&f, wav()).unwrap();
        let lib = scan(vec![p.to_string_lossy().into()], &[], |_| {});
        std::fs::remove_file(f).unwrap();
        assert!(scan(lib.roots, &lib.songs, |_| {}).songs.is_empty());
        std::fs::remove_dir_all(p).unwrap();
    }
}
