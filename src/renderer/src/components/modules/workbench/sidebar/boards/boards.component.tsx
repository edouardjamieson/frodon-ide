import { cn } from 'cn';
import {
  FolderGit2,
  HardDrive,
  MoreHorizontal,
  PencilRuler,
  PlusIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  boardKey,
  type BoardScope,
  type BoardSummary,
} from '@shared/board.def';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ScrollArea,
  Tabs,
  TabsList,
  TabsTrigger,
} from '~/components/ui';
import { useBoards, useBoardsByScope } from '~/lib/board';
import {
  useCloseBoardTabs,
  useOpenBoard,
  useOpenBoardKeys,
  useRenameBoardTab,
} from '~/lib/window';

/**
 * Boards, in the sidebar.
 *
 * Two tabs, because a board has exactly two places it can live and the
 * difference matters enough to be a mode rather than a property you have to
 * open something to discover: a **project** board is in `.frodon/boards` and
 * is committed with the code it describes; a **local** board is in
 * `~/.frodon/boards` and belongs to the person, not the repository.
 *
 * The tab is the scope for everything in the panel at once — which boards are
 * listed, and which scope the new-board button writes into. That is what lets
 * creating a board be one click rather than a click and a menu: the question
 * "which of the two?" has already been answered, and it is answered somewhere
 * you can see without opening anything.
 *
 * Clicking a board does not open it *here*: it hands the key to the window
 * system, which routes it the same way the explorer routes a file. The panel
 * has no canvas of its own and no opinion about where a board lands.
 */
export default function Boards() {
  const { listing, error, create, rename, remove } = useBoards();
  const byScope = useBoardsByScope();
  const openBoard = useOpenBoard();
  const openKeys = useOpenBoardKeys();
  const renameTab = useRenameBoardTab();
  const closeTabs = useCloseBoardTabs();

  // The board scope (local / project). Local state rather than a store, the
  // same as the search panel's sub-module: it is which tab is showing, which
  // nothing outside this panel has any reason to know.
  const [scope, setScope] = useState<BoardScope>('project');
  /** The board whose name is being edited inline, by key. */
  const [renaming, setRenaming] = useState<string | null>(null);
  /** The board waiting on a delete confirmation. */
  const [deleting, setDeleting] = useState<BoardSummary | null>(null);

  const boards = byScope[scope];

  const onCreate = async () => {
    const ref = await create(scope);
    if (!ref) return;
    openBoard(boardKey(ref));
    // Straight into renaming it: a board called "Untitled board" is a board
    // you will have to come back and name, and the moment it is created is
    // the only moment you know what it is for.
    setRenaming(boardKey(ref));
  };

  const onRename = async (board: BoardSummary, name: string) => {
    setRenaming(null);
    if (name === board.name) return;

    const from = boardKey(board);
    const next = await rename(board, name);
    if (!next) return;

    // The tabs are made of the key, and the key is made of the name.
    renameTab(from, boardKey(next));
  };

  const onDelete = async (board: BoardSummary) => {
    // The tabs close first, before the file is touched. The confirmation has
    // already been given, and leaving the canvas up for the length of an IPC
    // round trip makes a decided action look like one that might not have
    // taken — on a board that is, by then, already unreadable.
    closeTabs(boardKey(board));
    await remove(board);
  };

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex w-full flex-col shrink-0 gap-2 border-b border-border p-2">
        <Tabs
          value={scope}
          onValueChange={(value) => setScope(value as BoardScope)}
          className="w-full shrink-0"
        >
          <TabsList className="w-full flex-1 gap-1">
            <TabsTrigger
              className="flex-1 cursor-pointer gap-1.5 text-xs"
              value="project"
            >
              <FolderGit2 className="size-3" />
              Project
            </TabsTrigger>
            <TabsTrigger
              className="flex-1 cursor-pointer gap-1.5 text-xs"
              value="local"
            >
              <HardDrive className="size-3" />
              Local
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center justify-between">
          {/* The count rather than the directory: the empty state already
              says where each scope writes, and it says it at the moment that
              is the only one where it matters. */}
          <span className="truncate font-mono text-[11px] text-fg-subtle">
            Boards ({boards.length})
          </span>
          <Button
            variant={'ghost'}
            size={'xs'}
            className="cursor-pointer"
            onClick={() => void onCreate()}
          >
            <PlusIcon />
            <span>New board</span>
          </Button>
        </div>
      </header>

      {error ? (
        <p className="shrink-0 px-3 py-2 text-[11px] text-fg-danger">{error}</p>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 p-1.5 pb-12">
          {/* `listing` is checked so that the empty state doesn't flash
              between the panel mounting and the first read coming back. */}
          {boards.length === 0 && !listing ? (
            <p className="px-1.5 py-6 text-center text-[11px] leading-relaxed text-fg-subtle">
              {scope === 'project' ? (
                <>
                  No boards in this project yet. A board is a canvas for
                  diagrams and notes; these live in <code>.frodon/boards</code>{' '}
                  and are committed with the code.
                </>
              ) : (
                <>
                  No local boards yet. These live in{' '}
                  <code>~/.frodon/boards</code> and follow you between projects
                  rather than belonging to one.
                </>
              )}
            </p>
          ) : null}

          {boards.map((board) => (
            <Row
              key={boardKey(board)}
              board={board}
              openKeys={openKeys}
              renaming={renaming}
              onOpen={openBoard}
              onStartRename={setRenaming}
              onRename={onRename}
              onCancelRename={() => setRenaming(null)}
              onDelete={setDeleting}
            />
          ))}
        </div>
      </ScrollArea>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>
              The file is removed from disk. A project board can be recovered
              from git if it was committed; a local one cannot.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const board = deleting;
                setDeleting(null);
                if (board) void onDelete(board);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface RowProps {
  board: BoardSummary;
  /** Every board open as a tab anywhere, derived once for the whole list. */
  openKeys: Set<string>;
  /** The key being renamed, or null. At most one row is a field at a time. */
  renaming: string | null;
  onOpen: (key: string) => void;
  onStartRename: (key: string) => void;
  onRename: (board: BoardSummary, name: string) => void;
  onCancelRename: () => void;
  onDelete: (board: BoardSummary) => void;
}

function Row({
  board,
  openKeys,
  renaming,
  onOpen,
  onStartRename,
  onRename,
  onCancelRename,
  onDelete,
}: RowProps) {
  const key = boardKey(board);
  const isOpen = openKeys.has(key);

  if (renaming === key) {
    return (
      <NameField
        initial={board.name}
        onCommit={(name) => onRename(board, name)}
        onCancel={onCancelRename}
      />
    );
  }

  return (
    <div
      onClick={() => onOpen(key)}
      onDoubleClick={() => onStartRename(key)}
      className={cn(
        'group/board flex cursor-pointer items-center gap-1.5 rounded-md py-[3px] pr-1 pl-2 text-[12px] transition-colors hover:bg-row-hover',
        isOpen ? 'bg-row-open text-fg' : 'text-explorer-file'
      )}
    >
      <PencilRuler className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{board.name}</span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Actions for ${board.name}`}
            onClick={(event) => event.stopPropagation()}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-fg-muted opacity-0 transition-opacity group-hover/board:opacity-100 data-[state=open]:opacity-100 hover:text-fg"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => onOpen(key)}>Open</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onStartRename(key)}>
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onDelete(board)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** The inline rename field. Commits on Enter or blur, abandons on Escape. */
function NameField({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(initial);
  /** Escape must not then be undone by the blur it causes. */
  const cancelled = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (cancelled.current) return;
        const name = value.trim();
        if (name) onCommit(name);
        else onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelled.current = true;
          onCancel();
        }
      }}
      className="mx-1 h-6 rounded-md border border-focus-ring bg-input-surface px-1.5 text-[12px] text-fg outline-none select-text"
    />
  );
}
