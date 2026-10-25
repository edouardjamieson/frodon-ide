/**
 * What a file has to be called to open as a page rather than as source.
 *
 * Here rather than beside the markdown editor because the keybinding registry
 * asks it too — `mod+e` means nothing in a TypeScript file, and a request
 * parked for a window that cannot honor it would sit on the store until one
 * could. `.mdx` is absent: it is JSX with prose in it, and drawing it as a
 * page would hide the half that is code.
 */
const MARKDOWN_EXTENSIONS: ReadonlySet<string> = new Set([
  'md',
  'markdown',
  'mkd',
]);

export function isMarkdownPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const name = path.split(/[/\\]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return MARKDOWN_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}
