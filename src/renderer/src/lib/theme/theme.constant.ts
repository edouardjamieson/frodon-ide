import type { PaletteKey, RoleKey, ThemeDefinition } from './theme.def';

/** The theme used when config names none, and the root of every `extends` chain. */
export const DEFAULT_THEME_NAME = 'frodon-dark';

/**
 * Which palette entry each role falls back to when a theme doesn't name it.
 *
 * This table is the whole reason a theme can be twenty lines: an author writes
 * eighteen colors and every surface in the app is covered. Overriding a role
 * individually is the exception, not the starting point.
 */
export const ROLE_DEFAULTS: Record<RoleKey, PaletteKey> = {
  // Surfaces
  appBg: 'bg',
  titleBarBg: 'bg',
  sidebarBg: 'bg',
  sidebarHeaderBg: 'bgElevated',
  statusBarBg: 'bg',
  editorBg: 'bg',
  terminalBg: 'bg',
  tabBarBg: 'bg',
  tabActiveBg: 'bgHighlight',
  tabInactiveBg: 'bgElevated',
  overlayBg: 'bgOverlay',
  overlayElevatedBg: 'bgElevated',
  inputBg: 'bgHighlight',
  tooltipBg: 'bgOverlay',
  menuItemBg: 'bgElevated',
  menuItemHoverBg: 'bgHighlight',
  menuItemSelectedBg: 'bgSelection',
  scrim: 'scrim',

  // Explorer
  explorerRowHoverBg: 'bgElevated',
  explorerRowSelectedBg: 'bgSelection',
  explorerRowOpenBg: 'bgHighlight',
  explorerIndentGuide: 'border',
  explorerFileFg: 'fgMuted',
  explorerActiveFg: 'fg',

  // Borders
  border: 'border',
  paneBorder: 'border',
  paneBorderFocused: 'accent',
  tooltipBorder: 'border',
  focusRing: 'accent',

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

  // Terminal chrome
  terminalFg: 'fg',
  terminalCursor: 'accent',
  terminalSelectionBg: 'bgSelection',

  // Editor chrome
  editorGutterBg: 'bg',
  editorLineNumber: 'fgSubtle',
  editorLineNumberActive: 'fgMuted',
  editorActiveLineBg: 'bgElevated',
  editorSelectionBg: 'bgSelection',
  editorCursor: 'accent',
  editorSearchMatchBg: 'accentSubtle',
  editorSearchMatchActiveBg: 'accentMuted',

  // Git
  gitStagedFg: 'success',
  gitChangedFg: 'warning',
  gitUntrackedFg: 'fgSubtle',
  gitConflictedFg: 'danger',
  gitDiffAddedFg: 'success',
  gitDiffRemovedFg: 'danger',
  gitGraphEdge: 'border',
  gitGraphNode: 'fgMuted',

  // Boards
  boardBg: 'bg',
  boardGrid: 'border',

  // Browser
  browserBg: 'bgElevated',
  browserStageBg: 'bg',

  // Scrollbars
  scrollbarThumb: 'bgHighlight',
  scrollbarThumbHover: 'bgSelection',

  // Errors
  errorBorder: 'danger',
  errorTitleFg: 'danger',
};

/**
 * The themes that ship with Frodon.
 *
 * `frodon-dark` is the root every other theme ultimately extends, so it is the
 * only one that has to be exhaustive. `frodon-light` exists as much to keep
 * the role layer honest as to be used: anything that hardcodes a dark
 * assumption shows up there immediately.
 *
 * Palettes carried over from the TUI unchanged — the color work was already
 * done and none of it depended on a terminal.
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
      ansi: {
        black: '#15181e',
        red: '#ff7b72',
        green: '#7ee787',
        yellow: '#e3b341',
        blue: '#79c0ff',
        magenta: '#d2a8ff',
        cyan: '#56d4dd',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#f2cc60',
        brightBlue: '#a5d6ff',
        brightMagenta: '#e2c5ff',
        brightCyan: '#b3f0ff',
        brightWhite: '#f0f6fc',
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
      ansi: {
        black: '#24292f',
        red: '#cf222e',
        green: '#116329',
        yellow: '#4d2d00',
        blue: '#0969da',
        magenta: '#8250df',
        cyan: '#1b7c83',
        white: '#6e7781',
        brightBlack: '#57606a',
        brightRed: '#a40e26',
        brightGreen: '#1a7f37',
        brightYellow: '#633c01',
        brightBlue: '#218bff',
        brightMagenta: '#a475f9',
        brightCyan: '#3192aa',
        brightWhite: '#8c959f',
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
      ansi: {
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6',
        brightBlack: '#414868',
        brightRed: '#ff899d',
        brightGreen: '#b9f27c',
        brightYellow: '#ffc777',
        brightBlue: '#8db0ff',
        brightMagenta: '#caabff',
        brightCyan: '#b4f9f8',
        brightWhite: '#c0caf5',
      },
    },
  },
];
