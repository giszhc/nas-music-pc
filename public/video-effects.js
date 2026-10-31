'use strict';

// 视频音效独立于音乐；每个 video 元素始终复用同一个媒体音源。
(() => {
  const video = document.querySelector('#video');
  const presets = {
    standard: { name: '标准', description: '保留原始音色', bass: 0, mid: 0, treble: 0, highpass: 20, lowpass: 20000, level: 1, threshold: -3, ratio: 1 },
    balanced: { name: '均衡', description: '低中高频适度调整', bass: 2, mid: 1, treble: 2, highpass: 30, lowpass: 18000, level: .78, threshold: -10, ratio: 2 },
    voice: { name: '人声增强', description: '突出对白，减轻低频遮盖', bass: -4, mid: 5, treble: 1, highpass: 100, lowpass: 12000, level: .72, threshold: -18, ratio: 3 },
    radio: { name: '怀旧收音机', description: '窄频单声道，模拟老式收音机', bass: -3, mid: 3, treble: -3, highpass: 350, lowpass: 3500, level: .8, threshold: -24, ratio: 5 }
  };
  const key = 'yunying.video-effect';
  let selected = 'standard', graph = null;
  try { const saved = localStorage.getItem(key); if (presets[saved]) selected = saved; } catch (_) {}
  function sync() {
    for (const button of document.querySelectorAll('[data-video-effect]')) {
      const on = button.dataset.videoEffect === selected;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    }
  }
  function createGraph() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error('当前浏览器不支持视频音效');
    const ctx = new Context();
    const dry = ctx.createGain(), wet = ctx.createGain(), input = ctx.createGain();
    dry.gain.value = 1; wet.gain.value = 0;
    const highpass = ctx.createBiquadFilter(); highpass.type = 'highpass'; highpass.Q.value = .7;
    const bass = ctx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 140;
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 2200; mid.Q.value = .8;
    const treble = ctx.createBiquadFilter(); treble.type = 'highshelf'; treble.frequency.value = 6500;
    const lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.Q.value = .7;
    const compressor = ctx.createDynamicsCompressor();
    compressor.knee.value = 12; compressor.attack.value = .006; compressor.release.value = .18;
    input.connect(highpass).connect(bass).connect(mid).connect(treble).connect(lowpass).connect(compressor).connect(wet).connect(ctx.destination);
    dry.connect(ctx.destination);
    const source = ctx.createMediaElementSource(video);
    graph = { ctx, source, dry, wet, input, highpass, bass, mid, treble, lowpass, compressor };
    source.connect(dry); source.connect(input);
  }
  function apply() {
    if (!graph) return;
    const g = graph, p = presets[selected];
    const set = (param, value) => param.setTargetAtTime(value, g.ctx.currentTime, .025);
    set(g.bass.gain, p.bass); set(g.mid.gain, p.mid); set(g.treble.gain, p.treble);
    set(g.highpass.frequency, p.highpass);
    set(g.lowpass.frequency, Math.min(p.lowpass, g.ctx.sampleRate / 2 - 100));
    set(g.input.gain, p.level);
    set(g.compressor.threshold, p.threshold); set(g.compressor.ratio, p.ratio);
    g.input.channelCount = selected === 'radio' ? 1 : 2;
    g.input.channelCountMode = selected === 'radio' ? 'explicit' : 'max';
    set(g.dry.gain, selected === 'standard' ? 1 : 0);
    set(g.wet.gain, selected === 'standard' ? 0 : 1);
  }
  function recover(error) {
    selected = 'standard';
    if (graph) {
      graph.dry.gain.value = 1; graph.wet.gain.value = 0;
      // 图创建或连接失败时始终恢复原声输出。
      graph.source.disconnect(); graph.source.connect(graph.ctx.destination);
      graph.failed = true;
    }
    try { localStorage.setItem(key, selected); } catch (_) {}
    sync();
    if (typeof toast === 'function') toast('音效暂不可用，已恢复标准音效');
    console.warn('视频音效不可用', error);
  }
  async function activate(gesture = false) {
    if (!video || (graph && graph.failed)) return;
    // 刷新后等待用户手势再接管音源，避免自动播放被挂起的音频上下文静音。
    if (!graph && (!gesture || selected === 'standard')) return;
    try {
      if (!graph) createGraph();
      apply();
      await graph.ctx.resume();
    } catch (error) { recover(error); }
  }
  async function select(id) {
    if (!presets[id]) return;
    if (graph?.failed && id !== 'standard') return recover(new Error('音效上下文不可用'));
    selected = id;
    sync();
    try { localStorage.setItem(key, id); } catch (_) {}
    await activate(true);
  }
  document.addEventListener('pointerdown', () => { if (!video.hidden && !video.paused) activate(true); }, { passive: true });
  document.addEventListener('keydown', () => { if (!video.paused) activate(true); });
  video.addEventListener('play', () => activate(!!navigator.userActivation?.isActive));
  window.VideoEffects = { presets, select, get selected() { return selected; } };
})();
