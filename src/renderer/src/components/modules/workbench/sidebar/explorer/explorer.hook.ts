import { useCallback, useMemo } from 'react';
import { useProjectStore } from '~/lib/project';
import { useOpenFile } from '~/lib/window';
import { describeDirectory, newEntryDirectory } from './explorer.service';

/**
 * The explorer's four toolbar actions, and the naming row two of them open.
 *
 * Creation is a two-step affair on purpose: the button only decides *where* —
 * from the selection — and opens a row in the tree; the name arrives later,
 * from the input, and only then does anything cross to main. That keeps the
 * one channel that takes a typed name narrow, and it is why `commitDraft`
 * hands an error message back rather than throwing: a name already taken is
 * something to show under the field, with what you typed still in it.
 */
export function useExplorerActions() {
  const root = useProjectStore((state) => state.root);
  const name = useProjectStore((state) => state.name);
  const files = useProjectStore((state) => state.files);
  const selected = useProjectStore((state) => state.selected);
  const draft = useProjectStore((state) => state.draft);
  const startDraft = useProjectStore((state) => state.startDraft);
  const cancelDraft = useProjectStore((state) => state.cancelDraft);
  const select = useProjectStore((state) => state.select);
  const expand = useProjectStore((state) => state.expand);
  const expandAll = useProjectStore((state) => state.expandAll);
  const collapseAll = useProjectStore((state) => state.collapseAll);
  const openFile = useOpenFile();

  const directory = useMemo(
    () => newEntryDirectory(files, selected, root),
    [files, selected, root]
  );

  const directoryLabel = useMemo(
    () => describeDirectory(directory, root, name),
    [directory, root, name]
  );

  const newFile = useCallback(
    () => startDraft(directory, false),
    [startDraft, directory]
  );

  const newDirectory = useCallback(
    () => startDraft(directory, true),
    [startDraft, directory]
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

  return {
    directoryLabel,
    newFile,
    newDirectory,
    expandAll,
    collapseAll,
    commitDraft,
    cancelDraft,
  };
}
