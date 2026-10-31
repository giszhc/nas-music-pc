'use strict';

// 百度只作为补充来源。验证页直接报错，不执行验证脚本或缓存空壳页面。
const ORIGIN = 'https://baike.baidu.com';
function text(html) {
  return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&').replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
      const c = /^x/i.test(n) ? parseInt(n.slice(1), 16) : Number(n);
      return c <= 0x10ffff ? String.fromCodePoint(c) : '';
    }).replace(/\s+/g, ' ').trim();
}
function attr(tag, name) {
  return text((tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i')) || [])[2]);
}
function itemUrl(value, requireId = true) {
  try {
    const u = new URL(value, ORIGIN);
    if (u.origin !== ORIGIN || u.username || u.password) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'item' || parts.length < 2 || parts.length > 3) return null;
    const name = decodeURIComponent(parts[1]);
    if (!name || /[\/#?\x00-\x1f]/.test(name)) return null;
    if (parts[2] && !/^\d+$/.test(parts[2])) return null;
    if (requireId && !parts[2]) return null;
    return `${ORIGIN}/item/${encodeURIComponent(name)}${parts[2] ? '/' + parts[2] : ''}`;
  } catch { return null; }
}
function links(html) {
  const found = new Set();
  for (const m of String(html || '').matchAll(/<a\b[^>]*>/gi)) {
    const url = itemUrl(attr(m[0], 'href'));
    if (url) found.add(url);
  }
  return [...found];
}
function assertPage(html) {
  if (!html) throw new Error('百度百科暂时无法访问，请稍后重试');
  if (/__CHALLENGE_CONFIG__|ParisChallenge|<title>\s*百度安全验证|wappass\.baidu\.com|请输入验证码/i.test(html)) {
    throw new Error('百度要求安全验证，百科来源暂不可用，请选择其他来源');
  }
}
function parseBaike(html, requestedUrl) {
  assertPage(html);
  const meta = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) meta[attr(m[0], 'property') || attr(m[0], 'name')] = attr(m[0], 'content');
  let structured = {};
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const entries = Array.isArray(data) ? data : data['@graph'] || [data];
      structured = entries.find(d => d && (d.name || d.headline) && (d.description || d.image)) || structured;
    } catch { /* 非法结构化数据不影响 HTML 回退。 */ }
  }
  let url = itemUrl(requestedUrl);
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (attr(m[0], 'rel') === 'canonical') url = itemUrl(attr(m[0], 'href')) || url;
  }
  url = itemUrl(meta['og:url']) || url;
  url = itemUrl(structured.url) || url;
  const title = text((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]) || (meta['og:title'] || structured.name || structured.headline || '').replace(/_百度百科$/, '');
  if (!url && title) {
    const lemmaId = (html.match(/["']lemmaId["']\s*:\s*["']?(\d+)/) || [])[1];
    if (lemmaId) url = itemUrl(`/item/${encodeURIComponent(title)}/${lemmaId}`);
  }
  if (!title || !url) return null;
  const fields = new Map();
  for (const m of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) {
    fields.set(text(m[1]).replace(/\s/g, ''), text(m[2]).replace(/\[\d+\]/g, ''));
  }
  const field = (...names) => names.map(n => fields.get(n)).find(Boolean) || '';
  const summaryBlock = (html.match(/<(?:div|section)\b[^>]*class=["'][^"']*(?:lemma-summary|lemmaSummary|J-summary|summary_)[^"']*["'][^>]*>([\s\S]*?)(?=<(?:h2|section)\b|<div\b[^>]*class=["'][^"']*(?:basic-info|basicInfo|lemmaWgt)|$)/i) || [])[1];
  const overview = (summaryBlock ? text(summaryBlock) : structured.description || meta.description || meta['og:description'] || '').replace(/\[\d+\]/g, '').slice(0, 6000).trim();
  const subtitle = text((html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i) || [])[1]);
  const evidence = `${subtitle} ${field('作品类型', '类型')} ${overview.slice(0, 700)}`;
  // 同名小说、游戏、人物不能成为影视候选。类型必须由页面证据确认。
  const isSeries = /电视剧|电视连续剧|电视动画|电视系列|网络剧|网剧|连续剧|纪录剧|综艺节目/.test(evidence);
  if (!isSeries && !/电影|影片|动画长片|纪录片/.test(evidence)) return null;
  const imageTag = (html.match(/<img\b[^>]*(?:class=["'][^"']*(?:summary-pic|cover)[^"']*["']|src=["']https?:\/\/[^"']*baike[^"']*)[^>]*>/i) || [''])[0];
  const structuredImage = Array.isArray(structured.image) ? structured.image[0] : structured.image;
  let poster = meta['og:image'] || (typeof structuredImage === 'string' ? structuredImage : structuredImage?.url) || attr(imageTag, 'src') || attr(imageTag, 'data-src');
  try {
    const image = new URL(poster || 'about:blank', ORIGIN);
    poster = image.protocol === 'https:' && /(^|\.)baidu\.com$|(^|\.)bdimg\.com$|(^|\.)bdstatic\.com$|^bkimg\.cdn\.bcebos\.com$/i.test(image.hostname) ? image.href : '';
  } catch { poster = ''; }
  const year = Number((field('首播时间', '上映时间', '出品时间', '发行时间').match(/(?:19|20)\d{2}/) || evidence.match(/(?:19|20)\d{2}年/) || [])[0]?.slice(0, 4)) || null;
  const list = value => value.split(/[、,，/；;]/).map(s => s.trim()).filter(Boolean);
  return { provider: 'baike', id: url.slice(`${ORIGIN}/item/`.length), title, year, poster, abstract: overview,
    isSeries, rating: 0, sourceUrl: url, cast: list(field('主演', '主要配音')), director: list(field('导演')),
    countries: list(field('制片地区')), genres: list(field('作品类型', '类型')),
    episodes: Number((field('集数').match(/\d+/) || [])[0]) || 0,
    runtime: Number((field('片长', '每集长度').match(/\d+/) || [])[0]) || 0, subtitle };
}

function createBaikeProvider(fetchText = async url => {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'zh-CN,zh;q=0.9' }, signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error('百度百科请求失败，请稍后重试');
  return res.text();
}) {
  const cache = new Map();
  const pending = new Map();
  async function page(url) {
    const hit = cache.get(url);
    if (hit && hit.expires > Date.now()) return hit.html;
    if (pending.has(url)) return pending.get(url);
    const task = Promise.resolve().then(() => fetchText(url)).then(html => {
      assertPage(html);
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(url, { html, expires: Date.now() + 10 * 60 * 1000 });
      return html;
    }).finally(() => pending.delete(url));
    pending.set(url, task);
    return task;
  }
  async function baikeSearch(query, kind) {
    const isUrl = /^https?:\/\//i.test(query);
    const direct = isUrl ? itemUrl(query, false) : `${ORIGIN}/item/${encodeURIComponent(query)}`;
    if (!direct) throw new Error('请输入 baike.baidu.com/item/ 下的百科词条链接');
    const results = new Map();
    const errors = [];
    const seeds = isUrl ? [direct] : [direct, `https://www.baidu.com/s?wd=${encodeURIComponent(`site:baike.baidu.com/item/ ${query} ${kind === 'movie' ? '电影' : '电视剧'}`)}`];
    const pages = await Promise.all(seeds.map(async url => {
      try { return { url, html: await page(url) }; } catch (e) { errors.push(e); return null; }
    }));
    const targets = new Set();
    for (const p of pages.filter(Boolean)) {
      const candidate = parseBaike(p.html, p.url);
      if (candidate) results.set(candidate.id, candidate);
      for (const url of links(p.html)) if (url !== p.url) targets.add(url);
    }
    // 最多取三个百科详情，控制请求量；搜索结果的摘要不能直接作为完整影片信息。
    await Promise.all([...targets].slice(0, 3).map(async url => {
      try { const c = parseBaike(await page(url), url); if (c) results.set(c.id, c); }
      catch (e) { errors.push(e); }
    }));
    const out = [...results.values()].filter(c => c.isSeries === (kind !== 'movie'));
    if (!out.length && errors.length) throw errors[0];
    if (!out.length && !pages.some(p => p && /<h1\b|<a\b/i.test(p.html))) throw new Error('百度未返回可读取的词条，请粘贴具体百科词条链接或选择其他来源');
    return out;
  }
  async function baikeApply(id, item) {
    const url = itemUrl(`${ORIGIN}/item/${id}`);
    if (!url) throw new Error('百度百科条目 ID 无效');
    const c = parseBaike(await page(url), url);
    if (!c || c.sourceUrl.split('/').pop() !== url.split('/').pop()) throw new Error('无法读取该影视词条，请选择其他来源');
    if (!c.poster && !c.abstract) throw new Error('百科词条缺少封面和简介，未修改影片信息');
    return { provider: 'baike', sourceId: c.id, sourceUrl: c.sourceUrl, tmdbType: c.isSeries ? 'tv' : 'movie',
      title: c.title, originalTitle: '', year: c.year || item.year, overview: c.abstract, poster: c.poster,
      backdrop: '', tagline: c.subtitle, rating: 0, votes: 0, genres: c.genres, countries: c.countries,
      runtime: c.runtime, cast: c.cast, director: c.director, episodeCount: c.episodes, seasonCount: 0,
      cardSubtitle: c.subtitle, matchedAt: Date.now() };
  }
  return { baikeSearch, baikeApply };
}
module.exports = { createBaikeProvider, parseBaike, itemUrl };
