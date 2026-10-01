import type {
  PaletteKey,
  RoleKey,
  ThemeDefinition,
  ThemeIcons,
} from './theme.def';

/** The theme used when config names none, and the root of every `extends` chain. */
export const DEFAULT_THEME_NAME = 'frodon-dark';

/**
 * Which palette entry each role falls back to when a theme doesn't name it.
 *
 * This table is the whole reason a theme can be twenty lines: an author writes
 * seventeen colors and every surface in the app is covered. Overriding a role
 * individually is the exception, not the starting point.
 */
export const ROLE_DEFAULTS: Record<RoleKey, PaletteKey> = {
  // Surfaces
  appBg: 'bg',
  sidebarBg: 'bg',
  sidebarToolbarBg: 'bgElevated',
  statusBarBg: 'bg',
  terminalBg: 'bg',
  editorBg: 'bg',
  tabBarBg: 'bg',
  tabActiveBg: 'bgHighlight',
  tabInactiveBg: 'bgElevated',
  overlayBg: 'bgOverlay',
  overlayElevatedBg: 'bgElevated',
  inputBg: 'bgHighlight',
  tooltipBg: 'bgOverlay',
  menuItemBg: 'bgElevated',
  menuItemSelectedBg: 'bgHighlight',
  scrim: 'scrim',

  // Explorer
  explorerRowSelectedBg: 'bgSelection',
  explorerRowOpenBg: 'bgHighlight',
  explorerDirExpandedBg: 'bgElevated',
  explorerIndentBorder: 'border',
  explorerFileFg: 'fgMuted',
  explorerActiveFg: 'fg',

  // Borders
  border: 'border',
  windowBorder: 'border',
  windowBorderFocused: 'accent',
  tooltipBorder: 'border',

  // Text
  fg: 'fg',
  fgMuted: 'fgMuted',
  fgSubtle: 'fgSubtle',
  fgAccent: 'accent',
  fgDanger: 'danger',
  fgWarning: 'warning',
  fgSuccess: 'success',

  // Buttons
  buttonBg: 'bgElevated',
  buttonHoverBg: 'bgHighlight',
  buttonFg: 'fg',
  buttonAccentBg: 'accent',
  buttonAccentHoverBg: 'accentMuted',
  buttonAccentFg: 'fgOnAccent',

  // Editor chrome
  editorLineNumber: 'fgSubtle',
  editorSelectionBg: 'bgHighlight',
  editorCursorBg: 'accent',
  editorSearchMatchBg: 'accentSubtle',
  editorSearchMatchActiveBg: 'accentMuted',

  // Git
  gitStagedFg: 'success',
  gitChangedFg: 'warning',

  // Errors
  errorBorder: 'danger',
  errorTitleFg: 'danger',
};

/**
 * The fallback glyph for every icon, and the set a theme may override.
 *
 * Emoji throughout: they read instantly and a terminal app can't ship a font,
 * so there's no richer option that works everywhere. They cost two cells and
 * ignore the foreground color, which `Icon` handles by reserving the width it
 * measures (see `icon.component.tsx`). The practical cost is that an emoji
 * stays full-saturation in a dimmed or unfocused pane, where a glyph that
 * inherits `fg` would fade with its row.
 *
 * The bullets are the exception, and stay single-cell Geometric Shapes: they
 * mark state inside a line of text (a dirty tab, the current branch) rather
 * than labelling a control, so they have to take the color of whatever they sit
 * in. The window-split pair is ASCII for want of an emoji that means "split a
 * pane".
 *
 * A theme may replace any of these, including swapping the whole set for
 * single-cell or Nerd Font glyphs (see `docs/themes.md`).
 */
export const DEFAULT_ICONS: ThemeIcons = {
  // Disclosure / tree
  chevronRight: '▶️',
  chevronLeft: '◀️',
  chevronDown: '🔽',
  file: '📄',
  folder: '📁',
  folderOpen: '📂',

  // Bullets — one cell, and they inherit `fg` so they dim with their row
  dot: '•',
  circle: '○',
  disc: '●',
  diamond: '◆',
  square: '▪',

  // Status / actions
  check: '✅',
  close: '❌',
  dismiss: '❌',
  cancel: '⛔',
  cross: '❌',
  warning: '⚠️',
  blocked: '🔒',
  plus: '+',

  // Arrows
  arrowRight: '▶️',
  arrowLeft: '◀️',
  arrowUp: '🔼',
  arrowDown: '🔽',

  // Explorer toolbar
  newFile: '📝',
  newFolder: '📁',
  rename: '✏️',
  delete: '🗑️',

  // Navigation
  menu: '📋',
  commands: '💡',
  search: '🔍',
  document: '📄',
  terminal: '❯',

  // Windows — no emoji means "split a pane", so these stay ASCII
  splitHorizontal: '][',
  splitVertical: '=',
  move: '⏺️',

  // Git
  gitBranch: '🪾',
  gitPush: '⏫',
  gitPull: '⏬',

  // Theming
  palette: '🎨',
};

/**
 * The themes that ship with Frodon.
 *
 * `frodon-dark` is the root every other theme ultimately extends, so it is the
 * only one that has to be exhaustive. `frodon-light` exists as much to keep the
 * role layer honest as to be used: anything that hardcodes a dark assumption
 * shows up there immediately.
 */
export const BUILT_IN_THEMES: ThemeDefinition[] = [
  {
    name: 'frodon-dark',
    description: 'The default. Near-black neutrals with a lime accent.',
    dark: true,
    colors: {
      palette: {
        bg: '#0a0a0a',
        bgElevated: '#171717',
        bgOverlay: '#0a0a0a',
        bgHighlight: '#262626',
        bgSelection: '#404040',
        scrim: '#00000080',

        border: '#262626',

        fg: '#f5f5f5',
        fgMuted: '#a3a3a3',
        fgSubtle: '#525252',
        fgOnAccent: '#0a0a0a',

        accent: '#9ae600',
        accentMuted: '#5ea500',
        accentSubtle: '#497d00',

        danger: '#e7000b',
        warning: '#e3b341',
        success: '#7ee787',
      },
      syntax: {
        plain: '#e6edf3',
        comment: '#8b949e',
        keyword: '#ff7b72',
        string: '#a5d6ff',
        number: '#79c0ff',
        function: '#d2a8ff',
        variable: '#e6edf3',
        class: '#ffa657',
        tag: '#7ee787',
        punctuation: '#f0f6fc',
      },
    },
  },
  {
    name: 'frodon-light',
    description: 'The same shapes on paper. Deeper lime so it holds on white.',
    dark: false,
    colors: {
      palette: {
        bg: '#ffffff',
        bgElevated: '#f4f4f5',
        bgOverlay: '#ffffff',
        bgHighlight: '#e4e4e7',
        bgSelection: '#d4d4d8',
        scrim: '#00000040',

        border: '#d4d4d8',

        fg: '#18181b',
        fgMuted: '#52525b',
        fgSubtle: '#8b8b94',
        fgOnAccent: '#ffffff',

        accent: '#4d8c00',
        accentMuted: '#3d7000',
        accentSubtle: '#d9f2a3',

        danger: '#c81e1e',
        warning: '#a16207',
        success: '#15803d',
      },
      // A wash sitting *behind* dark text has to go the other way than it does
      // on a dark background, so the two search-match roles are pinned rather
      // than taken from `accentSubtle`/`accentMuted`.
      roles: {
        editorSearchMatchBg: '#e8f7c2',
        editorSearchMatchActiveBg: '#b4e05c',
      },
      syntax: {
        plain: '#1f2328',
        comment: '#6e7781',
        keyword: '#cf222e',
        string: '#0a3069',
        number: '#0550ae',
        function: '#8250df',
        variable: '#1f2328',
        class: '#953800',
        tag: '#116329',
        punctuation: '#1f2328',
      },
    },
  },
  {
    name: 'nocturne',
    description: 'Cool blues and violets for working after dark.',
    dark: true,
    colors: {
      palette: {
        bg: '#11131a',
        bgElevated: '#181b24',
        bgOverlay: '#141720',
        bgHighlight: '#252a38',
        bgSelection: '#333a4d',
        scrim: '#00000080',

        border: '#252a38',

        fg: '#e4e7f0',
        fgMuted: '#a0a6ba',
        fgSubtle: '#5c6377',
        fgOnAccent: '#11131a',

        accent: '#7aa2f7',
        accentMuted: '#3d59a1',
        accentSubtle: '#2a3a5e',

        danger: '#f7768e',
        warning: '#e0af68',
        success: '#9ece6a',
      },
      syntax: {
        plain: '#c0caf5',
        comment: '#565f89',
        keyword: '#bb9af7',
        string: '#9ece6a',
        number: '#ff9e64',
        function: '#7aa2f7',
        variable: '#c0caf5',
        class: '#e0af68',
        tag: '#f7768e',
        punctuation: '#89ddff',
      },
    },
  },
];
