import { useProjectStore } from '~/lib/project';
import { useGitFileStatus } from '~/lib/git';
import { useActiveFilePath, useOpenFile, useOpenFilePaths } from '~/lib/window';
import type { File } from '@shared/fs.def';
import type { GitFileStatus } from '@shared/git.def';
import { ChevronRight } from 'lucide-react';
import { cn } from 'cn';
import FileIcon from '~/components/utils/file-icon';

/**
 * How a file's git state colors its name. Roles, not colors: a theme decides
 * what "changed" looks like, and the explorer never learns.
 */
const GIT_FG: Record<GitFileStatus, string> = {
  staged: 'text-git-staged',
  changed: 'text-git-changed',
  untracked: 'text-git-untracked',
  conflicted: 'text-git-conflicted',
};

interface NodeProps {
  file: File;
  depth: number;
  /** Every path open as a tab in any window, derived once — see `Explorer`. */
  openPaths: Set<string>;
  /** The tab on screen in the focused window, or null. */
  activePath: string | null;
  /** Git state by absolute path, derived once — see `Explorer`. */
  gitByPath: Map<string, GitFileStatus>;
}

/**
 * The project tree.
 *
 * A direct descendant of the TUI's `ExplorerNode` — same recursive shape, same
 * expanded-by-path state — with the row drawn as a div instead of a box and
 * the disclosure arrow rotated by CSS rather than swapped for a different
 * glyph. Expansion state is keyed by absolute path so it survives a rescan
 * replacing the tree wholesale.
 *
 * Clicking a file does not open it *here*: it hands the path to the window
 * system, which routes it to a window that can host it. The explorer has no
 * opinion about where a file lands, and no editor of its own.
 */
function Node({ file, depth, openPaths, activePath, gitByPath }: NodeProps) {
  const expanded = useProjectStore((state) => state.expanded);
  const toggleExpanded = useProjectStore((state) => state.toggleExpanded);
  const openFile = useOpenFile();

  const gitStatus = gitByPath.get(file.path);
  const isExpanded = expanded.has(file.path);
  const isActive = activePath === file.path;
  const isOpen = openPaths.has(file.path);

  const onClick = () => {
    if (file.isDir) toggleExpanded(file.path);
    else openFile(file.path);
  };

  return (
    <>
      <button
        onClick={onClick}
        // Indent with padding rather than a wrapper so the hover and selection
        // backgrounds still span the full width of the panel.
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={cn(
          'flex w-full shrink-0 items-center gap-1.5 rounded-md py-[3px] pr-2 text-left text-[12px] hover:bg-row-hover',
          // Three states, not two: open in some window, and open *and* being
          // looked at. Without the first, splitting the workbench in four
          // leaves no trace in the tree of what is where.
          isActive
            ? 'bg-row-selected text-explorer-active'
            : isOpen
              ? 'bg-row-open text-explorer-active'
              : 'text-explorer-file'
        )}
      >
        <ChevronRight
          className={cn(
            'size-3 shrink-0 inline-block text-neutral-500 transition-transform',
            {
              'opacity-0': !file.isDir,
              'rotate-90': isExpanded,
            }
          )}
        />
        <FileIcon file={file} open={isExpanded} />
        {/* No color of its own: the row above sets one for each of its three
            states, and git overrides it when it has something to say. */}
        {/* Nowrap rather than `truncate`: the panel scrolls now, so a long
            name is something to reach, not something to cut off. */}
        <span
          className={cn(
            'whitespace-nowrap text-[12px]',
            gitStatus && GIT_FG[gitStatus]
          )}
        >
          {file.name}
        </span>
      </button>

      {file.isDir && isExpanded
        ? (file.children ?? []).map((child) => (
            <Node
              key={child.path}
              file={child}
              depth={depth + 1}
              openPaths={openPaths}
              activePath={activePath}
              gitByPath={gitByPath}
            />
          ))
        : null}
    </>
  );
}

export default function Explorer({ files }: { files: File[] }) {
  // Derived once and threaded down, not asked per row: a tree of a few
  // thousand nodes would otherwise rebuild the same Set once per visible row
  // on every render. Git status is a Map for the same reason — one
  // subscription here, one lookup per row.
  const openPaths = useOpenFilePaths();
  const activePath = useActiveFilePath();
  const gitByPath = useGitFileStatus();

  if (files.length === 0) return null;

  return (
    // Two elements, because one cannot do both jobs: the outer div scrolls,
    // the inner one is sized by its widest row. `w-max` is what makes the
    // horizontal scrollbar appear at all — a `w-full` column can never be
    // wider than the box it scrolls in, so deep trees used to truncate
    // instead. `min-w-full` keeps the rows spanning the panel when the tree
    // is narrower than it, so a hover or selection background still reaches
    // both edges. The scroller is a flex container so that Chromium keeps its
    // trailing padding at the far end of a horizontal scroll, which a block
    // one drops.
    <div className="flex h-full w-full flex-col overflow-auto p-1.5">
      <div className="flex w-max min-w-full flex-col">
        {files.map((file) => (
          <Node
            key={file.path}
            file={file}
            depth={0}
            openPaths={openPaths}
            activePath={activePath}
            gitByPath={gitByPath}
          />
        ))}
      </div>
    </div>
  );
}
