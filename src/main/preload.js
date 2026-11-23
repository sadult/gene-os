'use strict';
// Preload bridge: exposes a minimal, typed surface. The renderer never gets Node access.
const { contextBridge, ipcRenderer, webFrame, webUtils } = require('electron');

async function invoke(service, method, ...args) {
  const res = await ipcRenderer.invoke('gos:invoke', service, method, args);
  if (!res || !res.ok) throw new Error((res && res.error) || 'Unknown error');
  return res.value;
}

contextBridge.exposeInMainWorld('geneos', {
  invoke,
  manifest: () => ipcRenderer.invoke('gos:manifest'),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
  setZoom: (f) => webFrame.setZoomFactor(Math.min(2, Math.max(0.6, Number(f) || 1))),
  on: (channel, cb) => {
    if (!['gos:notifications', 'gos:window'].includes(channel)) throw new Error('Channel not allowed');
    const h = (_e, data) => cb(data);
    ipcRenderer.on(channel, h);
    return () => ipcRenderer.removeListener(channel, h);
  },
  platform: process.platform,
});
