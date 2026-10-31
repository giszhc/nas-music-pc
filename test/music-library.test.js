'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { deduplicateSongs } = require('../lib/music-library');

test('同名重复歌曲优先保留有歌手的记录，与扫描顺序无关', () => {
  const unknown = { title: '晴天', artist: '未知歌手' };
  const known = { title: '晴天', artist: '周杰伦' };
  assert.deepEqual(deduplicateSongs([unknown, known]), [known]);
  assert.deepEqual(deduplicateSongs([known, unknown]), [known]);
});

test('合并同歌手同歌名，保留翻唱和不同版本', () => {
  const original = { title: '晴天', artist: '周杰伦' };
  const cover = { title: '晴天', artist: '其他歌手' };
  const live = { title: '晴天 (Live)', artist: '周杰伦' };
  assert.deepEqual(deduplicateSongs([
    original, { title: ' 晴天 ', artist: ' 周杰伦 ' },
    { title: '晴天', artist: '' }, cover, live
  ]), [original, cover, live]);
});

test('没有歌手的重复歌曲只保留一条，无歌名记录各自保留', () => {
  const song = { title: '夜曲', artist: '' };
  const unnamed = { title: '', artist: '' };
  const anotherUnnamed = { title: '', artist: '' };
  assert.deepEqual(deduplicateSongs([song, { title: '夜曲', artist: 'Unknown Artist' }, unnamed, anotherUnnamed]), [song, unnamed, anotherUnnamed]);
});
