//! 沿用原系统的网易云、QQ 音乐检索协议；只匹配元数据，不下载音频。
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    hash::{Hash, Hasher},
    io::Read,
    time::Duration,
};
use tauri::Manager;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Candidate {
    source: String,
    id: String,
    title: String,
    artist: String,
    album: String,
    cover: String,
    duration: f64,
}
#[derive(Serialize)]
pub struct Matches {
    results: Vec<Candidate>,
    warnings: Vec<String>,
}
fn text(v: &Value) -> String {
    v.as_str().map(str::to_owned).unwrap_or_default()
}
fn ident(v: &Value) -> String {
    if let Some(s) = v.as_str() {
        s.into()
    } else if v.is_number() {
        v.to_string()
    } else {
        String::new()
    }
}
fn names(v: &Value) -> String {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x["name"].as_str())
                .collect::<Vec<_>>()
                .join(" / ")
        })
        .unwrap_or_default()
}
fn json(response: reqwest::blocking::Response) -> Result<Value, String> {
    let mut data = Vec::new();
    response
        .error_for_status()
        .map_err(|e| e.to_string())?
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() > 2 * 1024 * 1024 {
        return Err("匹配服务响应过大".into());
    }
    serde_json::from_slice(&data).map_err(|_| "匹配服务暂未返回有效数据，请稍后重试".into())
}
fn parse_netease(data: &Value) -> Result<Vec<Candidate>, String> {
    let songs = data["result"]["songs"].as_array();
    if songs.is_none() {
        if data["code"] == 200 {
            return Ok(vec![]);
        }
        return Err("网易云音乐暂不可用".into());
    }
    Ok(songs
        .unwrap()
        .iter()
        .map(|s| {
            let album = if s["album"].is_object() {
                &s["album"]
            } else {
                &s["al"]
            };
            Candidate {
                source: "netease".into(),
                id: ident(&s["id"]),
                title: text(&s["name"]),
                artist: names(if s["artists"].is_array() {
                    &s["artists"]
                } else {
                    &s["ar"]
                }),
                album: text(&album["name"]),
                cover: text(&album["picUrl"]),
                duration: s["duration"]
                    .as_f64()
                    .or_else(|| s["dt"].as_f64())
                    .unwrap_or(0.0)
                    / 1000.0,
            }
        })
        .collect())
}
fn parse_qq(data: &Value) -> Result<Vec<Candidate>, String> {
    let Some(songs) = data["data"]["song"]["list"].as_array() else {
        return Err("QQ 音乐暂不可用".into());
    };
    Ok(songs
        .iter()
        .map(|s| {
            let album_mid = text(&s["albummid"]);
            Candidate {
                source: "qq".into(),
                id: ident(&s["songmid"]),
                title: if s["songname"].is_string() {
                    text(&s["songname"])
                } else {
                    text(&s["title"])
                },
                artist: names(&s["singer"]),
                album: text(&s["albumname"]),
                cover: if album_mid.is_empty() {
                    String::new()
                } else {
                    format!("https://y.gtimg.cn/music/photo_new/T002R500x500M000{album_mid}.jpg")
                },
                duration: s["interval"].as_f64().unwrap_or(0.0),
            }
        })
        .collect())
}
fn search_netease(client: &Client, q: &str) -> Result<Vec<Candidate>, String> {
    let data = json(
        client
            .post("https://music.163.com/api/search/get/web")
            .header("Referer", "https://music.163.com/")
            .form(&[("s", q), ("type", "1"), ("limit", "12"), ("offset", "0")])
            .send()
            .map_err(|_| "网易云音乐连接失败".to_string())?,
    )?;
    let mut songs = parse_netease(&data)?;
    let ids: Vec<_> = songs
        .iter()
        .filter(|s| s.cover.is_empty())
        .filter_map(|s| s.id.parse::<u64>().ok())
        .collect();
    if !ids.is_empty() {
        if let Ok(response) = client
            .get("https://music.163.com/api/song/detail")
            .header("Referer", "https://music.163.com/")
            .query(&[("ids", serde_json::to_string(&ids).unwrap())])
            .send()
        {
            if let Ok(detail) = json(response) {
                if let Some(details) = detail["songs"].as_array() {
                    for hit in &mut songs {
                        if let Some(song) = details.iter().find(|s| ident(&s["id"]) == hit.id) {
                            let cover = text(&song["album"]["picUrl"]);
                            if !cover.is_empty() {
                                hit.cover = cover;
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(songs)
}
fn search_qq(client: &Client, q: &str) -> Result<Vec<Candidate>, String> {
    parse_qq(&json(
        client
            .get("https://c.y.qq.com/soso/fcgi-bin/client_search_cp")
            .header("Referer", "https://y.qq.com/")
            .query(&[("w", q), ("format", "json"), ("n", "12"), ("p", "1")])
            .send()
            .map_err(|_| "QQ 音乐连接失败".to_string())?,
    )?)
}
fn norm(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}
fn title_score(a: &str, b: &str) -> i32 {
    let (a, b) = (norm(a), norm(b));
    if a.is_empty() || b.is_empty() {
        return 0;
    }
    if a == b {
        return 100;
    }
    if a.contains(&b) || b.contains(&a) {
        let ratio = a.chars().count().min(b.chars().count()) as f64
            / a.chars().count().max(b.chars().count()) as f64;
        if ratio >= 0.5 {
            return 75;
        }
    }
    0
}
fn rank(hit: &Candidate, title: &str, artist: &str, duration: f64) -> i32 {
    let mut score = title_score(&hit.title, title);
    let (a, b) = (norm(artist), norm(&hit.artist));
    if !a.is_empty() {
        if b.contains(&a) || a.contains(&b) && !b.is_empty() {
            score += 45
        } else {
            score -= 25
        }
    }
    if duration > 0.0 && hit.duration > 0.0 {
        let diff = (duration - hit.duration).abs();
        if diff <= 3.0 {
            score += 18
        } else if diff <= 8.0 {
            score += 8
        } else if diff > 20.0 {
            score -= 18
        }
    }
    for variant in ["翻唱", "伴奏", "live", "remix", "现场"] {
        if hit.title.to_lowercase().contains(variant) && !title.to_lowercase().contains(variant) {
            score -= 20;
        }
    }
    score
}
fn ranked(hits: Vec<Candidate>, title: &str, artist: &str, duration: f64) -> Vec<Candidate> {
    let mut seen = HashSet::new();
    let mut hits: Vec<_> = hits
        .into_iter()
        .filter(|s| {
            !s.id.is_empty()
                && title_score(&s.title, title) >= 62
                && seen.insert(format!("{}:{}", s.source, s.id))
        })
        .collect();
    hits.sort_by_key(|s| std::cmp::Reverse(rank(s, title, artist, duration)));
    hits.truncate(12);
    hits
}
#[tauri::command]
pub async fn match_songs(title: String, artist: String, duration: f64) -> Result<Matches, String> {
    if title.trim().is_empty() || title.chars().count() > 200 || artist.chars().count() > 200 {
        return Err("请填写有效歌名（不超过200字）".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(6))
            .timeout(Duration::from_secs(12))
            .user_agent("LingjingMusic/0.1")
            .build()
            .map_err(|e| e.to_string())?;
        let artist = if ["未知歌手", "未知艺术家", "unknown artist"]
            .contains(&artist.trim().to_lowercase().as_str())
        {
            String::new()
        } else {
            artist.trim().to_owned()
        };
        let q = format!("{} {}", title.trim(), artist).trim().to_owned();
        let (netease, qq) = std::thread::scope(|scope| {
            let a = scope.spawn(|| search_netease(&client, &q));
            let b = scope.spawn(|| search_qq(&client, &q));
            (
                a.join()
                    .unwrap_or_else(|_| Err("网易云音乐查询失败".into())),
                b.join().unwrap_or_else(|_| Err("QQ 音乐查询失败".into())),
            )
        });
        let mut hits = vec![];
        let mut warnings = vec![];
        let mut successes = 0;
        for result in [netease, qq] {
            match result {
                Ok(s) => {
                    successes += 1;
                    hits.extend(s)
                }
                Err(e) => warnings.push(e),
            }
        }
        if successes == 0 {
            return Err(format!("歌曲匹配服务暂不可用：{}", warnings.join("；")));
        }
        Ok(Matches {
            results: ranked(hits, &title, &artist, duration),
            warnings,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
fn cover_host(url: &url::Url) -> bool {
    let host = url.host_str().unwrap_or("");
    url.scheme() == "https"
        && (host == "y.gtimg.cn" || host.ends_with(".music.126.net") || host == "music.163.com")
}
#[tauri::command]
pub async fn cache_cover(app: tauri::AppHandle, url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut parsed = url::Url::parse(&url).map_err(|_| "封面地址无效")?;
        if parsed.scheme() == "http" {
            let _ = parsed.set_scheme("https");
        }
        if !cover_host(&parsed) {
            return Err("封面地址不属于已支持的音乐来源".into());
        }
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(6))
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() > 5 {
                    attempt.error("封面重定向次数过多")
                } else if cover_host(attempt.url()) {
                    attempt.follow()
                } else {
                    attempt.error("封面重定向来源无效")
                }
            }))
            .build()
            .map_err(|e| e.to_string())?;
        let response = client
            .get(parsed)
            .send()
            .map_err(|_| "封面下载失败，请重试")?
            .error_for_status()
            .map_err(|_| "封面服务器暂不可用")?;
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|x| x.to_str().ok())
            .unwrap_or("")
            .to_owned();
        let ext = if content_type.starts_with("image/jpeg") {
            "jpg"
        } else if content_type.starts_with("image/png") {
            "png"
        } else if content_type.starts_with("image/webp") {
            "webp"
        } else {
            return Err("封面响应不是支持的图片格式".into());
        };
        let mut bytes = Vec::new();
        response
            .take(5 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "封面读取失败")?;
        if bytes.is_empty() || bytes.len() > 5 * 1024 * 1024 {
            return Err("封面文件为空或超过5MB".into());
        }
        let dir = app
            .path()
            .app_cache_dir()
            .map_err(|e| e.to_string())?
            .join("covers");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        url.hash(&mut hash);
        let path = dir.join(format!("{:x}.{ext}", hash.finish()));
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
        app.asset_protocol_scope()
            .allow_file(&path)
            .map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn hit(id: &str, title: &str, artist: &str, duration: f64) -> Candidate {
        Candidate {
            source: "qq".into(),
            id: id.into(),
            title: title.into(),
            artist: artist.into(),
            album: "专辑".into(),
            cover: String::new(),
            duration,
        }
    }
    #[test]
    fn parses_both_providers() {
        let a=parse_netease(&json!({"code":200,"result":{"songs":[{"id":1,"name":"晴天","artists":[{"name":"周杰伦"}],"album":{"name":"叶惠美"},"duration":269000}]}})).unwrap();
        assert_eq!(a[0].duration, 269.0);
        assert_eq!(a[0].artist, "周杰伦");
        let b=parse_qq(&json!({"data":{"song":{"list":[{"songmid":"abc","songname":"晴天","singer":[{"name":"周杰伦"}],"albumname":"叶惠美","albummid":"xyz","interval":269}]}}})).unwrap();
        assert!(b[0].cover.contains("xyz.jpg"));
        assert!(parse_qq(&json!({"code":403})).is_err());
    }
    #[test]
    fn prefers_artist_and_duration_and_rejects_unrelated() {
        let results = ranked(
            vec![
                hit("1", "晴天", "别人", 269.0),
                hit("2", "晴天", "周杰伦", 269.0),
                hit("3", "不相关", "周杰伦", 269.0),
                hit("2", "晴天", "周杰伦", 269.0),
                hit("4", "晴天 live", "周杰伦", 400.0),
            ],
            "晴天",
            "周杰伦",
            269.0,
        );
        assert_eq!(results[0].id, "2");
        assert_eq!(results.len(), 2);
    }
    #[test]
    fn cover_sources_are_limited() {
        assert!(cover_host(
            &url::Url::parse("https://p1.music.126.net/cover.jpg").unwrap()
        ));
        assert!(!cover_host(
            &url::Url::parse("http://127.0.0.1/a.jpg").unwrap()
        ));
        assert!(!cover_host(
            &url::Url::parse("https://music.126.net.evil.example/a.jpg").unwrap()
        ));
    }
}

#[cfg(test)]
mod network_tests {
    use super::*;
    #[test]
    #[ignore = "需要联网，手动验证实际匹配来源"]
    fn live_search() {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(6))
            .timeout(Duration::from_secs(12))
            .build()
            .unwrap();
        let mut all = Vec::new();
        for (name, result) in [
            ("网易云", search_netease(&client, "晴天 周杰伦")),
            ("QQ", search_qq(&client, "晴天 周杰伦")),
        ] {
            match result {
                Ok(hits) => {
                    println!("{name}: {} 个候选", hits.len());
                    all.extend(hits)
                }
                Err(e) => println!("{name}: {e}"),
            }
        }
        let hits = ranked(all, "晴天", "周杰伦", 269.0);
        println!("有效候选: {}", hits.len());
        assert!(!hits.is_empty(), "所有来源均未获得有效候选");
    }
}

fn fetch_lyric(client: &Client, hit: &Candidate) -> Result<String, String> {
    let response = if hit.source == "qq" {
        client.get("https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg")
            .header("Referer", "https://y.qq.com/portal/player.html")
            .query(&[("songmid", hit.id.as_str()), ("format", "json"), ("nobase64", "1"), ("g_tk", "5381")]).send()
    } else {
        client.get("https://music.163.com/api/song/lyric")
            .header("Referer", "https://music.163.com/")
            .query(&[("id", hit.id.as_str()), ("lv", "-1"), ("kv", "-1"), ("tv", "-1")]).send()
    }.map_err(|e| e.to_string())?;
    let data = json(response)?;
    Ok(if hit.source == "qq" { text(&data["lyric"]) } else { text(&data["lrc"]["lyric"]) })
}
fn has_timed_lyrics(raw: &str) -> bool {
    regex::Regex::new(r"\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]")
        .unwrap().is_match(raw) && !raw.contains("纯音乐，请欣赏")
}
fn find_lyrics(client: &Client, title: &str, artist: &str, duration: f64, query: &str) -> Result<Value, String> {
    let artist = if ["未知歌手", "未知艺术家", "unknown artist"].contains(&artist.trim().to_lowercase().as_str()) { "" } else { artist.trim() };
    let queries = if query.trim().is_empty() {
        let mut q = vec![format!("{title} {artist}").trim().to_owned()];
        if !artist.is_empty() { q.push(title.to_owned()); }
        q
    } else { vec![query.trim().to_owned()] };
    let mut seen = HashSet::new();
    let mut reached = false;
    for q in queries {
        for provider in ["netease", "qq"] {
            let found = if provider == "netease" {
                client.post("https://music.163.com/api/search/get/web")
                    .header("Referer", "https://music.163.com/")
                    .form(&[("s", q.as_str()), ("type", "1"), ("limit", "12"), ("offset", "0")])
                    .send().map_err(|e| e.to_string()).and_then(json).and_then(|v| parse_netease(&v))
            } else { search_qq(client, &q) };
            if let Ok(mut hits) = found {
                reached = true;
                if query.trim().is_empty() { hits = ranked(hits, title, artist, duration); }
                for hit in hits.into_iter().take(4) {
                    if !seen.insert(format!("{}:{}", hit.source, hit.id)) { continue; }
                    if let Ok(raw) = fetch_lyric(client, &hit) {
                        if has_timed_lyrics(&raw) { return Ok(serde_json::json!({"ok":true,"source":hit.source,"lrc":raw})); }
                    }
                }
            }
        }
    }
    if !reached { return Err("歌词服务暂时无法连接，请稍后重新匹配".into()); }
    Ok(serde_json::json!({"ok":false,"lrc":""}))
}
#[tauri::command]
pub async fn search_lyrics(app: tauri::AppHandle, title: String, artist: String, duration: f64, query: String, refresh: bool) -> Result<Value, String> {
    if title.chars().count() > 200 || artist.chars().count() > 200 || query.chars().count() > 200 { return Err("歌词搜索内容过长".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        (&title, &artist, duration.to_bits(), &query).hash(&mut hash);
        let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("lyrics");
        let path = dir.join(format!("{:x}.json", hash.finish()));
        if !refresh {
            if let Ok(data) = std::fs::read(&path) {
                let fresh = path.metadata().ok().and_then(|m| m.modified().ok()).and_then(|t| t.elapsed().ok()).is_some_and(|age| age.as_secs() < 30 * 86400);
                if fresh { if let Ok(value) = serde_json::from_slice::<Value>(&data) { return Ok(value); } }
            }
        }
        let client = Client::builder().connect_timeout(Duration::from_secs(5)).timeout(Duration::from_secs(8)).user_agent("Mozilla/5.0 LingjingMusic/0.1").build().map_err(|e| e.to_string())?;
        let result = find_lyrics(&client, title.trim(), &artist, duration, &query)?;
        // 不缓存失败结果，网络恢复后能够立即重试。
        if result["ok"] == true {
            let _ = std::fs::create_dir_all(dir);
            if let Ok(bytes) = serde_json::to_vec(&result) { let _ = std::fs::write(path, bytes); }
        }
        Ok(result)
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod lyric_tests {
    use super::*;
    #[test]
    fn accepts_timed_lyrics_only() {
        assert!(has_timed_lyrics("[00:01.20]歌词"));
        assert!(has_timed_lyrics("[01:20:50]歌词"));
        assert!(!has_timed_lyrics("暂无歌词"));
        assert!(!has_timed_lyrics("[00:00.00]纯音乐，请欣赏"));
    }
    #[test]
    #[ignore = "需要联网，验证真实歌曲歌词"]
    fn live_lyrics() {
        let client = Client::builder().timeout(Duration::from_secs(10)).build().unwrap();
        for (title, artist) in [("最幸福的人", "曾春年"), ("晴天", "周杰伦"), ("放手", "阿杜")] {
            let result = find_lyrics(&client, title, artist, 0.0, "").unwrap();
            assert_eq!(result["ok"], true, "{title} 未匹配到歌词");
            println!("{title} / {artist}: {} 字符，来源 {}", result["lrc"].as_str().unwrap().len(), result["source"]);
        }
    }
}
