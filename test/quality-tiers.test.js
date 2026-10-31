'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const media = require('../lib/media');
test('画质档位包含真实的 480P，不列出高于源分辨率的常规档位', () => {
  assert.deepEqual(media.availableQualities({ height: 1080 }).map(q => q.id), ['1080', '720', '480']);
  assert.deepEqual(media.availableQualities({ height: 720 }).map(q => q.id), ['720', '480']);
});
test('480P 输出真正缩放到 480，并使用对应码率档位', { skip: !media.findFfmpeg() }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yy-quality-'));
  try {
    const input = path.join(dir, 'source.mp4');
    execFileSync(media.findFfmpeg(), ['-v', 'error', '-f', 'lavfi', '-i', 'color=size=1280x720:rate=10', '-t', '1', '-c:v', 'libx264', input]);
    const h = media.startTranscode({ url: input, mode: 'transcode', quality: '480', info: { vcodec: 'h264', width: 1280, height: 720 } });
    const chunks = [];
    h.proc.stdout.on('data', d => chunks.push(d));
    const code = await new Promise((resolve, reject) => { h.proc.on('close', resolve); h.proc.on('error', reject); });
    assert.equal(code, 0, h.getStderr());
    const output = path.join(dir, '480.mp4');
    fs.writeFileSync(output, Buffer.concat(chunks));
    const result = JSON.parse(execFileSync(media.ffprobePath(), ['-v', 'error', '-show_streams', '-of', 'json', output]));
    assert.equal(result.streams[0].height, 480);
    assert.equal(result.streams[0].codec_name, 'h264');
    const maxrateIndex = h.proc.spawnargs.indexOf('-maxrate');
    assert.equal(h.proc.spawnargs[maxrateIndex + 1], '2000k');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
