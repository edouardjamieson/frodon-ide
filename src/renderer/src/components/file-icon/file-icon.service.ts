import {
  DIRECTORY_ICON,
  DIRECTORY_OPEN_ICON,
  FALLBACK_ICON,
  ICON_BY_EXTENSION,
  ICON_BY_NAME,
  ICON_BY_PREFIX,
} from './file-icon.constant';
import type { LucideIcon } from './file-icon.def';
import type { File } from '@shared/fs.def';

/**
 * The extension, lowercased and without the dot, or `''`.
 *
 * `lastIndexOf` rather than a split, so `index.test.ts` is a `ts` file and
 * `vite.config.ts` is too. The `> 0` is what keeps dotfiles honest: in
 * `.gitignore` the only dot is at position zero, and `gitignore` is a name,
 * not an extension.
 */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1) : '';
}

/**
 * The icon for a tree node.
 *
 * Four passes, narrowing: directories, then the whole filename, then a short
 * list of prefixes, then the extension. Everything but the prefix pass is a
 * `Map` hit — the tables are flattened once at module load rather than
 * searched per row, which matters because this runs for every visible node on
 * every render of the tree.
 */
export function iconForFile(file: File, open = false): LucideIcon {
  if (file.isDir) return open ? DIRECTORY_OPEN_ICON : DIRECTORY_ICON;

  // Case-folded once: `README.md`, `Dockerfile` and `LICENSE` are all spelled
  // however their author felt that day.
  const name = file.name.toLowerCase();

  const byName = ICON_BY_NAME.get(name);
  if (byName) return byName;

  for (const [icon, prefixes] of ICON_BY_PREFIX) {
    if (prefixes.some((prefix) => name.startsWith(prefix))) return icon;
  }

  return ICON_BY_EXTENSION.get(extensionOf(name)) ?? FALLBACK_ICON;
}
