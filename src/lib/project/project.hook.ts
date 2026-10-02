import { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from './project.store';
import { readFilesFromDir, sameTree, watchDirectory } from '../fs';
import { createIgnoreMatcher } from '../ignore';
// Imported from the store directly rather than the `config` barrel: that
// barrel pulls in `config.hook`, which imports this module back.
import { useConfigStore } from '../config/config.store';
import os from 'os';

// Read at call time, not render time: the scan has to see whatever
// `files.exclude` resolved to, and a rescan can run long after mount.
const ignoreMatcher = () =>
  createIgnoreMatcher(useConfigStore.getState().config.files.exclude);

/**
 * Re-reads the project tree from disk into the store. Unlike `load`, this
 * isn't guarded by `isInit` — it's how the explorer reflects files created,
 * renamed, or deleted after the initial load, whether by Frodon itself or by
 * anything else touching the directory.
 *
 * Everything is read through `getState` rather than a hook, so a filesystem
 * watcher armed once can keep calling it without closing over a stale store.
 * A rescan that finds the same tree stores nothing, leaving the explorer's
 * rows untouched.
 */
export function syncProjectFiles(): void {
  const { path, setProject, files: current } = useProjectStore.getState();
  const root = path || process.cwd();
  const files = readFilesFromDir(root, ignoreMatcher());

  if (path && sameTree(current, files)) return;

  setProject(root, root.split('/').pop() ?? '', files);
}

export const useProject = () => {
  const [loading, setLoading] = useState(true);
  const projectStore = useProjectStore();

  const isInit = useMemo(() => projectStore.path !== '', [projectStore.path]);

  const load = async () => {
    if (isInit) return;
    setLoading(true);

    syncProjectFiles();
    setLoading(false);
  };

  const reload = syncProjectFiles;

  const project = useMemo(() => {
    if (!isInit) return null;
    return {
      name: projectStore.name,
      path: projectStore.path,
      files: projectStore.files,
    };
  }, [isInit, projectStore]);

  const shortPath = useMemo(() => {
    if (!project) return '';
    const homeDir = os.homedir();

    if (project.path.startsWith(homeDir)) {
      return `~${project.path.slice(homeDir.length)}`;
    }
    return project.path;
  }, [project]);

  return { load, reload, isInit, project, loading, shortPath };
};

/**
 * Keeps the project tree in sync with the disk by watching the project root,
 * so files and directories created, renamed, moved, or deleted outside Frodon
 * — in another terminal, by an AI agent — show up in the explorer on their
 * own. Mount this ONCE near the app root: each mount is its own recursive
 * watch and its own full-tree rescan on every change.
 */
export const useProjectSync = () => {
  const path = useProjectStore((s) => s.path);
  // Re-arm when the exclusions change: they decide both which events are
  // worth a rescan and what the rescan itself returns.
  const exclude = useConfigStore((s) => s.config.files.exclude);
  const excludeKey = exclude.join('\n');

  useEffect(() => {
    if (!path) return;
    return watchDirectory(path, syncProjectFiles, {
      isIgnored: ignoreMatcher(),
    });
    // `excludeKey` stands in for `exclude`, whose identity changes on every
    // config read even when the patterns don't.
  }, [path, excludeKey]);
};
