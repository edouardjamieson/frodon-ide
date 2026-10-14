import { useRef, useState, type ReactNode } from 'react';
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
  FolderPlus,
} from 'lucide-react';
import { cn } from 'cn';
import FileIcon from '~/components/utils/file-icon';
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui';
import { useExplorerActions } from './explorer.hook';

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
}: NodeProps) {
  const expanded = useProjectStore((state) => state.expanded);
  const toggleExpanded = useProjectStore((state) => state.toggleExpanded);
  const select = useProjectStore((state) => state.select);
  const openFile = useOpenFile();

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

  return (
    <>
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

      {file.isDir && isExpanded ? (
        <>
          {draft?.parent === file.path ? (
            <DraftRow key={draftKey(draft)} draft={draft} depth={depth + 1} />
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
            />
          ))}
        </>
      ) : null}
    </>
  );
}

/**
 * The row where a new file or folder is named.
 *
 * Drawn in the tree rather than in a dialog so that the answer to "where is
 * this going?" is the row's own position — indented under its parent, among
 * the files it will join. It sits at the top of that directory's children
 * instead of in sorted position: the entry does not exist yet, so there is
 * nothing to sort, and the moment it does the watcher replaces the whole tree
 * with one main sorted properly.
 *
 * Enter creates, Escape and blur abandon. Blur abandons rather than creates
 * because the alternative is a file appearing because you clicked somewhere
 * else — and an abandoned name costs one keystroke to retype, while an
 * unwanted file costs a trip to the terminal.
 */
function DraftRow({ draft, depth }: { draft: ProjectDraft; depth: number }) {
  const { commitDraft, cancelDraft } = useExplorerActions();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const commit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return cancelDraft();
    if (busy) return; // Enter held down, or pressed twice before main answered.

    setBusy(true);
    const failure = await commitDraft(trimmed);
    setBusy(false);

    // On success the draft is already gone and this component with it; only a
    // failure has anywhere to put its message.
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
        <FileIcon
          file={{ name, path: '', isDir: draft.isDir }}
          open={draft.isDir}
        />
        <input
          ref={input}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          value={name}
          // Read-only rather than disabled while main answers: disabling a
          // focused input blurs it, and the blur abandons the very draft
          // being created — taking the error message with it.
          readOnly={busy}
          placeholder={draft.isDir ? 'New folder' : 'New file'}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onBlur={() => {
            // Switching to another app blurs the field too, and losing a name
            // half-typed because you went to look something up is not what
            // abandoning on blur is for. The document keeps focus for any move
            // within the page, and loses it only when the window does.
            if (document.hasFocus()) cancelDraft();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancelDraft();
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
 * The toolbar's four buttons.
 *
 * Two of them act on the selection and two on the whole tree, which the
 * tooltips are there to make plain: "New file" alone would not say that it
 * means *in `src/lib`*, and the whole point of selecting a folder first is
 * that it does.
 */
function Toolbar() {
  const { directoryLabel, newFile, newDirectory, expandAll, collapseAll } =
    useExplorerActions();

  return (
    <div className="sticky top-0 z-10 mb-1 flex w-full items-center justify-end gap-0.5 border-b border-border bg-sidebar p-1">
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
          <DraftRow key={draftKey(draft)} draft={draft} depth={0} />
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
          />
        ))}
      </div>
    </div>
  );
}
