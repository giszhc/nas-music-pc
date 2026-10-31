'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { scan } = require('../lib/scanner');
async function scanPaths(paths, root = '/电视剧', type = 'auto') {
  const tree = new Map();
  for (const file of paths) {
    let current = file;
    while (current !== root) {
      const parent = path.dirname(current);
      if (!tree.has(parent)) tree.set(parent, new Map());
      tree.get(parent).set(current, { name: path.basename(current), path: current, isdir: current !== file });
      current = parent;
    }
  }
  return (await scan([{ id: 'nas', path: root, type }], async (_, dir) => [...(tree.get(dir)?.values() || [])])).items;
}
test('作品目录优先，分集标题、年份和画质子目录不拆作品', async () => {
  const items = await scanPaths(['/电视剧/古装剧/烈焰/4K/01.mkv', '/电视剧/古装剧/烈焰/4K/第2集 命运.mkv', '/电视剧/古装剧/烈焰/4K/错误片名.2024.E03.mkv']);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, '烈焰');
  assert.equal(items[0].episodeCount, 3);
  assert.equal(items[0].year, null);
});
test('烈焰实际文件名的集数和 4K 后缀不生成独立作品', async () => {
  const numbers = [39, 1, 2, 8, 9, 10, 12, 36];
  const items = await scanPaths(numbers.map(n => `/电视剧/古装剧/烈焰/4K/${String(n).padStart(2, '0')} 4K.mkv`));
  assert.equal(items.length, 1);
  assert.equal(items[0].title, '烈焰');
  assert.equal(items[0].type, 'tv');
  assert.deepEqual(items[0].episodes.map(e => e.episode), numbers.slice().sort((a, b) => a - b));
});
test('多季分别列出，目录季号优先', async () => {
  const items = await scanPaths(['/电视剧/示例剧 (2020)/Season 1/其它.S01E01.mkv', '/电视剧/示例剧 (2020)/Season 2/其它.S01E02.mkv']);
  assert.equal(items.length, 2);
  assert.ok(items.every(i => i.title === '示例剧' && i.year === 2020 && i.seasonCount === 1));
  assert.deepEqual(items.map(i => i.seasonNumber).sort(), [1, 2]);
  assert.ok(items.every(i => i.episodes.every(e => e.season === i.seasonNumber)));
});
test('不同目录版本不混合', async () => {
  const items = await scanPaths(['/电视剧/西游记 TVB版 第一季/第01集.mkv', '/电视剧/西游记续集86版/第01集.mkv']);
  assert.equal(items.length, 2);
  assert.ok(items.some(i => i.title === '西游记 TVB版'));
});
test('分类根目录散装电影和系列电影保持独立', async () => {
  const items = await scanPaths(['/电影/隐入尘烟.2022.mkv', '/电影/流浪地球.2019.mkv', '/电影/战狼/战狼1.mkv', '/电影/战狼/战狼2.mkv'], '/电影');
  assert.equal(items.length, 4);
});
test('直接选择作品目录作为媒体源仍使用目录片名', async () => {
  const items = await scanPaths(['/电视剧/红楼梦/第21荣 国府元宵开夜宴.mkv', '/电视剧/红楼梦/第22集.mkv'], '/电视剧/红楼梦', 'tv');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, '红楼梦');
});
