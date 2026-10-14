import { useEffect, useMemo } from 'react';
import { useOpenFilePaths } from '~/lib/window';
import { useFileWatchStore } from './file-watch.store';

/**
 * Tells main which files the workbench is showing, and keeps track of the ones
 * that stop existing. Mount this ONCE near the app root.
 *
 * The subscription is derived from the tabs rather than registered by them:
 * every editor window in this page shares one `WebContents`, so a tab that
 * subscribed for itself would overwrite the subscription of every other tab in
 * every other pane. The union is computed where the union is known.
 */
export const useFileWatchSync = (): void => {
  const open = useOpenFilePaths();
  const setMissing = useFileWatchStore((state) => state.setMissing);
  const retain = useFileWatchStore((state) => state.retain);

  /**
   * The same set as a single string.
   *
   * `useOpenFilePaths` is memoized on the window list, which changes when a
   * splitter moves or a shell is opened — neither of which has anything to do
   * with what is on disk. Keying the effect on the contents instead means
   * rearranging the workbench sends nothing across the boundary. NUL is the
   * one byte a path cannot contain, so it is the one safe separator.
   */
  const key = useMemo(() => [...open].sort().join('\0'), [open]);

  useEffect(() => {
    const paths = key ? key.split('\0') : [];
    void window.frodon.file.watch(paths);
    // A closed tab's file stops being anyone's problem, including a missing
    // one's: main has already forgotten it, and nothing would ever clear it.
    retain(paths);
  }, [key, retain]);

  useEffect(
    () =>
      window.frodon.file.onChanged(({ path, deleted }) =>
        setMissing(path, deleted)
      ),
    [setMissing]
  );
};

/** Every open file that is no longer on disk. For the tab bar. */
export const useMissingFiles = (): ReadonlySet<string> =>
  useFileWatchStore((state) => state.missing);

/** Whether one file is gone from disk. */
export const useIsMissing = (path: string | null): boolean =>
  useFileWatchStore((state) => path !== null && state.missing.has(path));
