'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const media = require('../lib/media');

test('H.265 兼容转码输出同分辨率 H.264，而非再次输出 H.265', { skip: !media.findFfmpeg() }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yy-hevc-'));
  try {
    const input = path.join(dir, 'hevc.mp4');
    execFileSync(media.findFfmpeg(), ['-v', 'error', '-f', 'lavfi', '-i', 'color=size=160x90:rate=10', '-t', '2', '-c:v', 'libx265', '-x265-params', 'pools=1:frame-threads=1:log-level=error', '-tag:v', 'hvc1', input]);
    const h = media.startTranscode({ url: input, mode: 'transcode', quality: 'source', info: { vcodec: 'hevc', width: 160, height: 90 } });
    const chunks = [];
    h.proc.stdout.on('data', d => chunks.push(d));
    const code = await new Promise((resolve, reject) => { h.proc.on('close', resolve); h.proc.on('error', reject); });
    assert.equal(code, 0, h.getStderr());
    const output = path.join(dir, 'h264.mp4');
    fs.writeFileSync(output, Buffer.concat(chunks));
    const result = JSON.parse(execFileSync(media.ffprobePath(), ['-v', 'error', '-show_streams', '-of', 'json', output]));
    assert.equal(result.streams[0].codec_name, 'h264');
    assert.equal(result.streams[0].width, 160);
    assert.equal(result.streams[0].height, 90);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
