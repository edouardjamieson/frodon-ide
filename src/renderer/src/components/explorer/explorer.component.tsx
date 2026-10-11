import { useProjectStore } from '~/lib/project';
import { useActiveFilePath, useOpenFile, useOpenFilePaths } from '~/lib/window';
import type { File } from '@shared/fs.def';
import { ChevronRight } from 'lucide-react';
import { cn } from 'cn';
import FileIcon from '~/components/file-icon';

interface NodeProps {
  file: File;
  depth: number;
  /** Every path open as a tab in any window, derived once — see `Explorer`. */
  openPaths: Set<string>;
  /** The tab on screen in the focused window, or null. */
  activePath: string | null;
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
function Node({ file, depth, openPaths, activePath }: NodeProps) {
  const expanded = useProjectStore((state) => state.expanded);
  const toggleExpanded = useProjectStore((state) => state.toggleExpanded);
  const openFile = useOpenFile();

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
          'flex w-full items-center gap-1.5 rounded-md py-[3px] pr-2 text-left text-[12px] hover:bg-row-hover',
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
            'size-3 inline-block text-neutral-500 transition-transform',
            {
              'opacity-0': !file.isDir,
              'rotate-90': isExpanded,
            }
          )}
        />
        <FileIcon file={file} open={isExpanded} />
        <span className="truncate text-[12px] text-neutral-300">
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
            />
          ))
        : null}
    </>
  );
}

export default function Explorer({ files }: { files: File[] }) {
  // Derived once and threaded down, not asked per row: a tree of a few
  // thousand nodes would otherwise rebuild the same Set once per visible row
  // on every render. Same reason git status will be a Map.
  const openPaths = useOpenFilePaths();
  const activePath = useActiveFilePath();

  if (files.length === 0) return null;

  return (
    <div className="flex h-full w-full flex-col overflow-auto p-1.5">
      {files.map((file) => (
        <Node
          key={file.path}
          file={file}
          depth={0}
          openPaths={openPaths}
          activePath={activePath}
        />
      ))}
    </div>
  );
}
