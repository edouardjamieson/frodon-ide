import type { File } from '@shared/fs.def';

interface Found {
  file: File;
  /** Absolute path of the directory the file sits in. */
  parent: string;
}

/**
 * Finds a path in the tree, carrying its parent directory back with it.
 *
 * Descends only into directories whose path prefixes the target, which turns a
 * walk of the whole project into a walk of one branch of it. Same instinct as
 * the scan in main: filter before you descend. The prefix test is deliberately
 * loose — `/a/foo` prefixes `/a/foobar` — because being wrong that way costs a
 * fruitless descent, while being strict about the separator would cost
 * correctness on a platform that spells it differently.
 */
function find(nodes: File[], target: string, parent: string): Found | null {
  for (const node of nodes) {
    if (node.path === target) return { file: node, parent };
    if (!node.isDir || !target.startsWith(node.path)) continue;

    const hit = find(node.children ?? [], target, node.path);
    if (hit) return hit;
  }

  return null;
}

/**
 * Where a new file or folder goes, given what is selected.
 *
 * A selected directory is the destination; a selected file means the directory
 * it is in, which is what "at the same level" means when you are looking at a
 * file. Nothing selected — or a selection the last rescan removed — falls back
 * to the project root.
 */
export function newEntryDirectory(
  files: File[],
  selected: string | null,
  root: string
): string {
  if (!selected) return root;

  const found = find(files, selected, root);
  if (!found) return root;

  return found.file.isDir ? found.file.path : found.parent;
}

/**
 * A directory's path as the toolbar names it: relative to the root, or the
 * project's own name at the top. Display only — nothing is resolved from it.
 */
export function describeDirectory(
  directory: string,
  root: string,
  projectName: string
): string {
  if (!root || directory === root) return projectName;
  if (!directory.startsWith(root)) return directory;

  return directory.slice(root.length).replace(/^[/\\]/, '');
}
