'use strict';
/**
 * 云影 · NAS 媒体中心
 * 本地服务：登录群晖 → 扫描媒体库 → 在线元数据 → 浏览器/客户端播放
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

const store = require('./lib/store');
const nas = require('./lib/synology');
const scanner = require('./lib/scanner');
const { progress, matchProgress } = require('./lib/task-progress');
const { mergeScanItems, countVideoFiles } = require('./lib/library-scan');
const { displayTitle } = require('./lib/library-titles');
const metadata = require('./lib/metadata');
const media = require('./lib/media');
const videoPreview = require('./lib/video-preview');
const lyrics = require('./lib/lyrics');
const { deduplicateSongs } = require('./lib/music-library');
const net = require('./lib/net');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || store.config().port || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const VERSION = '1.0.0';

const S = {
  library: store.read('library.json', null),
  progress: store.read('progress.json', {}),
  scanning: false,
  scanMsg: '',
  scanProgress: null,
  scanAt: 0,
  enriching: false,
  enrichMsg: '',
  enrichProgress: null,
  lastError: ''
};

/* ---------------------------------- 工具 ---------------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
  '.mov': 'video/quicktime',
  '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.rmvb': 'application/vnd.rn-realmedia-vbr',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.wave': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wma': 'audio/x-ms-wma',
  '.ape': 'audio/x-ape',
  '.alac': 'audio/mp4',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.dsf': 'audio/x-dsf',
  '.dff': 'audio/x-dff',
  '.wv': 'audio/x-wavpack',
  '.mpc': 'audio/x-musepack',
  '.mka': 'audio/x-matroska',
  '.amr': 'audio/amr',
  '.ac3': 'audio/ac3',
  '.dts': 'audio/vnd.dts',
  '.vtt': 'text/vtt; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8'
};

function mimeOf(p) {
  return MIME[path.extname(String(p)).toLowerCase()] || 'application/octet-stream';
}

/** 渐变占位图：无封面时的统一兜底（音乐卡、无元数据的影片都用它） */
function placeholderSVG(text, seed) {
  const label = String(text || '云影').slice(0, 12).replace(/[<>&]/g, '');
  const hue = Math.abs(Number(seed) || 1) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="hsl(${hue},52%,32%)"/><stop offset="55%" stop-color="hsl(${(hue + 40) % 360},48%,22%)"/><stop offset="100%" stop-color="hsl(${(hue + 80) % 360},40%,14%)"/>
</linearGradient></defs>
<rect width="300" height="400" fill="url(#g)"/>
<circle cx="250" cy="60" r="90" fill="hsl(${(hue + 30) % 360},60%,55%)" opacity="0.16"/>
<text x="150" y="200" text-anchor="middle" font-family="PingFang SC,Helvetica" font-size="30" font-weight="700" fill="rgba(255,255,255,.92)">${label}</text>
</svg>`;
}

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function fail(res, message, status = 400, extra = {}) {
  json(res, { ok: false, error: message, ...extra }, status);
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function persistProgress() {
  store.write('progress.json', S.progress);
}

function persistLibrary() {
  if (!S.library) return;
  store.write('library.json', S.library);
}

/* -------------------------------- 会话管理 -------------------------------- */

function bootSession() {
  const cfg = store.config();
  if (cfg.server && cfg.server.host && cfg.server.sid) {
    nas.restore(cfg.server);
  }
}

async function ensureSession() {
  const current = nas.getSession();
  if (current) return current;
  const cfg = store.config();
  if (cfg.server.host && cfg.server.account && cfg.server.password && cfg.server.remember) {
    const s = await nas.login({
      host: cfg.server.host,
      port: cfg.server.port,
      secure: cfg.server.https,
      account: cfg.server.account,
      password: cfg.server.password
    });
    store.saveConfig({
      server: { sid: s.sid, token: s.token, hostname: s.hostname, https: s.secure }
    });
    return s;
  }
  const err = new Error('请先登录群晖账号');
  err.code = 'NEED_LOGIN';
  throw err;
}

async function withNas(fn) {
  await ensureSession();
  try {
    return await fn();
  } catch (e) {
    if (e.code === 119 || e.code === 106) {
      const cfg = store.config();
      if (cfg.server.password && cfg.server.remember) {
        const s = await nas.login({
          host: cfg.server.host,
          port: cfg.server.port,
          secure: cfg.server.https,
          account: cfg.server.account,
          password: cfg.server.password
        });
        store.saveConfig({ server: { sid: s.sid, token: s.token, hostname: s.hostname } });
        return await fn();
      }
      const err = new Error('登录已过期，请重新登录');
      err.code = 'NEED_LOGIN';
      throw err;
    }
    throw e;
  }
}

function hasLocalSource() {
  return store.config().sources.some((s) => s.provider === 'local');
}

/* --------------------------------- 目录读取 -------------------------------- */

async function listDir(source, dirPath) {
  if (source.provider === 'local') {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.map((e) => {
      const full = path.join(dirPath, e.name);
      let size = 0;
      let mtime = 0;
      try {
        const st = fs.statSync(full);
        size = st.size;
        mtime = st.mtimeMs;
      } catch (err) {
        /* ignore */
      }
      return { name: e.name, path: full, isdir: e.isDirectory(), size, mtime };
    });
  }
  return withNas(() => nas.listFolder(dirPath));
}

/* --------------------------------- 扫描任务 -------------------------------- */

function decorate(item) {
  const meta = metadata.getCached(item.id);
  const prog = S.progress[item.id];
  const lastEp = item.episodes[item.episodes.length - 1];
  const isMusic = item.type === 'music';
  return {
    id: item.id,
    title: displayTitle(item, allItems(), meta && meta.title),
    rawTitle: item.title,
    year: (meta && meta.year) || item.year,
    type: item.type,
    label: item.label,
    kind: item.kind,
    artist: item.artist || '',
    // 音乐封面优先读取目录图片，无图片时在线匹配。
    art: isMusic ? `/api/cover?item=${encodeURIComponent(item.id)}` : '',
    episodeCount: item.episodeCount,
    seasonCount: item.seasonCount,
    newestEpisode: lastEp ? lastEp.episode : 0,
    size: item.size,
    mtime: item.mtime,
    poster: (meta && meta.poster) || '',
    backdrop: (meta && meta.backdrop) || '',
    rating: (meta && meta.rating) || 0,
    overview: (meta && meta.overview) || '',
    genres: (meta && meta.genres) || [],
    matched: !!meta,
    progress: prog
      ? {
          epIndex: prog.epIndex || 0,
          position: prog.position || 0,
          duration: prog.duration || 0,
          percent: prog.duration ? Math.min(99, Math.round((prog.position / prog.duration) * 100)) : 0,
          updatedAt: prog.updatedAt
        }
      : null
  };
}

function allItems() {
  return (S.library && S.library.items) || [];
}

function findItem(id) {
  return allItems().find((i) => i.id === id);
}

function findEpisodeByPath(p) {
  for (const item of allItems()) {
    const ep = item.episodes.find((e) => e.path === p);
    if (ep) return ep;
  }
  return null;
}

async function enrichEpisodeTitles(item, force) {
  if (!metadata.hasKey() || item.type === 'movie' || item.type === 'music' || !item.episodes?.length) return;
  try {
    await metadata.getEpisodeTitles(item, { force });
  } catch (e) {
    // 分集资料缺失或网络异常不影响整库匹配继续。
  }
}

async function enrichAll(items, { force = false } = {}) {
  // 豆瓣始终可用，不需要 TMDB Key；有 Key 时 matchItem 会额外走 TMDB 兜底
  if (S.enriching) return { started: false, reason: '正在匹配中' };
  S.enriching = true;
  const queue = items.filter((i) => i.type !== 'music' && (force || !metadata.getCached(i.id)));
  const total = queue.length;
  S.enrichProgress = matchProgress(0, total);
  let done = 0;
  S.enrichMsg = `${force ? '正在重新匹配' : '正在获取影片资料与分集标题'} 0/${total}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 豆瓣对短时间内的密集请求会返回 302 拦截，串行 + 1 秒间隔最稳（封面是逐条出现的，不影响使用）
  try {
    const workers = new Array(1).fill(0).map(async () => {
      while (queue.length) {
        const item = queue.shift();
        try {
          await metadata.matchItem(item, { force });
          // 多季剧顺带把每一季的独立条目也抓下来，之后打开详情页不用再等
          if (item.seasonCount > 1 && item.type !== 'movie' && item.type !== 'music') {
            for (const s of (item.seasons || [])) {
              if (!force && metadata.getCachedSeason(item, s.season)) continue;
              try {
                await metadata.matchSeason(item, s.season, { force: true });
              } catch (e) {
                /* 单季失败忽略 */
              }
              await sleep(900);
            }
          }
        } catch (e) {
          /* 忽略单条失败 */
        }
        await enrichEpisodeTitles(item, force);
        done += 1;
        S.enrichProgress = matchProgress(done, total);
        S.enrichMsg = `${force ? '正在重新匹配' : '正在获取影片资料与分集标题'} ${done}/${total}`;
        if (done % 5 === 0) persistLibrary();
        await sleep(force ? 700 : 1000);
      }
    });
    await Promise.all(workers);
    // 补偿重试：仍失败的条目再试一轮（间隔放宽，避开豆瓣限流）
    const failed = items.filter((i) => i.type !== 'music' && !metadata.getCached(i.id));
    if (failed.length) {
      let retried = 0;
      S.enrichProgress = matchProgress(0, failed.length, true);
      S.enrichMsg = `正在重试 ${failed.length} 部未匹配作品`;
      await sleep(8000);
      for (const item of failed) {
        try {
          await metadata.matchItem(item, { force: true });
        } catch (e) {
          /* ignore */
        }
        await enrichEpisodeTitles(item, true);
        retried += 1;
        S.enrichProgress = matchProgress(retried, failed.length, true);
        S.enrichMsg = `正在重试 ${retried}/${failed.length}`;
        await sleep(1200);
      }
    }
    const unmatched = items.filter(i => i.type !== 'music' && !metadata.getCached(i.id)).length;
    S.enrichProgress = progress('匹配完成', total, total, 100);
    S.enrichMsg = unmatched ? `匹配完成，${unmatched} 部暂未找到资料` : '全部匹配完成';
  } catch (e) {
    S.enrichMsg = `匹配中断：${e.message}`;
    S.enrichProgress = { ...S.enrichProgress, error: true };
  } finally {
    S.enriching = false;
    persistLibrary();
  }
}

async function runScan(sourceId = null) {
  if (S.scanning) return { started: false, reason: '正在扫描中' };
  const cfg = store.config();
  if (!cfg.sources.length) return { started: false, reason: '还没有添加媒体目录' };
  const sources = sourceId ? cfg.sources.filter(source => source.id === sourceId) : cfg.sources;
  if (!sources.length) return { started: false, reason: '媒体目录不存在' };
  const sourceName = sourceId ? sources[0].name || sources[0].path : '';
  const warnings = [];

  S.scanning = true;
  S.scanMsg = '正在连接并读取目录…';
  S.lastError = '';
  S.scanProgress = { ...progress('读取目录', 0, sources.length, 0, true), sourceName };
  S.enrichProgress = null;
  const startedAt = Date.now();
  try {
    const result = await scanner.scan(sources, listDir, (p) => {
      if (p.msg) S.scanMsg = p.msg;
      if (p.warn) warnings.push(p.msg);
      if (Number.isFinite(p.percent)) S.scanProgress = { sourceName, stage: p.stage, completed: p.completed, total: p.total, percent: p.percent, estimated: p.estimated };
    });
    if (warnings.length) throw new Error(`有 ${warnings.length} 个目录读取失败，已保留原媒体库。${warnings[0]}`);
    const items = mergeScanItems(allItems(), result.items, sourceId);
    S.library = {
      scanVersion: sourceId && S.library ? S.library.scanVersion : scanner.SCAN_VERSION,
      items,
      files: countVideoFiles(items),
      updatedAt: Date.now(),
      sources: cfg.sources.map((s) => ({ id: s.id, name: s.name, path: s.path }))
    };
    S.scanAt = Date.now();
    coverDirCache.clear();
    persistLibrary();
    S.scanMsg = `${sourceName ? sourceName + ' · ' : ''}扫描完成：${result.items.length} 部作品 / ${result.files} 个视频 / ${result.audios || 0} 个音频`;
    S.lastError = '';
    S.scanProgress = { ...progress('扫描完成', result.files + (result.audios || 0), result.files + (result.audios || 0), 100), sourceName };
    enrichAll(result.items).catch(() => {});
    return { started: true, items: result.items.length, files: result.files, ms: Date.now() - startedAt };
  } catch (e) {
    S.lastError = e.message;
    S.scanMsg = `扫描失败：${e.message}`;
    S.scanProgress = { ...S.scanProgress, error: true };
    return { started: false, reason: e.message };
  } finally {
    S.scanning = false;
  }
}

/* --------------------------------- 播放处理 -------------------------------- */

function isAllowedPath(p) {
  const sources = store.config().sources;
  return sources.some((s) => {
    if (s.provider === 'local') return p === s.path || p.startsWith(s.path.endsWith('/') ? s.path : s.path + '/');
    return p === s.path || p.startsWith(s.path.endsWith('/') ? s.path : s.path + '/');
  });
}

function providerOfPath(p) {
  const sources = store.config().sources;
  const hit = sources.find((s) => p === s.path || p.startsWith(s.path + '/'));
  return hit ? hit.provider : 'nas';
}

function serveLocalFile(req, res, filePath, contentType) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (e) {
    return fail(res, '文件不存在', 404);
  }
  const total = stat.size;
  const type = contentType || mimeOf(filePath);
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end) || end >= total) end = total - 1;
    if (start > end || start >= total) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    });
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', () => res.end());
    return stream.pipe(res);
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': total,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store'
  });
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => res.end());
  return stream.pipe(res);
}

async function handleStream(req, res, url) {
  const filePath = url.searchParams.get('path');
  if (!filePath) return fail(res, '缺少 path 参数');
  if (!isAllowedPath(filePath)) return fail(res, '该路径不在媒体库范围内', 403);

  if (providerOfPath(filePath) === 'local') {
    return serveLocalFile(req, res, filePath);
  }

  try {
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await nas.streamRequest(nas.downloadUrl(filePath), nas.authHeaders(headers));
    if (upstream.statusCode >= 400) {
      res.writeHead(upstream.statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
      upstream.pipe(res);
      return;
    }
    const out = {};
    for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
      if (upstream.headers[k]) out[k] = upstream.headers[k];
    }
    if (!out['content-type'] || out['content-type'].includes('octet-stream')) {
      out['content-type'] = mimeOf(filePath);
    }
    out['cache-control'] = 'no-store';
    res.writeHead(upstream.statusCode || 200, out);
    upstream.pipe(res);
    res.on('close', () => upstream.destroy());
  } catch (e) {
    fail(res, `读取文件失败：${e.message}`, 500);
  }
}

async function handleTranscode(req, res, url) {
  const filePath = url.searchParams.get('path');
  const start = Math.max(0, Number(url.searchParams.get('start') || 0));
  const quality = url.searchParams.get('quality') || '';
  const force = url.searchParams.get('force') === '1';
  if (!filePath) return fail(res, '缺少 path 参数');
  if (!isAllowedPath(filePath)) return fail(res, '该路径不在媒体库范围内', 403);
  if (!store.config().transcode) return fail(res, '转码已关闭', 400);

  const isLocal = providerOfPath(filePath) === 'local';
  const ext = path.extname(filePath).toLowerCase();
  const probeUrl = isLocal ? filePath : `http://127.0.0.1:${PORT}/api/stream?path=${encodeURIComponent(filePath)}`;

  /* ---- 音频：APE / WMA / DSD / ALAC 这类浏览器放不了，实时转 MP3 ---- */
  if (media.isAudioFile(filePath)) {
    let audioHandle;
    try {
      audioHandle = media.startAudioTranscode({ url: probeUrl, start });
    } catch (e) {
      return fail(res, e.message, 500);
    }
    const aproc = audioHandle.proc;
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'Accept-Ranges': 'none' });
    aproc.stdout.pipe(res);
    aproc.on('error', () => { try { res.end(); } catch (e) { /* ignore */ } });
    aproc.on('close', () => { try { res.end(); } catch (e) { /* ignore */ } });
    res.on('close', () => { if (!aproc.killed) aproc.kill('SIGKILL'); });
    return undefined;
  }

  const ep = findEpisodeByPath(filePath);
  let info = await media.probe(filePath, ep ? ep.mtime : 0, probeUrl);
  const requestedAudio = url.searchParams.get('audio');
  const audioTrack = requestedAudio === null ? (info?.audioTracks?.find(t => t.default)?.index || 0) : Number(requestedAudio);
  if (!Number.isInteger(audioTrack) || audioTrack < 0 || (requestedAudio !== null && !info?.audioTracks?.some(t => t.index === audioTrack))) return fail(res, '无效音轨');
  const selectedAudio = info?.audioTracks?.find(t => t.index === audioTrack);
  if (selectedAudio) info = { ...info, acodec: selectedAudio.codec };
  const requestedSubtitle = url.searchParams.get('subtitle');
  const subtitleTrack = requestedSubtitle === null ? null : Number(requestedSubtitle);
  if (subtitleTrack !== null && (!Number.isInteger(subtitleTrack) || !info?.subtitleTracks?.some(t => t.index === subtitleTrack && t.bitmap))) return fail(res, '无效图形字幕轨');
  let mode = media.decideMode(ext, info);
  if (mode === 'direct') mode = 'remux';
  // 用户明确指定了比源文件更低的画质 → 必须真转码，不能只换封装
  // force=1：客户端解不了源编码（例如浏览器没有 H.265），即使同分辨率也要重编
  if (subtitleTrack !== null || force || (quality && info && info.height && Number(quality) < info.height)) mode = 'transcode';
  if (mode === 'unsupported') return fail(res, '该文件编码无法在浏览器中播放，请安装 ffmpeg', 415);

  let handle;
  try {
    handle = media.startTranscode({ url: probeUrl, start, mode, info, quality, audioTrack, subtitleTrack });
  } catch (e) {
    return fail(res, e.message, 500);
  }
  const { proc } = handle;
  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'none'
  });
  proc.stdout.pipe(res);
  proc.on('error', () => {
    try {
      res.end();
    } catch (e) {
      /* ignore */
    }
  });
  proc.on('close', () => {
    try {
      res.end();
    } catch (e) {
      /* ignore */
    }
  });
  res.on('close', () => {
    if (!proc.killed) proc.kill('SIGKILL');
  });
}

/**
 * 音频播放列表：专辑 = 它的曲目；单曲 = 同一目录下的其它歌（散装歌单目录）。
 * 每项都带 itemId + epIndex，前端点一下直接换歌，不用回详情页。
 */
function buildPlaylist(item, ep, epIndex) {
  const songTitle = (e) => {
    if (!e) return '';
    if (e.songTitle) return e.songTitle;
    const t = scanner.parseTrack(e.name || '');
    return t.title || String(e.name || '').replace(/\.[^.]+$/, '');
  };

  if (item.kind === 'album') {
    return {
      title: item.title,
      current: epIndex,
      items: item.episodes.map((e, i) => ({
        itemId: item.id,
        epIndex: e.index !== undefined ? e.index : i,
        no: e.episode || i + 1,
        title: songTitle(e),
        artist: e.artist || item.artist || '',
        name: e.name
      }))
    };
  }

  const dir = path.dirname(ep.path);
  let sibs = allItems()
    .filter(
      (i) =>
        i.type === 'music' &&
        i.kind !== 'album' &&
        i.episodes.length &&
        path.dirname(i.episodes[0].path) === dir
    )
    .sort((a, b) =>
      String(a.episodes[0].name).localeCompare(String(b.episodes[0].name), 'zh-Hans-CN', { numeric: true })
    )
    .slice(0, 500);
  if (!sibs.length) sibs = [item];

  const items = sibs.map((i, idx) => {
    const e = i.episodes[0] || {};
    return {
      itemId: i.id,
      epIndex: 0,
      no: idx + 1,
      title: songTitle(e) || i.title,
      artist: e.artist || i.artist || '',
      name: e.name || ''
    };
  });
  let current = items.findIndex((x) => x.itemId === item.id);
  if (current < 0) current = 0;
  return { title: items.length > 1 ? path.basename(dir) || '播放列表' : '单曲', current, items };
}

/* ------------------------------- 音乐库 ------------------------------- */

let musicWarming = false;

/** 音乐条目里"一首歌"的统一形态：专辑曲目和散装单曲都归一成这个结构 */
function songMetadata(item, ep) {
  return store.read('music-metadata.json', {})[ep.path] || {};
}

function musicSongEntry(item, ep, epIndex) {
  const parsed = ep.songTitle ? { title: ep.songTitle, artist: ep.artist || '' } : scanner.parseTrack(ep.name || '');
  const title = parsed.title || String(ep.name || '').replace(/\.[^.]+$/, '');
  const custom = songMetadata(item, ep);
  const isAlbum = item.kind === 'album';
  const info = media.peekProbe(ep.path, ep.mtime);
  return {
    key: `${item.id}:${epIndex}`,
    id: item.id,
    ep: epIndex,
    title: custom.title ?? title,
    artist: custom.artist ?? (ep.artist || parsed.artist || item.artist || ''),
    album: custom.album ?? (isAlbum ? item.title : ''),
    albumArtist: isAlbum ? item.artist || ep.artist || '' : '',
    duration: info && info.duration ? Math.round(info.duration) : 0,
    acodec: (info && info.acodec) || '',
    ext: String(ep.ext || path.extname(ep.path) || '').toLowerCase(),
    size: ep.size || 0,
    mtime: ep.mtime || item.mtime || 0,
    dir: path.dirname(ep.path),
    // fallback=0：没封面就 404，让前端用渐变/首字母占位，而不是塞一张带歌名的 SVG 图
    art: `/api/cover?item=${encodeURIComponent(item.id)}&ep=${epIndex}&fallback=0${custom.updated ? `&v=${custom.updated}` : ''}`
  };
}

/** 后台补时长：ffprobe 一首要一两秒，不能卡在请求里；并发 2，慢慢补 */
async function warmMusicDurations(jobs) {
  if (musicWarming || !jobs.length) return;
  musicWarming = true;
  const queue = jobs.slice(0, 300);
  const worker = async () => {
    while (queue.length) {
      const job = queue.shift();
      const probeUrl = providerOfPath(job.path) === 'local'
        ? job.path
        : `http://127.0.0.1:${PORT}/api/stream?path=${encodeURIComponent(job.path)}`;
      try {
        await media.probe(job.path, job.mtime, probeUrl);
      } catch (e) {
        /* 单首探测失败不影响列表 */
      }
    }
  };
  await Promise.all([worker(), worker()]);
  musicWarming = false;
}

function handleMusic(req, res, url) {
  const items = allItems().filter((i) => i.type === 'music');
  const candidates = [];
  const needProbe = [];

  for (const item of items) {
    (item.episodes || []).forEach((ep, i) => {
      const epIndex = ep.index !== undefined ? ep.index : i;
      const song = musicSongEntry(item, ep, epIndex);
      candidates.push(song);
      if (!song.duration) needProbe.push({ path: ep.path, mtime: ep.mtime });
    });
  }

  const songs = deduplicateSongs(candidates);
  const artistMap = new Map();
  for (const s of songs) {
    const name = s.artist || '未知歌手';
    let a = artistMap.get(name);
    if (!a) {
      a = { name, count: 0, albums: new Set(), art: s.art, keys: [] };
      artistMap.set(name, a);
    }
    a.count += 1;
    if (s.album) a.albums.add(s.album);
    a.keys.push(s.key);
    if (!a.art || a.art === s.art) a.art = s.art;
  }
  const artists = [...artistMap.values()]
    .map((a) => ({ name: a.name, count: a.count, albumCount: a.albums.size, art: a.art, keys: a.keys }))
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name, 'zh-Hans-CN'));

  const albumMap = new Map();
  for (const s of songs) {
    if (!s.album) continue;
    const key = `${s.album}|${s.albumArtist}`;
    let al = albumMap.get(key);
    if (!al) {
      al = { key, name: s.album, artist: s.albumArtist, count: 0, duration: 0, art: s.art, year: 0, itemId: s.id, keys: [] };
      albumMap.set(key, al);
    }
    al.count += 1;
    al.duration += s.duration;
    al.keys.push(s.key);
    if (!al.art) al.art = s.art;
  }
  const albums = [...albumMap.values()].sort((x, y) => x.name.localeCompare(y.name, 'zh-Hans-CN'));

  const totalDuration = songs.reduce((n, s) => n + (s.duration || 0), 0);

  json(res, {
    ok: true,
    stats: {
      songs: songs.length,
      artists: artists.length,
      albums: albums.length,
      duration: totalDuration
    },
    songs,
    artists,
    albums,
    probing: needProbe.length
  });

  // 响应先发出去，再在后台补时长（前端拿到 probing>0 会再拉一次）
  if (needProbe.length) warmMusicDurations(needProbe).catch(() => {});
}

async function handleLyrics(req, res, url) {
  const id = url.searchParams.get('item');
  const epIndex = Number(url.searchParams.get('ep') || 0);
  const q = String(url.searchParams.get('q') || '').trim();
  const refresh = url.searchParams.get('refresh') === '1';

  let title = String(url.searchParams.get('title') || '').trim();
  let artist = String(url.searchParams.get('artist') || '').trim();
  let duration = Number(url.searchParams.get('duration') || 0);

  // 手动搜索时只认 q，不再拿本地曲目信息去干扰打分
  if (q) {
    title = q;
    artist = '';
    duration = 0;
  } else {
    const item = findItem(id);
    if (!item) return fail(res, '找不到该曲目', 404);
    const ep = (item.episodes || [])[epIndex] || item.episodes[0];
    if (!ep) return fail(res, '该曲目没有可播放文件', 404);
    const song = musicSongEntry(item, ep, epIndex);
    title = title || song.title;
    artist = artist || song.artist;
    duration = duration || song.duration;
  }

  if (!title) return fail(res, '缺少歌名', 400);

  let out;
  try {
    out = await lyrics.find({ title, artist, duration, q, refresh });
  } catch (e) {
    return json(res, { ok: false, reason: 'error', message: String(e.message || e) });
  }
  return json(res, {
    ok: !!out.ok,
    title,
    artist,
    duration,
    cached: !!out.cached,
    source: out.source || '',
    matched: out.matched || null,
    reason: out.reason || '',
    keyword: out.keyword || '',
    lines: out.lines || []
  });
}

async function handlePlay(req, res, url) {
  const id = url.searchParams.get('item');
  const epIndex = Number(url.searchParams.get('ep') || 0);
  const item = findItem(id);
  if (!item) return fail(res, '找不到该影片', 404);
  const ep = item.episodes[epIndex] || item.episodes[0];
  if (!ep) return fail(res, '该影片没有可播放文件', 404);

  const ext = path.extname(ep.path).toLowerCase();
  const isLocal = providerOfPath(ep.path) === 'local';
  const isAudio = media.isAudioFile(ep.path);
  const probeUrl = isLocal ? ep.path : `http://127.0.0.1:${PORT}/api/stream?path=${encodeURIComponent(ep.path)}`;
  let info = null;
  try {
    info = await media.probe(ep.path, ep.mtime, probeUrl);
  } catch (e) {
    info = null;
  }
  const mode = isAudio ? media.decideAudioMode(ext, info) : media.decideMode(ext, info);
  const qualities = isAudio ? [] : media.availableQualities(info);
  const srcH = (info && info.height) || 0;
  const defaultQuality = srcH >= 2160 ? '2160' : srcH >= 1080 ? '1080' : '720';

  const directUrl = `/api/stream?path=${encodeURIComponent(ep.path)}`;
  const transBase = `/api/transcode?path=${encodeURIComponent(ep.path)}`;
  const transUrl = `${transBase}&quality=${defaultQuality}`;

  let subtitle = null;
  if (isLocal && !isAudio) {
    const sub = media.findLocalSubtitle(ep.path);
    if (sub) subtitle = `/api/subtitle?path=${encodeURIComponent(sub)}`;
  }

  const playlist = isAudio ? buildPlaylist(item, ep, epIndex) : null;

  const meta = metadata.getCached(item.id) || {};
  const typeLabel = item.type === 'movie' ? '电影' : item.type === 'anime' ? '动漫' : item.type === 'music' ? '音乐' : '剧集';
  const yearAreaGenres = [
    meta.year || '',
    (meta.countries || []).join('/'),
    (meta.genres || []).join('/')
  ]
    .filter(Boolean)
    .join(' · ');

  json(res, {
    ok: true,
    itemId: item.id,
    title: item.title,
    type: item.type,
    typeLabel,
    epIndex,
    episodeName: ep.name,
    episodeTitle: (isAudio && songMetadata(item, ep).title) || ep.songTitle || '',
    episodeArtist: isAudio ? (songMetadata(item, ep).artist ?? ep.artist ?? '') : ep.artist || '',
    kind: item.kind,
    audio: isAudio,
    song: isAudio ? musicSongEntry(item, ep, epIndex) : null,
    artist: item.artist || '',
    mode,
    playable: mode !== 'unsupported',
    url: mode === 'direct' ? directUrl : isAudio ? transBase : transUrl,
    urls: { direct: directUrl, transcode: transBase },
    seekable: mode === 'direct',
    duration: (info && info.duration) || 0,
    resolution: info && info.width ? `${info.width}x${info.height}` : '',
    maxHeight: srcH,
    is4k: srcH >= 2160,
    qualities,
    defaultQuality,
    encoder: srcH >= 1440 || (info && info.vcodec === 'hevc') ? media.pickVideoEncoder(srcH, info) : '',
    vcodec: info ? info.vcodec : '',
    acodec: info ? info.acodec : '',
    subtitle,
    audioTracks: info?.audioTracks || [],
    defaultAudioTrack: info?.audioTracks?.find(t => t.default)?.index || 0,
    subtitleTracks: info?.subtitleTracks || [],
    playlist,
    ffmpeg: !!media.findFfmpeg(),
    next: item.episodes[epIndex + 1] ? epIndex + 1 : null,
    totalEpisodes: item.episodes.length,
    episodes: item.episodes.map((e) => ({
      index: e.index,
      name: e.name,
      episode: e.episode,
      season: e.season,
      trackTitle: e.songTitle || '',
      trackArtist: e.artist || ''
    })),
    // 来自 metadata 缓存（豆瓣/TMDB），缺失时为空串/空数组
    synopsis: meta.overview || '',
    originalTitle: meta.originalTitle || '',
    poster: meta.poster || '',
    backdrop: meta.backdrop || '',
    rating: meta.rating || 0,
    votes: meta.votes || 0,
    year: meta.year || 0,
    area: (meta.countries || [])[0] || '',
    genres: meta.genres || [],
    countries: meta.countries || [],
    cast: meta.cast || [],
    directors: meta.director || [],
    yearAreaGenres
  });
}

async function handleSubtitleTrack(req, res, url) {
  const item = findItem(url.searchParams.get('item'));
  const epIndex = Number(url.searchParams.get('ep') || 0);
  const index = Number(url.searchParams.get('track'));
  if (!item || !Number.isInteger(epIndex) || !item.episodes[epIndex]) return fail(res, '找不到视频', 404);
  const ep = item.episodes[epIndex];
  if (!isAllowedPath(ep.path)) return fail(res, '不允许的路径', 403);
  const input = providerOfPath(ep.path) === 'local' ? ep.path : `http://127.0.0.1:${PORT}/api/stream?path=${encodeURIComponent(ep.path)}`;
  const info = await media.probe(ep.path, ep.mtime, input);
  const track = info?.subtitleTracks?.find(t => t.index === index);
  if (!Number.isInteger(index) || !track || track.bitmap) return fail(res, '无效文本字幕轨');
  try {
    const text = await media.extractSubtitle(input, media.probeKey(ep.path, ep.mtime), index);
    if (res.destroyed) return;
    res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'private, max-age=3600' });
    res.end(text);
  } catch (e) { if (!res.destroyed) fail(res, e.message, 500); }
}

async function handleVideoPreview(req, res, url) {
  const item = findItem(url.searchParams.get('item'));
  const index = Number(url.searchParams.get('ep') || 0);
  const time = Number(url.searchParams.get('time'));
  if (!item || !Number.isInteger(index) || index < 0 || !item.episodes[index]) return fail(res, '找不到该视频', 404);
  const ep = item.episodes[index];
  if (media.isAudioFile(ep.path) || !isAllowedPath(ep.path)) return fail(res, '无法预览该文件', 403);
  if (!Number.isFinite(time) || time < 0 || time > 604800) return fail(res, '无效预览时间');
  const info = media.peekProbe(ep.path, ep.mtime);
  const position = info && info.duration ? Math.min(time, Math.max(0, info.duration - 1)) : time;
  const input = providerOfPath(ep.path) === 'local' ? ep.path : `http://127.0.0.1:${PORT}/api/stream?path=${encodeURIComponent(ep.path)}`;
  try {
    const data = await videoPreview.thumbnail({ filePath: ep.path, mtime: ep.mtime, url: input, time: position });
    if (res.destroyed) return;
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': data.length, 'Cache-Control': 'private, max-age=3600' });
    res.end(data);
  } catch (e) {
    if (!res.destroyed) fail(res, e.message, 503);
  }
}

async function handleSubtitle(req, res, url) {
  const p = url.searchParams.get('path');
  if (!p) return fail(res, '缺少 path');
  const ext = path.extname(p).toLowerCase();
  try {
    let buf;
    if (providerOfPath(p) === 'local') {
      buf = fs.readFileSync(p);
    } else {
      const r = await nas.streamRequest(nas.downloadUrl(p), nas.authHeaders());
      const chunks = [];
      for await (const c of r) chunks.push(c);
      buf = Buffer.concat(chunks);
    }
    const text = media.decodeText(buf);
    const vtt = ext === '.vtt' ? text : media.srtToVtt(text);
    res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(vtt);
  } catch (e) {
    fail(res, '字幕读取失败', 404);
  }
}

/* --------------------------------- 路由处理 -------------------------------- */

function libraryRows() {
  const items = allItems().map(decorate);
  // 「继续观看」是影视概念，音乐不进这一行（歌曲的续播位置在详情页里仍然保留）
  const prog = items
    .filter((i) => i.type !== 'music' && i.progress && i.progress.position > 30 && i.progress.percent < 95)
    .sort((a, b) => (b.progress.updatedAt || 0) - (a.progress.updatedAt || 0));

  const recent = [...items].sort((a, b) => b.mtime - a.mtime);
  const byType = (t) => items.filter((i) => i.type === t).sort((a, b) => b.mtime - a.mtime);
  const topRated = items.filter((i) => i.rating >= 7).sort((a, b) => b.rating - a.rating);

  const rows = [];
  if (prog.length) rows.push({ id: 'continue', title: '继续观看', items: prog.slice(0, 14) });
  if (recent.length) rows.push({ id: 'recent', title: '最近添加', items: recent.slice(0, 16) });
  const tv = byType('tv');
  if (tv.length) rows.push({ id: 'tv', title: '电视剧', items: tv.slice(0, 18) });
  const movie = byType('movie');
  if (movie.length) rows.push({ id: 'movie', title: '电影', items: movie.slice(0, 18) });
  const anime = byType('anime');
  if (anime.length) rows.push({ id: 'anime', title: '动漫', items: anime.slice(0, 18) });
  const variety = byType('variety');
  if (variety.length) rows.push({ id: 'variety', title: '综艺', items: variety.slice(0, 18) });
  const doc = byType('doc');
  if (doc.length) rows.push({ id: 'doc', title: '纪录片', items: doc.slice(0, 18) });
  const short = byType('short');
  if (short.length) rows.push({ id: 'short', title: '短剧', items: short.slice(0, 18) });
  const music = byType('music');
  if (music.length) rows.push({ id: 'music', title: '音乐', items: music.slice(0, 18) });
  if (topRated.length) rows.push({ id: 'top', title: '高分推荐', items: topRated.slice(0, 18) });

  const featured = [...items]
    .filter((i) => i.backdrop || i.poster)
    .sort((a, b) => (b.backdrop ? 1 : 0) - (a.backdrop ? 1 : 0) || b.mtime - a.mtime)
    .slice(0, 5);

  // 首页只显示每类前 18 个，分类页/搜索页需要全量：单独给一份 lists，别让「音乐 32 首只看得到 18 首」
  const lists = {
    all: items,
    tv,
    movie,
    anime,
    variety,
    doc,
    short,
    music
  };

  return { rows, featured, lists, total: items.length, updatedAt: S.library && S.library.updatedAt };
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const host = String(body.host || '').trim();
  const port = Number(body.port || 5001);
  const secure = body.https !== false;
  const account = String(body.account || '').trim();
  const password = String(body.password || '');
  const otp = String(body.otp || '').trim();

  if (!host || !account || !password) return fail(res, '请填写 IP、账号与密码');

  try {
    const s = await nas.login({ host, port, secure, account, password, otp });
    store.saveConfig({
      server: {
        host,
        port,
        https: s.secure,
        account,
        password: body.remember === false ? '' : password,
        sid: s.sid,
        token: s.token,
        hostname: s.hostname,
        remember: body.remember !== false
      }
    });
    let shares = [];
    try {
      shares = await nas.listShares();
    } catch (e) {
      shares = [];
    }
    json(res, { ok: true, hostname: s.hostname, host, port: s.secure ? 5001 : 5000, secure: s.secure, shares });
    if (!S.library || S.library.scanVersion !== scanner.SCAN_VERSION) setTimeout(() => runScan().catch(() => {}), 500);
  } catch (e) {
    fail(res, e.message, 401);
  }
}

async function handleBrowse(req, res, url) {
  const target = url.searchParams.get('path') || '';
  const provider = url.searchParams.get('provider') || 'nas';

  try {
    if (provider === 'local') {
      const root = target || os.homedir();
      const entries = await listDir({ provider: 'local' }, root);
      const folders = entries
        .filter((e) => e.isdir && !e.name.startsWith('.'))
        .map((e) => ({ name: e.name, path: e.path }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      const isMedia = (name) => scanner.VIDEO_EXT.has(path.extname(name).toLowerCase()) || scanner.AUDIO_EXT.has(path.extname(name).toLowerCase());
      const videoCount = entries.filter((e) => !e.isdir && isMedia(e.name)).length;
      return json(res, {
        ok: true,
        path: root,
        parent: path.dirname(root) === root ? '' : path.dirname(root),
        folders,
        videoCount,
        home: os.homedir()
      });
    }

    const session = await ensureSession();
    if (!target) {
      const shares = await nas.listShares();
      return json(res, {
        ok: true,
        path: '',
        parent: '',
        hostname: session.hostname,
        folders: shares.map((s) => ({ name: s.name, path: s.path })),
        videoCount: 0
      });
    }
    const entries = await nas.listFolder(target);
    const folders = entries
      .filter((e) => e.isdir && !/^(@|#|\.)/.test(e.name))
      .map((e) => ({ name: e.name, path: e.path }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    const isMedia = (name) => scanner.VIDEO_EXT.has(path.extname(name).toLowerCase()) || scanner.AUDIO_EXT.has(path.extname(name).toLowerCase());
    const videoCount = entries.filter((e) => !e.isdir && isMedia(e.name)).length;
    const parent = target.split('/').filter(Boolean).slice(0, -1).join('/');
    json(res, {
      ok: true,
      path: target,
      parent: parent ? `/${parent}` : '',
      folders,
      videoCount
    });
  } catch (e) {
    fail(res, e.message, 400);
  }
}

/** 封面文件优先级：poster/folder/cover 先，albumart 之类兜底 */
const COVER_ORDER = [
  'poster.jpg', 'folder.jpg', 'cover.jpg', 'poster.png', 'folder.png', 'cover.jpeg',
  'front.jpg', 'album.jpg', 'albumart.jpg', 'albumartsmall.jpg', 'fanart.jpg'
];

function pickCover(names) {
  const lower = names.map((n) => ({ raw: n, low: String(n).toLowerCase() }));
  const out = [];
  for (const want of COVER_ORDER) {
    const hit = lower.find((x) => x.low === want);
    if (hit) out.push(hit.raw);
  }
  return out;
}

/**
 * 目录里的封面图，按目录缓存。
 * 之前是「13 个文件名 × 每个音乐卡片各查一遍 NAS」，几十张卡能把首屏拖到好几秒。
 */
const coverDirCache = new Map();

async function findCover(dir) {
  if (coverDirCache.has(dir)) return coverDirCache.get(dir);
  let found = '';
  let names = [];
  try {
    if (providerOfPath(dir) === 'local') names = fs.readdirSync(dir);
    else names = (await withNas(() => nas.listFolder(dir))).filter((e) => !e.isdir).map((e) => e.name);
  } catch (e) {
    names = [];
  }
  const hit = pickCover(names)[0];
  if (hit) found = `${dir}/${hit}`;
  coverDirCache.set(dir, found);
  return found;
}

async function handleCover(req, res, url) {
  const id = url.searchParams.get('item');
  const item = findItem(id);
  if (!item || !item.episodes.length) return fail(res, '无封面', 404);
  const epIndex = Math.max(0, Number(url.searchParams.get('ep') || 0));
  const ep = item.episodes[epIndex] || item.episodes[0];
  const custom = songMetadata(item, ep);
  if (custom.cover) {
    res.setHeader('Cache-Control', 'no-store');
    if (custom.cover.startsWith('data:image/')) {
      const [header, encoded] = custom.cover.split(',');
      res.setHeader('Content-Type', header.slice(5).split(';')[0]);
      return res.end(Buffer.from(encoded, 'base64'));
    }
    const local = await metadata.cacheImage(custom.cover);
    if (!local) return fail(res, '封面获取失败', 404);
    return serveLocalFile(req, res, local);
  }
  const dir = path.dirname(ep.path);
  const candidate = await findCover(dir);

  if (candidate) {
    try {
      if (providerOfPath(candidate) === 'local') return serveLocalFile(req, res, candidate);
      const up = await nas.streamRequest(nas.downloadUrl(candidate), nas.authHeaders());
      if (up.statusCode === 200) {
        const chunks = [];
        for await (const c of up) chunks.push(c);
        const buf = Buffer.concat(chunks);
        res.writeHead(200, { 'Content-Type': mimeOf(candidate), 'Content-Length': buf.length, 'Cache-Control': 'max-age=86400' });
        return res.end(buf);
      }
    } catch (e) {
      /* 落到下面的兜底 */
    }
  }
  if (item.type === 'music') {
    try {
      const song = musicSongEntry(item, ep, epIndex);
      const online = await lyrics.findCover(song);
      const local = online ? await metadata.cacheImage(online) : null;
      if (local) return serveLocalFile(req, res, local);
    } catch (e) {
      // 匹配失败不影响播放，前端继续显示音乐图标。
    }
  }
  // fallback=0：调用方（播放页唱片）要自己决定怎么画，没封面就老实 404
  if (url.searchParams.get('fallback') === '0') return fail(res, '无封面', 404);

  // 没有封面图：直接给占位图，别让每张音乐卡都先吃一个 404（会闪黑）
  const seed = require('crypto').createHash('sha1').update(String(id || '')).digest('hex').slice(0, 8);
  res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=86400' });
  res.end(placeholderSVG(item.title, parseInt(seed, 16)));
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
    return res.end();
  }

  /* ------------------------------ API ------------------------------ */
  if (pathname.startsWith('/api/')) {
    try {
      if (pathname === '/api/state') {
        const cfg = store.config();
        const session = nas.getSession();
        const counts = {};
        for (const i of allItems()) counts[i.type] = (counts[i.type] || 0) + 1;
        return json(res, {
          ok: true,
          version: VERSION,
          connected: !!session,
          transport: nas.getTransport(),
          needLogin: false,
          hostname: (session && session.hostname) || cfg.server.hostname || '',
          server: {
            host: cfg.server.host,
            port: cfg.server.port,
            https: cfg.server.https,
            account: cfg.server.account,
            remember: cfg.server.remember
          },
          sources: cfg.sources,
          hasTmdb: metadata.hasKey(),
          tmdbKey: cfg.tmdbKey || '',
          proxy: net.systemProxy(),
          transcode: cfg.transcode !== false,
          providerName: metadata.providerName(),
          hasFfmpeg: !!media.findFfmpeg(),
          libraryReady: !!S.library,
          libraryUpdatedAt: (S.library && S.library.updatedAt) || 0,
          scanning: S.scanning,
          scanMsg: S.scanMsg,
          enriching: S.enriching,
          enrichMsg: S.enrichMsg,
          scanProgress: S.scanProgress,
          enrichProgress: S.enrichProgress,
          counts,
          total: allItems().length
        });
      }

      if (pathname === '/api/login' && req.method === 'POST') return handleLogin(req, res);

      if (pathname === '/api/logout' && req.method === 'POST') {
        nas.logout();
        store.saveConfig({ server: { sid: '', token: '' } });
        return json(res, { ok: true });
      }

      if (pathname === '/api/browse') return handleBrowse(req, res, url);

      if (pathname === '/api/discover') {
        const r = await nas.discoverDetailed({ force: url.searchParams.get('force') === '1' });
        return json(res, { ok: true, hosts: r.hosts, localIps: r.localIps.length ? r.localIps : lanAddresses(), blocked: r.blocked });
      }

      // 启动自检：给启动脚本用，把「连不上」的真实原因直接打到终端里
      if (pathname === '/api/selfcheck') {
        const cfg = store.config();
        const base = { host: cfg.server.host, port: cfg.server.port, https: cfg.server.https };
        try {
          await ensureSession();
          const shares = await nas.listShares();
          return json(res, {
            ok: true,
            ...base,
            hostname: nas.getSession().hostname || '',
            transport: nas.getTransport(),
            shares: shares.map((s) => s.path)
          });
        } catch (e) {
          return json(res, { ok: false, ...base, transport: nas.getTransport(), error: e.message, code: e.code || '' });
        }
      }

      if (pathname === '/api/sources' && req.method === 'POST') {
        const body = await readBody(req);
        const p = String(body.path || '').trim().replace(/\\/g, '/');
        if (!p) return fail(res, '请选择目录');
        const cfg = store.config();
        if (cfg.sources.some((s) => s.path === p)) return fail(res, '该目录已在媒体库中');
        const source = {
          id: `src_${Date.now().toString(36)}`,
          name: body.name || path.basename(p) || p,
          path: p,
          type: 'music',
          provider: body.provider === 'local' ? 'local' : 'nas'
        };
        cfg.sources.push(source);
        store.saveConfig({ sources: cfg.sources });
        json(res, { ok: true, source });
        setTimeout(() => runScan().catch(() => {}), 200);
        return undefined;
      }

      if (pathname === '/api/sources' && req.method === 'DELETE') {
        const id = url.searchParams.get('id');
        const cfg = store.config();
        cfg.sources = cfg.sources.filter((s) => s.id !== id);
        store.saveConfig({ sources: cfg.sources });
        if (S.library) {
          S.library.items = S.library.items.filter((i) => i.sourceId !== id);
          persistLibrary();
        }
        return json(res, { ok: true });
      }

      if (pathname === '/api/sources' && req.method === 'PUT') {
        const body = await readBody(req);
        const cfg = store.config();
        const src = cfg.sources.find((s) => s.id === body.id);
        if (!src) return fail(res, '目录不存在', 404);
        if (body.type) src.type = body.type;
        if (body.name) src.name = body.name;
        store.saveConfig({ sources: cfg.sources });
        return json(res, { ok: true, source: src });
      }

      if (pathname === '/api/scan' && req.method === 'POST') {
        if (S.scanning || S.enriching) return json(res, { ok: false, reason: '正在处理媒体库，请稍候' });
        if (!store.config().sources.length) return json(res, { ok: false, reason: '还没有添加媒体目录' });
        const body = await readBody(req);
        const sourceId = body.sourceId === undefined ? null : body.sourceId;
        if (sourceId !== null && (typeof sourceId !== 'string' || !sourceId.trim())) return fail(res, '媒体目录参数无效', 400);
        if (sourceId && !store.config().sources.some(source => source.id === sourceId)) return fail(res, '媒体目录不存在', 404);
        runScan(sourceId).catch(() => {});
        return json(res, { ok: true, started: true, sourceId });
      }

      // 一键匹配全部：把所有非音乐条目重新走一遍 豆瓣 / Bangumi / TVmaze / TMDB
      if (pathname === '/api/enrich' && req.method === 'POST') {
        if (S.enriching || S.scanning) return json(res, { ok: false, reason: '正在处理媒体库，请稍候' });
        let body = {};
        try {
          body = await readBody(req);
        } catch (e) {
          body = {};
        }
        const force = body.force !== false;
        const items = allItems();
        const count = items.filter((i) => i.type !== 'music').length;
        S.scanProgress = null;
        S.lastError = '';
        enrichAll(items, { force }).catch(() => {});
        return json(res, { ok: true, count });
      }

      if (pathname === '/api/scan/status') {
        return json(res, {
          ok: true,
          scanning: S.scanning,
          msg: S.scanMsg,
          enriching: S.enriching,
          enrichMsg: S.enrichMsg,
          scanProgress: S.scanProgress,
          enrichProgress: S.enrichProgress,
          total: allItems().length,
          error: S.lastError
        });
      }

      if (pathname === '/api/library') {
        if (!S.library) return json(res, { ok: true, empty: true, rows: [], featured: [], total: 0 });
        const data = libraryRows();
        return json(res, { ok: true, ...data, scanning: S.scanning, scanMsg: S.scanMsg });
      }

      if (pathname === '/api/music') return handleMusic(req, res, url);

      if (pathname === '/api/lyrics') return handleLyrics(req, res, url);

      if (pathname === '/api/item') {
        const id = url.searchParams.get('id');
        const item = findItem(id);
        if (!item) return fail(res, '找不到该影片', 404);
        const meta = metadata.getCached(item.id);
        // 多季剧：每一季单独取元数据（豆瓣按季分条目），首次打开会补抓一次，之后走缓存
        const seasonMeta = {};
        if (item.seasonCount > 1 && item.type !== 'movie' && item.type !== 'music') {
          const list = (item.seasons || []).map((s) => s.season);
          await Promise.all(list.map(async (sn) => {
            if (metadata.getCachedSeason(item, sn)) return;
            try {
              await metadata.matchSeason(item, sn);
            } catch (e) {
              /* 单季失败不影响整体 */
            }
          }));
          for (const sn of list) {
            const m = metadata.getCachedSeason(item, sn);
            if (m) seasonMeta[sn] = m;
          }
        }
        const prog = S.progress[item.id] || null;
        const similar = allItems()
          .filter((i) => i.id !== item.id && i.type === item.type)
          .slice(0, 12)
          .map(decorate);
        return json(res, {
          ok: true,
          item: { ...decorate(item), rawTitle: item.title },
          meta: meta || null,
          seasonMeta,
          episodes: item.episodes.map((e) => ({
            index: e.index,
            name: e.name,
            path: e.path,
            size: e.size,
            season: e.season,
            episode: e.episode,
            ext: e.ext,
            trackTitle: e.songTitle || '',
            trackArtist: e.artist || ''
          })),
          progress: prog,
          similar
        });
      }

      if (pathname === '/api/episode-titles') {
        const item = findItem(url.searchParams.get('item'));
        if (!item) return fail(res, '找不到该影片', 404);
        return json(res, { ok: true, titles: await metadata.getEpisodeTitles(item, { force: url.searchParams.get('refresh') === '1' }) });
      }
      if (pathname === '/api/play') return handlePlay(req, res, url);
      if (pathname === '/api/stream') return handleStream(req, res, url);
      if (pathname === '/api/transcode') return handleTranscode(req, res, url);
      if (pathname === '/api/subtitle-track') return handleSubtitleTrack(req, res, url);
      if (pathname === '/api/video-preview') return handleVideoPreview(req, res, url);
      if (pathname === '/api/subtitle') return handleSubtitle(req, res, url);
      if (pathname === '/api/music/match' && req.method === 'POST') {
        const body = await readBody(req);
        const title = String(body.title || '').trim().slice(0, 200);
        if (!title) return fail(res, '请输入歌名后再匹配', 400);
        const results = await lyrics.searchSongs({ title, artist: String(body.artist || '').trim().slice(0, 200), duration: Number(body.duration) || 0 });
        return json(res, { ok: true, results });
      }
      if (pathname === '/api/music/metadata' && req.method === 'GET') {
        const item = findItem(url.searchParams.get('item'));
        const ep = item && item.episodes[Number(url.searchParams.get('ep') || 0)];
        if (!item || item.type !== 'music' || !ep) return fail(res, '找不到歌曲', 404);
        return json(res, { ok: true, ...songMetadata(item, ep) });
      }
      if (pathname === '/api/music/metadata' && req.method === 'POST') {
        const body = await readBody(req);
        const item = findItem(body.itemId);
        const ep = item && item.episodes[body.ep];
        if (!item || item.type !== 'music' || !ep) return fail(res, '找不到歌曲', 404);
        const title = String(body.title || '').trim().slice(0, 200);
        if (!title) return fail(res, '请输入歌名', 400);
        const cover = String(body.cover || '').trim();
        if (cover && !/^https?:\/\//i.test(cover) && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(cover)) return fail(res, '请使用图片网址或 PNG、JPEG、WebP 图片', 400);
        const records = { ...store.read('music-metadata.json', {}) };
        records[ep.path] = { title, artist: String(body.artist || '').trim().slice(0, 200), album: String(body.album || '').trim().slice(0, 200), cover, updated: Date.now() };
        store.write('music-metadata.json', records);
        return json(res, { ok: true, song: musicSongEntry(item, ep, Number(body.ep)) });
      }

      if (pathname === '/api/cover') return handleCover(req, res, url);

      if (pathname === '/api/progress' && req.method === 'POST') {
        const body = await readBody(req);
        if (!body.itemId) return fail(res, '缺少 itemId');
        S.progress[body.itemId] = {
          epIndex: Number(body.epIndex || 0),
          position: Number(body.position || 0),
          duration: Number(body.duration || 0),
          updatedAt: Date.now()
        };
        persistProgress();
        return json(res, { ok: true });
      }

      if (pathname === '/api/progress' && req.method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (id) delete S.progress[id];
        else S.progress = {};
        persistProgress();
        return json(res, { ok: true });
      }

      if (pathname === '/api/settings' && req.method === 'POST') {
        const body = await readBody(req);
        const patch = {};
        if (typeof body.tmdbKey === 'string') patch.tmdbKey = body.tmdbKey.trim();
        if (typeof body.ffmpeg === 'string') patch.ffmpeg = body.ffmpeg.trim();
        if (typeof body.transcode === 'boolean') patch.transcode = body.transcode;
        if (body.server && typeof body.server === 'object') {
          const s = body.server;
          patch.server = { sid: '', token: '' };
          if (s.host) patch.server.host = String(s.host).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
          if (s.port) patch.server.port = Number(s.port);
          if (typeof s.https === 'boolean') patch.server.https = s.https;
        }
        store.saveConfig(patch);
        if (patch.tmdbKey) {
          setTimeout(() => enrichAll(allItems()).catch(() => {}), 200);
        }
        return json(res, {
          ok: true,
          hasTmdb: metadata.hasKey(),
          hasFfmpeg: !!media.findFfmpeg(),
          ffmpegPath: media.findFfmpeg()
        });
      }

      if (pathname === '/api/rematch/search' && req.method === 'POST') {
        const body = await readBody(req);
        const item = findItem(body.itemId);
        if (!item) return fail(res, '找不到该影片', 404);
        const kind = body.type || (item.type === 'movie' ? 'movie' : 'tv');
        const list = await metadata.searchCandidates(body.query || item.title, kind, body.provider);
        return json(res, { ok: true, results: list });
      }

      if (pathname === '/api/rematch/apply' && req.method === 'POST') {
        const body = await readBody(req);
        const item = findItem(body.itemId);
        if (!item) return fail(res, '找不到该影片', 404);
        const meta = await metadata.applyCandidate(item, body.id, body.type || 'tv', body.provider || 'douban');
        persistLibrary();
        return json(res, { ok: true, meta });
      }

      if (pathname === '/api/img') {
        const u = url.searchParams.get('u');
        if (!u) return fail(res, '缺少图片地址', 400);
        const local = await metadata.cacheImage(u);
        if (!local) return fail(res, '图片获取失败', 404);
        res.writeHead(200, {
          'Content-Type': mimeOf(local),
          'Content-Length': fs.statSync(local).size,
          'Cache-Control': 'max-age=604800'
        });
        return res.end(fs.readFileSync(local));
      }

      if (pathname === '/api/placeholder') {
        // 生成渐变占位图（无网络/无 TMDB 时使用）
        const text = (url.searchParams.get('t') || '云影').slice(0, 12);
        const seed = Number(url.searchParams.get('s') || 1);
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=86400' });
        return res.end(placeholderSVG(text, seed));
      }

      return fail(res, '接口不存在', 404);
    } catch (e) {
      const status = e.code === 'NEED_LOGIN' ? 401 : 500;
      return fail(res, e.message || '服务器错误', status, { needLogin: e.code === 'NEED_LOGIN' });
    }
  }

  /* ---------------------------- 静态资源 ---------------------------- */
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, path.normalize(filePath).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) return fail(res, '禁止访问', 403);

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      if (!path.extname(filePath)) {
        // SPA 回退
        return serveLocalFile(req, res, path.join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8');
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304);
      return res.end();
    }
    res.writeHead(200, {
      'Content-Type': mimeOf(filePath),
      'Content-Length': stat.size,
      // 前端资源一律走协商缓存：改了文件必须立刻生效，不能再吃 1 小时强缓存
      'Cache-Control': 'no-cache',
      ETag: etag
    });
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.end());
    stream.pipe(res);
  });
  return undefined;
}

/* --------------------------------- 启动 ---------------------------------- */

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

bootSession();

// 启动时若没有有效 sid，但保存了账号密码，就静默重登一次，
// 这样打开应用直接进媒体库，不用每次手动点登录。
setTimeout(() => {
  const cfg = store.config();
  if (!nas.getSession() && cfg.server.host && cfg.server.account && cfg.server.password && cfg.server.remember) {
    ensureSession().catch(() => {});
  }
}, 300);

const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    try {
      fail(res, e.message || '服务器错误', 500);
    } catch (err) {
      /* ignore */
    }
  });
});

server.listen(PORT, HOST, () => {
  if (S.library && S.library.scanVersion !== scanner.SCAN_VERSION) {
    setTimeout(() => runScan().catch(() => {}), 500);
  }
  const ff = media.findFfmpeg();
  console.log('');
  console.log('  云影 · NAS 媒体中心已启动');
  console.log(`  本机访问:  http://127.0.0.1:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  局域网:    http://${ip}:${PORT}`);
  console.log(`  ffmpeg:    ${ff || '未检测到（MKV 等格式可能无法播放）'}`);
  console.log('');
});

process.on('SIGINT', () => {
  persistLibrary();
  process.exit(0);
});
process.on('uncaughtException', (e) => {
  console.error('[uncaught]', e.message);
});
