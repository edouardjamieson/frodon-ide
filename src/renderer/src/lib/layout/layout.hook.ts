/**
 * Remembering how a project was left, and putting it back.
 *
 * The arrangement of the workbench is the one piece of presentation state
 * worth outliving the page. Everything else the renderer holds — which
 * directories are expanded, which pane has focus, which theme is on — is
 * cheap to redo. An arrangement is not: four tiles, a terminal, the file you
 * were reading and the one you were reading it against is a minute of
 * clicking, every morning, to get back to where you already were.
 *
 * So it crosses the boundary on the same terms as everything else that does:
 * main owns the file, this owns the view of it. Two halves, mounted
 * differently.
 *
 * **Restoring** is a step in opening a project, not an effect — it happens
 * once, in `openPath`, in the same tick as `setProject`, so the workbench
 * never renders a default arrangement on its way to the saved one.
 *
 * **Saving** is a subscription mounted once at the app shell, for the reason
 * the board autosave gives: an effect would run once per window showing the
 * workbench, and what is being watched is one store that every window shares.
 *
 * Neither half reaches for the project store, which is not an accident.
 * `lib/project` calls into this module to restore, so a dependency the other
 * way would be a cycle between two sibling features. `openRoot` below is
 * written by the one function that already knows which project the workbench
 * belongs to, which is the same function that opens it.
 */
import { useEffect } from 'react';
import { useWindowStore } from '~/lib/window';
import { useBrowserStore, type BrowserTab } from '~/lib/browser';
import { sameSnapshot, snapshotOf, windowsFrom } from './layout.service';
import { LAYOUT_SAVE_MS } from './layout.constant';
import type { LayoutSnapshot } from '@shared/layout.def';

/**
 * The project the workbench currently belongs to, and the last arrangement
 * written for it.
 *
 * Module-level rather than effect-local for two reasons. `applyProjectLayout`
 * has to seed them — a restore is not a change worth writing back, and
 * without that every project would be saved once on open to say exactly what
 * it already said. And they have to survive the double mount React does in
 * development, which an effect-local variable would not.
 */
let openRoot: string | null = null;
let saved: LayoutSnapshot | null = null;

/**
 * The arrangement a project was last left in, or null.
 *
 * Fetched rather than applied, because the caller wants to commit it in the
 * same tick as the tree. Null is every way there can fail to be one — see
 * `project:layout` — and all of them mean the workbench opens as it always
 * did.
 */
export async function fetchProjectLayout(
  root: string
): Promise<LayoutSnapshot | null> {
  try {
    return await window.frodon.project.layout(root);
  } catch (error) {
    console.error('layout: could not read the saved layout', error);
    return null;
  }
}

/**
 * Puts a fetched arrangement on screen, and marks the project as the one the
 * workbench is now showing. Synchronous; a null snapshot only does the
 * second half.
 *
 * Until this has been called nothing is saved at all, which is what keeps the
 * launcher — a page with a default window in a store and no project behind it
 * — from writing a layout for a project nobody opened.
 */
export function applyProjectLayout(
  root: string,
  snapshot: LayoutSnapshot | null
): void {
  openRoot = root;
  // Seeded whether or not there was anything to restore. A project with no
  // saved layout still starts out matching what is on disk — nothing — and
  // the first real change is what should write it.
  saved = snapshot;

  if (!snapshot) return;

  const { windows, focusedId, seeds } = windowsFrom(snapshot);

  // The browser store first, and not for tidiness: the window store write is
  // what mounts the views, and a view reads the page it opens on out of the
  // browser store as it creates its guest. Seeding afterwards would be
  // seeding a tab that has already started loading `about:blank`.
  useBrowserStore.getState().restoreTabs(seeds);
  useWindowStore.getState().restore(windows, focusedId);
}

/** Whether two tab maps differ in anything a layout would record. */
function tabsDiffer(
  a: Record<string, BrowserTab>,
  b: Record<string, BrowserTab>
): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const id of ids) {
    if (a[id]?.url !== b[id]?.url) return true;
    // Compared by value: the picker hands `setViewport` a fresh object every
    // time, so two identical sizes are two different references.
    if (a[id]?.viewport?.width !== b[id]?.viewport?.width) return true;
    if (a[id]?.viewport?.height !== b[id]?.viewport?.height) return true;
  }

  return false;
}

/**
 * Writes the arrangement down after it settles. Mount this ONCE near the app
 * root.
 *
 * Two guards, and both earn their place. The window store notifies on things
 * that are not layout — focus moves on every click inside a pane, a reveal is
 * parked and then consumed by the editor that honors it — and a `saveLayout`
 * for each would be a clone across the boundary and a write to a file in a
 * home directory every time someone clicked on a line of code. So the
 * subscription ignores changes that touched neither the windows nor the
 * focus, and the flush compares what it built against the last thing it sent.
 */
export const useLayoutSaveEffect = (): void => {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pendingRoot: string | null = null;

    const flush = () => {
      timer = null;
      const root = pendingRoot;
      pendingRoot = null;

      // Another project opened while the timer ran, so the windows on screen
      // are no longer the ones this was armed for. The change is dropped
      // rather than written under either root: the new project has already
      // restored its own arrangement, and overwriting that would be worse
      // than losing one split from the project that was closed.
      if (!root || root !== openRoot) return;

      const { windows, focusedId } = useWindowStore.getState();
      const snapshot = snapshotOf(
        windows,
        focusedId,
        useBrowserStore.getState().tabs
      );

      if (saved && sameSnapshot(saved, snapshot)) return;
      saved = snapshot;

      void window.frodon.project
        .saveLayout(root, snapshot)
        .catch((error: unknown) => console.error('layout: save failed', error));
    };

    /** Arms the write, if there is a project for it to belong to. */
    const arm = () => {
      // No project has been opened in this page yet: the launcher is on
      // screen and there is nothing a layout would belong to.
      if (!openRoot) return;

      pendingRoot = openRoot;

      // Restarted on every change, so closing four tabs in a row writes once
      // when the burst ends rather than four times while it runs.
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, LAYOUT_SAVE_MS);
    };

    const unsubscribeWindows = useWindowStore.subscribe((state, previous) => {
      if (
        state.windows === previous.windows &&
        state.focusedId === previous.focusedId
      ) {
        return;
      }

      arm();
    });

    /**
     * The second half of the browser's state lives in its own store, so
     * navigating a tab changes nothing the window store would notify about —
     * and a layout that remembers pages has to hear about it.
     *
     * This is the chattiest store in the app: a guest reports a title, a
     * loading flag and two history flags on every page, several times. So the
     * arming is gated on the two fields a layout actually records, which
     * leaves the timer untouched for everything else a page says about
     * itself.
     */
    const unsubscribeTabs = useBrowserStore.subscribe((state, previous) => {
      if (state.tabs === previous.tabs) return;
      if (!tabsDiffer(state.tabs, previous.tabs)) return;

      arm();
    });

    return () => {
      unsubscribeWindows();
      unsubscribeTabs();
      if (timer) clearTimeout(timer);
      // A reload during the countdown would otherwise lose the arrangement
      // that was waiting on it. Whether the call lands before the page goes
      // is not something the renderer can promise — but the alternative is
      // not trying.
      flush();
    };
  }, []);
};
