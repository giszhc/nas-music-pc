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
    static TAGS: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re = TAGS.get_or_init(|| regex::Regex::new("<[^>]*>").unwrap());
    re.replace_all(value, "").replace("&amp;", "&").replace("&nbsp;", " ").replace("&#039;", "'").replace("&quot;", "\"").trim().to_string()
}
fn client() -> Result<reqwest::blocking::Client, String> {
    static CLIENT: std::sync::OnceLock<reqwest::blocking::Client> = std::sync::OnceLock::new();
    if let Some(client) = CLIENT.get() { return Ok(client.clone()); }
    let client = reqwest::blocking::Client::builder().connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(18)).user_agent("Mozilla/5.0 LingjingMusic/0.1")
        .build().map_err(|e| e.to_string())?;
    Ok(CLIENT.get_or_init(|| client).clone())
}
fn send(request: reqwest::blocking::RequestBuilder) -> Result<reqwest::blocking::Response, reqwest::Error> {
    let Some(retry) = request.try_clone() else { return request.send(); };
    let mut result = request.send();
    for _ in 0..1 {
        if !result.as_ref().err().is_some_and(|e| e.is_connect() || e.is_timeout() || e.is_request()) { break; }
        let Some(next) = retry.try_clone() else { break; };
        result = next.send();
    }
    result
}
fn full_url(row: &Value) -> Option<&str> {
    if row["code"] != 200 || !row["freeTrialInfo"].is_null() || row["flagTrial"] == true {
        return None;
    }
    row["url"].as_str().filter(|url| url.starts_with("http://") || url.starts_with("https://"))
}
fn song_urls(ids: &[u64]) -> Result<Value, String> {
    client()?.get("https://music.163.com/api/song/enhance/player/url")
        .query(&[("ids",json!(ids).to_string()),("br","128000".into())]).send()
        .and_then(|r| r.error_for_status()).and_then(|r| r.json()).map_err(|_| "无法核对歌曲播放权限".into())
}
fn search_catalog(query: &str, category: &str) -> Result<Value, String> {
    let c = client()?;
    let video = category == "mv";
    let (request, pointer) = if !query.is_empty() {
        (c.get("https://music.163.com/api/cloudsearch/pc").query(&[("s",query),("type",if video { "1004" } else { "1" }),("limit","50")]),
         if video { "/result/mvs" } else { "/result/songs" })
    } else if video {
        (c.get("https://music.163.com/api/mv/toplist").query(&[("limit","30")]), "/data")
    } else {
        (c.get("https://music.163.com/api/v6/playlist/detail").query(&[("id",if category=="hot" {"3778678"} else {"3779629"}),("n","50")]), "/playlist/tracks")
    };
    let data: Value = request.send().and_then(|r| r.error_for_status()).and_then(|r| r.json()).map_err(|_| "网易云目录暂时不可用")?;
    if data["code"] != 200 { return Err("网易云目录暂时不可用".into()); }
    let tracks = data.pointer(pointer).and_then(Value::as_array).map(Vec::as_slice).unwrap_or(&[]);
    let mut available = std::collections::HashSet::new();
    if !video && !tracks.is_empty() {
        let ids: Vec<_> = tracks.iter().filter_map(|r| r["id"].as_u64()).collect();
        let urls = song_urls(&ids)?;
        for row in urls["data"].as_array().ok_or("无法核对歌曲播放权限")? {
            if full_url(row).is_some() { available.extend(row["id"].as_u64()); }
        }
    }
    let mut songs: Vec<_> = tracks.iter().filter_map(|r| {
        let id = r["id"].as_u64()?;
        if !video && !available.contains(&id) { return None; }
        let artist = if video { r["artistName"].as_str()?.to_owned() } else {
            r["ar"].as_array()?.iter().filter_map(|a| a["name"].as_str()).collect::<Vec<_>>().join(" / ")
        };
        let source = if video { "netease-mv" } else { "netease-song" };
        Some(json!({"id":format!("{source}:{id}"),"path":id.to_string(),"source":source,"video":video,
            "title":r["name"].as_str()?,"artist":artist,"album":r["al"]["name"],
            "art":(if video {&r["cover"]} else {&r["al"]["picUrl"]}).as_str().unwrap_or("").replacen("http://","https://",1),
            "duration":r[if video {"duration"} else {"dt"}].as_u64().unwrap_or(0)/1000}))
    }).collect();
    if !query.is_empty() { songs.sort_by_key(|r| !r["artist"].as_str().unwrap_or("").split(" / ").any(|a| a.eq_ignore_ascii_case(query))); }
    Ok(json!({"songs":songs}))
}
#[tauri::command]
pub async fn online_catalog(source: String, category: String, query: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if source == "catalog" { return search_catalog(query.trim(), &category); }
        let base = match source.as_str() { "gequbao" => "https://www.gequbao.com", "90t8" => "https://www.90t8.com", "shiyinren" => "https://www.shiyinren.net", _ => return Err("未知音乐源".into()) };
        if source == "shiyinren" && category == "hot" && query.trim().is_empty() { return Ok(json!({"ok":true,"songs":[]})); }
        if source == "shiyinren" && !query.trim().is_empty() {
            let mut request = client()?.get("https://search.kuwo.cn/r.s")
                .header("Referer", "https://www.shiyinren.net/")
                .query(&[("all",query.trim()),("ft","music"),("client","kt"),("cluster","0"),("rformat","json"),("encoding","utf8"),("rn","60")]);
            if category == "mv" {
                // 拾音人 MV 搜索页使用的专用视频目录查询。
                request = request.query(&[("hasmkv","1"),("newsearch","1"),("itemset","web_2012"),("vipver","MUSIC_8.0.3.1")]);
            }
            let response = request.send().and_then(|r| r.error_for_status()).and_then(|r| r.text()).map_err(|_| "歌曲搜索暂时不可用")?;
            let objects = regex::Regex::new(r"\{([^{}]*'MUSICRID'[^{}]*)").unwrap();
            let fields = regex::Regex::new(r"'(NAME|SONGNAME|ARTIST|ALBUM|DURATION|MUSICRID|MVFLAG)'\s*:\s*'((?:\\.|[^'\\])*)'").unwrap();
            let mut rows = Vec::new();
            for object in objects.captures_iter(&response) {
                let mut values = std::collections::HashMap::new();
                for field in fields.captures_iter(&object[1]) { values.insert(field[1].to_string(), text(&field[2])); }
                let id = values.get("MUSICRID").and_then(|v| v.strip_prefix("MUSIC_")).unwrap_or("");
                if id.is_empty() || !id.bytes().all(|c| c.is_ascii_digit()) { continue; }
                if category == "mv" && values.get("MVFLAG").is_some_and(|s| s == "0") { continue; }
                let path = if category == "mv" { format!("/tool/mv/?mid={id}") } else { format!("/tool/song/?song={id}") };
                rows.push(json!({"id":format!("shiyinren:{}-{id}", if category == "mv" { "mv" } else { "song" }),"path":path,"source":"shiyinren","video":category == "mv","title":values.get("SONGNAME").or_else(|| values.get("NAME")),"artist":values.get("ARTIST"),"album":values.get("ALBUM"),"duration":values.get("DURATION").and_then(|n| n.parse::<u32>().ok()).unwrap_or(0)}));
            }
            return Ok(json!({"ok":true,"songs":rows}));
        }
        let path = if source == "shiyinren" { if query.trim().is_empty() { if category == "mv" { "/mv" } else { "/song" } } else { "/search/result" } } else if !query.trim().is_empty() { if source == "gequbao" { "/search-fallback" } else { "/so.php" } } else if category == "hot" { if source == "gequbao" { "/top/week-download" } else { "/list/top.html" } } else { "/" };
        let c = client()?;
        let mut request = c.get(format!("{base}{path}")).header("Referer", format!("{base}/"));
        if !query.trim().is_empty() { request = request.query(&[(if source == "gequbao" { "keyword" } else if source == "shiyinren" { "q" } else { "wd" }, query.trim())]); }
        if source == "shiyinren" && !query.trim().is_empty() { request = request.query(&[("nsid", if category == "mv" { "3" } else { "4" })]); }
        let html = send(request).and_then(|r| r.error_for_status()).and_then(|r| r.text()).map_err(|e| format!("音乐源连接失败：{e}"))?;
        let content = if query.is_empty() && category != "hot" && source == "gequbao" { html.split("最近更新").nth(1).unwrap_or(&html).split("本周搜索榜").next().unwrap_or(&html) } else { &html };
        let re = regex::Regex::new(r#"(?s)<a\b([^>]*href=["'](?:https://www\.shiyinren\.net)?(/(?:music/\d+|song/\d+\.html|mv/\d+\.html|mp3/[a-zA-Z0-9]+\.html))["'][^>]*)>(.*?)</a>"#).unwrap();
        let title_re = regex::Regex::new(r#"title=["']([^"']+)["']"#).unwrap();
        let mut seen = std::collections::HashSet::new();
        let mut rows = Vec::new();
        let mut durations = std::collections::HashMap::new();
        let time_label = regex::Regex::new(r"^(\d{1,3}):([0-5]\d)$").unwrap();
        for cap in re.captures_iter(content) {
            let path = &cap[2];
            if category == "mv" && !path.starts_with("/mv/") { continue; }
            let label = if source == "shiyinren" { text(&cap[3]) } else { title_re.captures(&cap[1]).map(|c| text(&c[1])).unwrap_or_else(|| text(&cap[3])) };
            if source == "90t8" && cap[3].contains("stime") {
                if let Some(time) = time_label.captures(&label) {
                    let seconds = time[1].parse::<u32>().unwrap_or(0) * 60 + time[2].parse::<u32>().unwrap_or(0);
                    durations.insert(path.to_owned(), seconds);
                }
                continue;
            }
            if label.is_empty() || (source == "shiyinren" && category == "mv" && !label.contains(" - ")) { continue; }
            if !seen.insert(path.to_string()) { continue; }
            let (title, artist) = if let Some((artist, title)) = label.split_once('《') { (title.trim_end_matches('》').to_string(), artist.to_string()) } else if let Some((left, right)) = label.split_once(" - ") { if source == "90t8" { (right.to_string(), left.to_string()) } else { (left.to_string(), right.to_string()) } } else { (label, String::new()) };
            rows.push(json!({"id":format!("{source}:{}", path.as_bytes().iter().map(|b| format!("{b:02x}")).collect::<String>()),"path":path,"title":title,"artist":artist,"source":source,"duration":durations.get(path),"video":category == "mv"}));
            if rows.len() >= 60 { break; }
        }
        if rows.is_empty() && (html.contains("captcha") || html.contains("验证码") || html.contains("Just a moment")) { return Err("音乐源要求网页验证，当前无法获取歌曲列表".into()); }
        Ok(json!({"ok":true,"songs":rows}))
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn online_play(app: tauri::AppHandle, source: String, path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if source == "netease-song" {
            let id = path.parse::<u64>().map_err(|_| "歌曲编号无效")?;
            let data = song_urls(&[id])?;
            let url = full_url(&data["data"][0]).ok_or("该歌曲当前无法完整播放")?;
            return Ok(json!({"url":url.replacen("http://","https://",1)}));
        }
        if source == "netease-mv" {
            let id = path.parse::<u64>().map_err(|_| "MV 编号无效")?;
            let data: Value = client()?.get("https://music.163.com/api/song/enhance/play/mv/url")
                .query(&[("id",id),("r",720)]).send().and_then(|r| r.error_for_status())
                .and_then(|r| r.json()).map_err(|_| "MV 地址获取失败")?;
            let url = full_url(&data["data"]).ok_or("该 MV 暂未提供播放权限")?;
            return Ok(json!({"url":url.replacen("http://","https://",1)}));
        }
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
            return Ok(json!({"localPath":local,"cover":data["mp3_cover"],"title":data["mp3_title"],"artist":data["mp3_author"],"displayDuration":data["mp3_duration"]}));
        }
        if source == "shiyinren" {
            let re = regex::Regex::new(r"https://www\.shiyinren\.net/server/\d+/\d+\.mp3").unwrap();
            let url = re.find(&html).ok_or("歌曲暂未提供可播放音频")?.as_str();
            let local = cache_audio(&app, &c, url, &page)?;
            let cover = regex::Regex::new(r#"property="og:image"\s+content="([^"]+)"#).unwrap().captures(&html).map(|c| c[1].to_string()).unwrap_or_default();
            let lyrics = regex::Regex::new(r#"(?s)<pre class="aplayer-lrc-content">(.*?)</pre>"#).unwrap().captures(&html).map(|c| text(&c[1])).unwrap_or_default();
            return Ok(json!({"localPath":local,"cover":cover,"lyrics":lyrics}));
        }
        let id = path.trim_start_matches("/mp3/").trim_end_matches(".html");
        let player = regex::Regex::new(r#"player\(["'](dance|music|mp3|song)["'],\s*["']([a-zA-Z0-9]+)["']\)"#).unwrap()
            .captures(&html).filter(|m| &m[2] == id).ok_or("歌曲播放器与所选曲目不匹配")?;
        let label = regex::Regex::new(r#"id="player_title"[^>]*>([^<]+)"#).unwrap()
            .captures(&html).map(|m| text(&m[1])).ok_or("无法核对歌曲署名")?;
        let (artist,title) = label.split_once(" - ").ok_or("歌曲署名不完整")?;
        let media: Value = c.post(format!("{base}/style/js/play.php")).header("Referer",&page)
            .header("X-Requested-With","XMLHttpRequest").form(&[("id",id),("type",&player[1])])
            .send().and_then(|r| r.error_for_status()).and_then(|r| r.json()).map_err(|_| "当前歌曲未提供音频")?;
        let url = media["url"].as_str().filter(|s| s.starts_with("https://") || s.starts_with("http://")).ok_or("当前歌曲未提供音频")?;
        let local = cache_audio(&app,&c,url,&page)?;
        Ok(json!({"localPath":local,"artist":artist,"title":title,"lyrics":media["lrc"],"cover":media["pic"]}))

    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn external_songs(app: tauri::AppHandle, source: String, query: String) -> Result<Value,String> {
    use lofty::file::AudioFile;
    if !matches!(source.as_str(),"90t8" | "gequbao") || query.trim().is_empty() { return Err("歌曲源或关键词无效".into()); }
    let catalog = online_catalog(source.clone(),"latest".into(),query).await?;
    let mut songs = Vec::new();
    for mut row in catalog["songs"].as_array().into_iter().flatten().take(3).cloned() {
        let Some(path) = row["path"].as_str() else { continue };
        let Ok(media) = online_play(app.clone(),source.clone(),path.into()).await else { continue };
        if media["artist"] != row["artist"] || media["title"] != row["title"] { continue; }
        let expected = row["duration"].as_u64().or_else(|| {
            let (m,s) = media["displayDuration"].as_str()?.split_once(':')?;
            Some(m.parse::<u64>().ok()?.checked_mul(60)?.checked_add(s.parse().ok()?)?)
        });
        let Some(expected) = expected.filter(|d| *d > 0) else { continue };
        let Some(file) = media["localPath"].as_str() else { continue };
        let file = file.to_owned();
        let duration = tauri::async_runtime::spawn_blocking(move || lofty::read_from_path(file).ok().map(|f| f.properties().duration().as_secs())).await.map_err(|e|e.to_string())?;
        if !duration.is_some_and(|d| d > 0 && d.abs_diff(expected) <= 2) { continue; }
        row["duration"] = json!(expected);
        row["verifiedFile"] = media["localPath"].clone();
        row["art"] = media["cover"].clone();
        row["lyrics"] = media["lyrics"].clone();
        songs.push(row);
    }
    Ok(json!({"songs":songs}))
}

fn cache_audio(app: &tauri::AppHandle, client: &reqwest::blocking::Client, url: &str, referer: &str) -> Result<String, String> {
    use std::{hash::{Hash, Hasher}, io::{Read, Write}};
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    referer.hash(&mut hash);
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("online-audio");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("{:x}.mp3", hash.finish()));
    if !file.exists() {
        let response = send(client.get(url).header("Referer", referer).header("Range", "bytes=0-4194303")).and_then(|r| r.error_for_status()).map_err(|_| "音频服务器连接失败，请稍后重试")?;
        let mime = response.headers().get("content-type").and_then(|s| s.to_str().ok()).unwrap_or("");
        if mime.contains("text/") || mime.contains("json") { return Err("音频服务器返回了网页，无法播放此歌曲".into()); }
        let total = response.headers().get("content-range").and_then(|v| v.to_str().ok()).and_then(|v| v.rsplit('/').next()).and_then(|v| v.parse::<usize>().ok());
        if total.is_some_and(|n| n > 40 * 1024 * 1024) { return Err("音频超过缓存大小限制".into()); }
        let mut bytes = Vec::new();
        response.take(40 * 1024 * 1024 + 1).read_to_end(&mut bytes).map_err(|_| "音频加载中断，请重试")?;
        if let Some(total) = total {
            while bytes.len() < total {
                let start = bytes.len();
                let end = (start + 4194303).min(total - 1);
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

#[cfg(test)]
mod catalog_tests {
    use super::*;

    #[test]
    #[ignore = "需要连接在线音乐源"]
    fn singer_search_maps_song_artist_and_duration() {
        for source in ["90t8", "shiyinren"] {
            let result = tauri::async_runtime::block_on(online_catalog(
                source.into(), "latest".into(), "宋晓峰".into(),
            )).unwrap();
            let rows = result["songs"].as_array().unwrap();
            assert!(rows.iter().any(|row| {
                row["artist"].as_str().is_some_and(|artist| artist.contains("宋晓峰"))
                    && row["title"].as_str().is_some_and(|title| title.chars().any(|c| c.is_alphabetic()))
                    && row["duration"].as_u64().unwrap_or(0) > 0
            }), "{source} 未返回完整的歌曲信息");
        }
    }
}

#[cfg(test)]
mod availability_tests {
    use super::*;

    #[test]
    fn excludes_trial_and_unavailable_streams() {
        let full = json!({"code":200,"url":"https://example.test/song.mp3","freeTrialInfo":null});
        assert!(full_url(&full).is_some());
        for (key, value) in [("freeTrialInfo",json!({"start":0,"end":30})), ("flagTrial",json!(true)), ("code",json!(403)), ("url",Value::Null)] {
            let mut restricted = full.clone();
            restricted[key] = value;
            assert!(full_url(&restricted).is_none());
        }
    }

    #[test]
    #[ignore = "需要连接在线音乐源"]
    fn full_song_search_and_charts() {
        for (query, category) in [("愿意不爱你","latest"),("","hot"),("","latest")] {
            let catalog = search_catalog(query, category).unwrap();
            let rows = catalog["songs"].as_array().unwrap();
            println!("{query} {category}: {}", rows.len());
            assert!(rows.iter().all(|r| r["source"] == "netease-song"));
            if query.is_empty() { assert!(!rows.is_empty()); }
        }
    }
}
