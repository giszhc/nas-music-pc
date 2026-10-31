'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const media = require('../lib/media');
const { thumbnail } = require('../lib/video-preview');

test('视频预览输出 JPEG，同时间段合并请求与缓存，文件更新后重新取帧', { skip: !media.findFfmpeg() }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yy-preview-'));
  try {
    const input = path.join(dir, 'sample.mp4');
    execFileSync(media.findFfmpeg(), ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=5', '-t', '5', '-c:v', 'libx264', input]);
    const args = { filePath: input, mtime: 1, url: input, time: 2.1 };
    const [first, same] = await Promise.all([thumbnail(args), thumbnail({ ...args, time: 3.8 })]);
    assert.equal(first, same);
    assert.equal(first[0], 0xff);
    assert.equal(first[1], 0xd8);
    assert.equal(await thumbnail(args), first);
    const changed = await thumbnail({ ...args, mtime: 2 });
    assert.notEqual(changed, first);
    const jpeg = path.join(dir, 'preview.jpg');
    fs.writeFileSync(jpeg, first);
    const result = JSON.parse(execFileSync(media.ffprobePath(), ['-v', 'error', '-show_streams', '-of', 'json', jpeg]));
    assert.equal(result.streams[0].width, 240);
    assert.equal(result.streams[0].height, 136);
    await assert.rejects(thumbnail({ ...args, time: NaN }), /无效/);
    await assert.rejects(thumbnail({ ...args, time: -1 }), /无效/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
