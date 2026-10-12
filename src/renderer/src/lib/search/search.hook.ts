import { useCallback, useEffect } from 'react';
import { useProjectStore } from '~/lib/project';
import { useOpenFile } from '~/lib/window';
import { useSearchStore } from './search.store';
import { requestKey } from './search.service';
import { SEARCH_DEBOUNCE_MS } from './search.constant';
import { emptySearchResult } from '@shared/search.def';
import type {
  ReplaceResult,
  SearchFileResult,
  SearchMatch,
  SearchRequest,
} from '@shared/search.def';

/** The request the store currently describes. */
function currentRequest(): SearchRequest {
  const { query, options } = useSearchStore.getState();
  return { query, ...options };
}

/**
 * Whether an answer is still worth storing.
 *
 * Main drops a walk the moment a newer *query* starts, but it knows nothing
 * about a box that was cleared, a toggle that was flipped back, or a folder
 * that was closed while it read. Those leave a walk that nothing supersedes
 * and nobody wants, and without this check its results would land on screen
 * under a query that is no longer there.
 */
function stale(root: string, request: SearchRequest): boolean {
  const current = useProjectStore.getState().root;

  return requestKey(current, currentRequest()) !== requestKey(root, request);
}

/**
 * One walk of the project, start to finish.
 *
 * A module function rather than a hook because three different things start a
 * search — the debounce, the Enter key, and a replace that just changed the
 * files underneath the results — and all three want the same handling of the
 * answer. Setters are reached through `getState` so that none of this holds a
 * subscription.
 */
async function runSearch(root: string): Promise<void> {
  const request = currentRequest();
  if (!root || !request.query) return;

  useSearchStore.getState().setStatus('searching');

  try {
    const result = await window.frodon.search.query(request);

    // A newer query started while this one was walking, so these results
    // answer a question nobody is asking any more. The one that superseded it
    // is already on its way with the answer that counts.
    if (result.superseded || stale(root, request)) return;

    useSearchStore.getState().setResult(result, requestKey(root, request));
  } catch (cause) {
    if (stale(root, request)) return;

    const message = cause instanceof Error ? cause.message : String(cause);
    // The channel itself failed, which means main threw before the walk ever
    // started. Reported rather than left as a spinner that never stops.
    useSearchStore
      .getState()
      .setResult({ ...emptySearchResult(), error: message }, '');
  }
}

/**
 * Keeps the results in step with the query. Mount this ONCE, in the panel.
 *
 * The debounce lives here rather than in the input so that toggling case
 * sensitivity goes through it too — a toggle is a new query, and it has no
 * more business running on the same frame as the click than a keystroke does.
 */
export const useSearchRun = (): void => {
  const query = useSearchStore((state) => state.query);
  const options = useSearchStore((state) => state.options);
  const root = useProjectStore((state) => state.root);

  useEffect(() => {
    const store = useSearchStore.getState();

    if (!root || !query) {
      store.clearResult();
      return;
    }

    // Mounting the panel again after a trip to the explorer must not re-walk a
    // project for an answer already on screen.
    if (store.lastRun === requestKey(root, { query, ...options })) return;

    store.setStatus('searching');
    const timer = setTimeout(() => void runSearch(root), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, options, root]);
};

/** The query box: what is in it, how it is being interpreted, and the answer. */
export const useSearch = () => {
  const query = useSearchStore((state) => state.query);
  const setQuery = useSearchStore((state) => state.setQuery);
  const options = useSearchStore((state) => state.options);
  const toggleOption = useSearchStore((state) => state.toggleOption);
  const status = useSearchStore((state) => state.status);
  const result = useSearchStore((state) => state.result);
  const root = useProjectStore((state) => state.root);

  /**
   * Runs the query now, debounce and cache both bypassed. This is what Enter
   * is for: the files may have changed since the walk, and asking again is the
   * only way to find out.
   */
  const refresh = useCallback(() => void runSearch(root), [root]);

  return {
    query,
    setQuery,
    options,
    toggleOption,
    status,
    result,
    refresh,
    hasProject: root !== '',
  };
};

/** Just the results, for the list — which does not care what was typed. */
export const useSearchResults = () => {
  const result = useSearchStore((state) => state.result);
  const status = useSearchStore((state) => state.status);
  const collapsed = useSearchStore((state) => state.collapsed);
  const toggleCollapsed = useSearchStore((state) => state.toggleCollapsed);

  return { result, status, collapsed, toggleCollapsed };
};

/**
 * Rewriting matches on disk.
 *
 * `paths` is what separates the two buttons: empty means every file that
 * matches, one path means the file whose own replace button was clicked.
 * Either way the search is run again afterwards, because the files it
 * described are no longer the files on disk — and the watcher will not say so,
 * since replacing text inside a file changes no name in the tree.
 */
export const useReplace = () => {
  const replacement = useSearchStore((state) => state.replacement);
  const setReplacement = useSearchStore((state) => state.setReplacement);
  const replacing = useSearchStore((state) => state.replacing);
  const error = useSearchStore((state) => state.replaceError);
  const root = useProjectStore((state) => state.root);

  const replace = useCallback(
    async (paths: string[] = []): Promise<ReplaceResult | null> => {
      const store = useSearchStore.getState();
      if (!store.query || store.replacing) return null;

      store.setReplacing(true);
      store.setReplaceError(null);

      try {
        const result = await window.frodon.search.replace({
          ...currentRequest(),
          replacement: store.replacement,
          paths,
        });

        if (!result.ok) {
          useSearchStore
            .getState()
            .setReplaceError(result.error ?? 'The replacement failed.');
        }

        return result;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        useSearchStore.getState().setReplaceError(message);
        return null;
      } finally {
        useSearchStore.getState().setReplacing(false);
        await runSearch(root);
      }
    },
    [root]
  );

  return { replacement, setReplacement, replace, replacing, error };
};

/**
 * Opening a match where it was found.
 *
 * The panel hands the path to the window system exactly as the explorer does,
 * and adds the one thing a search result knows that a tree row doesn't: which
 * line to land on.
 */
export const useOpenMatch = () => {
  const openFile = useOpenFile();

  return useCallback(
    (file: SearchFileResult, match: SearchMatch) =>
      openFile(file.path, undefined, {
        line: match.line,
        column: match.column,
        length: match.length,
      }),
    [openFile]
  );
};
