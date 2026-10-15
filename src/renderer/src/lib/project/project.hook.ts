import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProjectStore } from './project.store';
import { projectColor, shortenPath } from './project.service';
import { useHome } from '~/lib/app';
import { applyProjectLayout, fetchProjectLayout } from '~/lib/layout';
import { useTheme } from '~/lib/theme';

/**
 * Opening a project and keeping the tree live.
 *
 * The renderer holds a replica, not the truth: main owns the root, performs
 * the scan, and pushes a new tree whenever the watcher sees a real change.
 * This hook is the whole of the renderer's side of that arrangement.
 */
export const useProject = () => {
  const { root, name, files, setProject } = useProjectStore();
  const [opening, setOpening] = useState(false);

  /**
   * Opens a root that is already known — a row in the launcher's recents.
   *
   * The whole of opening a project lives here, and `open` is the picker in
   * front of it. Main is the one that notices the difference: `project:tree`
   * is what records a recent and what grows the window, precisely so that
   * both happen whichever of these two was used.
   */
  const openPath = useCallback(
    async (path: string) => {
      setOpening(true);
      try {
        const tree = await window.frodon.project.tree(path);
        // After the tree and never beside it: `project:tree` is what tells
        // main which project is open, and main prunes a saved layout's board
        // tabs against that project's boards.
        const layout = await fetchProjectLayout(path);

        // Both in one tick, and in this order. React batches the two store
        // writes into a single render, so the workbench never flashes a
        // default arrangement on its way to the saved one — and the save
        // subscription reads the root to decide what it is writing for, so
        // the root has to be the new one before the windows are.
        setProject(path, tree);
        applyProjectLayout(path, layout);
      } finally {
        setOpening(false);
      }
    },
    [setProject]
  );

  const open = useCallback(async () => {
    const picked = await window.frodon.project.pick();
    if (!picked) return;
    await openPath(picked);
  }, [openPath]);

  const shortPath = useProjectShortPath();
  const color = useProjectColor();

  return {
    root,
    shortPath,
    name,
    color,
    files,
    open,
    openPath,
    opening,
    isOpen: root !== '',
  };
};

/**
 * The launcher's list of projects to go back to.
 *
 * Fetched on mount rather than kept current, because the only screen that
 * shows it is the one with no project open: by the time the list could go
 * stale, this hook has been unmounted by the project it opened. There is no
 * event channel for it for the same reason.
 */
export const useRecentProjects = () => {
  const recents = useProjectStore((state) => state.recents);
  const setRecents = useProjectStore((state) => state.setRecents);

  useEffect(() => {
    let cancelled = false;
    void window.frodon.project
      .recents()
      .then((list) => {
        if (!cancelled) setRecents(list);
      })
      .catch((error: unknown) =>
        console.error('project: recents failed', error)
      );

    return () => {
      cancelled = true;
    };
  }, [setRecents]);

  /**
   * Forgets one, and stores the list main answers with.
   *
   * Not an optimistic splice: main is the one holding the file, and taking
   * its answer is what keeps a failed write from leaving a row missing on
   * screen and present on disk.
   */
  const forget = useCallback(
    async (path: string) => {
      setRecents(await window.frodon.project.forgetRecent(path));
    },
    [setRecents]
  );

  return { recents, forget };
};

/**
 * The project root with the home directory folded to `~`, for display.
 *
 * Memoized on two values that change about twice a session, which is less
 * about the cost of the string work than about identity: a new string every
 * render would defeat `memo` on anything downstream that takes it as a prop.
 */
export const useProjectShortPath = (): string => {
  const root = useProjectStore((state) => state.root);
  const home = useHome();

  return useMemo(() => shortenPath(root, home), [root, home]);
};

/**
 * The project's generated color.
 *
 * Most components should reach for the `project` utility classes instead —
 * `useProjectColorEffect` keeps `--fd-project-color` current, so a badge is
 * `bg-project` with no JS in the paint path. This hook is for the same
 * exceptions `useTheme` exists for: handing a color to something that isn't
 * CSS.
 */
export const useProjectColor = (): string => {
  const name = useProjectStore((state) => state.name);
  const dark = useTheme().dark;

  return useMemo(() => projectColor(name, dark), [name, dark]);
};

/**
 * Publishes the project color to `:root` as `--fd-project-color`, next to the
 * theme's own variables and on the same terms: written once, read by CSS, and
 * re-rendering nothing when it changes. Mount this ONCE near the app root.
 */
export const useProjectColorEffect = (): void => {
  const root = useProjectStore((state) => state.root);
  const color = useProjectColor();

  useEffect(() => {
    const { style } = document.documentElement;

    // With no project open the property is removed rather than set to some
    // neutral, so `var(--fd-project-color, …)` falls through to each caller's
    // own fallback — which for the backdrop is `transparent`, i.e. no wash at
    // all. A nameless project still hashes to *a* hue; it just isn't one that
    // means anything.
    if (root) style.setProperty('--fd-project-color', color);
    else style.removeProperty('--fd-project-color');
  }, [root, color]);
};

/**
 * Subscribes to tree changes pushed from main, so files created, renamed, or
 * deleted outside Frodon — in a terminal, by an agent — reach the explorer on
 * their own. Mount this ONCE near the app root.
 */
export const useProjectSync = (): void => {
  const setFiles = useProjectStore((state) => state.setFiles);

  useEffect(() => window.frodon.project.onChanged(setFiles), [setFiles]);
};
