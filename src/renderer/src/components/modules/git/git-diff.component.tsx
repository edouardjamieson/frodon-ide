import { cn } from 'cn';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { MAX_DIFF_LINE, useGitDiff } from '~/lib/git';
import type { GitDiff, GitDiffLine } from '@shared/git.def';

/**
 * The selected file's patch.
 *
 * Rendered from lines main already parsed — the renderer never sees a unified
 * diff, the same way the search panel never sees a file's contents. What it
 * does here is purely presentational: two line-number gutters, a tint per
 * kind, and nothing clever about word-level changes, which is a feature this
 * does not have rather than one it does badly.
 *
 * There is a refresh button because one kind of staleness is unavoidable:
 * editing a file that git already considers modified changes nothing about
 * `git status`, so no snapshot arrives and nothing here knows to re-read.
 */
export default function GitDiff() {
  const { diff, loading, selected, staged, reload } = useGitDiff();

  if (!selected) {
    return (
      <p className="flex h-full items-center justify-center px-4 text-center text-[12px] text-fg-subtle">
        Pick a file to see what changed in it.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-pane-border px-2 py-1">
        <span className="truncate font-mono text-[11px] text-fg-muted">
          {selected}
        </span>
        <span className="shrink-0 text-[10px] text-fg-subtle">
          {staged ? 'staged' : 'working tree'}
        </span>

        {diff && !diff.binary ? (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
            <span className="text-git-added">+{diff.added}</span>
            <span className="text-git-removed">−{diff.removed}</span>
          </span>
        ) : (
          <span className="ml-auto" />
        )}

        <button
          aria-label="Reload the diff"
          onClick={() => void reload()}
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-fg-muted transition-colors hover:bg-project/20 hover:text-fg"
        >
          {loading ? (
            <LoaderCircle className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
        </button>
      </div>

      <DiffBody diff={diff} loading={loading} />
    </div>
  );
}

/**
 * The patch itself, or the one line that says why there isn't one.
 *
 * A separate component rather than a closure inside `GitDiff`: a function
 * declared in a render is a new component type on every render, which
 * remounts the whole scroll area — and with it the scroll position — every
 * time anything above it changes.
 */
function DiffBody({
  diff,
  loading,
}: {
  diff: GitDiff | null;
  loading: boolean;
}) {
  if (!diff) {
    return (
      <p className="flex flex-1 items-center justify-center text-[12px] text-fg-subtle">
        {loading ? 'Reading the diff…' : 'Nothing to show.'}
      </p>
    );
  }

  if (diff.binary) {
    return (
      <p className="flex flex-1 items-center justify-center text-[12px] text-fg-subtle">
        Binary file. Git has nothing to show line by line.
      </p>
    );
  }

  if (diff.lines.length === 0) {
    return (
      <p className="flex flex-1 items-center justify-center text-[12px] text-fg-subtle">
        No changes in this file.
      </p>
    );
  }

  return (
    // Same two-element trick the explorer uses: the outer box scrolls and the
    // inner one is sized by its longest line, so a wide hunk scrolls sideways
    // instead of wrapping into something unreadable.
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex w-max min-w-full flex-col font-mono text-[11px] leading-[18px]">
        {diff.lines.map((line, index) => (
          <DiffLine key={index} line={line} />
        ))}
      </div>
    </div>
  );
}

function DiffLine({ line }: { line: GitDiffLine }) {
  if (line.kind === 'hunk') {
    return (
      <div className="bg-tab-inactive px-2 text-fg-subtle select-none">
        {line.text}
      </div>
    );
  }

  if (line.kind === 'meta') {
    return <div className="px-2 text-fg-subtle italic">{line.text}</div>;
  }

  const added = line.kind === 'add';
  const removed = line.kind === 'remove';

  return (
    <div
      className={cn(
        'flex',
        added && 'bg-git-added/12',
        removed && 'bg-git-removed/12'
      )}
    >
      {/* Both gutters, so a line can be followed from one side to the other.
          `select-none` because copying a hunk should give back code, not code
          with line numbers glued to the front of it. */}
      <Gutter value={line.oldLine} />
      <Gutter value={line.newLine} />

      <span
        className={cn(
          'shrink-0 px-1 select-none',
          added && 'text-git-added',
          removed && 'text-git-removed',
          !added && !removed && 'text-transparent'
        )}
      >
        {added ? '+' : removed ? '-' : ' '}
      </span>

      <span
        className={cn(
          'whitespace-pre',
          added && 'text-git-added',
          removed && 'text-git-removed',
          !added && !removed && 'text-fg-muted'
        )}
      >
        {line.text.length > MAX_DIFF_LINE
          ? `${line.text.slice(0, MAX_DIFF_LINE)}…`
          : line.text}
      </span>
    </div>
  );
}

function Gutter({ value }: { value: number | null }) {
  return (
    <span className="w-10 shrink-0 pr-2 text-right text-line-number select-none">
      {value ?? ''}
    </span>
  );
}
