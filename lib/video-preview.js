'use strict';
const { execFile } = require('child_process');
const media = require('./media');

// 预览按两秒复用，限制内存和并发，避免快速移动鼠标抢占播放资源。
const cache = new Map();
const pending = new Map();
let active = 0;
const queue = [];
function extract(url, time) {
  return new Promise((resolve, reject) => {
    const run = () => {
      active++;
      const env = { ...process.env, NO_PROXY: '*', no_proxy: '*' };
      for (const key of ['http_proxy', 'https_proxy', 'all_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) delete env[key];
      execFile(media.findFfmpeg(), ['-hide_banner', '-loglevel', 'error', '-threads', '1', '-ss', String(time), '-i', url,
        '-map', '0:v:0', '-frames:v', '1', '-an', '-sn', '-vf', 'scale=240:136:force_original_aspect_ratio=decrease,pad=240:136:(ow-iw)/2:(oh-ih)/2',
        '-threads', '1', '-c:v', 'mjpeg', '-q:v', '5', '-f', 'image2pipe', 'pipe:1'],
      { encoding: 'buffer', timeout: 12000, maxBuffer: 1024 * 1024, env }, (error, data) => {
        active--;
        if (queue.length) queue.shift()();
        if (error || !data || data.length < 4) reject(new Error('预览暂不可用'));
        else resolve(data);
      });
    };
    if (active < 2) run();
    else if (queue.length < 8) queue.push(run);
    else reject(new Error('预览繁忙'));
  });
}
async function thumbnail({ filePath, mtime = 0, url, time }) {
  if (!media.findFfmpeg()) throw new Error('未检测到 ffmpeg');
  if (!Number.isFinite(time) || time < 0) throw new Error('无效预览时间');
  const timestamp = Math.floor(time / 2) * 2;
  const key = JSON.stringify([filePath, mtime, timestamp]);
  if (cache.has(key)) {
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value);
    return value;
  }
  if (pending.has(key)) return pending.get(key);
  const job = extract(url, timestamp).then(data => {
    cache.set(key, data);
    while (cache.size > 256) cache.delete(cache.keys().next().value);
    return data;
  }).finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
module.exports = { thumbnail };
