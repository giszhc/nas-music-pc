'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { displayTitle } = require('../lib/library-titles');
const first = { id: 's1', title: '示例剧', key: 'tv|示例剧|nas|/示例剧|season:1', seasonNumber: 1 };
const second = { ...first, id: 's2', key: first.key.replace('season:1', 'season:2'), seasonNumber: 2 };
test('单季作品不显示第一季，包括匹配源返回的季号', () => {
  assert.equal(displayTitle(first, [first]), '示例剧');
  assert.equal(displayTitle(first, [first], '示例剧 第一季'), '示例剧');
});
test('多季仍分别显示季号，避免重复添加', () => {
  assert.equal(displayTitle(first, [first, second]), '示例剧 第1季');
  assert.equal(displayTitle(second, [first, second], '示例剧 第二季'), '示例剧 第2季');
});
test('只收录第二季仍保留第二季标识', () => {
  assert.equal(displayTitle(second, [second]), '示例剧 第2季');
});
test('不同目录版本不使单季作品显示第一季，电影标题保持原样', () => {
  assert.equal(displayTitle(first, [first, { ...second, key: 'tv|示例剧|nas|/另一版本|season:2' }]), '示例剧');
  assert.equal(displayTitle({ title: '电影', seasonNumber: null }, [], '电影'), '电影');
});
