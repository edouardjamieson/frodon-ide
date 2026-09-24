import { useMemo, useState } from 'react';
import { useProjectStore } from './project.store';
import Logger from '../logger/logger.service';
import { readFilesFromDir } from '../fs';
import os from 'os';

export const useProject = () => {
  const [loading, setLoading] = useState(true);
  const projectStore = useProjectStore();

  const isInit = useMemo(() => projectStore.path !== '', [projectStore.path]);

  const load = async () => {
    if (isInit) return;
    setLoading(true);

    const cwd = process.cwd();
    const files = readFilesFromDir(cwd);
    const projectName = cwd.split('/')[cwd.split('/').length - 1];
    projectStore.setProject(cwd, projectName ?? '', files);
    setLoading(false);
  };

  // Re-read the project tree from disk into the store. Unlike `load`, this
  // isn't guarded by `isInit` — it's how the explorer reflects files created,
  // renamed, or deleted after the initial load.
  const reload = () => {
    const cwd = projectStore.path || process.cwd();
    const files = readFilesFromDir(cwd);
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
