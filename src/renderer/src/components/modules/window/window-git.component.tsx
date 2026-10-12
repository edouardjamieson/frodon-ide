import { cn } from 'cn';
import { GitCommitVertical, GitBranch, ListChecks } from 'lucide-react';
import type { ReactNode } from 'react';
import { useGitWindow, type GitTab, type GitWindow } from '~/lib/window';
import { useChangeCount, useIsRepo } from '~/lib/git';
import { GitBranches, GitCommit, GitHistory } from '~/components/modules/git';

/**
 * The git module: three views of one repository, picked in the window header.
 *
 * The tab is on the window, not in the git store — it is where you are
 * looking rather than a fact about the repository, which is the same line the
 * editor's tabs and the terminal's sessions sit on.
 *
 * There is normally one of these: `openGit` focuses an existing git window
 * rather than spawning a second. Nothing breaks if a split makes another one,
 * though — both read the same store, and two windows showing the history and
 * the staging area at once is a reasonable thing to want.
 */
const TABS: { value: GitTab; label: string; icon: ReactNode }[] = [
  {
    value: 'history',
    label: 'History',
    icon: <GitCommitVertical className="size-3.5" />,
  },
  {
    value: 'branches',
    label: 'Branches',
    icon: <GitBranch className="size-3.5" />,
  },
  {
    value: 'commit',
    label: 'Commit',
    icon: <ListChecks className="size-3.5" />,
  },
];

export function GitWindowHeader({ window: win }: { window: GitWindow }) {
  const { tab, setTab } = useGitWindow(win);
  const changes = useChangeCount();

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto px-1.5 [scrollbar-width:none]">
      {TABS.map((entry) => {
        const isActive = entry.value === tab;

        return (
          <button
            key={entry.value}
            onMouseDown={() => setTab(entry.value)}
            className={cn(
              'flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors',
              isActive
                ? 'bg-tab-active text-fg'
                : 'text-fg-muted hover:bg-tab-inactive'
            )}
          >
            {entry.icon}
            <span>{entry.label}</span>

            {/* The one count worth carrying into the tab bar: how much is
                waiting to be committed. */}
            {entry.value === 'commit' && changes > 0 ? (
              <span className="rounded-full bg-project/50 px-1.5 text-[10px] font-bold text-fg">
                {changes > 99 ? '99+' : changes}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function GitWindowBody({ window: win }: { window: GitWindow }) {
  const inRepo = useIsRepo();

  // A folder that isn't a repository has no branch, no history and nothing to
  // commit. Three empty views would be a worse answer than one sentence.
  if (!inRepo) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-fg-subtle">
        This project is not in a git repository.
      </div>
    );
  }

  switch (win.tab) {
    case 'branches':
      return <GitBranches />;
    case 'commit':
      return <GitCommit />;
    default:
      return <GitHistory />;
  }
}
