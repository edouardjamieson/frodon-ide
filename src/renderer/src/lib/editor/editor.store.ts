import { create } from 'zustand';
import { dirtyKey, type EditorStore } from './editor.def';

export const useEditorStore = create<EditorStore>((set, get) => ({
  dirty: new Set<string>(),
  pendingSave: null,
  pendingFind: null,
  markdownSource: new Set<string>(),

  setDirty: (windowId, path, dirty) => {
    const current = get().dirty;
    const key = dirtyKey(windowId, path);
    // Asked on every change to a document, which means on every keystroke.
    // Only the transitions are worth a notification — the rest would re-render
    // the tab bar once per character typed.
    if (current.has(key) === dirty) return;

    const next = new Set(current);
    if (dirty) next.add(key);
    else next.delete(key);
    set({ dirty: next });
  },

  forgetWindow: (windowId) => {
    const current = get().dirty;
    const prefix = dirtyKey(windowId, '');
    const next = new Set([...current].filter((key) => !key.startsWith(prefix)));
    if (next.size === current.size) return;
    set({ dirty: next });
  },

  retain: (windowId, paths) => {
    const current = get().dirty;
    if (current.size === 0) return;

    const keep = new Set(paths.map((path) => dirtyKey(windowId, path)));
    const prefix = dirtyKey(windowId, '');
    const next = new Set(
      [...current].filter((key) => !key.startsWith(prefix) || keep.has(key))
    );
    if (next.size === current.size) return;
    set({ dirty: next });
  },

  requestSave: (windowId) => set({ pendingSave: windowId }),

  clearSave: () => {
    // Guarded for the same reason `clearReveal` is: every editor window runs
    // the same consume effect, and all but the one addressed find nothing to
    // do.
    if (get().pendingSave === null) return;
    set({ pendingSave: null });
  },

  requestFind: (windowId) => set({ pendingFind: windowId }),

  clearFind: () => {
    if (get().pendingFind === null) return;
    set({ pendingFind: null });
  },

  toggleMarkdownSource: (windowId) => {
    const next = new Set(get().markdownSource);
    if (!next.delete(windowId)) next.add(windowId);
    set({ markdownSource: next });
  },
}));
