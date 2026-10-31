'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { mergeScanItems, countVideoFiles } = require('../lib/library-scan');
const { progress } = require('../lib/task-progress');
const item = (id, sourceId, type = 'tv') => ({ id, sourceId, type, episodes: [{ path: `/${sourceId}/${id}.mkv` }] });
test('单目录替换新增及已删除作品，其他目录和音乐不变', () => {
  const other = item('movie', 'movies');
  const music = item('song', 'music', 'music');
  const updated = mergeScanItems([item('removed', 'tv'), other, music], [item('new', 'tv')], 'tv');
  assert.deepEqual(updated.map(i => i.id), ['movie', 'song', 'new']);
  assert.equal(updated[0], other);
  assert.equal(updated[1], music);
  assert.equal(countVideoFiles(updated), 2);
});
test('目录确实为空时只清空所选目录，全部扫描仍整体替换', () => {
  const items = [item('tv', 'tv'), item('movie', 'movies')];
  assert.deepEqual(mergeScanItems(items, [], 'tv').map(i => i.id), ['movie']);
  assert.deepEqual(mergeScanItems(items, [], null), []);
});
function contextFor(scanFn) {
  const sources = [{ id: 'tv', path: '/tv', name: '电视剧' }, { id: 'movies', path: '/movies', name: '电影' }];
  const S = { library: { scanVersion: 1, items: [item('old', 'tv'), item('movie', 'movies')] } };
  const context = { S, progress, mergeScanItems, countVideoFiles, allItems: () => S.library.items,
    store: { config: () => ({ sources }) }, scanner: { SCAN_VERSION: 1, scan: scanFn },
    listDir() {}, coverDirCache: new Map(), persistLibrary() {}, enrichAll: async items => { context.matched = items; } };
  vm.createContext(context);
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('async function runScan('), source.indexOf('/* --------------------------------- 播放处理')), context);
  return context;
}
test('只遍历指定来源，只匹配本次扫描资源，进度带目录名称', async () => {
  let visited;
  const context = contextFor(async sources => {
    visited = sources.map(s => s.id);
    return { items: [item('new', 'tv')], files: 1, audios: 0 };
  });
  await context.runScan('tv');
  assert.deepEqual(visited, ['tv']);
  assert.deepEqual(context.S.library.items.map(i => i.id), ['movie', 'new']);
  assert.deepEqual(context.matched.map(i => i.id), ['new']);
  assert.equal(context.S.scanProgress.sourceName, '电视剧');
  assert.equal(context.S.library.files, 2);
});
test('读取失败保留整个原媒体库，不把失败目录当空目录清除', async () => {
  const context = contextFor(async (_, __, notify) => {
    notify({ warn: true, msg: '目录不可读' });
    return { items: [], files: 0 };
  });
  const before = context.S.library;
  const result = await context.runScan('tv');
  assert.equal(result.started, false);
  assert.equal(context.S.library, before);
  assert.equal(context.S.scanProgress.error, true);
  assert.equal(context.S.scanning, false);
  assert.equal(context.matched, undefined);
});
test('未知目录不能退回到全部扫描', async () => {
  const context = contextFor(() => { throw new Error('不应调用扫描'); });
  const result = await context.runScan('missing');
  assert.equal(result.started, false);
  assert.equal(context.S.scanning, undefined);
});
