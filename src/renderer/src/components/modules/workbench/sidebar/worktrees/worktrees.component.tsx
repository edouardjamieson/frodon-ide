import { cn } from 'cn';
import {
  AlertTriangle,
  GitBranch,
  Loader2,
  Lock,
  MoreHorizontal,
  PlusIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { worktreeSlug, type Worktree } from '@shared/worktree.def';
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
  Label,
  ScrollArea,
} from '~/components/ui';
import { BranchSelect } from '~/components/modules/git';
import { useGitStore } from '~/lib/git';
import {
  useCurrentWorktree,
  useWorktrees,
  useWorktreeSync,
} from '~/lib/worktree';

/**
 * Worktrees, in the sidebar.
 *
 * One repository checked out in more than one place. The row you are in is
 * marked; clicking another opens it in its own window, which is the whole
 * feature — two branches of one project on screen at once, with neither
 * checkout moving the other.
 *
 * The panel deliberately has no opinion about what a worktree *is*: the list
 * comes from `git worktree list`, so a worktree someone made in a terminal
 * appears here beside the ones Frodon made, and the only thing Frodon treats
 * differently is that it will not delete a directory it did not create.
 */
export default function Worktrees() {
  useWorktreeSync();

  const { worktrees, listing, creating, error, clearError, remove } =
    useWorktrees();
  const current = useCurrentWorktree();

  // The repository's own checkout is in git's listing — it is one of the
  // working trees — and is deliberately not in this panel. It is the project
  // you opened, not a worktree *of* it, and a row for it would be the one
  // entry here that cannot be created, removed or reasoned about like the
  // others. `worktrees` keeps it so the empty states can tell "not a
  // repository" from "a repository with no worktrees yet".
  const linked = useMemo(
    () => worktrees.filter((worktree) => !worktree.main),
    [worktrees]
  );

  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<Worktree | null>(null);

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex w-full shrink-0 items-center justify-between gap-2 border-b border-border p-2">
        <span className="truncate font-mono text-[11px] text-fg-subtle">
          Worktrees ({linked.length})
        </span>
        <Button
          variant={'ghost'}
          size={'xs'}
          className="cursor-pointer"
          disabled={creating !== null}
          onClick={() => setOpen(true)}
        >
          <PlusIcon />
          <span>New worktree</span>
        </Button>
      </header>

      {error ? (
        <p
          onClick={clearError}
          className="shrink-0 cursor-pointer px-3 py-2 text-[11px] leading-relaxed text-fg-danger"
        >
          {error}
        </p>
      ) : null}

      {/* Named rather than a bare spinner: the slow half of creating a
          worktree is copying a node_modules, and a progress indicator that
          does not say what it is working on is one you cannot tell apart
          from a hung window. */}
      {creating ? (
        <p className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-[11px] text-fg-muted">
          <Loader2 className="size-3 animate-spin" />
          Creating {creating} and copying its ignored files…
        </p>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 p-1.5">
          {linked.length === 0 && !listing ? (
            <p className="px-1.5 py-6 text-center text-[11px] leading-relaxed text-fg-subtle">
              {worktrees.length === 0 ? (
                'This project is not a git repository, so it has no worktrees.'
              ) : (
                <>
                  No worktrees yet. One is a second checkout of this repository
                  on its own branch, in its own window — and nothing about the
                  checkout you are in now changes.
                </>
              )}
            </p>
          ) : null}

          {linked.map((worktree) => (
            <Row
              key={worktree.path}
              worktree={worktree}
              isCurrent={current?.path === worktree.path}
              onRemove={setRemoving}
            />
          ))}
        </div>
      </ScrollArea>

      <CreateDialog open={open} onOpenChange={setOpen} />

      {/* The real confirmation is a native dialog from main — it is the one
          that knows what is about to be deleted. This one exists because a
          destructive menu item that opens an OS dialog with no warning of
          its own reads as a misclick. */}
      <Dialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Remove the worktree for “{removing?.branch || 'this checkout'}”?
            </DialogTitle>
            <DialogDescription>
              The directory goes, along with the <code>node_modules</code> and{' '}
              <code>.env</code> carried into it. The branch and its commits stay
              — they live in the repository, not in this directory.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const target = removing;
                setRemoving(null);
                if (target) void remove(target.path);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({
  worktree,
  isCurrent,
  onRemove,
}: {
  worktree: Worktree;
  isCurrent: boolean;
  onRemove: (worktree: Worktree) => void;
}) {
  const label = worktree.detached
    ? `detached at ${worktree.head.slice(0, 7)}`
    : worktree.branch;

  // Opening is `window:open`, which focuses an existing window rather than
  // making a second one — so clicking the row you are already in brings you
  // back to it rather than doing nothing.
  const onOpen = () => {
    if (worktree.prunable) return;
    void window.frodon.window.open(worktree.path);
  };

  return (
    <div
      onClick={onOpen}
      className={cn(
        'group/wt flex items-center gap-1.5 rounded-md py-[3px] pr-1 pl-2 text-[12px] transition-colors',
        worktree.prunable
          ? 'cursor-default opacity-50'
          : 'cursor-pointer hover:bg-row-hover',
        isCurrent ? 'bg-row-open text-fg' : 'text-explorer-file'
      )}
    >
      <GitBranch className="size-3.5 shrink-0" />

      <span className="min-w-0 flex-1 truncate">{label}</span>

      {worktree.locked ? (
        <Lock className="size-3 shrink-0 text-fg-subtle" />
      ) : null}
      {worktree.prunable ? (
        <AlertTriangle className="size-3 shrink-0 text-fg-danger" />
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Actions for ${label}`}
            onClick={(event) => event.stopPropagation()}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-fg-muted opacity-0 transition-opacity group-hover/wt:opacity-100 data-[state=open]:opacity-100 hover:text-fg"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={onOpen} disabled={worktree.prunable}>
            Open in a window
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onRemove(worktree)}
          >
            {worktree.prunable ? 'Prune' : 'Remove'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * One branch field that does both jobs.
 *
 * Type a name: if it is a branch that exists, the worktree checks it out and
 * there is nothing to start from — that is the "review someone's branch"
 * case. If it does not exist, it is a new branch and the base matters, so
 * **Start from** appears. One field rather than a mode switch, because the
 * thing a person has in mind is a branch name either way, and which of the
 * two cases they are in is a fact about the repository rather than a choice
 * to make them express.
 *
 * Main decides this again, from its own branch list, before acting. This is
 * the half that only has to be right enough to label a field.
 */
function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open, which is what resets the fields: an
            effect that cleared them on `open` would be setting state from an
            effect body to do what unmounting already does. */}
        {open ? <CreateForm onOpenChange={onOpenChange} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  // `BranchSelect` refreshes the list itself when it mounts; this is only
  // read to tell a branch that exists from a name being invented.
  const branches = useGitStore((state) => state.branches);
  const { worktrees, create, creating } = useWorktrees();

  /**
   * The branches a worktree cannot be made on: the ones already checked out.
   *
   * Git refuses these — `'main' is already used by worktree at …` — and the
   * repository's own checkout is in that list, which is why the branch you
   * are sitting on is never offered here. Better to leave them out than to
   * offer a row whose only outcome is an error.
   *
   * Only the **branch** field gets this. A start point has no such
   * restriction: branching off `main` while `main` is checked out is the
   * ordinary case, and the overwhelmingly common one.
   */
  const checkedOut = useMemo(
    () =>
      worktrees
        .filter((worktree) => !worktree.detached && worktree.branch)
        .map((worktree) => worktree.branch),
    [worktrees]
  );

  const [branch, setBranch] = useState('');
  /** The base, once it has been picked. Null until then — see `startPoint`. */
  const [chosen, setChosen] = useState<string | null>(null);

  const name = branch.trim();
  const isExisting = useMemo(() => branches.includes(name), [branches, name]);

  // Derived rather than stored, because the default depends on a list that
  // arrives a round trip after this mounts — storing it would mean writing
  // state from an effect every time the list moved. `listBranches` sorts the
  // current branch first, which is the overwhelmingly common answer to
  // "where should this start". A chosen base that is no longer a branch falls
  // back to the same default rather than submitting something git will reject.
  const startPoint =
    chosen && branches.includes(chosen) ? chosen : (branches[0] ?? '');

  const canCreate = name.length > 0 && creating === null;

  const onSubmit = async () => {
    if (!canCreate) return;
    const ok = await create({
      branch: name,
      ...(isExisting ? {} : { startPoint }),
    });
    // Left open on failure, with the error in the panel behind it — the
    // branch that was typed is the thing you need to edit, and a dialog that
    // closes takes it with it.
    if (ok) onOpenChange(false);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>New worktree</DialogTitle>
        <DialogDescription>
          A second checkout of this repository, on its own branch, in its own
          window. Nothing about the checkout you are in now changes.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="worktree-branch">Branch</Label>
          {/* Pick one, or type a name nothing matches and create it. The
              same control does the start point below, without the second
              half — a base has to be a branch that exists. */}
          <BranchSelect
            id="worktree-branch"
            value={branch}
            onChange={setBranch}
            allowNew
            autoFocus
            exclude={checkedOut}
            excludeReason={(name) =>
              `“${name}” is already checked out, so it cannot be put in a second worktree.`
            }
            placeholder="Pick a branch, or type a new name"
          />
          <p className="text-[11px] text-fg-subtle">
            {name === ''
              ? 'An existing branch is checked out; a new one is created.'
              : isExisting
                ? 'Checks out this existing branch.'
                : 'Creates this branch.'}
          </p>
        </div>

        {name !== '' && !isExisting ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="worktree-start">Start from</Label>
            <BranchSelect
              id="worktree-start"
              value={startPoint}
              onChange={setChosen}
              placeholder="Filter branches"
            />
          </div>
        ) : null}

        {name !== '' ? (
          <p className="truncate font-mono text-[10px] text-fg-subtle">
            ~/.frodon/worktrees/…/{worktreeSlug(name)}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={!canCreate} onClick={() => void onSubmit()}>
          {creating ? 'Creating…' : 'Create'}
        </Button>
      </DialogFooter>
    </>
  );
}
