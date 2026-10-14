import { dirtyKey } from './editor.def';
import { useEditorStore } from './editor.store';

/** Every document with unsaved work, for a tab bar to look rows up in. */
export const useDirtyFiles = (): ReadonlySet<string> =>
  useEditorStore((state) => state.dirty);

/** Whether one tab, in one window, has unsaved work. */
export const useIsDirty = (windowId: string, path: string | null): boolean =>
  useEditorStore(
    (state) => path !== null && state.dirty.has(dirtyKey(windowId, path))
  );
