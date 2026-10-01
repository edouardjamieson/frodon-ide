import { useEffect, useMemo } from 'react';
import { dirname, join, relative } from 'node:path';
import type { File } from '~/lib/fs/fs.def';
import { useProject, useProjectStore } from '~/lib/project';
import { useGitStore } from '~/lib/git';
import {
  createDirectory,
  createFile,
  deletePath,
  renamePath,
  type FsResult,
} from '~/lib/fs';
import { triggerActions, ActionEvent } from '~/lib/actions';
import { useDialog } from '~/components/ui/dialog';
import { useExplorerStore } from './explorer.store';
import { useWindowManagerStore } from '~/lib/window/window.store';

export const useExplorer = () => {
  const { project } = useProject();
  const toggledDirs = useExplorerStore((s) => s.toggledDirs);
  const expandDirs = useExplorerStore((s) => s.expandDirs);
  const editorFiles = useWindowManagerStore((s) => s.editorFiles);

  // Keep the full path to every open file expanded in the tree, so an open
  // file is always visible where it lives (even after opening it via search).
  useEffect(() => {
    const root = project?.path;
    if (!root) return;

    const dirs = new Set<string>();
    for (const { file } of editorFiles) {
      const rel = relative(root, file);
      if (rel.startsWith('..')) continue; // outside the project tree
      const parts = rel.split('/');
      parts.pop(); // drop the filename, keep its ancestor dirs
      let cur = root;
      for (const part of parts) {
        cur = join(cur, part);
        dirs.add(cur);
      }
    }

    if (dirs.size > 0) expandDirs([...dirs]);
  }, [editorFiles, project?.path, expandDirs]);

  const maxDeepness = useMemo(() => {
    if (!project) return 0;

    let maxDeepness = 0;

    const traverseDeep = (files: File[], deep: number) => {
      files.forEach((f) => {
        maxDeepness = Math.max(maxDeepness, deep + 1);
        if (f.isDir && f.children && toggledDirs.includes(f.path))
          traverseDeep(f.children, deep + 1);
      });
    };

    traverseDeep(project.files, 0);

    return maxDeepness;
  }, [project?.files, toggledDirs]);

  return { maxDeepness };
};

/**
 * One row of the tree.
 *
 * Every subscription here is a selector that narrows to a boolean or a single
 * status, because this hook runs once per visible node: subscribing to whole
 * stores meant expanding one folder, focusing another window, or a git poll
 * finding a single changed file re-rendered every row in the explorer. With
 * selectors a row re-renders only when its own flags move. State that's only
 * read inside a handler is pulled from `getState` at click time, so it costs
 * no subscription at all.
 */
export const useExplorerNode = (file: File) => {
  const toggleDir = useExplorerStore((s) => s.toggleDir);
  const isToggled = useExplorerStore(
    (s) => file.isDir && s.toggledDirs.includes(file.path)
  );
  const isSelected = useExplorerStore((s) => s.selected?.path === file.path);

  const isFileOpened = useWindowManagerStore((s) =>
    s.editorFiles.some((f) => f.file === file.path)
  );

  const onMouseDown = () => {
    const { focusedWindowId, addWindowFile } = useWindowManagerStore.getState();
    useExplorerStore.getState().setSelected({
      path: file.path,
      isDir: file.isDir,
    });
    if (file.isDir) toggleDir(file.path);
    if (!file.isDir && focusedWindowId) {
      addWindowFile(focusedWindowId, file.path);
    }
  };

  const projectPath = useProjectStore((s) => s.path);

  // Git reports paths relative to the repo root (the project root the `git`
  // subprocess runs in), so that's the key into the store's status lookup.
  const relativePath = useMemo(() => {
    if (file.isDir || !projectPath) return null;
    return relative(projectPath, file.path);
  }, [file.isDir, file.path, projectPath]);

  // Mirror the git status bar: staged files read green, unstaged/untracked
  // read yellow.
  const gitStatus = useGitStore((s) =>
    relativePath ? (s.statusByPath.get(relativePath) ?? null) : null
  );

  return {
    isToggled,
    isSelected,
    toggleDir,
    onMouseDown,
    isFileOpened,
    gitStatus,
  };
};

/**
 * File/folder create, rename, and delete for the explorer toolbar. Each action
 * prompts through the shared dialog, mutates the disk, then reloads the project
 * tree so the change appears. New items land inside the selected folder (or the
 * selected file's folder, or the project root when nothing is selected).
 */
export const useExplorerActions = () => {
  const { project, reload } = useProject();
  const { selected, setSelected, expandDir } = useExplorerStore();
  const { openDialog } = useDialog();
  const { focusedWindowId, addWindowFile, editorFiles, closeWindowFile } =
    useWindowManagerStore();

  const root = project?.path ?? process.cwd();

  const baseDir = () => {
    if (!selected) return root;
    return selected.isDir ? selected.path : dirname(selected.path);
  };

  // A path relative to the project root, for display in dialogs.
  const relToRoot = (p: string) => relative(root, p) || '.';

  // The dialog's own submit tears itself down after `onSubmit` runs, so an
  // error dialog opened synchronously would be wiped immediately. Defer it.
  const notifyError = (message?: string) => {
    setTimeout(() => {
      openDialog({
        title: 'Something went wrong',
        description: message ?? 'The operation could not be completed.',
        disableCancel: true,
        submitText: 'Ok',
      });
    }, 0);
  };

  const guard = (result: FsResult) => {
    if (!result.ok) notifyError(result.error);
    return result.ok;
  };

  const newFile = () => {
    const dir = baseDir();
    openDialog({
      title: 'New file',
      description: `In ${relToRoot(dir)}`,
      withInput: true,
      inputPlaceholder: 'filename.ext',
      submitText: 'Create',
      onSubmit: (name) => {
        const trimmed = name?.trim();
        if (!trimmed) return;
        const target = join(dir, trimmed);
        if (!guard(createFile(target))) return;
        void triggerActions(ActionEvent.CREATE, { path: target });
        expandDir(dir);
        reload();
        setSelected({ path: target, isDir: false });
        if (focusedWindowId) addWindowFile(focusedWindowId, target);
      },
    });
  };

  const newFolder = () => {
    const dir = baseDir();
    openDialog({
      title: 'New folder',
      description: `In ${relToRoot(dir)}`,
      withInput: true,
      inputPlaceholder: 'folder-name',
      submitText: 'Create',
      onSubmit: (name) => {
        const trimmed = name?.trim();
        if (!trimmed) return;
        const target = join(dir, trimmed);
        if (!guard(createDirectory(target))) return;
        void triggerActions(ActionEvent.CREATE, { path: target });
        expandDir(dir);
        reload();
        setSelected({ path: target, isDir: true });
      },
    });
  };

  const rename = () => {
    if (!selected) return;
    const current = selected.path.split('/').pop() ?? '';
    openDialog({
      title: 'Rename',
      description: relToRoot(selected.path),
      withInput: true,
      inputDefaultValue: current,
      submitText: 'Rename',
      onSubmit: (name) => {
        const trimmed = name?.trim();
        if (!trimmed || trimmed === current) return;
        const target = join(dirname(selected.path), trimmed);
        if (!guard(renamePath(selected.path, target))) return;
        void triggerActions(ActionEvent.RENAME, {
          path: target,
          oldPath: selected.path,
        });
        // Re-point any open tabs from the old path (or old dir prefix) so they
        // don't dangle after the rename.
        editorFiles
          .filter(
            (f) =>
              f.file === selected.path ||
              f.file.startsWith(selected.path + '/')
          )
          .forEach((f) => {
            closeWindowFile(f.windowId, f.file);
            addWindowFile(f.windowId, f.file.replace(selected.path, target));
          });
        reload();
        setSelected({ path: target, isDir: selected.isDir });
      },
    });
  };

  const remove = () => {
    if (!selected) return;
    const { path, isDir } = selected;
    openDialog({
      title: `Delete ${isDir ? 'folder' : 'file'}`,
      description: `${relToRoot(path)} — this cannot be undone.`,
      submitText: 'Delete',
      onSubmit: () => {
        if (!guard(deletePath(path))) return;
        void triggerActions(ActionEvent.DELETE, { path });
        // Close any open tabs for the deleted file (or files under a deleted dir).
        editorFiles
          .filter((f) => f.file === path || f.file.startsWith(path + '/'))
          .forEach((f) => closeWindowFile(f.windowId, f.file));
        reload();
        setSelected(null);
      },
    });
  };

  return { newFile, newFolder, rename, remove, hasSelection: selected !== null };
};
