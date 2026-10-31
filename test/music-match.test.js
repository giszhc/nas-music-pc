'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yunying-match-'));
process.env.YUNYING_DATA_DIR = dir;
const originalFetch = global.fetch;
let response = () => ({});
let calls = [];
global.fetch = async url => { calls.push(url); return { ok: true, text: async () => JSON.stringify(response(url)) }; };
const { searchSongs } = require('../lib/lyrics');
after(() => { global.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }); });
test('按歌名匹配并优先已有歌手，保留不同版本，排除无关歌曲', async () => {
  response = url => url.includes('music.163.com') ? { result: { songs: [
    { id: 1, name: '风筝误', artists: [{ name: '其他歌手' }], album: { name: '翻唱', picUrl: 'https://example.com/1.jpg' } },
    { id: 2, name: '风筝误', artists: [{ name: '刘珂矣' }], album: { name: '半壶纱', picUrl: 'https://example.com/2.jpg' } },
    { id: 3, name: '完全不同的歌', artists: [], album: {} }
  ] } } : { data: { song: { list: [] } } };
  const songs = await searchSongs({ title: '风筝误', artist: '刘珂矣' });
  assert.equal(songs.length, 2);
  assert.equal(songs[0].artist, '刘珂矣');
  assert.equal(songs[0].album, '半壶纱');
  assert.equal(songs[0].cover, 'https://example.com/2.jpg');
});
test('网易云不可用时仍返回 QQ 歌手、专辑和封面', async () => {
  response = url => {
    if (url.includes('music.163.com')) throw new Error('offline');
    return { data: { song: { list: [{ songmid: 'qq1', songname: '风筝误', singer: [{ name: '刘珂矣' }], albumname: '半壶纱', albummid: 'album1', interval: 240 }] } } };
  };
  const songs = await searchSongs({ title: '风筝误' });
  assert.equal(songs.length, 1);
  assert.equal(songs[0].source, 'qq');
  assert.match(songs[0].cover, /album1.jpg$/);
});
test('无需歌词也可补全候选封面，空歌名不请求网络', async () => {
  response = url => url.includes('/api/song/detail') ? { songs: [{ id: 5, album: { picUrl: 'https://example.com/detail.jpg' } }] }
    : url.includes('music.163.com') ? { result: { songs: [{ id: 5, name: '琴声', artists: [], album: {} }] } } : {};
  assert.equal((await searchSongs({ title: '琴声' }))[0].cover, 'https://example.com/detail.jpg');
  calls = [];
  assert.deepEqual(await searchSongs({ title: '  ' }), []);
  assert.equal(calls.length, 0);
});
