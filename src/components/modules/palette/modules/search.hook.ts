import { useEffect, useMemo, useState } from 'react';
import { useProject } from '~/lib/project';
import { flattenFiles } from '~/lib/fs';
import { searchFiles, SEARCH_DEBOUNCE_MS, type SearchResult } from '~/lib/search';
import { useWindowManagerStore } from '~/lib/window/window.store';
import { usePaletteStore } from '../palette.store';

/**
 * Drives the search palette: debounces the query, runs the scan off the render
 * path, and abandons a run as soon as the query moves on. The component only
 * renders what this returns.
 */
export const usePaletteSearch = () => {
  const { project } = useProject();
  const { search, close } = usePaletteStore();
  const { addWindowFile, windows, focusedWindowId } = useWindowManagerStore();

  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // The project tree is already filtered by `files.exclude` at scan time, so
  // this is just a flatten -- no second ignore list to keep in sync.
  const files = project?.files;
  const filePaths = useMemo(
    () => flattenFiles(files ?? []).map((file) => file.path),
    [files]
  );

  useEffect(() => {
    const query = search.trim();
    if (!query) {
      setResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);

    // Wait out the keystroke before touching the disk: typing a ten-character
    // query should cost one scan, not ten.
    const timer = setTimeout(() => {
      void searchFiles(filePaths, query, { signal: controller.signal }).then(
        (found) => {
          if (controller.signal.aborted) return;
          setResults(found);
          setSearching(false);
        }
      );
    }, SEARCH_DEBOUNCE_MS);

    // Covers both a superseded query and an unmount mid-search: either way the
    // in-flight scan stops reading and its result is discarded.
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filePaths, search]);

  const openResult = (path: string) => {
    const window = windows.find((w) => w.id === focusedWindowId);
    addWindowFile(window?.id ?? '', path);
    close();
  };

  return { results, searching, openResult, projectPath: project?.path ?? '' };
};
