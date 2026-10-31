'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yunying-cover-'));
process.env.YUNYING_DATA_DIR = dir;
const originalFetch = global.fetch;
let calls = [];
let response = () => ({});
global.fetch = async (url) => { calls.push(url); return { ok: true, text: async () => JSON.stringify(response(url)) }; };
const { findCover } = require('../lib/lyrics');
after(() => { global.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }); });
test('无歌词的歌曲也匹配封面，并合并并发请求、复用缓存', async () => {
  calls = [];
  response = () => ({ result: { songs: [{ id: 1, name: '那年', artists: [{ name: '任然' }], album: { picUrl: 'https://p1.music.126.net/cover.jpg' }, duration: 240000 }] } });
  const query = { title: '那年', artist: '任然', duration: 240 };
  const result = await Promise.all([findCover(query), findCover(query)]);
  assert.deepEqual(result, ['https://p1.music.126.net/cover.jpg', 'https://p1.music.126.net/cover.jpg']);
  assert.equal(calls.length, 1);
  assert.equal(await findCover(query), result[0]);
  assert.equal(calls.length, 1);
});
test('拒绝同名但歌手不符，QQ封面作为后备', async () => {
  response = url => url.includes('music.163.com')
    ? { result: { songs: [{ id: 2, name: '保护色', artists: [{ name: '其他歌手' }], album: { picUrl: 'https://p1.music.126.net/wrong.jpg' } }] } }
    : { data: { song: { list: [{ songmid: 'a', songname: '保护色', singer: [{ name: '苏亦承' }], albummid: 'album1' }] } } };
  assert.equal(await findCover({ title: '保护色', artist: '苏亦承' }), 'https://y.gtimg.cn/music/photo_new/T002R500x500M000album1.jpg');
});
test('搜索结果缺图片时读取已匹配歌曲详情', async () => {
  response = url => url.includes('/api/song/detail')
    ? { songs: [{ album: { picUrl: 'https://p2.music.126.net/detail.jpg' } }] }
    : { result: { songs: [{ id: 3, name: '夜曲', artists: [{ name: '演奏者' }], album: {} }] } };
  assert.equal(await findCover({ title: '夜曲', artist: '演奏者' }), 'https://p2.music.126.net/detail.jpg');
});
test('不匹配不相关标题，未命中结果缓存', async () => {
  calls = [];
  response = () => ({ result: { songs: [{ id: 4, name: '其他歌曲', artists: [], album: { picUrl: 'https://p1.music.126.net/wrong.jpg' } }] } });
  assert.equal(await findCover({ title: '找不到的歌' }), null);
  const count = calls.length;
  assert.equal(await findCover({ title: '找不到的歌' }), null);
  assert.equal(calls.length, count);
});
