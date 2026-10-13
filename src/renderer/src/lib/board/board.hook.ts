/**
 * The renderer's side of boards: loading one, saving it, listing them all.
 *
 * The division of labour is the one the rest of the app uses. Main owns the
 * files; the store holds a replica of whichever boards are open; these hooks
 * are the only thing that talks to the bridge.
 *
 * The one arrangement worth reading before changing anything: **saving is not
 * a React effect.** A session is keyed by board, not by window, so two windows
 * showing the same board would mount two copies of a save effect and write the
 * file twice on every stroke. `useBoardAutosaveEffect` is mounted once, at the
 * app shell, and watches the store directly.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  boardKey,
  emptyBoardDocument,
  parseBoardKey,
  type BoardRef,
  type BoardScope,
  type BoardSummary,
} from '@shared/board.def';
import { useProjectStore } from '~/lib/project';
import { useBoardStore } from './board.store';
import { AUTOSAVE_MS } from './board.constant';
import type { BoardSession, BoardStyle, BoardTool } from './board.def';

/* -------------------------------------------------------------------------
 * The list
 * ---------------------------------------------------------------------- */

/**
 * Every board on disk, and the operations that change the set of them.
 *
 * The list is re-read rather than patched after each mutation: it is a
 * handful of filenames, main is the authority on what is actually there, and
 * a locally-patched list is one more thing that can disagree with the disk.
 */
export const useBoards = () => {
  const boards = useBoardStore((state) => state.boards);
  const listing = useBoardStore((state) => state.listing);
  const setBoards = useBoardStore((state) => state.setBoards);
  const setListing = useBoardStore((state) => state.setListing);

  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setListing(true);
    try {
      setBoards(await window.frodon.board.list());
    } catch (cause) {
      console.error('board: listing failed', cause);
    } finally {
      setListing(false);
    }
  }, [setBoards, setListing]);

  const create = useCallback(
    async (scope: BoardScope, name?: string): Promise<BoardRef | null> => {
      const result = await window.frodon.board.create(scope, name);
      if (!result.ok || !result.ref) {
        setError(result.error ?? 'The board could not be created.');
        return null;
      }
      setError(null);
      await refresh();
      return result.ref;
    },
    [refresh]
  );

  const rename = useCallback(
    async (ref: BoardRef, name: string): Promise<BoardRef | null> => {
      // A rename re-keys the session, which means dropping the one that is
      // open. Anything drawn in the last `AUTOSAVE_MS` is still only in
      // memory, so it is written before the file moves out from under it.
      await saveBoard(boardKey(ref));

      const result = await window.frodon.board.rename(ref, name);
      if (!result.ok || !result.ref) {
        setError(result.error ?? 'The board could not be renamed.');
        return null;
      }
      setError(null);
      // The session is keyed by the old name and nothing is listening on the
      // new one yet, so it is dropped here. Whichever window held the board
      // re-opens it under its new key — see `renameBoard` in the window store.
      useBoardStore.getState().closeSession(boardKey(ref));
      await refresh();
      return result.ref;
    },
    [refresh]
  );

  const remove = useCallback(
    async (ref: BoardRef): Promise<boolean> => {
      const result = await window.frodon.board.remove(ref);
      if (!result.ok) {
        setError(result.error ?? 'The board could not be deleted.');
        return false;
      }
      setError(null);
      useBoardStore.getState().closeSession(boardKey(ref));
      await refresh();
      return true;
    },
    [refresh]
  );

  // Re-read when the panel mounts, and whenever the project tree moves. The
  // second is what keeps `.frodon/boards` honest without a watcher of its
  // own: a board created or deleted in the project is a change to the tree,
  // and main is already broadcasting those. Local boards are outside the
  // project and so are only re-read on a mutation or a remount, which is the
  // right trade for not watching a home directory.
  const files = useProjectStore((state) => state.files);
  useEffect(() => {
    void refresh();
  }, [refresh, files]);

  return { boards, listing, error, refresh, create, rename, remove };
};

/** The list split into its two sections, in the order the sidebar draws them. */
export const useBoardsByScope = (): Record<BoardScope, BoardSummary[]> => {
  const boards = useBoardStore((state) => state.boards);

  return useMemo(
    () => ({
      project: boards.filter((board) => board.scope === 'project'),
      local: boards.filter((board) => board.scope === 'local'),
    }),
    [boards]
  );
};

/* -------------------------------------------------------------------------
 * One board
 * ---------------------------------------------------------------------- */

/**
 * The session for a board, loading it on first use.
 *
 * Takes the *key* rather than a `BoardRef`, and parses it back inside. A ref
 * is an object, callers build one per render from the window's tab, and an
 * effect keyed on it would re-run on every frame. The string is the identity;
 * everything else is derived from it.
 *
 * Returns null while there is no board to show, which is what a board window
 * with no tab open is — not an error, just an empty frame.
 */
export const useBoardSession = (key: string): BoardSession | null => {
  const session = useBoardStore((state) => state.sessions[key] ?? null);

  useEffect(() => {
    const ref = parseBoardKey(key);
    if (!ref) return;

    const store = useBoardStore.getState();
    // The session existing is what says a read has been issued, so this is
    // both "another window already has it open" and "this effect already
    // ran". A second window adopts the session rather than reloading over
    // the top of unsaved strokes.
    if (store.sessions[key]) return;
    store.openSession(ref);

    // Deliberately not cancelled on cleanup. The obvious `let cancelled`
    // guard deadlocks: StrictMode runs the effect, tears it down and runs it
    // again, and the second pass finds the session already open and issues no
    // read — so a cancelled first read leaves the board loading forever.
    // There is nothing to cancel anyway. The write is keyed, and `patch`
    // drops it if the session has since closed.
    void window.frodon.board
      .read(ref)
      .then((document) => useBoardStore.getState().loaded(key, document))
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        useBoardStore.getState().failed(key, message);
      });
  }, [key]);

  return session;
};

/**
 * Writes a board immediately, outside the autosave schedule.
 *
 * What Cmd+S calls. The debounce exists so a pen stroke is one write rather
 * than sixty, not to make an explicit save wait for it.
 */
export async function saveBoard(key: string): Promise<void> {
  const store = useBoardStore.getState();
  const session = store.sessions[key];
  if (!session || session.status !== 'ready' || session.saving) return;

  const revision = session.revision;
  store.setSaving(key, true);

  try {
    const result = await window.frodon.board.write(session.ref, {
      ...emptyBoardDocument(),
      elements: session.elements,
    });

    if (!result.ok) {
      console.error('board: save failed', result.error);
      useBoardStore.getState().setSaving(key, false);
      return;
    }

    useBoardStore.getState().saved(key, revision);
  } catch (cause) {
    console.error('board: save failed', cause);
    useBoardStore.getState().setSaving(key, false);
  }
}

/**
 * The autosave loop. Mounted once, at the app shell.
 *
 * A subscription rather than an effect per board, because sessions are shared
 * between windows and an effect would run once per window showing the board —
 * two windows, two writes, both racing for the same file.
 *
 * One timer for all boards rather than one each: the work is proportional to
 * the number of *dirty* boards, which is almost always one, and a map of
 * timers keyed by board would be a second lifecycle to get wrong when a
 * session closes mid-countdown.
 */
export const useBoardAutosaveEffect = (): void => {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      const { sessions } = useBoardStore.getState();
      for (const [key, session] of Object.entries(sessions)) {
        if (session.dirty && !session.saving && session.status === 'ready') {
          void saveBoard(key);
        }
      }
    };

    const unsubscribe = useBoardStore.subscribe((state, previous) => {
      // Only a change to the documents themselves arms the timer. Panning,
      // selecting and switching tools all write to the store and none of them
      // is a reason to touch the disk.
      if (state.sessions === previous.sessions) return;

      const dirty = Object.values(state.sessions).some(
        (session) => session.dirty && !session.saving
      );
      if (!dirty) return;

      // Restarted on every change, so a continuous gesture writes once when it
      // ends rather than every `AUTOSAVE_MS` while it runs.
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, AUTOSAVE_MS);
    });

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      // A reload during a countdown would otherwise lose the strokes that
      // were waiting on it.
      flush();
    };
  }, []);
};

/* -------------------------------------------------------------------------
 * The toolbar
 * ---------------------------------------------------------------------- */

export const useBoardTool = (): [BoardTool, (tool: BoardTool) => void] => {
  const tool = useBoardStore((state) => state.tool);
  const setTool = useBoardStore((state) => state.setTool);
  return [tool, setTool];
};

export const useBoardStyle = (): [
  BoardStyle,
  (patch: Partial<BoardStyle>) => void,
] => {
  const style = useBoardStore((state) => state.style);
  const setStyle = useBoardStore((state) => state.setStyle);
  return [style, setStyle];
};

/** Whether a board has unwritten changes, for the dot in the tab. */
export const useBoardDirty = (key: string): boolean =>
  useBoardStore((state) => state.sessions[key]?.dirty ?? false);
