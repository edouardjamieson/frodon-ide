import type {
  AccentKey,
  PaletteKey,
  RoleKey,
  ThemeDefinition,
} from './theme.def';

/** The theme used when config names none, and the root of every `extends` chain. */
export const DEFAULT_THEME_NAME = 'frodon-dark';

/**
 * The accent family, as lightness and chroma per step.
 *
 * The hue is the project's and nothing here knows it. What these numbers
 * decide is everything else: how bright the accent is against this kind of
 * background, and where the two washes sit relative to it.
 *
 * **The washes go opposite ways on the two backgrounds**, which is the reason
 * there are four steps and not three. On a dark theme, text over a wash is
 * light, so a wash has to be *darker* than the accent; on a light theme the
 * text is dark, so it has to be *lighter*. `accentMuted` is not a wash at all
 * — it is the hover state of a filled accent button, with `fgOnAccent` on top
 * — so it steps toward the background in both.
 *
 * `oklch` rather than hex for the reason the project color was always
 * generated that way: L is perceptual, so one pair of numbers holds across
 * all 360 hues. A hue that is out of sRGB at this chroma has the chroma
 * reduced until it fits, rather than being clipped per channel into a
 * different hue — see `oklchToHex`.
 */
export const ACCENT_RAMP: Record<
  'dark' | 'light',
  Record<AccentKey, { lightness: number; chroma: number }>
> = {
  dark: {
    accent: { lightness: 0.78, chroma: 0.14 },
    accentMuted: { lightness: 0.64, chroma: 0.13 },
    accentStrong: { lightness: 0.52, chroma: 0.11 },
    accentSubtle: { lightness: 0.4, chroma: 0.08 },
  },
  light: {
    accent: { lightness: 0.56, chroma: 0.15 },
    accentMuted: { lightness: 0.46, chroma: 0.14 },
    accentStrong: { lightness: 0.82, chroma: 0.14 },
    accentSubtle: { lightness: 0.92, chroma: 0.07 },
  },
};

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
  // The *strong* wash, not the muted fill: both of these sit behind the
  // document's own text, and `accentMuted` is a button color that happens to
  // land near one of them on a dark background and nowhere near it on a light
  // one. See `ACCENT_RAMP`.
  editorSearchMatchActiveBg: 'accentStrong',

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
 * None of them names an accent, and none of them can: that one color is the
 * open project's, generated per theme from `ACCENT_RAMP` above. What a theme
 * owns is everything around it — the neutrals it sits on, the syntax, the
 * sixteen terminal colors.
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
    description: 'The default. Near-black neutrals that get out of the way.',
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
    description:
      'The same shapes on paper, with everything deepened to hold on white.',
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

        danger: '#c81e1e',
        warning: '#a16207',
        success: '#15803d',
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
    description: 'Cool blue-grey neutrals for working after dark.',
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
