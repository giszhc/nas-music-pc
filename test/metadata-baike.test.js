'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBaikeProvider, parseBaike, itemUrl } = require('../lib/metadata-baike');
const url = 'https://baike.baidu.com/item/%E8%A5%BF%E6%B8%B8%E8%AE%B0/6783';
const html = `<link rel="canonical" href="${url}"><h1>西游记</h1><h2>1986年杨洁执导的电视剧</h2>
<meta property="og:image" content="https://bkimg.cdn.bcebos.com/pic/test.jpg">
<meta name="description" content="电视剧简介">
<dl><dt>首播时间</dt><dd>1986年2月1日</dd><dt>导 演</dt><dd><a>杨洁</a></dd>
<dt>主 演</dt><dd>六小龄童、迟重瑞</dd><dt>集 数</dt><dd>25集</dd><dt>制片地区</dt><dd>中国大陆</dd></dl>`;

test('百科词条提取年份、简介、演职员和集数，排除同名小说', () => {
  const c = parseBaike(html, url);
  assert.equal(c.title, '西游记');
  assert.equal(c.poster, 'https://bkimg.cdn.bcebos.com/pic/test.jpg');
  assert.equal(c.year, 1986);
  assert.equal(c.abstract, '电视剧简介');
  assert.equal(c.isSeries, true);
  assert.equal(c.episodes, 25);
  assert.deepEqual(c.director, ['杨洁']);
  assert.deepEqual(c.cast, ['六小龄童', '迟重瑞']);
  assert.equal(parseBaike(`<h1>西游记</h1><h2>明代吴承恩创作的长篇小说</h2>`, url), null);
});

test('百科结构化内容读取封面与简介，保留实体字符', () => {
  const c = parseBaike(`<h1>示例</h1><script type="application/ld+json">${JSON.stringify({
    name: '示例', description: '2024年上映的电影，讲述 A & B 的故事。', image: { url: 'https://baikebcs.bdimg.com/cover.jpg' }
  })}</script>`, 'https://baike.baidu.com/item/示例/123');
  assert.equal(c.poster, 'https://baikebcs.bdimg.com/cover.jpg');
  assert.match(c.abstract, /A & B/);
  assert.equal(c.isSeries, false);
  assert.equal(c.year, 2024);
});

test('验证页不当成空结果；失败不缓存，下次可重试', async () => {
  let count = 0;
  const p = createBaikeProvider(async () => ++count === 1 ? '<script>window.__CHALLENGE_CONFIG__ = {}</script>' : html);
  await assert.rejects(p.baikeSearch(url, 'tv'), /安全验证/);
  const results = await p.baikeSearch(url, 'tv');
  assert.equal(results.length, 1);
  assert.equal(count, 2);
  const meta = await p.baikeApply(results[0].id, {});
  assert.equal(meta.overview, '电视剧简介');
  assert.equal(meta.provider, 'baike');
  assert.equal(meta.sourceUrl, url);
  assert.equal(count, 2);
});

test('百度搜索候选与直达词条去重，忽略非百科和外站链接', async () => {
  const calls = [];
  const p = createBaikeProvider(async target => {
    calls.push(target);
    if (target.includes('www.baidu.com')) return `<a href="${url}">西游记</a><a href="${url}">重复</a><a href="http://127.0.0.1/item/x/1">无效</a>`;
    return html;
  });
  const result = await p.baikeSearch('西游记', 'tv');
  assert.equal(result.length, 1);
  assert.equal(result[0].provider, 'baike');
  assert.equal(calls.length, 3);
  assert.deepEqual(await p.baikeSearch(url, 'movie'), []);
});

test('词条地址限制与缺失内容保护', async () => {
  assert.equal(itemUrl('https://baike.baidu.com.evil.test/item/a/1'), null);
  assert.equal(itemUrl('https://baike.baidu.com/item/a/1?x=1'), 'https://baike.baidu.com/item/a/1');
  assert.equal(itemUrl('/item/a%2Fb/1'), null);
  const p = createBaikeProvider(async () => '<h1>示例</h1><h2>2024年电影</h2>');
  await assert.rejects(p.baikeSearch('http://127.0.0.1/', 'movie'), /词条链接/);
  await assert.rejects(p.baikeApply('../bad', {}), /ID 无效/);
  await assert.rejects(p.baikeApply('示例/123', {}), /缺少封面和简介/);
});
