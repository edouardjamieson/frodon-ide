import type { ComponentType, ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  FolderGit2,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui';
import { useGit, useGitStore, useIsRepo } from '~/lib/git';
import { useHasGitWindow, useOpenGit } from '~/lib/window';
import BranchMenu from './git-branch.component';

/**
 * The git cluster in the header: the repository, pull, push, and the branch.
 *
 * It draws nothing at all outside a repository — a folder that isn't one has
 * no branch to show and no remote to push to, and three disabled buttons
 * would only suggest otherwise.
 *
 * Note what the counts mean. `ahead` is exact, since it is a local fact.
 * `behind` is only as current as the last fetch, and nothing here fetches on
 * its own: that is a network call on the user's behalf against a remote that
 * may want credentials, so it stays an explicit act, in the branch menu.
 */
export default function GitControls() {
  const isRepo = useIsRepo();
  const ahead = useGitStore((state) => state.status.ahead);
  const behind = useGitStore((state) => state.status.behind);

  const { pull, push, operation, error, dismissError } = useGit();
  const openGit = useOpenGit();
  const gitOpen = useHasGitWindow();

  if (!isRepo) return null;

  const busy = operation !== null;

  return (
    <div className="flex items-center gap-2">
      {error ? <GitError message={error} onDismiss={dismissError} /> : null}

      {/* The way into the full view. The same click as the sidebar's source
          control icon, and the same rule: an open git window is focused, not
          duplicated. */}
      <Hint label={gitOpen ? 'Focus source control' : 'Open source control'}>
        <Button
          variant="outline"
          size="icon-sm"
          className="cursor-pointer"
          onClick={openGit}
          aria-label="Open source control"
        >
          <FolderGit2 className="size-4" />
        </Button>
      </Hint>

      <GitAction
        icon={ArrowDownToLine}
        label={behind > 0 ? `Pull ${behind} commit(s)` : 'Pull'}
        count={behind}
        busy={operation === 'pull'}
        disabled={busy}
        onClick={() => void pull()}
      />

      <GitAction
        icon={ArrowUpToLine}
        label={ahead > 0 ? `Push ${ahead} commit(s)` : 'Push'}
        count={ahead}
        busy={operation === 'push'}
        disabled={busy}
        onClick={() => void push()}
      />

      <BranchMenu />
    </div>
  );
}

interface GitActionProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** Commits this button would move. Drawn as a badge, hidden at zero. */
  count: number;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}

function GitAction({
  icon: Icon,
  label,
  count,
  busy,
  disabled,
  onClick,
}: GitActionProps) {
  return (
    <Hint label={label}>
      <Button
        variant="outline"
        size="icon-sm"
        className="relative cursor-pointer"
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
      >
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Icon className="size-4" />
        )}

        {count > 0 && !busy ? (
          <div className="absolute left-[70%] top-[60%] flex size-4 items-center justify-center rounded-full bg-project/50  backdrop-blur-sm">
            <span className="font-bold text-fg text-[10px] text-shadow-sm">
              {count > 9 ? '9+' : count}
            </span>
          </div>
        ) : null}
      </Button>
    </Hint>
  );
}

/**
 * The last failure, parked next to the buttons until it is read.
 *
 * git's own stderr, unedited: "Updates were rejected because the remote
 * contains work that you do not have locally" is a better message than
 * anything this could paraphrase it into, and a user who has seen it before
 * knows exactly what to do next.
 */
function GitError({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <Hint
      label={
        <span className="block max-w-xs text-left whitespace-pre-wrap">
          {message}
        </span>
      }
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="cursor-pointer text-fg-danger"
        onClick={onDismiss}
        aria-label="Dismiss the last git error"
      >
        <TriangleAlert className="size-4" />
      </Button>
    </Hint>
  );
}

function Hint({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
