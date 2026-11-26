'use strict';
document.addEventListener('click', async event => {
  const collapse = event.target.closest('[data-shell-collapse]');
  if (collapse) { const collapsed = document.documentElement.classList.toggle('sidebar-collapsed'); try { localStorage.setItem('lingjing-sidebar-collapsed', String(collapsed)); } catch (_) {} renderSidebar(); return; }
  const navigation = event.target.closest('[data-shell-history]');
  if (navigation) { if (navigation.dataset.shellHistory === 'back') history.back(); else history.forward(); return; }
  const section = event.target.closest('[data-shell-view]');
  if (!section) return;
  const view = section.dataset.shellView;
  if (state.boot) state.boot.needLogin = false;
  if (AU.open) hideAudioPage();
  MUSIC.online = view === 'online';
  if (MUSIC.online) {
    state.route = { name: 'list', type: 'music' };
    if (location.hash !== '#/list/music') history.pushState(null, '', '#/list/music');
    renderTopbar(); renderSidebar(); renderOnlineMusic(); return;
  }
  MUSIC.tab = ['song', 'artist', 'album'].includes(view) ? view : 'song';
  MUSIC.favoriteOnly = view === 'favorites';
  MUSIC.localOnly = view === 'local';
  MUSIC.sourcePath = view === 'source' ? section.dataset.path || '' : '';
  MUSIC.artist = MUSIC.album = 'all';
  MUSIC.q = '';
  if (state.route.name === 'list' && state.route.type === 'music') {
    if (!MUSIC.data) await fetchMusic();
    paintMusic();
    renderSidebar();
    syncTopbarSearch();
    scrollToCurrentMusic();
  } else { MUSIC.shellNavigation = true; go('#/list/music'); }
});

// 目录排序只调整导航顺序，不修改媒体路径。
let draggedSource = null;
document.addEventListener('dragstart', event => {
  const row = event.target.closest('.shell-source');
  if (!row) return;
  draggedSource = row;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', row.dataset.sourceId);
  row.classList.add('is-dragging');
});
document.addEventListener('dragover', event => {
  const list = event.target.closest('.shell-sources');
  if (!draggedSource || !list) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const row = event.target.closest('.shell-source');
  if (!row || row === draggedSource) return;
  const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
  list.insertBefore(draggedSource, after ? row.nextSibling : row);
});
document.addEventListener('drop', event => {
  if (!draggedSource || !event.target.closest('.shell-sources')) return;
  event.preventDefault();
  const order = [...document.querySelectorAll('.shell-source')].map(row => row.dataset.sourceId);
  try { localStorage.setItem('lingjing-source-order', JSON.stringify(order)); }
  catch (_) { toast('目录顺序保存失败'); }
});
document.addEventListener('dragend', () => {
  if (draggedSource) draggedSource.classList.remove('is-dragging');
  draggedSource = null;
  renderSidebar();
});

const onlineViewCache = new Map();
function onlineViewKey(category, query) { return category + ':' + query; }
function preserveOnlineView() {
  const root = document.querySelector('#view > [data-online-key]');
  if (!root || root.dataset.onlineReady !== 'true') return;
  onlineViewCache.set(root.dataset.onlineKey, { ...onlineViewCache.get(root.dataset.onlineKey), root, top: document.querySelector('#main').scrollTop });
}
function restoreOnlineView(key) {
  preserveOnlineView();
  const cached = onlineViewCache.get(key);
  if (!cached) return false;
  document.querySelector('#view').replaceChildren(cached.root);
  document.querySelector('#main').scrollTop = cached.top;
  if (cached.rows) {
    if (ONLINE.category === 'mv') loadMvCardCovers(cached.root, cached.rows, onlineRequest);
    else resumeOnlineArtwork(cached.root, cached.rows, onlineRequest);
  }
  const input = document.querySelector('#searchInput');
  if (input) { input.value = ONLINE.query; input.placeholder = '搜索在线歌曲、歌手、MV'; }
  return true;
}
function markOnlineReady(key, rows) {
  const root = document.querySelector('#view').firstElementChild;
  if (!root) return;
  root.dataset.onlineKey = key; root.dataset.onlineReady = 'true';
  onlineViewCache.set(key, { root, rows, top: document.querySelector('#main').scrollTop });
  while (onlineViewCache.size > 12) onlineViewCache.delete(onlineViewCache.keys().next().value);
}
document.addEventListener('click', preserveOnlineView, true);
document.querySelector('#main').addEventListener('scroll', preserveOnlineView, { passive: true });
function refreshOnlineViews() {
  onlineViewCache.clear(); onlineHomeCache.clear();
  const root = document.querySelector('#view').firstElementChild;
  if (root) root.dataset.onlineReady = 'false';
  renderOnlineMusic();
}
let onlineRequest = 0;
let onlineCoverObserver = null;
const ONLINE = { category: 'home', query: '' };
try { document.documentElement.classList.toggle('sidebar-collapsed', localStorage.getItem('lingjing-sidebar-collapsed') === 'true'); } catch (_) {}
function onlineLoadingHTML(mode) {
  const card = (wide = true) => `<div class="online-cover-card"><span class="online-art ${wide ? 'wide' : ''} skel-fill"></span><span class="skel-line"></span><span class="skel-line short"></span></div>`;
  const cards = (count, wide = true) => Array.from({ length: count }, () => card(wide)).join('');
  let content;
  if (mode === 'home') {
    content = `<div class="online-featured">${cards(5, false)}</div><div class="skel-heading skel-fill"></div><div class="online-song-grid">${Array.from({ length: 9 }, () => '<div class="online-song-tile"><span class="online-art skel-fill"></span><span><span class="skel-line"></span><span class="skel-line short"></span></span></div>').join('')}</div><div class="skel-heading skel-fill"></div><div class="online-mv-grid">${cards(4)}</div>`;
  } else if (mode === 'mv') {
    content = `<div class="online-mv-grid online-mv-library">${cards(12)}</div>`;
  } else {
    content = `<div class="mtable"><div class="mtr head"><span class="c-no">#</span><span class="c-title">歌曲</span><span class="c-artist">歌手</span><span class="c-album">专辑</span><span class="c-dur">时长</span></div>${Array.from({ length: 10 }, () => '<div class="mtr"><span class="skel-line"></span><span class="skel-line"></span><span class="skel-line"></span><span class="skel-line"></span><span class="skel-line"></span></div>').join('')}</div>`;
  }
  return `<div class="online-loading" aria-busy="true"><span class="online-loading-status" role="status">正在加载${mode === 'mv' ? 'MV' : '音乐'}…</span><div aria-hidden="true">${content}</div></div>`;
}
function rankSongVersions(rows) {
  const groups = new Map();
  const versions = rows.map(row => {
    const title = String(row.title || '').normalize('NFKC').trim();
    const credit = title.match(/[(【\[]\s*(?:原唱|原唱者)\s*[:：]\s*([^()【】\[\]]+?)[)】\]]/i);
    const suffix = /\s*(?:[(【\[]\s*(?:翻唱|翻自|原唱|cover\b|原版|original version\b)[^()【】\[\]]*[)】\]]|\s+(?:cover\s+by\b|cover\s+of\b|翻唱版).*)\s*$/i;
    const key = title.replace(suffix, '').trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, { originals: new Set(), versions: [] });
    const group = groups.get(key);
    if (credit) group.originals.add(credit[1].trim().toLowerCase());
    return { row, title, group, credit };
  });
  for (const { row, title, group, credit } of versions) {
    const artist = String(row.artist || '').trim().toLowerCase();
    let priority = 1;
    if (/(?:翻唱|翻自)|(?:[(【\[]\s*cover\b|\bcover\s+(?:by|of)\b)/i.test(title) || credit && artist !== credit[1].trim().toLowerCase()) priority = 2;
    else if (group.originals.has(artist) || /[(【\[]\s*(?:原唱(?:版)?|原版|original version)\s*[)】\]]/i.test(title)) priority = 0;
    group.versions.push({ row, priority });
  }
  for (const group of groups.values()) {
    group.versions.sort((a, b) => a.priority - b.priority);
    group.index = 0;
  }
  return versions.map(({ group }) => group.versions[group.index++].row);
}
async function renderOnlineMusic(query = ONLINE.query) {
  onlineCoverObserver?.disconnect();
  if (!query && ONLINE.category === 'cloud') ONLINE.category = 'home';
  ONLINE.query = query;
  if (!query && ONLINE.category === 'home') return renderOnlineHome();
  const key = onlineViewKey(ONLINE.category, query);
  const request = ++onlineRequest;
  if (restoreOnlineView(key)) return;
  const view = document.querySelector('#view');
  view.innerHTML = `<section class="mp"><div class="mp-head"><div class="mp-titles"><h1 class="mp-title">在线音乐</h1></div></div><div class="mp-tabs"><button class="mp-tab" data-online-category="home">推荐</button><button class="mp-tab ${ONLINE.category === 'latest' && !query ? 'on' : ''}" data-online-category="latest">${query ? '歌曲' : '最新歌曲'}</button><button class="mp-tab ${ONLINE.category === 'hot' && !query ? 'on' : ''}" data-online-category="hot">热门歌曲</button><button class="mp-tab ${ONLINE.category === 'mv' ? 'on' : ''}" data-online-category="mv">MV</button>${query ? '<span class="mp-count">搜索结果</span>' : ''}</div><div id="onlineResults">${onlineLoadingHTML(ONLINE.category === 'mv' ? 'mv' : 'songs')}</div></section>`;
  document.querySelectorAll('[data-online-category]').forEach(button => button.onclick = () => { ONLINE.category = button.dataset.onlineCategory; renderOnlineMusic(query && ['mv','latest','cloud'].includes(ONLINE.category) ? query : ''); });
  const search = document.querySelector('#searchInput');
  if (search) { search.value = query; search.placeholder = '搜索在线歌曲、歌手'; }
  try {
    const category = ONLINE.category;
    const invoke = window.__TAURI__.core.invoke;
    const current = () => request === onlineRequest && MUSIC.online && document.querySelector('#onlineResults');
    const songs = [];
    function merge(batch) {
      if (!current()) return;
      for (const row of batch.songs || []) {
        const same = songs.find(other => other.title === row.title && other.artist === row.artist && row.duration > 0 &&
          other.duration === row.duration && (!other.album || !row.album || other.album === row.album));
        if (same) {
          if (row.verifiedFile) (same.backups ||= []).push(row.verifiedFile);
        } else songs.push(row);
      }
    const rows = query.trim() && ONLINE.category !== 'mv' ? rankSongVersions(songs) : songs;
    if (query && rows.length) {
      document.querySelector('#view .mp-count').textContent = [...new Set(rows.map(row => ({'netease-song':'网易云音乐','netease-mv':'网易云音乐',shiyinren:'拾音人','90t8':'90听',gequbao:'歌曲宝'})[row.source]))].join(' · ');
    }
    if (ONLINE.category === 'mv') {
      document.querySelector('#onlineResults').innerHTML = rows.length ? `<div class="online-mv-grid online-mv-library">${rows.map((song, index) => `<button class="online-cover-card" data-online-index="${index}" title="${esc(song.title)} · ${esc(song.artist || '')}" aria-label="播放 MV：${esc(song.title)}"><span class="online-art wide" data-mv-cover="${index}">${icon('play', 30)}</span><b>${esc(song.title)}</b><span>${esc(song.artist || '未知歌手')}</span></button>`).join('')}</div>` : '<div class="empty"><h3>没有找到 MV</h3><p>试试其他歌曲或歌手名称。</p></div>';
      loadMvCardCovers(document.querySelector('#onlineResults'), rows, request);
    } else {
    document.querySelector('#onlineResults').innerHTML = rows.length ? `<div class="mtable"><div class="mtr head"><span class="c-no">#</span><span class="c-title">歌曲</span><span class="c-artist">歌手</span><span class="c-album">专辑</span><span class="c-dur">时长</span></div><div class="mtbody">${rows.map((song, index) => musicSongRow({...song, key: song.id + ':0', ep: 0}, index).replace('data-act="mplay"', `data-online-index="${index}"`)).join('')}</div></div>` : '<p>没有找到当前可完整播放的歌曲。</p>';
    }
    markOnlineReady(key, rows);
    const queue = rows.map(row => {
      const song = { id: row.id, key: row.id + ':0', title: row.title, artist: row.artist, album: row.album || '', duration: row.duration || 0, path: '', art: row.art || '', verifiedFile: row.verifiedFile, backups: row.backups, lyrics: row.lyrics, stream: row.stream || '', onlineSource: row.source, onlinePath: row.path, video: !!row.video };
      window.Lingjing.registerOnline(song);
      return { id: song.id, key: song.key, ep: 0, title: song.title, artist: song.artist, album: song.album };
    });
    document.querySelectorAll('[data-online-index]').forEach(button => button.onclick = async () => {
      const index = Number(button.dataset.onlineIndex);
      button.disabled = true;
      toast('正在获取播放地址…');
      try { if (rows[index].video) await openPlayer(queue[index].id, 0); else { await openAudio(queue[index].id, 0, null, { queue, index }); hideAudioPage(); } }
      finally { button.disabled = false; }
    });
    }
    const primary = invoke('online_catalog',{source:'catalog',category,query});
    if (!query.trim()) { merge(await primary); return; }
    const extra = async () => {
      if (category === 'mv') {
        const fromSearch = invoke('online_catalog',{source:'shiyinren',category,query});
        const fromDirectory = shiyinrenMvDirectory(invoke).then(rows => {
          const terms = query.trim().toLowerCase().split(/\s+/);
          return {songs:rows.filter(row => terms.every(term => (row.artist+' '+row.title).toLowerCase().includes(term)))};
        });
        await Promise.allSettled([fromSearch,fromDirectory].map(task => task.then(batch => {
          if (batch.songs.length) merge(batch);
        })));
        return;
      }
      const batch = await invoke('external_songs',{source:'90t8',query}).catch(() => ({songs:[]}));
      if (!current()) return;
      if (batch.songs.length) merge(batch);
      const exact = songs.some(s => [s.title,s.artist].some(value => value?.trim().toLowerCase() === query.trim().toLowerCase()));
      if (!batch.songs.length || !exact) {
        const fallback = await invoke('external_songs',{source:'gequbao',query});
        if (fallback.songs.length) merge(fallback);
      }
    };
    const results = await Promise.allSettled([primary.then(merge), extra()]);
    if (!songs.length && results[0].status === 'rejected') throw results[0].reason;
  } catch (error) {
    if (request !== onlineRequest || !MUSIC.online || !document.querySelector('#onlineResults')) return;
    document.querySelector('#onlineResults').innerHTML = `<div class="empty online-load-error" role="alert">${icon('wifi', 32)}<h3>暂时无法加载</h3><p>${esc(error.message || String(error))}</p><button class="btn-line" id="onlineRetry">重新加载</button></div>`;
    document.querySelector('#onlineRetry').onclick = () => renderOnlineMusic(query);
  }
}

let mvDirectory, mvDirectoryTime = 0;
function shiyinrenMvDirectory(invoke) {
  if (!mvDirectory || Date.now() - mvDirectoryTime > 300000) {
    mvDirectoryTime = Date.now();
    mvDirectory = invoke('online_catalog',{source:'shiyinren',category:'mv',query:''})
      .then(result => result.songs || []).catch(error => { mvDirectory = null; throw error; });
  }
  return mvDirectory;
}
const onlineArtCache = new Map();
function onlineArtwork(path) {
  if (onlineArtCache.has(path)) return onlineArtCache.get(path);
  const request = window.__TAURI__.core.invoke('online_art', { path });
  onlineArtCache.set(path, request);
  if (onlineArtCache.size > 256) onlineArtCache.delete(onlineArtCache.keys().next().value);
  const forget = () => {
    if (onlineArtCache.get(path) === request) onlineArtCache.delete(path);
  };
  request.then(art => { if (!art?.coverPath && !art?.cover) forget(); }, forget);
  return request;
}
const onlineHomeCache = new Map();
async function homeRows(category) {
  const cached = onlineHomeCache.get(category);
  if (cached) return cached.rows;
  const result = await window.__TAURI__.core.invoke('online_catalog', { source: 'catalog', category, query: '' });
  const rows = result.songs || [];
  if (rows.length) onlineHomeCache.set(category, { time: Date.now(), rows });
  return rows;
}
async function renderOnlineHome() {
  onlineCoverObserver?.disconnect();
  const request = ++onlineRequest;
  const key = onlineViewKey('home', '');
  if (restoreOnlineView(key)) return;
  const view = document.querySelector('#view');
  view.innerHTML = '<section class="mp online-home"><div class="mp-head"><div class="mp-titles"><h1 class="mp-title">在线音乐</h1></div></div><div class="mp-tabs"><button class="mp-tab on" data-home-tab="home">推荐</button><button class="mp-tab" data-home-tab="latest">最新音乐</button><button class="mp-tab" data-home-tab="hot">热门音乐</button><button class="mp-tab" data-home-tab="mv">MV</button></div><div id="onlineHomeContent">' + onlineLoadingHTML('home') + '</div></section>';
  const input = document.querySelector('#searchInput');
  if (input) { input.value = ''; input.placeholder = '搜索在线歌曲、歌手、MV'; }
  document.querySelectorAll('[data-home-tab]').forEach(button => button.onclick = () => { ONLINE.category = button.dataset.homeTab; renderOnlineMusic(''); });
  const result = await Promise.allSettled([homeRows('latest'), homeRows('mv')]);
  if (request !== onlineRequest || !MUSIC.online || !document.querySelector('#onlineHomeContent')) return;
  const songs = result[0].status === 'fulfilled' ? result[0].value : [];
  const videos = result[1].status === 'fulfilled' ? result[1].value : [];
  const rows = [...songs, ...videos];
  if (!rows.length) { document.querySelector('#onlineHomeContent').innerHTML = '<div class="empty"><h3>暂时无法加载音乐</h3><p>请检查网络后重试。</p><button class="btn-line" id="homeRetry">重试</button></div>'; document.querySelector('#homeRetry').onclick = renderOnlineHome; return; }
  const artwork = (row, wide = false) => `<span class="online-art ${wide ? 'wide' : ''}" data-online-art="${esc(row.id)}">${icon(row.video ? 'play' : 'note', 30)}</span>`;
  const card = (row, index) => `<button class="online-cover-card" data-home-play="${index}">${artwork(row, row.video)}<b>${esc(row.title)}</b><span>${esc(row.artist || '')}</span></button>`;
  document.querySelector('#onlineHomeContent').innerHTML = `<section class="online-featured" aria-label="音乐推荐">${songs.slice(0, 5).map(card).join('')}</section><section class="online-section"><div class="online-section-head"><h2>最新音乐</h2><button class="link-btn" data-home-more="latest">查看全部 ${icon('right', 14)}</button></div><div class="online-song-grid">${songs.slice(5, 17).map((row, i) => `<button class="online-song-tile" data-home-play="${i + 5}">${artwork(row)}<span><b>${esc(row.title)}</b><small>${esc(row.artist || '未知歌手')}</small></span><i>${icon('play', 16)}</i></button>`).join('')}</div></section><section class="online-section"><div class="online-section-head"><h2>MV 推荐</h2><button class="link-btn" data-home-more="mv">查看全部 ${icon('right', 14)}</button></div><div class="online-mv-grid">${videos.slice(0, 4).map((row, i) => card(row, songs.length + i)).join('')}</div></section>`;
  markOnlineReady(key, rows);
  const queue = songs.map(row => ({ id: row.id, key: row.id + ':0', ep: 0, title: row.title, artist: row.artist }));
  rows.forEach(row => window.Lingjing.registerOnline({ ...row, key: row.id + ':0', onlineSource: row.source, onlinePath: row.path, path: '', duration: row.duration || 0, album: row.album || '', art: row.art || '' }));
  document.querySelectorAll('[data-home-more]').forEach(button => button.onclick = () => { ONLINE.category = button.dataset.homeMore; renderOnlineMusic(''); });
  document.querySelectorAll('[data-home-play]').forEach(button => button.onclick = async () => {
    const index = Number(button.dataset.homePlay), row = rows[index];
    button.disabled = true;
    toast(row.video ? '正在加载 MV…' : '正在加载歌曲…');
    try { if (row.video) await openPlayer(row.id, 0); else await openAudio(row.id, 0, null, { queue, index }); }
    finally { button.disabled = false; }
  });
  // 首页先展示真实曲目，封面独立加载，失败时保留音乐占位。
  const visible = [...songs.slice(0, 17), ...videos.slice(0, 4)];
  let next = 0;
  const worker = async () => {
    while (next < visible.length && request === onlineRequest && MUSIC.online) {
      const row = visible[next++];
      try {
        const art = row.art ? {cover:row.art} : await onlineArtwork(row.path);
        const cover = art.coverPath ? window.__TAURI__.core.convertFileSrc(art.coverPath) : art.cover;
        if (!cover || request !== onlineRequest || !MUSIC.online) continue;
        document.querySelectorAll('[data-online-art]').forEach(node => {
          if (node.dataset.onlineArt !== row.id) return;
          const img = document.createElement('img');
          img.hidden = true; img.alt = row.title + '封面';
          node.append(img);
          img.onload = () => { img.hidden = false; node.classList.add('has-cover'); };
          img.referrerPolicy = 'no-referrer';
          img.src = cover;
        });
      } catch (_) {}
    }
  };
  Promise.allSettled([worker(), worker(), worker(), worker()]);
}

async function renderImmersiveRecommendations(currentId) {
  const wrap = document.querySelector('#ppReco'), row = document.querySelector('#ppRecoRow');
  wrap.hidden = false;
  wrap.inert = !document.querySelector('#player').classList.contains('recommendations-open');
  row.innerHTML = '<p>正在加载推荐 MV…</p>';
  try {
    const list = (await homeRows('mv')).filter(item => item.id !== currentId).slice(0, 10);
    if (Player.itemId !== currentId) return;
    row.innerHTML = list.length ? list.map((item, index) => `<button class="pp-reco-item" data-recommended-mv="${index}"><span class="pp-reco-art">${icon('play', 20)}</span><span><b>${esc(item.title)}</b><small>${esc(item.artist || '')}</small></span></button>`).join('') : '<p>暂无更多 MV</p>';
    list.forEach(item => window.Lingjing.registerOnline({ ...item, video: true, onlineSource: item.source, onlinePath: item.path, path: '', album: '', duration: 0 }));
    row.querySelectorAll('[data-recommended-mv]').forEach(button => button.onclick = () => openPlayer(list[Number(button.dataset.recommendedMv)].id, 0));
    let next = 0;
    const worker = async () => {
      while (next < list.length && Player.itemId === currentId) {
        const index = next++, item = list[index];
        try {
          const art = item.art ? {cover:item.art} : await onlineArtwork(item.path);
          if ((!art.coverPath && !art.cover) || Player.itemId !== currentId) continue;
          const target = row.querySelector(`[data-recommended-mv="${index}"] .pp-reco-art`);
          if (!target) continue;
          const img = document.createElement('img'); img.alt = ''; img.src = art.cover || window.__TAURI__.core.convertFileSrc(art.coverPath);
          img.onload = () => { target.replaceChildren(img); };
        } catch (_) {}
      }
    };
    Promise.allSettled([worker(), worker()]);
  } catch (_) {
    if (Player.itemId === currentId) row.innerHTML = '<p>推荐暂时无法加载，请稍后重试。</p>';
  }
}

// 单帧合并指针光照，不创建常驻动画循环。
let liquidLightFrame = 0, liquidLightPointer = null;
document.addEventListener('pointermove', event => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || event.pointerType === 'touch') return;
  const element = event.target.closest('.shell-tile,.btn-line,.mp-tab');
  if (!element) return;
  liquidLightPointer = { element, x: event.clientX, y: event.clientY };
  if (liquidLightFrame) return;
  liquidLightFrame = requestAnimationFrame(() => {
    liquidLightFrame = 0;
    const { element, x, y } = liquidLightPointer;
    if (!element.isConnected) return;
    const rect = element.getBoundingClientRect();
    element.style.setProperty('--liquid-x', `${(x - rect.left) / rect.width * 100}%`);
    element.style.setProperty('--liquid-y', `${(y - rect.top) / rect.height * 100}%`);
  });
}, { passive: true });

function loadMvCardCovers(root, rows, request) {
  const pending = [];
  let active = 0;
  const pump = () => {
    if (request !== onlineRequest || !MUSIC.online) { observer.disconnect(); return; }
    while (active < 3 && pending.length) {
      const node = pending.shift(), row = rows[Number(node.dataset.mvCover)];
      active++;
      (row.art ? Promise.resolve({ cover: row.art }) : onlineArtwork(row.path)).then(art => {
        if ((!art.coverPath && !art.cover) || request !== onlineRequest || !node.isConnected) return;
        const img = document.createElement('img'); img.alt = row.title + ' MV封面';
        img.onload = () => {
          if (!node.isConnected) return;
          node.replaceChildren(img);
          const badge = document.createElement('span'); badge.className = 'mv-card-play'; badge.innerHTML = icon('play', 22); node.append(badge);
        };
        img.src = art.cover || window.__TAURI__.core.convertFileSrc(art.coverPath);
      }).catch(() => {}).finally(() => { active--; pump(); });
    }
  };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target); pending.push(entry.target);
    }
    pump();
  }, { rootMargin: '240px' });
  onlineCoverObserver = observer;
  root.querySelectorAll('[data-mv-cover]').forEach(node => { if (!node.querySelector('img')) observer.observe(node); });
}

async function resumeOnlineArtwork(root, rows, request) {
  for (const node of root.querySelectorAll('[data-online-art]')) {
    if (request !== onlineRequest || !root.isConnected) return;
    if (node.querySelector('img')) continue;
    const row = rows.find(row => row.id === node.dataset.onlineArt);
    if (!row) continue;
    try {
      const art = row.art ? {cover:row.art} : await onlineArtwork(row.path);
      if ((!art.coverPath && !art.cover) || request !== onlineRequest || !node.isConnected) continue;
      const img = document.createElement('img'); img.alt = row.title + '封面';
      img.onload = () => { node.append(img); node.classList.add('has-cover'); };
      img.src = art.cover || window.__TAURI__.core.convertFileSrc(art.coverPath);
    } catch (_) {}
  }
}
