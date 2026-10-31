'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../public/video-effects.js'), 'utf8');
function setup(saved = 'standard', supported = true) {
  const nodes = [], contexts = [], sources = [], storage = new Map([['yunying.video-effect', saved]]), handlers = {}, videoHandlers = {};
  const param = () => ({ value: 0, setTargetAtTime(value) { this.value = value; } });
  const node = kind => {
    const n = { kind, connections: [], gain: param(), frequency: param(), Q: param(), threshold: param(), ratio: param(), knee: param(), attack: param(), release: param(), connect(target) { this.connections.push(target); return target; }, disconnect() { this.connections = []; } };
    nodes.push(n); return n;
  };
  class Context {
    constructor() { this.destination = node('destination'); this.sampleRate = 48000; this.currentTime = 0; contexts.push(this); }
    createGain() { return node('gain'); }
    createBiquadFilter() { return node('filter'); }
    createDynamicsCompressor() { return node('compressor'); }
    createMediaElementSource(el) { sources.push(el); return node('source'); }
    async resume() { this.state = 'running'; }
  }
  const video = { paused: false, hidden: false, currentTime: 123, volume: .6, addEventListener: (name, fn) => { videoHandlers[name] = fn; } };
  const controls = ['standard', 'balanced', 'voice', 'radio'].map(id => ({ dataset: { videoEffect: id }, attrs: {}, classList: { toggle() {} }, setAttribute(k, v) { this.attrs[k] = v; } }));
  const window = { AudioContext: supported ? Context : null };
  vm.runInNewContext(script, { window, navigator: { userActivation: { isActive: false } }, document: { querySelector: () => video, querySelectorAll: () => controls, addEventListener: (name, fn) => { handlers[name] = fn; } }, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, console: { warn() {} } });
  return { effects: window.VideoEffects, nodes, contexts, sources, storage, handlers, videoHandlers, video, controls };
}
test('视频四种音效复用音源，保留进度、音量和播放状态，标准为原声旁路', async () => {
  const s = setup();
  assert.equal(s.contexts.length, 0);
  for (const id of ['balanced', 'voice', 'radio', 'standard', 'voice']) await s.effects.select(id);
  assert.equal(s.contexts.length, 1);
  assert.deepEqual(s.sources, [s.video]);
  assert.equal(s.video.currentTime, 123);
  assert.equal(s.video.volume, .6);
  assert.equal(s.video.paused, false);
  assert.equal(s.nodes.find(n => n.type === 'peaking').gain.value, 5);
  await s.effects.select('radio');
  assert.equal(s.nodes.find(n => n.type === 'highpass').frequency.value, 350);
  assert.equal(s.nodes.find(n => n.type === 'lowpass').frequency.value, 3500);
  assert.ok(s.nodes.some(n => n.channelCount === 1 && n.channelCountMode === 'explicit'));
  await s.effects.select('standard');
  const gains = s.nodes.filter(n => n.kind === 'gain');
  assert.equal(gains[0].gain.value, 1);
  assert.equal(gains[1].gain.value, 0);
  assert.equal(s.storage.get('yunying.video-effect'), 'standard');
  assert.equal(s.controls[0].attrs['aria-pressed'], 'true');
});
test('刷新保存音效不会提前接管自动播放，用户手势后才恢复', async () => {
  const s = setup('radio');
  await s.videoHandlers.play();
  assert.equal(s.contexts.length, 0);
  await s.handlers.pointerdown();
  assert.equal(s.contexts.length, 1);
  assert.equal(s.effects.selected, 'radio');
});
test('浏览器不支持音效时保留原声并恢复标准选项', async () => {
  const s = setup('standard', false);
  await s.effects.select('voice');
  assert.equal(s.effects.selected, 'standard');
  assert.equal(s.sources.length, 0);
  assert.equal(s.video.volume, .6);
});
