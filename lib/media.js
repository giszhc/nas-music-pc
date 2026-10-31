'use strict';
/**
 * 播放能力：ffprobe 探测、播放方式决策、ffmpeg 实时封装/转码、字幕转换
 * 目标：MKV 等浏览器不支持的容器也能直接播（优先无损封装，必要时转码）
 */
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const crypto = require('crypto');
const store = require('./store');

const probeCache = store.read('probe.json', {});
let probeTimer = null;

function persistProbe() {
  clearTimeout(probeTimer);
  probeTimer = setTimeout(() => {
    try {
      store.write('probe.json', probeCache);
    } catch (e) {
      /* ignore */
    }
  }, 1200);
}

const CANDIDATES = [
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/usr/bin/ffmpeg',
  '/opt/local/bin/ffmpeg'
];

let cachedFfmpeg = null;

function findFfmpeg() {
  const configured = (store.config().ffmpeg || '').trim();
  if (configured && fs.existsSync(configured)) return configured;
  if (cachedFfmpeg && fs.existsSync(cachedFfmpeg)) return cachedFfmpeg;
  for (const c of CANDIDATES) {
    if (fs.existsSync(c)) {
      cachedFfmpeg = c;
      return c;
    }
  }
  return '';
}

function ffprobePath() {
  const ff = findFfmpeg();
  if (!ff) return '';
  const guess = ff.replace(/ffmpeg$/, 'ffprobe');
  if (fs.existsSync(guess)) return guess;
  for (const c of ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe', '/usr/bin/ffprobe']) {
    if (fs.existsSync(c)) return c;
  }
  return '';
}

/**
 * ffmpeg / ffprobe 只拉本机回环（/api/stream）或本地文件，绝不能继承系统代理，
 * 否则请求会被丢给代理并返回 502 —— 表现就是「探测不到时长、转码 0 字节」。
 */
function childEnv() {
  const env = Object.assign({}, process.env);
  for (const k of ['http_proxy', 'https_proxy', 'all_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) {
    delete env[k];
  }
  env.NO_PROXY = '*';
  env.no_proxy = '*';
  return env;
}

function runProbe(url, timeout = 20000) {
  const bin = ffprobePath();
  if (!bin) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      bin,
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        '-analyzeduration',
        '3000000',
        '-probesize',
        '5000000',
        url
      ],
      { timeout, maxBuffer: 8 * 1024 * 1024, env: childEnv() },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          resolve(null);
        }
      }
    );
  });
}

function probeKey(filePath, mtime) {
  return crypto.createHash('sha1').update(`${filePath}|${mtime}`).digest('hex');
}

/** 只读缓存：音乐列表要显示时长，但不能为了 32 首歌阻塞一次 HTTP 请求 */
function peekProbe(filePath, mtime) {
  return probeCache[probeKey(filePath, mtime)] || null;
}

async function probe(filePath, mtime, url) {
  const key = probeKey(filePath, mtime);
  if (probeCache[key] && Array.isArray(probeCache[key].audioTracks)) return probeCache[key];
  const raw = await runProbe(url);
  if (!raw) return null;
  const streams = raw.streams || [];
  const v = streams.find((s) => s.codec_type === 'video');
  const a = streams.find((s) => s.codec_type === 'audio');
  const info = {
    vcodec: v ? v.codec_name : '',
    acodec: a ? a.codec_name : '',
    width: v ? v.width : 0,
    height: v ? v.height : 0,
    duration: raw.format && raw.format.duration ? Number(raw.format.duration) : 0,
    container: raw.format && raw.format.format_name ? raw.format.format_name : '',
    audioTracks: streams.filter(s => s.codec_type === 'audio').map((s, index) => ({ index, codec: s.codec_name, language: s.tags?.language || '', title: s.tags?.title || '', channels: s.channels || 0, default: !!s.disposition?.default })),
    subtitleTracks: streams.filter(s => s.codec_type === 'subtitle').map((s, index) => ({ index, codec: s.codec_name, language: s.tags?.language || '', title: s.tags?.title || '', bitmap: ['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'xsub'].includes(s.codec_name), default: !!s.disposition?.default })),
    subtitleCount: streams.filter((s) => s.codec_type === 'subtitle').length
  };
  probeCache[key] = info;
  persistProbe();
  return info;
}

const DIRECT_EXT = new Set(['.mp4', '.m4v', '.webm']);
const SAFE_V = new Set(['h264', 'hevc', 'vp9', 'vp8', 'av1']);
const SAFE_A = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);

/* ------------------------------- 音频 ------------------------------- */

const AUDIO_EXT = new Set([
  '.mp3', '.m4a', '.m4b', '.aac', '.flac', '.wav', '.wave', '.ogg', '.oga', '.opus',
  '.wma', '.ape', '.alac', '.aiff', '.aif', '.aifc', '.dsf', '.dff', '.wv', '.mpc',
  '.mka', '.amr', '.ac3', '.dts', '.mid', '.tak', '.tta', '.spx'
]);

/** 浏览器能直接放的音频容器/编码 */
const AUDIO_DIRECT = new Set(['.mp3', '.m4a', '.m4b', '.aac', '.flac', '.wav', '.wave', '.ogg', '.oga', '.opus', '.mp4', '.webm']);

function isAudioFile(p) {
  return AUDIO_EXT.has(path.extname(String(p || '')).toLowerCase());
}

/** 音频播放方式：能直连就直连，APE/WMA/DSD/ALAC 这类交给 ffmpeg 转 AAC */
function decideAudioMode(ext, info) {
  const codec = (info && info.acodec) || '';
  if (AUDIO_DIRECT.has(ext)) {
    if (!codec) return 'direct';
    if (codec === 'alac') return findFfmpeg() ? 'transcode' : 'unsupported';
    return 'direct';
  }
  return findFfmpeg() ? 'transcode' : 'unsupported';
}

function audioArgs({ url, start }) {
  const args = ['-hide_banner', '-loglevel', 'error'];
  if (start > 0) args.push('-ss', String(Math.max(0, start)));
  args.push('-i', url, '-vn', '-map', '0:a:0');
  args.push('-c:a', 'libmp3lame', '-b:a', '192k', '-ac', '2');
  args.push('-f', 'mp3', 'pipe:1');
  return args;
}

function startAudioTranscode({ url, start = 0 }) {
  const bin = findFfmpeg();
  if (!bin) throw new Error('未检测到 ffmpeg，无法转码播放');
  const proc = spawn(bin, audioArgs({ url, start }), {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv()
  });
  let stderr = '';
  proc.stderr.on('data', (d) => {
    stderr += d.toString();
    if (stderr.length > 4000) stderr = stderr.slice(-2000);
  });
  return { proc, getStderr: () => stderr };
}


/**
 * @returns {'direct'|'remux'|'transcode'|'unsupported'}
 */
function decideMode(ext, info) {
  const ffmpeg = findFfmpeg();
  const v = (info && info.vcodec) || '';
  const a = (info && info.acodec) || '';
  const extOk = DIRECT_EXT.has(ext);

  if (extOk && (!info || (SAFE_V.has(v) && SAFE_A.has(a)))) return 'direct';
  if (!ffmpeg) return extOk ? 'direct' : 'unsupported';
  if (v === 'h264' && (a === 'aac' || a === 'mp3')) return 'remux';
  if (!info && (ext === '.mkv' || ext === '.mov')) return 'remux';
  if (!v) return 'unsupported';
  return 'transcode';
}

/**
 * 画质档位：4K / 1080P / 720P / 480P
 * 4K 用较高码率，保证 H.264 下细节还在；实际输出高度不会超过源分辨率。
 */
const QUALITIES = [
  { id: '2160', label: '4K', height: 2160, bitrate: '25000k', maxrate: '32000k', bufsize: '48000k', audio: '256k' },
  { id: '1080', label: '1080P', height: 1080, bitrate: '8000k', maxrate: '10000k', bufsize: '16000k', audio: '192k' },
  { id: '720', label: '720P', height: 720, bitrate: '4000k', maxrate: '5000k', bufsize: '8000k', audio: '128k' },
  { id: '480', label: '480P', height: 480, bitrate: '1500k', maxrate: '2000k', bufsize: '3000k', audio: '128k' }
];

let encoderCache = null;

/** 探测 ffmpeg 支持哪些编码器（macOS 上 h264_videotoolbox 是硬编，4K 实时转码靠它） */
function hasEncoder(name) {
  if (!encoderCache) {
    encoderCache = new Set();
    try {
      const out = require('child_process').execFileSync(findFfmpeg(), ['-hide_banner', '-encoders'], {
        encoding: 'utf8',
        timeout: 8000
      });
      for (const line of out.split('\n')) {
        const m = /^\s*[VAS][F.][S.][X.][B.][D.]\s+(\S+)/.exec(line);
        if (m) encoderCache.add(m[1]);
      }
    } catch (e) {
      /* ignore */
    }
  }
  return encoderCache.has(name);
}

/** 按目标高度挑编码器：4K/HEVC 优先硬件编码，保证实时 */
function pickVideoEncoder(targetHeight, info) {
  const isMac = process.platform === 'darwin';
  const sourceIsHevc = info && info.vcodec === 'hevc';
  if (isMac && (targetHeight >= 1440 || sourceIsHevc) && hasEncoder('h264_videotoolbox')) {
    return 'h264_videotoolbox';
  }
  return 'libx264';
}

/** 该文件可选的画质（不超过源分辨率） */
function availableQualities(info) {
  const h = (info && info.height) || 0;
  const list = QUALITIES.filter((q) => !h || q.height <= h);
  if (!list.length) list.push(QUALITIES[QUALITIES.length - 1]);
  return list.map((q) => ({ id: q.id, label: q.label, height: q.height }));
}

function ffmpegArgs({ url, start, mode, info, quality, audioTrack = 0, subtitleTrack = null }) {
  const args = ['-hide_banner', '-loglevel', 'error'];
  if (start > 0) args.push('-ss', String(Math.max(0, start)));
  args.push('-i', url);
  if (subtitleTrack !== null) args.push('-filter_complex', `[0:v:0][0:s:${subtitleTrack}]overlay[vsub]`, '-map', '[vsub]');
  else args.push('-map', '0:v:0');
  args.push('-map', `0:a:${audioTrack}?`);

  if (mode === 'remux') {
    args.push('-c', 'copy');
    // TS 的 ADTS AAC 必须转换为 MP4 AudioSpecificConfig，碎片 MP4 不会自动补齐。
    if (info && info.acodec === 'aac') args.push('-bsf:a', 'aac_adtstoasc');
    // MKV 里的 HEVC 通常带 hev1 标记，浏览器只认 hvc1，重封装时改掉才能播
    if (info && info.vcodec === 'hevc') args.push('-tag:v', 'hvc1');
  } else {
    const srcH = (info && info.height) || 1080;
    const srcW = (info && info.width) || 1920;
    const want = QUALITIES.find((q) => q.id === String(quality));
    const targetH = quality === 'source' ? srcH : Math.min(want ? want.height : Math.min(srcH, 2160), srcH);
    const q = [...QUALITIES].reverse().find((x) => x.height >= targetH) || QUALITIES[0];
    const enc = pickVideoEncoder(targetH, info);

    if (enc === 'h264_videotoolbox') {
      args.push('-c:v', 'h264_videotoolbox', '-b:v', q.bitrate, '-maxrate', q.maxrate, '-bufsize', q.bufsize);
      args.push('-profile:v', 'high', '-pix_fmt', 'yuv420p', '-allow_sw', '1');
    } else {
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', targetH >= 2160 ? '18' : '20');
      args.push('-profile:v', 'high', '-pix_fmt', 'yuv420p');
      args.push('-maxrate', q.maxrate, '-bufsize', q.bufsize);
    }
    if (targetH < srcH) args.push('-vf', `scale=-2:${targetH}`);
    else if (srcW > 3840 && quality !== 'source') args.push('-vf', 'scale=3840:-2');
    // 固定关键帧间隔，拖动进度时切片更准
    args.push('-g', '48', '-keyint_min', '48', '-sc_threshold', '0');
    args.push('-c:a', 'aac', '-b:a', q.audio, '-ac', '2');
  }
  args.push('-movflags', '+frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');
  return args;
}

function startTranscode({ url, start = 0, mode = 'remux', info, quality, audioTrack = 0, subtitleTrack = null }) {
  const bin = findFfmpeg();
  if (!bin) throw new Error('未检测到 ffmpeg，无法转码播放');
  const proc = spawn(bin, ffmpegArgs({ url, start, mode, info, quality, audioTrack, subtitleTrack }), {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv()
  });
  let stderr = '';
  proc.stderr.on('data', (d) => {
    stderr += d.toString();
    if (stderr.length > 4000) stderr = stderr.slice(-2000);
  });
  return { proc, getStderr: () => stderr };
}

const subtitleJobs = new Map();
let subtitleActive = 0;
const subtitleQueue = [];
function extractSubtitle(url, key, index) {
  const cacheKey = `${key}:${index}`;
  if (subtitleJobs.has(cacheKey)) return subtitleJobs.get(cacheKey);
  const job = new Promise((resolve, reject) => {
    const run = () => {
      const bin = findFfmpeg();
      if (!bin) return reject(new Error('未检测到 ffmpeg'));
      subtitleActive++;
      execFile(bin, ['-v', 'error', '-i', url, '-map', `0:s:${index}`, '-f', 'webvtt', 'pipe:1'],
        { timeout: 45000, maxBuffer: 8 * 1024 * 1024, env: childEnv() }, (err, stdout) => {
          subtitleActive--;
          if (subtitleQueue.length) subtitleQueue.shift()();
          if (err) reject(new Error('字幕提取失败'));
          else resolve(stdout);
        });
    };
    if (subtitleActive < 2) run();
    else if (subtitleQueue.length < 4) subtitleQueue.push(run);
    else reject(new Error('字幕提取繁忙，请稍后重试'));
  });
  subtitleJobs.set(cacheKey, job);
  job.catch(() => subtitleJobs.delete(cacheKey));
  while (subtitleJobs.size > 12) subtitleJobs.delete(subtitleJobs.keys().next().value);
  return job;
}

function decodeText(buf) {
  let text = buf.toString('utf8');
  if (text.includes('\uFFFD')) {
    try {
      text = new TextDecoder('gbk').decode(buf);
    } catch (e) {
      /* 保留 utf8 */
    }
  }
  return text.replace(/^\uFEFF/, '');
}

function srtToVtt(input) {
  const body = input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\d+\s*\n/gm, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .replace(/\{\\[^}]*\}/g, '')
    .trim();
  return `WEBVTT\n\n${body}\n`;
}

/** 查找同名字幕（本地目录可直接读；NAS 由调用方先取到文本） */
function findLocalSubtitle(videoPath) {
  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath, path.extname(videoPath));
  const exts = ['.srt', '.vtt', '.ass', '.ssa'];
  try {
    const files = fs.readdirSync(dir);
    for (const ext of exts) {
      const hit = files.find((f) => f.toLowerCase() === (base + ext).toLowerCase());
      if (hit) return path.join(dir, hit);
    }
    const loose = files.find((f) => exts.some((e) => f.toLowerCase().endsWith(e)) && f.toLowerCase().startsWith(base.slice(0, 6).toLowerCase()));
    return loose ? path.join(dir, loose) : '';
  } catch (e) {
    return '';
  }
}

module.exports = {
  findFfmpeg,
  extractSubtitle,
  ffprobePath,
  probe,
  probeKey,
  peekProbe,
  decideMode,
  startTranscode,
  availableQualities,
  pickVideoEncoder,
  srtToVtt,
  decodeText,
  findLocalSubtitle,
  AUDIO_EXT,
  isAudioFile,
  decideAudioMode,
  startAudioTranscode
};
