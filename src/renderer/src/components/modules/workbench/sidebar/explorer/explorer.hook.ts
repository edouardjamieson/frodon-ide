import { useCallback, useMemo } from 'react';
import { useProjectStore } from '~/lib/project';
import { useOpenFile, useWindowStore } from '~/lib/window';
import { describeDirectory, newEntryDirectory } from './explorer.service';
import { isAtOrUnder } from '@shared/fs.def';
import type { ExplorerActions } from './explorer.def';

/**
 * Everything a row, a context menu or a naming field can do.
 *
 * Deliberately one object built *once* at the top of the tree and threaded
 * down, rather than a hook each row calls: `Node` runs per visible file, and a
 * hook there would mean a subscription per row to state the row does not read
 * and a `newEntryDirectory` walk per row on every change. Same reason
 * `openPaths` and `gitByPath` are derived in `Explorer` and passed as props.
 *
 * Creating and renaming are two-step on purpose: the menu item decides only
 * *what* and *where*, and opens a field; the name arrives later and only then
 * does anything cross to main. That keeps the channels that take a typed name
 * narrow, and it is why the two commits hand an error message back instead of
 * throwing — a name already taken belongs under the field, with what you typed
 * still in it.
 */
export function useExplorerActions(): ExplorerActions {
  const root = useProjectStore((state) => state.root);
  const files = useProjectStore((state) => state.files);
  const selected = useProjectStore((state) => state.selected);
  const draft = useProjectStore((state) => state.draft);
  const startDraft = useProjectStore((state) => state.startDraft);
  const cancelDraft = useProjectStore((state) => state.cancelDraft);
  const select = useProjectStore((state) => state.select);
  const expand = useProjectStore((state) => state.expand);
  const startRename = useProjectStore((state) => state.startRename);
  const cancelRename = useProjectStore((state) => state.cancelRename);
  const rekey = useProjectStore((state) => state.rekey);
  const renameFileTab = useWindowStore((state) => state.renameFileTab);
  const closeFileTabs = useWindowStore((state) => state.closeFileTabs);
  const openFile = useOpenFile();

  /**
   * Opens a naming row for a new entry beside `target`.
   *
   * The toolbar passes the selection and the context menu passes the row it
   * was opened on. Those are usually the same path — the menu selects what it
   * opens on — but not always, and a menu item acting on something other than
   * the row you right-clicked would be a small betrayal.
   */
  const startEntry = useCallback(
    (target: string | null, isDir: boolean) =>
      startDraft(newEntryDirectory(files, target, root), isDir),
    [startDraft, files, root]
  );

  /** Resolves to an error to show, or null when the entry now exists. */
  const commitDraft = useCallback(
    async (entryName: string): Promise<string | null> => {
      if (!draft) return null;

      const result = draft.isDir
        ? await window.frodon.file.createDir(draft.parent, entryName)
        : await window.frodon.file.create(draft.parent, entryName);

      if (!result.ok || !result.path) {
        return result.error ?? 'That could not be created.';
      }

      cancelDraft();
      // Selected before the tree catches up: the watcher in main is debounced,
      // so the row itself arrives a moment later and finds itself already
      // picked — which also makes the next New file land beside this one.
      select(result.path);

      if (draft.isDir) expand(result.path);
      else openFile(result.path);

      return null;
    },
    [draft, cancelDraft, select, expand, openFile]
  );

  /**
   * Commits a rename. Same contract as `commitDraft`.
   *
   * What follows a successful one is the three places a path is used as a key
   * — the tabs, the expanded set, and the selection — and all three have to
   * move together, including for everything inside a renamed folder. Main
   * hands back the path it settled on rather than the renderer joining one, so
   * a name main trimmed is the name everything is re-keyed to.
   */
  const commitRename = useCallback(
    async (path: string, entryName: string): Promise<string | null> => {
      const result = await window.frodon.file.rename(path, entryName);

      if (!result.ok || !result.path) {
        return result.error ?? 'That could not be renamed.';
      }

      cancelRename();
      if (result.path !== path) {
        renameFileTab(path, result.path);
        rekey(path, result.path);
      }

      return null;
    },
    [cancelRename, renameFileTab, rekey]
  );

  /**
   * Deletes an entry, after main has asked whether to.
   *
   * Nothing is returned, because there is nothing for the caller to do with
   * it: a refusal is not a failure, and a failure has already been shown by
   * main in the same register as the question. What is left is the tabs — a
   * file in the Trash must not stay open as a tab that cannot read it, and
   * deleting a folder closes every tab beneath it.
   */
  const removeEntry = useCallback(
    async (path: string) => {
      const result = await window.frodon.file.remove(path);
      if (!result.deleted) return;

      closeFileTabs(path);
      // The tree arrives without it a moment later; the selection is dropped
      // now so that a New file in the meantime does not aim at a hole.
      if (selected && isAtOrUnder(selected, path)) select(null);
    },
    [closeFileTabs, select, selected]
  );

  // One identity for the whole set, so threading it down a few thousand rows
  // costs one prop comparison each rather than seven.
  return useMemo(
    () => ({
      startEntry,
      commitDraft,
      cancelDraft,
      startRename,
      commitRename,
      cancelRename,
      removeEntry,
    }),
    [
      startEntry,
      commitDraft,
      cancelDraft,
      startRename,
      commitRename,
      cancelRename,
      removeEntry,
    ]
  );
}

/**
 * The toolbar's four buttons, and the name of the folder two of them aim at.
 *
 * Separate from `useExplorerActions` because it is the one caller that needs
 * the *destination* rather than a way to reach one, and working it out means
 * walking the tree — which is fine once, for a toolbar, and not fine per row.
 */
export function useExplorerToolbar() {
  const root = useProjectStore((state) => state.root);
  const name = useProjectStore((state) => state.name);
  const files = useProjectStore((state) => state.files);
  const selected = useProjectStore((state) => state.selected);
  const expandAll = useProjectStore((state) => state.expandAll);
  const collapseAll = useProjectStore((state) => state.collapseAll);
  const { startEntry } = useExplorerActions();

  const directoryLabel = useMemo(
    () =>
      describeDirectory(newEntryDirectory(files, selected, root), root, name),
    [files, selected, root, name]
  );

  const newFile = useCallback(
    () => startEntry(selected, false),
    [startEntry, selected]
  );

  const newDirectory = useCallback(
    () => startEntry(selected, true),
    [startEntry, selected]
  );

  return { directoryLabel, newFile, newDirectory, expandAll, collapseAll };
}
