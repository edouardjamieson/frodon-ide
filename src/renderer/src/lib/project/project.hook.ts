import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProjectStore } from './project.store';
import { projectColor, shortenPath } from './project.service';
import { useHome } from '~/lib/app';
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

  const open = useCallback(async () => {
    setOpening(true);
    try {
      const picked = await window.frodon.project.pick();
      if (!picked) return;
      const tree = await window.frodon.project.tree(picked);
      setProject(picked, tree);
    } finally {
      setOpening(false);
    }
  }, [setProject]);

  const shortPath = useProjectShortPath();
  const color = useProjectColor();

  return {
    root,
    shortPath,
    name,
    color,
    files,
    open,
    opening,
    isOpen: root !== '',
  };
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
