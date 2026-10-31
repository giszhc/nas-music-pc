'use strict';
function progress(stage, completed, total, percent, estimated = false) {
  return { stage, completed, total, percent: Math.max(0, Math.min(100, Math.floor(percent))), estimated };
}
function scanProgress(completed, pending, previous = 0) {
  const total = completed + pending;
  return progress('读取目录', completed, total, Math.max(previous, total ? completed / total * 95 : 0), true);
}
function matchProgress(completed, total, retry = false) {
  const fraction = total ? completed / total : 1;
  return progress(retry ? '重试未匹配作品' : '匹配影片信息', completed, total,
    retry ? 90 + fraction * 9 : fraction * 90);
}
module.exports = { progress, scanProgress, matchProgress };
