import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useProjectStore, type ProjectDraft } from '~/lib/project';
import { useGitFileStatus } from '~/lib/git';
import { useActiveFilePath, useOpenFile, useOpenFilePaths } from '~/lib/window';
import type { File } from '@shared/fs.def';
import type { GitFileStatus } from '@shared/git.def';
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FilePlusCorner,
  FileStack,
  FolderPlus,
  Pencil,
  Trash,
} from 'lucide-react';
import { cn } from 'cn';
import FileIcon from '~/components/utils/file-icon';
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui';
import { useExplorerActions, useExplorerToolbar } from './explorer.hook';
import { useFilePickerStore } from '~/lib/file-picker';
import type { ExplorerActions } from './explorer.def';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '~/components/ui/context-menu';

/**
 * How a file's git state colors its name. Roles, not colors: a theme decides
 * what "changed" looks like, and the explorer never learns.
 */
const GIT_FG: Record<GitFileStatus, string> = {
  staged: 'text-git-staged',
  changed: 'text-git-changed',
  untracked: 'text-git-untracked',
  conflicted: 'text-git-conflicted',
};

/**
 * A draft's identity, used as its row's key.
 *
 * Asking for a folder while already naming a file would otherwise reuse the
 * same input, keeping the half-typed name and the icon for the wrong kind of
 * thing. A key that changes remounts it instead, which resets the field and
 * re-fires `autoFocus` — the state is per-draft, so it is the key's job to say
 * which draft it belongs to rather than an effect's to clear it.
 */
function draftKey(draft: ProjectDraft): string {
  return `${draft.isDir ? 'dir' : 'file'}:${draft.parent}`;
}

/** Indentation of a row at `depth`, in pixels. One place, two callers. */
function indent(depth: number): string {
  return `${depth * 12 + 8}px`;
}

interface NodeProps {
  file: File;
  depth: number;
  /** Every path open as a tab in any window, derived once — see `Explorer`. */
  openPaths: Set<string>;
  /** The tab on screen in the focused window, or null. */
  activePath: string | null;
  /** Git state by absolute path, derived once — see `Explorer`. */
  gitByPath: Map<string, GitFileStatus>;
  /** The row last clicked, which is where a new entry would go. */
  selected: string | null;
  /** The entry being named, or null. Rendered inside its parent directory. */
  draft: ProjectDraft | null;
  /** The path whose row is currently a field, or null. */
  renaming: string | null;
  /** Built once in `Explorer`; see `useExplorerActions` for why. */
  actions: ExplorerActions;
}

/**
 * The project tree.
 *
 * A direct descendant of the TUI's `ExplorerNode` — same recursive shape, same
 * expanded-by-path state — with the row drawn as a div instead of a box and
 * the disclosure arrow rotated by CSS rather than swapped for a different
 * glyph. Expansion state is keyed by absolute path so it survives a rescan
 * replacing the tree wholesale.
 *
 * Clicking a file does not open it *here*: it hands the path to the window
 * system, which routes it to a window that can host it. The explorer has no
 * opinion about where a file lands, and no editor of its own.
 */
function Node({
  file,
  depth,
  openPaths,
  activePath,
  gitByPath,
  selected,
  draft,
  renaming,
  actions,
}: NodeProps) {
  const expanded = useProjectStore((state) => state.expanded);
  const toggleExpanded = useProjectStore((state) => state.toggleExpanded);
  const select = useProjectStore((state) => state.select);
  const openFile = useOpenFile();
  const { startEntry, startRename, commitRename, cancelRename, removeEntry } =
    actions;

  const gitStatus = gitByPath.get(file.path);
  const isExpanded = expanded.has(file.path);
  const isActive = activePath === file.path;
  const isOpen = openPaths.has(file.path);
  const isSelected = selected === file.path;

  const onClick = () => {
    // Selection is the one thing every row does, file or folder: it is what
    // the toolbar reads to decide where a new entry goes.
    select(file.path);
    if (file.isDir) toggleExpanded(file.path);
    else openFile(file.path);
  };

  /**
   * What the chosen menu item will do, once the menu has let go of focus.
   *
   * A context menu is modal, so Radix traps focus inside it and only releases
   * the trap when the content unmounts. An item that opens a field therefore
   * cannot just open it: the field mounts, takes the caret, and the trap pulls
   * it straight back out — which is why typing went nowhere after New file.
   *
   * So the item parks the action instead of running it, and `onCloseAutoFocus`
   * — the one moment Radix hands focus back, and the moment the scope is gone
   * — runs it. Parking rather than deferring by a timer because the close is
   * animated: there is no interval to guess at, only an event that says when.
   */
  const pending = useRef<(() => void) | null>(null);

  const runPending = (event: Event) => {
    const action = pending.current;
    // Dismissed without choosing anything. Radix should put focus back on the
    // row, which is exactly where it was.
    if (!action) return;

    pending.current = null;
    // We are about to put focus somewhere of our own, and the row this would
    // restore it to may be about to stop existing.
    event.preventDefault();
    action();
  };

  return (
    <>
      {renaming === file.path ? (
        // The row *becomes* the field rather than growing one beside it, so
        // the name stays where it was and the tree does not reflow under the
        // pointer that just asked for this.
        <NameRow
          key={`rename:${file.path}`}
          depth={depth}
          isDir={file.isDir}
          initialName={file.name}
          onCommit={(name) => commitRename(file.path, name)}
          onCancel={cancelRename}
        />
      ) : (
        <ContextMenu
          onOpenChange={(open) => {
            if (open) select(file.path);
          }}
        >
          <ContextMenuTrigger asChild>
            <button
              onClick={onClick}
              // Indent with padding rather than a wrapper so the hover and selection
              // backgrounds still span the full width of the panel.
              style={{ paddingLeft: indent(depth) }}
              className={cn(
                'flex w-full shrink-0 items-center gap-1.5 rounded-md py-[3px] pr-2 text-left text-[12px] hover:bg-row-hover',
                // Three states, not two: open in some window, and open *and* being
                // looked at. Without the first, splitting the workbench in four
                // leaves no trace in the tree of what is where.
                isActive
                  ? 'bg-row-selected text-explorer-active'
                  : isOpen
                    ? 'bg-row-open text-explorer-active'
                    : 'text-explorer-file',
                // A ring rather than a fourth background, because this is the one
                // state that has to compose with the other three: a file can be
                // active *and* the place the next new file lands, and a folder has
                // no background of its own to say so with.
                isSelected && 'ring-1 ring-project/60 ring-inset'
              )}
            >
              <ChevronRight
                className={cn(
                  'size-3 shrink-0 inline-block text-neutral-500 transition-transform',
                  {
                    'opacity-0': !file.isDir,
                    'rotate-90': isExpanded,
                  }
                )}
              />
              <FileIcon file={file} open={isExpanded} />
              {/* No color of its own: the row above sets one for each of its three
            states, and git overrides it when it has something to say. */}
              {/* Nowrap rather than `truncate`: the panel scrolls now, so a long
            name is something to reach, not something to cut off. */}
              <span
                className={cn(
                  'whitespace-nowrap text-[12px]',
                  gitStatus && GIT_FG[gitStatus]
                )}
              >
                {file.name}
              </span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent onCloseAutoFocus={runPending}>
            <ContextMenuItem
              onSelect={() => {
                pending.current = () => startEntry(file.path, false);
              }}
            >
              <FilePlusCorner />
              <span>New file</span>
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                pending.current = () => startEntry(file.path, true);
              }}
            >
              <FolderPlus />
              <span>New folder</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => {
                pending.current = () => startRename(file.path);
              }}
            >
              <Pencil />
              <span>Rename</span>
            </ContextMenuItem>
            <ContextMenuItem
              // The variant colors the label and the icon from the theme's
              // danger role, which is what `text-red-500` was reaching for.
              variant="destructive"
              // Deferred like the rest: main's dialog wants the window's focus
              // and should not be racing the menu for it.
              onSelect={() => {
                pending.current = () => void removeEntry(file.path);
              }}
            >
              <Trash />
              <span>Delete</span>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}

      {file.isDir && isExpanded ? (
        <>
          {draft?.parent === file.path ? (
            <DraftRow
              key={draftKey(draft)}
              draft={draft}
              depth={depth + 1}
              actions={actions}
            />
          ) : null}
          {(file.children ?? []).map((child) => (
            <Node
              key={child.path}
              file={child}
              depth={depth + 1}
              openPaths={openPaths}
              activePath={activePath}
              gitByPath={gitByPath}
              selected={selected}
              draft={draft}
              renaming={renaming}
              actions={actions}
            />
          ))}
        </>
      ) : null}
    </>
  );
}

/**
 * The row where a file or folder is named, new or otherwise.
 *
 * One component for both jobs, because they are the same row: creating draws
 * it among a directory's children, renaming puts it where the existing row
 * was, and in each case the answer to "what is this going to be called, and
 * where?" is the field's own position in the tree. The caller supplies the
 * starting text and what to do with the result; everything else — the icon
 * that tracks the extension, the error under the field, the keys — is here.
 *
 * Enter commits, Escape and blur abandon. Blur abandons rather than commits
 * because the alternative is a file appearing, or a name changing, because you
 * clicked somewhere else — and retyping a name costs a keystroke, while an
 * unwanted file costs a trip to the terminal.
 */
function NameRow({
  depth,
  isDir,
  initialName,
  placeholder,
  onCommit,
  onCancel,
}: {
  depth: number;
  isDir: boolean;
  initialName: string;
  placeholder?: string;
  /** Resolves to an error to show, or null when it is done. */
  onCommit: (name: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  /**
   * Focuses on mount and selects the stem, not the extension — renaming
   * `editor.hook.ts` is almost always about the `editor`, and starting with
   * `.hook.ts` already selected would mean retyping it to keep it.
   *
   * A callback ref rather than an effect, so it runs once per mounted row
   * (each is keyed by what it is editing) instead of on every focus, which
   * would fight anyone who clicked into the middle of the text.
   */
  const mount = useCallback((node: HTMLInputElement | null) => {
    input.current = node;
    if (!node) return;

    node.focus();
    const dot = node.value.lastIndexOf('.');
    node.setSelectionRange(0, dot > 0 ? dot : node.value.length);
  }, []);

  const commit = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) return onCancel();
    if (busy) return; // Enter held down, or pressed twice before main answered.

    setBusy(true);
    const failure = await onCommit(trimmed);
    setBusy(false);

    // On success this row is already gone with the state that opened it; only
    // a failure has anywhere to put its message.
    if (failure) {
      setError(failure);
      input.current?.focus();
    }
  };

  return (
    <div
      style={{ paddingLeft: indent(depth) }}
      className="flex w-full shrink-0 flex-col py-[3px] pr-2"
    >
      <div className="flex items-center gap-1.5">
        {/* Where the disclosure arrow would be, so the icon and the field line
            up with every other row at this depth. */}
        <span className="size-3 shrink-0" />
        {/* Built from what has been typed so far, which means the icon settles
            into a TypeScript or a Markdown one as the extension appears. */}
        <FileIcon file={{ name, path: '', isDir }} open={isDir} />
        <input
          ref={mount}
          spellCheck={false}
          autoComplete="off"
          value={name}
          // Read-only rather than disabled while main answers: disabling a
          // focused input blurs it, and the blur abandons the very thing
          // being named — taking the error message with it.
          readOnly={busy}
          placeholder={placeholder}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onBlur={() => {
            // Switching to another app blurs the field too, and losing a name
            // half-typed because you went to look something up is not what
            // abandoning on blur is for. The document keeps focus for any move
            // within the page, and loses it only when the window does.
            if (document.hasFocus()) onCancel();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
            }
          }}
          className={cn(
            'min-w-0 flex-1 rounded-sm border bg-input-surface px-1 py-px text-[12px] text-fg outline-none placeholder:text-fg-subtle',
            error ? 'border-fg-danger' : 'border-project/60'
          )}
        />
      </div>

      {error ? (
        // Indented past the arrow and the icon so it reads as belonging to the
        // field rather than to the row below it.
        <span className="pl-[26px] pt-0.5 text-[11px] text-fg-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A `NameRow` for an entry that does not exist yet.
 *
 * It sits at the top of its directory's children rather than in sorted
 * position: there is nothing to sort yet, and the moment there is, the watcher
 * replaces the whole tree with one main sorted properly.
 */
function DraftRow({
  draft,
  depth,
  actions,
}: {
  draft: ProjectDraft;
  depth: number;
  actions: ExplorerActions;
}) {
  const { commitDraft, cancelDraft } = actions;

  return (
    <NameRow
      depth={depth}
      isDir={draft.isDir}
      initialName=""
      placeholder={draft.isDir ? 'New folder' : 'New file'}
      onCommit={commitDraft}
      onCancel={cancelDraft}
    />
  );
}

/**
 * The toolbar's four buttons.
 *
 * Two of them act on the selection and two on the whole tree, which the
 * tooltips are there to make plain: "New file" alone would not say that it
 * means *in `src/lib`*, and the whole point of selecting a folder first is
 * that it does.
 */
function Toolbar() {
  const { directoryLabel, newFile, newDirectory, expandAll, collapseAll } =
    useExplorerToolbar();
  // The one toolbar action that is not the explorer's: it opens the picker,
  // which lives above the whole workbench and routes to a window of its own.
  const openPicker = useFilePickerStore((state) => state.openPicker);

  return (
    <div className="sticky top-0 z-10 mb-1 flex w-full items-center justify-end gap-0.5 border-b border-border bg-sidebar p-1 shrink-0">
      <ToolbarButton label={`New file in ${directoryLabel}`} onClick={newFile}>
        <FilePlusCorner />
      </ToolbarButton>
      <ToolbarButton
        label={`New folder in ${directoryLabel}`}
        onClick={newDirectory}
      >
        <FolderPlus />
      </ToolbarButton>
      <ToolbarButton label="Collapse all" onClick={collapseAll}>
        <ChevronsDownUp />
      </ToolbarButton>
      <ToolbarButton label="Expand all" onClick={expandAll}>
        <ChevronsUpDown />
      </ToolbarButton>
      <ToolbarButton label="Open file" onClick={openPicker}>
        <FileStack />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          // Mouse *down*, not click: a naming row is open with focus in its
          // input, and the blur that abandons it would otherwise fire before
          // the click that started a new one.
          onMouseDown={(event) => {
            event.preventDefault();
            onClick();
          }}
          className="text-fg-muted hover:text-fg"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export default function Explorer({ files }: { files: File[] }) {
  // Derived once and threaded down, not asked per row: a tree of a few
  // thousand nodes would otherwise rebuild the same Set once per visible row
  // on every render. Git status is a Map for the same reason — one
  // subscription here, one lookup per row.
  const openPaths = useOpenFilePaths();
  const activePath = useActiveFilePath();
  const gitByPath = useGitFileStatus();
  const root = useProjectStore((state) => state.root);
  const selected = useProjectStore((state) => state.selected);
  const draft = useProjectStore((state) => state.draft);
  const renaming = useProjectStore((state) => state.renaming);
  const actions = useExplorerActions();

  // Keyed on the root rather than on the tree being non-empty: a project with
  // nothing in it yet is exactly when the New file button has work to do, and
  // hiding the toolbar until something exists would leave no way to make the
  // first thing.
  if (!root) return null;

  return (
    // Two elements, because one cannot do both jobs: the outer div scrolls,
    // the inner one is sized by its widest row. `w-max` is what makes the
    // horizontal scrollbar appear at all — a `w-full` column can never be
    // wider than the box it scrolls in, so deep trees used to truncate
    // instead. `min-w-full` keeps the rows spanning the panel when the tree
    // is narrower than it, so a hover or selection background still reaches
    // both edges. The scroller is a flex container so that Chromium keeps its
    // trailing padding at the far end of a horizontal scroll, which a block
    // one drops.
    <div className="flex h-full w-full flex-col overflow-auto pb-1.5">
      <Toolbar />
      <div className="flex w-max min-w-full flex-col px-1.5">
        {/* The root has no row of its own, so a draft destined for it is drawn
            here, above the top-level entries. */}
        {draft?.parent === root ? (
          <DraftRow
            key={draftKey(draft)}
            draft={draft}
            depth={0}
            actions={actions}
          />
        ) : null}
        {files.map((file) => (
          <Node
            key={file.path}
            file={file}
            depth={0}
            openPaths={openPaths}
            activePath={activePath}
            gitByPath={gitByPath}
            selected={selected}
            draft={draft}
            renaming={renaming}
            actions={actions}
          />
        ))}
      </div>
    </div>
  );
}
