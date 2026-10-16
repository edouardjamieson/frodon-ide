import { cn } from 'cn';
import { GitMerge, X } from 'lucide-react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '~/components/ui';
import {
  changeColor,
  changeLetter,
  relativeTime,
  useCommitDetail,
  useGitStore,
} from '~/lib/git';
import GitDiff from './git-diff.component';
import type { GitCommitFile, GitLogCommit } from '@shared/git.def';

/**
 * What the commit you clicked did.
 *
 * Built from two sources, which is the only structural thing worth knowing
 * about it: the subject, the author and the date come from the row that
 * opened it — the history already read those for every commit on screen — and
 * only the body and the file list cost a subprocess. So the header is drawn
 * on the first frame and the list fills in under it, rather than the whole
 * panel appearing empty for as long as git takes.
 *
 * Files over the patch, the same way the commit tab stacks them, and for the
 * reason written there: a git window is often a third of the workbench, and
 * two columns at that width leave neither readable.
 */
export default function GitCommitDetail({ commit }: { commit: GitLogCommit }) {
  const { detail, loading, close } = useCommitDetail();

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-pane-border">
      <header className="flex shrink-0 flex-col gap-1 px-2 py-1.5">
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-[11px] text-fg-muted">
            {commit.shortSha}
          </span>
          <span className="truncate text-[12px] text-fg">{commit.subject}</span>

          <button
            aria-label="Close the commit"
            onClick={close}
            className="ml-auto flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-fg-muted transition-colors hover:bg-project/20 hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
          <span className="truncate">{commit.author}</span>
          <span>{relativeTime(commit.date)}</span>

          {detail?.merge ? (
            // Said rather than assumed: the list below is what this merge did
            // to its first parent, which is one reading of a merge and not the
            // whole truth about one. See `DIFF_MERGES`.
            <span
              title="Showing what this merge brought in, against its first parent"
              className="flex shrink-0 items-center gap-1 rounded bg-tab-inactive px-1 py-px text-[10px] text-fg-muted"
            >
              <GitMerge className="size-2.5" />
              merge
            </span>
          ) : null}

          {detail && detail.files.length > 0 ? (
            <span className="ml-auto shrink-0 tabular-nums">
              {detail.files.length}{' '}
              {detail.files.length === 1 ? 'file' : 'files'}
            </span>
          ) : null}
        </div>
      </header>

      {/* Capped and scrollable: a commit message in this repository can run
          twenty paragraphs, and it must not push the files off the panel. */}
      {detail?.body ? (
        <pre className="max-h-20 shrink-0 overflow-y-auto border-t border-pane-border px-2 py-1.5 font-sans text-[11px] whitespace-pre-wrap text-fg-muted">
          {detail.body}
        </pre>
      ) : null}

      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel
          id="commit-files"
          minSize="20%"
          defaultSize="40%"
          className="border-t border-pane-border"
        >
          <FileList sha={commit.sha} files={detail?.files} loading={loading} />
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel id="commit-diff" minSize="20%">
          <GitDiff />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

/**
 * The files, or the one line that says why there are none.
 *
 * An empty list is a real answer and not only a failure: `git commit
 * --allow-empty` exists, and a merge that brought nothing in against its
 * first parent is the common case rather than a strange one.
 */
function FileList({
  sha,
  files,
  loading,
}: {
  sha: string;
  files: GitCommitFile[] | undefined;
  loading: boolean;
}) {
  if (!files) {
    return (
      <p className="flex h-full items-center justify-center text-[12px] text-fg-subtle">
        {loading ? 'Reading the commit…' : ''}
      </p>
    );
  }

  if (files.length === 0) {
    return (
      <p className="flex h-full items-center justify-center px-4 text-center text-[12px] text-fg-subtle">
        This commit changed no files.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden py-1">
      {files.map((file) => (
        <FileRow key={`${file.change}:${file.path}`} sha={sha} file={file} />
      ))}
    </div>
  );
}

function FileRow({ sha, file }: { sha: string; file: GitCommitFile }) {
  const select = useGitStore((state) => state.select);
  // Only a selection pointing at *this* commit counts: the pane is shared
  // with the commit tab, which can hold the same path for its working copy.
  const selected = useGitStore(
    (state) =>
      state.selection?.path === file.path &&
      state.selection.source.kind === 'commit' &&
      state.selection.source.sha === sha
  );

  return (
    <button
      type="button"
      onClick={() =>
        select({
          path: file.path,
          source: { kind: 'commit', sha },
          ...(file.oldPath ? { oldPath: file.oldPath } : {}),
        })
      }
      title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
      className={cn(
        'flex w-full shrink-0 cursor-pointer items-center gap-2 px-2 py-0.5 text-left transition-colors',
        selected ? 'bg-row-selected' : 'hover:bg-row-hover'
      )}
    >
      <span
        className={cn(
          'w-3 shrink-0 text-center font-mono text-[10px]',
          changeColor(file.change)
        )}
      >
        {changeLetter(file.change)}
      </span>

      {/* The directory dimmed and the name not, so a list of twenty files in
          four folders reads as the files rather than as the paths. */}
      <span className="min-w-0 flex-1 truncate text-[12px]">
        <span className="text-fg-subtle">{directoryOf(file.path)}</span>
        <span className="text-fg">{basenameOf(file.path)}</span>
      </span>

      {file.oldPath ? (
        <span className="shrink-0 text-[10px] text-fg-subtle">
          from {basenameOf(file.oldPath)}
        </span>
      ) : null}
    </button>
  );
}

/** `src/lib/git/git.hook.ts` -> `src/lib/git/`. Empty at the top level. */
function directoryOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut === -1 ? '' : path.slice(0, cut + 1);
}

function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
