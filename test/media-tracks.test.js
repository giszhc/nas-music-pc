'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const isolatedData = fs.mkdtempSync(path.join(os.tmpdir(), 'yy-track-data-'));
process.env.YUNYING_DATA_DIR = isolatedData;
const media = require('../lib/media');
test.after(async () => { await new Promise(r => setTimeout(r, 1400)); fs.rmSync(isolatedData, { recursive: true, force: true }); });

test('多音轨、多字幕探测，选择第二音轨与中文字幕', { skip: !media.findFfmpeg() }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yy-tracks-'));
  try {
    for (const [name, text] of [['en', 'Hello'], ['zh', '你好']]) fs.writeFileSync(path.join(dir, name + '.srt'), `1\n00:00:00,000 --> 00:00:04,000\n${text}\n`);
    const input = path.join(dir, 'multi.mkv');
    execFileSync(media.findFfmpeg(), ['-v', 'error', '-f', 'lavfi', '-i', 'color=size=160x90:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440', '-f', 'lavfi', '-i', 'sine=frequency=880', '-i', path.join(dir, 'en.srt'), '-i', path.join(dir, 'zh.srt'), '-map', '0:v', '-map', '1:a', '-map', '2:a', '-map', '3:s', '-map', '4:s', '-t', '4', '-c:v', 'libx264', '-c:a', 'aac', '-c:s', 'srt', '-metadata:s:a:0', 'language=eng', '-metadata:s:a:1', 'language=zho', '-disposition:a:0', '0', '-disposition:a:1', 'default', '-metadata:s:s:0', 'language=eng', '-metadata:s:s:1', 'language=zho', input]);
    const info = await media.probe(input, 1, input);
    assert.equal(info.audioTracks.length, 2);
    assert.equal(info.audioTracks[1].language, 'zho');
    assert.equal(info.audioTracks[1].default, true);
    assert.equal(info.subtitleTracks.length, 2);
    assert.equal(info.subtitleTracks[1].bitmap, false);
    const vtt = await media.extractSubtitle(input, input, 1);
    assert.match(vtt, /^WEBVTT/);
    assert.match(vtt, /你好/);
    assert.doesNotMatch(vtt, /Hello/);
    const h = media.startTranscode({ url: input, mode: 'remux', info, audioTrack: 1, start: 1 });
    const chunks = [];
    h.proc.stdout.on('data', d => chunks.push(d));
    const code = await new Promise((resolve, reject) => { h.proc.on('close', resolve); h.proc.on('error', reject); });
    assert.equal(code, 0, h.getStderr());
    const output = path.join(dir, 'second.mp4');
    fs.writeFileSync(output, Buffer.concat(chunks));
    const result = JSON.parse(execFileSync(media.ffprobePath(), ['-v', 'error', '-show_streams', '-of', 'json', output]));
    const audio = result.streams.filter(s => s.codec_type === 'audio');
    assert.equal(audio.length, 1);
    assert.equal(audio[0].tags.language, 'zho');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
