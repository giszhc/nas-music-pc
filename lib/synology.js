'use strict';
/**
 * 群晖 DSM 接口封装（FileStation）
 * - 账号密码登录，拿到 sid / synotoken
 * - 目录遍历、共享文件夹列表、文件下载（支持 Range 断点）
 * 兼容 DSM 6 / DSM 7，自签名证书默认放行。
 */
const http = require('http');
const https = require('https');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { PassThrough } = require('stream');

const agents = {
  'http:': new http.Agent({ keepAlive: true }),
  'https:': new https.Agent({ keepAlive: true, rejectUnauthorized: false, maxSockets: 16 })
};

/* ------------------------------ 传输层自愈 ------------------------------
 * macOS 15 起「本地网络」权限按可执行文件授权。从某些宿主（如 IDE、沙箱、
 * 未授权的终端）拉起的 node 访问局域网会一律 EHOSTUNREACH，而系统自带的
 * curl 往往有权限。这里在检测到该错误时自动改走 curl 子进程，用户无需去
 * 系统设置里折腾。两套传输对上层完全透明。
 * ---------------------------------------------------------------------- */

function findCurl() {
  if (process.platform === 'win32') {
    for (const p of ['C:\\Windows\\System32\\curl.exe', 'C:\\Windows\\SysWOW64\\curl.exe']) {
      if (fs.existsSync(p)) return p;
    }
    return 'curl.exe';
  }
  for (const p of ['/usr/bin/curl', '/opt/homebrew/bin/curl', '/usr/local/bin/curl', '/bin/curl']) {
    if (fs.existsSync(p)) return p;
  }
  return 'curl';
}

const CURL_BIN = findCurl();
let transport = 'node'; // 'node' | 'curl'

/** 当前实际使用的传输方式，供设置页 / 自检展示 */
function getTransport() {
  return transport;
}

function parseHeaderBlock(text) {
  // curl -D - 可能输出多段（1xx 中间响应），取最后一段
  const blocks = String(text).split(/\r?\n\r?\n/).filter((b) => /^HTTP\//i.test(b.trim()));
  const block = blocks.length ? blocks[blocks.length - 1] : '';
  const lines = block.split(/\r?\n/);
  const status = Number((/^HTTP\/[\d.]+\s+(\d{3})/i.exec(lines[0] || '') || [])[1]) || 0;
  const headers = {};
  for (let i = 1; i < lines.length; i += 1) {
    const idx = lines[i].indexOf(':');
    if (idx <= 0) continue;
    headers[lines[i].slice(0, idx).trim().toLowerCase()] = lines[i].slice(idx + 1).trim();
  }
  return { status, headers };
}

/** 局域网 / 回环地址必须绕过系统代理，否则 curl 会把请求丢给代理导致 502 */
function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return false;
  if (h === 'localhost' || h === '::1' || /^127\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  const m = /^172\.(\d+)\./.exec(h);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/\.local$/.test(h)) return true;
  return false;
}

function curlArgs(urlStr, { method = 'GET', headers = {}, timeout = 20000, extra = [] } = {}) {
  const secs = Math.max(1, Math.ceil(timeout / 1000));
  const args = ['-sS', '-k', '--connect-timeout', '8', '--max-time', String(secs), '-X', method];
  try {
    const u = new URL(urlStr);
    if (isPrivateHost(u.hostname)) args.push('--noproxy', '*');
  } catch (e) {
    /* 地址不合法时交给 curl 自己报错 */
  }
  for (const k of Object.keys(headers)) {
    if (headers[k] === undefined || headers[k] === null || headers[k] === '') continue;
    args.push('-H', `${k}: ${headers[k]}`);
  }
  return args.concat(extra, [urlStr]);
}

/** 小请求：header 与 body 各写临时文件，避免二进制被 shell 转义污染 */
function curlRequest(urlStr, opts = {}) {
  const { method = 'GET', headers = {}, timeout = 20000, body = null } = opts;
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = os.tmpdir();
  const hdrFile = path.join(dir, `yy-h-${stamp}.txt`);
  const bodyFile = path.join(dir, `yy-b-${stamp}.bin`);
  const cleanup = () => {
    fs.unlink(hdrFile, () => {});
    fs.unlink(bodyFile, () => {});
  };

  return new Promise((resolve, reject) => {
    const extra = ['-D', hdrFile, '-o', bodyFile];
    if (body !== null && body !== undefined) extra.push('--data-binary', '@-');
    const args = curlArgs(urlStr, { method, headers, timeout, extra });
    const proc = spawn(CURL_BIN, args, { stdio: [body === null || body === undefined ? 'ignore' : 'pipe', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (c) => {
      err += c.toString();
      if (err.length > 4000) err = err.slice(-4000);
    });
    if (proc.stdin && body !== null && body !== undefined) {
      proc.stdin.end(Buffer.isBuffer(body) ? body : Buffer.from(String(body)));
    }
    proc.on('error', (e) => {
      cleanup();
      reject(Object.assign(new Error(`调用 curl 失败：${e.message}`), { code: e.code }));
    });
    proc.on('close', (code) => {
      try {
        const hdrText = fs.existsSync(hdrFile) ? fs.readFileSync(hdrFile, 'latin1') : '';
        const buf = fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile) : Buffer.alloc(0);
        cleanup();
        if (!hdrText && code !== 0) {
          const msg = err.trim() || `curl 退出码 ${code}`;
          const mapped = /Could not connect|Failed to connect|No route to host/i.test(msg)
            ? Object.assign(new Error(msg), { code: 'EHOSTUNREACH' })
            : new Error(msg);
          return reject(mapped);
        }
        const { status, headers: h } = parseHeaderBlock(hdrText);
        resolve({ status, headers: h, body: buf });
      } catch (e) {
        cleanup();
        reject(e);
      }
    });
  });
}

/** 大文件：stdout 前段是响应头，切出后续 body 直接当流用 */
function curlStream(urlStr, headers = {}, timeout = 3600000) {
  return new Promise((resolve, reject) => {
    const args = curlArgs(urlStr, { headers, timeout, extra: ['-D', '-'] });
    const proc = spawn(CURL_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const bodyStream = new PassThrough();
    let buf = Buffer.alloc(0);
    let headDone = false;
    let settled = false;
    let err = '';

    const fail = (e) => {
      if (settled) return;
      settled = true;
      try {
        proc.kill('SIGKILL');
      } catch (x) {
        /* ignore */
      }
      bodyStream.destroy();
      reject(e);
    };

    proc.stderr.on('data', (c) => {
      err += c.toString();
      if (err.length > 4000) err = err.slice(-4000);
    });

    proc.stdout.on('data', (chunk) => {
      if (headDone) {
        bodyStream.write(chunk);
        return;
      }
      buf = Buffer.concat([buf, chunk]);
      const idx = buf.indexOf('\r\n\r\n');
      if (idx < 0) {
        if (buf.length > 128 * 1024) fail(new Error('响应头异常'));
        return;
      }
      const { status, headers: h } = parseHeaderBlock(buf.slice(0, idx).toString('latin1'));
      const rest = buf.slice(idx + 4);
      headDone = true;
      buf = Buffer.alloc(0);
      if (rest.length) bodyStream.write(rest);
      if (!settled) {
        settled = true;
        // 伪装成 IncomingMessage：上层统一用 statusCode / headers / pipe()
        bodyStream.statusCode = status;
        bodyStream.headers = h;
        resolve(bodyStream);
      }
    });

    proc.on('error', (e) => fail(Object.assign(new Error(`调用 curl 失败：${e.message}`), { code: e.code })));
    proc.on('close', (code) => {
      if (!headDone) {
        const msg = err.trim() || `curl 退出码 ${code}`;
        return fail(new Error(msg));
      }
      bodyStream.end();
    });
    bodyStream.on('close', () => {
      try {
        proc.kill('SIGKILL');
      } catch (x) {
        /* ignore */
      }
    });
  });
}

let session = null;
// session = { base, host, port, secure, account, sid, token, hostname }

const ERRORS = {
  400: '账号或密码不正确',
  401: '账号不存在',
  402: '账号权限不足',
  403: '该账号启用了两步验证，请输入动态验证码',
  404: '动态验证码错误',
  405: '账号已被停用',
  407: 'IP 被封禁',
  105: '当前账号没有权限访问该目录',
  106: '登录已超时，请重新登录',
  107: '同一账号重复登录被拒绝',
  119: '登录状态已失效，请重新登录',
  408: '文件或目录不存在',
  900: '目录不存在',
  902: '没有权限访问该目录',
  1000: '未知错误'
};

function errorFor(code, extra) {
  const err = new Error(ERRORS[code] || extra || `群晖返回错误码 ${code}`);
  err.code = code;
  return err;
}

function buildQuery(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => {
      const v = params[k];
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `${encodeURIComponent(k)}=${encodeURIComponent(s)}`;
    })
    .join('&');
}

function baseUrl(host, port, secure) {
  const clean = String(host || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const withPort = /:\d+$/.test(clean) || !port ? clean : `${clean}:${port}`;
  return `${secure ? 'https' : 'http'}://${withPort}`;
}

function nodeRequest(urlStr, { method = 'GET', headers = {}, timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return reject(new Error('服务器地址格式不正确'));
    }
    const mod = u.protocol === 'https:' ? https : http;
    let settled = false;
    let timer = null;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };

    const req = mod.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers,
        agent: agents[u.protocol],
        rejectUnauthorized: false
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          finish(resolve, { status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
        );
        res.on('error', (e) => finish(reject, e));
      }
    );

    // 硬超时：连接阶段卡住（防火墙丢包）也能及时返回
    timer = setTimeout(() => {
      req.destroy();
      finish(reject, Object.assign(new Error('连接超时'), { code: 'ETIMEDOUT' }));
    }, timeout);

    req.on('error', (e) => {
      const map = {
        ECONNREFUSED: '端口未开放：请确认端口号与协议（HTTP 5000 / HTTPS 5001）',
        ENOTFOUND: '找不到该地址，请检查 IP 或域名',
        EHOSTUNREACH: '无法访问该 IP：地址可能不正确，或系统未授予「本地网络」权限（macOS：系统设置 → 隐私与安全性 → 本地网络）',
        ENETUNREACH: '网络不可达：请检查 Wi-Fi / 网线是否连接',
        ETIMEDOUT: '连接超时：IP 可能不正确，或被防火墙拦截',
        ECONNRESET: '连接被重置，请稍后重试',
        EACCES: '网络访问被系统拒绝'
      };
      const msg = map[e.code] || String(e.message || '').replace(/^connect\s+/i, '') || '连接失败';
      finish(reject, Object.assign(new Error(msg), { code: e.code }));
    });
    req.end();
  });
}

function nodeStreamRequest(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return reject(new Error('地址不合法'));
    }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        headers,
        agent: agents[u.protocol],
        rejectUnauthorized: false
      },
      (res) => resolve(res)
    );
    req.setTimeout(30000, () => req.destroy(new Error('读取超时')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * 统一请求入口：优先用 node 原生连接；一旦发现被系统拦了局域网
 * （EHOSTUNREACH / ENETUNREACH / EACCES），自动切到 curl 并保持。
 */
async function request(urlStr, opts = {}) {
  if (transport === 'curl') return curlRequest(urlStr, opts);
  try {
    return await nodeRequest(urlStr, opts);
  } catch (e) {
    if (/^(EHOSTUNREACH|ENETUNREACH|EACCES|EPERM)$/.test(e.code || '')) {
      try {
        const r = await curlRequest(urlStr, opts);
        transport = 'curl';
        return r;
      } catch (e2) {
        throw e; // 两条路都不通，报原始错误（提示更有针对性）
      }
    }
    throw e;
  }
}

/** 流式请求（下载 / 播放），同样带 curl 兜底 */
async function streamRequest(urlStr, headers = {}) {
  if (transport === 'curl') return curlStream(urlStr, headers);
  try {
    return await nodeStreamRequest(urlStr, headers);
  } catch (e) {
    if (/^(EHOSTUNREACH|ENETUNREACH|EACCES|EPERM)$/.test(e.code || '')) {
      const r = await curlStream(urlStr, headers);
      transport = 'curl';
      return r;
    }
    throw e;
  }
}

async function callApi(params) {
  if (!session) throw errorFor(119);
  // DSM 7 的 entry.cgi 只认 _sid（传 sid 会返回 119「登录状态已失效」）
  const url = `${session.base}/webapi/entry.cgi?${buildQuery({ ...params, _sid: session.sid })}`;
  const headers = {};
  if (session.token) headers['X-SYNO-TOKEN'] = session.token;
  const res = await request(url, { headers });
  let json;
  try {
    json = JSON.parse(res.body.toString('utf8'));
  } catch (e) {
    throw new Error('群晖返回了非预期内容，请确认地址与端口指向 DSM');
  }
  if (!json.success) {
    const code = json.error && json.error.code;
    throw errorFor(code);
  }
  return json.data;
}

async function login({ host, port, secure = true, account, password, otp }) {
  if (!host) throw new Error('请填写群晖 IP 地址');
  if (!account || !password) throw new Error('请填写账号与密码');

  const candidates = [secure, !secure];
  let lastError = null;

  for (const useSecure of candidates) {
    const base = baseUrl(host, port, useSecure);
    for (const version of [6, 3]) {
      const params = {
        api: 'SYNO.API.Auth',
        version,
        method: 'login',
        account,
        passwd: password,
        session: 'FileStation',
        format: 'sid'
      };
      if (version === 6) params.enable_syno_token = 'yes';
      if (otp) params.otp_code = otp;

      try {
        const res = await request(`${base}/webapi/entry.cgi?${buildQuery(params)}`);
        const json = JSON.parse(res.body.toString('utf8'));
        if (json.success) {
          session = {
            base,
            host,
            port: Number(port),
            secure: useSecure,
            account,
            sid: json.data.sid,
            token: json.data.synotoken || '',
            hostname: ''
          };
          try {
            const info = await callApi({ api: 'SYNO.FileStation.Info', version: 2, method: 'get' });
            session.hostname = info.hostname || '';
          } catch (e) {
            /* 忽略：部分账号无 FileStation.Info 权限 */
          }
          return { ...session };
        }
        const code = json.error && json.error.code;
        if (code === 104) continue; // 版本不支持，降级重试
        lastError = errorFor(code);
        if (code === 403 || code === 404) throw lastError;
      } catch (e) {
        lastError = e.code && ERRORS[e.code] ? e : new Error(e.message || '登录失败');
      }
    }
  }
  throw lastError || new Error('登录失败');
}

function logout() {
  if (session) {
    const url = `${session.base}/webapi/entry.cgi?${buildQuery({
      api: 'SYNO.API.Auth',
      version: 6,
      method: 'logout',
      session: 'FileStation',
      _sid: session.sid
    })}`;
    request(url).catch(() => {});
  }
  session = null;
}

function restore(saved) {
  if (!saved || !saved.sid || !saved.host) return false;
  session = {
    base: baseUrl(saved.host, saved.port, saved.https !== false),
    host: saved.host,
    port: Number(saved.port),
    secure: saved.https !== false,
    account: saved.account || '',
    sid: saved.sid,
    token: saved.token || '',
    hostname: saved.hostname || ''
  };
  return true;
}

function getSession() {
  return session;
}

async function listShares() {
  const data = await callApi({
    api: 'SYNO.FileStation.List',
    version: 2,
    method: 'list_share',
    additional: ['real_path']
  });
  return (data.shares || []).map((s) => ({ name: s.name, path: s.path, isdir: true }));
}

async function listFolder(folderPath) {
  const out = [];
  const limit = 1000;
  let offset = 0;
  for (let guard = 0; guard < 60; guard += 1) {
    const data = await callApi({
      api: 'SYNO.FileStation.List',
      version: 2,
      method: 'list',
      folder_path: folderPath,
      additional: ['size', 'time', 'real_path'],
      sort_by: 'name',
      sort_direction: 'asc',
      limit,
      offset
    });
    const files = data.files || [];
    for (const f of files) {
      const extra = f.additional || {};
      out.push({
        name: f.name,
        path: f.path,
        isdir: !!f.isdir,
        size: extra.size || 0,
        mtime: extra.time && extra.time.mtime ? extra.time.mtime * 1000 : 0
      });
    }
    offset += files.length;
    if (files.length < limit || offset >= (data.total || 0)) break;
  }
  return out;
}

/* ---------------------------- 局域网自动发现 ---------------------------- */

let discoverCache = { at: 0, hosts: [], blocked: 0 };

function localNetworks() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        out.push({ iface: name, address: net.address, netmask: net.netmask });
      }
    }
  }
  return out;
}

// 100.64.0.0/10 是运营商级 NAT 段（Tailscale 等组网工具也用它），169.254 是自动私有地址
function isCgnat(ip) {
  const p = String(ip).split('.').map(Number);
  return p[0] === 100 && p[1] >= 64 && p[1] <= 127;
}

/** 优先用真实局域网网卡；只有组网地址时再退回它 */
function scanInterfaces() {
  const nets = localNetworks().filter((n) => !String(n.address).startsWith('169.254.'));
  const primary = nets.filter((n) => !isCgnat(n.address));
  return primary.length ? primary : nets;
}

function candidateHosts() {
  const ips = new Set();
  for (const n of scanInterfaces()) {
    const parts = String(n.address).split('.');
    if (parts.length !== 4) continue;
    const base = `${parts[0]}.${parts[1]}.${parts[2]}`;
    for (let i = 1; i <= 254; i += 1) ips.add(`${base}.${i}`);
  }
  return [...ips];
}

async function probeDiskStation(ip, stats) {
  for (const secure of [false, true]) {
    const port = secure ? 5001 : 5000;
    const base = `${secure ? 'https' : 'http'}://${ip}:${port}`;
    try {
      const r = await request(
        `${base}/webapi/query.cgi?api=SYNO.API.Info&version=1&method=query&query=SYNO.API.Auth`,
        { timeout: 600 }
      );
      if (r.status !== 200) continue;
      const json = JSON.parse(r.body.toString('utf8'));
      if (!json.success) continue;
      let hostname = '';
      try {
        const page = await request(`${base}/`, { timeout: 900 });
        const m = /<title>([^<]*)<\/title>/i.exec(page.body.toString('utf8'));
        if (m) hostname = m[1].replace(/&nbsp;/g, ' ').split('-')[0].trim();
      } catch (e) {
        /* 忽略 */
      }
      return { ip, port, https: secure, hostname, model: json.data && json.data.model };
    } catch (e) {
      // 统计「本机根本没权限访问局域网」这类系统性错误，用于给出准确的提示
      if (stats && /^(EHOSTUNREACH|ENETUNREACH|EACCES|EPERM)$/.test(e.code || '')) stats.netErr += 1;
    }
  }
  return null;
}

/**
 * 扫描当前网段内的群晖设备
 * @returns {{hosts: Array, localIps: string[], blocked: boolean}}
 */
async function discoverDetailed({ concurrency = 96, force = false } = {}) {
  const localIps = scanInterfaces().map((n) => n.address);
  if (!force && Date.now() - discoverCache.at < 15000) {
    return { hosts: discoverCache.hosts, localIps, blocked: !!discoverCache.blocked };
  }
  const ips = candidateHosts();
  const found = [];
  const stats = { netErr: 0 };
  let cursor = 0;
  const workers = new Array(Math.min(concurrency, ips.length)).fill(0).map(async () => {
    while (cursor < ips.length) {
      const ip = ips[cursor];
      cursor += 1;
      const hit = await probeDiskStation(ip, stats);
      if (hit) found.push(hit);
    }
  });
  await Promise.all(workers);
  const hosts = found.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
  // 几乎全部探测都报「主机不可达」→ 多半是本机没有局域网访问权限，而不是没有群晖
  const blocked = hosts.length === 0 && stats.netErr > ips.length * 0.5;
  discoverCache = { at: Date.now(), hosts, blocked: blocked ? 1 : 0 };
  return { hosts, localIps, blocked };
}

async function discover(opts) {
  const r = await discoverDetailed(opts);
  return r.hosts;
}

function downloadUrl(filePath) {
  if (!session) throw errorFor(119);
  return `${session.base}/webapi/entry.cgi?${buildQuery({
    api: 'SYNO.FileStation.Download',
    version: 2,
    method: 'download',
    path: [filePath],
    mode: 'open',
    _sid: session.sid
  })}`;
}

/** DSM 7 的下载接口除了 _sid 还必须带 X-SYNO-TOKEN，否则返回 119 */
function authHeaders(extra) {
  const h = Object.assign({}, extra || {});
  if (session && session.token) h['X-SYNO-TOKEN'] = session.token;
  return h;
}

module.exports = {
  login,
  logout,
  restore,
  getSession,
  listShares,
  listFolder,
  downloadUrl,
  authHeaders,
  discover,
  discoverDetailed,
  streamRequest,
  request,
  getTransport,
  errorFor
};
