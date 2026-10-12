import { cn } from 'cn';
import { LoaderCircle, Minus, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Checkbox,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '~/components/ui';
import {
  statusColor,
  statusLetter,
  useGitChanges,
  useGitStaging,
  useGitStore,
  type GitChange,
} from '~/lib/git';
import { useOpenFile } from '~/lib/window';
import GitDiff from './git-diff.component';

/**
 * Staging, and the message that goes with it.
 *
 * The two file lists are the repository's own — they come straight off the
 * polled snapshot, so a file staged in a terminal appears here within a tick
 * without this view asking anything. What it owns is the selection and the
 * message; both live in the git store rather than in local state, so
 * switching to the history tab and back does not discard a half-written
 * commit message.
 *
 * The diff is below rather than beside: a git window is often a third of the
 * workbench, and two columns at that width leave neither of them readable.
 */
export default function GitCommit() {
  const { staged, changed } = useGitChanges();
  const { stage, unstage } = useGitStaging();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel id="git-changes" minSize="20%" defaultSize="45%">
          <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden py-1">
            <Section
              title="Staged"
              files={staged}
              // An empty list means "all of it" on both channels, which is
              // what the section buttons want and what the row buttons must
              // never accidentally send — hence the explicit path array.
              action={{
                label: 'Unstage all',
                icon: <Minus className="size-3" />,
                onClick: () => void unstage([]),
              }}
              rowAction={(file) => void unstage([file.path])}
              rowIcon={<Minus className="size-3" />}
              rowLabel="Unstage"
            />

            <Section
              title="Changes"
              files={changed}
              action={{
                label: 'Stage all',
                icon: <Plus className="size-3" />,
                onClick: () => void stage([]),
              }}
              rowAction={(file) => void stage([file.path])}
              rowIcon={<Plus className="size-3" />}
              rowLabel="Stage"
            />

            {staged.length === 0 && changed.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-fg-subtle">
                Nothing has changed since the last commit.
              </p>
            ) : null}
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel id="git-diff" minSize="20%">
          <GitDiff />
        </ResizablePanel>
      </ResizablePanelGroup>

      <CommitBox stagedCount={staged.length} />
    </div>
  );
}

interface SectionAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

/** One of the two lists, with its own "do this to all of it" button. */
function Section({
  title,
  files,
  action,
  rowAction,
  rowIcon,
  rowLabel,
}: {
  title: string;
  files: GitChange[];
  action: SectionAction;
  rowAction: (file: GitChange) => void;
  rowIcon: ReactNode;
  rowLabel: string;
}) {
  if (files.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="text-[11px] font-medium text-fg-muted">
          {title}
          <span className="ml-1 text-fg-subtle">{files.length}</span>
        </span>
        <button
          onClick={action.onClick}
          className="ml-auto flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-fg-muted transition-colors hover:bg-project/20 hover:text-fg"
        >
          {action.icon}
          {action.label}
        </button>
      </div>

      {files.map((file) => (
        <FileRow
          key={`${file.staged ? 's' : 'u'}:${file.path}`}
          file={file}
          onAct={() => rowAction(file)}
          actionIcon={rowIcon}
          actionLabel={rowLabel}
        />
      ))}
    </>
  );
}

/**
 * One changed file.
 *
 * Clicking selects it, which is what fills the diff pane below. Double
 * clicking opens it in an editor — the thing you want immediately after
 * reading a diff and deciding it is wrong.
 */
function FileRow({
  file,
  onAct,
  actionIcon,
  actionLabel,
}: {
  file: GitChange;
  onAct: () => void;
  actionIcon: ReactNode;
  actionLabel: string;
}) {
  const select = useGitStore((state) => state.select);
  const selected = useGitStore(
    (state) =>
      state.selected === file.path && state.selectedStaged === file.staged
  );
  const openFile = useOpenFile();

  return (
    <div
      onClick={() => select(file.path, file.staged)}
      onDoubleClick={() => openFile(file.absolute)}
      className={cn(
        'group/file flex cursor-pointer items-center gap-2 px-2 py-0.5 transition-colors',
        selected ? 'bg-row-selected' : 'hover:bg-row-hover'
      )}
    >
      <span
        className={cn(
          'w-3 shrink-0 text-center font-mono text-[10px]',
          statusColor(file.status)
        )}
      >
        {statusLetter(file.status)}
      </span>

      <span className="truncate text-[12px] text-fg">{file.name}</span>
      {file.dir ? (
        <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">
          {file.dir}
        </span>
      ) : (
        <span className="flex-1" />
      )}

      <button
        aria-label={`${actionLabel} ${file.path}`}
        onClick={(event) => {
          // The row under it selects on click; without this, staging a file
          // would also move the diff pane to it.
          event.stopPropagation();
          onAct();
        }}
        className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-fg-muted opacity-0 transition-opacity group-hover/file:opacity-100 hover:bg-project/25 hover:text-fg"
      >
        {actionIcon}
      </button>
    </div>
  );
}

/**
 * The message, and the button that records it.
 *
 * A plain `<textarea>` rather than the `Input` component: a commit message
 * has a body, and the first thing anyone does in a single-line commit field
 * is write a subject too long to be one.
 */
function CommitBox({ stagedCount }: { stagedCount: number }) {
  const { message, setMessage, commit, operation } = useGitStaging();
  const [amend, setAmend] = useState(false);

  const busy = operation !== null;
  // Amending needs no staged file — rewording the last commit is a perfectly
  // good reason to be here — but an ordinary commit does.
  const canCommit = message.trim().length > 0 && (amend || stagedCount > 0);

  const onCommit = async () => {
    const result = await commit(amend);
    if (result.ok) setAmend(false);
  };

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-pane-border p-2">
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          // The shortcut every git UI uses, and the reason the textarea can
          // keep Enter for what Enter is for: a commit message body.
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            if (canCommit && !busy) void onCommit();
          }
        }}
        rows={3}
        spellCheck
        placeholder={amend ? 'Reword the last commit…' : 'Commit message…'}
        className="w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-[12px] outline-none transition-colors placeholder:text-fg-subtle focus-visible:border-project"
      />

      <div className="flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-fg-muted">
          <Checkbox
            checked={amend}
            onCheckedChange={(checked) => setAmend(checked === true)}
          />
          Amend
        </label>

        <button
          onClick={() => void onCommit()}
          disabled={!canCommit || busy}
          className="ml-auto flex cursor-pointer items-center gap-2 rounded-lg bg-button-accent px-3 py-1 text-[12px] font-medium text-button-accent-fg transition-colors hover:bg-button-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {operation === 'commit' ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : null}
          {amend ? 'Amend commit' : `Commit ${stagedCount || ''}`.trim()}
        </button>
      </div>
    </div>
  );
}
