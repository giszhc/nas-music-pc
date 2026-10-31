'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const media = require('../lib/media');

test('TS 的 ADTS AAC 可无损封装为可解码的碎片 MP4', { skip: !media.findFfmpeg() }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yy-remux-'));
  try {
    const input = path.join(dir, 'input.ts');
    execFileSync(media.findFfmpeg(), ['-v', 'error', '-f', 'lavfi', '-i', 'color=size=128x72:rate=25',
      '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '1', '-c:v', 'libx264', '-c:a', 'aac', '-f', 'mpegts', input]);
    const h = media.startTranscode({ url: input, mode: 'remux', info: { vcodec: 'h264', acodec: 'aac' } });
    const chunks = [];
    h.proc.stdout.on('data', d => chunks.push(d));
    const code = await new Promise((resolve, reject) => { h.proc.on('error', reject); h.proc.on('close', resolve); });
    assert.equal(code, 0, h.getStderr());
    const output = path.join(dir, 'output.mp4');
    fs.writeFileSync(output, Buffer.concat(chunks));
    execFileSync(media.findFfmpeg(), ['-v', 'error', '-i', output, '-f', 'null', '-']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
