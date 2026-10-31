'use strict';
if (window.__TAURI__) {
  const appWindow = window.__TAURI__.window.getCurrentWindow();
  const reportWindowError = error => { if (typeof toast === 'function') toast(`窗口操作失败：${error?.message || error}`); };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-window-action]');
    if (!button) return;
    const action = button.dataset.windowAction;
    if (!['minimize', 'toggleMaximize', 'close'].includes(action)) return;
    appWindow[action]().catch(reportWindowError);
  });
  document.addEventListener('mousedown', event => {
    if (event.button !== 0 || event.target.closest('button,input,select,a,textarea')) return;
    if (event.target.id !== 'topbar' && !event.target.closest('.brand')) return;
    event.preventDefault();
    if (event.detail === 2) appWindow.toggleMaximize().catch(reportWindowError);
    else appWindow.startDragging().catch(reportWindowError);
  });
}
