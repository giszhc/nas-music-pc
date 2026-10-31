'use strict';

function workKey(item) {
  return item.key ? item.key.replace(/\|season:\d+$/, '')
    : `${item.type}|${item.sourceId}|${item.title}|${item.year || ''}`;
}

/** 只有第一季时省略季号；第二季及以上始终保留，避免单独收录时产生歧义。 */
function displayTitle(item, library, matchedTitle) {
  const title = matchedTitle || item.title;
  if (item.seasonNumber === null || item.seasonNumber === undefined) return title;
  const season = Number(item.seasonNumber);
  const hasOtherSeasons = library.some(other => other.id !== item.id &&
    workKey(other) === workKey(item) && Number(other.seasonNumber) !== season &&
    other.seasonNumber !== null && other.seasonNumber !== undefined);
  const baseTitle = String(title).replace(/\s*(?:第\s*[零一二三四五六七八九十百\d]+\s*季|Season\s*\d+|S\d{1,2})\s*$/i, '').trim();
  return season === 1 && !hasOtherSeasons ? baseTitle : `${baseTitle} 第${season}季`;
}

module.exports = { displayTitle };
