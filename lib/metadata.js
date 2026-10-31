'use strict';
/**
 * 在线元数据
 * 主源：豆瓣（无需 Key，中文简介/封面/评分/演员齐全）
 *   - 搜索：subject_suggest（快）→ search.douban.com 服务端渲染页（稳，兜底）
 *   - 详情：m.douban.com rexxar API
 * 备源：TMDB（需 Key）、Bangumi、TVmaze、1905 电影网、Jikan
 * 结果与图片都落盘缓存，第二次打开秒出。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const net = require('./net');
const { movie1905Search, movie1905Apply, jikanSearch, jikanApply } = require('./metadata-extra').createExtraProviders(net.fetchAbroadJson, url => httpText(url, { headers: { 'User-Agent': UA_DESKTOP } }));
const { baikeSearch, baikeApply } = require('./metadata-baike').createBaikeProvider();

const IMG_DIR = path.join(store.DATA_DIR, 'images');
if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

const UA_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const UA_MOBILE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

let metaCache = store.read('metadata.json', {});

/** 去 HTML 标签 + 常见实体 */
function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
let saveTimer = null;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      store.write('metadata.json', metaCache);
    } catch (e) {
      /* ignore */
    }
  }, 700);
}

/* ------------------------------ 网络基础 ------------------------------ */

let cookieJar = '';
let lastRequestAt = 0;

function absorbCookies(res) {
  try {
    const list = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
    for (const raw of list) {
      const pair = String(raw).split(';')[0];
      if (!pair || !pair.includes('=')) continue;
      const name = pair.split('=')[0];
      const kept = cookieJar
        .split('; ')
        .filter((p) => p && p.split('=')[0] !== name);
      kept.push(pair);
      cookieJar = kept.join('; ');
    }
  } catch (e) {
    /* ignore */
  }
}

async function throttle(minGap = 420) {
  const now = Date.now();
  const wait = Math.max(0, minGap - (now - lastRequestAt));
  lastRequestAt = now + wait;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function httpText(url, { headers = {}, timeout = 10000 } = {}) {
  await throttle();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const finalHeaders = {
      'User-Agent': UA_MOBILE,
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      ...headers
    };
    if (cookieJar) finalHeaders.Cookie = cookieJar;
    const res = await fetch(url, { headers: finalHeaders, signal: ctrl.signal, redirect: 'follow' });
    absorbCookies(res);
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function httpJson(url, opts = {}) {
  const text = await httpText(url, opts);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

/* -------------------------------- 豆瓣 -------------------------------- */

function bigPoster(url) {
  if (!url) return '';
  const s = String(url);
  // 豆瓣默认占位图，直接当作没有封面
  if (/\/f\/frodo\/|subject\/(movie|tv|book)_large\.jpg/i.test(s)) return '';
  return s
    .replace(/\/s_ratio_poster\//, '/l_ratio_poster/')
    .replace(/\/m_ratio_poster\//, '/l_ratio_poster/')
    .replace(/\/view\/photo\/s\//, '/view/photo/l/');
}

function parseYear(text) {
  const m = /\((\d{4})\)/.exec(String(text || ''));
  return m ? Number(m[1]) : null;
}

function stripYear(text) {
  return String(text || '')
    .replace(/[\u200e\u200f]/g, '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .trim();
}

/** 从 HTML 中提取 window.__DATA__ 的 JSON 对象 */
function extractData(html) {
  const marker = html.indexOf('window.__DATA__');
  if (marker < 0) return null;
  const start = html.indexOf('{', marker);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (inStr) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch (e) {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * 搜索兜底：www.douban.com/search 服务端渲染页。
 * 豆瓣的 subject_suggest 现在经常直接返回空数组，search.douban.com 又改成了 SPA，
 * 只有这个老搜索页还稳定吐 HTML，条目 id 藏在 link2 跳转链接里。
 */
async function doubanSearchPage(query) {
  const url = `https://www.douban.com/search?cat=1002&q=${encodeURIComponent(query)}`;
  const html = await httpText(url, { headers: { 'User-Agent': UA_DESKTOP, Referer: 'https://www.douban.com/' } });
  if (!html || html.indexOf('class="result"') < 0) return [];
  const out = [];
  const blocks = html.split('<div class="result">').slice(1);
  for (const raw of blocks) {
    const block = raw.split('<div class="result">')[0].slice(0, 4000);
    const idm = block.match(/movie\.douban\.com(?:%2F|\/)subject(?:%2F|\/)(\d+)/);
    if (!idm) continue;
    const titleHtml = (block.match(/<div class="title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '';
    const title = stripTags(titleHtml).replace(/^\[[^\]]*\]\s*/, '').trim();
    if (!title) continue;
    const poster = (block.match(/<img[^>]+src="([^"]+)"/) || [])[1] || '';
    const plain = stripTags(block);
    const ratingM = plain.match(/(\d\.\d)\s*\((\d+)人评价\)/);
    const yearM = plain.match(/(?:^|[^\d])((?:19|20)\d{2})(?![\d])/);
    out.push({
      id: idm[1],
      title,
      year: yearM ? Number(yearM[1]) : null,
      poster: bigPoster(poster),
      rating: ratingM ? Number(ratingM[1]) : 0,
      abstract: '',
      isSeries: /\[电视剧\]|\[剧集\]/.test(block)
    });
  }
  return out;
}

/** 轻量联想接口（可能被限流，失败返回空） */
async function doubanSuggest(query) {
  const url = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(query)}`;
  const data = await httpJson(url, {
    headers: { 'User-Agent': UA_DESKTOP, Referer: 'https://movie.douban.com/' }
  });
  if (!Array.isArray(data) || !data.length) return [];
  return data.map((c) => ({
    id: String(c.id),
    title: c.title,
    year: Number(c.year) || null,
    poster: bigPoster(c.img),
    rating: 0,
    abstract: c.sub_title || '',
    isSeries: Number(c.episode) > 0
  }));
}

async function doubanSearch(query) {
  // 联想接口快但经常空，网页搜索慢但稳，两个都试，按 id 去重
  let quick = [];
  try {
    quick = await doubanSuggest(query);
  } catch (e) {
    quick = [];
  }
  let web = [];
  try {
    web = await doubanSearchPage(query);
  } catch (e) {
    web = [];
  }
  if (!web.length) return quick;
  if (!quick.length) return web;
  const seen = new Set(quick.map((c) => c.id));
  return quick.concat(web.filter((c) => !seen.has(c.id)));
}

async function doubanDetail(id, kind) {
  const tryKinds = kind === 'movie' ? ['movie', 'tv'] : ['tv', 'movie'];
  for (const k of tryKinds) {
    const url = `https://m.douban.com/rexxar/api/v2/${k}/${id}`;
    const data = await httpJson(url, {
      headers: { 'User-Agent': UA_MOBILE, Referer: `https://m.douban.com/${k}/${id}/` }
    });
    if (data && (data.title || data.name)) return { kind: k, data };
  }
  return null;
}

function mapDouban(kind, d, fallback) {
  const year = Number(d.year) || fallback.year;
  return {
    provider: 'douban',
    sourceId: String(d.id || ''),
    tmdbType: kind,
    title: d.title || d.name || fallback.title,
    originalTitle: d.original_title || '',
    year,
    overview: (d.intro || d.summary || '').trim(),
    tagline: d.card_subtitle || '',
    poster: bigPoster(d.cover_url || (d.pic && (d.pic.large || d.pic.normal)) || ''),
    backdrop: '',
    rating: (d.rating && d.rating.value) || 0,
    votes: (d.rating && d.rating.count) || 0,
    genres: (d.genres || []).filter(Boolean),
    countries: (d.countries || []).filter(Boolean),
    runtime: (() => {
      const dur = (d.durations && d.durations[0]) || '';
      const m = /(\d+)/.exec(dur);
      return m ? Number(m[1]) : 0;
    })(),
    cast: (d.actors || []).slice(0, 10).map((a) => a.name).filter(Boolean),
    director: (d.directors || []).slice(0, 2).map((a) => a.name).filter(Boolean),
    episodeCount: d.episodes_count || 0,
    seasonCount: d.seasons_count || 0,
    cardSubtitle: d.card_subtitle || '',
    matchedAt: Date.now()
  };
}

function normTitle(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[\s·・:：\-—_.,，。!！?？'"“”‘’()（）\[\]【】]/g, '');
}

function scoreCandidate(c, query, year, wantKind) {
  let score = 0;
  const ct = normTitle(c.title);
  const cq = normTitle(query);
  if (!ct) return -1;
  if (ct === cq) score += 100;
  else if (ct.includes(cq) || cq.includes(ct)) score += 55;
  else if (ct.slice(0, 4) === cq.slice(0, 4)) score += 22;

  if (year && c.year) {
    if (Number(c.year) === Number(year)) score += 40;
    else if (Math.abs(Number(c.year) - Number(year)) <= 1) score += 18;
    else score -= 12;
  }
  if (wantKind === 'movie' && !c.isSeries) score += 12;
  if (wantKind !== 'movie' && c.isSeries) score += 12;
  // 有封面、有评分的条目更可能是正片，优先
  if (c.poster) score += 14;
  if (c.rating) score += 8;
  return score;
}

/** 自动匹配必须有片名依据，封面、评分、年份不能让无关作品通过。 */
function isRelevant(c, item) {
  const query = normTitle(item.title);
  const names = [c.title, ...(c.aliases || [])].map(normTitle).filter(Boolean);
  if (!query || !names.some(t => t === query || (Math.min(t.length, query.length) >= 4 && (t.includes(query) || query.includes(t))))) return false;
  if (item.year && c.year && Math.abs(Number(item.year) - Number(c.year)) > 1) return false;
  return c.isSeries === (item.type !== 'movie');
}

async function matchFromSource(item, search, apply) {
  const kind = item.type === 'movie' ? 'movie' : 'tv';
  const list = await search(item.title, kind);
  const candidates = list.filter(c => isRelevant(c, item)).sort((a, b) =>
    scoreCandidate(b, item.title, item.year, kind) - scoreCandidate(a, item.title, item.year, kind));
  for (const c of candidates.slice(0, 2)) {
    try { return await apply(c.id, item); } catch (e) { /* 尝试下一候选 */ }
  }
  return null;
}

async function doubanMatch(item) {
  const queries = [];
  const t = String(item.title || '').trim();
  queries.push(t);
  const simplified = t.split(/[：:\-—(（]/)[0].trim();
  if (simplified && simplified !== t) queries.push(simplified);
  const noSeason = t.replace(/\s*(第[一二三四五六七八九十\d]+季|Season\s*\d+)$/i, '').trim();
  if (noSeason && !queries.includes(noSeason)) queries.push(noSeason);
  const cnOnly = (t.match(/[\u4e00-\u9fa5][\u4e00-\u9fa5\d：:·！!？?\s]*/) || [''])[0].trim();
  if (cnOnly && cnOnly.length >= 2 && !queries.includes(cnOnly)) queries.push(cnOnly);
  // 逐段去掉后缀再试（如「进击的巨人 最终季」→「进击的巨人」）
  const parts = t.split(/[\s·・:：\-—_]+/).filter(Boolean);
  for (let n = parts.length - 1; n >= 1 && queries.length < 6; n -= 1) {
    const q = parts.slice(0, n).join(' ').trim();
    if (q.length >= 2 && !queries.includes(q)) queries.push(q);
  }

  const wantKind = item.type === 'movie' ? 'movie' : 'tv';

  for (const q of queries) {
    const list = await doubanSearch(q);
    if (!list.length) continue;
    const scored = list
      .map((c) => ({ c, s: scoreCandidate(c, item.title, item.year, wantKind) }))
      .filter((x) => isRelevant(x.c, item))
      .sort((a, b) => b.s - a.s);
    if (!scored.length) continue;

    for (const pick of scored.slice(0, 3)) {
      const detail = await doubanDetail(pick.c.id, wantKind);
      if (!detail) continue;
      const mapped = mapDouban(detail.kind, detail.data, item);
      // 既无封面又无评分，多半是空条目，换下一个候选
      if (!mapped.poster && !mapped.rating) continue;
      return mapped;
    }
  }
  return null;
}

/* --------------------------------- TMDB ---------------------------------- */

const TMDB = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

async function tmdbGet(pathname, params = {}) {
  const key = store.config().tmdbKey;
  if (!key) return null;
  const qs = Object.entries({ ...params, api_key: key, language: 'zh-CN' })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  // TMDB 在墙外，走系统代理（Clash 等）；没代理时 fetchAbroad 会自动退回直连
  return net.fetchAbroadJson(`${TMDB}${pathname}?${qs}`, {
    headers: { 'User-Agent': UA_DESKTOP, Accept: 'application/json' },
    timeout: 15000
  });
}

async function tmdbMatch(item) {
  if (!store.config().tmdbKey) return null;
  const kind = item.type === 'movie' ? 'movie' : 'tv';
  let data = await tmdbGet(kind === 'movie' ? '/search/movie' : '/search/tv', {
    query: item.title,
    include_adult: 'false',
    ...(item.year ? { [kind === 'movie' ? 'year' : 'first_air_date_year']: item.year } : {})
  });
  if (!data || !(data.results || []).length) {
    data = await tmdbGet(kind === 'movie' ? '/search/movie' : '/search/tv', { query: item.title });
  }
  const best = data && (data.results || []).filter(c => isRelevant({ title: c.title || c.name, year: Number(String(c.release_date || c.first_air_date || '').slice(0, 4)) || null, isSeries: kind === 'tv' }, item)).sort((a, b) => scoreCandidate({title: b.title || b.name}, item.title) - scoreCandidate({title: a.title || a.name}, item.title))[0];
  if (!best) return null;
  const d = await tmdbGet(`/${kind}/${best.id}`, { append_to_response: 'credits' });
  if (!d) return null;
  return {
    provider: 'tmdb',
    sourceId: String(d.id),
    tmdbType: kind,
    title: d.title || d.name || item.title,
    originalTitle: d.original_title || d.original_name || '',
    year: Number(String(d.release_date || d.first_air_date || '').slice(0, 4)) || item.year,
    overview: d.overview || '',
    tagline: d.tagline || '',
    poster: d.poster_path ? `${TMDB_IMG}/w500${d.poster_path}` : '',
    backdrop: d.backdrop_path ? `${TMDB_IMG}/w1280${d.backdrop_path}` : '',
    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : 0,
    votes: d.vote_count || 0,
    genres: (d.genres || []).map((g) => g.name),
    countries: (d.production_countries || []).map((c) => c.name),
    runtime: d.runtime || 0,
    cast: ((d.credits && d.credits.cast) || []).slice(0, 10).map((c) => c.name),
    director: ((d.credits && d.credits.crew) || []).filter((c) => c.job === 'Director').slice(0, 2).map((c) => c.name),
    episodeCount: d.number_of_episodes || 0,
    seasonCount: d.number_of_seasons || 0,
    cardSubtitle: '',
    matchedAt: Date.now()
  };
}

/* --------------------------------- 对外 ---------------------------------- */

/** 用 Bangumi 匹配（动漫优先用它，中文名/简介更准） */
async function bangumiMatch(item) {
  let list = [];
  try {
    list = await bangumiSearch(item.title);
  } catch (e) {
    return null;
  }
  if (!list.length) return null;
  const scored = list
    .map((c) => ({ c, s: scoreCandidate({ ...c, isSeries: true }, item.title, item.year, 'tv') }))
    .filter((x) => isRelevant(x.c, item))
    .sort((a, b) => b.s - a.s);
  for (const pick of scored.slice(0, 2)) {
    try {
      return await bangumiApply(pick.c.id, item);
    } catch (e) {
      /* 换下一个候选 */
    }
  }
  return null;
}

async function matchItem(item, { force = false } = {}) {
  const cached = metaCache[item.id];
  if (cached && !force && cached.query === item.title && cached.year === item.year) {
    if (cached.data) return cached.data;
    if (cached.v === 2 && Date.now() - (cached.at || 0) < 8 * 60 * 1000) return null;
  }
  const wantAnime = item.type === 'anime';
  let data = null;
  if (wantAnime) {
    try {
      data = await bangumiMatch(item);
    } catch (e) {
      data = null;
    }
  }
  if (!data) {
    try {
      data = await doubanMatch(item);
    } catch (e) {
      data = null;
    }
  }
  if (!data) {
    try {
      data = await tmdbMatch(item);
    } catch (e) {
      data = null;
    }
  }
  if (!data && item.type !== 'movie') {
    try { data = await matchFromSource(item, tvmazeSearch, tvmazeApply); } catch (e) { /* 继续回退 */ }
  }
  if (!data && item.type === 'movie') {
    try { data = await matchFromSource(item, movie1905Search, movie1905Apply); } catch (e) { /* 继续回退 */ }
  }
  if (!data && wantAnime) {
    try { data = await matchFromSource(item, jikanSearch, jikanApply); } catch (e) { /* 保留已有结果 */ }
  }
  // 重新匹配失败时保留原来那份，别把已有封面/简介清空
  if (!data && cached && cached.data) data = cached.data;
  metaCache[item.id] = { query: item.title, year: item.year, data, at: Date.now(), v: 2 };
  persist();
  return data;
}

/* ------------------------------ 其他来源 ------------------------------ */

async function tmdbSearch(query, kind) {
  if (!store.config().tmdbKey) return [];
  const want = kind === 'movie' ? 'movie' : 'tv';
  const data = await tmdbGet(`/search/${want}`, { query, include_adult: 'false' });
  return ((data && data.results) || []).slice(0, 10).map((r) => ({
    provider: 'tmdb',
    id: String(r.id),
    title: r.title || r.name || '',
    year: Number(String(r.release_date || r.first_air_date || '').slice(0, 4)) || null,
    poster: r.poster_path ? `${TMDB_IMG}/w342${r.poster_path}` : '',
    rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : 0,
    abstract: String(r.overview || '').slice(0, 90),
    isSeries: want === 'tv'
  })).filter((x) => x.title);
}

async function tmdbApply(id, kind, item) {
  const want = kind === 'movie' ? 'movie' : 'tv';
  const d = await tmdbGet(`/${want}/${id}`, { append_to_response: 'credits' });
  if (!d) throw new Error('TMDB 条目获取失败');
  return {
    provider: 'tmdb',
    sourceId: String(d.id),
    tmdbType: want,
    title: d.title || d.name || item.title,
    originalTitle: d.original_title || d.original_name || '',
    year: Number(String(d.release_date || d.first_air_date || '').slice(0, 4)) || item.year,
    overview: d.overview || '',
    tagline: d.tagline || '',
    poster: d.poster_path ? `${TMDB_IMG}/w500${d.poster_path}` : '',
    backdrop: d.backdrop_path ? `${TMDB_IMG}/w1280${d.backdrop_path}` : '',
    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : 0,
    votes: d.vote_count || 0,
    genres: (d.genres || []).map((g) => g.name),
    countries: (d.production_countries || []).map((c) => c.name),
    runtime: d.runtime || 0,
    cast: ((d.credits && d.credits.cast) || []).slice(0, 10).map((c) => c.name),
    director: ((d.credits && d.credits.crew) || []).filter((c) => c.job === 'Director').slice(0, 2).map((c) => c.name),
    episodeCount: d.number_of_episodes || 0,
    seasonCount: d.number_of_seasons || 0,
    cardSubtitle: '',
    matchedAt: Date.now()
  };
}

/** TVmaze：免费无 Key，英文剧集/资料齐全，中文剧覆盖一般 */
async function tvmazeSearch(query) {
  const data = await net.fetchAbroadJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/json' },
    timeout: 12000
  });
  if (!Array.isArray(data)) return [];
  return data.slice(0, 10).map((r) => r && r.show).filter(Boolean).map((s) => ({
    provider: 'tvmaze',
    id: String(s.id),
    title: s.name || '',
    year: Number(String(s.premiered || '').slice(0, 4)) || null,
    poster: (s.image && (s.image.medium || s.image.original)) || '',
    rating: (s.rating && s.rating.average) || 0,
    abstract: stripTags(s.summary || '').slice(0, 90),
    isSeries: true
  })).filter((x) => x.title);
}

async function tvmazeApply(id, item) {
  const d = await net.fetchAbroadJson(`https://api.tvmaze.com/shows/${id}?embed=cast`, {
    headers: { Accept: 'application/json' },
    timeout: 15000
  });
  if (!d) throw new Error('TVmaze 条目获取失败');
  return {
    provider: 'tvmaze',
    sourceId: String(d.id),
    tmdbType: 'tv',
    title: d.name || item.title,
    originalTitle: '',
    year: Number(String(d.premiered || '').slice(0, 4)) || item.year,
    overview: stripTags(d.summary || ''),
    tagline: (d.genres || []).join(' / '),
    poster: (d.image && (d.image.original || d.image.medium)) || '',
    backdrop: '',
    rating: (d.rating && d.rating.average) || 0,
    votes: 0,
    genres: d.genres || [],
    countries: d.network && d.network.country ? [d.network.country.name] : [],
    runtime: d.averageRuntime || d.runtime || 0,
    cast: ((d._embedded && d._embedded.cast) || []).slice(0, 10).map((c) => c.person && c.person.name).filter(Boolean),
    director: [],
    episodeCount: 0,
    seasonCount: 0,
    cardSubtitle: d.network ? d.network.name : '',
    matchedAt: Date.now()
  };
}

/** Bangumi 番组计划：免费无 Key，动漫/日剧覆盖最好，需要带自定义 UA */
const BGM_UA = 'YunyingNAS/1.0 (https://github.com/yunying-nas-client)';

async function bangumiSearch(query) {
  const res = await net.fetchAbroad('https://api.bgm.tv/v0/search/subjects?limit=10', {
    method: 'POST',
    headers: { 'User-Agent': BGM_UA, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword: query, filter: { type: [2, 6] } }),
    timeout: 15000
  });
  if (!res.ok) return [];
  let data = null;
  try {
    data = JSON.parse(res.text);
  } catch (e) {
    return [];
  }
  return (data.data || []).map((s) => ({
    provider: 'bangumi',
    id: String(s.id),
    title: s.name_cn || s.name || '',
    year: Number(String(s.date || '').slice(0, 4)) || null,
    poster: (s.images && (s.images.common || s.images.medium || s.images.grid)) || '',
    rating: (s.rating && s.rating.score) || 0,
    abstract: stripTags(s.summary || '').slice(0, 90),
    isSeries: true
  })).filter((x) => x.title);
}

function bgmInfoboxValue(infobox, keys) {
  const box = infobox || [];
  for (const item of box) {
    if (item && keys.some((k) => String(item.key || '').includes(k))) {
      const v = item.value;
      if (Array.isArray(v)) return v.map((x) => (x && x.v) || '').filter(Boolean).slice(0, 10);
      if (v) return [String(v)];
    }
  }
  return [];
}

async function bangumiApply(id, item) {
  const res = await net.fetchAbroad(`https://api.bgm.tv/v0/subjects/${id}`, {
    headers: { 'User-Agent': BGM_UA, Accept: 'application/json' },
    timeout: 15000
  });
  if (!res.ok) throw new Error('Bangumi 条目获取失败');
  let d = null;
  try {
    d = JSON.parse(res.text);
  } catch (e) {
    throw new Error('Bangumi 返回格式异常');
  }
  const images = d.images || {};
  return {
    provider: 'bangumi',
    sourceId: String(d.id),
    tmdbType: 'tv',
    title: d.name_cn || d.name || item.title,
    originalTitle: d.name || '',
    year: Number(String(d.date || '').slice(0, 4)) || item.year,
    overview: stripTags(d.summary || ''),
    tagline: (d.platform || ''),
    poster: images.large || images.common || images.medium || '',
    backdrop: '',
    rating: (d.rating && d.rating.score) || 0,
    votes: (d.rating && d.rating.total) || 0,
    genres: (d.tags || []).slice(0, 5).map((t) => t.name).filter(Boolean),
    countries: bgmInfoboxValue(d.infobox, ['地区', '国家']),
    runtime: 0,
    cast: bgmInfoboxValue(d.infobox, ['演员', '声优']),
    director: bgmInfoboxValue(d.infobox, ['导演', '原作']),
    episodeCount: Number(d.eps) || 0,
    seasonCount: 0,
    cardSubtitle: '',
    matchedAt: Date.now()
  };
}

function getCached(itemId) {
  const c = metaCache[itemId];
  return c ? c.data : null;
}

/* ----------------------------- 分季元数据 ----------------------------- */
/**
 * 豆瓣里每一季都是独立条目（「塔尔萨之王 第二季」），
 * 多季剧只匹配剧名的话，详情页顶部永远是第一季的封面 / 简介 / 评分。
 */
function seasonKey(item, season) {
  return `${item.id}::s${season}`;
}

const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
/** 缓存版本：换了抓取方式后，把旧的空结果作废 */
const SEASON_CACHE_VERSION = 2;

function seasonMarkers(season) {
  const out = [`第${season}季`, `Season ${season}`];
  if (season >= 1 && season <= 10) out.push(`第${CN_NUM[season]}季`);
  return out;
}

function looksLikeSeason(title, season) {
  const t = String(title || '');
  if (!t) return false;
  if (season === 1) {
    // 第一季在豆瓣常常就叫「某某」，不强制要求带季号
    return true;
  }
  return seasonMarkers(season).some((m) => normTitle(t).includes(normTitle(m)));
}

/** 「第二季」/「Season 2」→ 2 */
function seasonNumberOf(title) {
  const t = String(title || '');
  let m = t.match(/第\s*([0-9一二三四五六七八九十]+)\s*季/);
  if (m) {
    const v = m[1];
    if (/^\d+$/.test(v)) return Number(v);
    if (v === '十') return 10;
    if (/^十[一二三四五六七八九]$/.test(v)) return 10 + CN_NUM.indexOf(v[1]);
    if (/^[一二三四五六七八九]十$/.test(v)) return CN_NUM.indexOf(v[0]) * 10;
    if (/^[一二三四五六七八九]十[一二三四五六七八九]$/.test(v)) return CN_NUM.indexOf(v[0]) * 10 + CN_NUM.indexOf(v[2]);
    return CN_NUM.indexOf(v) || null;
  }
  m = t.match(/season\s*(\d{1,2})/i);
  if (m) return Number(m[1]);
  return null;
}

function getCachedSeason(item, season) {
  const c = metaCache[seasonKey(item, season)];
  return (c && c.data) || null;
}

/** 豆瓣「本剧的其他季」列表（不含当前条目自己） */
async function doubanSeasons(sourceId) {
  const data = await httpJson(`https://m.douban.com/rexxar/api/v2/tv/${sourceId}/seasons`, {
    headers: { 'User-Agent': UA_MOBILE, Referer: `https://m.douban.com/tv/${sourceId}/` }
  });
  return Array.isArray(data) ? data : [];
}

async function matchSeason(item, season, { force = false } = {}) {
  const key = seasonKey(item, season);
  const label = season >= 1 && season <= 10 ? `第${CN_NUM[season]}季` : `第${season}季`;
  const query = `${item.title} ${label}`;
  const cached = metaCache[key];
  if (cached && !force && cached.v === SEASON_CACHE_VERSION && cached.query === query) {
    if (cached.data) return cached.data;
    if (Date.now() - (cached.at || 0) < 8 * 60 * 1000) return null;
  }

  const base = getCached(item.id);
  let data = null;

  // 路径 A（最稳）：整剧条目 → /tv/{id}/seasons 列出其他季 → 取对应季的详情
  // 不依赖搜索接口，豆瓣的 suggest 现在经常直接返回空数组
  if (base && base.provider === 'douban' && base.sourceId && base.tmdbType === 'tv') {
    const baseSeason = seasonNumberOf(base.title) || 1;
    if (baseSeason === season) {
      data = { ...base };
    } else {
      try {
        const list = await doubanSeasons(base.sourceId);
        const hit = list.find((s) => seasonNumberOf(s.title) === season);
        if (hit) {
          const detail = await doubanDetail(hit.id, 'tv');
          if (detail) {
            data = mapDouban(detail.kind, detail.data, { ...item, title: query, year: null });
          }
        }
      } catch (e) {
        data = null;
      }
    }
  }

  // 路径 B：按「剧名 第N季」搜（搜索接口可用时的兜底）
  if (!data) {
    try {
      data = await doubanMatch({ ...item, title: query, year: null });
      if (data && !looksLikeSeason(data.title, season)) data = null;
      if (data && seasonNumberOf(data.title) && seasonNumberOf(data.title) !== season) data = null;
    } catch (e) {
      data = null;
    }
  }

  if (!data && store.config().tmdbKey) {
    try {
      data = await tmdbSeason(item, season);
    } catch (e) {
      data = null;
    }
  }
  // 重抓失败保留旧的分季信息
  if (!data && cached && cached.data) data = cached.data;
  metaCache[key] = { query, year: null, data, at: Date.now(), v: SEASON_CACHE_VERSION };
  persist();
  return data;
}

/** TMDB 兜底：/tv/{id}/season/{n} */
async function tmdbSeason(item, season) {
  const base = getCached(item.id);
  if (!base || base.provider !== 'tmdb' || !base.sourceId) return null;
  const d = await tmdbGet(`/tv/${base.sourceId}/season/${season}`, { append_to_response: 'credits' });
  if (!d) return null;
  return {
    provider: 'tmdb',
    sourceId: String(d.id || ''),
    tmdbType: 'tv',
    title: `${item.title} 第${season}季`,
    originalTitle: d.name || '',
    year: Number(String(d.air_date || '').slice(0, 4)) || null,
    overview: d.overview || '',
    tagline: '',
    poster: d.poster_path ? `${TMDB_IMG}/w500${d.poster_path}` : '',
    backdrop: '',
    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : 0,
    votes: d.vote_count || 0,
    genres: [],
    countries: [],
    runtime: 0,
    cast: ((d.credits && d.credits.cast) || []).slice(0, 10).map((c) => c.name),
    director: [],
    episodeCount: (d.episodes || []).length,
    seasonCount: 0,
    cardSubtitle: '',
    matchedAt: Date.now()
  };
}

// 单季分集标题单独缓存，避免旧季详情缓存缺少 episodes。
const episodeTitleRequests = new Map();
async function getEpisodeTitles(item, { force = false } = {}) {
  if (item.type === 'movie' || item.type === 'music') return {};
  if (force && !store.config().tmdbKey) throw new Error('请先在设置中配置 TMDB API Key');
  let base = getCached(item.id);
  // 单独保留分集来源，不覆盖豆瓣等影片资料；播放器可直接复用。
  if (base?.provider !== 'tmdb') {
    const sourceKey = `episode-source:${item.id}`;
    const signature = JSON.stringify([item.title, item.year, base?.provider, base?.sourceId]);
    const linked = metaCache[sourceKey];
    if (!force && linked?.signature === signature) base = linked.data;
    else if (force) {
      base = await tmdbMatch(item);
      if (base) {
        metaCache[sourceKey] = { signature, data: { provider: base.provider, sourceId: base.sourceId } };
        persist();
      }
    }
  }
  if (!base || base.provider !== 'tmdb' || !base.sourceId || item.type === 'movie' || item.type === 'music') return {};
  const titles = {};
  const seasons = [...new Set(item.episodes.map(e => e.season ?? 1))];
  await Promise.all(seasons.map(async season => {
    const key = `tmdb-episodes:${base.sourceId}:${season}`;
    let cached = metaCache[key];
    if (force || !cached || Date.now() - cached.matchedAt > 7 * 86400000) {
      if (!episodeTitleRequests.has(key)) {
        episodeTitleRequests.set(key, (async () => {
          const data = await tmdbGet(`/tv/${base.sourceId}/season/${season}`);
          if (!Array.isArray(data?.episodes)) return null;
          const result = { matchedAt: Date.now(), titles: Object.fromEntries(data.episodes.filter(e => e.name).map(e => [e.episode_number, e.name])) };
          metaCache[key] = result;
          persist();
          return result;
        })().finally(() => episodeTitleRequests.delete(key)));
      }
      try { cached = await episodeTitleRequests.get(key); } catch (e) { return; }
    }
    for (const ep of item.episodes.filter(e => (e.season ?? 1) === season)) {
      if (cached?.titles?.[ep.episode]) titles[ep.index] = cached.titles[ep.episode];
    }
  }));
  return titles;
}

const candidateSearchCache = new Map();
function cachedCandidateSearch(provider, query, kind, load) {
  const key = JSON.stringify([provider, query, kind]);
  const cached = candidateSearchCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  let timer;
  const promise = Promise.race([
    Promise.resolve().then(load),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('该来源搜索超时，请重试')), 8000); })
  ]).finally(() => clearTimeout(timer));
  candidateSearchCache.set(key, { promise, expires: Date.now() + 5 * 60 * 1000 });
  promise.then(results => {
    if (!results.length && candidateSearchCache.get(key)?.promise === promise) candidateSearchCache.delete(key);
  }, () => {
    if (candidateSearchCache.get(key)?.promise === promise) candidateSearchCache.delete(key);
  });
  if (candidateSearchCache.size > 100) candidateSearchCache.delete(candidateSearchCache.keys().next().value);
  return promise;
}

async function searchCandidates(query, kind, provider) {
  query = String(query || '').trim().slice(0, 200);
  if (!query) return [];
  const wantTv = kind !== 'movie';
  const sources = {
    douban: () => doubanSearch(query), tmdb: () => tmdbSearch(query, kind),
    tvmaze: () => wantTv ? tvmazeSearch(query) : [], bangumi: () => bangumiSearch(query),
    movie1905: () => movie1905Search(query, kind), jikan: () => jikanSearch(query, kind),
    baike: () => baikeSearch(query, kind)
  };
  if (provider && !Object.hasOwn(sources, provider)) throw new Error('不支持的搜索来源');
  const [db, tm, tv, bg, movie1905, jikan, baike] = await Promise.all(Object.entries(sources).map(([name, load]) => {
    if (provider && provider !== name) return [];
    const task = cachedCandidateSearch(name, query, kind, load);
    return provider ? task : task.catch(() => []);
  }));
  const out = [];
  for (const c of db) {
    out.push({
      provider: 'douban',
      id: c.id,
      type: c.isSeries ? 'tv' : 'movie',
      title: c.title,
      year: c.year,
      poster: c.poster,
      subtitle: c.abstract,
      rating: c.rating,
      episodes: 0
    });
  }
  for (const c of tm) {
    out.push({
      provider: 'tmdb',
      id: c.id,
      type: c.isSeries ? 'tv' : 'movie',
      title: c.title,
      year: c.year,
      poster: c.poster,
      subtitle: c.abstract,
      rating: c.rating,
      episodes: 0
    });
  }
  for (const c of tv) {
    out.push({
      provider: 'tvmaze',
      id: c.id,
      type: 'tv',
      title: c.title,
      year: c.year,
      poster: c.poster,
      subtitle: c.abstract,
      rating: c.rating,
      episodes: 0
    });
  }
  for (const c of bg) {
    out.push({
      provider: 'bangumi',
      id: c.id,
      type: 'tv',
      title: c.title,
      year: c.year,
      poster: c.poster,
      subtitle: c.abstract,
      rating: c.rating,
      episodes: 0
    });
  }
  for (const c of [...movie1905, ...jikan, ...baike]) {
    out.push({ provider: c.provider, id: c.id, type: c.isSeries ? 'tv' : 'movie',
      title: c.title, year: c.year, poster: c.poster, subtitle: c.abstract, rating: c.rating, episodes: 0 });
  }
  // 多源结果按相关度排序，避免豆瓣的「相关推荐」把不相干的剧排到前面
  const scored = out.map((r) => ({
    r,
    s: scoreCandidate(
      { title: r.title, year: r.year, poster: r.poster, rating: r.rating, isSeries: r.type === 'tv' },
      query,
      null,
      wantTv ? 'tv' : 'movie'
    )
  }));
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.r).slice(0, 24);
}

async function applyCandidate(item, id, kind = 'tv', provider = 'douban') {
  let mapped = null;
  if (provider === 'tmdb') {
    mapped = await tmdbApply(id, kind, item);
  } else if (provider === 'tvmaze') {
    mapped = await tvmazeApply(id, item);
  } else if (provider === 'bangumi') {
    mapped = await bangumiApply(id, item);
  } else if (provider === 'movie1905') {
    mapped = await movie1905Apply(id, item);
  } else if (provider === 'jikan') {
    mapped = await jikanApply(id, item);
  } else if (provider === 'baike') {
    mapped = await baikeApply(id, item);
  } else if (provider === 'douban') {
    const detail = await doubanDetail(id, kind === 'movie' ? 'movie' : 'tv');
    if (!detail) throw new Error('无法获取该条目详情');
    mapped = mapDouban(detail.kind, detail.data, item);
  } else {
    throw new Error('不支持的匹配来源');
  }
  metaCache[item.id] = { query: item.title, year: item.year, data: mapped, at: Date.now(), manual: true };
  // 手动换条目后，之前按季抓的缓存作废，重新按新剧集取
  for (const k of Object.keys(metaCache)) {
    if (k.startsWith(`${item.id}::s`)) delete metaCache[k];
  }
  persist();
  return mapped;
}

/** 图片代理缓存（解决豆瓣防盗链） */
async function cacheImage(url) {
  if (!url) return null;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch (e) {
    return null;
  }
  const allow = /(^|\.)doubanio\.com$|(^|\.)douban\.com$|(^|\.)tmdb\.org$|(^|\.)bgm\.tv$|(^|\.)tvmaze\.com$|^cdn\.myanimelist\.net$|(^|\.)m1905\.cn$|(^|\.)music\.126\.net$|^y\.gtimg\.cn$|(^|\.)baidu\.com$|(^|\.)bdimg\.com$|(^|\.)bdstatic\.com$|^bkimg\.cdn\.bcebos\.com$/i.test(host);
  if (!allow) return null;

  const extMatch = /\.(jpg|jpeg|png|webp)$/i.exec(new URL(url).pathname);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  const name = crypto.createHash('sha1').update(url).digest('hex') + '.' + ext;
  const target = path.join(IMG_DIR, name);
  if (fs.existsSync(target) && fs.statSync(target).size > 2048) return target;

  try {
    let buf = null;
    if (/(^|\.)tmdb\.org$|(^|\.)bgm\.tv$|(^|\.)tvmaze\.com$|^cdn\.myanimelist\.net$|(^|\.)m1905\.cn$/i.test(host)) {
      // 国外图床走系统代理
      const r = await net.fetchAbroad(url, { headers: { 'User-Agent': UA_DESKTOP }, timeout: 20000 });
      if (!r.ok) return null;
      buf = r.buffer;
    } else {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA_MOBILE, Referer: /music\.126\.net$/i.test(host) ? 'https://music.163.com/' : host === 'y.gtimg.cn' ? 'https://y.qq.com/' : /(^|\.)(baidu|bdimg|bdstatic)\.com$|^bkimg\.cdn\.bcebos\.com$/i.test(host) ? 'https://baike.baidu.com/' : 'https://movie.douban.com/' },
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) return null;
      buf = Buffer.from(await res.arrayBuffer());
    }
    if (!buf || buf.length < 512) return null;
    fs.writeFileSync(target, buf);
    return target;
  } catch (e) {
    return null;
  }
}

function hasKey() {
  return !!store.config().tmdbKey;
}

function providerName() {
  return '豆瓣 + Bangumi + TVmaze + Jikan' + (store.config().tmdbKey ? ' + TMDB' : '') + ' + 1905 电影网 + 百度百科';
}

module.exports = {
  isRelevant,
  matchItem,
  matchSeason,
  getCached,
  getCachedSeason,
  getEpisodeTitles,
  seasonKey,
  searchCandidates,
  applyCandidate,
  cacheImage,
  hasKey,
  providerName,
  metaCache
};
