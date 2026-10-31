'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/app.js'), 'utf8');

test('刷新大播放页先渲染音乐馆，再恢复播放器', async () => {
  const events = [];
  const state = {};
  const location = { hash: '#/play/song/0' };
  const AU = {};
  const context = {
    state, location, AU, AUDIO_SESSION_KEY: 'session',
    localStorage: { getItem: () => JSON.stringify({ queue: [{ id: 'song', ep: 0 }], index: 0 }) },
    history: { replaceState: (_, __, hash) => { location.hash = hash; } },
    initTheme() {}, renderSidebar() {}, renderTopbar() {},
    api: async () => ({}), loadLibrary: async () => {},
    allItems: () => [{ id: 'song', type: 'music' }],
    route() { events.push(location.hash); state.route = { name: 'list', type: 'music' }; },
    async restoreAudioSession(options) {
      assert.equal(options.playPage, true);
      assert.deepEqual(state.route, { name: 'list', type: 'music' });
      events.push('restore'); AU.data = {}; location.hash = '#/play/song/0';
    }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function boot()'), source.indexOf("document.addEventListener('click', onClick)")), context);
  await context.boot();
  assert.deepEqual(events, ['#/list/music', 'restore']);
});

test('折叠直接进入的大播放页时同步渲染音乐馆', () => {
  let routes = 0;
  const state = { route: { name: 'item', id: 'song' } };
  const location = { hash: '#/play/song/0' };
  const elements = { '#player': { hidden: true }, '#view': {}, '#apQueue': {}, '#apQueueBtn': { setAttribute() {} } };
  const context = {
    AU: { open: true }, state, location,
    $: selector => elements[selector], auIndexInfo: () => ({ id: 'song', ep: 0 }),
    history: { replaceState: (_, __, hash) => { location.hash = hash; } },
    route() { routes++; state.route = { name: 'list', type: 'music' }; },
    persistAudioSession() {}, syncMiniBar() {}, closeMiniVolume() {}, animateAudioPage() {}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function hideAudioPage()'), source.indexOf('function stopAudio()')), context);
  context.hideAudioPage();
  assert.equal(location.hash, '#/list/music');
  assert.equal(routes, 1);
  assert.equal(elements['#view'].hidden, false);
});
