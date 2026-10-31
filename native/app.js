'use strict';
/* 聆境音乐 · NAS 媒体中心 —— 前端应用 */

/* ------------------------------- 基础工具 ------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (!n) return '';
  if (n >= 1024 ** 4) return (n / 1024 ** 4).toFixed(2) + ' TB';
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(1) + ' GB';
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(0) + ' MB';
  return (n / 1024).toFixed(0) + ' KB';
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i += 1) h = (h * 31 + String(str).charCodeAt(i)) | 0;
  return Math.abs(h);
}

const ICONS = {
  home: '<path d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5.2v-6.4H9.2V21H4a1 1 0 0 1-1-1z"/>',
  tv: '<rect x="2.2" y="4" width="19.6" height="13" rx="2.2"/><path d="M8 21h8"/>',
  film: '<rect x="2.5" y="3.5" width="19" height="17" rx="2.5"/><path d="M7 3.5v17M17 3.5v17M2.5 12h19M2.5 7.6h4.5M2.5 16.4h4.5M17 7.6h4.5M17 16.4h4.5"/>',
  sparkle: '<path d="M12 3l1.7 5.1L19 9.8l-5.3 1.7L12 16.6l-1.7-5.1L5 9.8l5.3-1.7z"/><path d="M18.4 15.2l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  mic: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.4M8.6 21.4h6.8"/>',
  doc: '<path d="M6 2.5h8l4 4v15H6z"/><path d="M14 2.5v4h4M9 12h6M9 16h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.6V9H8"/><path d="M12 8v4.4l3 1.8"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/>',
  settings: '<circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20.2 20.2l-3.6-3.6"/>',
  refresh: '<path d="M20.8 12a8.8 8.8 0 1 1-2.6-6.3"/><path d="M20.8 4.2v5h-5"/>',
  filter: '<path d="M3.5 6h17M6.5 12h11M10 18h4"/>',
  download: '<path d="M12 3.2v11.6"/><path d="M7.6 11.4 12 15.8l4.4-4.4"/><path d="M4 20h16"/>',
  folder: '<path d="M3 7.5a2 2 0 0 1 2-2h3.6l2 2.5H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  user: '<circle cx="12" cy="8.2" r="3.6"/><path d="M4.6 20.4a7.4 7.4 0 0 1 14.8 0"/>',
  play: '<path d="M8 5.2v13.6L19 12z" fill="currentColor" stroke="none"/>',
  right: '<path d="M9.5 5l7 7-7 7"/>',
  left: '<path d="M14.5 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  volume: '<path d="M4 9.5h3.4L12 5.4v13.2L7.4 14.5H4z"/><path d="M16 9.2a4 4 0 0 1 0 5.6"/>',
  mute: '<path d="M4 9.5h3.4L12 5.4v13.2L7.4 14.5H4z"/><path d="M16.5 9.5l4 5M20.5 9.5l-4 5"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  full: '<path d="M4 9.5V4h5.5M20 9.5V4h-5.5M4 14.5V20h5.5M20 14.5V20h-5.5"/>',
  fullExit: '<path d="M9.5 4v5.5H4M14.5 4v5.5H20M9.5 20v-5.5H4M14.5 20v-5.5H20"/>',
  pip: '<rect x="2.6" y="4.4" width="18.8" height="15.2" rx="2.4"/><rect x="12.6" y="11.2" width="7" height="6.4" rx="1.2" fill="currentColor" stroke="none"/>',
  volumeLow: '<path d="M4 9.5h3.4L12 5.4v13.2L7.4 14.5H4z"/><path d="M16 9.6a3.4 3.4 0 0 1 0 4.8"/>',
  skipPrev: '<path d="M18.5 5.2v13.6L8.6 12z" fill="currentColor" stroke="none"/><path d="M5.5 5v14"/>',
  skipNext: '<path d="M5.5 5.2v13.6L15.4 12z" fill="currentColor" stroke="none"/><path d="M18.5 5v14"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.6 6h.01M3.6 12h.01M3.6 18h.01"/>',
  note: '<path d="M9 17.6V6.3l9-1.9v9.4"/><circle cx="6.4" cy="18" r="2.5"/><circle cx="15.4" cy="16.2" r="2.5"/>',
  check: '<path d="M4.5 12.5 9.5 17.5 20 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9.2 7V4.6h5.6V7M6.6 7l.9 13h9l.9-13"/>',
  heart: '<path d="M12 20s-7-4.6-7-9.3A4 4 0 0 1 12 7.6 4 4 0 0 1 19 10.7C19 15.4 12 20 12 20z"/>',
  grid: '<rect x="3.6" y="3.6" width="7" height="7" rx="1.6"/><rect x="13.4" y="3.6" width="7" height="7" rx="1.6"/><rect x="3.6" y="13.4" width="7" height="7" rx="1.6"/><rect x="13.4" y="13.4" width="7" height="7" rx="1.6"/>',
  server: '<rect x="2.6" y="3.6" width="18.8" height="6.4" rx="1.8"/><rect x="2.6" y="14" width="18.8" height="6.4" rx="1.8"/><path d="M6.4 6.8h.01M6.4 17.2h.01"/>',
  link: '<path d="M10 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.4 6.4"/><path d="M14 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.8h.01"/>',
  wifi: '<path d="M4.5 9.4a11 11 0 0 1 15 0M7.6 12.8a6.6 6.6 0 0 1 8.8 0M12 17.4h.01"/>',
  tag: '<path d="M3.5 11.4V4.5h6.9l9.1 9.1-6.9 6.9z"/><circle cx="7.4" cy="8" r="1.2"/>',
  moon: '<path d="M20.5 14.4A8.2 8.2 0 0 1 9.6 3.5 8.2 8.2 0 1 0 20.5 14.4z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.2v2.3M12 19.5v2.3M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.2 12h2.3M19.5 12h2.3M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>',
  fire: '<path d="M12 3c.6 2.4-1.4 3.7-1.4 5.8A2.6 2.6 0 0 0 13.2 11c.1-1 .7-1.7 1.4-2.1.4 1.9 2.4 2.6 2.4 5a4 4 0 1 1-8 0c0-2.3 1.3-3.5 2-4.7C11.7 7.7 11.4 5 12 3z"/>'
};

function icon(name, size = 18, extra = '') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" ${extra}>${ICONS[name] || ''}</svg>`;
}

/* 直接改写内联 SVG 的 path d，避免替换整段 innerHTML 破坏 Youku 风格实心图标 */
function setIconD(id, d) {
  const p = document.getElementById(id);
  if (p) p.setAttribute('d', d);
}
const PLAY_D = 'M8 5l11 7-11 7z';
const PAUSE_D = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z';
const AU_VOL_HIGH = 'M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 010 8M19 5a10 10 0 010 14';
const AU_VOL_LOW = 'M3 9h4l5-4v14l-5-4H3zM16 9a4 4 0 010 6';
const AU_VOL_MUTE = 'M3 9h4l5-4v14l-5-4H3zM16 9l5 6m0-6-5 6';
const VOL_HIGH = 'M4 9v6h4l5 4V5L8 9H4zM17 8a5 5 0 010 8';
const VOL_LOW = 'M4 9v6h4l5 4V5L8 9H4zM17 11.5a2 2 0 010 1';
const VOL_MUTE = 'M4 9v6h4l5 4V5L8 9H4zM16 9.5l5 5M21 9.5l-5 5';
const FULL_D = 'M4 10V4h6M20 10V4h-6M4 14v6h6M20 14v6h-6';
const FULL_EXIT_D = 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5';

/* -------------------------------- 主题切换 -------------------------------- */
const ACCENT_COLORS = [
  ['blue', '海洋蓝', '#0078e8'], ['cyan', '晴空青', '#00b5df'],
  ['teal', '翡翠青', '#00c4ae'], ['green', '森林绿', '#00cc78'],
  ['violet', '鸢尾紫', '#8057f2'], ['coral', '珊瑚橙', '#ff6548'],
  ['orange', '暖橙', '#ff9200'], ['amber', '琥珀金', '#f2b600'],
  ['rose', '蔷薇红', '#ef0050'], ['pink', '莓果粉', '#f20b9b']
];
function applyAccent(value, persist = true) {
  const color = ACCENT_COLORS.find(([id]) => id === value) || ACCENT_COLORS[0];
  document.documentElement.dataset.accent = color[0];
  try { if (persist) localStorage.setItem('yy_accent', color[0]); } catch (e) {}
  document.querySelectorAll('[data-act="accent"]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.color === color[0]));
  });
  const label = document.querySelector('#accentName');
  if (label) label.textContent = color[1];
}
const THEME_KEY = 'yy_theme';
function applyTheme(t, persist = true) {
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  try {
    if (persist) localStorage.setItem(THEME_KEY, t);
  } catch (e) {}
}
function initTheme() {
  let accent = 'blue';
  try { accent = localStorage.getItem('yy_accent') || accent; } catch (e) {}
  applyAccent(accent, false);
  let t = null;
  try {
    t = localStorage.getItem(THEME_KEY);
  } catch (e) {}
  if (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) t = 'light';
  applyTheme(t === 'light' ? 'light' : 'dark', false);
  if (window.matchMedia && !initTheme.bound) {
    initTheme.bound = true;
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', event => {
      try { if (localStorage.getItem(THEME_KEY)) return; } catch (e) {}
      applyTheme(event.matches ? 'light' : 'dark', false);
    });
  }
}
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
function toggleTheme() {
  applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
  renderTopbar();
  renderSidebar();
}

/* --------------------------------- 状态 --------------------------------- */
const state = {
  boot: null,
  lib: null,
  taskProgressDismissed: (() => { try { return localStorage.getItem('yy_hide_task_progress') === '1'; } catch (e) { return false; } })(),
  detail: null,
  detailId: null,
  detailSeason: null,
  route: { name: 'home', id: null, type: null, q: '' },
  heroIndex: 0,
  heroTimer: null,
  sort: 'recent',
  filter: { type: 'all', year: 'all' },
  favorites: new Set(JSON.parse(localStorage.getItem('yy_fav') || '[]')),
  browse: null,
  pollTimer: null,
  wasScanning: false
};

async function api(pathname, opts = {}) {
  if (window.Lingjing) return window.Lingjing.request(pathname, opts);
  const res = await fetch(pathname, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `请求失败 (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function toast(msg, ms = 2400) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), ms);
}

/* -------------------------------- 图片处理 -------------------------------- */
function posterURL(item) {
  if (item.poster) return item.poster;
  // 音乐没有在线封面，art 指向同目录的 cover/folder/albumart，404 时由 imgTag 的 onerror 回落占位图
  if (item.art) return item.art;
  return `/api/placeholder?t=${encodeURIComponent(item.title)}&s=${hashCode(item.id || item.title)}`;
}
function proxyURL(url) {
  if (window.Lingjing) return window.Lingjing.imageURL(url);
  return url ? `/api/img?u=${encodeURIComponent(url)}` : '';
}
function imgTag(item, cls = '') {
  const direct = posterURL(item);
  const proxy = item.poster ? proxyURL(item.poster) : '';
  const ph = `/api/placeholder?t=${encodeURIComponent(item.title)}&s=${hashCode(item.id || item.title)}`;
  return `<img class="${cls}" src="${esc(direct)}" data-proxy="${esc(proxy)}" data-ph="${esc(ph)}" alt="${esc(item.title)}" loading="lazy" />`;
}

document.addEventListener(
  'error',
  (e) => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    if (img.dataset.proxy && !img.dataset.tried) {
      img.dataset.tried = '1';
      img.src = img.dataset.proxy;
    } else if (img.dataset.ph && img.src !== img.dataset.ph) {
      img.src = img.dataset.ph;
    }
  },
  true
);

/* -------------------------------- 侧边栏 -------------------------------- */
const NAV_MAIN = [{ id: 'music', label: '我的音乐', icon: 'note', type: 'music' }];
const NAV_MINE = [{ id: 'settings', label: '设置', icon: 'settings' }];

function renderSidebar() {
  const connected = state.boot?.connected;
  const account = state.boot?.server?.account;
  const onMusic = state.route.name === 'list' && state.route.type === 'music';
  const selected = onMusic ? (MUSIC.favoriteOnly ? 'favorites' : MUSIC.localOnly ? 'local' : MUSIC.sourcePath ? 'source' : MUSIC.tab) : '';
  const tile = (view, label, symbol) => `<button class="shell-tile ${selected === view ? 'active' : ''}" data-shell-view="${view}" aria-label="${label}" title="${label}">${icon(symbol, 21)}<span>${label}</span></button>`;
  const sourceRows = (state.boot?.sources || []).map(source => {
    const path = source.provider === 'nas' ? `nas:${source.path}` : source.path;
    return `<button class="shell-source ${MUSIC.sourcePath === path && onMusic ? 'active' : ''}" data-shell-view="source" aria-label="${esc(source.name)}" data-path="${esc(path)}" title="${esc(source.path)}"><span class="shell-source-icon">${icon(source.provider === 'nas' ? 'server' : 'folder', 17)}</span><span>${esc(source.name)}</span></button>`;
  }).join('');
  $('#sidebar').innerHTML = `
    <div class="brand"><button class="shell-profile" data-act="account" title="账户与音乐库设置"><img src="/brand.png" width="40" height="40" alt="聆境音乐"><span class="shell-profile-copy"><b>${esc(connected && account ? account : '聆境音乐')}</b><small>${connected ? '已连接群晖' : '我的音乐空间'}</small></span>${icon('right', 14)}</button></div>
    <div class="shell-quicknav">${tile('song', '音乐馆', 'home')}${tile('artist', '歌手', 'mic')}${tile('album', '专辑', 'grid')}<button class="shell-tile" data-act="${connected ? 'account' : 'login'}" title="群晖音乐库">${icon('server', 21)}<span>群晖</span></button></div>
    <button class="shell-add" data-act="local" aria-label="添加音乐文件夹" title="添加音乐文件夹">${icon('plus', 20)}</button>
    <nav class="shell-library" aria-label="我的音乐"><button class="shell-link ${selected === 'favorites' ? 'active' : ''}" data-shell-view="favorites" aria-label="喜欢的音乐">${icon('heart', 21)}<span>喜欢的音乐</span><small>${state.favorites.size || ''}</small></button><button class="shell-link ${selected === 'local' ? 'active' : ''}" data-shell-view="local" aria-label="本地音乐">${icon('download', 21)}<span>本地音乐</span></button></nav>
    <div class="shell-section-label"><span>音乐目录</span><button data-act="local" title="添加音乐目录" aria-label="添加音乐目录">${icon('plus', 16)}</button></div>
    <div class="shell-sources">${sourceRows || '<p class="shell-no-source">导入文件夹，建立音乐库</p>'}</div>
    <div class="shell-footer"><button class="shell-footer-button ${state.route.name === 'settings' ? 'active' : ''}" data-act="settings" aria-label="设置" title="设置">${icon('settings', 20)}</button><button class="shell-footer-button" data-act="theme" aria-label="切换亮暗主题" title="切换亮暗主题">${icon(currentTheme() === 'light' ? 'moon' : 'sun', 20)}</button><span>${(state.boot?.counts?.music || 0).toLocaleString()} 首歌曲</span></div>`;
  syncMusicPlayback();
}

/* -------------------------------- 顶栏 -------------------------------- */
function renderTopbar() {
  const connected = state.boot && state.boot.connected;
  const account = (state.boot && state.boot.server && state.boot.server.account) || '';
  const theme = currentTheme();
  $('#topbar').innerHTML = `
    <div class="shell-history"><button class="shell-history-button" data-shell-history="back" aria-label="返回" title="返回">${icon('left', 22)}</button><button class="shell-history-button" data-shell-history="forward" aria-label="前进" title="前进">${icon('right', 22)}</button></div>
    <div class="search">
      ${icon('search', 16)}
      <input id="searchInput" type="text" placeholder="搜索我的媒体库：片名、演员、类型" value="${esc(state.route.q || '')}" />
      <button class="search-btn" data-act="do-search" title="搜索">${icon('search', 15)}</button>
    </div>
    <div class="toolbar">
      <button class="tool theme-btn" data-act="theme" title="切换深色 / 浅色模式">
        ${icon(theme === 'light' ? 'moon' : 'sun', 18)}<span>${theme === 'light' ? '暗色' : '亮色'}</span>
      </button>
      <button class="tool" data-act="scan" title="重新扫描媒体库">${icon('refresh', 19)}<span>刷新</span></button>
      <button class="tool" data-act="local" title="添加本机目录">${icon('folder', 19)}<span>本机</span></button>
      <button class="tool" data-act="settings" title="设置">${icon('settings', 19)}<span>设置</span></button>

    </div>
    ${window.__TAURI__ && window.LingjingPlatform === 'windows' ? `<div class="window-controls" role="group" aria-label="窗口控制">
      <button class="window-control" data-window-action="minimize" aria-label="最小化" title="最小化"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10"/></svg></button>
      <button class="window-control" data-window-action="toggleMaximize" aria-label="最大化或还原" title="最大化或还原"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1"/></svg></button>
      <button class="window-control window-close" data-window-action="close" aria-label="关闭窗口" title="关闭"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>
    </div>` : ''}`;
  syncTopbarSearch();
  syncScanButtons();
}

function isMusicSearchContext() {
  return state.route.name === 'list' && state.route.type === 'music';
}
function syncTopbarSearch() {
  const input = $('#searchInput');
  if (!input) return;
  const music = isMusicSearchContext();
  input.placeholder = '搜索音乐';
  input.setAttribute('aria-label', '搜索歌曲、歌手、专辑');
  input.value = music ? MUSIC.q : state.route.q || '';
}
function filterCurrentMusic(query) {
  MUSIC.q = query;
  if (MUSIC.tab !== 'song') { MUSIC.tab = 'song'; paintMusic(); }
  else paintMusicBody();
  const filters = $('.mp-filters');
  if (filters) filters.outerHTML = musicFiltersHTML();
  const top = $('#searchInput');
  if (top && top.value !== query) top.value = query;
}
function submitTopbarSearch() {
  const query = $('#searchInput')?.value || '';
  if (isMusicSearchContext()) { filterCurrentMusic(query); return; }
  MUSIC.q = query.trim();
  MUSIC.tab = 'song';
  MUSIC.shellNavigation = true;
  go('#/list/music');
}

/* -------------------------------- 路由 -------------------------------- */
function go(hash) {
  if (location.hash === hash) {
    route();
  } else {
    location.hash = hash;
  }
}

// 页面只保留一段入场动画；快速导航会取消上一段，避免叠加与闪回。
let routeMotion = null;
let routeVersion = 0;
function animateRouteView() {
  const view = $('#view');
  if (routeMotion) { routeMotion.cancel(); routeMotion = null; }
  if (view.hidden || !view.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const animation = view.animate([
    { opacity: .35, transform: 'translateY(14px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ], { duration: 300, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  routeMotion = animation;
  animation.onfinish = () => { if (routeMotion === animation) routeMotion = null; };
}

function route() {
  const version = ++routeVersion;
  clearInterval(state.heroTimer);
  const raw = (location.hash || '#/').replace(/^#/, '');
  const [pathPart, queryStr] = raw.split('?');
  const query = new URLSearchParams(queryStr || '');
  const segs = pathPart.split('/').filter(Boolean);
  const view = $('#view');

  if (!state.boot) return;
  if (state.boot.needLogin || segs[0] === 'login') {
    state.route = { name: 'login' };
    renderSidebar();
    renderLogin();
    animateRouteView();
    return;
  }

  if (segs[0] !== 'play' && AU.open) hideAudioPage();
  if (segs[0] !== 'play' && !$('#player').hidden) closePlayer();

  if (segs[0] === 'item' || segs[0] === 'play') {
    state.route = { name: 'item', id: segs[1] };
    renderSidebar();
    renderDetail(segs[1]);
    if (segs[0] === 'play') {
      setTimeout(() => {
        if (version === routeVersion) openPlayback(segs[1], Number(segs[2] || 0));
      }, 60);
    }
  } else if (segs[0] === 'list') {
    state.route = { name: 'list', type: segs[1] || 'all', filtering: query.get('filter') === '1' };
    renderSidebar();
    if (segs[1] === 'music') renderMusic();
    else if (state.route.filtering || ['continue', 'favorites'].includes(state.route.type)) renderList(state.route.type);
    else renderChannel(state.route.type);
  } else if (segs[0] === 'search') {
    state.route = { name: 'search', q: query.get('q') || '' };
    renderSidebar();
    renderSearch(state.route.q);
  } else if (segs[0] === 'settings') {
    state.route = { name: 'settings' };
    renderSidebar();
    renderSettings();
  } else {
    state.route = { name: 'list', type: 'music' };
    renderSidebar();
    renderMusic();
  }
  $('#main').scrollTo({ top: 0, behavior: 'instant' });
  syncTopbarSearch();
  if (view) view.dataset.rendered = '1';
  if (segs[0] !== 'play') animateRouteView();
  syncMiniBar();
}

/* -------------------------------- 首页 -------------------------------- */
function rowHTML(row, opts = {}) {
  return `<section class="row" data-row="${esc(row.id)}">
    <div class="row-head">
      <div>
        <div class="row-title">${esc(row.title)}</div>
      </div>
      <button class="row-more" data-act="more" data-type="${esc(row.id)}">更多 ${icon('right', 12)}</button>
    </div>
    <button class="row-arrow left" data-act="scroll" data-dir="-1" aria-label="向左" hidden>${icon('left', 16)}</button>
    <div class="row-scroll">${row.items.map((i) => cardHTML(i)).join('')}</div>
    <button class="row-arrow right" data-act="scroll" data-dir="1" aria-label="向右" hidden>${icon('right', 16)}</button>
  </section>`;
}

let rowSizeObserver;
function syncRowNavigation() {
  if (rowSizeObserver) rowSizeObserver.disconnect();
  rowSizeObserver = new ResizeObserver((entries) => {
    entries.forEach(({ target }) => updateRowNavigation(target));
  });
  $$('.row-scroll').forEach((scroller) => {
    updateRowNavigation(scroller);
    rowSizeObserver.observe(scroller);
    scroller.addEventListener('scroll', () => updateRowNavigation(scroller), { passive: true });
  });
}

function updateRowNavigation(scroller) {
  const row = scroller.closest('.row');
  const maxScroll = scroller.scrollWidth - scroller.clientWidth;
  $('.row-arrow.left', row).hidden = maxScroll <= 1 || scroller.scrollLeft <= 1;
  $('.row-arrow.right', row).hidden = maxScroll <= 1 || scroller.scrollLeft >= maxScroll - 1;
}

function cardHTML(item) {
  const isMusic = item.type === 'music';
  const isAlbum = item.kind === 'album';
  const isSeries = item.kind === 'series';
  const newest = item.newestEpisode || item.episodeCount || 0;
  let badge = '';
  let badgeCls = '';
  let sub = '';
  const recent = item.mtime && Date.now() - item.mtime < 1000 * 60 * 60 * 24 * 30;
  if (isMusic) {
    badge = isAlbum ? `${item.episodeCount || 1} 首` : '音乐';
    badgeCls = isAlbum ? 'blue' : 'dark';
    sub = [item.artist || '音乐', isAlbum ? `${item.episodeCount} 首` : ''].filter(Boolean).join(' · ');
  } else if (isSeries && item.episodeCount > 1) {
    badge = `更新至${newest}集`;
  } else if (recent) {
    badge = '新上线';
    badgeCls = 'blue';
  } else {
    badge = item.label || '电影';
    badgeCls = 'dark';
  }
  if (!sub) {
    sub = isSeries ? `${item.label} · 共${item.episodeCount}集` : `${item.label}${item.year ? ' · ' + item.year : ''}`;
  }
  const prog = item.progress && item.progress.percent > 0
    ? `<div class="card-progress"><i style="width:${Math.min(100, item.progress.percent)}%"></i></div>`
    : '';
  return `<article class="card" data-act="open" data-id="${item.id}">
    <div class="card-poster ${isMusic ? 'card-music' : ''}">
      ${imgTag(item)}
      <div class="card-shade"></div>
      <div class="card-badge ${badgeCls}">${esc(badge)}</div>
      ${item.rating ? `<div class="card-score">${item.rating.toFixed(1)}</div>` : ''}
      <div class="card-meta">
        <div class="card-name">${esc(item.title)}</div>
        <div class="card-sub">${esc(sub)}</div>
      </div>
      <div class="card-hover"><i>${icon('play', 16)}</i></div>
      ${prog}
    </div>
  </article>`;
}

function heroHTML(item) {
  const hasBackdrop = !!item.backdrop;
  const raw = item.backdrop || item.poster;
  const bg = raw ? proxyURL(raw) : `/api/placeholder?t=${encodeURIComponent(item.title)}&s=${hashCode(item.id)}`;
  const meta = [];
  if (item.rating) meta.push(`<span class="score">${item.rating.toFixed(1)}</span>`);
  if (item.year) meta.push(`<span>${item.year}</span>`);
  if (item.kind === 'series') meta.push(`<span>${item.episodeCount} 集</span>`);
  if (item.genres && item.genres.length) meta.push(item.genres.slice(0, 3).map((g) => `<span class="chip">${esc(g)}</span>`).join(''));
  if (item.progress) meta.push(`<span class="chip">上次看到 ${fmtTime(item.progress.position)}</span>`);
  return `<div class="hero-bg ${hasBackdrop ? '' : 'blurred'}" style="background-image:url('${esc(bg)}')"></div>
    <div class="hero-veil"></div>
    ${!hasBackdrop ? `<div class="hero-cover">${imgTag(item)}</div>` : ''}
    <div class="hero-content">
      <h1 class="hero-title">${esc(item.title)}</h1>
      <div class="hero-meta">${meta.join('')}</div>
      <div class="hero-desc">${esc(item.overview || '本地媒体库中的影片，点击开始播放。')}</div>
      <div class="hero-actions">
        <button class="btn-play" data-act="play" data-id="${item.id}" data-ep="${item.progress ? item.progress.epIndex : 0}">
          ${icon('play', 14)} ${item.progress ? '继续播放' : '立即播放'}
        </button>
        <button class="btn-ghost" data-act="open" data-id="${item.id}">${icon('info', 15)} 详情</button>
      </div>
    </div>`;
}

function rankHTML(items) {
  if (!items.length) return '';
  return `<section class="rank">
    <div class="row-head">
      <div class="row-title"><i class="rank-flame">${icon('fire', 14)}</i>热播榜</div>
      <button class="row-more" data-act="more" data-type="all">查看全部 ${icon('right', 12)}</button>
    </div>
    <div class="rank-list">
      ${items
        .map(
          (i, idx) => `
        <button class="rank-item ${idx < 3 ? 'top' : ''}" data-act="open" data-id="${i.id}">
          <span class="rank-no">${idx + 1}</span>
          <div class="rank-poster">${imgTag(i)}</div>
          <div class="rank-info">
            <div class="rank-name">${esc(i.title)}</div>
            <div class="rank-sub">
              ${i.rating ? `<span class="rank-score">${i.rating.toFixed(1)}</span>` : ''}
              ${i.year ? `<span>${i.year}</span>` : ''}
              <span>${esc(i.label || '')}</span>
            </div>
          </div>
        </button>`
        )
        .join('')}
    </div>
  </section>`;
}

function renderHome() {
  const view = $('#view');
  const lib = state.lib;
  if (!lib) {
    view.innerHTML = `<div class="loading-row" style="padding-top:30px">${'<div class="skeleton"></div>'.repeat(6)}</div>`;
    return;
  }
  if (!lib.total) {
    view.innerHTML = emptyLibraryHTML();
    return;
  }
  renderChannel('all');
}

function renderChannel(type) {
  const items = sortItems(allItems().filter((item) => item.type !== 'music' && (type === 'all' || item.type === type)));
  const view = $('#view');
  if (!items.length) {
    view.innerHTML = `<div class="empty"><h3>这里还没有影片</h3><p>添加音乐目录后即可浏览。</p></div>`;
    return;
  }
  const featured = items.slice(0, 10);
  state.heroIndex = Math.max(0, Math.min(state.heroIndex, featured.length - 1));
  const paintFeature = () => {
    const hero = $('#hero');
    if (!hero) return;
    hero.innerHTML = heroHTML(featured[state.heroIndex]);

  };
  const rows = type === 'all'
    ? (state.lib.rows || []).filter((row) => row.id !== 'music').map((row) => ({ ...row, items: row.items.filter((item) => item.type !== 'music') })).filter((row) => row.items.length)
    : [{ id: type, title: '最近更新', items: items.slice(0, 24) },
       { id: type, title: '高分佳作', items: [...items].filter((item) => item.rating).sort((a, b) => b.rating - a.rating).slice(0, 18) }].filter((row) => row.items.length);
  view.innerHTML = `<div class="channel-showcase">
    <div class="hero" id="hero"></div>
    <div class="feature-strip" aria-label="推荐影片">${featured.map((item, index) => `<button class="feature-choice" data-act="open" data-id="${esc(item.id)}" data-i="${index}" aria-label="查看详情：${esc(item.title)}">${imgTag(item)}<span class="feature-caption">${esc(item.title)}</span></button>`).join('')}</div>
    </div><div class="rows">${rows.map((row) => rowHTML(row)).join('')}</div>`;
  syncRowNavigation();
  $$('.feature-choice', view).forEach((button, index) => {
    const preview = () => {
      if (state.heroIndex === index) return;
      state.heroIndex = index;
      paintFeature();
    };
    button.addEventListener('mouseenter', preview);
    button.addEventListener('focus', preview);
  });
  paintFeature();
  clearInterval(state.heroTimer);
  if (featured.length > 1) state.heroTimer = setInterval(() => {
    if (!$('#hero') || view.matches(':hover') || view.contains(document.activeElement)) return;
    state.heroIndex = (state.heroIndex + 1) % featured.length;
    paintFeature();
  }, 7000);
}

function emptyLibraryHTML() {
  const scanning = state.boot && state.boot.scanning;
  return `<div class="empty">
    <h3>${scanning ? '正在读取你的媒体库…' : '还没有音乐目录'}</h3>
    <p>${scanning ? '正在扫描目录并匹配影片信息，稍等片刻。' : '添加群晖上的视频或音乐目录（如 /video/电视剧、/music），系统会自动识别分类、抓取封面与简介。'}</p>
    ${scanning ? '' : `<button class="btn-solid" data-act="local">${icon('plus', 14)} 添加音乐目录</button>`}
  </div>`;
}

/* -------------------------------- 分类页 -------------------------------- */
function allItems() {
  if (!state.lib) return [];
  const map = new Map();
  // 后端给了全量 lists 就用它（首页 rows 每类只截 18 条，分类页会漏）
  if (state.lib.lists) {
    Object.values(state.lib.lists).forEach((arr) => (arr || []).forEach((i) => map.set(i.id, i)));
    if (map.size) return Array.from(map.values());
  }
  if (!state.lib.rows) return [];
  for (const row of state.lib.rows) {
    for (const item of row.items) map.set(item.id, item);
  }
  return Array.from(map.values());
}

const TYPE_TITLES = {
  all: '全部影片', tv: '电视剧', movie: '电影', anime: '动漫',
  variety: '综艺', doc: '纪录片', short: '短剧', music: '音乐',
  continue: '继续观看', favorites: '我的收藏'
};

function sortItems(items) {
  const arr = [...items];
  if (state.sort === 'rating') arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else if (state.sort === 'name') arr.sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh'));
  else arr.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  return arr;
}

function yearBuckets(items) {
  const set = new Set();
  items.forEach((i) => {
    if (i.year) set.add(Number(i.year));
  });
  const arr = [...set].sort((a, b) => b - a);
  const recent = arr.filter((y) => y >= 2015);
  const buckets = [];
  recent.slice(0, 8).forEach((y) => buckets.push({ k: String(y), label: String(y) }));
  if (arr.some((y) => y < 2015)) buckets.push({ k: 'older', label: '更早' });
  return buckets;
}
function matchYear(year, k) {
  year = Number(year);
  if (!year) return false;
  if (k === 'older') return year < 2015;
  return String(year) === k;
}

function renderList(type) {
  const view = $('#view');
  if (state.filter.type !== type) {
    state.filter.type = type;
    state.filter.year = 'all';
  }
  let items = allItems().filter((item) => item.type !== 'music');
  if (type === 'continue') items = items.filter((i) => i.progress && i.type !== 'music');
  else if (type === 'favorites') items = items.filter((i) => state.favorites.has(i.id));
  else if (type !== 'all') items = items.filter((i) => i.type === type);

  const yk = state.filter.year;
  if (yk && yk !== 'all') items = items.filter((i) => matchYear(i.year, yk));

  if (type === 'continue') items.sort((a, b) => (b.progress.updatedAt || 0) - (a.progress.updatedAt || 0));
  else items = sortItems(items);

  const years = yearBuckets(allItems().filter((item) => item.type !== 'music'));
  const typeChips = ['all', 'tv', 'movie', 'anime', 'variety', 'doc', 'short'].filter((t) => {
    if (t === 'all') return true;
    return allItems().some((i) => i.type === t);
  });

  view.innerHTML = `
    <div class="filterbar">
      <div class="fb-row"><span class="fb-k">类型</span><div class="fb-chips">
        ${typeChips
          .map(
            (t) =>
              `<button class="fb-chip ${state.filter.type === t ? 'on' : ''}" data-act="ftype" data-type="${t}">${TYPE_TITLES[t] || t}</button>`
          )
          .join('')}
      </div></div>
      <div class="fb-row"><span class="fb-k">年份</span><div class="fb-chips">
        <button class="fb-chip ${yk === 'all' || !yk ? 'on' : ''}" data-act="fyear" data-year="all">全部</button>
        ${years
          .map(
            (b) =>
              `<button class="fb-chip ${yk === b.k ? 'on' : ''}" data-act="fyear" data-year="${b.k}">${b.label}</button>`
          )
          .join('')}
      </div></div>
      <div class="fb-row fb-sort"><span class="fb-k">排序</span><div class="fb-chips">
        <button class="fb-chip ${state.sort === 'recent' ? 'on' : ''}" data-act="sort" data-sort="recent">最近更新</button>
        <button class="fb-chip ${state.sort === 'rating' ? 'on' : ''}" data-act="sort" data-sort="rating">评分</button>
        <button class="fb-chip ${state.sort === 'name' ? 'on' : ''}" data-act="sort" data-sort="name">名称</button>
      </div></div>
    </div>
    <div class="page-head">
      <div class="page-title">${esc(TYPE_TITLES[type] || '影片')}</div>
      <div class="page-sub">${items.length} 部</div>
    </div>
    ${items.length
      ? `<div class="grid">${items.map((i) => cardHTML(i)).join('')}</div>`
      : `<div class="empty"><h3>这里还没有内容</h3><p>${type === 'favorites' ? '在影片详情页点击「收藏」即可加入。' : '调整筛选条件，或添加更多音乐目录。'}</p></div>`}`;
}

/* -------------------------------- 搜索页 -------------------------------- */
function renderSearch(q) {
  const view = $('#view');
  const key = String(q || '').trim().toLowerCase();
  const items = !key
    ? []
    : allItems().filter((i) => {
        if (i.type === 'music') return false;
        const hay = [i.title, i.rawTitle, i.artist, i.year, (i.genres || []).join(' '), i.label].join(' ').toLowerCase();
        return hay.includes(key);
      });
  view.innerHTML = `
    <div class="page-head">
      <div class="page-title">搜索「${esc(q)}」</div>
      <div class="page-sub">${items.length} 个结果</div>
    </div>
    ${items.length
      ? `<div class="grid">${items.map((i) => cardHTML(i)).join('')}</div>`
      : `<div class="empty"><h3>没有找到相关内容</h3><p>试试更短的关键词，或先在设置里刷新媒体库。</p></div>`}`;
}

/* -------------------------------- 详情页 -------------------------------- */
function detailHTML(d) {
  const base = d.item;
  const baseMeta = d.meta || {};
  const fav = state.favorites.has(base.id);
  const eps = d.episodes || [];
  const prog = d.progress;
  const isMusic = base.type === 'music';
  // 按季分组：同一部剧的多季要在详情页切换，而不是把两季的集混在一个网格里
  const seasons = [...new Set(eps.map((e) => e.season || 1))].sort((a, b) => a - b);
  const multiSeason = seasons.length > 1;
  let curSeason = state.detailSeason;
  if (!seasons.includes(curSeason)) {
    curSeason = (prog && prog.epIndex != null && eps[prog.epIndex]) ? (eps[prog.epIndex].season || 1) : seasons[0];
  }
  if (!seasons.includes(curSeason)) curSeason = seasons[0] || 1;

  // 每一季的封面 / 简介 / 评分 / 演职都不同（豆瓣按季分条目），切季就要换
  const sMeta = (d.seasonMeta && d.seasonMeta[curSeason]) || null;
  const meta = sMeta || baseMeta;
  const seasonSuffix = multiSeason ? ` 第${curSeason}季` : '';
  // 豆瓣封面有防盗链，必须走本地图片代理，否则直接 403
  const seasonPoster = sMeta && sMeta.poster
    ? (/^https?:/i.test(sMeta.poster) ? proxyURL(sMeta.poster) : sMeta.poster)
    : '';
  let item = base;
  if (sMeta) {
    item = {
      ...base,
      title: sMeta.title || `${base.title}${seasonSuffix}`,
      year: sMeta.year || base.year,
      rating: sMeta.rating || base.rating,
      overview: sMeta.overview || base.overview,
      poster: seasonPoster || base.poster,
      backdrop: sMeta.backdrop || base.backdrop,
      genres: (sMeta.genres && sMeta.genres.length) ? sMeta.genres : base.genres
    };
  } else if (seasonSuffix) {
    item = { ...base, title: `${base.title}${seasonSuffix}` };
  }
  // 详情封面按当前曲目获取，与播放页共用地址，避免旧占位图缓存。
  const activeTrack = isMusic ? auIndexInfo() : null;
  const coverEp = activeTrack && activeTrack.id === base.id ? activeTrack.ep || 0 : (prog && prog.epIndex) || 0;
  const musicArt = isMusic ? `/api/cover?item=${encodeURIComponent(base.id)}&ep=${coverEp}&fallback=0` : '';
  if (isMusic) item = { ...item, poster: '', art: musicArt };
  const rawBg = item.backdrop || item.poster;
  const bg = musicArt || (rawBg ? proxyURL(rawBg) : `/api/placeholder?t=${encodeURIComponent(item.title)}&s=${hashCode(item.id)}`);
  const seasonEps = multiSeason ? eps.filter((e) => (e.season || 1) === curSeason) : eps;
  const curEp = seasonEps[0] || eps[0] || null;
  // 只有「当前这一季」的播放进度才算数，否则切到第2季还会显示「继续观看第1季第2集」
  const progEp = (prog && prog.epIndex != null && eps[prog.epIndex]) ? eps[prog.epIndex] : null;
  const progInSeason = progEp && (!multiSeason || (progEp.season || 1) === curSeason) ? progEp : null;
  const playEp = progInSeason ? progEp.index : (seasonEps[0] ? seasonEps[0].index : 0);
  const multi = item.kind === 'series' || item.kind === 'album';
  const unit = item.kind === 'album' ? '首' : '集';

  const metaBits = [];
  if (item.rating) metaBits.push(`<span class="score">${item.rating.toFixed(1)}</span>`);
  if (item.year) metaBits.push(`<span>${item.year}</span>`);
  if (meta.countries && meta.countries.length) metaBits.push(`<span>${esc(meta.countries.slice(0, 2).join(' / '))}</span>`);
  if (isMusic && item.artist) metaBits.push(`<span>${esc(item.artist)}</span>`);
  if (item.kind === 'album') metaBits.push(`<span>共 ${item.episodeCount} 首</span>`);
  else if (item.kind === 'series') metaBits.push(`<span>共 ${multiSeason ? seasonEps.length : item.episodeCount} 集${item.seasonCount > 1 ? ` · ${item.seasonCount} 季` : ''}</span>`);
  else if (meta.runtime) metaBits.push(`<span>${meta.runtime} 分钟</span>`);
  if (item.size) metaBits.push(`<span>${fmtSize(item.size)}</span>`);
  if (meta.director && meta.director.length) metaBits.push(`<span>导演 ${esc(meta.director.join(' / '))}</span>`);

  const genreChips = (item.genres || []).map((g) => `<span class="chip">${esc(g)}</span>`).join('');
  const cast = (meta.cast || []).slice(0, 8);
  const similar = (d.similar || []).slice(0, 12);

  return `<div class="detail">
    <div class="detail-hero">
      <div class="detail-bg" style="background-image:url('${esc(bg)}')"></div>
    </div>
    <div class="detail-wrap">
      <div class="detail-poster">${imgTag(item)}</div>
      <div class="detail-main">
        <div class="detail-title">${esc(item.title)}${item.year ? `<span class="year">${item.year}</span>` : ''}</div>
        <div class="detail-meta">${metaBits.join('<span class="dot"></span>')}${genreChips}</div>
        <div class="detail-desc clamp" id="detailDesc">${esc(
          item.overview || (isMusic ? `${item.artist ? item.artist + ' · ' : ''}${item.kind === 'album' ? '共 ' + item.episodeCount + ' 首' : '单曲'}，本地音乐文件` : '暂无简介，可在设置中配置元数据源后自动获取，或点击「重新匹配」手动指定。')
        )}</div>
        ${item.overview && item.overview.length > 120 ? `<span class="more" data-act="expand">展开全部</span>` : ''}
        <div class="detail-actions">
          <button class="btn-solid" data-act="play" data-id="${item.id}" data-ep="${playEp}">
            ${icon('play', 14)} ${progInSeason ? `继续${isMusic ? '播放' : '观看'} ${multi ? `${multiSeason ? `第${curSeason}季 · ` : ''}第${progInSeason.episode}${unit}` : ''}` : (isMusic ? (item.kind === 'album' ? '播放专辑' : '播放') : (multi ? `播放 第${eps[playEp] ? eps[playEp].episode : 1}${unit}` : '立即播放'))}
          </button>
          ${multi && eps.length > 1 ? `<button class="btn-line" data-act="jump-eps">${icon('list', 15)} ${isMusic ? '曲目' : '选集'}（${eps.length}）</button>` : ''}
          <button class="btn-line ${fav ? 'on' : ''}" data-act="fav" data-id="${item.id}">${icon('heart', 15)} ${fav ? '已收藏' : '收藏'}</button>
          ${isMusic ? '' : `<button class="btn-line" data-act="rematch" data-id="${item.id}">${icon('tag', 15)} 重新匹配</button>`}
        </div>
      </div>
    </div>
    ${multi && eps.length
      ? `<div class="section" id="epSection">
          <div class="section-head">
            <div class="section-title">${isMusic ? '曲目' : '选集'}</div>
            <div class="section-extra">共 ${seasonEps.length} ${unit}${progInSeason ? ` · 上次${isMusic ? '播放' : '看到'}第 ${progInSeason.episode} ${unit}` : ''}</div>
          </div>
          ${multiSeason ? `<div class="season-tabs">${seasons.map((s) => `<button class="season-tab${s === curSeason ? ' on' : ''}" data-act="season" data-season="${s}">第${s}季<span class="season-count">${eps.filter((e) => (e.season || 1) === s).length}</span></button>`).join('')}</div>` : ''}
          <div class="eps ${isMusic ? 'eps-tracks' : ''}">${seasonEps.map((e) => `<button class="ep ${prog && prog.epIndex === e.index ? 'on' : ''}" data-act="play" data-id="${item.id}" data-ep="${e.index}" title="${esc(e.name)}">
            <span class="ep-num">${isMusic ? esc(e.trackTitle || splitTrack(e.name).title) : `第${e.episode}集`}</span></button>`).join('')}</div>
        </div>`
      : ''}
    ${cast.length
      ? `<div class="section">
          <div class="section-head"><div class="section-title">演职人员</div></div>
          <div class="people">
            ${meta.director && meta.director.length ? `<div class="person"><b>导演</b>${esc(meta.director.join(' / '))}</div>` : ''}
            <div class="person"><b>主演</b>${esc(cast.join(' / '))}</div>
          </div>
        </div>`
      : ''}
    <div class="section">
      <div class="section-head"><div class="section-title">文件信息</div></div>
      <div class="people">
        <div class="person"><b>文件</b>${esc(curEp ? curEp.name : '')}</div>
        <div class="person"><b>路径</b>${esc(curEp ? curEp.path : '')}</div>
      </div>
    </div>
    ${similar.length
      ? `<div class="section">
          <div class="section-head"><div class="section-title">相似推荐</div><button class="row-more" data-act="more" data-type="${esc(item.type)}">更多 ${icon('right', 12)}</button></div>
          <div class="row-scroll" style="padding-left:0;padding-right:0">${similar.map((i) => cardHTML(i)).join('')}</div>
        </div>`
      : ''}
  </div>`;
}

async function renderDetail(id) {
  const view = $('#view');
  // 换片时清掉上次记住的季，否则会停在上一部剧的季号上
  if (state.detailId !== id) {
    state.detailId = id;
    state.detailSeason = null;
  }
  view.innerHTML = `<div class="detail"><div class="detail-hero"><div class="detail-bg skeleton"></div></div>
    <div class="detail-wrap"><div class="detail-poster skeleton"></div>
    <div class="detail-main"><div class="skeleton" style="height:30px;width:280px"></div>
    <div class="skeleton" style="height:14px;width:360px;margin-top:16px"></div>
    <div class="skeleton" style="height:60px;width:70%;margin-top:20px"></div></div></div></div>`;
  try {
    const d = await api(`/api/item?id=${encodeURIComponent(id)}`);
    if (state.route.name !== 'item' || state.route.id !== id) return;
    state.detail = d;
    view.innerHTML = detailHTML(d);
  } catch (e) {
    if (state.route.name !== 'item' || state.route.id !== id) return;
    view.innerHTML = `<div class="empty"><h3>打开失败</h3><p>${esc(e.message)}</p></div>`;
  }
}

/* -------------------------------- 播放器 -------------------------------- */
const SPEEDS = [3, 2, 1.75, 1.5, 1.25, 1, 0.75, 0.5];

const Player = {
  data: null,
  itemId: null,
  epIndex: 0,
  base: 0, // 非直连时已跳过的秒数（转码流从 0 开始计时）
  duration: 0,
  lastSave: 0,
  hideTimer: null,
  flashTimer: null,
  dragging: false,
  dragValue: 0,
  quality: 'auto', // 'auto' | '2160' | '1080' | '720'
  speed: 1,
  resumeTo: 0,
  menuOpen: null,
  lastVol: 1,
  autoNext: true,
  fit: 'contain' // 'contain' | 'fill'
};

function playerEls() {
  return {
    root: $('#player'),
    video: $('#video'),
    title: $('#playerTitle'),
    sub: $('#playerSub'),
    bar: $('#pbar'),
    fill: $('#pbarFill'),
    buffer: $('#pbarBuffer'),
    dot: $('#pbarDot'),
    tip: $('#pbarTip'),
    time: $('#ptime'),
    topNext: $('#playerNext'),
    sideMeta: $('#sideMeta'),
    sideRating: $('#sideRating'),
    synopsis: $('#ppSynopsis'),
    metaList: $('#ppMetaList'),
    pepGrid: $('#pepGrid'),
    toggle: $('#playToggle'),
    toggleIcon: $('#pToggleIcon'),
    bigPlay: $('#pBigPlay'),
    loading: $('#pLoading'),
    flash: $('#pFlash'),
    qualityBtn: $('#qualityBtn'),
    qualityMenu: $('#qualityMenu'),
    speedBtn: $('#speedBtn'),
    speedMenu: $('#speedMenu'),
    vol: $('#volRange'),
    mute: $('#muteBtn'),
    volIcon: $('#pVolIcon'),
    full: $('#fullBtn'),
    pip: $('#pipBtn'),
    prev: $('#prevBtn'),
    nextBtn: $('#nextBtn'),
    controls: $('#ppControls'),
    settingsBtn: $('#settingsBtn'),
    settingsMenu: $('#settingsMenu'),
    nextEpBtn: $('#nextEpBtn'),
    theaterBtn: $('#theaterBtn'),
    theaterIcon: $('#pTheaterIcon')
  };
}

/** 音频文件名 → 歌手 / 歌名（与后端 parseTrack 保持同一套规则） */
function splitTrack(name) {
  let rest = String(name || '').replace(/\.[^.]+$/, '').trim();
  if (!rest) return { artist: '', title: '' };
  const num = /^(\d{1,3})\s*[-._、．)]\s*(.+)$/.exec(rest) || /^(\d{1,3})\s+(.+)$/.exec(rest);
  if (num && String(num[2] || '').trim()) rest = num[2].trim();
  const m = /^(.*?)\s+[-\u2013\u2014]\s+(.*)$/.exec(rest);
  if (m && m[1].trim() && m[2].trim() && !/^(track|song|title|disc|cd|曲目|音轨)\s*\d*$/i.test(m[1].trim())) {
    return { artist: m[1].trim(), title: m[2].trim() };
  }
  return { artist: '', title: rest };
}

/** 填充右侧栏：选集标题、评分、简介、演职员（音频走独立播放器，不会进这里） */
function renderInfo(d) {
  const els = playerEls();
  els.sideRating.textContent = d.rating ? `${d.rating}分` : '';
  if (d.synopsis) {
    els.synopsis.textContent = d.synopsis;
    els.synopsis.classList.remove('is-empty');
  } else {
    els.synopsis.textContent = '暂无简介';
    els.synopsis.classList.add('is-empty');
  }
  // 简介折叠 3 行 + 展开：只有真的溢出才给按钮
  const synMore = $('#ppSynMore');
  if (synMore) {
    els.synopsis.classList.remove('expanded');
    synMore.textContent = '展开';
    synMore.hidden = !d.synopsis || els.synopsis.scrollHeight <= els.synopsis.clientHeight + 8;
  }
  const rows = [];
  if (d.yearAreaGenres) rows.push(['基本信息', d.yearAreaGenres]);
  if ((d.directors || []).length) rows.push(['导演', d.directors.join('、')]);
  if ((d.cast || []).length) rows.push(['主演', d.cast.slice(0, 8).join('、')]);
  els.metaList.innerHTML = rows
    .map(([k, v]) => `<div class="row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`)
    .join('');
  if (d.totalEpisodes) els.sideMeta.textContent = `共 ${d.totalEpisodes} 集`;

  // 优酷式标签行：年份 / 地区 / 类型
  const tags = $('#ppTags');
  if (tags) {
    const parts = String(d.yearAreaGenres || '')
      .split('·')
      .map((s) => s.trim())
      .filter(Boolean);
    const list = [];
    parts.forEach((p, i) => {
      if (i === parts.length - 1 && /[/、]/.test(p)) p.split(/[/、]/).forEach((g) => g.trim() && list.push(g.trim()));
      else if (p) list.push(p);
    });
    tags.innerHTML = list.slice(0, 6).map((t) => `<span class="pp-tag">${esc(t)}</span>`).join('');
  }
}

/* ---- 播放地址：原画走原链路，指定画质走转码链路 ---- */
let hevcSupport = null;
/** 当前浏览器能不能直接解 HEVC（Chrome/Edge 在 macOS 上靠硬解，部分环境不支持） */
function canPlayHevc() {
  if (hevcSupport === null) {
    try {
      const probe = document.createElement('video');
      hevcSupport =
        probe.canPlayType('video/mp4; codecs="hvc1"') !== '' || probe.canPlayType('video/mp4; codecs="hev1"') !== '';
    } catch (e) {
      hevcSupport = false;
    }
  }
  return hevcSupport;
}

function heightLabel(h) {
  return h >= 2160 ? '4K' : h >= 1440 ? '2K' : h >= 1080 ? '1080P' : h >= 720 ? '720P' : `${h}P`;
}

/** 指定清晰度低于源分辨率；原画档自动处理编码兼容。 */
function qualityTiers(d) {
  return (d.qualities || []).filter(q => !d.maxHeight || q.height < d.maxHeight);
}
function needsHevcCompatibility() {
  return Player.data?.vcodec === 'hevc' && !canPlayHevc();
}

function selectedSubtitle() {
  return (Player.data?.subtitleTracks || []).find(t => String(t.index) === Player.subtitleTrack);
}
function customMediaTracks() {
  return Player.audioTrack !== (Player.data?.defaultAudioTrack || 0) || !!selectedSubtitle()?.bitmap;
}
function trackName(track, type) {
  const languages = { chi: '中文', zho: '中文', cmn: '普通话', yue: '粤语', eng: '英语', jpn: '日语', kor: '韩语', fra: '法语', fre: '法语', spa: '西班牙语', ger: '德语', deu: '德语', und: '' };
  const label = [track.title, languages[track.language] ?? track.language].filter(Boolean).join(' · ') || `${type} ${track.index + 1}`;
  return `${label}${track.channels ? ` · ${track.channels} 声道` : ''}${track.bitmap ? ' · 图形字幕' : ''}`;
}
function applySubtitleTrack() {
  const video = $('#video');
  Array.from(video.textTracks || []).forEach(t => { t.mode = 'disabled'; });
  video.querySelectorAll('track').forEach(t => t.remove());
  const selected = selectedSubtitle();
  const source = Player.subtitleTrack === 'external' ? Player.data?.subtitle : selected && !selected.bitmap
    ? `/api/subtitle-track?item=${encodeURIComponent(Player.itemId)}&ep=${Player.epIndex}&track=${selected.index}` : '';
  if (!source) return;
  const base = Player.base;
  const track = document.createElement('track');
  track.kind = 'subtitles';
  track.label = selected ? trackName(selected, '字幕') : '外挂字幕';
  track.default = true;
  track.src = source;
  track.addEventListener('load', () => {
    if (!track.isConnected) return;
    // 兼容流从零计时，字幕仍使用原片时间，按本次起点换算。
    if (base && track.track.cues) {
      for (const cue of Array.from(track.track.cues)) {
        if (cue.endTime <= base) track.track.removeCue(cue);
        else { cue.startTime = Math.max(0, cue.startTime - base); cue.endTime -= base; }
      }
    }
    track.track.mode = 'showing';
  });
  track.addEventListener('error', () => { if (track.isConnected) toast('字幕加载失败，可切换其他字幕轨'); });
  video.appendChild(track);
  track.track.mode = 'showing';
}
function switchMediaTrack(kind, value) {
  const d = Player.data;
  if (!d) return;
  const oldBitmap = !!selectedSubtitle()?.bitmap;
  const position = absoluteTime();
  const video = $('#video');
  const playing = !video.paused;
  if (kind === 'audio') {
    if (!(d.audioTracks || []).some(t => String(t.index) === value)) return;
    if (!d.ffmpeg && Number(value) !== d.defaultAudioTrack) return toast('切换音轨需要 ffmpeg');
    Player.audioTrack = Number(value);
  } else {
    const track = (d.subtitleTracks || []).find(t => String(t.index) === value);
    if (!['off', 'external'].includes(value) && !track) return;
    if (track?.bitmap && !d.ffmpeg) return toast('图形字幕需要 ffmpeg');
    Player.subtitleTrack = value;
  }
  if (kind === 'audio' || oldBitmap || selectedSubtitle()?.bitmap) {
    showLoading(true);
    applySrc(position);
    if (playing) video.play().catch(() => showBigPlay(true));
  } else applySubtitleTrack();
  renderSettingsMenu();
  scheduleHide();
}

/** 当前选择是否等同于源文件本身（此时没必要转码） */
function useDirect() {
  const d = Player.data;
  if (!d || d.mode !== 'direct' || Player.recovery || customMediaTracks()) return false;
  if (needsHevcCompatibility()) return false;
  if (Player.quality === 'auto') return true;
  return Number(Player.quality) === Number(d.maxHeight);
}

/** 转码基址；旧版后端没有 urls 字段时从原地址剥离参数兜底 */
function transcodeBase() {
  const d = Player.data;
  if (d.urls && d.urls.transcode) return d.urls.transcode;
  const m = /^([^?]*\?path=[^&]+)/.exec(d.url || '');
  return m ? m[1] : d.url || '';
}

function originalSrcFor(start) {
  const d = Player.data;
  if (!d) return '';
  const s = Math.floor(Math.max(0, start || 0));
  if (needsHevcCompatibility() && Player.quality === 'auto') return `${transcodeBase()}&quality=source&force=1&start=${s}`;
  if (Player.recovery) return `${transcodeBase()}&start=${s}${Player.recovery === 'transcode' ? '&force=1' : ''}`;
  if (useDirect()) return d.url;
  if (Player.quality === 'auto') return s > 0 ? `${d.url}&start=${s}` : d.url;
  const forced = d.maxHeight && Number(Player.quality) >= Number(d.maxHeight) ? '&force=1' : '';
  return `${transcodeBase()}&quality=${Player.quality}${forced}&start=${s}`;
}

function srcFor(start) {
  if (!Player.data) return '';
  let src = customMediaTracks() && Player.quality === 'auto' && !Player.recovery && !needsHevcCompatibility()
    ? `${transcodeBase()}&start=${Math.floor(Math.max(0, start || 0))}` : originalSrcFor(start);
  if (!useDirect() && Player.data.audioTracks?.length) src += `&audio=${Player.audioTrack || 0}`;
  if (selectedSubtitle()?.bitmap) src += `&subtitle=${selectedSubtitle().index}`;
  return src;
}

/** 当前是否可以直接用 currentTime 定位 */
function canSeek() {
  const d = Player.data;
  if (!d) return false;
  return !Player.recovery && !needsHevcCompatibility() && !customMediaTracks() && (useDirect() || (Player.quality === 'auto' && !!d.seekable));
}

function qualityLabel(q) {
  const d = Player.data;
  if (!d) return '原画';
  if (!q || q === 'auto') return '原画';
  const hit = (d.qualities || []).find((x) => x.id === q);
  if (hit) return hit.label;
  // 强制转码档（如 H.265 源转 H.264）不在 qualities 里，去 tiers 里找
  const tier = qualityTiers(d).find((x) => x.id === q);
  if (tier) return tier.label;
  if (d.maxHeight && Number(q) === Number(d.maxHeight)) return `原画 ${heightLabel(d.maxHeight)}`;
  return /^\d+$/.test(String(q)) ? `${heightLabel(Number(q))}` : q;
}

let videoPageMotion = null;
let videoPageOpen = false;
let videoLoadVersion = 0;
function animateVideoPage(open) {
  const page = $('#player');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const current = videoPageMotion ? getComputedStyle(page) : null;
  const from = current ? { transform: current.transform, opacity: current.opacity }
    : { transform: open && !reduced ? 'translateY(100vh)' : 'translateY(0)', opacity: 1 };
  if (videoPageMotion) videoPageMotion.cancel();
  videoPageMotion = null;
  videoPageOpen = open;
  page.hidden = false;
  page.inert = !open;
  page.classList.add('is-transitioning');
  const finish = () => {
    page.hidden = !open;
    page.classList.remove('is-transitioning');
    if (open) $('#view').hidden = true;
    else if (!videoPageOpen) {
      const video = $('#video');
      video.removeAttribute('src');
      video.load();
    }
  };
  if (!page.animate || reduced) { finish(); return; }
  const animation = page.animate([from,
    { transform: open ? 'translateY(0)' : 'translateY(100vh)', opacity: 1 }
  ], { duration: open ? 420 : 280, easing: open ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0.4, 0, 0.8, 0.4)', fill: 'both' });
  videoPageMotion = animation;
  animation.onfinish = () => {
    if (videoPageMotion !== animation) return;
    finish();
    videoPageMotion = null;
    animation.cancel();
  };
}

async function openPlayer(itemId, epIndex = 0) {
  const els = playerEls();
  // 视频与音频互斥：切到视频时把音频收起来（不销毁队列）
  if (AU.open) hideAudioPage();
  if (AU.data) auEl().pause();
  $('#miniBar').hidden = true;
  const entering = !videoPageOpen;
  els.root.hidden = false;
  const view = $('#view');
  if (view) view.hidden = !entering;
  if (entering) animateVideoPage(true);
  els.root.classList.remove('show-ui'); // 打开时不强制常驻控制层，默认隐藏，悬停/播放才唤出
  els.root.classList.remove('cursor-hide');
  els.root.classList.remove('is-theater');
  if (els.theaterBtn) els.theaterBtn.classList.remove('on');
  els.video.style.objectFit = Player.fit;
  closeMenus();
  try {
    await loadEpisode(itemId, epIndex);
  } catch (e) {
    toast(e.message || '无法播放');
    closePlayer();
    return;
  }
  clearTimeout(Player.hideTimer); // 加载中保持隐藏；autoplay 成功后 play 事件会短暂唤出
}

async function loadEpisode(itemId, epIndex, opts = {}) {
  resetVideoPreview();
  const loadVersion = ++videoLoadVersion;
  const els = playerEls();
  showLoading(true);
  let data;
  try {
    data = await api(`/api/play?item=${encodeURIComponent(itemId)}&ep=${epIndex}`);
  } catch (e) {
    if (loadVersion !== videoLoadVersion || !videoPageOpen) return;
    showLoading(false);
    throw e;
  }
  if (loadVersion !== videoLoadVersion || !videoPageOpen) return;
  if (!data.playable) {
    showLoading(false);
    throw new Error('该文件编码暂不支持浏览器播放，请安装 ffmpeg 后重试');
  }

  Player.data = data;
  Player.audioTrack = data.defaultAudioTrack || 0;
  Player.subtitleTrack = 'off';
  try {
    const saved = JSON.parse(localStorage.getItem('yy_video_session_v1') || 'null');
    if (saved?.itemId === itemId && saved.epIndex === epIndex) {
      if ((data.audioTracks || []).some(t => t.index === saved.audioTrack)) Player.audioTrack = saved.audioTrack;
      if ((data.subtitleTracks || []).some(t => String(t.index) === saved.subtitleTrack) || (saved.subtitleTrack === 'external' && data.subtitle)) Player.subtitleTrack = saved.subtitleTrack;
    }
  } catch (e) {}
  Player.recovery = '';
  Player.itemId = itemId;
  Player.epIndex = epIndex;
  history.replaceState(null, '', `#/play/${itemId}/${epIndex}`);
  Player.lastSave = 0;
  Player.duration = data.duration || 0;

  // 画质：换集后若该文件不支持当前档位，回退到原画
  const tiers = data.qualities || [];
  if (opts.keepQuality && tiers.some((q) => q.id === Player.quality)) {
    /* 保留 */
  } else {
    Player.quality = 'auto';
  }

  const ep = data.episodes[epIndex];
  els.title.textContent = data.title;
  $('#pPlayingTitle').textContent = [data.title, data.episodes.length > 1 && ep ? `${ep.season > 1 ? `第${ep.season}季 · ` : ''}第${ep.episode || epIndex + 1}集` : '', episodeDisplayTitle(ep)].filter(Boolean).join(' · ');
  const crumb = $('#crumbName');
  if (crumb) crumb.textContent = data.title;
  els.sub.textContent = [
    data.episodes.length > 1 && ep ? `第${ep.episode}集` : '',
    data.resolution || '',
    data.vcodec ? data.vcodec.toUpperCase() : ''
  ]
    .filter(Boolean)
    .join(' · ');

  [els.topNext, els.nextEpBtn].forEach((b) => {
    if (b) b.textContent = '下一集';
  });

  renderQualityMenu();
  renderSpeedMenu();
  renderSettingsMenu();

  els.topNext.disabled = data.next === null || data.next === undefined;
  els.nextBtn.disabled = els.topNext.disabled;
  els.nextEpBtn.disabled = els.topNext.disabled;
  els.prev.disabled = epIndex <= 0;

  // 上一集/下一集/选集只对多集剧有意义，电影、单文件直接不显示
  const multi = (data.episodes || []).length > 1;
  els.prev.hidden = !multi;
  els.nextBtn.hidden = !multi;
  els.nextEpBtn.hidden = !multi;
  els.topNext.hidden = !multi;
  const epSec = $('#ppEpSection');
  if (epSec) epSec.hidden = !multi;

  renderInfo(data);
  renderEpisodes(epIndex);
  // 标题异步获取，不阻塞开始播放；换集后忽略过期响应。
  if (!data.audio && data.episodes.length > 1) {
    fetch(`/api/episode-titles?item=${encodeURIComponent(itemId)}`).then(r => r.json()).then(result => {
      if (Player.data !== data || !result.ok) return;
      for (const e of data.episodes) e.title = result.titles?.[e.index] || '';
      const current = data.episodes[epIndex];
      $('#pPlayingTitle').textContent = [data.title, `${current.season > 1 ? `第${current.season}季 · ` : ''}第${current.episode || epIndex + 1}集`, episodeDisplayTitle(current)].filter(Boolean).join(' · ');
      renderEpisodes(epIndex);
    }).catch(() => {});
  }

  renderRecommend(itemId, data.type);

  // 续播位置
  let resume = Number(opts.start || 0);
  try {
    const saved = JSON.parse(localStorage.getItem('yy_video_session_v1') || 'null');
    if (!resume && saved && saved.itemId === itemId && saved.epIndex === epIndex && (!data.duration || saved.position < data.duration - 2)) resume = Math.max(0, Number(saved.position) || 0);
  } catch (e) {}
  if (!resume) {
    const hit = state.lib && allItems().find((i) => i.id === itemId);
    const p = hit && hit.progress;
    if (p && p.epIndex === epIndex && p.position > 20 && (!p.duration || p.position < p.duration - 30)) {
      resume = p.position;
    }
  }
  applySrc(resume);

  els.video.playbackRate = Player.speed;
  els.video.volume = Number(els.vol.value) / 100;
  els.video.play().catch(() => showBigPlay(true));
}

/** 套用新的播放地址；能直连就定位 currentTime，否则用 start 参数重启流 */
function applySrc(target) {
  const els = playerEls();
  const direct = canSeek();
  Player.base = direct ? 0 : target;
  Player.resumeTo = direct ? target : 0;
  els.video.src = srcFor(direct ? 0 : target);
  els.video.load();
  applySubtitleTrack();
  updateBar(target, Player.duration);
  els.buffer.style.width = '0%';
}

/** 视频下方「为你推荐」：同类型优先，排除当前片 */
function renderRecommend(currentId, type) {
  const wrap = $('#ppReco');
  const row = $('#ppRecoRow');
  if (!wrap || !row) return;
  const all = allItems().filter((i) => i.id !== currentId);
  if (!all.length) {
    wrap.hidden = true;
    return;
  }
  const same = all.filter((i) => (i.type || i.kind) === type);
  const rest = all.filter((i) => (i.type || i.kind) !== type);
  const list = same.concat(rest).slice(0, 14);
  wrap.hidden = false;
  row.innerHTML = list
    .map((it) => {
      const sub = [it.label, it.year, it.rating ? it.rating.toFixed(1) : ''].filter(Boolean).join(' · ');
      return `<a class="pp-reco-card" href="#/play/${it.id}/0" title="${esc(it.title)}">
        ${imgTag(it)}
        <div class="pp-reco-name">${esc(it.title)}</div>
        <div class="pp-reco-sub">${esc(sub)}</div>
      </a>`;
    })
    .join('');
}

// 缺少真实分集名称时留空，过滤元数据源的通用集数占位标题。
function episodeDisplayTitle(episode) {
  const title = String(episode?.title || '').trim();
  return /^(?:第\s*[\d一二三四五六七八九十百零〇两]+\s*[集话話回]|(?:episode|ep)\s*[.\-]?\s*\d+|s\d+e\d+|\d+)$/i.test(title) ? '' : title;
}

async function fetchEpisodeTitles(btn) {
  const data = Player.data;
  if (!data || data.audio || btn.disabled) return;
  const itemId = Player.itemId;
  btn.disabled = true;
  btn.textContent = '获取中…';
  btn.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(`/api/episode-titles?item=${encodeURIComponent(itemId)}&refresh=1`);
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || '获取失败，请稍后重试');
    if (Player.data !== data) return;
    let count = 0;
    for (const episode of data.episodes) {
      const title = result.titles?.[episode.index];
      if (title && episodeDisplayTitle({ title })) { episode.title = title; count++; }
    }
    if (!count) { toast('暂未找到分集标题，可检查 TMDB 配置或影片匹配'); return; }
    localStorage.setItem('yy_episode_list', 'true');
    renderEpisodes(Player.epIndex);
    const current = data.episodes.find(e => e.index === Player.epIndex);
    if (current) $('#pPlayingTitle').textContent = [data.title, `${current.season > 1 ? `第${current.season}季 · ` : ''}第${current.episode || Player.epIndex + 1}集`, episodeDisplayTitle(current)].filter(Boolean).join(' · ');
    toast(`已获取 ${count} 集标题`);
  } catch (error) {
    if (Player.data === data) toast(error.message || '获取失败，请稍后重试');
  } finally {
    btn.disabled = false;
    btn.textContent = '获取分集标题';
    btn.removeAttribute('aria-busy');
  }
}

function renderEpisodes(current) {
  const els = playerEls();
  const list = (Player.data && Player.data.episodes) || [];
  const audio = !!(Player.data && Player.data.audio);
  els.pepGrid.innerHTML = list
    .map(
      (e) =>
        `<button class="pep ${e.index === current ? 'on' : ''}" data-act="pep" data-ep="${e.index}" title="${esc(
          e.title || e.name
        )}" aria-current="${e.index === current ? 'true' : 'false'}"><span class="pep-num">${e.season > 1 ? `S${e.season} · ` : ''}${e.episode || e.index + 1}</span><span class="pep-name">${esc(episodeDisplayTitle(e))}</span></button>`
    )
    .join('');
  let listView = false;
  try { listView = localStorage.getItem('yy_episode_list') === 'true'; } catch (e) {}
  els.pepGrid.classList.toggle('list-view', listView);
  $('#ppEpView span').textContent = listView ? '宫格' : '列表';
  $('#ppEpView').setAttribute('aria-pressed', String(listView));
  els.sideMeta.textContent = list.length > 1 ? `共 ${list.length} ${audio ? '首' : '集'}` : '';
  const head = $('#ppEpSection .pp-sec-head h3');
  if (head) head.textContent = audio ? '曲目' : '选集';
  // 优酷式「查看全部」：超过 3 行（6 列 = 18 集）才折叠
  const more = $('#ppMoreBtn');
  if (more) {
    const fold = list.length > 18;
    more.hidden = !fold;
    more.textContent = '查看全部';
    els.pepGrid.classList.toggle('expanded', !fold);
  }
  const on = els.pepGrid.querySelector('.pep.on');
  // 当前集在折叠区之外时直接展开，避免 scrollIntoView 把整页顶走
  if (on && more && !more.hidden) {
    const idx = list.findIndex((e) => e.index === current);
    if (idx >= 18) {
      els.pepGrid.classList.add('expanded');
      more.textContent = '收起';
    }
  }
}

function renderQualityMenu() {
  const els = playerEls();
  const d = Player.data;
  if (!d) return;
  els.qualityBtn.textContent = qualityLabel(Player.quality);
  els.qualityBtn.classList.toggle('on', Player.quality !== 'auto');
  // 只列出真正低于源分辨率的档位（等于源分辨率就是原画，重复没意义）
  const tiers = qualityTiers(d);
  els.qualityBtn.hidden = false;
  if (Player.quality === 'auto' && d.maxHeight) els.qualityBtn.textContent = heightLabel(d.maxHeight);
  const items = [{ id: 'auto', height: d.maxHeight, label: d.maxHeight ? `原画 ${d.maxHeight}P` : '原画' }]
    .concat(tiers.map(q => ({ id: q.id, height: q.height, label: q.label })));
  const single = items.length === 1;
  els.qualityMenu.classList.toggle('quality-single', single);
  els.qualityMenu.classList.toggle('quality-panel', !single);
  if (single) {
    els.qualityMenu.innerHTML = `<button data-q="auto" class="on" aria-pressed="true">${esc(items[0].label)}</button>`;
    return;
  }
  const name = h => h >= 2160 ? '超高清' : h >= 1080 ? '高清' : h >= 720 ? '准高清' : '标清';
  els.qualityMenu.innerHTML = `<div class="pq-header"><span>画质</span><button data-pact="settings" title="打开播放器高级设置">高级设置 ${icon('right', 14)}</button></div><div class="pq-grid">` + items.map(it => {
    const source = it.id === 'auto';
    const resolution = it.height >= 2160 ? '4K' : it.height ? `${it.height}P` : '原画';
    const detail = source ? (d.resolution || '原始分辨率') : '兼容播放';
    return `<button data-q="${it.id}" class="pq-card ${it.height >= 1080 ? 'pq-wide' : ''} ${it.id === Player.quality ? 'on' : ''}" aria-pressed="${it.id === Player.quality}">${source ? '<span class="pq-badge">原画</span>' : ''}<span class="pq-name">${name(it.height)}</span><strong>${resolution}</strong><small>${esc(detail)}</small></button>`;
  }).join('') + '</div>';

}

function renderSpeedMenu() {
  const els = playerEls();
  els.speedBtn.textContent = Player.speed === 1 ? '倍速' : `${Player.speed}x`;
  els.speedBtn.classList.toggle('on', Player.speed !== 1);
  els.speedMenu.innerHTML = SPEEDS.map(
    (s) =>
      `<button data-rate="${s}" class="${s === Player.speed ? 'on' : ''}">${Number.isInteger(s) ? s.toFixed(1) : s}X${
        s === Player.speed ? icon('check', 13) : ''
      }</button>`
  ).join('');
}

// 独立抽帧，不修改主播放器的时间、音量或播放状态。
const videoPreviewState = { timer: null, busy: false, wanted: null, cache: new Map(), controller: null };
function resetVideoPreview() {
  clearTimeout(videoPreviewState.timer);
  videoPreviewState.wanted = null;
  if (videoPreviewState.controller) videoPreviewState.controller.abort();
  $('#pbarTip').hidden = true;
}
async function fetchVideoPreview() {
  const state = videoPreviewState;
  const target = state.wanted;
  if (!target || state.busy) return;
  state.busy = true;
  const controller = new AbortController();
  state.controller = controller;
  try {
    let src = state.cache.get(target.key);
    if (!src) {
      const response = await fetch(target.url, { signal: controller.signal });
      if (!response.ok) throw new Error('预览暂不可用');
      src = URL.createObjectURL(await response.blob());
      state.cache.set(target.key, src);
      while (state.cache.size > 60) {
        const key = state.cache.keys().next().value;
        URL.revokeObjectURL(state.cache.get(key));
        state.cache.delete(key);
      }
    }
    if (state.wanted && state.wanted.key === target.key) {
      const img = $('#pPreviewImage');
      img.src = src;
      img.hidden = false;
      $('#pPreviewStatus').hidden = true;
    }
  } catch (e) {
    if (state.wanted && state.wanted.key === target.key && e.name !== 'AbortError') $('#pPreviewStatus').textContent = '预览暂不可用';
  } finally {
    state.busy = false;
    if (state.controller === controller) state.controller = null;
    if (state.wanted && state.wanted.key !== target.key) fetchVideoPreview();
  }
}
function showVideoPreview(time, x) {
  if (!Player.data || Player.data.audio || !Player.duration) return;
  const tip = $('#pbarTip');
  const bar = $('#pbar');
  tip.hidden = false;
  const half = Math.min(tip.offsetWidth / 2 + 2, bar.clientWidth / 2);
  tip.style.left = `${Math.max(half, Math.min(bar.clientWidth - half, x))}px`;
  $('#pPreviewTime').textContent = fmtTime(time);
  const timestamp = Math.floor(Math.min(time, Math.max(0, Player.duration - 1)) / 2) * 2;
  const key = `${Player.itemId}:${Player.epIndex}:${timestamp}`;
  if (videoPreviewState.wanted?.key === key) return;
  const url = `/api/video-preview?item=${encodeURIComponent(Player.itemId)}&ep=${Player.epIndex}&time=${timestamp}`;
  videoPreviewState.wanted = { key, url };
  const cached = videoPreviewState.cache.get(key);
  $('#pPreviewImage').hidden = !cached;
  if (cached) $('#pPreviewImage').src = cached;
  $('#pPreviewStatus').hidden = !!cached;
  $('#pPreviewStatus').textContent = '正在加载预览…';
  clearTimeout(videoPreviewState.timer);
  if (!cached) videoPreviewState.timer = setTimeout(fetchVideoPreview, 100);
}

function absoluteTime() {
  const v = playerEls().video;
  return Player.base + (v.currentTime || 0);
}

function updateBar(cur, total) {
  const els = playerEls();
  const dur = total || Player.duration || 0;
  const ratio = dur ? Math.min(1, Math.max(0, cur / dur)) : 0;
  els.fill.style.width = `${ratio * 100}%`;
  els.dot.style.left = `${ratio * 100}%`;
  els.time.innerHTML = `<b>${fmtTime(cur)}</b> / ${dur ? fmtTime(dur) : '--:--'}`;
}

function updateBuffer() {
  const els = playerEls();
  const v = els.video;
  const dur = Player.duration || v.duration || 0;
  if (!v.buffered || !v.buffered.length || !dur) return;
  let end = 0;
  for (let i = 0; i < v.buffered.length; i++) {
    if (v.buffered.start(i) <= v.currentTime + 0.6) end = Math.max(end, v.buffered.end(i));
  }
  els.buffer.style.width = `${Math.min(100, (end / dur) * 100)}%`;
}

function seekTo(sec) {
  const els = playerEls();
  const dur = Player.duration || 0;
  const target = Math.max(0, Math.min(dur ? Math.max(0, dur - 1) : sec, sec));
  if (!Player.data) return;
  if (canSeek()) {
    try {
      els.video.currentTime = target;
    } catch (e) {
      /* ignore */
    }
    updateBar(target, dur);
    return;
  }
  const wasPlaying = !els.video.paused;
  showLoading(true);
  applySrc(target);
  if (wasPlaying) els.video.play().catch(() => {});
}

function switchQuality(q) {
  if (!Player.data || q === Player.quality) return;
  const cur = absoluteTime();
  Player.quality = q;
  renderQualityMenu();
  const wasPlaying = !playerEls().video.paused;
  showLoading(true);
  applySrc(cur);
  if (wasPlaying) playerEls().video.play().catch(() => {});
  flash(q === 'auto' ? '原画' : qualityLabel(q));
  scheduleHide();
}

function setSpeed(rate) {
  Player.speed = rate;
  playerEls().video.playbackRate = rate;
  renderSpeedMenu();
  flash(rate === 1 ? '正常速度' : `${rate}x 倍速`);
  scheduleHide();
}

function setVolume(v) {
  const els = playerEls();
  const val = Math.max(0, Math.min(1, v));
  els.video.volume = val;
  els.video.muted = val === 0;
  els.vol.value = Math.round(val * 100);
  setIconD('pVolIcon', val === 0 || els.video.muted ? VOL_MUTE : val < 0.5 ? VOL_LOW : VOL_HIGH);
  if (val > 0) Player.lastVol = val;
}

function toggleMute() {
  const v = playerEls().video;
  if (v.muted || v.volume === 0) setVolume(Player.lastVol || 0.8);
  else {
    Player.lastVol = v.volume;
    setVolume(0);
  }
  flash(playerEls().video.muted ? '已静音' : `音量 ${Math.round(playerEls().video.volume * 100)}%`);
  scheduleHide();
}

function togglePlay() {
  const v = playerEls().video;
  if (v.paused) v.play().catch(() => {});
  else v.pause();
}

function toggleFull() {
  const stage = $('#ppStage');
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
  if (req) {
    const p = req.call(stage);
    if (p && p.catch) p.catch(() => toast('无法进入全屏'));
  } else {
    toast('当前环境不支持全屏');
  }
}

function toggleTheater() {
  const els = playerEls();
  const on = els.root.classList.toggle('is-theater');
  els.theaterBtn.classList.toggle('on', on);
  showBigPlay(els.video.paused);
  scheduleHide();
}

function applyFit(mode) {
  Player.fit = mode;
  playerEls().video.style.objectFit = mode;
}

function renderSettingsMenu() {
  const els = playerEls();
  els.settingsMenu.innerHTML = [
    `<div class="pm-track-head">音效</div>`,
    `<div class="pv-effect-grid">${Object.entries(window.VideoEffects?.presets || {}).map(([id, preset]) => `<button data-video-effect="${id}" class="pv-effect ${window.VideoEffects.selected === id ? 'on' : ''}" aria-pressed="${window.VideoEffects.selected === id}" title="${esc(preset.description)}"><strong>${esc(preset.name)}</strong><span>${esc(preset.description)}</span></button>`).join('')}</div>`,
    `<div class="pm-row" data-set="autoNext"><span class="pm-label">自动连播</span><button class="pm-switch ${Player.autoNext ? 'on' : ''}" role="switch" aria-checked="${Player.autoNext}" aria-label="自动连播"></button></div>`,
    `<div class="pm-row" data-set="loop"><span class="pm-label">循环播放</span><button class="pm-switch ${els.video.loop ? 'on' : ''}" role="switch" aria-checked="${els.video.loop}" aria-label="循环播放"></button></div>`,
    `<div class="pm-row" data-set="fit"><span class="pm-label">画面比例</span><div class="pm-seg">` +
      `<button data-set="fit" data-val="contain" class="${Player.fit === 'contain' ? 'on' : ''}">适应</button>` +
      `<button data-set="fit" data-val="fill" class="${Player.fit === 'fill' ? 'on' : ''}">铺满</button>` +
    `</div></div>`,
    `<div class="pm-track-head">音轨</div>`,
    ...(Player.data?.audioTracks || []).map(t => `<button class="pm-track ${Player.audioTrack === t.index ? 'on' : ''}" data-media-kind="audio" data-media-track="${t.index}" aria-pressed="${Player.audioTrack === t.index}">${esc(trackName(t, '音轨'))}${t.default ? ' · 默认' : ''}</button>`),
    !(Player.data?.audioTracks || []).length ? '<div class="pm-track-empty">暂无可切换音轨</div>' : '',
    `<div class="pm-track-head">字幕</div>`,
    `<button class="pm-track ${Player.subtitleTrack === 'off' ? 'on' : ''}" data-media-kind="subtitle" data-media-track="off" aria-pressed="${Player.subtitleTrack === 'off'}">关闭字幕</button>`,
    ...(Player.data?.subtitleTracks || []).map(t => `<button class="pm-track ${Player.subtitleTrack === String(t.index) ? 'on' : ''}" data-media-kind="subtitle" data-media-track="${t.index}" aria-pressed="${Player.subtitleTrack === String(t.index)}">${esc(trackName(t, '字幕'))}</button>`),
    Player.data?.subtitle ? `<button class="pm-track ${Player.subtitleTrack === 'external' ? 'on' : ''}" data-media-kind="subtitle" data-media-track="external">外挂字幕</button>` : '',
    !(Player.data?.subtitleTracks || []).length && !Player.data?.subtitle ? '<div class="pm-track-empty">该视频没有可用字幕</div>' : ''
  ].join('');
}

async function togglePip() {
  const v = playerEls().video;
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }
    if (!document.pictureInPictureEnabled) {
      toast('当前浏览器不支持画中画');
      return;
    }
    await v.requestPictureInPicture();
  } catch (e) {
    toast('无法开启画中画');
  }
}

function showLoading(on) {
  playerEls().loading.hidden = !on;
}

function showBigPlay(on) {
  playerEls().bigPlay.hidden = !on;
}

function flash(text) {
  const el = playerEls().flash;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(Player.flashTimer);
  Player.flashTimer = setTimeout(() => el.classList.remove('show'), 720);
}

function closeMenus(except) {
  const els = playerEls();
  if (except !== 'quality') els.qualityMenu.hidden = true;
  if (except !== 'speed') els.speedMenu.hidden = true;
  if (except !== 'settings') els.settingsMenu.hidden = true;
  ['quality', 'speed', 'settings'].forEach(name => $(`#${name}Btn`)?.setAttribute('aria-expanded', String(except === name)));
  if (!except) Player.menuOpen = null;
}

function toggleMenu(name) {
  const els = playerEls();
  const map = { quality: els.qualityMenu, speed: els.speedMenu, settings: els.settingsMenu };
  const el = map[name];
  if (!el) return;
  const willOpen = el.hidden;
  closeMenus();
  if (willOpen) {
    el.hidden = false;
    Player.menuOpen = name;
    $(`#${name}Btn`)?.setAttribute('aria-expanded', 'true');
  }
  scheduleHide();
}

/* 唤出控制层 + 静止 2.6s 后自动隐藏（悬停/播放时才临时显示，不常驻） */
function scheduleHide() {
  const els = playerEls();
  clearTimeout(Player.hideTimer);
  els.root.classList.add('show-ui');
  els.root.classList.remove('cursor-hide');
  Player.hideTimer = setTimeout(() => {
    if (Player.dragging || Player.menuOpen || els.root.querySelector('.pvol-wrap:hover, .pvol-wrap:focus-within, .pbar:hover, .pbar:focus-within')) return; // 拖动进度 / 菜单展开时保持
    hideControls();
  }, 2600);
}

/* 隐藏控制层与光标 */
function hideControls() {
  resetVideoPreview();
  const els = playerEls();
  els.root.classList.remove('show-ui');
  els.root.classList.add('cursor-hide');
  closeMenus();
}

function persistVideoSession() {
  if (!Player.data || $('#player').hidden) return;
  try {
    localStorage.setItem('yy_video_session_v1', JSON.stringify({ itemId: Player.itemId, epIndex: Player.epIndex, position: absoluteTime(), audioTrack: Player.audioTrack, subtitleTrack: Player.subtitleTrack }));
  } catch (e) {}
}
window.addEventListener('pagehide', persistVideoSession);

function saveProgress(force = false) {
  if (!Player.data) return;
  const now = Date.now();
  if (!force && now - Player.lastSave < 8000) return;
  Player.lastSave = now;
  const position = absoluteTime();
  if (!position) return;
  fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemId: Player.itemId,
      epIndex: Player.epIndex,
      position,
      duration: Player.duration || playerEls().video.duration || 0
    })
  }).catch(() => {});
}

function closePlayer() {
  resetVideoPreview();
  const els = playerEls();
  persistVideoSession();
  saveProgress(true);
  if (location.hash === `#/play/${Player.itemId}/${Player.epIndex}`) history.replaceState(null, '', `#/item/${Player.itemId}`);
  els.video.pause();
  ++videoLoadVersion;
  if (videoPageOpen) animateVideoPage(false);
  els.root.classList.remove('show-ui', 'cursor-hide', 'is-theater');
  const stageEl = $('#ppStage');
  if (stageEl) stageEl.classList.remove('is-audio');
  if (els.theaterBtn) els.theaterBtn.classList.remove('on');
  closeMenus();
  showLoading(false);
  showBigPlay(false);
  const view = $('#view');
  if (view) view.hidden = false;
  if (!AU.open) animateRouteView();
  // 从视频回来时，把没在放的那首歌收进迷你条，别让界面里彻底找不到它
  syncMiniBar();
  Player.data = null;
  Player.base = 0;
  clearTimeout(Player.hideTimer);
  if (state.route.name === 'home') {
    loadLibrary().then(() => {
      if (state.route.name === 'home') renderMusic();
    });
  }
}

function bindPlayer() {
  const els = playerEls();
  const root = els.root;

  root.querySelectorAll('.pmenu-wrap').forEach(wrap => {
    const trigger = wrap.querySelector('[data-pact]');
    const name = trigger.dataset.pact;
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    const open = () => { if (Player.menuOpen !== name) toggleMenu(name); };
    let leaveTimer;
    wrap.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') { clearTimeout(leaveTimer); open(); } });
    wrap.addEventListener('pointerleave', () => { leaveTimer = setTimeout(() => { if (!wrap.contains(document.activeElement) && Player.menuOpen === name) { closeMenus(); scheduleHide(); } }, 180); });
    wrap.addEventListener('focusin', () => { clearTimeout(leaveTimer); open(); });
    wrap.addEventListener('focusout', e => { if (!wrap.contains(e.relatedTarget) && Player.menuOpen === name) { closeMenus(); scheduleHide(); } });
  });

  // 按钮图标已在 index.html 中以 Youku 风格内联 SVG 给出，这里只做动态状态切换

  /* ---- video 事件 ---- */
  els.video.addEventListener('timeupdate', () => {
    if (Player.dragging) return;
    updateBar(absoluteTime(), Player.duration || els.video.duration);
    persistVideoSession();
    saveProgress();
  });
  els.video.addEventListener('progress', updateBuffer);
  els.video.addEventListener('loadedmetadata', () => {
    if (!Player.duration && els.video.duration && isFinite(els.video.duration)) {
      Player.duration = els.video.duration;
    }
    if (Player.resumeTo > 0) {
      try {
        els.video.currentTime = Player.resumeTo;
      } catch (e) {
        /* ignore */
      }
      Player.resumeTo = 0;
    }
    els.video.playbackRate = Player.speed;
    updateBar(absoluteTime(), Player.duration);
  });
  els.video.addEventListener('loadeddata', () => showLoading(false));
  els.video.addEventListener('canplay', () => showLoading(false));
  els.video.addEventListener('waiting', () => showLoading(true));
  els.video.addEventListener('playing', () => {
    showLoading(false);
    showBigPlay(false);
    setIconD('pToggleIcon', PAUSE_D);
    updateBuffer();
  });
  els.video.addEventListener('play', () => {
    setIconD('pToggleIcon', PAUSE_D);
    showBigPlay(false);
    scheduleHide();
  });
  els.video.addEventListener('pause', () => {
    setIconD('pToggleIcon', PLAY_D);
    if (!els.video.ended) showBigPlay(true);
    scheduleHide(); // 暂停后短暂唤出，静止仍自动隐藏（不常驻）
  });
  els.video.addEventListener('volumechange', () => {
    const v = els.video;
    els.vol.value = Math.round((v.muted ? 0 : v.volume) * 100);
    $('#pVolValue').textContent = `${els.vol.value}%`;
    els.vol.style.setProperty('--volume', `${els.vol.value}%`);
    setIconD('pVolIcon', v.muted || v.volume === 0 ? VOL_MUTE : v.volume < 0.5 ? VOL_LOW : VOL_HIGH);
  });
  els.video.addEventListener('ended', () => {
    saveProgress(true);
    const next = Player.data && Player.data.next;
    if (Player.autoNext && next !== null && next !== undefined) {
      showBigPlay(false);
      loadEpisode(Player.itemId, next, { keepQuality: true }).catch(() => closePlayer());
    } else {
      showBigPlay(true);
      scheduleHide();
    }
  });
  els.video.addEventListener('error', () => {
    if (!els.video.currentSrc) return;
    const d = Player.data;
    const code = els.video.error && els.video.error.code;
    if (d && !d.audio && (code === 3 || code === 4) && Player.recovery !== 'transcode') {
      const position = absoluteTime();
      Player.recovery = useDirect() ? 'remux' : 'transcode';
      showLoading(true);
      showBigPlay(false);
      applySrc(position);
      els.video.play().catch(() => { if (!els.video.error) showBigPlay(true); });
      toast(Player.recovery === 'remux' ? '原文件播放失败，正在切换兼容封装' : '正在切换 H.264 兼容转码');
      return;
    }
    showLoading(false);
    showBigPlay(true);
    toast('播放失败，请检查 NAS 连接及 ffmpeg，或切换清晰度重试');
  });
  document.addEventListener('fullscreenchange', () => {
    setIconD('pFullIcon', document.fullscreenElement ? FULL_EXIT_D : FULL_D);
  });

  /* ---- 点击视频：单击播放/暂停，双击全屏 ---- */
  let clickTimer = null;
  els.video.addEventListener('click', () => {
    clearTimeout(clickTimer);
    clickTimer = setTimeout(togglePlay, 210);
  });
  els.video.addEventListener('dblclick', (e) => {
    e.preventDefault();
    clearTimeout(clickTimer);
    toggleFull();
  });

  /* ---- 控制条按钮 ---- */
  root.addEventListener('click', (e) => {
    const effectButton = e.target.closest('[data-video-effect]');
    if (effectButton) { window.VideoEffects?.select(effectButton.dataset.videoEffect); scheduleHide(); return; }
    const trackButton = e.target.closest('[data-media-track]');
    if (trackButton) { switchMediaTrack(trackButton.dataset.mediaKind, trackButton.dataset.mediaTrack); return; }
    const menuItem = e.target.closest('[data-q],[data-rate]');
    if (menuItem) {
      if (menuItem.dataset.q !== undefined) switchQuality(menuItem.dataset.q);
      else setSpeed(Number(menuItem.dataset.rate));
      closeMenus();
      return;
    }


    const pep = e.target.closest('[data-act="pep"]');
    if (pep) {
      const idx = Number(pep.dataset.ep);
      if (idx !== Player.epIndex) {
        loadEpisode(Player.itemId, idx, { keepQuality: true }).catch((err) => toast(err.message));
      }
      return;
    }

    const setEl = e.target.closest('[data-set]');
    if (setEl) {
      const kind = setEl.dataset.set;
      const els = playerEls();
      if (kind === 'autoNext') {
        Player.autoNext = !Player.autoNext;
        renderSettingsMenu();
      } else if (kind === 'loop') {
        els.video.loop = !els.video.loop;
        renderSettingsMenu();
      } else if (kind === 'fit') {
        applyFit(setEl.dataset.val);
        renderSettingsMenu();
      }
      scheduleHide();
      return;
    }

    const btn = e.target.closest('[data-pact]');
    if (!btn) {
      if (Player.menuOpen) closeMenus();
      return;
    }
    const act = btn.dataset.pact;
    if (act === 'close') closePlayer();
    else if (act === 'toggle') togglePlay();
    else if (act === 'next') {
      const next = Player.data && Player.data.next;
      if (next !== null && next !== undefined) {
        loadEpisode(Player.itemId, next, { keepQuality: true }).catch(() => {});
      }
    } else if (act === 'prev') {
      if (Player.epIndex > 0) {
        loadEpisode(Player.itemId, Player.epIndex - 1, { keepQuality: true }).catch(() => {});
      }
    }     else if (act === 'quality') { if (Player.menuOpen !== 'quality' || !btn.matches(':hover')) toggleMenu('quality'); }
    else if (act === 'speed') { if (Player.menuOpen !== 'speed' || !btn.matches(':hover')) toggleMenu('speed'); }
    else if (act === 'settings') { if (Player.menuOpen !== 'settings' || !btn.matches(':hover')) toggleMenu('settings'); }
    else if (act === 'theater') toggleTheater();
    else if (act === 'mute') toggleMute();
    else if (act === 'full') toggleFull();
    else if (act === 'pip') togglePip();
    else if (act === 'fetch-episode-titles') {
      fetchEpisodeTitles(btn);
    }
    else if (act === 'epview') {
      const listView = els.pepGrid.classList.toggle('list-view');
      btn.querySelector('span').textContent = listView ? '宫格' : '列表';
      btn.setAttribute('aria-pressed', String(listView));
      try { localStorage.setItem('yy_episode_list', String(listView)); } catch (e) {}
    }
    else if (act === 'moreeps') {
      const grid = els.pepGrid;
      const open = grid.classList.toggle('expanded');
      btn.textContent = open ? '收起' : '查看全部';
    } else if (act === 'moresyn') {
      const open = els.synopsis.classList.toggle('expanded');
      btn.textContent = open ? '收起' : '展开';
    }
  });

  /* ---- 音量滑块 ---- */
  els.vol.addEventListener('input', () => {
    setVolume(Number(els.vol.value) / 100);
  });

  /* ---- 进度条：悬停预览 + 拖动 ---- */
  const bar = els.bar;
  const durOf = () => Player.duration || els.video.duration || 0;
  const ratioOf = (evt) => {
    const r = bar.getBoundingClientRect();
    return Math.min(1, Math.max(0, (evt.clientX - r.left) / r.width));
  };
  bar.addEventListener('pointermove', (e) => {
    const ratio = ratioOf(e);
    const t = ratio * durOf();
    showVideoPreview(t, ratio * bar.clientWidth);
    if (Player.dragging) {
      Player.dragValue = t;
      updateBar(t, durOf());
    }
  });
  bar.addEventListener('pointerleave', resetVideoPreview);
  bar.addEventListener('pointerdown', (e) => {
    if (!Player.data) return;
    e.preventDefault();
    Player.dragging = true;
    Player.dragValue = ratioOf(e) * durOf();
    updateBar(Player.dragValue, durOf());
    try {
      bar.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
    scheduleHide();
  });
  bar.addEventListener('pointerup', (e) => {
    if (!Player.dragging) return;
    Player.dragging = false;
    seekTo(Player.dragValue);
    try {
      bar.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
    scheduleHide();
  });

  /* ---- 鼠标移动：唤出控制层 ---- */
  root.addEventListener('mousemove', scheduleHide);
  root.addEventListener('mouseleave', () => {
    hideControls();
  });

  /* ---- 键盘 ---- */
  document.addEventListener('keydown', (e) => {
    if (root.hidden) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const k = e.key;
    if (k === 'Escape') {
      if (Player.menuOpen) return closeMenus();
      if (document.fullscreenElement) return void document.exitFullscreen().catch(() => {});
      return closePlayer();
    }
    if (k === ' ' || k === 'k' || k === 'K') {
      e.preventDefault();
      return togglePlay();
    }
    if (k === 'ArrowRight') {
      e.preventDefault();
      seekTo(absoluteTime() + 10);
      flash('快进 10 秒');
      return scheduleHide();
    }
    if (k === 'ArrowLeft') {
      e.preventDefault();
      seekTo(absoluteTime() - 10);
      flash('快退 10 秒');
      return scheduleHide();
    }
    if (k === 'ArrowUp') {
      e.preventDefault();
      setVolume(els.video.volume + 0.05);
      flash(`音量 ${Math.round(els.video.volume * 100)}%`);
      return scheduleHide();
    }
    if (k === 'ArrowDown') {
      e.preventDefault();
      setVolume(els.video.volume - 0.05);
      flash(`音量 ${Math.round(els.video.volume * 100)}%`);
      return scheduleHide();
    }
    const low = k.toLowerCase();
    if (low === 'f') return toggleFull();
    if (low === 'm') return toggleMute();
    if (low === 'p') return togglePip();
    if (low === 'n') {
      const next = Player.data && Player.data.next;
      if (next !== null && next !== undefined) loadEpisode(Player.itemId, next, { keepQuality: true }).catch(() => {});
      return;
    }
    scheduleHide();
  });
}

/* -------------------------------- 音乐馆 -------------------------------- */

/**
 * 音乐不是"另一种影片"，所以不走 renderList 的卡片网格：
 * 这里是酷狗式的三栏视图（歌曲表格 / 歌手 / 专辑），支持按歌手、专辑筛选。
 */
const MUSIC = {
  data: null,
  tab: 'song', // song | artist | album
  favoriteOnly: false,
  localOnly: false,
  sourcePath: '',
  shellNavigation: false,
  artist: 'all',
  album: 'all',
  q: '',
  sort: 'artist',
  direction: 'asc',
  probeTimer: 0
};

function fmtDur(sec) {
  const n = Math.round(Number(sec) || 0);
  if (!n) return '--:--';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

async function fetchMusic() {
  try {
    const d = await api('/api/music');
    if (d && d.ok) MUSIC.data = d;
  } catch (e) {
    if (!MUSIC.data) MUSIC.data = { songs: [], artists: [], albums: [], stats: {}, probing: 0 };
  }
  if (!MUSIC.data) MUSIC.data = { songs: [], artists: [], albums: [], stats: {}, probing: 0 };
  return MUSIC.data;
}

function musicFiltered() {
  const d = MUSIC.data || {};
  let list = (d.songs || []).slice();
  if (MUSIC.favoriteOnly) list = list.filter(song => state.favorites.has(song.id));
  if (MUSIC.localOnly) list = list.filter(song => song.path && !song.path.startsWith('nas:'));
  if (MUSIC.sourcePath) list = list.filter(song => song.path && (song.path === MUSIC.sourcePath || song.path.startsWith(MUSIC.sourcePath.replace(/[/\\]$/, '') + '/') || song.path.startsWith(MUSIC.sourcePath.replace(/[/\\]$/, '') + '\\')));
  if (MUSIC.artist !== 'all') list = list.filter((s) => (s.artist || '未知歌手') === MUSIC.artist);
  if (MUSIC.album !== 'all') {
    list = MUSIC.album === '__none__' ? list.filter((s) => !s.album) : list.filter((s) => s.album === MUSIC.album);
  }
  const q = MUSIC.q.trim().toLowerCase();
  if (q) {
    list = list.filter((s) => [s.title, s.artist, s.album].join(' ').toLowerCase().includes(q));
  }
  const byName = (a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN');
  if (MUSIC.sort === 'artist') {
    list.sort((a, b) => String(a.artist).localeCompare(String(b.artist), 'zh-Hans-CN') || byName(a, b));
  } else if (MUSIC.sort === 'album') {
    list.sort((a, b) => String(a.album).localeCompare(String(b.album), 'zh-Hans-CN') || byName(a, b));
  } else if (MUSIC.sort === 'recent') {
    list.sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
  } else if (MUSIC.sort === 'duration') {
    list.sort((a, b) => (a.duration || 0) - (b.duration || 0));
  } else {
    list.sort(byName);
  }
  if (MUSIC.direction === 'desc') list.reverse();
  return list;
}

function musicIsCurrent(song) {
  const t = AU.queue[AU.index];
  return !!(t && t.id === song.id && t.ep === song.ep);
}

const musicInitialCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin');
const musicInitialBounds = [...'阿巴擦搭蛾发嘎哈击喀拉妈拿哦啪期然撒塌挖昔压匝'];
const musicInitialLetters = [...'ABCDEFGHJKLMNOPQRSTWXYZ'];
function musicInitial(value) {
  const char = [...String(value || '').trim().normalize('NFKD').replace(/\p{M}/gu, '')][0] || '';
  if (/^[a-z]$/i.test(char)) return char.toUpperCase();
  if (!/\p{Script=Han}/u.test(char)) return '#';
  for (let i = musicInitialBounds.length - 1; i >= 0; i--) {
    if (musicInitialCollator.compare(char, musicInitialBounds[i]) >= 0) return musicInitialLetters[i];
  }
  return 'A';
}
function musicSongInitial(song) {
  return musicInitial(MUSIC.sort === 'artist' ? song.artist : MUSIC.sort === 'album' ? song.album : song.title);
}
function musicAlphabetHTML(songs) {
  const available = new Set(songs.map(musicSongInitial));
  const field = MUSIC.sort === 'artist' ? '歌手' : MUSIC.sort === 'album' ? '专辑' : '歌名';
  return `<nav class="music-alphabet" aria-label="按${field}首字母快速定位">${[...'#ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(letter => `<button data-act="music-letter" data-letter="${letter}" aria-label="定位${field} ${letter}"${available.has(letter) ? '' : ' disabled'}>${letter}</button>`).join('')}</nav>`;
}
function jumpMusicLetter(letter) {
  const row = document.querySelector(`.mtbody .mtr[data-initial="${letter}"]`);
  const main = $('#main');
  if (!row || !main) return;
  const inset = $('#topbar').getBoundingClientRect().height + 48;
  main.scrollTo({ top: main.scrollTop + row.getBoundingClientRect().top - main.getBoundingClientRect().top - inset, behavior: 'instant' });
  document.querySelectorAll('.music-alphabet button').forEach(button => {
    if (button.dataset.letter === letter) button.setAttribute('aria-current', 'location');
    else button.removeAttribute('aria-current');
  });
}

function musicSongRow(song, i) {
  const on = musicIsCurrent(song);
  const ext = String(song.ext || '').replace('.', '').toUpperCase();
  return `<button class="mtr${on ? ' on' : ''}" data-act="mplay" data-key="${esc(song.key)}" data-initial="${musicSongInitial(song)}">
    <span class="c-no">${i + 1}</span>
    <span class="c-title"><i class="meq song-playing" aria-label="正在播放" hidden><b></b><b></b><b></b><b></b></i><b>${esc(song.title)}</b>${ext ? `<i class="fmt">${ext}</i>` : ''}</span>
    <span class="c-artist">${esc(song.artist || '未知歌手')}</span>
    <span class="c-album">${esc(song.album || '单曲')}</span>
    <span class="c-dur"><span class="song-duration" data-k="${esc(song.key)}">${fmtDur(song.duration)}</span></span>
  </button>`;
}

function musicBodyHTML() {
  const d = MUSIC.data || {};
  const songs = musicFiltered();

  if (MUSIC.tab === 'artist') {
    const artists = d.artists || [];
    if (!artists.length) return `<div class="empty"><h3>还没有歌手</h3><p>扫描完成后，歌手会按文件名里的「歌手 - 歌名」自动归类。</p></div>`;
    return `<div class="marts">${artists
      .map(
        (a) => `<button class="mart" data-act="martist" data-name="${esc(a.name)}">
          <span class="mart-av"><b>${esc(a.name.slice(0, 1))}</b><i style="background-image:url('${esc(a.art)}')"></i></span>
          <span class="mart-txt"><b>${esc(a.name)}</b><span>${a.count} 首${a.albumCount ? ` · ${a.albumCount} 张专辑` : ''}</span></span>
        </button>`
      )
      .join('')}</div>`;
  }

  if (MUSIC.tab === 'album') {
    const albums = d.albums || [];
    const loose = (d.songs || []).filter((s) => !s.album).length;
    if (!albums.length && !loose) return `<div class="empty"><h3>还没有专辑</h3><p>同一个目录里放 3 首以上，或放一张 cover/folder 图，就会被识别成专辑。</p></div>`;
    return `<div class="malbs">${albums
      .map(
        (a) => `<button class="malb" data-act="malbum" data-name="${esc(a.name)}">
          <span class="malb-art"><i style="background-image:url('${esc(a.art)}')"></i></span>
          <span class="malb-name">${esc(a.name)}</span>
          <span class="malb-sub">${esc(a.artist || '群星')} · ${a.count} 首</span>
        </button>`
      )
      .join('')}
      ${loose ? `<button class="malb loose" data-act="malbum" data-name="__none__">
        <span class="malb-art"><i></i><b>♪</b></span>
        <span class="malb-name">散装单曲</span>
        <span class="malb-sub">${loose} 首 · 无专辑信息</span>
      </button>` : ''}
    </div>`;
  }

  if (!songs.length) {
    return `<div class="empty"><h3>没有匹配的歌曲</h3><p>换个歌手/专辑，或清空筛选条件。</p></div>`;
  }
  return `${musicAlphabetHTML(songs)}<div class="mtable">
    <div class="mtr head"><span class="c-no">#</span><span class="c-title">歌曲</span><span class="c-artist">歌手</span><span class="c-album">专辑</span><span class="c-dur">时长</span></div>
    <div class="mtbody">${songs.map((s, i) => musicSongRow(s, i)).join('')}</div>
  </div>`;
}

function musicFiltersHTML() {
  if (MUSIC.tab !== 'song') return '';
  const d = MUSIC.data || {};
  const artists = (d.artists || []).filter((a) => a.count > 0);
  const albums = d.albums || [];
  const hasLoose = (d.songs || []).some((s) => !s.album);
  const dirty = MUSIC.artist !== 'all' || MUSIC.album !== 'all' || MUSIC.q.trim();
  return `<div class="mp-filters">
    <label class="mp-sel"><span>歌手</span>
      <select data-act="mfilter" data-role="artist">
        <option value="all">全部歌手</option>
        ${artists.map((a) => `<option value="${esc(a.name)}"${MUSIC.artist === a.name ? ' selected' : ''}>${esc(a.name)}（${a.count}）</option>`).join('')}
      </select>
    </label>
    <label class="mp-sel"><span>专辑</span>
      <select data-act="mfilter" data-role="album">
        <option value="all">全部专辑</option>
        ${albums.map((a) => `<option value="${esc(a.name)}"${MUSIC.album === a.name ? ' selected' : ''}>${esc(a.name)}（${a.count}）</option>`).join('')}
        ${hasLoose ? `<option value="__none__"${MUSIC.album === '__none__' ? ' selected' : ''}>散装单曲</option>` : ''}
      </select>
    </label>
    <label class="mp-sel"><span>排序</span>
      <select data-act="mfilter" data-role="sort">
        <option value="name"${MUSIC.sort === 'name' ? ' selected' : ''}>歌曲名称</option>
        <option value="artist"${MUSIC.sort === 'artist' ? ' selected' : ''}>歌手</option>
        <option value="album"${MUSIC.sort === 'album' ? ' selected' : ''}>专辑</option>
        <option value="recent"${MUSIC.sort === 'recent' ? ' selected' : ''}>最近添加</option>
        <option value="duration"${MUSIC.sort === 'duration' ? ' selected' : ''}>时长</option>
      </select>
    </label>
    <label class="mp-sel"><span>顺序</span>
      <select data-act="mfilter" data-role="direction" aria-label="排序顺序">
        <option value="asc"${MUSIC.direction === 'asc' ? ' selected' : ''}>升序</option>
        <option value="desc"${MUSIC.direction === 'desc' ? ' selected' : ''}>降序</option>
      </select>
    </label>
    ${dirty ? `<button class="mp-reset" data-act="mreset">清空筛选</button>` : ''}
  </div>`;
}

function musicPageHTML() {
  const d = MUSIC.data || {};
  const st = d.stats || {};
  const songs = musicFiltered();
  const loose = (d.songs || []).some((s) => !s.album);
  const albumCards = (st.albums || 0) + (loose ? 1 : 0);
  return `<div class="mp">
    <div class="mp-head">
      <div class="mp-titles">
        <div class="mp-kicker">${icon('note', 13)} 我的音乐</div>
        <h1 class="mp-title">音乐馆</h1>
        <div class="mp-stats">
          <span><b>${st.songs || 0}</b> 首歌曲</span>
          <span><b>${st.artists || 0}</b> 位歌手</span>
          <span><b>${st.albums || 0}</b> 张专辑</span>
        </div>
      </div>
      <button class="mp-playall" data-act="mplayall">${icon('play', 15)} 播放全部</button>
    </div>

    <div class="mp-tabs">
      <button class="mp-tab ${MUSIC.tab === 'song' ? 'on' : ''}" data-act="mtab" data-mtab="song">歌曲 <i>${st.songs || 0}</i></button>
      <button class="mp-tab ${MUSIC.tab === 'artist' ? 'on' : ''}" data-act="mtab" data-mtab="artist">歌手 <i>${st.artists || 0}</i></button>
      <button class="mp-tab ${MUSIC.tab === 'album' ? 'on' : ''}" data-act="mtab" data-mtab="album">专辑 <i>${albumCards}</i></button>
      <span class="mp-count">${MUSIC.tab === 'song' ? `当前 ${songs.length} 首` : ''}</span>
    </div>

    ${musicFiltersHTML()}
    <div class="mp-body" id="mpBody">${musicBodyHTML()}</div>
  </div>`;
}

function paintMusic() {
  const view = $('#view');
  if (!view) return;
  const scroller = $('#main');
  const top = scroller ? scroller.scrollTop : 0;
  view.innerHTML = musicPageHTML();
  syncTopbarSearch();
  syncMusicPlayback();
  if (scroller) scroller.scrollTop = top;
}

function paintMusicBody() {
  const body = $('#mpBody');
  if (!body) return paintMusic();
  body.innerHTML = musicBodyHTML();
  syncMusicPlayback();
  const counter = $('.mp-count');
  if (counter && MUSIC.tab === 'song') counter.textContent = `当前 ${musicFiltered().length} 首`;
}

async function renderMusic() {
  const view = $('#view');
  if (!MUSIC.data) {
    view.innerHTML = `<div class="mp-loading"><div class="p-spinner"></div><p>正在整理音乐库…</p></div>`;
  }
  syncMiniBar();
  await fetchMusic();
  if (!(state.route.name === 'list' && state.route.type === 'music')) return;
  if (auIndexInfo() && !MUSIC.shellNavigation) {
    MUSIC.tab = 'song';
    if (!musicFiltered().some(musicIsCurrent)) { MUSIC.artist = 'all'; MUSIC.album = 'all'; MUSIC.q = ''; }
  }
  MUSIC.shellNavigation = false;
  paintMusic();
  renderSidebar();
  scrollToCurrentMusic();
  syncMiniBar();
  scheduleProbeFetch();
}

function scrollToCurrentMusic() {
  const scroller = $('#main');
  if (!scroller) return;
  const currentRow = document.querySelector('.mtbody .mtr[aria-current="true"]');
  // 直接按当前滚动位置计算，避免先回顶部的平滑滚动与歌曲定位互相覆盖。
  const top = currentRow
    ? scroller.scrollTop + currentRow.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      - (scroller.clientHeight - currentRow.getBoundingClientRect().height) / 2
    : 0;
  scroller.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
}

/** 时长要 ffprobe 一首首算，后端后台补；这里轮询只更新时间列，不重排列表 */
function scheduleProbeFetch() {
  clearTimeout(MUSIC.probeTimer);
  const probing = MUSIC.data && MUSIC.data.probing;
  if (!probing) return;
  MUSIC.probeTimer = setTimeout(async () => {
    const d = await fetchMusic();
    if (!(state.route.name === 'list' && state.route.type === 'music')) return;
    (d.songs || []).forEach((s) => {
      const cell = document.querySelector(`.song-duration[data-k="${CSS.escape(s.key)}"]`);
      if (cell && s.duration) cell.textContent = fmtDur(s.duration);
    });
    scheduleProbeFetch();
  }, 2200);
}

async function playMusicKey(key, list) {
  const songs = list || musicFiltered();
  const idx = songs.findIndex((s) => s.key === key);
  if (idx < 0) return;
  await openAudio(songs[idx].id, songs[idx].ep, null, { queue: songs.map(songToQueueItem), index: idx });
}

function songToQueueItem(s) {
  return {
    key: String(s.key || `${s.id}:${s.ep}`),
    id: s.id,
    ep: s.ep || 0,
    title: s.title,
    artist: s.artist || '',
    album: s.album || '',
    art: s.art || ''
  };
}

/* ------------------------------ 音频播放器 ------------------------------ */

/**
 * 独立音频播放器：自己的 <audio> 元素、自己的控件、自己的队列。
 * 视频那套（画质/倍速/全屏/画中画/选集/字幕）在这里一个都不存在。
 */
const AU = {
  el: null,
  data: null,
  queue: [],
  index: -1,
  mode: 'order', // order=列表循环 single=单曲循环 shuffle=随机
  open: false,
  dragging: false,
  offset: 0,
  lastSave: 0,
  restoring: false,
  lastSessionSave: 0,
  resumeHandler: null,
  pendingPosition: null
};

const AUDIO_SESSION_KEY = 'yy_audio_session_v1';
function persistAudioSession(force = false) {
  if (AU.restoring || !AU.data || !auIndexInfo()) return;
  const now = Date.now();
  if (!force && now - AU.lastSessionSave < 1000) return;
  AU.lastSessionSave = now;
  const el = auEl();
  try {
    localStorage.setItem(AUDIO_SESSION_KEY, JSON.stringify({
      version: 1, queue: AU.queue, index: AU.index, mode: AU.mode,
      position: AU.pendingPosition ?? auCurrentTime(), playing: !el.paused && !el.ended,
      volume: el.volume, muted: el.muted, rate: el.playbackRate,
      open: AU.open, at: now
    }));
  } catch (e) { /* 存储不可用时仍可正常播放 */ }
}

async function restoreAudioSession(opts = {}) {
  if (AU.data || !$('#player').hidden) return;
  let saved;
  try { saved = JSON.parse(localStorage.getItem(AUDIO_SESSION_KEY) || 'null'); } catch (e) { return; }
  if (!saved || saved.version !== 1 || !Array.isArray(saved.queue)) return;
  const existing = allItems();
  const selected = saved.queue[saved.index];
  const valid = t => t && existing.some(item => item.type === 'music' && item.id === t.id && Number.isInteger(t.ep || 0) && (t.ep || 0) >= 0 && (t.ep || 0) < item.episodeCount);
  if (!valid(selected)) return;
  AU.restoring = true;
  try {
    AU.queue = saved.queue.filter(valid);
    AU.index = AU.queue.findIndex(t => t.id === selected.id && t.ep === selected.ep);
    AU.mode = AU_MODES.some(mode => mode.id === saved.mode) ? saved.mode : 'order';
    const el = auEl();
    el.volume = Math.max(0, Math.min(1, Number(saved.volume) || 0));
    el.muted = !!saved.muted;
    el.defaultPlaybackRate = el.playbackRate = AU_RATES.includes(saved.rate) ? saved.rate : 1;
    syncAuMode();
    await loadAuTrack(AU.index, { autoplay: !!opts.playPage || !!saved.playing, resume: Math.max(0, Number(saved.position) || 0) });
    if (!AU.data) { AU.queue = []; AU.index = -1; return; }
    if (opts.playPage || saved.open) showAudioPage(); else syncMiniBar();
    if (state.route.name === 'list' && state.route.type === 'music' && MUSIC.data) { paintMusic(); scrollToCurrentMusic(); }
  } finally { AU.restoring = false; }
}

window.addEventListener('pagehide', () => persistAudioSession(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) persistAudioSession(true); });

const AU_MODES = [
  { id: 'order', label: '列表循环' },
  { id: 'single', label: '单曲循环' },
  { id: 'shuffle', label: '随机播放' }
];

function auEl() {
  if (!AU.el) AU.el = $('#audioEl');
  return AU.el;
}

function auIndexInfo() {
  const t = AU.queue[AU.index];
  return t || null;
}

function auTrackArt(t, d) {
  if (t && t.art) return t.art;
  if (d && d.poster) return d.poster;
  return `/api/cover?item=${encodeURIComponent((t && t.id) || '')}&ep=${(t && t.ep) || 0}&fallback=0`;
}

/** 后端 /api/play 的 playlist → 队列项 */
function queueFromPlaylist(d) {
  const pl = d && d.playlist;
  const album = d && d.kind === 'album' ? d.title : '';
  if (pl && pl.items && pl.items.length) {
    return pl.items.map((it) => ({
      key: `${it.itemId}:${it.epIndex}`,
      id: it.itemId,
      ep: it.epIndex || 0,
      title: it.title || it.name || '',
      artist: it.artist || '',
      album,
      art: ''
    }));
  }
  return [
    {
      key: `${d.itemId}:${d.epIndex}`,
      id: d.itemId,
      ep: d.epIndex || 0,
      title: d.episodeTitle || d.title,
      artist: d.episodeArtist || d.artist || '',
      album,
      art: ''
    }
  ];
}

/** 视频还是音频？拿媒体库缓存判断，缓存里没有才回退问服务端 */
async function openPlayback(itemId, epIndex = 0) {
  const navigationVersion = routeVersion;
  const it = allItems().find((i) => i.id === itemId);
  if (it) return it.type === 'music' ? openAudio(itemId, epIndex) : openPlayer(itemId, epIndex);
  try {
    const d = await api(`/api/play?item=${encodeURIComponent(itemId)}&ep=${epIndex}`);
    if (navigationVersion !== routeVersion) return;
    if (d && d.audio) return openAudio(itemId, epIndex, d);
  } catch (e) {
    /* 让视频播放器去报错 */
  }
  if (navigationVersion === routeVersion) return openPlayer(itemId, epIndex);
}

async function openAudio(itemId, epIndex = 0, preloaded = null, opts = {}) {
  const navigationVersion = routeVersion;
  let d = preloaded;
  if (!d) {
    try {
      d = await api(`/api/play?item=${encodeURIComponent(itemId)}&ep=${epIndex}`);
    } catch (e) {
      toast(e.message || '无法播放');
      return;
    }
  }
  if (navigationVersion !== routeVersion) return;
  if (!d.playable) {
    toast('该音频编码暂不支持播放，请安装 ffmpeg 后重试');
    return;
  }
  // 关闭视频播放器（两者互斥，避免同时出声）
  if (!$('#player').hidden) closePlayer();

  AU.data = d;
  if (opts.queue && opts.queue.length) {
    AU.queue = opts.queue.slice();
    AU.index = opts.index !== undefined ? opts.index : AU.queue.findIndex((t) => t.id === d.itemId && t.ep === d.epIndex);
    if (AU.index < 0) AU.index = 0;
  } else {
    AU.queue = queueFromPlaylist(d);
    const pl = d.playlist;
    AU.index = pl && pl.current !== undefined ? pl.current : Math.max(0, AU.queue.findIndex((t) => t.id === d.itemId));
    if (AU.index < 0) AU.index = 0;
  }

  await loadAuTrack(AU.index, { autoplay: true, data: d });
  if (navigationVersion !== routeVersion) return;
  if (state.route.name === 'list' && state.route.type === 'music') hideAudioPage();
  else showAudioPage();
}

async function loadAuTrack(i, opts = {}) {
  const t = AU.queue[i];
  if (!t) return;
  const el = auEl();

  let d = opts.data;
  if (!d || d.itemId !== t.id || Number(d.epIndex) !== Number(t.ep)) {
    try {
      d = await api(`/api/play?item=${encodeURIComponent(t.id)}&ep=${t.ep || 0}`);
    } catch (e) {
      toast(e.message || '加载失败');
      return;
    }
  }
  if (!d.playable) {
    toast('该音频编码暂不支持播放');
    return;
  }

  AU.index = i;
  AU.offset = 0;
  AU.lastSave = 0;
  AU.data = d;
  paintAudioPage(d, t);
  if (AU.resumeHandler) el.removeEventListener('loadedmetadata', AU.resumeHandler);
  const resume = Math.max(0, Math.min(opts.resume || 0, d.duration || opts.resume || 0));
  AU.offset = d.mode === 'direct' ? 0 : resume;
  AU.pendingPosition = resume;
  AU.resumeHandler = () => {
    if (d.mode === 'direct' && resume) el.currentTime = Math.min(resume, Number.isFinite(el.duration) ? el.duration : resume);
    AU.pendingPosition = null;
    updateAuBar();
    persistAudioSession(true);
  };
  el.addEventListener('loadedmetadata', AU.resumeHandler, { once: true });
  el.src = d.mode === 'direct' ? d.url : `${d.url}&start=${Math.floor(resume)}`;
  el.load();
  try {
    el.currentTime = 0;
  } catch (e) {
    /* ignore */
  }
  // 进歌就静默搜歌词（服务端有缓存，切歌不心疼）；失败也不打扰用户
  loadLyrics(t).catch(() => {});
  if (opts.autoplay !== false) {
    el.play().catch(() => {
      setAuPlaying(false);
      toast('浏览器拦截了自动播放，点一下播放键');
    });
  }
  syncMediaSession(d, t);
  try {
    if (AU.open) history.replaceState(null, '', `#/play/${t.id}/${t.ep || 0}`);
  } catch (e) {
    /* ignore */
  }
}

// 用同一个可中断动画衔接展开/收起，快速反向操作从当前画面继续。
let audioPageMotion = null;
function animateAudioPage(open) {
  const page = $('#audioPage');
  if (!page) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wasHidden = page.hidden;
  const current = !wasHidden && audioPageMotion ? getComputedStyle(page) : null;
  const from = current
    ? { transform: current.transform, opacity: current.opacity }
    : { transform: open && !reduced ? 'translateY(100%)' : 'translateY(0)', opacity: open && reduced ? 0 : 1 };
  if (audioPageMotion) audioPageMotion.cancel();
  audioPageMotion = null;
  page.hidden = false;
  page.inert = !open;
  const finish = () => {
    page.hidden = !open;
    page.inert = !open;
    $('#view').hidden = open || videoPageOpen;
    page.classList.remove('is-transitioning');
  };
  if (!page.animate || (!open && wasHidden)) { finish(); return; }
  page.classList.add('is-transitioning');
  const animation = page.animate([
    from,
    { transform: !open && !reduced ? 'translateY(100%)' : 'translateY(0)', opacity: !open && reduced ? 0 : 1 }
  ], {
    duration: reduced ? 100 : open ? 420 : 280,
    easing: open ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0.4, 0, 0.8, 0.4)',
    fill: 'both'
  });
  audioPageMotion = animation;
  animation.onfinish = () => {
    if (audioPageMotion !== animation) return;
    finish();
    audioPageMotion = null;
    animation.cancel();
  };
}

function showAudioPage() {
  const page = $('#audioPage');
  if (!page || (AU.open && !page.hidden)) return;
  closeMiniVolume();
  $('#miniBar').hidden = true;
  document.body.classList.remove('has-mini');
  // 动画完成前保留底层页面，面板从迷你播放器所在的底部展开。
  $('#view').hidden = false;
  AU.open = true;
  const current = auIndexInfo();
  if (current) history.replaceState(null, '', `#/play/${current.id}/${current.ep || 0}`);
  setLyricView(true);
  persistAudioSession(true);
  renderAuQueue();
  animateAudioPage(true);
}

function hideAudioPage() {
  const wasOpen = AU.open;
  AU.open = false;
  const current = auIndexInfo();
  if (current && location.hash === `#/play/${current.id}/${current.ep || 0}` && $('#player').hidden) {
    history.replaceState(null, '', '#/list/music');
    // replaceState 不触发 hashchange；直接进入播放页后折叠也要补齐音乐馆。
    if (state.route.name !== 'list' || state.route.type !== 'music') route();
  }
  persistAudioSession(true);
  $('#view').hidden = false;
  syncMiniBar();
  $('#apQueue').hidden = true;
  $('#apQueueBtn').setAttribute('aria-expanded', 'false');
  closeMiniVolume();
  if (wasOpen) animateAudioPage(false);
}

function stopAudio() {
  const el = auEl();
  if (el) {
    el.pause();
    el.removeAttribute('src');
    el.load();
  }
  AU.queue = [];
  AU.index = -1;
  AU.data = null;
  AU.pendingPosition = null;
  AU.offset = 0;
  if (AU.resumeHandler) { el.removeEventListener('loadedmetadata', AU.resumeHandler); AU.resumeHandler = null; }
  try { localStorage.removeItem(AUDIO_SESSION_KEY); } catch (e) {}
  syncMusicPlayback();
  LY.key = '';
  LY.lines = [];
  LY.nodes = [];
  LY.active = -1;
  renderLyric();
  setLyricView(false);
  hideAudioPage();
  syncMiniBar();
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
}

function syncMiniBar() {
  const bar = $('#miniBar');
  if (!bar) return;
  const t = auIndexInfo();
  // 迷你播放面板仅在音乐模块显示，离开模块不影响后台播放。
  const videoOpen = !$('#player').hidden;
  const inMusic = state.route.name === 'list' && state.route.type === 'music';
  const visible = inMusic && !AU.open && !videoOpen;
  bar.hidden = !visible;
  document.body.classList.toggle('has-mini', visible);
  if (!visible) { closeMiniVolume(); $('#mbQueue').hidden = true; $('#mbQueueBtn').setAttribute('aria-expanded', 'false'); return; }
  $('#mbTitle').textContent = t ? t.title || '未知歌曲' : '聆境音乐';
  $('#mbSub').textContent = t ? [t.artist, t.album].filter(Boolean).join(' · ') : '选择一首歌曲开始播放';
  $('#mbFav').disabled = !t;
  $('#mbFav').classList.toggle('on', !!t && state.favorites.has(t.id));
  $('#mbFav').setAttribute('aria-pressed', String(!!t && state.favorites.has(t.id)));
  $('#mbSeek').disabled = !AU.data;
  if (!t) {
    $('#mbCover').hidden = true;
    $('#mbArtPh').hidden = false;
    $('#mbCover').dataset.src = '';
    $('#mbQueue').hidden = true;
    $('#mbQueueBtn').setAttribute('aria-expanded', 'false');
    updateAuBar();
    syncAuPlayIcon();
    return;
  }
  const img = $('#mbCover');
  const art = auTrackArt(t, AU.data);
  if (img.dataset.src !== art) {
    img.dataset.src = art;
    img.hidden = false;
    img.src = art;
  }
  $('#mbArtPh').hidden = !img.hidden;
  updateAuBar();
  renderMiniQueue();
  syncAuPlayIcon();
}

function closeMiniVolume() {
  for (const [panel, button] of [['mbVolumePop', 'mbVolumeBtn'], ['apVolumePop', 'apMute']]) {
    $(`#${panel}`).hidden = true;
    $(`#${button}`).setAttribute('aria-expanded', 'false');
  }
}

function syncMiniVolume() {
  const el = auEl();
  const value = Math.round((el.muted ? 0 : el.volume) * 100);
  for (const [input, output] of [['mbVol', 'mbVolumeValue'], ['apVol', 'apVolumeValue']]) {
    $(`#${input}`).value = value;
    $(`#${input}`).style.setProperty('--volume', `${value}%`);
    $(`#${output}`).textContent = `${value}%`;
  }
  const shape = value === 0 ? AU_VOL_MUTE : value < 50 ? AU_VOL_LOW : AU_VOL_HIGH;
  setIconD('mbVolIcon', shape);
  setIconD('apVolIcon', shape);
}

// 保留原始索引，筛选后的点击仍播放队列中的正确歌曲。
function filteredQueue(query) {
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  const terms = String(query || '').trim().split(/\s+/u).map(normalize).filter(Boolean);
  return AU.queue.map((track, index) => ({ track, index })).filter(({ track }) => {
    const fields = [track.title, track.artist, track.album].map(normalize);
    return terms.every(term => fields.some(field => {
      let cursor = 0;
      for (const char of field) if (char === term[cursor]) cursor++;
      return cursor === term.length;
    }));
  });
}

function renderMiniQueue() {
  const query = $('#mbQueueSearch').value;
  const matches = filteredQueue(query);
  $('#mbQueueCount').textContent = query.trim() ? `${matches.length} / ${AU.queue.length} 首` : `${AU.queue.length} 首`;
  $('#mbQueueList').innerHTML = matches.length ? matches.map(({ track: t, index: i }) => `<button class="mb-queue-item${i === AU.index ? ' on' : ''}" data-aact="mini-track" data-i="${i}" aria-current="${i === AU.index}"><span>${i + 1}</span><b>${esc(t.title || '未知歌曲')}</b><small>${esc(t.artist || '未知歌手')}</small></button>`).join('') : `<p class="queue-empty" role="status">${AU.queue.length ? '没有匹配的歌曲，试试其他关键词' : '选择歌曲后显示播放队列'}</p>`;
}

async function editCurrentSong() {
  const track = auIndexInfo();
  if (!track) return;
  const d = AU.data || {};
  let cover = '';
  openModal(`<div class="modal-head"><h3>编辑歌曲信息</h3><button class="close" data-act="close-modal" aria-label="关闭">${icon('close', 16)}</button></div>
    <form id="songEditForm"><div class="modal-body song-editor">
      <label>歌名<input name="title" required maxlength="200" value="${esc(d.episodeTitle || track.title || '')}"></label>
      <div class="song-match-tools"><button type="button" class="btn-line" id="songMatchBtn">${icon('search', 15)}在线匹配</button><span>按歌名查找歌手、专辑和封面</span></div>
      <div id="songMatchResults" class="song-match-results" aria-live="polite" hidden></div>
      <label>歌手<input name="artist" maxlength="200" value="${esc(d.episodeArtist || track.artist || '')}" placeholder="填写歌手名"></label>
      <label>专辑<input name="album" maxlength="200" value="${esc(track.album || '')}" placeholder="填写专辑名"></label>
      <img id="songCoverPreview" src="${esc(auTrackArt(track, d))}" alt="歌曲封面预览">
      <p class="field-hint" id="songEditStatus" role="status">通过在线匹配更新封面，点击保存后生效。</p>
    </div><div class="modal-foot"><div class="right"><button type="button" class="btn-line sm" data-act="close-modal">取消</button><button class="btn-solid" type="submit">保存</button></div></div></form>`);
  const form = $('#songEditForm');
  const matchButton = $('#songMatchBtn');
  const matchResults = $('#songMatchResults');
  let matches = [];
  let matchRequest = 0;
  let coverRequest = 0;
  matchButton.onclick = async () => {
    const title = form.elements.title.value.trim();
    if (!title) { form.elements.title.reportValidity(); return; }
    const request = ++matchRequest;
    matchButton.disabled = true;
    matchResults.hidden = false;
    matchResults.textContent = '正在在线匹配…';
    matchResults.setAttribute('aria-busy', 'true');
    try {
      const result = await api('/api/music/match', { method: 'POST', body: JSON.stringify({ title, artist: form.elements.artist.value, duration: d.duration || 0 }) });
      if (!form.isConnected || request !== matchRequest) return;
      matches = result.results || [];
      matchResults.innerHTML = matches.length ? `<p>选择正确版本，将信息填入下方表单</p>${matches.map((song, index) => `<button type="button" class="song-match-item" data-song-match="${index}"><span><b>${esc(song.title)}</b><small>${esc(song.artist || '未知歌手')} · ${esc(song.album || '未知专辑')}</small></span><small>${song.source === 'qq' ? 'QQ 音乐' : '网易云音乐'}</small></button>`).join('')}` : '<p>没有找到匹配歌曲，可调整歌名或补充歌手后重试，也可以手动填写。</p>';
    } catch (error) {
      if (form.isConnected) matchResults.textContent = `匹配失败：${error.message}，请重试或手动填写。`;
    } finally {
      matchButton.disabled = false;
      matchResults.setAttribute('aria-busy', 'false');
    }
  };
  matchResults.onclick = async event => {
    const button = event.target.closest('[data-song-match]');
    if (!button) return;
    const song = matches[Number(button.dataset.songMatch)];
    if (!song) return;
    const selection = ++coverRequest;
    const saveButton = form.querySelector('[type="submit"]');
    cover = '';
    form.elements.title.value = song.title;
    form.elements.artist.value = song.artist;
    form.elements.album.value = song.album;
    if (song.cover) {
      saveButton.disabled = true;
      $('#songEditStatus').textContent = '歌曲信息已填入，正在获取封面…';
      try {
        const resolvedCover = window.Lingjing ? await window.Lingjing.cacheCover(song.cover) : song.cover;
        if (!form.isConnected || selection !== coverRequest) return;
        cover = resolvedCover;
        preview.src = proxyURL(cover);
      } catch (error) {
        if (form.isConnected && selection === coverRequest) $('#songEditStatus').textContent = `歌曲信息已填入，封面获取失败：${error.message}。可重选版本或保留原封面保存。`;
        return;
      } finally {
        if (selection === coverRequest) saveButton.disabled = false;
      }
    } else {
      saveButton.disabled = false;
      preview.src = auTrackArt(track, d);
    }
    for (const item of matchResults.querySelectorAll('[data-song-match]')) item.setAttribute('aria-pressed', String(item === button));
    $('#songEditStatus').textContent = `已填入${song.source === 'qq' ? 'QQ 音乐' : '网易云音乐'}的歌曲信息，点击保存后生效${song.cover ? '' : '；此版本暂无封面，保留当前封面'}。`;
  };
  const preview = $('#songCoverPreview');
  preview.onerror = () => { preview.hidden = true; };
  preview.onload = () => { preview.hidden = false; };
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      // 没有选新图时保留服务端已保存的封面。
      const existing = await api(`/api/music/metadata?item=${encodeURIComponent(track.id)}&ep=${track.ep || 0}`);
      const result = await api('/api/music/metadata', { method: 'POST', body: JSON.stringify({ itemId: track.id, ep: track.ep || 0, title: form.elements.title.value, artist: form.elements.artist.value, album: form.elements.album.value, cover: cover || existing.cover || '' }) });
      const song = { ...result.song, art: result.song.art };
      for (const t of AU.queue) if (t.id === track.id && t.ep === track.ep) Object.assign(t, song);
      if (MUSIC.data) MUSIC.data = null;
      if (auIndexInfo()?.key === track.key && AU.data) {
        AU.data.song = song;
        AU.data.episodeTitle = song.title;
        AU.data.episodeArtist = song.artist;
        paintAudioPage(AU.data, auIndexInfo());
        syncMediaSession(AU.data, auIndexInfo());
      }
      persistAudioSession(true);
      closeModal();
      await loadLibrary();
      renderSidebar();
      if (state.route.name === 'list' && state.route.type === 'music') await renderMusic();
      syncMiniBar();
      toast('歌曲信息已保存');
    } catch (error) { $('#songEditStatus').textContent = error.message || '保存失败，请重试'; }
    finally { button.disabled = false; }
  };
  form.elements.title.focus();
}

function paintAudioPage(d, t) {
  if (!d) return;
  const title = d.song?.title ?? (d.episodeTitle || t.title || d.title);
  const artist = d.song?.artist ?? (d.episodeArtist || t.artist || d.artist || '');
  const album = d.song?.album ?? (d.kind === 'album' ? d.title : t.album || '');
  $('#apTitle').textContent = title;
  $('#apSub').textContent = [artist, album].filter(Boolean).join(' · ') || '未知歌手';
  $('#apLyricTitle').textContent = title;
  $('#apLyricArtist').textContent = artist || '未知歌手';
  $('#apCrumb').textContent = album ? `${album}` : '正在播放';

  const chips = [];
  if (album) chips.push(`<span class="ap-chip">${icon('note', 12)}${esc(album)}</span>`);
  if (d.acodec) chips.push(`<span class="ap-chip">${esc(String(d.acodec).toUpperCase())}</span>`);
  const cur = AU.queue[AU.index];
  if (AU.queue.length > 1) chips.push(`<span class="ap-chip">第 ${AU.index + 1} / ${AU.queue.length} 首</span>`);
  if (d.mode !== 'direct') chips.push(`<span class="ap-chip warn">实时转码 MP3</span>`);
  $('#apChips').innerHTML = chips.join('');

  if (d.song) Object.assign(t, d.song, { art: t.art && t.art.includes('&v=') ? t.art : d.song.art });
  const art = auTrackArt(t, d);
  const img = $('#apCover');
  const ph = $('#apArtPh');
  if (img.dataset.src !== art) {
    img.dataset.src = art;
    img.hidden = false;
    img.src = art;
  }
  if (ph) ph.hidden = !img.hidden;
  const bg = $('#apBg');
  if (bg) bg.style.backgroundImage = `url("${art.replace(/"/g, '')}")`;
  const fav = state.favorites.has(t.id);
  const favBtn = $('#apFav');
  if (favBtn) favBtn.classList.toggle('on', fav);

  $('#apDur').textContent = fmtTime(d.duration || auEl().duration || 0);
  const rateBtn = $('#apRate');
  if (rateBtn) {
    const r = auEl().playbackRate || 1;
    rateBtn.textContent = `${r}×`;
    rateBtn.classList.toggle('on', r !== 1);
  }
  updateAuBar();
  syncAuPlayIcon();
  renderAuQueue();
  syncMiniBar();
}

function updateAuBar() {
  const el = auEl();
  const total = (AU.data && AU.data.duration) || el.duration || 0;
  const cur = AU.pendingPosition ?? (AU.offset + (el.currentTime || 0));
  const pct = total > 0 ? Math.min(100, (cur / total) * 100) : 0;
  const fill = $('#apFill');
  if (fill) fill.style.width = `${pct}%`;
  const dot = $('#apDot');
  if (dot) dot.style.left = `${pct}%`;
  const curEl = $('#apCur');
  if (curEl) curEl.textContent = fmtTime(cur);
  const durEl = $('#apDur');
  if (durEl && total) durEl.textContent = fmtTime(total);
  const seek = $('#mbSeek');
  if (seek && !seek.matches(':active')) seek.value = Math.round(pct * 10);
  if (seek) seek.style.setProperty('--progress', `${pct}%`);
  $('#mbCur').textContent = fmtTime(cur);
  $('#mbDur').textContent = fmtTime(total);
}

// 音频元素始终独立于路由内容，导航只更新播放标记，不重载音源。
function syncMusicPlayback() {
  const el = AU.el;
  const playing = !!(AU.data && el && !el.paused && !el.ended);
  document.querySelectorAll('[data-music-playing]').forEach(node => { node.hidden = !playing; });
  const current = auIndexInfo();
  const rows = document.querySelectorAll('.mtbody .mtr[data-key]');
  rows.forEach(row => {
    const on = !!current && row.dataset.key === current.key;
    row.classList.toggle('on', on);
    if (on) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
    const marker = row.querySelector('.song-playing');
    if (marker) marker.hidden = !(on && playing);
  });
  document.querySelectorAll('.apq-no .meq').forEach(node => node.classList.toggle('is-paused', !playing));
}

function syncAuPlayIcon() {
  const el = auEl();
  const paused = !el || el.paused;
  syncMusicPlayback();
  setIconD('apPlayIcon', paused ? PLAY_D : PAUSE_D);
  setIconD('mbPlayIcon', paused ? 'M8 5.8Q8 4.5 9.2 5.3L18.8 11.2Q20 12 18.8 12.8L9.2 18.7Q8 19.5 8 18.2Z' : 'M7 5h2a1 1 0 011 1v12a1 1 0 01-1 1H7a1 1 0 01-1-1V6a1 1 0 011-1ZM15 5h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V6a1 1 0 011-1Z');
  $('#mbPlay').setAttribute('aria-label', paused ? '播放' : '暂停');
  $('#mbPlay').title = paused ? '播放' : '暂停';
  const eq = $('#apEq');
  if (eq) eq.classList.toggle('on', !paused);
  const art = $('#apArt');
  if (art) art.classList.toggle('is-playing', !paused);
}

function setAuPlaying(on) {
  const el = auEl();
  if (!el) return;
  if (on) el.play().catch(() => {});
  else el.pause();
}

function auToggle() {
  const el = auEl();
  if (!el) return;
  if (!AU.data) {
    const songs = musicFiltered();
    if (songs.length) playMusicKey(songs[0].key, songs);
    else toast('音乐库中还没有歌曲');
    return;
  }
  if (el.paused) el.play().catch(() => {});
  else el.pause();
}

function auNextIndex(step = 1) {
  const n = AU.queue.length;
  if (!n) return -1;
  if (AU.mode === 'shuffle' && n > 1) {
    let r = AU.index;
    while (r === AU.index) r = Math.floor(Math.random() * n);
    return r;
  }
  return (AU.index + step + n) % n;
}

function auNext(manual) {
  if (!AU.queue.length) return;
  if (!manual && AU.mode === 'single') {
    const el = auEl();
    el.currentTime = 0;
    el.play().catch(() => {});
    return;
  }
  loadAuTrack(auNextIndex(1), { autoplay: true });
}

function auPrev() {
  if (!AU.queue.length) return;
  const el = auEl();
  // 播了 3 秒以上，先回到本首开头（酷狗也是这个行为）
  if (el && el.currentTime > 3 && AU.data && AU.data.mode === 'direct') {
    el.currentTime = 0;
    return;
  }
  loadAuTrack(auNextIndex(-1), { autoplay: true });
}

/* --------------------------------- 歌词 --------------------------------- */
/**
 * 联网歌词：进歌就静默搜一次（服务端有 30 天缓存，不会每次都打网络）。
 * 显示走独立面板，和视频的字幕系统毫无关系。
 */
const LY = {
  key: '',
  lines: [],
  nodes: [],
  active: -1,
  loading: false,
  src: '',
  on: false,
  holdUntil: 0
};

const LY_SRC = { netease: '网易云音乐', qq: 'QQ 音乐', '本地歌词': '本地文件' };
const AU_RATES = [1, 1.25, 1.5, 2, 0.75];

function lyricKeyOf(t) {
  return t ? `${t.id}:${t.ep || 0}` : '';
}

function auCurrentTime() {
  const el = auEl();
  return AU.offset + ((el && el.currentTime) || 0);
}

function setLyricView(on) {
  const main = document.querySelector('.ap-main');
  const panel = $('#apLyric');
  if (!main || !panel) return;
  LY.on = !!on;
  panel.hidden = !LY.on;
  main.classList.toggle('lyric-on', LY.on);
  const btn = $('#apLyricBtn');
  if (btn) btn.classList.toggle('on', LY.on);
  if (LY.on) {
    requestAnimationFrame(() => {
      syncLyric(auCurrentTime(), true);
      const row = $('#lyrSearchRow');
      if (row && !row.hidden) $('#lyrQuery').focus();
    });
  } else {
    const row = $('#lyrSearchRow');
    if (row) row.hidden = true;
  }
}

function paintLyricStatus(msg) {
  const empty = $('#lyrEmpty');
  const scroll = $('#lyrScroll');
  const txt = $('#lyrEmptyTxt');
  const has = LY.lines.length > 0;
  if (scroll) scroll.hidden = !has;
  if (empty) empty.hidden = has;
  if (!has && txt) txt.textContent = msg || (LY.loading ? '正在联网搜索歌词…' : '这首歌暂时没找到歌词');
  const src = $('#lyrSrc');
  if (src) {
    src.textContent = has
      ? `歌词来自 ${LY_SRC[LY.src] || '网络'}${LY.loading ? ' · 更新中' : ''}`
      : LY.loading
        ? '正在联网搜索…'
        : '';
  }
}

function renderLyric() {
  const body = $('#lyrBody');
  if (!body) return;
  LY.active = -1;
  LY.nodes = [];
  body.innerHTML = '';
  if (!LY.lines.length) {
    paintLyricStatus();
    return;
  }
  const frag = document.createDocumentFragment();
  LY.lines.forEach((l, i) => {
    const p = document.createElement('button');
    p.type = 'button';
    p.className = 'lyr-line';
    p.dataset.i = String(i);
    p.textContent = l.text || '';
    if (l.tr) {
      const s = document.createElement('span');
      s.className = 'tr';
      s.textContent = l.tr;
      p.appendChild(s);
    }
    frag.appendChild(p);
  });
  body.appendChild(frag);
  LY.nodes = [...body.children];
  paintLyricStatus();
  syncLyric(auCurrentTime(), true);
}

function syncLyric(sec, force) {
  if (!LY.lines.length) return;
  let idx = -1;
  for (let i = 0; i < LY.lines.length; i += 1) {
    if (LY.lines[i].t <= sec + 0.12) idx = i;
    else break;
  }
  if (idx === LY.active && !force) return;
  if (LY.active >= 0 && LY.nodes[LY.active]) LY.nodes[LY.active].classList.remove('on');
  LY.active = idx;
  const node = LY.nodes[idx];
  if (!node) return;
  node.classList.add('on');
  // 用户手动滚歌词时先别抢滚动条（4 秒后自动恢复）
  if (!LY.on || Date.now() < LY.holdUntil) return;
  const sc = $('#lyrScroll');
  if (!sc) return;
  const top = sc.scrollTop + node.getBoundingClientRect().top - sc.getBoundingClientRect().top - sc.clientHeight / 2 + node.offsetHeight / 2;
  sc.scrollTo({ top: Math.max(0, top), behavior: force ? 'instant' : 'smooth' });
}

async function loadLyrics(t, opts = {}) {
  const key = lyricKeyOf(t);
  LY.key = key;
  LY.lines = [];
  LY.nodes = [];
  LY.active = -1;
  LY.src = '';
  LY.loading = true;
  renderLyric();
  paintLyricStatus(opts.q ? '正在搜索歌词…' : '正在联网搜索歌词…');
  if (!t) {
    LY.loading = false;
    return;
  }
  const qs = new URLSearchParams({ item: t.id, ep: String(t.ep || 0) });
  if (opts.q) qs.set('q', opts.q);
  if (opts.refresh) qs.set('refresh', '1');
  let d = null;
  try {
    d = await api(`/api/lyrics?${qs.toString()}`);
  } catch (e) {
    d = null;
  }
  if (LY.key !== key) return; // 中途切歌了，丢弃这次结果
  LY.loading = false;
  if (d && d.ok && Array.isArray(d.lines) && d.lines.length) {
    LY.lines = d.lines;
    LY.src = d.source || '';
    renderLyric();
  } else {
    paintLyricStatus(opts.q ? `没搜到「${opts.q}」的歌词` : '这首歌暂时没找到歌词');
  }
}

function auToggleLyricSearch(show) {
  const row = $('#lyrSearchRow');
  if (!row) return;
  row.hidden = show === undefined ? !row.hidden : !show;
  if (!row.hidden) {
    const inp = $('#lyrQuery');
    const t = auIndexInfo();
    if (inp) {
      if (!inp.value && t) inp.value = [t.title, t.artist].filter(Boolean).join(' ');
      inp.focus();
      inp.select();
    }
  }
}

function auCycleSpeed() {
  const el = auEl();
  if (!el) return;
  const i = AU_RATES.indexOf(el.playbackRate);
  const rate = AU_RATES[(i + 1) % AU_RATES.length];
  el.playbackRate = rate;
  const btn = $('#apRate');
  if (btn) {
    btn.textContent = `${rate}×`;
    btn.classList.toggle('on', rate !== 1);
  }
  toast(rate === 1 ? '恢复 1 倍速' : `${rate} 倍速播放中`, 1200);
}

function auSeek(sec) {
  const el = auEl();
  const d = AU.data;
  if (!el || !d) return;
  const total = d.duration || el.duration || 0;
  const target = Math.max(0, Math.min(total || sec, sec));
  if (d.mode === 'direct') {
    try {
      el.currentTime = target;
    } catch (e) {
      /* ignore */
    }
  } else {
    // 转码流不支持 range：带 start 重新起流
    AU.offset = target;
    el.src = `${d.url}&start=${Math.floor(target)}`;
    el.play().catch(() => {});
  }
  updateAuBar();
  persistAudioSession(true);
}

function auCycleMode() {
  const i = AU_MODES.findIndex((m) => m.id === AU.mode);
  const next = AU_MODES[(i + 1) % AU_MODES.length];
  AU.mode = next.id;
  persistAudioSession(true);
  syncAuMode();
  toast(`播放模式：${next.label}`);
}

function syncAuMode() {
  const next = AU_MODES.find(mode => mode.id === AU.mode) || AU_MODES[0];
  const txt = $('#apModeTxt');
  if (txt) txt.textContent = next.label;
  const btn = $('#apModeBtn');
  if (btn) btn.title = `播放模式：${next.label}`;
  const iconD = AU.mode === 'single' ? 'M19 9V7a2 2 0 00-2-2H5m0 0 3-3M5 5l3 3M5 15v2a2 2 0 002 2h12m0 0-3-3m3 3-3 3M11 10l2-1v6' : AU.mode === 'shuffle' ? 'M4 6h2c5 0 7 12 12 12h2m-3-3 3 3-3 3M4 18h2c2 0 3.5-2 5-5M14 8c1.3-1.3 2.5-2 4-2h2m-3-3 3 3-3 3' : 'M19 9V7a2 2 0 00-2-2H5m0 0 3-3M5 5l3 3M5 15v2a2 2 0 002 2h12m0 0-3-3m3 3-3 3';
  setIconD('apModeIcon', iconD);
  setIconD('mbModeIcon', iconD);
  $('#mbMode').title = `播放模式：${next.label}`;
  $('#mbMode').setAttribute('aria-label', `播放模式：${next.label}`);
}

function positionAuQueue() {
  const q = $('#apQueue');
  if (!q || q.hidden) return;
  const bounds = document.querySelector('.ap-bottom').getBoundingClientRect();
  const page = $('#audioPage').getBoundingClientRect();
  const edge = bounds.top - 12;
  q.style.bottom = `${window.innerHeight - edge}px`;
  q.style.right = `${Math.max(12, window.innerWidth - bounds.right)}px`;
  q.style.width = `${Math.min(390, bounds.width)}px`;
  q.style.height = `${Math.max(80, Math.min(440, edge - page.top - 12))}px`;
}
window.addEventListener('resize', positionAuQueue);

function renderAuQueue() {
  const list = $('#apqList');
  if (!list) return;
  const meta = $('#apqMeta');
  const query = $('#apqSearch').value;
  const matches = filteredQueue(query);
  if (meta) meta.textContent = query.trim() ? `${matches.length} / ${AU.queue.length} 首` : `${AU.queue.length} 首`;
  list.innerHTML = matches
    .map(({ track: t, index: i }) => {
      const on = i === AU.index;
      return `<button class="apq-item${on ? ' on' : ''}" data-act="auplay" data-i="${i}" aria-current="${on}" title="${on ? '当前歌曲' : '播放'}：${esc(t.title || '未知歌曲')}">
        <span class="apq-no"><span class="apq-index">${on ? '<i class="meq"><b></b><b></b><b></b></i>' : i + 1}</span><span class="apq-play" aria-hidden="true">${icon('play', 14)}</span></span>
        <span class="apq-name">${esc(t.title || '—')}</span>
        <span class="apq-art">${esc(t.artist || '')}</span>
      </button>`;
    })
    .join('');
  if (!matches.length) list.innerHTML = `<p class="queue-empty" role="status">${AU.queue.length ? '没有匹配的歌曲，试试其他关键词' : '选择歌曲后显示播放队列'}</p>`;
  const curEl = !query.trim() && list.querySelector('.apq-item.on');
  if (curEl && list.scrollHeight > list.clientHeight + 1) {
    const lr = list.getBoundingClientRect();
    const cr = curEl.getBoundingClientRect();
    if (cr.top < lr.top || cr.bottom > lr.bottom) {
      list.scrollTop += cr.top - lr.top - (list.clientHeight - cr.height) / 2;
    }
  }
}

function syncMediaSession(d, t) {
  if (!('mediaSession' in navigator)) return;
  const title = d.song?.title ?? (d.episodeTitle || t.title || d.title);
  const artist = d.song?.artist ?? (d.episodeArtist || t.artist || d.artist || '');
  const art = auTrackArt(t, d);
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: d.kind === 'album' ? d.title : '',
      artwork: art ? [{ src: art, sizes: '512x512', type: 'image/jpeg' }] : []
    });
    const set = (k, fn) => {
      try {
        navigator.mediaSession.setActionHandler(k, fn);
      } catch (e) {
        /* ignore */
      }
    };
    set('play', () => auEl().play().catch(() => {}));
    set('pause', () => auEl().pause());
    set('previoustrack', () => auPrev());
    set('nexttrack', () => auNext(true));
    set('seekbackward', () => auSeek(Math.max(0, auEl().currentTime - 10)));
    set('seekforward', () => auSeek(auEl().currentTime + 10));
  } catch (e) {
    /* ignore */
  }
}

function saveAuProgress(force) {
  const d = AU.data;
  const t = auIndexInfo();
  if (!d || !t) return;
  const now = Date.now();
  if (!force && now - AU.lastSave < 8000) return;
  AU.lastSave = now;
  const position = AU.offset + (auEl().currentTime || 0);
  if (!position || position < 3) return;
  fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemId: t.id,
      epIndex: t.ep || 0,
      position,
      duration: d.duration || auEl().duration || 0
    })
  }).catch(() => {});
}

function bindAudio() {
  const el = auEl();
  if (!el) return;

  // 目录里没有 cover/folder 图时 /api/cover 会 404 → 隐藏 img，露出占位封面
  const coverImg = $('#apCover');
  if (coverImg) {
    coverImg.addEventListener('error', () => {
      coverImg.hidden = true;
      const ph = $('#apArtPh');
      if (ph) ph.hidden = false;
    });
  }
  const mbImg = $('#mbCover');
  if (mbImg) {
    mbImg.addEventListener('error', () => {
      mbImg.hidden = true;
      $('#mbArtPh').hidden = false;
    });
  }

  el.addEventListener('timeupdate', () => {
    if (AU.dragging) return;
    updateAuBar();
    syncLyric(auCurrentTime());
    saveAuProgress();
    persistAudioSession();
  });
  el.addEventListener('play', () => {
    persistAudioSession(true);
    syncAuPlayIcon();
    syncMiniBar();
  });
  el.addEventListener('pause', () => {
    persistAudioSession(true);
    syncAuPlayIcon();
    saveAuProgress(true);
    syncMiniBar();
  });
  el.addEventListener('loadedmetadata', () => {
    if (AU.data && !AU.data.duration && el.duration) AU.data.duration = el.duration;
    updateAuBar();
  });
  el.addEventListener('ended', () => {
    syncMusicPlayback();
    saveAuProgress(true);
    if (!AU.queue.length) return;
    if (AU.mode === 'single') {
      el.currentTime = 0;
      el.play().catch(() => {});
      return;
    }
    const next = auNextIndex(1);
    if (next >= 0) loadAuTrack(next, { autoplay: true });
  });
  el.addEventListener('error', () => {
    if (!el.currentSrc) return;
    toast('这首播放失败，跳到下一首');
    setTimeout(() => auNext(true), 400);
  });

  // 进度条拖动
  const bar = $('#apBar');
  const ratioOf = (evt) => {
    const r = bar.getBoundingClientRect();
    return Math.min(1, Math.max(0, (evt.clientX - r.left) / r.width));
  };
  const totalOf = () => (AU.data && AU.data.duration) || el.duration || 0;
  bar.addEventListener('pointerdown', (e) => {
    if (!AU.data) return;
    e.preventDefault();
    AU.dragging = true;
    AU.dragValue = ratioOf(e) * totalOf();
    $('#apFill').style.width = `${ratioOf(e) * 100}%`;
    $('#apDot').style.left = `${ratioOf(e) * 100}%`;
    $('#apCur').textContent = fmtTime(AU.dragValue);
    try {
      bar.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
  });
  bar.addEventListener('pointermove', (e) => {
    if (!AU.dragging) return;
    AU.dragValue = ratioOf(e) * totalOf();
    $('#apFill').style.width = `${ratioOf(e) * 100}%`;
    $('#apDot').style.left = `${ratioOf(e) * 100}%`;
    $('#apCur').textContent = fmtTime(AU.dragValue);
  });
  const endDrag = (e) => {
    if (!AU.dragging) return;
    AU.dragging = false;
    auSeek(AU.dragValue || 0);
    try {
      bar.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  const miniSeek = $('#mbSeek');
  miniSeek.addEventListener('input', () => {
    const total = (AU.data && AU.data.duration) || el.duration || 0;
    const pct = Number(miniSeek.value) / 10;
    miniSeek.style.setProperty('--progress', `${pct}%`);
    $('#mbCur').textContent = fmtTime(total * pct / 100);
  });
  miniSeek.addEventListener('change', () => {
    auSeek(Number(miniSeek.value) / 1000 * ((AU.data && AU.data.duration) || el.duration || 0));
  });
  $('#mbVol').addEventListener('input', e => {
    el.volume = Number(e.target.value) / 100;
    el.muted = el.volume === 0;
    syncMiniVolume();
  });

  // 音量
  const vol = $('#apVol');
  if (vol) {
    vol.addEventListener('input', () => {
      const v = Number(vol.value) / 100;
      el.muted = v === 0;
      el.volume = v;
      syncMiniVolume();
    });
  }
  el.addEventListener('ratechange', () => persistAudioSession(true));
  el.addEventListener('volumechange', () => {
    persistAudioSession(true);
    if (vol) vol.value = Math.round((el.muted ? 0 : el.volume) * 100);
    syncMiniVolume();

  });

  // 歌词：点某一行跳到那一句；手动滚动的 4 秒内不抢滚动条
  const lyrBody = $('#lyrBody');
  if (lyrBody) {
    lyrBody.addEventListener('click', (e) => {
      const line = e.target.closest('.lyr-line');
      if (!line) return;
      const l = LY.lines[Number(line.dataset.i)];
      if (!l) return;
      auSeek(l.t);
      LY.holdUntil = 0;
      syncLyric(l.t, true);
    });
  }
  const lyrScroll = $('#lyrScroll');
  if (lyrScroll) {
    const hold = () => {
      LY.holdUntil = Date.now() + 4000;
    };
    lyrScroll.addEventListener('wheel', hold, { passive: true });
    lyrScroll.addEventListener('touchstart', hold, { passive: true });
  }
  const lyrQuery = $('#lyrQuery');
  if (lyrQuery) {
    lyrQuery.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = lyrQuery.value.trim();
      const t = auIndexInfo();
      if (!q) return;
      loadLyrics(t, { q, refresh: true }).catch(() => {});
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#apQueue').hidden) { $('#apQueue').hidden = true; $('#apQueueBtn').setAttribute('aria-expanded', 'false'); $('#apQueueBtn').focus(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === 'Escape') { if (!$('#mbVolumePop').hidden || !$('#apVolumePop').hidden) { const button = $('#apVolumePop').hidden ? $('#mbVolumeBtn') : $('#apMute'); closeMiniVolume(); button.focus(); e.preventDefault(); e.stopImmediatePropagation(); return; } $('#mbQueue').hidden = true; $('#mbQueueBtn').setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#apQueue, #apQueueBtn')) { $('#apQueue').hidden = true; $('#apQueueBtn').setAttribute('aria-expanded', 'false'); }
    if (!e.target.closest('.mb-volume')) closeMiniVolume();
    if (!e.target.closest('#mbQueue, #mbQueueBtn')) { $('#mbQueue').hidden = true; $('#mbQueueBtn').setAttribute('aria-expanded', 'false'); }
  });
  // 播放页 / 迷你条 的点击
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-aact]');
    if (!btn) return;
    const act = btn.dataset.aact;
    if (act === 'close') return hideAudioPage();
    if (act === 'expand') { if (AU.data) showAudioPage(); return; }
    if (act === 'mini-volume' || act === 'audio-volume') {
      const full = act === 'audio-volume';
      const panel = $(full ? '#apVolumePop' : '#mbVolumePop');
      const wasHidden = panel.hidden;
      closeMiniVolume();
      panel.hidden = !wasHidden;
      $(full ? '#apMute' : '#mbVolumeBtn').setAttribute('aria-expanded', String(!panel.hidden));
      syncMiniVolume();
      if (!panel.hidden) $(full ? '#apVol' : '#mbVol').focus();
      return;
    }
    if (act === 'mini-queue') {
      const q = $('#mbQueue');
      q.hidden = !q.hidden;
      $('#mbQueueBtn').setAttribute('aria-expanded', String(!q.hidden));
      renderMiniQueue();
      if (!q.hidden) $('#mbQueueSearch').focus();
      return;
    }
    if (act === 'mini-track') return loadAuTrack(Number(btn.dataset.i), { autoplay: true });
    if (act === 'stop') return stopAudio();
    if (act === 'toggle') return auToggle();
    if (act === 'next') return auNext(true);
    if (act === 'prev') return auPrev();
    if (act === 'mode') return auCycleMode();
    if (act === 'speed') return auCycleSpeed();
    if (act === 'lyric') return setLyricView(!LY.on);
    if (act === 'back10') {
      auSeek(Math.max(0, auCurrentTime() - 10));
      return toast('快退 10 秒', 900);
    }
    if (act === 'fwd10') {
      auSeek(auCurrentTime() + 10);
      return toast('快进 10 秒', 900);
    }
    if (act === 'lyrsearch2') return auToggleLyricSearch();
    if (act === 'lyrsearch') {
      const inp = $('#lyrQuery');
      const q = ((inp && inp.value) || '').trim();
      if (!q) {
        if (inp) inp.focus();
        return toast('先输入歌名或「歌名 歌手」');
      }
      const t = auIndexInfo();
      loadLyrics(t, { q, refresh: true }).catch(() => {});
      return;
    }
    if (act === 'lyrrefresh') {
      const t = auIndexInfo();
      if (!t) return;
      toast('正在重新匹配歌词…', 1400);
      loadLyrics(t, { refresh: true }).catch(() => {});
      return;
    }
    if (act === 'queue') {
      const q = $('#apQueue');
      q.hidden = !q.hidden;
      $('#apQueueBtn').setAttribute('aria-expanded', String(!q.hidden));
      if (!q.hidden) { positionAuQueue(); renderAuQueue(); $('#apqSearch').focus(); }
      return;
    }
    if (act === 'mute') {
      el.muted = !el.muted;
      syncMiniVolume();
      return toast(el.muted ? '静音' : '取消静音', 900);
    }
    if (act === 'fav') {
      const t = auIndexInfo();
      if (!t) return;
      if (state.favorites.has(t.id)) {
        state.favorites.delete(t.id);
        toast('已取消收藏');
      } else {
        state.favorites.add(t.id);
        toast('已加入收藏');
      }
      localStorage.setItem('yy_fav', JSON.stringify([...state.favorites]));
      renderSidebar();
      $('#apFav').classList.toggle('on', state.favorites.has(t.id));
      syncMiniBar();
      return;
    }
    if (act === 'edit-song') return editCurrentSong();
    if (act === 'info') {
      const t = auIndexInfo();
      if (!t) return;
      hideAudioPage();
      go(`#/item/${t.id}`);
      return;
    }
    if (act === 'album' || act === 'artist') {
      const t = auIndexInfo();
      MUSIC.tab = 'song';
      if (act === 'album' && t && t.album) {
        MUSIC.album = t.album;
        MUSIC.artist = 'all';
      } else if (act === 'artist' && t) {
        MUSIC.artist = t.artist || '未知歌手';
        MUSIC.album = 'all';
      } else {
        toast(act === 'album' ? '这首歌没有专辑信息' : '这首歌没有歌手信息');
        return;
      }
      hideAudioPage();
      go('#/list/music');
      return;
    }
    if (act === 'auplay') {
      const i = Number(btn.dataset.i);
      if (i !== AU.index) loadAuTrack(i, { autoplay: true });
      return;
    }
  });

  // 音频页键盘
  document.addEventListener('keydown', (e) => {
    if (!AU.open || !$('#modalLayer').hidden) return;
    // Esc 优先处理：歌词搜索框里按 Esc 也要能收起来
    if (e.key === 'Escape') {
      const row = $('#lyrSearchRow');
      if (row && !row.hidden) {
        row.hidden = true;
        return;
      }
      const q = $('#apQueue');
      if (q && !q.hidden) {
        q.hidden = true;
        return;
      }
      return hideAudioPage();
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === ' ') {
      e.preventDefault();
      return auToggle();
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      auSeek(auCurrentTime() + 10);
      return toast('快进 10 秒', 900);
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      auSeek(Math.max(0, auCurrentTime() - 10));
      return toast('快退 10 秒', 900);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      el.volume = Math.min(1, el.volume + 0.05);
      return toast(`音量 ${Math.round(el.volume * 100)}%`, 800);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      el.volume = Math.max(0, el.volume - 0.05);
      return toast(`音量 ${Math.round(el.volume * 100)}%`, 800);
    }
    const low = e.key.toLowerCase();
    if (low === 'n') return auNext(true);
    if (low === 'p') return auPrev();
    if (low === 'l') return setLyricView(!LY.on);
    if (low === 'm') {
      el.muted = !el.muted;
      syncMiniVolume();
      toast(el.muted ? '静音' : '取消静音', 900);
    }
  });

  window.addEventListener('beforeunload', () => saveAuProgress(true));
}

/* -------------------------------- 登录页 -------------------------------- */
function loginHTML() {
  const s = (state.boot && state.boot.server) || {};
  return `<div class="login-page">
    <div class="login-card">
      <div class="login-logo">
        <img src="/brand.png" width="36" height="36" alt="聆境音乐" />
        <div class="brand-text">聆境音乐</div>
        <div class="brand-tag">NAS</div>
      </div>
      <h2>连接你的群晖</h2>
      <p class="sub">输入 NAS 的 IP 与账号，即可自动读取视频目录、分类并在线播放。</p>
      <div id="loginErr"></div>
      <form id="loginForm">
        <div class="field-row">
          <div class="field" style="flex:2">
            <label>服务器地址</label>
            <input name="host" placeholder="192.168.1.100 或 nas.local" value="${esc(s.host || '')}" autocomplete="off" />
          </div>
          <div class="field" style="flex:1">
            <label>端口</label>
            <input name="port" type="number" placeholder="5001" value="${esc(s.port || 5001)}" />
          </div>
        </div>
        <div class="discover-row">
          <button type="button" class="link-btn" data-act="discover" id="discoverBtn">${icon('wifi', 14)} 扫描局域网，自动找到我的群晖</button>
        </div>
        <div class="discover-list" id="discoverResult" hidden></div>
        <div class="field">
          <label>账号</label>
          <input name="account" placeholder="群晖登录账号" value="${esc(s.account || '')}" autocomplete="username" />
        </div>
        <div class="field">
          <label>密码</label>
          <input name="password" type="password" placeholder="登录密码" autocomplete="current-password" />
        </div>
        <div class="field" id="otpField" hidden>
          <label>两步验证码</label>
          <input name="otp" placeholder="6 位动态验证码" autocomplete="one-time-code" />
        </div>
        <label class="check"><input type="checkbox" name="https" ${s.https !== false ? 'checked' : ''} /> 使用 HTTPS（群晖默认 5001 端口）</label>
        <p class="login-hint">本次连接不保存密码，退出软件后需要重新登录。</p>
        <button class="btn-block" type="submit" id="loginBtn">登录</button>
      </form>
      <div class="login-alt">
        <button type="button" data-act="local">没有群晖？先浏览本机文件夹 →</button>
      </div>
      <div class="field-hint" style="margin-top:14px">
        需在「群晖控制面板 → 文件服务 → 启用 File Station」，并确认该账号拥有 File Station 权限。
      </div>
    </div>
  </div>`;
}

/* 「连不上」的两种真实原因：网段里没有群晖 / 本机没有局域网权限 */
function blockedHint(localIps) {
  const mine = (localIps || []).join('、');
  return `<div class="discover-hint">扫描没能发出任何请求（本机${
    mine ? ` IP：${esc(mine)}` : ''
  }）。这通常是系统拦截了局域网访问：<br />
    <b>macOS</b>：系统设置 → 隐私与安全性 → <b>本地网络</b>，把「终端 / Node / 聆境音乐」都打开，然后重启聆境音乐；<br />
    <b>Windows</b>：首次运行弹窗里勾选「专用网络」，或检查 Windows 防火墙是否放行。</div>`;
}

function hostsHTML(hosts) {
  return hosts
    .map(
      (h) => `<button type="button" class="host-item" data-act="pick-host" data-ip="${esc(h.ip)}" data-port="${h.port}" data-https="${h.https}">
        <span class="host-dot"></span><b>${esc(h.hostname || 'DiskStation')}</b>
        <span class="ip">${esc(h.ip)}:${h.port} · ${h.https ? 'HTTPS' : 'HTTP'}</span>
      </button>`
    )
    .join('');
}

async function doDiscover(btn) {
  const box = $('#discoverResult');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = '正在扫描局域网…';
  if (box) {
    box.hidden = false;
    box.innerHTML = '<div class="folder-empty">正在扫描当前网段，约需 3–8 秒…</div>';
  }
  try {
    const res = await api('/api/discover');
    if (!res.hosts || !res.hosts.length) {
      if (box) box.innerHTML = res.blocked ? blockedHint(res.localIps) : '<div class="folder-empty">没有找到群晖设备。请确认 NAS 已开机，且与这台电脑在同一局域网。</div>';
    } else if (box) {
      box.innerHTML = hostsHTML(res.hosts);
    }
  } catch (e) {
    if (box) box.innerHTML = `<div class="folder-empty">${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

/* 登录失败且原因是「连不上」时，自动在同网段找一台群晖并提示切换 */
async function suggestHosts(current) {
  const box = $('#discoverResult');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = '<div class="folder-empty">这个地址没连上，正在同一网段里找找群晖…</div>';
  try {
    const res = await api('/api/discover?force=1');
    const hosts = (res.hosts || []).filter((h) => h.ip !== String(current || '').trim());
    if (!hosts.length) {
      if (res.blocked) {
        box.innerHTML = blockedHint(res.localIps);
        return;
      }
      const mine = (res.localIps || []).join('、');
      box.innerHTML = `<div class="folder-empty">同网段也没找到群晖。请检查 NAS 是否开机、电脑是否连在同一个路由器${
        mine ? `（本机 IP：${esc(mine)}）` : ''
      }。</div>`;
      return;
    }
    box.innerHTML = `<div class="discover-tip">同网段发现 ${hosts.length} 台群晖，点一下直接填上：</div>${hostsHTML(hosts)}`;
  } catch (e) {
    box.innerHTML = `<div class="folder-empty">${esc(e.message)}</div>`;
  }
}

function renderLogin() {
  $('#view').innerHTML = loginHTML();
  const form = $('#loginForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = $('#loginBtn');
    const errBox = $('#loginErr');
    errBox.innerHTML = '';
    btn.disabled = true;
    btn.textContent = '正在连接…';
    try {
      const res = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          host: fd.get('host'),
          port: Number(fd.get('port') || 5001),
          https: !!fd.get('https'),
          account: fd.get('account'),
          password: fd.get('password'),
          otp: fd.get('otp') || '',
          remember: !!fd.get('remember')
        })
      });
      toast(`已连接 ${res.hostname || res.host}`);
      state.boot = await api('/api/state');
      renderTopbar();
      renderSidebar();
      await loadLibrary();
      startScanPoll();
      await boot();
    } catch (err) {
      errBox.innerHTML = `<div class="login-err">${esc(err.message)}</div>`;
      if (/两步验证|验证码/.test(err.message)) $('#otpField').hidden = false;
      if (/无法访问|连不上|超时|拒绝|本地网络|ENOTFOUND|ECONN/.test(err.message)) suggestHosts(fd.get('host'));
    } finally {
      btn.disabled = false;
      btn.textContent = '登录';
    }
  });
}

/* -------------------------------- 设置页 -------------------------------- */
function settingsHTML() {
  const b = state.boot || {};
  const s = b.server || {};
  const sources = b.sources || [];
  const typeOptions = [['music', '音乐']];
  return `<div class="settings">
    <h1>设置</h1>
    <div class="panel appearance-panel">
      <div class="panel-head"><div class="panel-title">外观</div><div class="panel-desc">强调色随亮色与暗色主题自动适配，选择后立即生效</div></div>
      <div class="accent-heading"><span id="accentLabel">强调色</span><span id="accentName" aria-live="polite">${(ACCENT_COLORS.find(([id]) => id === document.documentElement.dataset.accent) || ACCENT_COLORS[0])[1]}</span></div>
      <div class="accent-options" role="group" aria-labelledby="accentLabel">
        ${ACCENT_COLORS.map(([id, name, swatch]) => `<button type="button" class="accent-swatch" data-act="accent" data-color="${id}" style="--swatch: ${swatch}" aria-label="${name}" title="${name}" aria-pressed="${document.documentElement.dataset.accent === id}"><svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button>`).join('')}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title">群晖服务器</div>
        <div class="panel-desc">${b.connected ? '已连接' : '未连接'}</div>
      </div>
      <div class="kv"><b>地址</b><span>${s.host ? `${esc(s.host)}:${esc(s.port)} ${s.https ? '(HTTPS)' : '(HTTP)'}` : '—'}</span></div>
      <div class="kv"><b>设备名</b><span>${esc(b.hostname || '—')}</span></div>
      <div class="kv"><b>账号</b><span>${esc(s.account || '—')}</span></div>
      <div class="panel-foot">
        <button class="btn-line sm" data-act="relogin">${icon('link', 14)} 重新登录</button>
        <button class="btn-line sm" data-act="logout">${icon('close', 14)} 退出登录</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div class="panel-title">音乐目录</div>
        <div class="panel-desc">自动扫描目录及子目录中的歌曲</div>
      </div>
      <div id="sourceList">
        ${sources.length
          ? sources
              .map(
                (src) => `<div class="src-row" data-sid="${src.id}">
                  <div>${icon('folder', 18)}
                  </div>
                  <div class="src-meta">
                    <div class="src-name">${esc(src.name)}</div>
                    <div class="src-path">${esc(src.path)} · ${src.provider === 'local' ? '本机' : '群晖'}</div>
                  </div>
                  <div class="src-actions">
                    <select class="src-type-select" data-act="src-type" data-sid="${esc(src.id)}" aria-label="${esc(src.name)}的资源分类">
                      ${typeOptions.map(([v, l]) => `<option value="${v}" ${src.type === v ? 'selected' : ''}>${l}</option>`).join('')}
                    </select>
                    <button class="btn-line sm src-scan" data-act="scan-source" data-sid="${esc(src.id)}" aria-label="扫描${esc(src.name)}目录">${icon('refresh', 14)}<span>扫描</span></button>
                    <button class="icon-btn danger" data-act="del-source" data-sid="${src.id}" title="移除">${icon('trash', 15)}</button>
                  </div>
                </div>`
              )
              .join('')
          : `<div class="folder-empty">还没有添加音乐目录</div>`}
      </div>
      <div class="panel-foot">
        <button class="btn-line sm" data-act="add-nas">${icon('plus', 14)} 添加群晖目录</button>
        <button class="btn-line sm" data-act="local">${icon('folder', 14)} 添加本机目录</button>
        <button class="btn-line sm" data-act="scan">${icon('refresh', 14)} 立即重新扫描</button>
        
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div class="panel-title">更新进度提示</div><div class="panel-desc">关闭提示不影响后台扫描和信息匹配</div></div>
      <label class="task-progress-setting"><span>显示媒体库更新进度</span><input type="checkbox" role="switch" data-act="task-progress-visibility" ${state.taskProgressDismissed ? '' : 'checked'} /></label>
    </div>

    <div class="panel">
      <div class="panel-head"><div class="panel-title">关于</div></div>
      <div class="kv"><b>版本</b><span>聆境音乐 ${esc(b.version || '')}</span></div>
      <div class="kv"><b>媒体库</b><span>${(state.lib && state.lib.total) || 0} 张专辑</span></div>
      
    </div>
  </div>`;
}

function renderSettings() {
  $('#view').innerHTML = settingsHTML();
  renderTaskProgress();
}

/* -------------------------------- 目录浏览 -------------------------------- */
function openModal(html, cls = '') {
  const layer = $('#modalLayer');
  layer.hidden = false;
  // 注意：这里不能给 .modal 加 onclick="event.stopPropagation()"，
  // 全局点击是委托在 document 上的，一旦阻止冒泡，弹窗里的关闭/取消按钮全部失效
  layer.innerHTML = `<div class="modal ${cls}">${html}</div>`;
  layer.onclick = (e) => {
    if (e.target === layer) closeModal();
  };
}

function closeModal() {
  rematchController?.abort();
  const layer = $('#modalLayer');
  layer.hidden = true;
  layer.innerHTML = '';
  state.browse = null;
}

async function openFolderBrowser(provider) {
  state.browse = { provider, path: '', type: 'music', name: '', loading: true };
  openModal(folderModalHTML());
  await loadBrowse('');
}

function folderModalHTML() {
  const b = state.browse || {};
  return `<div class="modal-head">
      <h3>${b.provider === 'local' ? '选择本机文件夹' : '选择群晖目录'}</h3>
      <button class="close" data-act="close-modal">${icon('close', 16)}</button>
    </div>
    <div class="modal-body" id="browseBody">
      <div class="crumb" id="browseCrumb">${b.path ? esc(b.path) : '正在读取…'}</div>
      <div class="folder-list" id="browseList"><div class="folder-empty">读取中…</div></div>
    </div>
    <div class="modal-foot">
      <select id="browseType" style="height:34px;border:1px solid #eef0f3;border-radius:8px;font-size:12.5px;padding:0 8px;color:#4b5058">
        <option value="music">音乐</option>
</select>
      <div class="right">
        <button class="btn-line sm" data-act="close-modal">取消</button>
        <button class="btn-solid" style="height:34px;padding:0 18px;font-size:13px" data-act="pick-folder">选择此目录</button>
      </div>
    </div>`;
}

async function loadBrowse(pathname) {
  const b = state.browse;
  if (!b) return;
  b.loading = true;
  const listEl = $('#browseList');
  const crumbEl = $('#browseCrumb');
  if (listEl) listEl.innerHTML = `<div class="folder-empty">读取中…</div>`;
  try {
    const data = await api(`/api/browse?provider=${b.provider}&path=${encodeURIComponent(pathname || '')}`);
    b.path = data.path || '';
    b.parent = data.parent || '';
    b.videoCount = data.videoCount || 0;
    if (crumbEl) {
      const parts = String(b.path || '').split('/').filter(Boolean);
      const prefix = b.provider === 'local' ? '' : '/';
      crumbEl.innerHTML =
        `<button data-act="browse-go" data-path="">${b.provider === 'local' ? '根目录' : '共享文件夹'}</button>` +
        parts
          .map((p, i) => {
            const target = prefix + parts.slice(0, i + 1).join('/');
            return `${icon('right', 10)}<button data-act="browse-go" data-path="${esc(target)}">${esc(p)}</button>`;
          })
          .join('');
    }
    if (listEl) {
      const folders = data.folders || [];
      listEl.innerHTML = folders.length
        ? folders
            .map(
              (f) => `<button class="folder-item" data-act="browse-go" data-path="${esc(f.path)}">
                ${icon('folder', 17)}<span>${esc(f.name)}</span>${icon('right', 14)}
              </button>`
            )
            .join('')
        : `<div class="folder-empty">${b.path ? '该目录下没有子文件夹' : '没有可浏览的目录'}</div>`;
    }
  } catch (e) {
    if (listEl) listEl.innerHTML = `<div class="folder-empty">${esc(e.message)}</div>`;
  } finally {
    b.loading = false;
  }
}

/* -------------------------------- 重新匹配 -------------------------------- */
function rematchHTML(item) {
  return `<div class="modal-head">
      <h3>重新匹配影片信息</h3>
      <button class="close" data-act="close-modal">${icon('close', 16)}</button>
    </div>
    <div class="modal-body">
      <div class="field">
        <label for="rematchQuery">搜索片名</label>
        <div class="rematch-search"><input id="rematchQuery" value="${esc(item.title)}" placeholder="输入片名或粘贴百度百科词条链接" maxlength="200" /><button class="btn-line" data-act="rematch-search">搜索</button></div>
        <div class="field-hint">各来源独立搜索，找到即可点选。支持粘贴百度百科词条链接。</div>
      </div>
      <div id="rematchStatus" class="rematch-count" role="status" aria-live="polite"></div><div id="rematchResults"><div class="folder-empty">输入片名后按回车搜索</div></div>
    </div>
    <div class="modal-foot"><div class="right"><button class="btn-line sm" data-act="close-modal">关闭</button></div></div>`;
}

let rematchController = null;
const REMATCH_SOURCES = { douban: '豆瓣', tmdb: 'TMDB', tvmaze: 'TVmaze', bangumi: 'Bangumi', movie1905: '1905 电影网', jikan: 'Jikan', baike: '百度百科' };
async function doRematchSearch() {
  const item = state.detail && state.detail.item;
  const box = $('#rematchResults');
  const status = $('#rematchStatus');
  if (!item || !box || !status || box.dataset.applying) return;
  const q = ($('#rematchQuery')?.value || '').trim();
  if (!q) { $('#rematchQuery')?.focus(); return; }
  rematchController?.abort();
  const controller = rematchController = new AbortController();
  const sources = /^https?:\/\//i.test(q) ? ['baike'] : Object.keys(REMATCH_SOURCES).filter(p => (p !== 'tvmaze' || item.kind !== 'movie'));
  const pending = new Set(sources);
  const failed = [];
  let count = 0;
  box.innerHTML = '';
  const updateStatus = () => {
    status.textContent = `${count ? `已找到 ${count} 条，可直接选择。` : ''}${pending.size ? `正在搜索：${[...pending].map(p => REMATCH_SOURCES[p]).join('、')}` : '搜索完成'}${failed.length ? ` · ${failed.join('、')}未能返回，可重新搜索` : ''}`;
    if (!pending.size && !count) box.innerHTML = `<div class="folder-empty">${failed.length ? '部分来源暂不可用，请重试或更换片名。' : '没有找到匹配条目，试试其他片名或去掉年份。'}</div>`;
  };
  updateStatus();
  await Promise.all(sources.map(async provider => {
    try {
      const res = await api('/api/rematch/search', {
        method: 'POST', signal: controller.signal,
        body: JSON.stringify({ itemId: item.id, query: q, type: item.kind === 'movie' ? 'movie' : 'tv', provider })
      });
      if (controller.signal.aborted || !box.isConnected) return;
      count += res.results.length;
      box.insertAdjacentHTML('beforeend', res.results.map(r => `<button type="button" class="result-item" data-act="apply-match" data-id="${esc(r.id)}" data-type="${esc(r.type)}" data-provider="${esc(r.provider)}">
        <img loading="lazy" src="${esc(r.provider === 'baike' ? proxyURL(r.poster) : r.poster || '')}" alt="" data-ph="/api/placeholder?t=${encodeURIComponent(r.title)}&s=${hashCode(r.id)}" />
        <span class="r-info"><span class="r-title">${esc(r.title)}${r.rating ? `<span class="r-score">${Number(r.rating).toFixed(1)}</span>` : ''}</span>
        <span class="r-sub"><span class="src-tag ${esc(r.provider)}">${esc(REMATCH_SOURCES[r.provider] || r.provider)}</span> ${esc(r.year || '年份未知')} · ${r.type === 'tv' ? '剧集' : '电影'}</span>
        <span class="r-desc">${esc(r.subtitle || '')}</span></span>
      </button>`).join(''));
    } catch (e) {
      if (!controller.signal.aborted) failed.push(provider === 'baike' ? `${REMATCH_SOURCES[provider]}：${e.message}` : REMATCH_SOURCES[provider]);
    } finally {
      pending.delete(provider);
      if (!controller.signal.aborted && box.isConnected) updateStatus();
    }
  }));
}

/* -------------------------------- 全局事件 -------------------------------- */
async function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'accent') { applyAccent(el.dataset.color); return; }

  if (act === 'nav') {
    const id = el.dataset.id;
    if (id === 'home') go('#/');
    else if (id === 'settings') go('#/settings');
    else if (id === 'continue' || id === 'favorites') go(`#/list/${id}`);
    else go(`#/list/${id}`);
    return;
  }
  if (act === 'open') {
    go(`#/item/${el.dataset.id}`);
    return;
  }
  if (act === 'play') {
    e.stopPropagation();
    openPlayback(el.dataset.id, Number(el.dataset.ep || 0));
    return;
  }
  /* ---- 音乐馆 ---- */
  if (act === 'music-letter') { jumpMusicLetter(el.dataset.letter); return; }
  if (act === 'mplay') {
    e.stopPropagation();
    playMusicKey(el.dataset.key);
    return;
  }
  if (act === 'mplayall') {
    const songs = musicFiltered();
    if (!songs.length) {
      toast('没有可播放的歌曲');
      return;
    }
    openAudio(songs[0].id, songs[0].ep || 0, null, { queue: songs.map(songToQueueItem), index: 0 });
    return;
  }
  if (act === 'mtab') {
    MUSIC.tab = el.dataset.mtab;
    if (MUSIC.tab !== 'song') { MUSIC.favoriteOnly = false; MUSIC.localOnly = false; MUSIC.sourcePath = ''; }
    paintMusic();
    renderSidebar();
    const main = $('#main');
    if (main) main.scrollTop = 0;
    return;
  }
  if (act === 'martist') {
    MUSIC.tab = 'song';
    MUSIC.artist = el.dataset.name;
    MUSIC.album = 'all';
    MUSIC.q = '';
    paintMusic();
    const main = $('#main');
    if (main) main.scrollTop = 0;
    return;
  }
  if (act === 'malbum') {
    MUSIC.tab = 'song';
    MUSIC.album = el.dataset.name;
    MUSIC.artist = 'all';
    MUSIC.q = '';
    paintMusic();
    const main = $('#main');
    if (main) main.scrollTop = 0;
    return;
  }
  if (act === 'mreset') {
    MUSIC.artist = 'all';
    MUSIC.album = 'all';
    MUSIC.q = '';
    paintMusic();
    return;
  }
  if (act === 'auplay') {
    const i = Number(el.dataset.i);
    if (i !== AU.index) loadAuTrack(i, { autoplay: true });
    return;
  }
  if (act === 'hero') {
    state.heroIndex = Number(el.dataset.i);
    renderChannel(state.route.type || 'all');
    return;
  }
  if (act === 'scroll') {
    const row = el.closest('.row');
    const scroller = $('.row-scroll', row);
    if (scroller) scroller.scrollBy({ left: Number(el.dataset.dir) * (scroller.clientWidth * 0.8), behavior: 'smooth' });
    return;
  }
  if (act === 'more') {
    const type = el.dataset.type;
    go(type === 'music' ? '#/list/music' : `#/list/${type}?filter=1`);
    return;
  }
  if (act === 'sort') {
    state.sort = el.dataset.sort;
    renderList(state.route.type);
    return;
  }
  if (act === 'ftype') {
    go(`#/list/${el.dataset.type}?filter=1`);
    return;
  }
  if (act === 'fyear') {
    state.filter.year = el.dataset.year;
    renderList(state.route.type);
    return;
  }
  if (act === 'close-task-progress') {
    setTaskProgressVisible(false);
    renderTaskProgress();
    return;
  }
  if (act === 'scan' || act === 'scan-source') {
    const sourceId = act === 'scan-source' ? el.dataset.sid : null;
    toast(sourceId ? '开始扫描此目录…' : '开始扫描媒体库…');
    try {
      const r = await api('/api/scan', { method: 'POST', body: JSON.stringify(sourceId ? { sourceId } : {}) });
      if (!r.ok) { toast(r.reason || '扫描失败'); return; }
      state.wasScanning = true;
      state.taskStatus = { ...(state.taskStatus || {}), scanning: true };
      syncScanButtons();
      startScanPoll();
      state.boot = await api('/api/state');
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (act === 'filter') {
    const type = ['tv', 'movie', 'anime', 'variety', 'doc', 'short', 'all'].includes(state.route.type) ? state.route.type : 'all';
    go(state.route.filtering ? `#/list/${type}` : `#/list/${type}?filter=1`);
    return;
  }
  if (act === 'theme') {
    toggleTheme();
    return;
  }
  if (act === 'history') {
    go('#/list/continue');
    return;
  }
  if (act === 'local') {
    if (window.Lingjing) {
      try {toast('请选择音乐文件夹');const imported=await window.Lingjing.importFolder();if(imported){state.boot=await api('/api/state');await loadLibrary();await fetchMusic();renderSidebar();if(state.route.name==='settings')renderSettings();else renderMusic();toast('音乐文件夹导入完成');}} catch(err){toast(err.message||String(err));}
      return;
    }
    openFolderBrowser('local');
    return;
  }
  if (act === 'add-nas') {
    openFolderBrowser('nas');
    return;
  }
  if (act === 'settings') {
    go('#/settings');
    return;
  }
  if (act === 'login') {
    state.boot.needLogin = true;
    renderLogin();
    return;
  }
  if (act === 'account') {
    go('#/settings');
    return;
  }
  if (act === 'do-search') {
    submitTopbarSearch();
    return;
  }
  if (act === 'discover') {
    await doDiscover(el);
    return;
  }
  if (act === 'pick-host') {
    const form = $('#loginForm');
    if (form) {
      form.host.value = el.dataset.ip;
      form.port.value = el.dataset.port;
      form.https.checked = el.dataset.https === 'true';
      const box = $('#discoverResult');
      if (box) box.hidden = true;
      form.password.focus();
    }
    return;
  }
  if (act === 'expand') {
    const d = $('#detailDesc');
    if (d) {
      d.classList.remove('clamp');
      el.remove();
    }
    return;
  }
  if (act === 'jump-eps') {
    const s = $('#epSection');
    if (s) s.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (act === 'season') {
    state.detailSeason = Number(el.dataset.season) || 1;
    if (state.detail) {
      $('#view').innerHTML = detailHTML(state.detail);
      const s = $('#epSection');
      if (s) s.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }
  if (act === 'fav') {
    const id = el.dataset.id;
    if (state.favorites.has(id)) {
      state.favorites.delete(id);
      toast('已取消收藏');
    } else {
      state.favorites.add(id);
      toast('已加入收藏');
    }
    localStorage.setItem('yy_fav', JSON.stringify([...state.favorites]));
      renderSidebar();
    if (state.detail && state.detail.item.id === id) {
      $('#view').innerHTML = detailHTML(state.detail);
    }
    return;
  }
  if (act === 'rematch-search') { doRematchSearch(); return; }
  if (act === 'rematch') {
    openModal(rematchHTML(state.detail.item), 'sm');
    setTimeout(doRematchSearch, 60);
    return;
  }
  if (act === 'apply-match') {
    const item = state.detail.item;
    if (el.disabled || $('#rematchResults')?.dataset.applying) return;
    const resultsBox = $('#rematchResults');
    rematchController?.abort();
    resultsBox.dataset.applying = 'true';
    resultsBox.querySelectorAll('button').forEach(button => { button.disabled = true; });
    $('#rematchStatus').textContent = `正在应用「${el.querySelector('.r-title').textContent}」的影片资料…`;
    try {
      await api('/api/rematch/apply', {
        method: 'POST',
        body: JSON.stringify({
          itemId: item.id,
          id: el.dataset.id,
          type: el.dataset.type,
          provider: el.dataset.provider || 'douban'
        })
      });
      closeModal();
      toast('已更新影片信息');
      state.lib = await api('/api/library');
      renderDetail(item.id);
    } catch (err) {
      if (resultsBox.isConnected) {
        delete resultsBox.dataset.applying;
        resultsBox.querySelectorAll('button').forEach(button => { button.disabled = false; });
        $('#rematchStatus').textContent = '应用失败，请重试或选择其他来源';
      }
      toast(err.message);
    }
    return;
  }
  if (act === 'match-all') {
    try {
      const r = await api('/api/enrich', { method: 'POST', body: JSON.stringify({ force: true }) });
      if (!r.ok) {
        toast(r.reason || '无法开始匹配');
        return;
      }
      toast(`开始重新匹配 ${r.count} 部，完成后会自动刷新`);
      state.wasEnriching = true;
      startScanPoll();
    } catch (e) {
      toast(e.message);
    }
    return;
  }
  if (act === 'close-modal') {
    closeModal();
    return;
  }
  if (act === 'browse-go') {
    loadBrowse(el.dataset.path || '');
    return;
  }
  if (act === 'pick-folder') {
    const b = state.browse;
    if (!b) return;
    const typeSel = $('#browseType');
    const pathname = b.path;
    if (!pathname) {
      toast('请先进入一个目录');
      return;
    }
    try {
      await api('/api/sources', {
        method: 'POST',
        body: JSON.stringify({
          path: pathname,
          name: pathname.split('/').filter(Boolean).pop() || pathname,
          type: typeSel ? typeSel.value : 'auto',
          provider: b.provider
        })
      });
      closeModal();
      toast('已添加，开始扫描…');
      state.boot = await api('/api/state');
      renderSidebar();
      renderTopbar();
      startScanPoll();
      if (state.route.name === 'settings') renderSettings();
      else if (state.route.name === 'login') go('#/');
      else await loadLibrary();
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (act === 'del-source') {
    if (!(window.Lingjing ? await window.Lingjing.confirm('确定要从媒体库中移除此目录吗？') : confirm('确定要从媒体库中移除此目录吗？'))) return;
    try {
      await api(`/api/sources?id=${el.dataset.sid}`, { method: 'DELETE' });
      state.boot = await api('/api/state');
      await loadLibrary();
      renderSettings();
      renderSidebar();
      toast('已移除');
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (act === 'logout') {
    if (!(window.Lingjing ? await window.Lingjing.confirm('确定退出登录？') : confirm('确定退出登录？'))) return;
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    state.boot = await api('/api/state');
    state.lib = null;
    renderTopbar();
    renderSidebar();
    renderLogin();
    return;
  }
  if (act === 'relogin') {
    state.boot.needLogin = true;
    renderLogin();
    return;
  }

}

async function onChange(e) {
  const progressSwitch = e.target.closest('[data-act="task-progress-visibility"]');
  if (progressSwitch) { setTaskProgressVisible(progressSwitch.checked); renderTaskProgress(); return; }
  const mf = e.target.closest('[data-act="mfilter"]');
  if (mf) {
    const role = mf.dataset.role;
    if (role === 'artist') MUSIC.artist = mf.value;
    else if (role === 'album') MUSIC.album = mf.value;
    else if (role === 'sort') MUSIC.sort = mf.value;
    else if (role === 'direction') MUSIC.direction = mf.value;
    paintMusicBody();
    const reset = $('.mp-reset');
    const dirty = MUSIC.artist !== 'all' || MUSIC.album !== 'all' || MUSIC.q.trim();
    if (dirty && !reset) {
      const row = $('.mp-filters');
      if (row) row.insertAdjacentHTML('beforeend', '<button class="mp-reset" data-act="mreset">清空筛选</button>');
    }
    if (!dirty && reset) reset.remove();
    return;
  }
  const el = e.target.closest('[data-act="src-type"]');
  if (el) {
    try {
      await api('/api/sources', {
        method: 'PUT',
        body: JSON.stringify({ id: el.dataset.sid, type: el.value })
      });
      toast('已更新分类方式，重新扫描后生效');
    } catch (err) {
      toast(err.message);
    }
  }
}

/* ------------------------------ 媒体库任务进度 ------------------------------ */
function setTaskProgressVisible(visible) {
  state.taskProgressDismissed = !visible;
  try { localStorage.setItem('yy_hide_task_progress', visible ? '0' : '1'); } catch (e) {}
  const toggle = document.querySelector('[data-act="task-progress-visibility"]');
  if (toggle) toggle.checked = visible;
}

function syncScanButtons(status = state.taskStatus || state.boot || {}) {
  const busy = !!(status.scanning || status.enriching);
  document.querySelectorAll('[data-act="scan"], [data-act="scan-source"], [data-act="match-all"]').forEach(btn => {
    btn.disabled = busy;
    const scanningButton = btn.dataset.act !== 'match-all';
    btn.classList.toggle('is-scanning', scanningButton && busy);
    if (scanningButton) btn.setAttribute('aria-busy', String(busy));
  });
}

function renderTaskProgress(status = state.taskStatus || state.boot || {}) {
  syncScanButtons(status);
  const box = $('#libraryTaskProgress');
  if (!box) return;
  const busy = status.scanning || status.enriching;
  const entries = [
    [status.scanProgress && status.scanProgress.sourceName ? `扫描目录：${status.scanProgress.sourceName}` : '扫描媒体库', status.scanProgress, status.msg || status.scanMsg],
    ['匹配影片信息', status.enrichProgress, status.enrichMsg]
  ].filter(([, p]) => p);
  box.hidden = !entries.length || state.taskProgressDismissed;
  if (!box.hidden) {
    box.innerHTML = `<div class="library-task-head"><b>${busy ? '正在更新媒体库' : entries.some(([,p]) => p.error) ? '处理未完成' : '媒体库已更新'}</b>${'<button class="icon-btn" data-act="close-task-progress" title="关闭提示，后台继续更新" aria-label="关闭进度提示">' + icon('close', 16) + '</button>'}</div>` + entries.map(([label, p, msg]) => {
      const percent = Math.max(0, Math.min(100, Number(p.percent) || 0));
      return `<div class="library-task-row"><div class="library-task-label"><span>${esc(label)}${p.estimated ? '（估算）' : ''}</span><strong>${percent}%</strong></div><progress max="100" value="${percent}" aria-label="${esc(label)}${p.estimated ? '，估算进度' : ''}">${percent}%</progress><div class="library-task-detail" role="status">${esc(p.error ? msg : p.stage)}${!p.error && p.total ? ` · ${p.completed}/${p.total}${p.estimated ? ' 个已发现目录' : ''}` : ''}</div></div>`;
    }).join('');
  }
}

/* -------------------------------- 扫描轮询 -------------------------------- */
function startScanPoll() {
  clearInterval(state.pollTimer);
  let polling = false;
  const poll = async () => {
    if (polling) return;
    polling = true;
    try {
      const st = await api('/api/scan/status');
      state.taskStatus = st;
      renderTaskProgress(st);
      if (state.boot) {
        state.boot.scanning = st.scanning;
        state.boot.scanMsg = st.msg;
        state.boot.enriching = st.enriching;
        state.boot.enrichMsg = st.enrichMsg;
      }
      if (!st.scanning) {
        if (state.wasScanning) {
          state.wasScanning = false;
          state.boot = await api('/api/state');
          await loadLibrary();
          renderSidebar();
          if (state.route.name === 'home') renderMusic();
          if (state.route.name === 'list') renderList(state.route.type);
          if (state.route.name === 'settings') renderSettings();
          toast(st.msg || '媒体库已更新');
        }
        if (!st.enriching) {
          if (state.wasEnriching) {
            state.wasEnriching = false;
            state.boot = await api('/api/state');
            await loadLibrary();
            if (state.route.name === 'settings') renderSettings();
            if (state.route.name === 'home') renderMusic();
            if (state.route.name === 'list') renderList(state.route.type);
            toast(st.enrichMsg || '全部匹配完成');
          }
          clearInterval(state.pollTimer);
        } else {
          state.wasEnriching = true;
          if (state.route.name === 'home' && !state.wasScanning) {
            // 元数据仍在补充，静默刷新卡片
            state.lib = await api('/api/library');
            if (state.route.name === 'home') renderMusic();
          }
        }
      } else {
        state.wasScanning = true;
        if (state.route.name === 'home' && state.lib && !state.lib.total) renderMusic();
      }
    } catch (err) {
      /* 网络恢复后继续查询任务进度 */
    } finally {
      polling = false;
    }
  };
  state.pollTimer = setInterval(poll, 1200);
  poll();
}

async function loadLibrary() {
  try {
    const data = await api('/api/library');
    state.lib = data;
  } catch (e) {
    state.lib = { rows: [], featured: [], total: 0 };
  }
  return state.lib;
}

/* -------------------------------- 启动 -------------------------------- */
let autoLoginTries = 0;
async function waitAutoLogin() {
  if (autoLoginTries >= 12) return;
  autoLoginTries += 1;
  await new Promise((r) => setTimeout(r, 1200));
  if (!state.boot || !state.boot.needLogin) return;
  try {
    const s = await api('/api/state');
    if (s.connected) {
      state.boot = s;
      toast(`已自动登录 ${s.hostname || s.server.host}`);
      renderTopbar();
      renderSidebar();
      await loadLibrary();
      await boot();
      return;
    }
  } catch (e) {
    /* 忽略 */
  }
  return waitAutoLogin();
}

async function boot() {
  initTheme();
  renderSidebar();
  renderTopbar();
  try {
    state.boot = await api('/api/state');
  } catch (e) {
    $('#view').innerHTML = `<div class="empty"><h3>无法连接本地服务</h3><p>${esc(e.message)}</p></div>`;
    return;
  }
  renderTopbar();
  renderSidebar();

  if (state.boot.needLogin) {
    renderLogin();
    // 服务端已保存账号密码时会在启动后静默重登，这里轮询几次，连上就自动进媒体库
    const s = state.boot.server || {};
    if (s.account && s.remember) waitAutoLogin();
    return;
  }
  await loadLibrary();
  let restoredPlayPage = false;
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIO_SESSION_KEY) || 'null');
    const track = saved && saved.queue && saved.queue[saved.index];
    if (track && location.hash === `#/play/${track.id}/${track.ep || 0}` && allItems().some(item => item.id === track.id && item.type === 'music')) {
      // 先渲染底层音乐馆和导航，再恢复覆盖其上的大播放页。
      history.replaceState(null, '', '#/list/music');
      route();
      await restoreAudioSession({ playPage: true });
      restoredPlayPage = !!AU.data;
    }
  } catch (e) {}
  if (!restoredPlayPage) {
    route();
    if (!location.hash.startsWith('#/play/')) await restoreAudioSession();
  }
  if (state.boot.scanning) startScanPoll();
  if (state.boot.enriching) startScanPoll();
}

document.addEventListener('click', onClick);
document.addEventListener('change', onChange);
document.addEventListener('input', (e) => {
  if (e.target?.id === 'apqSearch') { renderAuQueue(); return; }
  if (e.target?.id === 'mbQueueSearch') { renderMiniQueue(); return; }
  if (e.target?.id === 'searchInput' && isMusicSearchContext()) { filterCurrentMusic(e.target.value); return; }

});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && e.target.id === 'searchInput') {
    submitTopbarSearch();
  }
  if (e.key === 'Enter' && e.target && e.target.id === 'rematchQuery') {
    doRematchSearch();
  }
});
window.addEventListener('hashchange', route);

bindPlayer();
bindAudio();
boot();
