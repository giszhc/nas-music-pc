'use strict';
/**
 * 媒体库扫描引擎
 * 1) 递归遍历目录（NAS 或本地）
 * 2) 从文件名解析：片名 / 年份 / 季 / 集
 * 3) 自动判定类型（电视剧 / 电影 / 动漫 / 综艺 / 纪录片 / 短剧）
 * 4) 按「片名 + 年份」聚合为剧集条目
 */
const path = require('path');
const crypto = require('crypto');
const { scanProgress } = require('./task-progress');

// 归并规则变化时递增，使旧媒体库在更新后重新扫描。
const SCAN_VERSION = 2;

const VIDEO_EXT = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.m4v', '.ts', '.m2ts', '.wmv', '.flv',
  '.webm', '.mpg', '.mpeg', '.rmvb', '.rm', '.iso', '.vob', '.asf', '.divx', '.ogv'
]);

const AUDIO_EXT = new Set([
  '.mp3', '.m4a', '.m4b', '.aac', '.flac', '.wav', '.wave', '.ogg', '.oga', '.opus',
  '.wma', '.ape', '.alac', '.aiff', '.aif', '.aifc', '.dsf', '.dff', '.wv', '.mpc',
  '.mka', '.amr', '.ac3', '.dts', '.mid', '.tak', '.tta', '.spx'
]);

/** 专辑封面文件（有它就认为这个目录是一张专辑） */
const COVER_RE = /^(cover|folder|front|album|albumart|artwork|poster|AlbumArtSmall)(_?\d+)?\.(jpe?g|png|webp)$/i;

const SKIP_DIR = /^(@eaDir|@tmp|@Recycle|#recycle|#snapshot|\.git|\.AppleDouble|thumbnails?|\$RECYCLE\.BIN|lost\+found|node_modules|\.workbuddy-ai)$/i;

const TYPE_RULES = [
  { type: 'anime', words: ['动漫', '动画', '番剧', 'anime', 'animation', 'cartoon', '卡通', '国漫', '日漫', '儿童', '少儿'] },
  { type: 'variety', words: ['综艺', 'variety', 'reality', '脱口秀'] },
  { type: 'doc', words: ['纪录片', '记录片', 'documentary', 'docu'] },
  { type: 'short', words: ['短剧', '微短剧'] },
  { type: 'tv', words: ['电视剧', '剧集', '连续剧', '美剧', '韩剧', '日剧', '港剧', '台剧', '国产剧', 'series', 'tv shows', 'tv', 'shows'] },
  { type: 'movie', words: ['电影', '影片', 'movie', 'movies', 'film', 'films', '影院', '原盘'] }
];

const TYPE_LABEL = {
  tv: '剧集',
  movie: '电影',
  anime: '动漫',
  variety: '综艺',
  doc: '纪录片',
  short: '短剧',
  music: '音乐'
};

const RELEASE_TAGS = /\b(?:(?:2160|1080|720|480)[pi]?|4k|uhd|hdr10\+?|hdr|dolby\s?vision|dovi|dv|web[- ]?dl|webrip|web|bluray|blu-ray|bdrip|brrip|dvdrip|hdtv|remux|x264|x265|h\.?264|h\.?265|hevc|avc|10bit|8bit|aac|ac3|eac3|ddp?5\.1|dd5\.1|dts(?:-hd)?|truehd|atmos|flac|repack|proper|internal|complete|multi|subbed|dubbed|chs|cht|eng|gb|big5|nf|amzn|dsnp|hmax|atvp)\b/gi;

const CJK = /[\u4e00-\u9fa5\u3040-\u30ff]/;

/** 中文名后面常跟一串英文原名（如「三国演义 The Romance Of Three Kingdoms」），检索时只留中文部分 */
function preferCjk(s) {
  const str = String(s || '');
  if (!CJK.test(str)) return str;
  const m = /[A-Za-z]/.exec(str);
  if (!m) return str;
  const head = str.slice(0, m.index);
  if (!CJK.test(head)) return str; // 英文在前，保持原样
  const cut = head.replace(/[\s._\-–—:：,，·]+$/, '').trim();
  return cut.length >= 2 ? cut : str;
}

/** 去掉「李幼斌版」「无删减版」「导演剪辑版」这类版本后缀，方便检索 */
function stripEdition(s) {
  let out = String(s || '').trim();
  // A. 「亮剑 李幼斌无删减版」：空格分隔的版本说明整段去掉
  for (let i = 0; i < 3; i += 1) {
    const m = out.match(/^(.*\S)\s+([^\s]{1,10}版)$/);
    if (!m) break;
    const head = m[1].trim();
    if (head.replace(/\s/g, '').length < 2) break;
    out = head;
  }
  // B. 「将军黄海波版」「仙剑奇侠传胡歌版」：没有空格，去掉末尾 1~4 字 + 版
  for (let n = 4; n >= 1; n -= 1) {
    const m2 = out.match(new RegExp(`^(.*)[\\u4e00-\\u9fa5A-Za-z0-9]{${n}}版$`));
    if (m2 && m2[1].replace(/\s/g, '').length >= 2) {
      out = m2[1].trim();
      break;
    }
  }
  return out;
}

function cleanTitle(raw) {
  let s = String(raw || '');
  s = s.replace(/\.(mp4|mkv|avi|mov|m4v|ts|m2ts|wmv|flv|webm|mpg|mpeg|rmvb|rm|iso|vob)$/i, '');
  s = s.replace(/\[[^\]]*\]|【[^】]*】|\([^)]*\)|（[^）]*）/g, ' ');
  s = s.replace(/全\s*\d+\s*[集话]/g, ' '); // 「第一季全78集」这类打包标记
  s = s.replace(/[._]+/g, ' ');
  s = s.replace(RELEASE_TAGS, ' ');
  s = s.replace(/[-–—]+\s*$/g, ' ');
  s = s.replace(/^0\d{1,3}(?=[\u4e00-\u9fa5])/, ''); // 「001新猫和老鼠」的序号前缀
  s = s.replace(/\s{2,}/g, ' ').trim();
  s = preferCjk(s);
  s = stripEdition(s);
  return s;
}

// 纯集数标记，本身不构成片名（如「第10集」「EP05」「S01E02」「03」）
const EPISODE_ONLY = /^(?:第\s*[0-9一二三四五六七八九十百零]+\s*[集话話期]|[Ee][Pp]?\s*\d{1,4}|[Ss]\d{1,2}\s*[Ee]\d{1,4}|\d{1,4})$/;
// 以集数开头，后面跟的是这一集的标题（如「第9集 祈雨凤仙郡」），片名要退回目录名
const EPISODE_LEAD = /^(?:第\s*[0-9一二三四五六七八九十百零]+\s*[集话話期]|[Ee][Pp]\s*\d{1,4}|[Ss]\d{1,2}\s*[Ee]\d{1,4})/;

function parseName(rawName, parentName) {
  const raw = String(rawName || '');
  const base = raw.replace(/\.[^.]+$/, '');
  const info = { title: '', year: null, season: null, episode: null, type: null };

  // 年份
  const years = [...base.matchAll(/(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/g)].map((m) => Number(m[1]));
  if (years.length) {
    info.year = years[years.length - 1];
  }

  // 季
  let m = base.match(/[Ss](\d{1,2})[\s._-]*[Ee](\d{1,4})/);
  if (m) {
    info.season = Number(m[1]);
    info.episode = Number(m[2]);
  }
  if (info.season === null) {
    m = base.match(/第\s*([0-9一二三四五六七八九十]+)\s*季/);
    if (m) info.season = cnNumber(m[1]);
    else {
      m = base.match(/[Ss]eason\s*(\d{1,2})/i);
      if (m) info.season = Number(m[1]);
    }
  }
  if (info.episode === null) {
    m = base.match(/第\s*([0-9一二三四五六七八九十百零]+)\s*[集话話期]/);
    if (m) info.episode = cnNumber(m[1]);
  }
  // 「新猫和老鼠 第一季01」：季号后面直接粘集号，中间没分隔符
  if (info.episode === null) {
    m = base.match(/第\s*[0-9一二三四五六七八九十]+\s*季\s*[-_. ]*(\d{1,4})/);
    if (m) info.episode = Number(m[1]);
  }
  if (info.episode === null) {
    m = base.match(/(?:^|[\s._-])[Ee][Pp]?\s*(\d{1,4})(?:v\d)?(?:[\s._-]|$)/);
    if (m) info.episode = Number(m[1]);
  }
  // 「将军黄海波版EP01」「甄嬛传E001」：中文紧贴 EP 标记，没有分隔符
  if (info.episode === null) {
    m = base.match(/(?<=[\u4e00-\u9fa5])\s*[Ee][Pp]?\s*(\d{1,4})(?:v\d)?(?:[\s._-]|$)/);
    if (m) info.episode = Number(m[1]);
  }
  if (info.episode === null) {
    m = base.match(/(?:^|[\s._-])(\d{1,3})(?:v\d)?(?:[\s._-]|$)/);
    if (m) {
      const n = Number(m[1]);
      if (!(n >= 1900 && n <= 2099)) info.episode = n;
    }
  }

  // 片名：优先取年份 / 季集标记之前的内容
  let titlePart = base;
  const cutPoints = [];
  const yearIdxRaw = base.search(/(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/);
  if (yearIdxRaw >= 0) {
    // search 命中的是年份前面那个非数字字符，切点要落在数字上，否则会吃掉一个字（「第一滴血1982」→「第一滴」）
    const yearIdx = /\d/.test(base[yearIdxRaw]) ? yearIdxRaw : yearIdxRaw + 1;
    if (yearIdx > 1) cutPoints.push(yearIdx);
  }
  const seIdx = base.search(/[Ss]\d{1,2}[\s._-]*[Ee]\d{1,4}/);
  if (seIdx > 0) cutPoints.push(seIdx);
  const epIdx = base.search(/第\s*[0-9一二三四五六七八九十百零]+\s*[集话話期]/);
  if (epIdx > 0) cutPoints.push(epIdx);
  const epEnIdx = base.search(/(?:^|[\s._-])[Ee][Pp]?\s*\d{1,4}(?:v\d)?(?:[\s._-]|$)/);
  if (epEnIdx > 0) cutPoints.push(epEnIdx);
  const epCjkIdx = base.search(/(?<=[\u4e00-\u9fa5])\s*[Ee][Pp]?\s*\d{1,4}(?:v\d)?(?:[\s._-]|$)/);
  if (epCjkIdx > 0) cutPoints.push(epCjkIdx);
  if (cutPoints.length) titlePart = base.slice(0, Math.min(...cutPoints));

  let title = cleanTitle(titlePart);
  if (!title || title.replace(/[\s\d]/g, '').length < 1 || /^\d+$/.test(title)) {
    title = cleanTitle(base);
  }
  // 文件名信息量太少时，用上级文件夹名
  if (parentName && (title.replace(/[\s\d]/g, '').length < 2 || /^\d+$/.test(title))) {
    const fromParent = cleanTitle(parentName);
    if (fromParent.replace(/[\s\d]/g, '').length >= 2) title = fromParent;
  }
  info.title = title.replace(/\s{2,}/g, ' ').trim();

  // 清理标题尾部残留的季集/年份
  info.title = info.title
    .replace(/\s*(?:19|20)\d{2}\s*$/, '')
    .replace(/\s*(第\s*[0-9一二三四五六七八九十]+\s*季|[Ss]eason\s*\d+)\s*$/i, '')
    .replace(/\s*[Ss]\d{1,2}\s*$/, '')
    .replace(/\s+\d{1,3}\s*$/, '') // 「天龙八部 01」这种空格 + 纯集数
    .replace(/\s*$/, '')
    .trim();
  // 片名本身就是集数（文件叫「第10集 .mp4」）或以集数开头（「第9集 祈雨凤仙郡」）时，用上级目录名
  if (EPISODE_ONLY.test(info.title) || EPISODE_LEAD.test(info.title) || !info.title) {
    const fromParent = cleanTitle(parentName || '');
    if (fromParent && !EPISODE_ONLY.test(fromParent) && fromParent.replace(/[\s\d]/g, '').length >= 1) {
      info.title = fromParent;
    }
  }
  if (!info.title) info.title = base.trim();

  return info;
}

function cnNumber(str) {
  const map = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (/^\d+$/.test(str)) return Number(str);
  if (str === '十') return 10;
  if (/^十[一二三四五六七八九]$/.test(str)) return 10 + map[str[1]];
  if (/^[一二三四五六七八九]十$/.test(str)) return map[str[0]] * 10;
  if (/^[一二三四五六七八九]十[一二三四五六七八九]$/.test(str)) return map[str[0]] * 10 + map[str[2]];
  return map[str] || null;
}

/* ------------------------- 目录驱动的季 / 片名识别 ------------------------- */
/**
 * 群晖里剧集通常是「剧名 第二季 / 01.mkv」这种结构，季信息只在目录名里。
 * 文件名没有 SxxExx 时，必须从目录拿季号，否则两季会混成一个列表。
 */
function seasonFromName(name) {
  const s = String(name || '');
  let m = s.match(/第\s*([0-9一二三四五六七八九十]+)\s*季/);
  if (m) {
    const n = cnNumber(m[1]);
    if (n) return n;
  }
  m = s.match(/season\s*(\d{1,2})/i);
  if (m) return Number(m[1]);
  m = s.match(/(?:^|[\s._\-\[【(（])s(\d{1,2})(?=[\s._\-\]】)）]|$)/i);
  if (m) return Number(m[1]);
  return null;
}

/** 分类目录名（电视剧 / 现代剧 / 电影 …）不能当片名用 */
const CATEGORY_DIR = /^(电视剧|电视|电影|动漫|动画|番剧|综艺|纪录片|记录片|短剧|微短剧|音乐|美剧|韩剧|日剧|港剧|台剧|国产剧|欧美剧|现代剧|古装剧|悬疑剧|犯罪剧|科幻剧|喜剧|movie|movies|film|films|tv|shows?|series|media|video|videos)$/i;

function isCategoryDir(name) {
  const s = String(name || '').trim();
  if (!s) return true;
  if (CATEGORY_DIR.test(s) || /^(?:神话|战争|历史|家庭|都市|爱情|武侠|仙侠|青春|谍战)剧$/.test(s)) return true;
  if (/合集|collection/i.test(s)) return true;
  return TYPE_RULES.some((r) => r.words.some((w) => s.toLowerCase() === w));
}

/** 从「塔尔萨之王 第二季」剥出剧名；剥不出就用上一级目录 */
function seriesTitleFromDir(seasonDirName, parentDirName) {
  // 只去掉季标记，别动「TVB版」「续集」这类区分信息 —— 否则不同版本会被合成一部剧
  let t = String(seasonDirName || '')
    .replace(/第\s*[0-9一二三四五六七八九十]+\s*季/g, ' ')
    .replace(/season\s*\d{1,2}/gi, ' ')
    .replace(/(?:^|[\s._\-])s\d{1,2}(?=[\s._\-]|$)/gi, ' ')
    // 「新猫和老鼠 第一季【11-20】」这种分卷目录，括号里是集数区间，不属于剧名
    .replace(/【[^】]*】|\[[^\]]*\]|\([^)]*\)|（[^）]*）/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/[-–—]+\s*$/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (t.replace(/[\s\d]/g, '').length >= 2 && !isCategoryDir(t)) return t;
  const parent = cleanTitle(parentDirName || '');
  if (parent.replace(/[\s\d]/g, '').length >= 2 && !isCategoryDir(parent)) return parent;
  return '';
}

/** 文件所在目录 → 媒体根目录之间的目录链（由近到远） */
function ancestorDirs(filePath, rootPath) {
  const root = path.resolve(String(rootPath || '/'));
  const out = [];
  let cur = path.dirname(filePath);
  while (cur && cur !== '/') {
    const relative = path.relative(root, cur);
    if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) break;
    out.push(cur);
    if (cur === root) break;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return out;
}

/** 目录链里最近的一个「第X季」目录 → { season, title } */
function seasonFromDirs(filePath, rootPath) {
  for (const dir of ancestorDirs(filePath, rootPath)) {
    const name = path.basename(dir);
    const season = seasonFromName(name);
    if (season) {
      return { season, title: seriesTitleFromDir(name, path.basename(path.dirname(dir))) };
    }
  }
  return { season: null, title: '' };
}

/** 季、分卷、画质目录只承载文件，作品身份取最近的有效作品目录。 */
function workFromDirs(filePath, rootPath) {
  const dirs = ancestorDirs(filePath, rootPath);
  for (const dir of dirs) {
    const name = path.basename(dir);
    if (isCategoryDir(name)) continue;
    if (/^(?:4k|8k|uhd|\d{3,4}p|bluray|blu-ray|bdmv|video_ts|stream|web-dl|extras|specials|花絮|特典|正片|第?\s*[\d一二三四五六七八九十]+\s*[碟盘部]|cd\s*\d+|disc\s*\d+|[【\[]?\d+\s*[-~至]\s*\d+[】\]]?)$/i.test(name)) continue;
    const season = seasonFromName(name);
    const title = seriesTitleFromDir(name, '');
    if (!title || EPISODE_ONLY.test(title)) continue;
    // 纯季目录由父作品目录提供身份；带片名的季目录保留在同一作品下。
    const parent = path.dirname(dir);
    const parentTitle = seriesTitleFromDir(path.basename(parent), '');
    const identity = season && dirs.includes(parent) && normalizeTitle(parentTitle) === normalizeTitle(title)
      ? parent : path.join(parent, title);
    return { title: title.replace(/\s*(?:19|20)\d{2}\s*$/, '').trim(),
      year: parseName(`${name}.mkv`, '').year, identity };
  }
  return null;
}

/**
 * 音频文件名 → { track, artist, title }
 * 「01 - 歌名」「01.歌名」「华晨宇 - 寻」「赵薇-离别的车站」都要能吃下。
 * 短横线只在两侧有空格时才当「歌手 - 歌名」分隔符 ——
 * 「贝加尔湖畔-钢琴曲」这类没空格的是「歌名-版本」，硬拆会把曲名当歌手。
 */
function parseTrack(fileName) {
  const base = String(fileName || '').replace(/\.[^.]+$/, '').trim();
  let rest = base;
  let track = null;
  let m = /^(\d{1,3})\s*[-._、．)]\s*(.+)$/.exec(base) || /^(\d{1,3})\s+(.+)$/.exec(base);
  if (m) {
    const n = Number(m[1]);
    const tail = String(m[2] || '').trim();
    if (n > 0 && n < 400 && tail) {
      track = n;
      rest = tail;
    }
  }
  let artist = '';
  let title = rest || base;
  const sep = /^(.*?)\s+[-\u2013\u2014]\s+(.*)$/.exec(title);
  if (sep) {
    const a = sep[1].trim();
    const t = sep[2].trim();
    // 「Track 03 - 歌名」左边是轨道标记不是歌手
    if (a && t && !/^(track|song|title|disc|cd|曲目|音轨)\s*\d*$/i.test(a)) {
      artist = a;
      title = t;
    }
  }
  return { track, artist, title: title || base };
}

/** 目录的上一级如果是歌手名就拿来当艺术家；「音乐 / music / 歌曲」这类容器目录不算 */
const MUSIC_ROOT = /^(music|音乐|音频|歌曲|songs?|audio|mp3|无损|我的音乐|music library|music2)$/i;

function guessArtist(dir) {
  const parts = String(dir || '').split('/').filter(Boolean);
  if (parts.length < 2) return '';
  const parent = parts[parts.length - 2];
  if (!parent || MUSIC_ROOT.test(parent)) return '';
  return cleanTitle(parent) || parent;
}


function guessType(segments, parsed) {
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const seg = String(segments[i] || '').toLowerCase();
    for (const rule of TYPE_RULES) {
      if (rule.words.some((w) => seg === w || seg.includes(w))) return rule.type;
    }
  }
  if (parsed.episode !== null && parsed.episode !== undefined) return 'tv';
  return 'movie';
}

function normalizeTitle(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[\s·・:：\-—_.,，。!！?？'"“”‘’()（）\[\]【】]/g, '');
}

function idOf(key) {
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

/**
 * @param {Array} sources 媒体库根目录 [{ id, name, path, type, provider }]
 * @param {Function} listFn (source, dirPath) => Promise<[{name,path,isdir,size,mtime}]>
 * @param {Function} onProgress ({scanned, dirs, msg})
 */
async function scan(sources, listFn, onProgress = () => {}) {
  const files = [];
  const dirQueue = [];
  const maxFiles = 60000;
  const maxDepth = 6;

  for (const src of sources) {
    dirQueue.push({ source: src, dir: src.path, depth: 0 });
  }

  let scanned = 0;
  let scanPercent = 0;
  const audioFiles = [];
  const coverDirs = new Set();
  while (dirQueue.length && files.length + audioFiles.length < maxFiles) {
    const job = dirQueue.shift();
    let entries = [];
    try {
      entries = await listFn(job.source, job.dir);
    } catch (e) {
      scanned += 1;
      const progress = scanProgress(scanned, dirQueue.length, scanPercent);
      scanPercent = progress.percent;
      onProgress({ scanned, ...progress, msg: `跳过 ${job.dir}：${e.message}`, warn: true });
      continue;
    }
    scanned += 1;
    for (const entry of entries) {
      if (entry.isdir) {
        if (job.depth < maxDepth && !SKIP_DIR.test(entry.name)) {
          dirQueue.push({ source: job.source, dir: entry.path, depth: job.depth + 1 });
        }
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (AUDIO_EXT.has(ext)) {
        // 音频：只挡掉几十 KB 的残缺文件
        if (entry.size && entry.size < 64 * 1024) continue;
        audioFiles.push({ ...entry, source: job.source, ext });
        continue;
      }
      if (!VIDEO_EXT.has(ext)) {
        if (COVER_RE.test(entry.name)) coverDirs.add(job.dir);
        continue;
      }
      // 过滤样片与极小文件
      if (/\b(sample|trailer|预告)\b/i.test(entry.name)) continue;
      if (entry.size && entry.size < 3 * 1024 * 1024) continue;
      files.push({ ...entry, source: job.source, ext });
    }
    const progress = scanProgress(scanned, dirQueue.length, scanPercent);
    scanPercent = progress.percent;
    onProgress({ scanned, ...progress, msg: `已读取 ${scanned} 个目录，发现 ${files.length} 个视频` });
  }

  onProgress({
    scanned, stage: '整理媒体库', completed: 0, total: files.length + audioFiles.length, percent: 95, estimated: false,
    msg: `共发现 ${files.length} 个视频、${audioFiles.length} 个音频文件，正在整理分类…`
  });

  /**
   * 目录级识别：同一目录下有 3 个以上「既无集数、也无年份」的视频，
   * 通常是「每集用分集名命名」的剧集/纪录片（如 从秦始皇到汉武帝/帝国肇始.mkv），
   * 这时用目录名当片名，按文件名顺序编号，而不是拆成若干部电影。
   */
  const byDir = new Map();
  for (const f of files) {
    const dir = path.dirname(f.path);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(f);
  }
  const folderSeries = new Map();
  for (const [dir, list] of byDir) {
    if (list.length < 3 || isCategoryDir(path.basename(dir))) continue;
    const source = list[0].source;
    if ((source.type && source.type !== 'auto' ? source.type : guessType(dir.split('/'), {})) === 'movie') continue;
    const base = path.basename(dir);
    if (/合集|系列|collection|movies?$/i.test(base)) continue;
    const parsedList = list.map((f) => parseName(f.name, base));
    if (!parsedList.every((p) => p.episode === null && p.year === null)) continue;
    const dirParsed = parseName(base, '');
    const dirSeason = seasonFromName(base);
    const title = (dirSeason ? seriesTitleFromDir(base, path.basename(path.dirname(dir))) : '') || dirParsed.title || cleanTitle(base);
    if (!title || title.replace(/\s/g, '').length < 2) continue;
    const sorted = list
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }));
    folderSeries.set(dir, {
      title,
      season: dirParsed.season || dirSeason || 1,
      order: new Map(sorted.map((f, i) => [f.path, i + 1]))
    });
  }

  const groups = new Map();

  /**
   * 音频聚合规则：
   * - 目录里文件带「编号」或放了封面图（cover/folder/albumart…）→ 整张专辑一个条目，曲目按编号排
   * - 其它（一个大杂烩歌单目录，文件名是「歌手 - 歌名」）→ 一首歌一个条目，卡片上直接显示歌名
   * 全都塞进一个条目会让「我的音乐」只剩一张卡片，一首一张又会把专辑拆散，所以按目录特征分流。
   */
  const audioByDir = new Map();
  for (const f of audioFiles) {
    const dir = path.dirname(f.path);
    if (!audioByDir.has(dir)) audioByDir.set(dir, []);
    audioByDir.get(dir).push(f);
  }

  const sortTracks = (a, b) => {
    const ta = parseTrack(a.name);
    const tb = parseTrack(b.name);
    return (ta.track || 0) - (tb.track || 0) || a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true });
  };

  for (const [dir, list] of audioByDir) {
    const dirBase = path.basename(dir);
    const withNum = list.filter((f) => parseTrack(f.name).track !== null).length;
    const isAlbum = list.length >= 3 && (withNum >= Math.ceil(list.length * 0.6) || coverDirs.has(dir));
    const dirArtist = guessArtist(dir);

    if (isAlbum) {
      const title = cleanTitle(dirBase) || dirBase;
      const key = `music|album|${dir}`;
      const id = idOf(key);
      const sorted = list.slice().sort(sortTracks);
      groups.set(id, {
        id,
        key,
        title,
        year: null,
        type: 'music',
        album: true,
        artist: dirArtist,
        sourceId: list[0].source.id,
        sourceName: list[0].source.name,
        rootPath: list[0].source.path,
        episodes: [],
        size: 0,
        mtime: 0,
        addedAt: Date.now()
      });
      const item = groups.get(id);
      sorted.forEach((f, i) => {
        const t = parseTrack(f.name);
        item.episodes.push({
          name: f.name,
          path: f.path,
          size: f.size || 0,
          mtime: f.mtime || 0,
          season: 1,
          episode: t.track || i + 1,
          ext: f.ext,
          artist: t.artist || dirArtist,
          songTitle: t.title
        });
        item.size += f.size || 0;
        item.mtime = Math.max(item.mtime, f.mtime || 0);
      });
    } else {
      for (const f of list) {
        const t = parseTrack(f.name);
        const key = `music|track|${f.path}`;
        const id = idOf(key);
        groups.set(id, {
          id,
          key,
          title: t.title,
          year: null,
          type: 'music',
          album: false,
          artist: t.artist || dirArtist,
          sourceId: f.source.id,
          sourceName: f.source.name,
          rootPath: f.source.path,
          episodes: [
            {
              name: f.name,
              path: f.path,
              size: f.size || 0,
              mtime: f.mtime || 0,
              season: 1,
              episode: 1,
              ext: f.ext,
              artist: t.artist || dirArtist,
              songTitle: t.title
            }
          ],
          size: f.size || 0,
          mtime: f.mtime || 0,
          addedAt: Date.now()
        });
      }
    }
  }

  for (const f of files) {
    const parentName = path.basename(path.dirname(f.path));
    const segments = f.path.split('/').filter(Boolean);
    const parsed = parseName(f.name, parentName);
    const series = folderSeries.get(path.dirname(f.path));
    // 目录结构优先：群晖里「剧名 第二季/01.mkv」，文件名没季号，季只能从目录拿
    const fromDir = seasonFromDirs(f.path, f.source.path);
    const type = f.source.type && f.source.type !== 'auto'
      ? f.source.type
      : guessType(series ? segments.slice(0, -1) : segments, series ? { episode: 1 } : parsed);

    const work = workFromDirs(f.path, f.source.path);
    // 电影合集内多个独立片名仍分别识别，避免将整套电影合成一部。
    const siblings = byDir.get(path.dirname(f.path)) || [];
    const movieCollection = type === 'movie' && siblings.length > 1 &&
      new Set(siblings.map((entry) => normalizeTitle(parseName(entry.name, '').title))).size > 1;
    const directory = movieCollection ? null : work;
    const title = directory ? directory.title : fromDir.title || parsed.title || parentName;
    const year = directory ? directory.year : parsed.year || null;
    const episodeNo = parsed.episode !== null ? parsed.episode : series ? series.order.get(f.path) : null;
    const seasonNo = fromDir.season || parsed.season || 1;
    const resolvedType = type === 'movie' && (!f.source.type || f.source.type === 'auto') &&
      (fromDir.season !== null || series) ? 'tv' : type;
    const seasonNumber = resolvedType !== 'movie' ? seasonNo : null;
    const seasonKey = seasonNumber !== null ? `|season:${seasonNumber}` : '';
    const key = (directory
      ? `${resolvedType}|${normalizeTitle(title)}|${year || ''}|${f.source.id}|${directory.identity}`
      : `${resolvedType}|${normalizeTitle(title)}|${year || ''}`) + seasonKey;
    const id = idOf(key);

    if (!groups.has(id)) {
      groups.set(id, {
        id,
        key,
        title,
        year,
        type: resolvedType,
        seasonNumber,
        sourceId: f.source.id,
        sourceName: f.source.name,
        rootPath: f.source.path,
        episodes: [],
        size: 0,
        mtime: 0,
        addedAt: Date.now()
      });
    }
    const item = groups.get(id);
    item.episodes.push({
      name: f.name,
      path: f.path,
      size: f.size || 0,
      mtime: f.mtime || 0,
      season: seasonNo,
      episode: episodeNo !== null ? episodeNo : item.episodes.length + 1,
      ext: f.ext
    });
    item.size += f.size || 0;
    item.mtime = Math.max(item.mtime, f.mtime || 0);
  }

  const items = [];
  for (const item of groups.values()) {
    item.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode || a.name.localeCompare(b.name));
    // 同一季里集号重复（多碟 / 【01-10】这种分卷目录各自从 1 编号）→ 按文件名重排成连续集号
    const bySeason = new Map();
    for (const e of item.episodes) {
      const s = e.season || 1;
      if (!bySeason.has(s)) bySeason.set(s, []);
      bySeason.get(s).push(e);
    }
    let renumbered = false;
    for (const list of bySeason.values()) {
      if (new Set(list.map((e) => e.episode)).size === list.length) continue;
      list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }));
      list.forEach((e, i) => { e.episode = i + 1; });
      renumbered = true;
    }
    if (renumbered) {
      item.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
    }
    // 重新编号，保证集数连续可读
    const seasons = [...new Set(item.episodes.map((e) => e.season))];
    item.seasonCount = seasons.length;
    item.episodeCount = item.episodes.length;
    item.seasons = seasons.map((s) => ({
      season: s,
      count: item.episodes.filter((e) => e.season === s).length
    }));
    item.episodes.forEach((e, i) => {
      e.index = i;
    });
    item.kind = item.type === 'music'
      ? (item.album ? 'album' : 'track')
      : item.type === 'movie' ? 'movie' : 'series';
    item.label = TYPE_LABEL[item.type] || '影片';
    items.push(item);
  }

  items.sort((a, b) => b.mtime - a.mtime);
  return { items, files: files.length, audios: audioFiles.length, scanned };
}

module.exports = {
  SCAN_VERSION,
  scan,
  parseName,
  parseTrack,
  guessType,
  cleanTitle,
  seasonFromName,
  seasonFromDirs,
  seriesTitleFromDir,
  VIDEO_EXT,
  AUDIO_EXT,
  TYPE_LABEL,
  idOf
};
