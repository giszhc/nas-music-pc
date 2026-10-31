'use strict';
/**
 * 极简 JSON 存储：配置 / 媒体库缓存 / 元数据缓存 / 播放进度
 * 无第三方依赖，原子写入，进程内缓存。
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.YUNYING_DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULTS = {
  version: 1,
  port: 8787,
  server: {
    host: '',
    port: 5001,
    https: true,
    account: '',
    password: '',
    sid: '',
    hostname: '',
    remember: true,
    provider: 'nas'
  },
  sources: [],
  tmdbKey: '',
  ffmpeg: '',
  transcode: true,
  preferOriginal: true
};

const cache = new Map();

function fileOf(name) {
  return path.join(DATA_DIR, name);
}

function read(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  let value = fallback;
  try {
    value = JSON.parse(fs.readFileSync(fileOf(name), 'utf8'));
  } catch (e) {
    value = fallback;
  }
  cache.set(name, value);
  return value;
}

function write(name, value) {
  cache.set(name, value);
  const target = fileOf(name);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, target);
}

function isPlain(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function merge(base, patch) {
  const out = Object.assign({}, base);
  for (const k of Object.keys(patch || {})) {
    if (isPlain(out[k]) && isPlain(patch[k])) out[k] = merge(out[k], patch[k]);
    else out[k] = patch[k];
  }
  return out;
}

function config() {
  const saved = read('config.json', null);
  if (!saved) {
    write('config.json', DEFAULTS);
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  const merged = merge(DEFAULTS, saved);
  if (!Array.isArray(merged.sources)) merged.sources = [];
  return merged;
}

function saveConfig(patch) {
  const next = merge(config(), patch || {});
  write('config.json', next);
  return next;
}

module.exports = { config, saveConfig, read, write, DATA_DIR, DEFAULTS };
