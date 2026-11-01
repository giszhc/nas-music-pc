'use strict';
/**
 * 聆境音乐桌面客户端（Electron 外壳，同时支持 macOS 与 Windows）
 * - 内嵌启动本地服务（server.js），无需用户单独开终端
 * - 关闭窗口即退出服务，避免端口残留
 */
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.PORT || 18789);
const ROOT = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..');
const DATA_DIR = path.join(app.getPath('userData'), 'data');
const isMac = process.platform === 'darwin';

let serverProc = null;
let win = null;

function ping() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/state', timeout: 800 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startServer() {
  if (await ping()) return; // 已经有实例在跑，直接复用
  serverProc = fork(path.join(ROOT, 'server.js'), [], {
    env: {
      ...process.env,
      PORT: String(PORT),
      // 0.0.0.0 = 局域网可访问（手机/平板/电视直接开 http://本机IP:18789）
      // 只想本机用就设 HOST=127.0.0.1 再启动客户端
      HOST: '127.0.0.1',
      ELECTRON_RUN_AS_NODE: '1',
      YUNYING_DATA_DIR: DATA_DIR
    },
    stdio: 'ignore',
    detached: false
  });
  serverProc.on('exit', () => {
    serverProc = null;
  });
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    if (await ping()) return;
  }
  throw new Error('本地服务启动超时');
}

function buildMenu() {
  const template = [
    ...(isMac
      ? [{
          label: '聆境音乐',
          submenu: [
            { role: 'about', label: '关于聆境音乐' },
            { type: 'separator' },
            { role: 'hide', label: '隐藏' },
            { role: 'hideOthers', label: '隐藏其他' },
            { role: 'unhide', label: '显示全部' },
            { type: 'separator' },
            { role: 'quit', label: '退出聆境音乐' }
          ]
        }]
      : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#ffffff',
    title: '聆境音乐',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 14, y: 18 } : undefined,
    autoHideMenuBar: !isMac,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  // ?desktop=1 让页面加上 is-electron 类，为 macOS 红绿灯让出顶部空间
  win.loadURL(`http://127.0.0.1:${PORT}/?desktop=1#/list/music`);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (e) {
    dialog.showErrorBox('启动失败', `本地服务未能启动：${e.message}`);
    app.quit();
    return;
  }
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  if (serverProc && !serverProc.killed) {
    try {
      serverProc.kill();
    } catch (e) {
      /* ignore */
    }
  }
});
