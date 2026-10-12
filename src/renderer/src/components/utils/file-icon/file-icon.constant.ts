import {
  Binary,
  BookText,
  Container,
  Database,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileCog,
  FileImage,
  FileJson,
  FileLock2,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType,
  FileVideo,
  Folder,
  FolderOpen,
  GitBranch,
  Globe,
  KeyRound,
  Package,
  Palette,
  Scale,
  ScrollText,
} from 'lucide-react';
import type { IconGroup, LucideIcon } from './file-icon.def';

/**
 * Icons are grouped by the icon rather than listed per extension, because the
 * interesting question when reading this table is "what else looks like a
 * stylesheet", not "what does .scss map to".
 *
 * Nothing here is colored. `docs/theme.md` is explicit that icons inherit
 * `currentColor`, so a row's icon is whatever color that row's text is — which
 * is what makes the selected row's icon light up for free, and what keeps this
 * file from becoming a second, unthemed palette.
 */
const BY_EXTENSION: readonly IconGroup[] = [
  [
    FileCode,
    [
      'ts',
      'tsx',
      'mts',
      'cts',
      'js',
      'jsx',
      'mjs',
      'cjs',
      'vue',
      'svelte',
      'astro',
      'rs',
      'go',
      'py',
      'rb',
      'java',
      'kt',
      'kts',
      'swift',
      'c',
      'h',
      'cc',
      'cpp',
      'hpp',
      'cs',
      'php',
      'lua',
      'dart',
      'ex',
      'exs',
      'zig',
      'scala',
      'pl',
      'r',
    ],
  ],
  [FileJson, ['json', 'jsonc', 'json5']],
  [Palette, ['css', 'pcss', 'scss', 'sass', 'less', 'styl']],
  [Globe, ['html', 'htm', 'xhtml', 'xml']],
  [FileText, ['md', 'mdx', 'txt', 'rtf', 'pdf', 'doc', 'docx']],
  [
    FileCog,
    ['yml', 'yaml', 'toml', 'ini', 'conf', 'cfg', 'properties', 'editorconfig'],
  ],
  [
    FileImage,
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'tiff'],
  ],
  [FileVideo, ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v']],
  [FileAudio, ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac']],
  [FileArchive, ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'rar', '7z']],
  [FileTerminal, ['sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd']],
  [Database, ['sql', 'db', 'sqlite', 'sqlite3', 'prisma']],
  [FileSpreadsheet, ['csv', 'tsv', 'xls', 'xlsx']],
  [FileType, ['woff', 'woff2', 'ttf', 'otf', 'eot']],
  [Binary, ['wasm', 'bin', 'exe', 'dll', 'so', 'dylib', 'o', 'a']],
  [ScrollText, ['log']],
  [FileLock2, ['lock']],
];

/**
 * Whole filenames, checked before extensions so `package.json` is a package
 * and not just more JSON. These are the files you look for when you open an
 * unfamiliar repo, which is the whole reason they get their own shape.
 */
const BY_NAME: readonly IconGroup[] = [
  [Package, ['package.json']],
  [
    FileLock2,
    ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'],
  ],
  [
    BookText,
    ['readme', 'readme.md', 'claude.md', 'agents.md', 'contributing.md'],
  ],
  [Scale, ['license', 'license.md', 'licence', 'licence.md']],
  [
    Container,
    [
      'dockerfile',
      '.dockerignore',
      'docker-compose.yml',
      'docker-compose.yaml',
    ],
  ],
  [GitBranch, ['.gitignore', '.gitattributes', '.gitmodules', '.git']],
  [FileTerminal, ['makefile', 'justfile', 'rakefile']],
];

/**
 * Prefix rules, for the families that spell themselves differently every time:
 * `tsconfig.web.json`, `.env.local`. Checked after exact names and before
 * extensions, and kept deliberately short — this list is a linear scan.
 */
export const ICON_BY_PREFIX: readonly IconGroup[] = [
  [KeyRound, ['.env']],
  [FileCog, ['tsconfig.']],
];

/** Flattened once at module load, never per row. */
function flatten(
  groups: readonly IconGroup[]
): ReadonlyMap<string, LucideIcon> {
  return new Map(
    groups.flatMap(([icon, keys]) => keys.map((key) => [key, icon] as const))
  );
}

export const ICON_BY_EXTENSION = flatten(BY_EXTENSION);
export const ICON_BY_NAME = flatten(BY_NAME);

export const FALLBACK_ICON = File;
export const DIRECTORY_ICON = Folder;
export const DIRECTORY_OPEN_ICON = FolderOpen;
