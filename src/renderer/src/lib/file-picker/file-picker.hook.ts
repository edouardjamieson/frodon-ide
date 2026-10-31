import { useCallback, useEffect, useMemo } from 'react';
import { useProjectStore } from '~/lib/project';
import { useActiveFilePath, useOpenFile, useOpenFilePaths } from '~/lib/window';
import { MAX_RESULTS } from './file-picker.constant';
import { collectFiles, rankFiles } from './file-picker.service';
import { useFilePickerStore } from './file-picker.store';
import type { PickerResult } from './file-picker.def';

/**
 * Keeps the recency list current. Mount this ONCE near the app root.
 *
 * Recency is taken from the file being *looked at* rather than from `openFile`
 * itself, because they are not the same event: clicking a tab that was already
 * open changes what you are working on without opening anything. Watching the
 * active path catches both, and costs one write per change of tab.
 */
export const useRecentFilesEffect = (): void => {
  const activePath = useActiveFilePath();
  const remember = useFilePickerStore((state) => state.remember);

  useEffect(() => {
    if (activePath) remember(activePath);
  }, [activePath, remember]);
};

/**
 * Every file in the project, prepared for matching.
 *
 * Memoized on the tree, so the flattening and lowercasing happen when the
 * watcher pushes a change — not on every keystroke, and not on every render of
 * a list that is being typed into.
 */
const usePickerFiles = () => {
  const files = useProjectStore((state) => state.files);
  const root = useProjectStore((state) => state.root);

  return useMemo(() => collectFiles(files, root), [files, root]);
};

/** The same, with the project's folders listed among the files. */
export const useProjectEntries = () => {
  const files = useProjectStore((state) => state.files);
  const root = useProjectStore((state) => state.root);

  return useMemo(() => collectFiles(files, root, true), [files, root]);
};

/**
 * The picker: what it is showing, and the two things it can do.
 *
 * With nothing typed it lists the files already open, most recently looked at
 * first — which makes it a tab switcher as much as a way to find something,
 * and is most of what it gets used for. That list is the recency order
 * *intersected* with what is actually open, which is also why nothing has to
 * prune the recency list when a file is renamed or deleted: a path that no
 * longer names an open file stops appearing on its own.
 */
export const useFilePicker = () => {
  const open = useFilePickerStore((state) => state.open);
  const query = useFilePickerStore((state) => state.query);
  const recent = useFilePickerStore((state) => state.recent);
  const setQuery = useFilePickerStore((state) => state.setQuery);
  const closePicker = useFilePickerStore((state) => state.closePicker);

  const files = usePickerFiles();
  const openPaths = useOpenFilePaths();
  const openFile = useOpenFile();

  const byPath = useMemo(
    () => new Map(files.map((file) => [file.path, file])),
    [files]
  );

  const results = useMemo((): PickerResult[] => {
    if (query.trim()) return rankFiles(files, query, MAX_RESULTS);

    const listed: PickerResult[] = [];
    const seen = new Set<string>();

    for (const path of recent) {
      if (seen.has(path) || !openPaths.has(path)) continue;
      const file = byPath.get(path);
      // Open, but gone from the tree — deleted, or renamed out from under the
      // tab. The row would open something that is not there.
      if (!file) continue;

      seen.add(path);
      listed.push({ file, positions: [] });
    }

    // Anything open that has not been looked at this session — a second
    // window's tabs, say — keeps its tab order at the end of the list.
    for (const path of openPaths) {
      if (seen.has(path)) continue;
      const file = byPath.get(path);
      if (file) listed.push({ file, positions: [] });
    }

    return listed;
  }, [query, files, recent, openPaths, byPath]);

  /**
   * Opens a file and closes the picker.
   *
   * Routing is `openFile`'s problem and was already solved: the focused window
   * if it can hold a file, else the first editor, else an empty pane, else a
   * new editor window. The picker has no opinion about where a file lands, the
   * same way the explorer has none.
   */
  const choose = useCallback(
    (path: string) => {
      openFile(path);
      closePicker();
    },
    [openFile, closePicker]
  );

  return { open, query, setQuery, close: closePicker, results, choose };
};
