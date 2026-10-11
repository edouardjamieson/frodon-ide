import { useProjectStore } from '~/lib/project';
import type { File } from '@shared/fs.def';
import { ChevronRight } from 'lucide-react';
import { cn } from 'cn';
import FileIcon from '~/components/file-icon';

/**
 * The project tree.
 *
 * A direct descendant of the TUI's `ExplorerNode` — same recursive shape, same
 * expanded-by-path state — with the row drawn as a div instead of a box and
 * the disclosure arrow rotated by CSS rather than swapped for a different
 * glyph. Expansion state is keyed by absolute path so it survives a rescan
 * replacing the tree wholesale.
 */
function Node({ file, depth }: { file: File; depth: number }) {
  const { expanded, toggleExpanded, activePath, setActivePath } =
    useProjectStore();

  const isExpanded = expanded.has(file.path);
  const isActive = activePath === file.path;

  const onClick = () => {
    if (file.isDir) toggleExpanded(file.path);
    else setActivePath(file.path);
  };

  return (
    <>
      <button
        onClick={onClick}
        // Indent with padding rather than a wrapper so the hover and selection
        // backgrounds still span the full width of the panel.
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={[
          'flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-[12px] rounded-md',
          'hover:bg-row-hover',
          isActive
            ? 'bg-row-selected text-explorer-active'
            : 'text-explorer-file',
        ].join(' ')}
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
            <Node key={child.path} file={child} depth={depth + 1} />
          ))
        : null}
    </>
  );
}

export default function Explorer({ files }: { files: File[] }) {
  if (files.length === 0) return null;

  return (
    <div className="overflow-auto flex flex-col w-full h-full p-1.5">
      {files.map((file) => (
        <Node key={file.path} file={file} depth={0} />
      ))}
    </div>
  );
}
