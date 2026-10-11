/**
 * The bridge, and the entire surface the renderer can reach.
 *
 * This file runs in a privileged context with access to both Node and the
 * page, which makes it the one genuinely security-sensitive file in the
 * project. Two rules follow from that:
 *
 *   1. Expose named methods, never a generic `invoke(channel, payload)`. A
 *      passthrough would grant the renderer every channel main registers,
 *      including ones added later for something unrelated. The list is written
 *      out so that widening it is a visible act.
 *
 *   2. Never expose an Electron object itself. `contextBridge` only clones
 *      plain data and functions, and handing over something like `ipcRenderer`
 *      wholesale would hand over `send` to any channel at all.
 *
 * Event subscriptions return an unsubscribe function rather than exposing
 * `removeListener`, so a React effect can clean up without the renderer ever
 * holding a reference to the emitter.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { File } from '@shared/fs.def';
import type { FrodonApi } from '@shared/ipc.def';

const api: FrodonApi = {
  project: {
    pick: () => ipcRenderer.invoke('project:pick'),
    tree: (root) => ipcRenderer.invoke('project:tree', { root }),
    onChanged: (listener) => {
      const handler = (_event: unknown, files: File[]) => listener(files);
      ipcRenderer.on('project:changed', handler);
      return () => ipcRenderer.removeListener('project:changed', handler);
    },
  },
  file: {
    read: (path) => ipcRenderer.invoke('file:read', { path }),
    write: (path, content) =>
      ipcRenderer.invoke('file:write', { path, content }),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
  },
};

// `contextIsolation` is on, so this is the only way across. The `else` branch
// exists for the case where someone disables it — which should never happen,
// and is why it throws rather than quietly falling back to a global.
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('frodon', api);
} else {
  throw new Error(
    'Frodon requires contextIsolation. Re-enable it in window.service.ts.'
  );
}
