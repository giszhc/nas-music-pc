'use strict';
/**
 * 在线歌词：网易云为主、QQ 音乐兜底
 * - 搜索接口免 Key，但必须带 Referer，否则被拒
 * - 结果按「歌名 + 歌手 + 时长」打分，分数不够就不认，避免给《后来》配到《后来(live)》
 * - 磁盘缓存 data/lyrics.json：命中 30 天，未命中 24 小时（负缓存，免得每次播放都打网络）
 */
const store = require('./store');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const TIMEOUT = 7000;
const HIT_TTL = 30 * 24 * 3600 * 1000;
const MISS_TTL = 24 * 3600 * 1000;
// 解析/清洗规则变了就把版本号 +1，旧缓存自动作废
const CACHE_V = 2;

const cache = store.read('lyrics.json', {});
let saveTimer = null;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      store.write('lyrics.json', cache);
    } catch (e) {
      /* ignore */
    }
  }, 1200);
}

async function request(url, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctl.signal,
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'zh-CN,zh;q=0.9',
        ...(opts.headers || {})
      }
    });
    if (!res.ok) return null;
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------- 文本归一化 ------------------------------- */

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[（(\[【][^)）\]】]*[)）\]】]/g, '')
    .replace(/\b(feat|ft|live|remix|version|cover|acoustic|instrumental)\b/g, '')
    .replace(/(伴奏|纯音乐|原唱|翻唱|现场|高音质|无损|完整版)/g, '')
    .replace(/[\s\-_·・,，.。!！?？'"“”‘’/\\]/g, '')
    .trim();
}

function looseMatch(a, b) {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function scoreHit(hit, title, artist, duration) {
  const nt = norm(title);
  const nh = norm(hit.title);
  let score = 0;
  if (!nh) return { score: 0, artistHit: false };
  if (nt === nh) score = 100;
  else if (looseMatch(nh, nt)) score = 78;
  else if (nh.length > 2 && (nt.includes(nh) || nh.includes(nt))) {
    // 只包含一小截的（「后来」撞「后来遇见的人」）不算命中，否则手动搜个乱码都能配上
    const ratio = Math.min(nh.length, nt.length) / Math.max(nh.length, nt.length);
    score = ratio >= 0.5 ? 62 : 20;
  } else score = 20;

  const na = norm(artist);
  const nha = norm(hit.artist);
  let artistHit = false;
  if (na && nha) {
    if (looseMatch(nha, na)) {
      score += 45;
      artistHit = true;
    } else if (nha.split(/[,&、/]/).some((x) => looseMatch(x, na))) {
      score += 30;
      artistHit = true;
    } else {
      score -= 25;
    }
  } else if (!nha && na) {
    score -= 5;
  }

  if (duration && hit.duration) {
    const diff = Math.abs(duration - hit.duration);
    if (diff <= 3) score += 18;
    else if (diff <= 8) score += 8;
    else if (diff > 20) score -= 18;
  }
  return { score, artistHit };
}

/* --------------------------------- LRC --------------------------------- */

// 歌词文件开头常带一串制作信息（作词 : 无 / 编曲：xxx / 美工：xxx / 人声:xxx），播放时显示很碍眼
const CREDIT_RE =
  /^(作词|作曲|编曲|制作人|制作|监制|混音|录音|母带|和声|吉他|贝斯|鼓手|鼓|键盘|弦乐|人声|出品|发行|原唱|翻唱|演唱|词|曲|美工|设计|OP|SP|录音室|企划|统筹|宣发|策划|封面|配唱|后期|视觉|摄影)\s*[:：]/i;

function isCredit(text) {
  if (!text) return true;
  if (CREDIT_RE.test(text)) return true;
  // 「美工：乐栖谷」「人声:饶佩森」这类短标签，只在歌名位置出现，正文里极少
  if (/^[^\s:：]{1,6}\s*[:：]/.test(text)) return true;
  if (/^[\s\-–—~·.]*$/.test(text)) return true;
  if (/^(纯音乐|此歌曲为没有填词的纯音乐|暂无歌词)/.test(text)) return true;
  return false;
}

function parseLrc(raw, dropTitle) {
  if (!raw) return [];
  const offsetM = /\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw);
  const offset = offsetM ? Number(offsetM[1]) / 1000 : 0;
  const nt = dropTitle ? norm(dropTitle) : '';
  const out = [];
  raw.split(/\r?\n/).forEach((line) => {
    const tags = [...line.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) return;
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    tags.forEach((m) => {
      const sec = Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(`0.${m[3]}`) : 0);
      out.push({ t: Math.max(0, Math.round((sec + offset) * 100) / 100), text });
    });
  });
  out.sort((a, b) => a.t - b.t);

  // 只在开头剥制作信息：正文里出现「他说：」这种冒号不该被误删
  let head = 0;
  while (head < out.length && head < 40) {
    const t = out[head].text;
    if (!t || isCredit(t) || (nt && norm(t) === nt)) head += 1;
    else break;
  }
  const body = out.slice(head);

  const seen = new Set();
  return body.filter((l) => {
    const k = `${l.t}|${l.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function attachTranslation(lines, transLines) {
  if (!transLines || !transLines.length) return lines;
  const map = new Map();
  transLines.forEach((l) => {
    if (l.text) map.set(Math.round(l.t * 10), l.text);
  });
  lines.forEach((l) => {
    const tr = map.get(Math.round(l.t * 10));
    if (tr && tr !== l.text) l.tr = tr;
  });
  return lines;
}

/* -------------------------------- 网易云 -------------------------------- */

async function searchNetease(keyword) {
  const body = new URLSearchParams({ s: keyword, type: '1', limit: '12', offset: '0' }).toString();
  const data = await request('https://music.163.com/api/search/get/web', {
    method: 'POST',
    headers: {
      Referer: 'https://music.163.com',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const songs = data && data.result && data.result.songs;
  if (!Array.isArray(songs)) return [];
  return songs.map((s) => ({
    source: 'netease',
    id: String(s.id),
    title: s.name || '',
    artist: (s.artists || []).map((a) => a.name).join(' / '),
    album: (s.album && s.album.name) || '',
    cover: (s.album && s.album.picUrl) || '',
    duration: s.duration ? s.duration / 1000 : 0
  }));
}

async function lyricNetease(id) {
  const data = await request(`https://music.163.com/api/song/lyric?id=${encodeURIComponent(id)}&lv=-1&kv=-1&tv=-1`, {
    headers: { Referer: 'https://music.163.com' }
  });
  const lrc = data && data.lrc && data.lrc.lyric;
  const tlrc = data && data.tlyric && data.tlyric.lyric;
  if (!lrc) return null;
  return { lrc, tlrc };
}

/* -------------------------------- QQ 音乐 -------------------------------- */

async function searchQQ(keyword) {
  const data = await request(
    `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(keyword)}&format=json&n=12&p=1`,
    { headers: { Referer: 'https://y.qq.com' } }
  );
  const list = data && data.data && data.data.song && data.data.song.list;
  if (!Array.isArray(list)) return [];
  return list.map((s) => ({
    source: 'qq',
    id: s.songmid,
    title: s.songname || s.title || '',
    artist: (s.singer || []).map((a) => a.name).join(' / '),
    album: s.albumname || '',
    cover: s.albummid ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${encodeURIComponent(s.albummid)}.jpg` : '',
    duration: Number(s.interval) || 0
  }));
}

async function lyricQQ(mid) {
  const data = await request(
    `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(mid)}&format=json&nobase64=1&g_tk=5381`,
    { headers: { Referer: 'https://y.qq.com/portal/player.html' } }
  );
  if (!data || !data.lyric) return null;
  return { lrc: data.lyric, tlrc: data.trans || '' };
}

/* -------------------------------- 对外接口 -------------------------------- */

function cacheKey(title, artist, q) {
  return `${norm(q ? q : title)}|${norm(q ? '' : artist)}`;
}

async function fetchOne(hit) {
  const raw = hit.source === 'qq' ? await lyricQQ(hit.id) : await lyricNetease(hit.id);
  if (!raw || !raw.lrc) return null;
  const lines = parseLrc(raw.lrc, hit.title);
  if (!lines.length) return null;
  const trans = raw.tlrc ? parseLrc(raw.tlrc) : [];
  attachTranslation(lines, trans);
  return lines;
}

async function find({ title, artist, duration = 0, q = '', refresh = false }) {
  const key = cacheKey(title, artist, q);
  const hitCache = cache[key];
  const now = Date.now();
  if (!refresh && hitCache && hitCache.v === CACHE_V) {
    const ttl = hitCache.ok ? HIT_TTL : MISS_TTL;
    if (now - (hitCache.at || 0) < ttl) return { ok: true, cached: true, ...hitCache };
  }

  const keyword = String(q || `${title} ${artist || ''}`).trim();
  let hits = [];
  try {
    hits = await searchNetease(keyword);
  } catch (e) {
    hits = [];
  }
  // 网易云的曲库对老歌/翻唱覆盖一般；结果太少就把 QQ 的也并进来一起打分
  if (hits.length < 3) {
    try {
      hits = hits.concat(await searchQQ(keyword));
    } catch (e) {
      /* ignore */
    }
  }
  if (!hits.length) {
    try {
      hits = await searchQQ(keyword);
    } catch (e) {
      /* ignore */
    }
  }

  // 歌手对得上的排前面：同为《保护色》，苏亦承原唱优先于陈炫均翻唱
  const ranked = hits
    .map((h) => {
      const r = scoreHit(h, title, artist, duration);
      return { h, s: r.score, artistHit: r.artistHit };
    })
    .sort((a, b) => Number(b.artistHit) - Number(a.artistHit) || b.s - a.s);

  for (const item of ranked.slice(0, 3)) {
    if (item.s < 62) break;
    const lines = await fetchOne(item.h);
    if (!lines || lines.length < 3) continue;
    const payload = {
      ok: true,
      v: CACHE_V,
      at: now,
      source: item.h.source,
      matched: { title: item.h.title, artist: item.h.artist, album: item.h.album },
      lines
    };
    cache[key] = payload;
    persist();
    return { ok: true, cached: false, ...payload };
  }

  const miss = { ok: false, v: CACHE_V, at: now, reason: 'not-found', keyword };
  cache[key] = miss;
  persist();
  return { ok: false, cached: false, reason: 'not-found', keyword };
}

// 封面不依赖歌词：纯音乐、无歌词歌曲也可以匹配。
const covers = store.read('music-covers.json', {});
const coverPending = new Map();

async function findCover({ title, artist = '', duration = 0 }) {
  if (!norm(title)) return null;
  const knownArtist = /^(未知歌手|未知艺术家|unknown(?: artist)?)$/i.test(artist.trim()) ? '' : artist;
  const key = JSON.stringify([norm(title), norm(knownArtist), Math.round(duration)]);
  const cached = covers[key];
  if (cached && Date.now() - cached.at < (cached.url ? HIT_TTL : MISS_TTL)) return cached.url;
  if (coverPending.has(key)) return coverPending.get(key);
  const task = (async () => {
    const keyword = `${title} ${knownArtist}`.trim();
    const accept = hits => hits.filter(hit => {
      if ((!hit.cover && hit.source !== 'netease') || norm(hit.title) !== norm(title)) return false;
      const score = scoreHit(hit, title, knownArtist, duration);
      if (knownArtist && !score.artistHit) return false;
      if (duration && hit.duration && Math.abs(duration - hit.duration) > 20) return false;
      return score.score >= 100;
    }).sort((a, b) => scoreHit(b, title, knownArtist, duration).score - scoreHit(a, title, knownArtist, duration).score);
    let matches = accept(await searchNetease(keyword));
    let url = matches[0] && matches[0].cover;
    if (matches.length && !url) {
      const detail = await request(`https://music.163.com/api/song/detail?ids=${encodeURIComponent(JSON.stringify([matches[0].id]))}`, { headers: { Referer: 'https://music.163.com/' } });
      url = detail && detail.songs && detail.songs[0] && detail.songs[0].album && detail.songs[0].album.picUrl;
    }
    if (!url) {
      matches = accept(await searchQQ(keyword));
      url = matches[0] && matches[0].cover;
    }
    url = url || null;
    covers[key] = { url, at: Date.now() };
    store.write('music-covers.json', covers);
    return url;
  })();
  coverPending.set(key, task);
  try { return await task; } finally { coverPending.delete(key); }
}

/** 编辑歌曲时按歌名检索候选，不要求存在歌词。 */
async function searchSongs({ title, artist = '', duration = 0 }) {
  title = String(title || '').trim();
  if (!norm(title)) return [];
  const knownArtist = /^(未知歌手|未知艺术家|unknown(?: artist)?)$/i.test(artist.trim()) ? '' : artist.trim();
  const keyword = `${title} ${knownArtist}`.trim();
  const sources = await Promise.allSettled([searchNetease(keyword), searchQQ(keyword)]);
  const hits = sources.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const seen = new Set();
  const ranked = hits.filter(hit => {
    const key = `${hit.source}:${hit.id}`;
    if (!hit.id || seen.has(key) || scoreHit(hit, title, '', 0).score < 62) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => scoreHit(b, title, knownArtist, duration).score - scoreHit(a, title, knownArtist, duration).score).slice(0, 12);
  const missing = ranked.filter(hit => hit.source === 'netease' && !hit.cover);
  if (missing.length) {
    const detail = await request(`https://music.163.com/api/song/detail?ids=${encodeURIComponent(JSON.stringify(missing.map(hit => hit.id)))}`, { headers: { Referer: 'https://music.163.com/' } });
    for (const hit of missing) {
      const song = detail?.songs?.find(song => String(song.id) === String(hit.id));
      if (song?.album?.picUrl) hit.cover = song.album.picUrl;
    }
  }
  return ranked;
}

module.exports = { find, findCover, searchSongs, parseLrc, norm };
