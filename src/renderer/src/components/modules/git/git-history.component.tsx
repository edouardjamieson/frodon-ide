import { useMemo } from 'react';
import { cn } from 'cn';
import { GitBranch, LoaderCircle, RefreshCw } from 'lucide-react';
import {
  buildGraph,
  relativeTime,
  useGitLog,
  useGitStore,
  ROW_HEIGHT,
  type GraphRow,
} from '~/lib/git';
import GitGraph from './git-graph.component';
import type { GitLogRequest } from '@shared/git.def';

const SCOPES: { value: GitLogRequest['scope']; label: string }[] = [
  { value: 'branch', label: 'This branch' },
  { value: 'all', label: 'All branches' },
];

/**
 * The history, as a graph.
 *
 * `branch` scope walks HEAD *and* the base branch, which is the whole point:
 * the fork is on screen, so "what is on my branch that is not on main" is
 * something you read rather than something you compute. `all` is for the
 * times you are looking for a commit rather than at your own work.
 *
 * The laning is a `useMemo` over the commits, so it reruns when a commit
 * lands and not when the working tree changes under it — and `useGitLog`
 * makes sure the commits themselves are only re-read when HEAD moves.
 */
export default function GitHistory() {
  const { commits, loading, scope, setScope, reload } = useGitLog();
  const graph = useMemo(() => buildGraph(commits), [commits]);
  const branch = useGitStore((state) => state.status.branch);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-pane-border px-2 py-1.5">
        <GitBranch className="size-3.5 shrink-0 text-fg-muted" />
        <span className="truncate text-[11px] font-medium">
          {branch || 'detached'}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {SCOPES.map((option) => (
            <button
              key={option.value}
              onClick={() => setScope(option.value)}
              className={cn(
                'cursor-pointer rounded-md px-2 py-0.5 text-[11px] transition-colors',
                scope === option.value
                  ? 'bg-project/80 text-fg'
                  : 'text-fg-muted hover:bg-project/20'
              )}
            >
              {option.label}
            </button>
          ))}

          <button
            aria-label="Reload the history"
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

      {commits.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-[12px] text-fg-subtle">
          {loading ? 'Reading the history…' : 'No commits yet.'}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden py-1">
          {graph.rows.map((row) => (
            <CommitRow key={row.commit.sha} row={row} lanes={graph.lanes} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One commit: its lines, its refs, its subject, and who wrote it when.
 *
 * The row is pinned to `ROW_HEIGHT` because the graph beside it is drawn at
 * that height — a subject allowed to wrap would pull the text out of line
 * with the dot it belongs to. Truncation is the right trade here anyway: a
 * commit subject that does not fit on one line has already failed.
 */
function CommitRow({ row, lanes }: { row: GraphRow; lanes: number }) {
  const { commit } = row;

  return (
    <div
      style={{ height: ROW_HEIGHT }}
      title={`${commit.shortSha}  ${commit.subject}`}
      className="group/commit flex items-center gap-2 px-2 transition-colors hover:bg-row-hover"
    >
      <GitGraph row={row} lanes={lanes} />

      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {commit.refs.map((ref) => (
          <RefChip key={ref} name={ref} />
        ))}
        <span className="truncate text-[12px] text-fg">{commit.subject}</span>
      </div>

      <span className="hidden max-w-[110px] shrink-0 truncate text-[11px] text-fg-subtle sm:inline">
        {commit.author}
      </span>
      <span className="shrink-0 text-[11px] text-fg-subtle">
        {relativeTime(commit.date)}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-fg-muted">
        {commit.shortSha}
      </span>
    </div>
  );
}

/**
 * A branch or tag pointing at this commit.
 *
 * `HEAD` is drawn in the project color, the rest neutral — it is the one
 * decoration that answers "where am I", and the same color the focused pane
 * and the current lane use.
 */
function RefChip({ name }: { name: string }) {
  const isHead = name === 'HEAD';

  return (
    <span
      className={cn(
        'shrink-0 rounded px-1 py-px text-[10px] leading-4 font-medium',
        isHead ? 'bg-project/70 text-fg' : 'bg-tab-inactive text-fg-muted'
      )}
    >
      {name}
    </span>
  );
}
