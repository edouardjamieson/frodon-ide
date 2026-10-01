import type { File } from '~/lib/fs/fs.def';
import type { IconName } from '~/lib/theme';

/**
 * Picks the disclosure/type glyph for a project file: an open/closed triangle
 * for directories, otherwise the generic file dot.
 *
 * Language-specific icons aren't possible with fallback-safe Unicode (and a
 * terminal app can't ship a font) — the explorer distinguishes file types by
 * color instead. The glyphs themselves live in the theme, so a user on a Nerd
 * Font can swap `folder`/`file` for something richer without touching this.
 */
export function resolveFileIcon(file: File, isOpen = false): IconName {
  if (file.isDir) return isOpen ? 'folderOpen' : 'folder';
  return 'file';
}
