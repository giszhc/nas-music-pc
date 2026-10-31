'use strict';

function normalize(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function artistKey(value) {
  const key = normalize(value);
  return /^(未知(?:歌手|艺术家)?|unknown(?: artist)?|群星|various artists|n\/a|-)$/i.test(key) ? '' : key;
}

/** 同名歌曲优先使用带歌手的记录，不合并不同歌手或不同版本。 */
function deduplicateSongs(songs) {
  const groups = new Map();
  for (const song of songs) {
    const title = normalize(song.title);
    // 无歌名时无法判断是否重复。
    const key = title || Symbol();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(song);
  }
  const selected = new Set();
  for (const group of groups.values()) {
    const byArtist = new Map();
    for (const song of group) {
      const artist = artistKey(song.artist);
      if (!byArtist.has(artist)) byArtist.set(artist, song);
    }
    if (byArtist.size > 1) byArtist.delete('');
    for (const song of byArtist.values()) selected.add(song);
  }
  return songs.filter((song) => selected.has(song));
}

module.exports = { deduplicateSongs };
