'use strict';
// 公开资料源：1905 电影网公开页面、Jikan v4。只查询影视，不查询音乐。
const net = require('./net');

function createExtraProviders(fetchJson = net.fetchAbroadJson, fetchText = async url => { const r = await net.fetchAbroad(url, { timeout: 12000 }); return r.ok ? r.text : null; }) {
  const pending = new Map();
  const nextAt = new Map();
  const cache = new Map();
  async function request(provider, url) {
    if (cache.has(url)) {
      const hit = cache.get(url);
      if (Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
      cache.delete(url);
    }
    if (pending.has(url)) return pending.get(url);
    const now = Date.now();
    const start = Math.max(now, nextAt.get(provider) || 0);
    nextAt.set(provider, start + 1100);
    const task = (async () => {
      if (start > now) await new Promise(resolve => setTimeout(resolve, start - now));
      const data = await fetchJson(url, { headers: { Accept: 'application/json' }, timeout: 12000 });
      if (data) {
        if (cache.size >= 400) cache.delete(cache.keys().next().value);
        cache.set(url, { at: Date.now(), data });
      }
      return data;
    })();
    pending.set(url, task);
    try { return await task; } finally { pending.delete(url); }
  }
  const yearOf = value => Number(String(value || '').slice(0, 4)) || null;
  const pageCache = new Map();
  let pageNextAt = 0;
  async function page(url) {
    const hit = pageCache.get(url);
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.value;
    const now = Date.now();
    const start = Math.max(now, pageNextAt);
    pageNextAt = start + 1000;
    if (start > now) await new Promise(resolve => setTimeout(resolve, start - now));
    const value = await fetchText(url);
    if (!value || /验证码|访问过于频繁|captcha/i.test(value) && !/title-mv|topModule_title/.test(value)) return '';
    if (pageCache.size >= 200) pageCache.delete(pageCache.keys().next().value);
    pageCache.set(url, { at: Date.now(), value });
    return value;
  }
  async function movie1905Search(query, kind) {
    if (kind !== 'movie') return [];
    const html = await page(`https://www.1905.com/search/index-p-type-film-q-${encodeURIComponent(query)}.html`);
    return parse1905Search(html);
  }
  async function movie1905Apply(id, item) {
    if (!/^\d+$/.test(String(id))) throw new Error('1905 条目 ID 无效');
    const url = `https://www.1905.com/mdb/film/${id}/`;
    const html = await page(url);
    const title = plain((html.match(/<h3>\s*<span>([\s\S]*?)<\/span>/i) || [])[1]);
    if (!title || !html.includes(`/mdb/film/${id}/`)) throw new Error('1905 影片详情获取失败');
    const field = label => {
      for (const match of html.matchAll(/<li\b[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<em[^>]*>([\s\S]*?)<\/em>/gi)) {
        if (plain(match[1]).replace(/\s/g, '') === label) return match[2];
      }
      return '';
    };
    const people = label => [...field(label).matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map(m => plain(m[1])).filter(Boolean);
    const meta = name => {
      for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
        if (attribute(m[0], 'property') === name || attribute(m[0], 'name') === name) return attribute(m[0], 'content');
      }
      return '';
    };
    return { ...emptyMeta('movie1905', id, 'movie', title),
      year: Number((plain(field('上映时间')).match(/(?:19|20)\d{2}/) || [])[0]) || item.year,
      originalTitle: plain(field('又名')), overview: meta('og:description') || meta('description'),
      poster: meta('og:image'),
      rating: Number((html.match(/class="evaluation-name"[^>]*>\s*([\d.]+)/) || [])[1]) || 0,
      cast: people('主演'), director: people('导演'),
      runtime: Number((html.match(/<li[^>]*>\s*(\d+)分钟/) || [])[1]) || 0, sourceUrl: url };
  }
  function jikanCandidate(d) {
    return { provider: 'jikan', id: String(d.mal_id), title: d.title || d.title_english || '',
      aliases: (d.titles || []).map(t => t.title).filter(Boolean),
      year: d.year || yearOf(d.aired && d.aired.from),
      poster: (d.images && d.images.jpg && (d.images.jpg.large_image_url || d.images.jpg.image_url)) || '',
      rating: d.score || 0, abstract: d.synopsis || '', isSeries: d.type !== 'Movie' };
  }
  async function jikanSearch(query, kind) {
    const params = new URLSearchParams({ q: query, limit: '12', sfw: 'true', ...(kind === 'movie' ? { type: 'movie' } : {}) });
    const result = await request('jikan', `https://api.jikan.moe/v4/anime?${params}`);
    return ((result && result.data) || []).filter(d => d.mal_id && !d.hentai && (kind === 'movie' ? d.type === 'Movie' : d.type !== 'Movie')).map(jikanCandidate);
  }
  async function jikanApply(id, item) {
    if (!/^\d+$/.test(String(id))) throw new Error('Jikan 条目 ID 无效');
    const result = await request('jikan', `https://api.jikan.moe/v4/anime/${id}`);
    const d = result && result.data;
    if (!d || String(d.mal_id) !== String(id)) throw new Error('Jikan 条目获取失败');
    const candidate = jikanCandidate(d);
    return { ...emptyMeta('jikan', id, candidate.isSeries ? 'tv' : 'movie', candidate.title || item.title),
      originalTitle: d.title_japanese || '', year: candidate.year || item.year,
      overview: d.synopsis || '', poster: candidate.poster, rating: candidate.rating,
      votes: d.scored_by || 0, genres: (d.genres || []).map(g => g.name),
      episodeCount: d.episodes || 0, sourceUrl: d.url || '' };
  }
  return { movie1905Search, movie1905Apply, jikanSearch, jikanApply };
}
function emptyMeta(provider, sourceId, tmdbType, title) {
  return { provider, sourceId: String(sourceId), tmdbType, title, originalTitle: '', year: null,
    overview: '', tagline: '', poster: '', backdrop: '', rating: 0, votes: 0, genres: [],
    countries: [], runtime: 0, cast: [], director: [], episodeCount: 0, seasonCount: 0,
    cardSubtitle: '', matchedAt: Date.now() };
}
function plain(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => { const c = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n); return c <= 0x10ffff ? String.fromCodePoint(c) : ''; })
    .replace(/\s+/g, ' ').trim();
}
function attribute(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return m ? plain(m[2]) : '';
}
function parse1905Search(html) {
  const out = new Map();
  for (const block of String(html || '').split(/<h2\b[^>]*class=["']title-mv["'][^>]*>/i).slice(1)) {
    const head = block.split('</h2>')[0];
    const id = (head.match(/1905\.com\/mdb\/film\/(\d+)\//) || [])[1];
    if (!id) continue;
    const title = plain(head.replace(/<b\b[^>]*>[\s\S]*?<\/b>/gi, '').replace(/<\/?font\b[^>]*>/gi, '')).trim();
    if (!title) continue;
    const image = (block.match(/<img\b[^>]*>/i) || [''])[0];
    out.set(id, { provider: 'movie1905', id, title,
      year: Number((plain(head).match(/\(((?:19|20)\d{2})\)/) || [])[1]) || null,
      poster: attribute(image, 'src'), rating: Number((block.match(/class="jb"[^>]*>\s*([\d.]+)/) || [])[1]) || 0,
      abstract: '', isSeries: false });
  }
  return [...out.values()].slice(0, 12);
}
module.exports = { createExtraProviders, parse1905Search };
