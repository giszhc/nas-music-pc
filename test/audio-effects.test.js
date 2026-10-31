'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require('node:path').join(__dirname, '../public/audio-effects.js'), 'utf8');
function setup(saved = 'off', supported = true, spectrum = false) {
  const nodes = [], contexts = [], storage = new Map([['yunying.audio-effect', saved]]);
  const param = () => ({ value: 0, setTargetAtTime(value) { this.value = value; } });
  const node = type => {
    const n = { type, connections: [], gain: param(), frequency: param(), Q: param(), pan: param(), delayTime: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect(target) { this.connections.push(target); return target; }, disconnect() { this.connections = []; } };
    nodes.push(n); return n;
  };
  class Context {
    constructor() { this.sampleRate = 48000; this.destination = node('destination'); this.currentTime = 0; contexts.push(this); }
    createAnalyser() { const n = node('analyser'); n.frequencyBinCount = 1024; n.getByteFrequencyData = data => { data.fill(0); data[5] = 220; }; return n; }
    createGain() { return node('gain'); }
    createBiquadFilter() { return node('filter'); }
    createDelay() { return node('delay'); }
    createStereoPanner() { return node('panner'); }
    createDynamicsCompressor() { return node('compressor'); }
    createMediaElementSource() { return node('source'); }
    async resume() { this.state = 'running'; }
  }
  const ids = ['off', 'clear', 'bass', 'live', 'surround'];
  const controls = ids.map(id => ({ dataset: { audioEffect: id }, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; }, closest() { return { dataset: {} }; }, addEventListener(_, fn) { this.click = fn; } }));
  const events = {}, audioEvents = {}, frames = new Map(), bars = [];
  let frameId = 0;
  const audio = { paused: false, ended: false, muted: false, volume: 1, addEventListener(name, fn) { audioEvents[name] = fn; } };
  const drawing = { setTransform() {}, clearRect() { bars.length = 0; }, createLinearGradient() { return { addColorStop() {} }; }, beginPath() {}, roundRect(x, y, w, h) { bars.push([x, y, w, h]); }, fill() {} };
  const canvas = { clientWidth: 336, clientHeight: 28, getContext: () => drawing };
  const miniBar = { hidden: false };
  const dummy = { addEventListener() {}, dataset: {} };
  vm.runInNewContext(script, { window: { AudioContext: supported ? Context : null, addEventListener() {} }, document: { querySelector: selector => selector === '#audioEl' ? audio : selector === '#mbSpectrum' ? (spectrum === true ? canvas : null) : selector === '#apSpectrum' ? (spectrum === 'large' ? canvas : null) : selector === '#miniBar' ? miniBar : dummy, querySelectorAll: selector => selector === '[data-audio-effect]' ? controls : [], addEventListener: (name, fn) => { events[name] = fn; } }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, console: { warn() {} }, Float32Array, Uint8Array, getComputedStyle: () => ({ color: '#1685ae' }), requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id), MutationObserver: class { observe() {} }, ResizeObserver: class { observe() {} } });
  return { controls, nodes, contexts, storage, events, audio, audioEvents, frames, bars, canvas };
}
test('所有音效切换复用同一音源，两处入口同步，原声旁路', async () => {
  const s = setup();
  assert.equal(s.contexts.length, 0);
  for (const id of ['clear', 'bass', 'live', 'surround', 'off']) {
    await s.controls.find(c => c.dataset.audioEffect === id).click();
    assert.equal(s.controls.find(c => c.dataset.audioEffect === id).attributes['aria-pressed'], 'true');
    assert.equal(s.storage.get('yunying.audio-effect'), id);
  }
  assert.equal(s.contexts.length, 1);
  const source = s.nodes.find(n => n.type === 'source');
  assert.equal(source.connections.length, 2);
  assert.equal(source.connections[0], s.contexts[0].destination);
  assert.equal(source.connections[1].type, 'analyser');
});
test('已保存的音效在用户操作时恢复，不提前接管音频', async () => {
  const s = setup('bass');
  assert.equal(s.controls.find(c => c.dataset.audioEffect === 'bass').attributes['aria-pressed'], 'true');
  assert.equal(s.contexts.length, 0);
  await s.events.pointerdown();
  assert.equal(s.contexts.length, 1);
  assert.equal(s.nodes.find(n => n.type === 'lowshelf').gain.value, 9);
});
test('不支持音效时退回原声并同步界面和存储', async () => {
  const s = setup('off', false);
  await s.controls.find(c => c.dataset.audioEffect === 'surround').click();
  assert.equal(s.controls[0].attributes['aria-pressed'], 'true');
  assert.equal(s.storage.get('yunying.audio-effect'), 'off');
});

test('原声频谱读取真实频段数据，暂停取消刷新并回落，静音无起伏', async () => {
  const s = setup('off', true, true);
  await s.audioEvents.play();
  assert.equal(s.contexts.length, 1);
  const source = s.nodes.find(n => n.type === 'source');
  assert.equal(source.connections.filter(n => n.type === 'destination').length, 1);
  function tick(time) { const [id, fn] = s.frames.entries().next().value; s.frames.delete(id); fn(time); }
  tick(100);
  assert.equal(s.bars.length, 67);
  assert.ok(s.bars.every(bar => bar[2] <= 2.5));
  assert.ok(s.bars.some(bar => bar[3] > 10));
  assert.ok(s.bars.some(bar => bar[3] === 2));
  s.audio.paused = true; s.audioEvents.pause();
  assert.equal(s.frames.size, 0);
  assert.ok(s.bars.every(bar => bar[3] === 2));
  s.audio.paused = false; s.audio.muted = true;
  s.audioEvents.playing(); tick(200);
  assert.ok(s.bars.every(bar => bar[3] === 2));
});

test('大播放页独立显示频谱，复用唯一音源与分析器', async () => {
  const s = setup('off', true, 'large');
  await s.audioEvents.play();
  assert.equal(s.frames.size, 1);
  const [id, tick] = s.frames.entries().next().value;
  s.frames.delete(id); tick(100);
  assert.ok(s.bars.some(bar => bar[3] > 10));
  await s.controls.find(c => c.dataset.audioEffect === 'live').click();
  assert.equal(s.contexts.length, 1);
  assert.equal(s.nodes.filter(n => n.type === 'source').length, 1);
  assert.equal(s.nodes.filter(n => n.type === 'analyser').length, 1);
  assert.equal(s.frames.size, 1);
});

test('关闭歌词后频谱随宽度增加密度，窗口缩小时仍完整绘制', async () => {
  const s = setup('off', true, 'large');
  await s.audioEvents.play();
  const draw = time => {
    const [id, tick] = s.frames.entries().next().value;
    s.frames.delete(id);
    tick(time);
  };
  draw(100);
  const narrowCount = s.bars.length;
  s.canvas.clientWidth = 1800;
  draw(200);
  assert.ok(s.bars.length > narrowCount * 4);
  const spacing = s.bars[1][0] - s.bars[0][0];
  assert.ok(spacing <= 6, '宽幅频谱不能出现大段空隙');
  assert.ok(s.bars.every(bar => bar[0] >= 0 && bar[0] + bar[2] <= 1800 && Number.isFinite(bar[3])));
  s.canvas.clientWidth = 320;
  draw(300);
  assert.ok(s.bars.length < narrowCount);
  assert.ok(s.bars.every(bar => bar[0] + bar[2] <= 320));
});
