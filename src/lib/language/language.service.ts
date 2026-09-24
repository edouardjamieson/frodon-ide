import { EXTENSION_LANGUAGE } from './language.constant';

/**
 * Resolves a file name or path to the refractor language id used to highlight
 * it, based on its extension. Returns null when the extension is unknown.
 */
export function resolveLanguageId(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot === -1) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return EXTENSION_LANGUAGE[ext] ?? null;
}
