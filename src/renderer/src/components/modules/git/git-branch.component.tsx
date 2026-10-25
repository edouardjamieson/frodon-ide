import { useState, type FormEvent } from 'react';
import { Check, GitBranch, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { cn } from 'cn';
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui';
import { useBranchLabel, useGit, useGitStore, useIsWorktree } from '~/lib/git';

/**
 * The branch, and the three things worth doing to it from a title bar:
 * switch, create, fetch.
 *
 * Deliberately no history. The last commit used to be at the top of this
 * menu, which made it the only place in the app to see one — a dropdown that
 * closes when you look away is the wrong home for something you read. That
 * lives in the git window now, and this stays a switcher.
 *
 * The list is read when the menu opens rather than polled: branches change
 * when someone makes one, which is roughly never on the timescale of a
 * three-second tick, and a `git branch` per tick would double the cost of the
 * whole feature for a list nobody is looking at.
 */
export default function BranchMenu() {
  const label = useBranchLabel();
  const branches = useGitStore((state) => state.branches);
  const current = useGitStore((state) => state.status.branch);
  const upstream = useGitStore((state) => state.status.upstream);
  const { staged, untracked, unstaged } = useGitStore((state) => state.status);
  const changeSet = {
    staged: staged.length,
    dirty: unstaged.length + untracked.length,
  };

  const { checkout, createBranch, fetch, refreshBranches, operation } =
    useGit();
  const isWorktree = useIsWorktree();

  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const busy = operation !== null;

  const onOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (open) void refreshBranches();
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    const result = await createBranch(name);
    // Left open on failure, with the message already in the header's error
    // indicator and the name still in the field to fix.
    if (!result.ok) return;
    setCreating(false);
    setName('');
  };

  // A worktree holds one branch, and this control stops being a switcher in
  // one. Both of the things it would otherwise do move that branch: a
  // checkout is the obvious one, and `New branch…` is `checkout -b`, which
  // creates *and* switches. Either defeats the reason the window exists, and
  // git refuses half of them anyway — so does `main/git/`, because this is a
  // rule about the repository rather than about which buttons are drawn.
  //
  // **Fetch stays.** It is the one entry here that does not touch the working
  // tree — it moves remote-tracking refs in the object store both checkouts
  // share — and it is the only route to it in the app: the header's pull
  // button reports a `behind` count that nothing else refreshes. Dropping the
  // menu wholesale would have left a worktree window unable to learn it was
  // behind.
  if (isWorktree) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer gap-2"
                disabled={busy}
              >
                <GitBranch className="size-4 text-fg-muted" />
                <span className="text-xs font-semibold">{label}</span>
                <div className="flex items-center gap-1">
                  {changeSet.staged > 0 && (
                    <div className="w-[14px] h-[14px] rounded-sm text-[11px] font-bold text-git-staged border flex items-center justify-center border-git-staged bg-git-staged/40">
                      {changeSet.staged > 9 ? '9+' : changeSet.staged}
                    </div>
                  )}
                  {changeSet.dirty > 0 && (
                    <div className="w-[14px] h-[14px] rounded-sm text-[11px] font-bold text-git-changed border flex items-center justify-center border-git-changed bg-git-changed/40">
                      {changeSet.dirty > 9 ? '9+' : changeSet.dirty}
                    </div>
                  )}
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              This worktree holds {label} and cannot switch branches.
            </TooltipContent>
          </Tooltip>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-[11px] leading-relaxed text-fg-subtle">
            {upstream ? `Tracking ${upstream}` : 'No upstream'}
            <br />
            This worktree holds {label}. Switch branches in the window the
            repository is open in, or make another worktree.
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="cursor-pointer gap-2"
            disabled={busy}
            onSelect={() => void fetch()}
          >
            <RefreshCw className="size-3.5" />
            Fetch
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer gap-2"
            disabled={busy}
          >
            {operation === 'checkout' || operation === 'branch' ? (
              <LoaderCircle className="size-4 animate-spin text-fg-muted" />
            ) : (
              <GitBranch className="size-4 text-fg-muted" />
            )}
            <span className="text-xs font-semibold">{label}</span>
            <div className="flex items-center gap-1">
              {changeSet.staged > 0 && (
                <div className="w-[14px] h-[14px] rounded-sm text-[11px] font-bold text-git-staged border flex items-center justify-center border-git-staged bg-git-staged/30">
                  {changeSet.staged > 9 ? '9+' : changeSet.staged}
                </div>
              )}
              {changeSet.dirty > 0 && (
                <div className="w-[14px] h-[14px] rounded-sm text-[11px] font-bold text-git-changed border flex items-center justify-center border-git-changed bg-git-changed/30">
                  {changeSet.dirty > 9 ? '9+' : changeSet.dirty}
                </div>
              )}
            </div>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-[11px] text-fg-subtle">
            {upstream ? `Tracking ${upstream}` : 'No upstream'}
          </DropdownMenuLabel>

          {branches.map((branch) => (
            <DropdownMenuItem
              key={branch}
              disabled={busy}
              className="cursor-pointer gap-2"
              onSelect={() => void checkout(branch)}
            >
              <Check
                className={cn('size-3.5', {
                  'opacity-0': branch !== current,
                })}
              />
              <span className="truncate">{branch}</span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="cursor-pointer gap-2"
            disabled={busy}
            onSelect={(event) => {
              // The dialog has to outlive the menu, and letting the item
              // close it the usual way hands focus back to the trigger just
              // as the dialog is trying to take it.
              event.preventDefault();
              setMenuOpen(false);
              setCreating(true);
            }}
          >
            <Plus className="size-3.5" />
            New branch…
          </DropdownMenuItem>

          <DropdownMenuItem
            className="cursor-pointer gap-2"
            disabled={busy}
            onSelect={() => void fetch()}
          >
            <RefreshCw className="size-3.5" />
            Fetch
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={(event) => void onCreate(event)}>
            <DialogHeader>
              <DialogTitle>New branch</DialogTitle>
              <DialogDescription>
                Branches from {label} and checks it out.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 py-4">
              <Label htmlFor="branch-name">Name</Label>
              <Input
                id="branch-name"
                autoFocus
                spellCheck={false}
                autoComplete="off"
                value={name}
                placeholder="feature/terminals"
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || name.trim().length === 0}>
                {operation === 'branch' ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                Create branch
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
