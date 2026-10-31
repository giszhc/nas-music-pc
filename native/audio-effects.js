'use strict';

// 音效只作用于音乐 audio 元素，视频播放保持独立。
(() => {
  const presets = {
    off: { name: '原声', bass: 0, mid: 0, treble: 0, wet: 0, delay: 0.02, pan: 0, level: 1 },
    clear: { name: '3D丽音', bass: 2, mid: 1.5, treble: 4, wet: 0.13, delay: 0.018, pan: 0.55, level: 0.75 },
    bass: { name: '超重低音', bass: 9, mid: -1, treble: 1, wet: 0, delay: 0.02, pan: 0, level: 0.5 },
    live: { name: 'HiFi现场', bass: 2, mid: 2, treble: 2, wet: 0.24, delay: 0.085, pan: 0.65, level: 0.65 },
    surround: { name: '3D环绕', bass: 2, mid: 0, treble: 2, wet: 0.3, delay: 0.028, pan: 1, level: 0.65 }
  };
  const storageKey = 'yunying.audio-effect';
  let selected = 'off';
  try { const saved = localStorage.getItem(storageKey); if (presets[saved]) selected = saved; } catch (_) {}
  let graph;
  const audio = document.querySelector('#audioEl');
  const surfaces = ['mbSpectrum', 'apSpectrum'].map(id => {
    const canvas = document.querySelector(`#${id}`);
    const drawing = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    return drawing ? { canvas, drawing, levels: new Float32Array(768) } : null;
  }).filter(Boolean);
  const miniBar = document.querySelector('#miniBar');
  const audioPage = document.querySelector('#audioPage');
  let frame = 0, lastDraw = 0;
  const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const controls = [...document.querySelectorAll('[data-audio-effect]')];
  const panel = document.querySelector('#audioEffectsPanel');
  const triggers = [...document.querySelectorAll('[data-effect-open]')];
  let opener;
  function sync() {
    for (const button of controls) {
      const on = button.dataset.audioEffect === selected;
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? '使用中' : '使用';
      button.closest('[data-effect-card]').dataset.active = String(on);
    }
    document.querySelector('#effectCurrentName').textContent = presets[selected].name;
    for (const trigger of triggers) {
      trigger.dataset.active = String(selected !== 'off');
      trigger.title = `音效：${presets[selected].name}`;
    }
  }
  function closePanel() { panel.close(); if (opener) opener.focus(); }
  for (const trigger of triggers) trigger.addEventListener('click', () => {
    opener = trigger; sync(); panel.showModal();
  });
  document.querySelector('[data-effect-close]').addEventListener('click', closePanel);
  panel.addEventListener('click', event => { if (event.target === panel) {
    const box = panel.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closePanel();
  } });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePanel(); }
  });
  function createGraph() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error('当前浏览器不支持音乐音效');
    const ctx = new Context();
    const input = ctx.createGain();
    const bass = ctx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 120;
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1800; mid.Q.value = 0.8;
    const treble = ctx.createBiquadFilter(); treble.type = 'highshelf'; treble.frequency.value = 6500;
    const wet = ctx.createGain();
    const left = ctx.createDelay(0.2), right = ctx.createDelay(0.2);
    const panL = ctx.createStereoPanner(), panR = ctx.createStereoPanner();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 3; limiter.ratio.value = 12;
    limiter.attack.value = 0.003; limiter.release.value = 0.2;
    input.connect(bass).connect(mid).connect(treble).connect(limiter);
    // 两个无反馈的短延迟形成左右空间感，避免回授累积。
    treble.connect(left).connect(panL).connect(wet);
    treble.connect(right).connect(panR).connect(wet);
    wet.connect(limiter); limiter.connect(ctx.destination);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.75;
    analyser.minDecibels = -85;
    analyser.maxDecibels = -20;
    // 分析节点仅监听，不连接扬声器，避免重复输出或改变原声音色。
    // 所有处理节点准备好后才接管媒体，原声直接旁路。
    const source = ctx.createMediaElementSource(audio);
    source.connect(ctx.destination);
    return { ctx, source, input, bass, mid, treble, wet, left, right, panL, panR, limiter, analyser, frequencies: new Uint8Array(analyser.frequencyBinCount) };
  }
  function apply() {
    const g = graph, p = presets[selected];
    const set = (param, value) => param.setTargetAtTime(value, g.ctx.currentTime, 0.025);
    set(g.bass.gain, p.bass); set(g.mid.gain, p.mid); set(g.treble.gain, p.treble);
    set(g.input.gain, p.level); set(g.wet.gain, p.wet);
    set(g.left.delayTime, p.delay); set(g.right.delayTime, p.delay * 1.37);
    set(g.panL.pan, -p.pan); set(g.panR.pan, p.pan);
    g.source.disconnect();
    g.source.connect(selected === 'off' ? g.ctx.destination : g.input);
    g.source.connect(g.analyser);
  }
  async function activate() {
    if (!graph && selected === 'off' && !surfaces.length) return;
    try {
      if (!graph) { graph = createGraph(); apply(); }
      await graph.ctx.resume();
      startSpectrum();
    } catch (error) {
      selected = 'off';
      if (graph) { graph.source.disconnect(); graph.source.connect(graph.ctx.destination); }
      try { localStorage.setItem(storageKey, selected); } catch (_) {}
      sync();
      if (typeof toast === 'function') toast('音效未能启用，请使用支持 Web Audio 的浏览器重试');
      console.warn('音乐音效不可用', error);
    }
  }
  for (const button of controls) button.addEventListener('click', async () => {
    selected = presets[button.dataset.audioEffect] ? button.dataset.audioEffect : 'off';
    if (graph) apply();
    sync();
    try { localStorage.setItem(storageKey, selected); } catch (_) {}
    await activate();
  });
  function drawSpectrum(active) {
    if (active && graph) graph.analyser.getByteFrequencyData(graph.frequencies);
    for (const surface of surfaces) drawSpectrumSurface(surface, active);
  }
  function drawSpectrumSurface({ canvas, drawing, levels }, active) {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    }
    drawing.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawing.clearRect(0, 0, width, height);
    const gradient = drawing.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, '#087aa5');
    gradient.addColorStop(0.38, '#00cbb7');
    gradient.addColorStop(0.65, '#35baca');
    gradient.addColorStop(0.82, '#9950ba');
    gradient.addColorStop(1, '#e400a8');
    drawing.fillStyle = gradient;
    // 按可见宽度保持约 5px 的柱间距，关闭歌词后的宽幅视图也保持密度。
    const count = Math.min(levels.length, Math.max(12, Math.floor(width / 5)));
    const step = width / count;
    for (let i = 0; i < count; i++) {
      let value = 0;
      if (active && graph && !audio.muted && audio.volume > 0) {
        // 对数频段：左侧低音、右侧高音，合并每段的实际 FFT 数据。
        const binHz = graph.ctx.sampleRate / graph.analyser.fftSize;
        const maxHz = Math.min(16000, graph.ctx.sampleRate / 2);
        const from = Math.max(1, Math.floor(40 * Math.pow(maxHz / 40, i / count) / binHz));
        const to = Math.min(graph.frequencies.length, Math.max(from + 1, Math.ceil(40 * Math.pow(maxHz / 40, (i + 1) / count) / binHz)));
        for (let k = from; k < to; k++) value = Math.max(value, graph.frequencies[k]);
        value /= 255;
      }
      levels[i] = active ? Math.max(value, levels[i] * 0.82) : 0;
      const barHeight = Math.max(2, levels[i] * (height - 2));
      drawing.globalAlpha = active && levels[i] > 0.03 ? 1 : 0.25;
      const barWidth = Math.min(2.5, step * 0.5);
      drawing.beginPath();
      drawing.roundRect(i * step + (step - barWidth) / 2, height - barHeight, barWidth, barHeight, barWidth / 2);
      drawing.fill();
    }
    drawing.globalAlpha = 1;
  }
  function canAnimateSpectrum() {
    return graph && graph.ctx.state === 'running' && !audio.paused && !audio.ended
      && !document.hidden && surfaces.some(({ canvas }) => canvas.clientWidth > 0);
  }
  function stopSpectrum() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    for (const surface of surfaces) surface.levels.fill(0);
    drawSpectrum(false);
  }
  function startSpectrum() {
    if (!canAnimateSpectrum()) { stopSpectrum(); return; }
    if (frame) return;
    const tick = time => {
      frame = 0;
      if (!canAnimateSpectrum()) { stopSpectrum(); return; }
      if (time - lastDraw >= (reducedMotion.matches ? 100 : 32)) { drawSpectrum(true); lastDraw = time; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  // 原声模式也启用分析；复用音效上下文，不重复创建媒体音源。
  document.addEventListener('pointerdown', () => { if (!graph || graph.ctx.state !== 'running') activate(); }, { passive: true });
  document.addEventListener('keydown', () => { if (!graph || graph.ctx.state !== 'running') activate(); });
  audio.addEventListener('play', activate);
  for (const event of ['pause', 'ended', 'emptied', 'waiting']) audio.addEventListener(event, stopSpectrum);
  audio.addEventListener('playing', startSpectrum);
  document.addEventListener('visibilitychange', () => document.hidden ? stopSpectrum() : startSpectrum());
  window.addEventListener('pagehide', stopSpectrum);
  if (surfaces.length) {
    const visibilityObserver = new MutationObserver(startSpectrum);
    visibilityObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
    for (const element of [miniBar, audioPage]) {
      if (element) visibilityObserver.observe(element, { attributes: true, attributeFilter: ['hidden'] });
    }
    const sizeObserver = new ResizeObserver(() => { drawSpectrum(false); startSpectrum(); });
    for (const { canvas } of surfaces) sizeObserver.observe(canvas);
  }
  sync();
})();
