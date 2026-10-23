import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from './project.store';
import {
  resolveProjectColor,
  resolveProjectHue,
  resolveProjectIcon,
  resolveProjectName,
  shortenPath,
} from './project.service';
import { useAppInfo, useHome } from '~/lib/app';
import { applyProjectLayout, fetchProjectLayout } from '~/lib/layout';
import {
  applyProjectConfig,
  fetchProjectConfig,
  useConfigStore,
} from '~/lib/config';
import { useTheme, useThemeStore } from '~/lib/theme';

/**
 * Opening a project and keeping the tree live.
 *
 * The renderer holds a replica, not the truth: main owns the root, performs
 * the scan, and pushes a new tree whenever the watcher sees a real change.
 * This hook is the whole of the renderer's side of that arrangement.
 */
export const useProject = () => {
  const { root, files, setProject } = useProjectStore();
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
        const { files, identityRoot } = await window.frodon.project.tree(path);
        // After the tree and never beside it: `project:tree` is what tells
        // main which project is open, and both of these are answered for
        // whichever project that is — the layout has its board tabs pruned
        // against that project's boards, and the config is read out of that
        // project's own `.frodon/`.
        const [layout, config] = await Promise.all([
          fetchProjectLayout(path),
          fetchProjectConfig(),
        ]);

        // All three in one tick, and in this order. React batches the store
        // writes into a single render, so the workbench never flashes a
        // default arrangement on its way to the saved one and the header
        // never shows a folder name on its way to the chosen one — and both
        // save subscriptions read the root to decide what they are writing
        // for, so the root has to be the new one before either is seeded.
        setProject(path, identityRoot, files);
        applyProjectLayout(path, layout);
        applyProjectConfig(path, config);
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
  const { name, color, icon } = useProjectIdentity();

  return {
    root,
    shortPath,
    name,
    color,
    icon,
    files,
    open,
    openPath,
    opening,
    isOpen: root !== '',
  };
};

/**
 * What the project is called, what color it is, and what stands for it —
 * each one the choice in `.frodon/config.json` or, failing that, the
 * derivation.
 *
 * One hook for the three because they are one answer: the color is hashed
 * from the name and the icon is the first letter of it, so a component that
 * resolved them separately could draw a badge whose letter and hue came from
 * two different names for half a frame.
 */
export const useProjectIdentity = () => {
  // The identity root, not the project root. In a worktree those differ, and
  // every field below would otherwise be derived from a directory named after
  // a branch: a project called `web-browser`, a hue hashed from that string,
  // and an icon reading "W" — three wrong answers beside a window giving the
  // right ones for the same project.
  const root = useProjectStore((state) => state.identityRoot);
  const config = useConfigStore((state) => state.project);
  const dark = useTheme().dark;

  return useMemo(() => {
    const name = resolveProjectName(root, config);

    return {
      name,
      hue: resolveProjectHue(name, config),
      color: resolveProjectColor(name, config, dark),
      icon: resolveProjectIcon(name, config),
    };
  }, [root, config, dark]);
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
 * The project's color.
 *
 * Most components should reach for the `project` utility classes instead —
 * `useProjectColorEffect` keeps `--fd-project-color` current, so a badge is
 * `bg-project` with no JS in the paint path. This hook is for the same
 * exceptions `useTheme` exists for: handing a color to something that isn't
 * CSS.
 */
export const useProjectColor = (): string => useProjectIdentity().color;

/**
 * Hands the project's hue to the theme, and publishes its color to `:root` as
 * `--fd-project-color`. Mount this ONCE near the app root.
 *
 * Two writes of one fact, and they are not redundant. The hue goes into the
 * theme because the accent *is* the project's color — every focused border,
 * cursor and accent fill in the app is built from it, and that resolution
 * belongs to `lib/theme`, which owns how bright a color should be on this
 * background. The CSS variable is the same color by a different route, kept
 * because it is the one that can be *absent*: with no project open there is
 * no wash behind the workbench, and `var(--fd-project-color, transparent)` is
 * how the backdrop says so.
 */
export const useProjectColorEffect = (): void => {
  const root = useProjectStore((state) => state.root);
  const { hue, color } = useProjectIdentity();
  const setHue = useThemeStore((state) => state.setHue);

  // Null rather than the hue of the empty string: the launcher is not a
  // project with an unlucky color, it is no project, and the accent there is
  // grey for exactly that reason.
  useEffect(() => {
    setHue(root ? hue : null);
  }, [root, hue, setHue]);

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

/**
 * Opens the project this window was created for, if it was created for one.
 * Mount this ONCE near the app root.
 *
 * A window opened by `window:open` — from the New Window menu item, or later
 * from a worktree — is a whole second renderer with its own stores, and it
 * boots on the launcher like any other. `AppInfo.initialRoot` is how it finds
 * out it is not meant to stay there.
 *
 * It rides on the `app:info` call the renderer already makes first rather
 * than arriving as an event, which is what keeps it free of a race: there is
 * no gap between the page loading and a push landing for it to be missed in.
 *
 * Guarded by a ref rather than by the store's `root`, and the difference
 * matters: someone who opens a worktree window and then switches it to a
 * different project must not have it yanked back the next time this effect
 * re-runs. It is a fact about how the window *started*, acted on once.
 */
export const useInitialProjectEffect = (): void => {
  const info = useAppInfo();
  const { openPath } = useProject();
  const opened = useRef(false);

  useEffect(() => {
    const root = info?.initialRoot;
    if (!root || opened.current) return;

    opened.current = true;
    void openPath(root).catch((error: unknown) =>
      console.error(`project: could not open ${root}`, error)
    );
  }, [info, openPath]);
};
