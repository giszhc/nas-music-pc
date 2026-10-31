# 聆境音乐

源码仓库：[giszhc/nas-music-pc](https://github.com/giszhc/nas-music-pc)。

独立桌面音乐播放器，兼容 macOS 与 Windows。名称和图标来自 YunYingMusic，界面沿用 nas-media-client 的音乐模块。

窗口为无边框模式，顶部空白与品牌区域可拖动，双击可最大化/还原，macOS 使用原生左上角红黄绿按钮，Windows 使用右上角窗口控制按钮。

## 当前架构

Tauri 2 + Rust，安装包不包含 Electron、Chromium 或 Node。顶部与左侧参考用户指定截图，亮色主题采用纯白背景；原系统音乐馆、歌曲/歌手/专辑内容区、底部播放器、大播放页、歌词、音效和主题切换复用现有前端。`native/style.css`、`native/glass.css` 与迁移前的样式文件一致。

本地文件夹使用系统选择对话框导入，后台递归扫描、读取音频标签、去重，缓存未变化文件的元数据。暂时不可访问的目录保留已有歌曲。歌曲通过受授权的文件协议读取，不启动本地 HTTP 服务。

群晖使用 FileStation 登录、目录浏览、递归导入和分段音频读取。密码与会话只留在内存；需要有效 HTTPS 证书。群晖歌曲目前从文件名识别信息，本地歌曲读取文件标签。部分音频格式能否播放取决于系统 WebView 解码能力。

## 开发与打包

需要 Node、pnpm、Rust 和平台构建工具。

```sh
pnpm install
pnpm desktop
pnpm build
```

macOS：`pnpm dist:mac`，Windows：在 Windows 执行 `pnpm dist:win`。产物位于 `src-tauri/target/release/bundle`。Windows 使用已有 WebView2，未安装时下载运行时，不将完整 WebView2 捆绑到安装包。尚未配置正式签名、公证。

`.github/workflows/desktop.yml` 提供手动触发的 macOS / Windows 构建，尚未推送或运行。

## 验证

```sh
node --test tests/native-bridge.test.cjs
cargo test --manifest-path src-tauri/Cargo.toml
```

原 Node 服务与 Electron 迁移草稿保留在 `server.js`、`lib`、`public`、`desktop`，不参与 Tauri 打包。原 Node 服务仅用于迁移参考，可通过 `pnpm legacy` 启动。

歌曲信息支持手动编辑，也可以在大播放页的「编辑歌曲信息 → 在线匹配」查询网易云与 QQ 音乐候选，选择版本后保存歌名、歌手、专辑和封面。封面缓存到本机，重新扫描保留已编辑信息。匹配只读取元数据，不下载歌曲音频。在线歌词搜索及 FFmpeg 转码尚未迁入 Rust，相关操作仍待补齐。本地同名 LRC 歌词可用。最终安装包大小、启动耗时及内存占用须以 release 构建实测为准。
