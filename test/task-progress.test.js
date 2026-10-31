'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { progress, scanProgress, matchProgress } = require('../lib/task-progress');
const { scan } = require('../lib/scanner');
const { mergeScanItems, countVideoFiles } = require('../lib/library-scan');
test('目录总数变化时估算进度不倒退，整理前不提前到 100%', () => {
  const first = scanProgress(1, 2);
  const next = scanProgress(2, 20, first.percent);
  assert.equal(next.estimated, true);
  assert.ok(next.percent >= first.percent);
  assert.equal(scanProgress(22, 0, next.percent).percent, 95);
});
test('匹配主轮与补偿重试均保留完成空间', () => {
  assert.equal(matchProgress(1, 2).percent, 45);
  assert.equal(matchProgress(2, 2).percent, 90);
  assert.equal(matchProgress(1, 2, true).percent, 94);
  assert.equal(matchProgress(2, 2, true).percent, 99);
  assert.equal(progress('完成', 2, 2, 100).percent, 100);
});
test('扫描器报告目录数、估算进度和整理阶段，包含失败目录', async () => {
  const reports = [];
  await scan([{ id: 'nas', path: '/tv' }], async (_, dir) => {
    if (dir === '/tv') return [{ name: '作品', path: '/tv/作品', isdir: true }, { name: '不可读', path: '/tv/不可读', isdir: true }];
    if (dir.endsWith('不可读')) throw new Error('读取失败');
    return [{ name: '01.mkv', path: '/tv/作品/01.mkv' }];
  }, p => reports.push(p));
  const stages = reports.filter(p => Number.isFinite(p.percent));
  assert.ok(stages.some(p => p.warn && p.completed === 3));
  assert.equal(stages.at(-1).stage, '整理媒体库');
  assert.equal(stages.at(-1).estimated, false);
  assert.ok(stages.every((p, i) => p.percent < 100 && (!i || p.percent >= stages[i - 1].percent)));
});
function matchingContext(matchItem) {
  const snapshots = [];
  const values = { enriching: false };
  const S = new Proxy(values, { set(target, key, value) {
    target[key] = value;
    if (key === 'enrichProgress') snapshots.push(value);
    return true;
  } });
  const cache = new Map();
  const context = { S, progress, matchProgress, setTimeout: fn => { fn(); }, persistLibrary() {},
    metadata: { hasKey: () => false, getCached: id => cache.get(id), matchItem: item => matchItem(item, cache), getCachedSeason() {} } };
  vm.createContext(context);
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('async function enrichEpisodeTitles('), source.indexOf('async function runScan(')), context);
  return { context, snapshots, values };
}
test('重试阶段仍保持运行状态，最终 100%，未匹配数量如实显示', async () => {
  const { context, snapshots, values } = matchingContext(() => null);
  await context.enrichAll([{ id: 'one', type: 'tv' }]);
  assert.ok(snapshots.some(p => p.stage === '重试未匹配作品' && p.percent === 90));
  assert.equal(snapshots.at(-1).percent, 100);
  assert.equal(values.enriching, false);
  assert.match(values.enrichMsg, /1 部暂未找到/);
});
test('音乐不参与影片匹配，已有缓存跳过，空队列可完成', async () => {
  let calls = 0;
  const { context, values } = matchingContext(() => { calls++; });
  await context.enrichAll([{ id: 'song', type: 'music' }]);
  assert.equal(calls, 0);
  assert.equal(values.enrichProgress.percent, 100);
  assert.equal(values.enriching, false);
});
test('扫描后台启动后即可读取进度，完成时平滑交接给匹配', async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const S = {};
  const context = { S, progress, Date, Number, mergeScanItems, countVideoFiles, allItems: () => (S.library && S.library.items) || [], store: { config: () => ({ sources: [{ path: '/tv' }] }) }, listDir() {},
    scanner: { SCAN_VERSION: 1, scan: async (_, __, notify) => {
      notify({ msg: '正在读取目录', stage: '读取目录', completed: 1, total: 2, percent: 47, estimated: true });
      await gate;
      return { items: [], files: 0, audios: 0 };
    } }, coverDirCache: new Map(), persistLibrary() {}, enrichAll: async () => { S.enriching = true; } };
  vm.createContext(context);
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('async function runScan('), source.indexOf('/* --------------------------------- 播放处理')), context);
  const task = context.runScan();
  assert.equal(S.scanning, true);
  assert.equal(S.scanProgress.percent, 47);
  finish();
  await task;
  assert.equal(S.scanProgress.percent, 100);
  assert.equal(S.scanning, false);
  assert.equal(S.enriching, true);
});


test('整库匹配获取分集标题，单剧失败不阻断队列，电影与音乐跳过', async () => {
  const { context, values } = matchingContext((item, cache) => cache.set(item.id, {}));
  const calls = [];
  context.metadata.hasKey = () => true;
  context.metadata.getEpisodeTitles = async (item, options) => {
    calls.push([item.id, options.force]);
    if (item.id === 'first') throw new Error('网络异常');
  };
  await context.enrichAll([
    { id: 'first', type: 'tv', episodes: [{ index: 0 }] },
    { id: 'second', type: 'tv', episodes: [{ index: 0 }] },
    { id: 'movie', type: 'movie', episodes: [{ index: 0 }] },
    { id: 'song', type: 'music', episodes: [{ index: 0 }] }
  ], { force: true });
  assert.deepEqual(calls, [['first', true], ['second', true]]);
  assert.equal(values.enrichProgress.percent, 100);
  assert.equal(values.enriching, false);
});
