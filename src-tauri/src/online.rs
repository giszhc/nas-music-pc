use serde_json::{json, Value};
use tauri::Manager;
use std::time::Duration;
#[tauri::command]
pub async fn online_stations(query: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder().timeout(Duration::from_secs(12)).user_agent("LingjingMusic/0.1.0").build().map_err(|e| e.to_string())?;
        for host in ["https://de1.api.radio-browser.info", "https://at1.api.radio-browser.info"] {
            let mut params = vec![("limit", "60"), ("hidebroken", "true"), ("order", "votes"), ("reverse", "true")];
            if query.trim().is_empty() { params.push(("tag", "music")); } else { params.push(("name", query.trim())); }
            if let Ok(response) = client.get(format!("{host}/json/stations/search")).query(&params).send() {
                if let Ok(rows) = response.error_for_status().and_then(|r| r.json::<Vec<Value>>()) {
                    let rows: Vec<Value> = rows.into_iter().filter(|r| {
                        let url = r["url_resolved"].as_str().unwrap_or("");
                        url.starts_with("https://") || url.starts_with("http://")
                    }).collect();
                    return Ok(json!({"ok":true,"stations":rows}));
                }
            }
        }
        Err("在线电台暂时无法连接，请稍后重试".to_string())
    }).await.map_err(|e| e.to_string())?
}


fn text(value: &str) -> String {
    let re = regex::Regex::new("<[^>]*>").unwrap();
    re.replace_all(value, "").replace("&amp;", "&").replace("&nbsp;", " ").replace("&#039;", "'").replace("&quot;", "\"").trim().to_string()
}
fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder().timeout(Duration::from_secs(18)).user_agent("Mozilla/5.0 LingjingMusic/0.1").build().map_err(|e| e.to_string())
}
fn send(request: reqwest::blocking::RequestBuilder) -> Result<reqwest::blocking::Response, reqwest::Error> {
    let Some(retry) = request.try_clone() else { return request.send(); };
    let mut result = request.send();
    for _ in 0..2 {
        if !result.as_ref().err().is_some_and(|e| e.is_connect() || e.is_timeout() || e.is_request()) { break; }
        let Some(next) = retry.try_clone() else { break; };
        result = next.send();
    }
    result
}
#[tauri::command]
pub async fn online_catalog(source: String, category: String, query: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let base = match source.as_str() { "gequbao" => "https://www.gequbao.com", "90t8" => "https://www.90t8.com", "shiyinren" => "https://www.shiyinren.net", _ => return Err("未知音乐源".into()) };
        if source == "shiyinren" && category == "hot" && query.trim().is_empty() { return Ok(json!({"ok":true,"songs":[]})); }
        if source == "shiyinren" && !query.trim().is_empty() {
            let response = client()?.get("https://search.kuwo.cn/r.s")
                .header("Referer", "https://www.shiyinren.net/")
                .query(&[("all",query.trim()),("ft","music"),("client","kt"),("cluster","0"),("rformat","json"),("encoding","utf8"),("rn","60")])
                .send().and_then(|r| r.error_for_status()).and_then(|r| r.text()).map_err(|_| "歌曲搜索暂时不可用")?;
            let objects = regex::Regex::new(r"\{([^{}]*'MUSICRID'[^{}]*)\}").unwrap();
            let fields = regex::Regex::new(r"'(NAME|SONGNAME|ARTIST|ALBUM|DURATION|MUSICRID|MVFLAG)'\s*:\s*'((?:\\.|[^'\\])*)'").unwrap();
            let mut rows = Vec::new();
            for object in objects.captures_iter(&response) {
                let mut values = std::collections::HashMap::new();
                for field in fields.captures_iter(&object[1]) { values.insert(field[1].to_string(), text(&field[2])); }
                let id = values.get("MUSICRID").and_then(|v| v.strip_prefix("MUSIC_")).unwrap_or("");
                if id.is_empty() || !id.bytes().all(|c| c.is_ascii_digit()) { continue; }
                if category == "mv" && values.get("MVFLAG").map(|s| s != "1").unwrap_or(true) { continue; }
                let path = if category == "mv" { format!("/tool/mv/?mid={id}") } else { format!("/tool/song/?song={id}") };
                rows.push(json!({"id":format!("shiyinren:{}-{id}", if category == "mv" { "mv" } else { "song" }),"path":path,"source":"shiyinren","video":category == "mv","title":values.get("SONGNAME").or_else(|| values.get("NAME")),"artist":values.get("ARTIST"),"album":values.get("ALBUM"),"duration":values.get("DURATION").and_then(|n| n.parse::<u32>().ok()).unwrap_or(0)}));
            }
            return Ok(json!({"ok":true,"songs":rows}));
        }
        let path = if source == "shiyinren" { if query.trim().is_empty() { if category == "mv" { "/mv" } else { "/song" } } else { "/search/result" } } else if !query.trim().is_empty() { if source == "gequbao" { "/search-fallback" } else { "/so.php" } } else if category == "hot" { if source == "gequbao" { "/top/week-download" } else { "/list/top.html" } } else { "/" };
        let c = client()?;
        let mut request = c.get(format!("{base}{path}")).header("Referer", format!("{base}/"));
        if !query.trim().is_empty() { request = request.query(&[(if source == "gequbao" { "keyword" } else if source == "shiyinren" { "q" } else { "wd" }, query.trim())]); }
        if source == "shiyinren" && !query.trim().is_empty() { request = request.query(&[("nsid", "4")]); }
        let html = send(request).and_then(|r| r.error_for_status()).and_then(|r| r.text()).map_err(|e| format!("音乐源连接失败：{e}"))?;
        let content = if query.is_empty() && category != "hot" && source == "gequbao" { html.split("最近更新").nth(1).unwrap_or(&html).split("本周搜索榜").next().unwrap_or(&html) } else { &html };
        let re = regex::Regex::new(r#"(?s)<a\b([^>]*href=["'](?:https://www\.shiyinren\.net)?(/(?:music/\d+|song/\d+\.html|mv/\d+\.html|mp3/[a-zA-Z0-9]+\.html))["'][^>]*)>(.*?)</a>"#).unwrap();
        let title_re = regex::Regex::new(r#"title=["']([^"']+)["']"#).unwrap();
        let mut seen = std::collections::HashSet::new();
        let mut rows = Vec::new();
        for cap in re.captures_iter(content) {
            let path = &cap[2];
            if category == "mv" && !path.starts_with("/mv/") { continue; }
            let label = if source == "shiyinren" { text(&cap[3]) } else { title_re.captures(&cap[1]).map(|c| text(&c[1])).unwrap_or_else(|| text(&cap[3])) };
            if label.is_empty() || (source == "shiyinren" && category == "mv" && !label.contains(" - ")) { continue; }
            if !seen.insert(path.to_string()) { continue; }
            let (title, artist) = if let Some((artist, title)) = label.split_once('《') { (title.trim_end_matches('》').to_string(), artist.to_string()) } else if let Some((title, artist)) = label.split_once(" - ") { (title.to_string(), artist.to_string()) } else { (label, String::new()) };
            rows.push(json!({"id":format!("{source}:{}", path.as_bytes().iter().map(|b| format!("{b:02x}")).collect::<String>()),"path":path,"title":title,"artist":artist,"source":source,"video":category == "mv"}));
            if rows.len() >= 60 { break; }
        }
        if rows.is_empty() && (html.contains("captcha") || html.contains("验证码") || html.contains("Just a moment")) { return Err("音乐源要求网页验证，当前无法获取歌曲列表".into()); }
        Ok(json!({"ok":true,"songs":rows}))
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn online_play(app: tauri::AppHandle, source: String, path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let valid = regex::Regex::new(r"^/(music/\d+|song/\d+\.html|tool/song/\?song=\d+|mp3/[a-zA-Z0-9]+\.html)$").unwrap();
        if !valid.is_match(&path) { return Err("歌曲标识无效".into()); }
        let base = match source.as_str() { "gequbao" => "https://www.gequbao.com", "90t8" => "https://www.90t8.com", "shiyinren" => "https://www.shiyinren.net", _ => return Err("未知音乐源".into()) };
        let c = client()?;
        let page = format!("{base}{path}");
        if source == "shiyinren" && path.starts_with("/tool/song/?song=") {
            let id = path.trim_start_matches("/tool/song/?song=");
            let local = cache_audio(&app, &c, &format!("https://www.shiyinren.net/server/1/{id}.mp3"), &page)?;
            return Ok(json!({"localPath":local}));
        }
        let html = send(c.get(&page)).and_then(|r| r.error_for_status()).and_then(|r| r.text()).map_err(|e| format!("获取歌曲失败：{e}"))?;
        if source == "gequbao" {
            let encoded = html.split("window.appData = JSON.parse('").nth(1).and_then(|s| s.split("');").next()).ok_or("音乐源页面已变化，暂时无法解析")?;
            let decoded: String = serde_json::from_str(&format!("\"{encoded}\"")).map_err(|_| "歌曲数据解析失败")?;
            let data: Value = serde_json::from_str(&decoded).map_err(|_| "歌曲信息解析失败")?;
            let result: Value = c.post(format!("{base}/member/common-play-url")).header("Referer", &page).header("X-Requested-With", "XMLHttpRequest").form(&[("id",data["play_id"].as_str().unwrap_or("")),("purpose","play")]).send().and_then(|r| r.error_for_status()).and_then(|r| r.json()).map_err(|e| format!("获取播放地址失败：{e}"))?;
            let url = result["data"]["url"].as_str().filter(|s| s.starts_with("http")).ok_or_else(|| format!("音乐源暂未提供播放地址：{}", result["msg"].as_str().unwrap_or("可能需要验证、登录或已达播放额度")))?;
            if url.contains("antiserver.kuwo.cn") { return Err("此歌曲返回转换链接，暂不支持直接播放".into()); }
            let local = cache_audio(&app, &c, url, &page)?;
            return Ok(json!({"localPath":local,"cover":data["mp3_cover"],"title":data["mp3_title"],"artist":data["mp3_author"]}));
        }
        if source == "shiyinren" {
            let re = regex::Regex::new(r"https://www\.shiyinren\.net/server/\d+/\d+\.mp3").unwrap();
            let url = re.find(&html).ok_or("歌曲暂未提供可播放音频")?.as_str();
            let local = cache_audio(&app, &c, url, &page)?;
            let cover = regex::Regex::new(r#"property="og:image"\s+content="([^"]+)"#).unwrap().captures(&html).map(|c| c[1].to_string()).unwrap_or_default();
            let lyrics = regex::Regex::new(r#"(?s)<pre class="aplayer-lrc-content">(.*?)</pre>"#).unwrap().captures(&html).map(|c| text(&c[1])).unwrap_or_default();
            return Ok(json!({"localPath":local,"cover":cover,"lyrics":lyrics}));
        }
        let re = regex::Regex::new(r#"https?://[^\s"'<>]+\.(?:mp3|m4a)(?:\?[^\s"'<>]*)?"#).unwrap();
        let url = re.find(&html).ok_or("该音乐源未返回可直接播放的音频地址")?.as_str();
        let local = cache_audio(&app, &c, url, &page)?;
        Ok(json!({"localPath":local}))
    }).await.map_err(|e| e.to_string())?
}

fn cache_audio(app: &tauri::AppHandle, client: &reqwest::blocking::Client, url: &str, referer: &str) -> Result<String, String> {
    use std::{hash::{Hash, Hasher}, io::{Read, Write}};
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    referer.hash(&mut hash);
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("online-audio");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("{:x}.mp3", hash.finish()));
    if !file.exists() {
        let response = send(client.get(url).header("Referer", referer).header("Range", "bytes=0-1048575")).and_then(|r| r.error_for_status()).map_err(|_| "音频服务器连接失败，请稍后重试")?;
        let mime = response.headers().get("content-type").and_then(|s| s.to_str().ok()).unwrap_or("");
        if mime.contains("text/") || mime.contains("json") { return Err("音频服务器返回了网页，无法播放此歌曲".into()); }
        let total = response.headers().get("content-range").and_then(|v| v.to_str().ok()).and_then(|v| v.rsplit('/').next()).and_then(|v| v.parse::<usize>().ok());
        if total.is_some_and(|n| n > 40 * 1024 * 1024) { return Err("音频超过缓存大小限制".into()); }
        let mut bytes = Vec::new();
        response.take(40 * 1024 * 1024 + 1).read_to_end(&mut bytes).map_err(|_| "音频加载中断，请重试")?;
        if let Some(total) = total {
            while bytes.len() < total {
                let start = bytes.len();
                let end = (start + 1048575).min(total - 1);
                let chunk = send(client.get(url).header("Referer", referer).header("Range", format!("bytes={start}-{end}"))).and_then(|r| r.error_for_status()).map_err(|_| "音频加载中断，请重试")?;
                let expected = format!("bytes {start}-{end}/{total}");
                if chunk.headers().get("content-range").and_then(|v| v.to_str().ok()) != Some(expected.as_str()) { return Err("音频服务器返回的分段不完整，请重试".into()); }
                let previous = bytes.len();
                chunk.take((end - start + 2) as u64).read_to_end(&mut bytes).map_err(|_| "音频加载中断，请重试")?;
                if bytes.len() - previous != end - start + 1 { return Err("音频数据不完整，请重试".into()); }
            }
        }
        if bytes.is_empty() || bytes.len() > 40 * 1024 * 1024 { return Err("音频为空或超过缓存大小限制".into()); }
        let temporary = dir.join(format!("{:x}-{}.tmp", hash.finish(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos()));
        std::fs::File::create(&temporary).and_then(|mut f| f.write_all(&bytes)).map_err(|e| e.to_string())?;
        std::fs::rename(&temporary, &file).map_err(|e| e.to_string())?;
    }
    app.asset_protocol_scope().allow_file(&file).map_err(|e| e.to_string())?;
    Ok(file.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn online_mv_prepare(path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let c = client()?;
        let mid = if let Some(mid) = path.strip_prefix("/tool/mv/?mid=") {
            if !mid.bytes().all(|c| c.is_ascii_digit()) || mid.is_empty() { return Err("MV 标识无效".into()); }
            mid.to_string()
        } else {
            if !regex::Regex::new(r"^/mv/\d+\.html$").unwrap().is_match(&path) { return Err("MV 标识无效".into()); }
            let html = c.get(format!("https://www.shiyinren.net{path}")).send().and_then(|r| r.error_for_status()).and_then(|r| r.text()).map_err(|_| "MV 信息加载失败")?;
            regex::Regex::new(r"getPlayUrl\((\d+),").unwrap().captures(&html).map(|c| c[1].to_string()).ok_or("该 MV 暂未提供播放信息")?
        };
        let token: Value = c.get("https://api.isoudy.com/api/test.php?getToken=1").header("Referer", "https://www.shiyinren.net/").send().and_then(|r| r.error_for_status()).and_then(|r| r.json()).map_err(|_| "MV 播放服务暂时不可用")?;
        let cookie = token["data"].as_str().and_then(|s| s.split(';').next()).ok_or("MV 播放会话获取失败")?;
        Ok(json!({"mid":mid,"cookie":cookie}))
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn online_mv_resolve(mid: String, cookie: String, secret: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !mid.bytes().all(|c| c.is_ascii_digit()) || mid.is_empty() || cookie.len() > 512 || secret.len() > 2048 { return Err("MV 请求无效".into()); }
        let result: Value = client()?.get("https://api.isoudy.com/api/test.php").header("Referer", "https://www.shiyinren.net/").query(&[("data[mid]",mid.as_str()),("data[type]","mv"),("data[httpsStatus]","1"),("data[plat]","web_www"),("token",cookie.as_str()),("secret",secret.as_str())]).send().and_then(|r| r.error_for_status()).and_then(|r| r.json()).map_err(|_| "MV 播放地址获取失败")?;
        let inner: Value = serde_json::from_str(result["data"]["data"].as_str().unwrap_or("")).map_err(|_| "该 MV 暂时无法播放")?;
        let url = inner["data"]["url"].as_str().filter(|s| s.starts_with("https://") || s.starts_with("http://")).ok_or("MV 暂无可用音频视频流")?;
        Ok(json!({"url":url}))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn online_art(app: tauri::AppHandle, path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !regex::Regex::new(r"^/(song|mv)/\d+\.html$").unwrap().is_match(&path) { return Ok(json!({"cover":""})); }
        let html = send(client()?.get(format!("https://www.shiyinren.net{path}"))).and_then(|r| r.error_for_status()).and_then(|r| r.text()).map_err(|_| "封面加载失败")?;
        let cover = regex::Regex::new(r#"property="og:image"\s+content="([^"]+)"#).unwrap().captures(&html).map(|c| c[1].to_string()).unwrap_or_default();
        if cover.is_empty() { return Ok(json!({"cover":""})); }
        use std::{hash::{Hash, Hasher}, io::Read};
        let mut hash = std::collections::hash_map::DefaultHasher::new(); cover.hash(&mut hash);
        let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("covers");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let file = dir.join(format!("online-{:x}.jpg",hash.finish()));
        if !file.exists() {
            let response = send(client()?.get(&cover).header("Referer", "https://www.shiyinren.net/")).and_then(|r| r.error_for_status()).map_err(|_| "封面请求失败")?;
            if !response.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").starts_with("image/") { return Ok(json!({"cover":""})); }
            let mut bytes = Vec::new(); response.take(3145729).read_to_end(&mut bytes).map_err(|_| "封面加载失败")?;
            if bytes.len() > 3145728 || bytes.is_empty() { return Ok(json!({"cover":""})); }
            std::fs::write(&file, bytes).map_err(|e| e.to_string())?;
        }
        app.asset_protocol_scope().allow_file(&file).map_err(|e| e.to_string())?;
        Ok(json!({"coverPath":file.to_string_lossy()}))
    }).await.map_err(|e| e.to_string())?
}
