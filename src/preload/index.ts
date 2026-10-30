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
import type { AgentEvents } from '@shared/agent.def';
import type { BoardDocument, BoardRef, BoardScope } from '@shared/board.def';
import type { Bookmark, BookmarkScope } from '@shared/bookmark.def';
import type { File, FileChange } from '@shared/fs.def';
import type { GitStatus } from '@shared/git.def';
import type { FrodonApi } from '@shared/ipc.def';
import type { TerminalData, TerminalExit } from '@shared/terminal.def';
import type { UpdateState } from '@shared/update.def';

const api: FrodonApi = {
  project: {
    pick: () => ipcRenderer.invoke('project:pick'),
    tree: (root) => ipcRenderer.invoke('project:tree', { root }),
    recents: () => ipcRenderer.invoke('project:recents'),
    forgetRecent: (path) =>
      ipcRenderer.invoke('project:forget-recent', { path }),
    layout: (root) => ipcRenderer.invoke('project:layout', { root }),
    saveLayout: (root, layout) =>
      ipcRenderer.invoke('project:save-layout', { root, layout }),
    onChanged: (listener) => {
      const handler = (_event: unknown, files: File[]) => listener(files);
      ipcRenderer.on('project:changed', handler);
      return () => ipcRenderer.removeListener('project:changed', handler);
    },
  },
  config: {
    project: () => ipcRenderer.invoke('config:project'),
    saveProject: (config) =>
      ipcRenderer.invoke('config:save-project', { config }),
    user: () => ipcRenderer.invoke('config:user'),
    saveUser: (config) => ipcRenderer.invoke('config:save-user', { config }),
  },
  file: {
    read: (path) => ipcRenderer.invoke('file:read', { path }),
    readBytes: (path) => ipcRenderer.invoke('file:read-bytes', { path }),
    write: (path, content) =>
      ipcRenderer.invoke('file:write', { path, content }),
    create: (parent, name) =>
      ipcRenderer.invoke('file:create', { parent, name }),
    createDir: (parent, name) =>
      ipcRenderer.invoke('file:create-dir', { parent, name }),
    rename: (path, name) => ipcRenderer.invoke('file:rename', { path, name }),
    remove: (path) => ipcRenderer.invoke('file:delete', { path }),
    watch: (paths) => ipcRenderer.invoke('file:watch', { paths }),
    // Unfiltered, unlike a terminal's output: main already sends this only to
    // the windows showing that file, and the one page they live in holds a
    // handful of editors rather than a stream of chunks.
    onChanged: (listener) => {
      const handler = (_event: unknown, change: FileChange) => listener(change);
      ipcRenderer.on('file:changed', handler);
      return () => ipcRenderer.removeListener('file:changed', handler);
    },
  },
  git: {
    status: () => ipcRenderer.invoke('git:status'),
    branches: () => ipcRenderer.invoke('git:branches'),
    fetch: () => ipcRenderer.invoke('git:fetch'),
    pull: () => ipcRenderer.invoke('git:pull'),
    push: () => ipcRenderer.invoke('git:push'),
    checkout: (branch) => ipcRenderer.invoke('git:checkout', { branch }),
    createBranch: (branch) =>
      ipcRenderer.invoke('git:create-branch', { branch }),
    branchDetails: () => ipcRenderer.invoke('git:branch-details'),
    log: (request) => ipcRenderer.invoke('git:log', request),
    commitDetail: (sha) => ipcRenderer.invoke('git:commit-detail', { sha }),
    diff: (request) => ipcRenderer.invoke('git:diff', request),
    stage: (paths) => ipcRenderer.invoke('git:stage', { paths }),
    unstage: (paths) => ipcRenderer.invoke('git:unstage', { paths }),
    discard: (path) => ipcRenderer.invoke('git:discard', { path }),
    commit: (request) => ipcRenderer.invoke('git:commit', request),
    onChanged: (listener) => {
      const handler = (_event: unknown, status: GitStatus) => listener(status);
      ipcRenderer.on('git:changed', handler);
      return () => ipcRenderer.removeListener('git:changed', handler);
    },
  },
  search: {
    query: (request) => ipcRenderer.invoke('search:query', request),
    replace: (request) => ipcRenderer.invoke('search:replace', request),
  },
  terminal: {
    create: (options) => ipcRenderer.invoke('terminal:create', options),
    write: (id, data) => ipcRenderer.invoke('terminal:write', { id, data }),
    resize: (id, cols, rows) =>
      ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
    kill: (id) => ipcRenderer.invoke('terminal:kill', { id }),
    // Output is a single channel carrying every session's bytes, so the id
    // check happens here rather than in each terminal component: a chunk for
    // one shell must not cross into the renderer's other nine.
    onData: (id, listener) => {
      const handler = (_event: unknown, payload: TerminalData) => {
        if (payload.id === id) listener(payload.data);
      };
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.removeListener('terminal:data', handler);
    },
    onExit: (id, listener) => {
      const handler = (_event: unknown, payload: TerminalExit) => {
        if (payload.id === id) listener(payload);
      };
      ipcRenderer.on('terminal:exit', handler);
      return () => ipcRenderer.removeListener('terminal:exit', handler);
    },
  },
  agent: {
    availability: (kind) => ipcRenderer.invoke('agent:availability', { kind }),
    start: (id, kind) => ipcRenderer.invoke('agent:start', { id, kind }),
    send: (id, text) => ipcRenderer.invoke('agent:send', { id, text }),
    respond: (id, requestId, allow) =>
      ipcRenderer.invoke('agent:respond', { id, requestId, allow }),
    interrupt: (id) => ipcRenderer.invoke('agent:interrupt', { id }),
    setModel: (id, model) =>
      ipcRenderer.invoke('agent:set-model', { id, model }),
    stop: (id) => ipcRenderer.invoke('agent:stop', { id }),
    // Filtered here, like a terminal's output: one channel carries every
    // conversation, and a reply streaming in one tile must not wake the rest.
    onEvents: (id, listener) => {
      const handler = (_event: unknown, payload: AgentEvents) => {
        if (payload.id === id) listener(payload.events);
      };
      ipcRenderer.on('agent:events', handler);
      return () => ipcRenderer.removeListener('agent:events', handler);
    },
  },
  board: {
    list: () => ipcRenderer.invoke('board:list'),
    read: (ref: BoardRef) => ipcRenderer.invoke('board:read', ref),
    write: (ref: BoardRef, document: BoardDocument) =>
      ipcRenderer.invoke('board:write', { ref, document }),
    create: (scope: BoardScope, name?: string) =>
      ipcRenderer.invoke('board:create', { scope, name }),
    rename: (ref: BoardRef, name: string) =>
      ipcRenderer.invoke('board:rename', { ref, name }),
    // `remove`, not `delete`: the latter is a reserved word, and a method
    // named around it reads worse than one named plainly.
    remove: (ref: BoardRef) => ipcRenderer.invoke('board:delete', ref),
  },
  browser: {
    favicon: (url: string) => ipcRenderer.invoke('browser:favicon', { url }),
  },
  bookmark: {
    list: () => ipcRenderer.invoke('bookmark:list'),
    save: (scope: BookmarkScope, bookmarks: Bookmark[]) =>
      ipcRenderer.invoke('bookmark:save', { scope, bookmarks }),
  },
  worktree: {
    list: () => ipcRenderer.invoke('worktree:list'),
    create: (request) => ipcRenderer.invoke('worktree:create', request),
    remove: (path) => ipcRenderer.invoke('worktree:remove', { path }),
  },
  window: {
    open: (root) => ipcRenderer.invoke('window:open', { root }),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    reportIssue: (report) => ipcRenderer.invoke('app:report-issue', report),
  },
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    install: () => ipcRenderer.invoke('update:install'),
    onChanged: (listener) => {
      const handler = (_event: unknown, state: UpdateState) => listener(state);
      ipcRenderer.on('update:changed', handler);
      return () => ipcRenderer.removeListener('update:changed', handler);
    },
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
