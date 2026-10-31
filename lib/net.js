'use strict';
/**
 * 出网工具：区分「国内源」和「国外源」。
 * - 豆瓣等国内站点直连（走代理反而更慢/会被拦）
 * - TMDB / TVmaze / Bangumi / image.tmdb.org 走系统代理（Clash 之类）
 * Node 的 fetch 不认 macOS 的「系统代理」设置，所以这里自己读 scutil --proxy，
 * 并用 CONNECT 隧道 + TLS 手工建连，不引第三方依赖（打包体积不变）。
 */
const net = require('net');
const tls = require('tls');
const http = require('http');
const { execFileSync } = require('child_process');

let proxyCache;
let proxyAt = 0;

/** 读取系统代理，返回 'http://127.0.0.1:7890' 或 '' */
function systemProxy() {
  if (Date.now() - proxyAt < 60000) return proxyCache;
  proxyAt = Date.now();
  const env = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (env) {
    proxyCache = env;
    return proxyCache;
  }
  proxyCache = '';
  if (process.platform !== 'darwin') return proxyCache;
  try {
    const out = execFileSync('scutil', ['--proxy'], { encoding: 'utf8', timeout: 1500 });
    const pick = (enableKey, hostKey, portKey) => {
      const enabled = new RegExp(`${enableKey}\\s*:\\s*1`).test(out);
      const host = (out.match(new RegExp(`${hostKey}\\s*:\\s*(\\S+)`)) || [])[1];
      const port = (out.match(new RegExp(`${portKey}\\s*:\\s*(\\d+)`)) || [])[1];
      return enabled && host && port ? `http://${host}:${port}` : '';
    };
    proxyCache = pick('HTTPSEnable', 'HTTPSProxy', 'HTTPSPort') || pick('HTTPEnable', 'HTTPProxy', 'HTTPPort');
  } catch (e) {
    proxyCache = '';
  }
  return proxyCache;
}

/** 通过 HTTP 代理建 TLS 连接，返回 { socket, host } */
function connectViaProxy(proxyUrl, targetHost, targetPort, timeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err, val) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(val);
    };
    const p = new URL(proxyUrl);
    const sock = net.connect(Number(p.port) || 8080, p.hostname);
    sock.setTimeout(timeout);
    sock.once('error', (e) => done(e));
    sock.once('timeout', () => done(new Error('代理连接超时')));
    sock.once('connect', () => {
      sock.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`);
      let buf = '';
      const onData = (chunk) => {
        buf += chunk.toString('binary');
        const idx = buf.indexOf('\r\n\r\n');
        if (idx < 0) {
          if (buf.length > 8192) done(new Error('代理响应异常'));
          return;
        }
        sock.removeListener('data', onData);
        sock.setTimeout(0);
        const head = buf.slice(0, idx);
        const status = Number((head.match(/^HTTP\/1\.[01]\s+(\d{3})/) || [])[1]);
        if (status !== 200) {
          sock.destroy();
          return done(new Error(`代理拒绝连接: ${head.split('\r\n')[0]}`));
        }
        const tlsSock = tls.connect({ socket: sock, servername: targetHost }, () => done(null, tlsSock));
        tlsSock.once('error', (e) => done(e));
      };
      sock.on('data', onData);
    });
  });
}

function rawRequest(url, { method = 'GET', headers = {}, body = null, timeout = 12000, proxy = '' } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const port = Number(u.port) || (isHttps ? 443 : 80);
    const opt = {
      method,
      host: u.hostname,
      port,
      path: u.pathname + u.search,
      headers: { ...headers }
    };
    if (body) opt.headers['Content-Length'] = Buffer.byteLength(body);

    const send = (createConnection) => {
      if (createConnection) opt.createConnection = createConnection;
      const req = (isHttps ? require('https') : http).request(opt, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: Buffer.concat(chunks).toString('utf8'),
            buffer: Buffer.concat(chunks),
            headers: res.headers
          });
        });
      });
      req.setTimeout(timeout, () => {
        req.destroy(new Error('请求超时'));
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    };

    if (isHttps && proxy) {
      connectViaProxy(proxy, u.hostname, port, timeout)
        .then((sock) => send(() => sock))
        .catch(reject);
    } else {
      send(null);
    }
  });
}

/** 走系统代理（国外源） */
async function fetchAbroad(url, opts = {}) {
  const proxy = opts.proxy !== undefined ? opts.proxy : systemProxy();
  try {
    return await rawRequest(url, { ...opts, proxy });
  } catch (e) {
    // 代理挂了就直接试一次直连，别让整个匹配流程断掉
    if (proxy) return rawRequest(url, { ...opts, proxy: '' });
    throw e;
  }
}

/** 直连（国内源） */
function fetchLocal(url, opts = {}) {
  return rawRequest(url, { ...opts, proxy: '' });
}

async function fetchAbroadJson(url, opts = {}) {
  const res = await fetchAbroad(url, opts);
  if (!res.ok) return null;
  try {
    return JSON.parse(res.text);
  } catch (e) {
    return null;
  }
}

module.exports = { systemProxy, fetchAbroad, fetchAbroadJson, fetchLocal };
