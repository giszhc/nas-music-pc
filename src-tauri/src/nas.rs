use crate::{Library, Song, State};
use serde_json::{json, Value};
use std::{io::Read, sync::Mutex, time::Duration};
use tauri::{Emitter, Manager};
#[derive(Clone)]
struct Session {
    base: String,
    sid: String,
    token: String,
    client: reqwest::blocking::Client,
}
#[derive(Default)]
pub struct NasState(Mutex<Option<Session>>);
fn api(s: &Session, params: Vec<(&str, String)>) -> Result<Value, String> {
    let v: Value = s
        .client
        .post(format!("{}/webapi/entry.cgi", s.base))
        .header("X-SYNO-TOKEN", &s.token)
        .form(&params)
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;
    if v["success"] != true {
        return Err(format!("群晖请求失败，错误码 {}", v["error"]["code"]));
    }
    Ok(v["data"].clone())
}
#[tauri::command]
pub async fn connect_nas(
    app: tauri::AppHandle,
    base: String,
    account: String,
    password: String,
    otp: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let url =
            url::Url::parse(&base).map_err(|_| "请输入完整群晖地址，如 http://nas.local:5000")?;
        if !matches!(url.scheme(), "http" | "https")
            || url.host_str().is_none()
            || !url.username().is_empty()
        {
            return Err("群晖地址无效".into());
        }
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;
        let mut s = Session {
            base: base.trim_end_matches('/').to_string(),
            sid: String::new(),
            token: String::new(),
            client,
        };
        let d = api(
            &s,
            vec![
                ("api", "SYNO.API.Auth".into()),
                ("version", "6".into()),
                ("method", "login".into()),
                ("account", account),
                ("passwd", password),
                ("session", "FileStation".into()),
                ("otp_code", otp),
                ("format", "sid".into()),
                ("enable_syno_token", "yes".into()),
            ],
        )?;
        s.sid = d["sid"].as_str().ok_or("登录未返回会话")?.into();
        s.token = d["synotoken"].as_str().unwrap_or("").into();
        *app.state::<NasState>().0.lock().unwrap() = Some(s);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn import_nas(app: tauri::AppHandle, path: String) -> Result<Library, String> {
    if !path.starts_with('/') || path == "/" {
        return Err("请输入共享文件夹路径，如 /music".into());
    }
    let state = app.state::<State>();
    {
        let mut b = state.busy.lock().unwrap();
        if *b {
            return Err("正在扫描，请稍候".into());
        }
        *b = true;
    }
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let session = handle
            .state::<NasState>()
            .0
            .lock()
            .unwrap()
            .clone()
            .ok_or("请先连接群晖")?;
        let mut dirs = vec![path.clone()];
        let mut songs = Vec::new();
        let mut visited = std::collections::HashSet::new();
        while let Some(dir) = dirs.pop() {
            if !visited.insert(dir.clone()) {
                continue;
            }
            let mut offset = 0;
            loop {
                let d = api(
                    &session,
                    vec![
                        ("api", "SYNO.FileStation.List".into()),
                        ("version", "2".into()),
                        ("method", "list".into()),
                        ("folder_path", dir.clone()),
                        ("offset", offset.to_string()),
                        ("limit", "1000".into()),
                        ("_sid", session.sid.clone()),
                    ],
                )?;
                let files = d["files"].as_array().ok_or("目录数据无效")?;
                for f in files {
                    let p = f["path"].as_str().unwrap_or("");
                    let n = f["name"].as_str().unwrap_or("");
                    if f["isdir"] == true {
                        if !n.starts_with('.') && !n.starts_with('@') && !n.starts_with('#') {
                            dirs.push(p.to_string())
                        }
                    } else if crate::audio(std::path::Path::new(n)) {
                        let title = std::path::Path::new(n)
                            .file_stem()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .into_owned();
                        let (artist, title) = title
                            .split_once(" - ")
                            .map(|(a, t)| (a.to_string(), t.to_string()))
                            .unwrap_or(("未知歌手".into(), title.clone()));
                        songs.push(Song {
                            path: format!("nas:{p}"),
                            title,
                            artist,
                            album: dir.rsplit('/').next().unwrap_or("").into(),
                            duration: 0.0,
                            stamp: String::new(),
                            cover: String::new(),
                            edited: false,
                        });
                    }
                }
                let _ = handle.emit("scan-progress", songs.len());
                offset += files.len();
                if files.is_empty()
                    || offset >= d["total"].as_u64().unwrap_or(offset as u64) as usize
                {
                    break;
                }
            }
        }
        let prefix = format!("nas:{}/", path.trim_end_matches('/'));
        let mut lib = handle.state::<State>().library.lock().unwrap().clone();
        let root = format!("nas:{path}");
        if !lib.roots.contains(&root) {
            lib.roots.push(root);
        }
        lib.songs.retain(|s| !s.path.starts_with(&prefix));
        lib.songs.extend(songs);
        crate::save(&handle, &lib)?;
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
pub fn stream(
    app: &tauri::AppHandle,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let result = (|| -> Result<tauri::http::Response<Vec<u8>>, String> {
        let path = url::Url::parse(&request.uri().to_string())
            .map_err(|e| e.to_string())?
            .query_pairs()
            .find(|(k, _)| k == "path")
            .map(|(_, v)| v.into_owned())
            .ok_or("缺少路径")?;
        if !app
            .state::<State>()
            .library
            .lock()
            .unwrap()
            .songs
            .iter()
            .any(|s| s.path == format!("nas:{path}"))
        {
            return Err("歌曲不在音乐库".into());
        }
        let session = app
            .state::<NasState>()
            .0
            .lock()
            .unwrap()
            .clone()
            .ok_or("请先连接群晖")?;
        let start = request
            .headers()
            .get("range")
            .and_then(|x| x.to_str().ok())
            .and_then(|x| x.strip_prefix("bytes="))
            .and_then(|x| x.split('-').next())
            .and_then(|x| x.parse::<u64>().ok())
            .unwrap_or(0);
        let requested_end = request
            .headers()
            .get("range")
            .and_then(|x| x.to_str().ok())
            .and_then(|x| x.split('-').nth(1))
            .and_then(|x| x.parse::<u64>().ok())
            .unwrap_or(u64::MAX);
        let end = requested_end.min(start.saturating_add(2 * 1024 * 1024 - 1));
        let r = session
            .client
            .get(format!("{}/webapi/entry.cgi", session.base))
            .query(&[
                ("api", "SYNO.FileStation.Download"),
                ("version", "2"),
                ("method", "download"),
                ("path", &path),
                ("mode", "open"),
                ("_sid", &session.sid),
            ])
            .header("X-SYNO-TOKEN", &session.token)
            .header("Range", format!("bytes={start}-{end}"))
            .send()
            .map_err(|e| e.to_string())?;
        if r.status() != reqwest::StatusCode::PARTIAL_CONTENT {
            return Err("群晖未返回可分段播放的音频数据".into());
        }
        let mut response = tauri::http::Response::builder()
            .status(206)
            .header("Accept-Ranges", "bytes")
            .header("Access-Control-Allow-Origin", "*");
        for key in ["content-type", "content-range"] {
            if let Some(value) = r.headers().get(key) {
                response = response.header(key, value.to_str().unwrap_or(""))
            }
        }
        let mut bytes = Vec::new();
        r.take(2 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 2 * 1024 * 1024 {
            return Err("音频分段超过限制".into());
        }
        response.body(bytes).map_err(|e| e.to_string())
    })();
    result.unwrap_or_else(|e| {
        tauri::http::Response::builder()
            .status(400)
            .body(e.into_bytes())
            .unwrap()
    })
}

#[tauri::command]
pub fn disconnect_nas(app: tauri::AppHandle) {
    *app.state::<NasState>().0.lock().unwrap() = None;
}
#[tauri::command]
pub async fn browse_nas(app: tauri::AppHandle, path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let s = app
            .state::<NasState>()
            .0
            .lock()
            .unwrap()
            .clone()
            .ok_or("请先登录群晖")?;
        let mut params = vec![
            ("api", "SYNO.FileStation.List".into()),
            ("version", "2".into()),
            (
                "method",
                if path.is_empty() {
                    "list_share"
                } else {
                    "list"
                }
                .into(),
            ),
            ("_sid", s.sid.clone()),
            ("limit", "1000".into()),
        ];
        if !path.is_empty() {
            params.push(("folder_path", path.clone()))
        }
        let d = api(&s, params)?;
        let list = d[if path.is_empty() { "shares" } else { "files" }]
            .as_array()
            .ok_or("目录数据无效")?;
        let folders: Vec<_> = list
            .iter()
            .filter(|f| path.is_empty() || f["isdir"] == true)
            .map(|f| json!({"name":f["name"],"path":f["path"]}))
            .collect();
        Ok(json!({"ok":true,"path":path,"folders":folders,"videoCount":0}))
    })
    .await
    .map_err(|e| e.to_string())?
}

// 仅探测本机私有 IPv4 网段，使用 DSM API 验证设备，避免误报普通网页。
#[tauri::command]
pub async fn discover_nas() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "windows")]
        let output = std::process::Command::new("ipconfig").output();
        #[cfg(not(target_os = "windows"))]
        let output = std::process::Command::new("ifconfig").output();
        let output = output.map_err(|e| format!("读取网络接口失败：{e}"))?;
        let text = String::from_utf8_lossy(&output.stdout);
        let mut ips = Vec::new();
        for word in text.split_whitespace() {
            if let Ok(ip) = word.parse::<std::net::Ipv4Addr>() {
                if ip.is_private() && !ips.contains(&ip) { ips.push(ip); }
            }
        }
        let mut targets = Vec::new();
        for ip in &ips {
            let octets = ip.octets();
            for last in 1..255u8 {
                let host = format!("{}.{}.{}.{}", octets[0], octets[1], octets[2], last);
                if !targets.contains(&host) { targets.push(host); }
            }
        }
        let client = reqwest::blocking::Client::builder().timeout(Duration::from_millis(900)).build().map_err(|e| e.to_string())?;
        let targets = std::sync::Mutex::new(targets.into_iter());
        let hosts = std::sync::Mutex::new(Vec::new());
        std::thread::scope(|scope| {
            for _ in 0..48 {
                let client = &client; let targets = &targets; let hosts = &hosts;
                scope.spawn(move || loop {
                    let Some(ip) = targets.lock().unwrap().next() else { break; };
                    let address = format!("http://{ip}:5000/webapi/query.cgi?api=SYNO.API.Info&version=1&method=query&query=SYNO.API.Auth");
                    if let Ok(response) = client.get(address).send() {
                        if let Ok(value) = response.json::<Value>() {
                            if value["success"] == true && value["data"]["SYNO.API.Auth"].is_object() {
                                hosts.lock().unwrap().push(json!({"ip":ip,"port":5000,"https":false,"name":"群晖 NAS"}));
                            }
                        }
                    }
                });
            }
        });
        Ok(json!({"ok":true,"hosts":hosts.into_inner().unwrap(),"localIps":ips.iter().map(ToString::to_string).collect::<Vec<_>>()}))
    }).await.map_err(|e| e.to_string())?
}
