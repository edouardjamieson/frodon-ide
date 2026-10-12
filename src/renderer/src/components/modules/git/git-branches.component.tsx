import { cn } from 'cn';
import {
  ArrowDown,
  ArrowUp,
  Check,
  GitBranch,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui';
import { relativeTime, useGit, useGitBranches } from '~/lib/git';
import type { GitBranchInfo } from '@shared/git.def';

/**
 * Every local branch, measured twice.
 *
 * Against its **upstream**, which is the question "do I need to push or
 * pull", and against the **base branch**, which is the question "how far has
 * this diverged from main". They are different numbers and a UI that shows
 * only one of them is the reason people run `git log --oneline main..HEAD`
 * by hand.
 *
 * The behind-the-upstream column is only as current as the last fetch —
 * nothing here fetches on its own, for the same reason nothing else in the
 * app does: it is a network call on the user's behalf against a remote that
 * may want credentials.
 */
export default function GitBranches() {
  const { base, branches, loading, reload } = useGitBranches();
  const { checkout, fetch, operation } = useGit();

  const busy = operation !== null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-pane-border px-2 py-1.5">
        <span className="truncate text-[11px] text-fg-muted">
          {base ? (
            <>
              Compared against <span className="text-fg">{base}</span>
            </>
          ) : (
            'No base branch found'
          )}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => void fetch()}
            disabled={busy}
            className="cursor-pointer rounded-md px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:bg-project/20 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {operation === 'fetch' ? 'Fetching…' : 'Fetch'}
          </button>

          <button
            aria-label="Reload the branches"
            onClick={() => void reload()}
            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-project/20 hover:text-fg"
          >
            {loading ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {branches.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-[12px] text-fg-subtle">
          {loading ? 'Reading branches…' : 'No local branches.'}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden py-1">
          {branches.map((branch) => (
            <BranchRow
              key={branch.name}
              branch={branch}
              base={base}
              busy={busy}
              onCheckout={() => void checkout(branch.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BranchRow({
  branch,
  base,
  busy,
  onCheckout,
}: {
  branch: GitBranchInfo;
  base: string;
  busy: boolean;
  onCheckout: () => void;
}) {
  const isBase = branch.name === base;

  return (
    <div
      className={cn(
        'group/branch flex w-full items-center gap-4 px-2 py-1.5 text-left',
        branch.current && 'bg-row-open'
      )}
    >
      <div className="flex flex-col w-full">
        <div className="flex w-full min-w-0 items-center gap-1.5">
          {branch.current ? (
            <Check className="size-3.5 shrink-0 text-project" />
          ) : (
            <GitBranch className="size-3.5 shrink-0 text-fg-subtle" />
          )}

          <span
            className={cn(
              'truncate text-[12px]',
              branch.current ? 'font-medium text-fg' : 'text-fg-muted'
            )}
          >
            {branch.name}
          </span>

          {isBase ? (
            <span className="shrink-0 rounded bg-tab-inactive px-1 py-px text-[10px] leading-4 text-fg-subtle">
              base
            </span>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Against the upstream: what push and pull would move. */}
            <Counts
              ahead={branch.ahead}
              behind={branch.behind}
              label={
                branch.upstream
                  ? `${branch.ahead} ahead of and ${branch.behind} behind ${branch.upstream}`
                  : 'No upstream'
              }
              muted={!branch.upstream}
            />

            {/* Against the base: how far the branch has diverged. */}
            {base && !isBase ? (
              <Counts
                ahead={branch.aheadBase}
                behind={branch.behindBase}
                label={`${branch.aheadBase} ahead of and ${branch.behindBase} behind ${base}`}
                muted
              />
            ) : null}
          </div>
        </div>

        {branch.tip ? (
          <div className="flex w-full min-w-0 items-center gap-2 pl-5">
            <span className="truncate text-[11px] text-fg-subtle">
              {branch.tip.subject}
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-fg-subtle">
              {relativeTime(branch.tip.date)}
            </span>
          </div>
        ) : null}
      </div>

      {/* Checking out the branch you are on is a no-op git would happily
      perform; disabling it says so without spending a subprocess. */}
      {!branch.current && (
        <Button
          size={'xs'}
          variant={'outline'}
          disabled={busy}
          onClick={onCheckout}
          className="shrink-0 cursor-pointer"
        >
          Checkout
        </Button>
      )}
    </div>
  );
}

/**
 * An ahead/behind pair.
 *
 * Both zeros draw a dash rather than "0 0": a branch level with what it is
 * being compared to has nothing to say, and two zeros read as a number worth
 * checking.
 */
function Counts({
  ahead,
  behind,
  label,
  muted,
}: {
  ahead: number;
  behind: number;
  label: string;
  muted: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'flex items-center gap-1 font-mono text-[10px]',
            muted ? 'text-fg-subtle' : 'text-fg-muted'
          )}
        >
          {ahead === 0 && behind === 0 ? (
            <span className="opacity-50">—</span>
          ) : (
            <>
              {ahead > 0 ? (
                <span className="flex items-center">
                  <ArrowUp className="size-3" />
                  {ahead}
                </span>
              ) : null}
              {behind > 0 ? (
                <span className="flex items-center">
                  <ArrowDown className="size-3" />
                  {behind}
                </span>
              ) : null}
            </>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}
