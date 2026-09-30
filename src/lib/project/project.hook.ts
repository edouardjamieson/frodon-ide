import { useMemo, useState } from 'react';
import { useProjectStore } from './project.store';
import Logger from '../logger/logger.service';
import { readFilesFromDir } from '../fs';
import { createIgnoreMatcher } from '../ignore';
// Imported from the store directly rather than the `config` barrel: that
// barrel pulls in `config.hook`, which imports this module back.
import { useConfigStore } from '../config/config.store';
import os from 'os';

export const useProject = () => {
  const [loading, setLoading] = useState(true);
  const projectStore = useProjectStore();

  const isInit = useMemo(() => projectStore.path !== '', [projectStore.path]);

  // Read at call time, not render time: the scan has to see whatever
  // `files.exclude` resolved to, and `reload` runs long after mount.
  const ignoreMatcher = () =>
    createIgnoreMatcher(useConfigStore.getState().config.files.exclude);

  const load = async () => {
    if (isInit) return;
    setLoading(true);

    const cwd = process.cwd();
    const files = readFilesFromDir(cwd, ignoreMatcher());
    const projectName = cwd.split('/')[cwd.split('/').length - 1];
    projectStore.setProject(cwd, projectName ?? '', files);
    setLoading(false);
  };

  // Re-read the project tree from disk into the store. Unlike `load`, this
  // isn't guarded by `isInit` — it's how the explorer reflects files created,
  // renamed, or deleted after the initial load.
  const reload = () => {
    const cwd = projectStore.path || process.cwd();
    const files = readFilesFromDir(cwd, ignoreMatcher());
    const projectName = cwd.split('/').pop() ?? '';
    projectStore.setProject(cwd, projectName, files);
  };

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
