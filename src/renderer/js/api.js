// Renderer → main bridge. `api.tasks.create({...})` becomes an IPC call to the whitelisted service registry.
// Every GUI action, palette action and terminal command goes through this single object.
const bridge = window.geneos;

export const api = new Proxy({}, {
  get(_t, service) {
    return new Proxy({}, { get(_s, method) { return (...args) => bridge.invoke(String(service), String(method), ...args); } });
  },
});

export const native = {
  pathForFile: (f) => bridge.pathForFile(f),
  setZoom: (z) => bridge.setZoom(z),
  on: (ch, cb) => bridge.on(ch, cb),
  platform: bridge.platform,
};

// Report unexpected renderer errors to the main-process log file.
window.addEventListener('error', (e) => { try { api.system.logRenderer('error', `${e.message} @ ${e.filename}:${e.lineno}`); } catch { /* ignore */ } });
window.addEventListener('unhandledrejection', (e) => { try { api.system.logRenderer('error', String(e.reason && e.reason.stack || e.reason)); } catch { /* ignore */ } });
