import { useMemo } from 'react';
import { dirname, join, relative } from 'node:path';
import type { File } from '~/lib/fs/fs.def';
import { useProject } from '~/lib/project';
import {
  createDirectory,
  createFile,
  deletePath,
  renamePath,
  type FsResult,
} from '~/lib/fs';
import { useDialog } from '~/components/ui/dialog';
import { useExplorerStore } from './explorer.store';
import { useWindowManagerStore } from '~/lib/window/window.store';

export const useExplorer = () => {
  const { project } = useProject();
  const toggledDirs = useExplorerStore((s) => s.toggledDirs);

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

export const useExplorerNode = (file: File) => {
  const { toggledDirs, toggleDir, selected, setSelected } = useExplorerStore();
  const isToggled = file.isDir && toggledDirs.includes(file.path);
  const isSelected = selected?.path === file.path;

  const { focusedWindowId, addWindowFile, editorFiles } =
    useWindowManagerStore();

  const onMouseDown = () => {
    setSelected({ path: file.path, isDir: file.isDir });
    if (file.isDir) toggleDir(file.path);
    if (!file.isDir) {
      focusedWindowId && addWindowFile(focusedWindowId, file.path);
    }
  };

  const isFileOpened = useMemo(() => {
    return editorFiles.find((f) => f.file === file.path);
  }, [editorFiles]);

  return { isToggled, isSelected, toggleDir, onMouseDown, isFileOpened };
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
