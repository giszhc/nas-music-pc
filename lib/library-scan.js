'use strict';

/** 单目录扫描替换该来源的数据，其他来源（包括音乐）保持原样。 */
function mergeScanItems(existing, scanned, sourceId) {
  return sourceId ? [...existing.filter(item => item.sourceId !== sourceId), ...scanned] : scanned;
}
function countVideoFiles(items) {
  return items.reduce((total, item) => total + (item.type === 'music' ? 0 : (item.episodes || []).length), 0);
}
module.exports = { mergeScanItems, countVideoFiles };
