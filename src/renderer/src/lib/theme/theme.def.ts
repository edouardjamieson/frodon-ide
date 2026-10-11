/**
 * Frodon's theming model, carried over from the TUI intact.
 *
 * This was the best-designed thing in the terminal version and none of it was
 * terminal-specific. Colors resolve in three layers, each narrower than the
 * last:
 *
 *   palette  — the ~18 colors a theme author actually writes
 *   roles    — every themeable surface in the UI, each defaulting to a palette
 *              entry (`sidebarBg` -> `bg`) and individually overridable
 *   syntax   — ten semantic groups the editor maps grammar tokens onto
 *
 * Components only ever read *roles* and *syntax*, never the palette directly.
 * That indirection is what makes a light theme possible: nothing in the UI
 * knows that `bg` happens to be dark.
 *
 * What changed in the port: roles are emitted as CSS custom properties rather
 * than passed down through React, so a theme switch is one write to
 * `document.documentElement` instead of a re-render of the tree. And the
 * `icons` layer is gone entirely — it existed because a terminal can't ship a
 * font and every glyph had to be width-validated against the cell grid. In a
 * browser engine, icons are SVG and that whole problem evaporates.
 */

/** The small set of colors a theme author writes. Everything else derives. */
export interface ThemePalette {
  /** Deepest surface: the app background, sidebar, status bar, terminal. */
  bg: string;
  /** Raised surface: toolbars, inactive tabs, menu rows. */
  bgElevated: string;
  /** Floating surface: dialogs, the command palette, tooltips. */
  bgOverlay: string;
  /** Active/selected surface: the focused tab, a highlighted row, inputs. */
  bgHighlight: string;
  /** A stronger selection than `bgHighlight`, for an explicitly picked row. */
  bgSelection: string;
  /** Dimmed backdrop behind a modal. May carry alpha (`#00000080`). */
  scrim: string;

  /** Separators, pane borders, dialog outlines. */
  border: string;

  /** Primary text. */
  fg: string;
  /** Secondary text: inactive tree rows, hints. */
  fgMuted: string;
  /** Tertiary text: line numbers, descriptions, search previews. */
  fgSubtle: string;
  /** Text drawn *on top of* `accent` — must contrast with it, not with `bg`. */
  fgOnAccent: string;

  /** The brand color. Marks where you are: focus, cursor, current branch. */
  accent: string;
  /** A step down from `accent`, for hover states and inactive matches. */
  accentMuted: string;
  /** The faintest accent, for washes behind text that must stay readable. */
  accentSubtle: string;

  danger: string;
  warning: string;
  success: string;
}

export type PaletteKey = keyof ThemePalette;

/**
 * Every themeable surface in the UI.
 *
 * A theme may leave any of these out; the omitted ones fall back to the
 * palette entry named in `ROLE_DEFAULTS`. A role that *is* given is either a
 * literal hex string or the name of a palette key, so
 * `"paneBorderFocused": "danger"` works without repeating the hex.
 */
export interface ThemeRoles {
  // Surfaces
  appBg: string;
  titleBarBg: string;
  sidebarBg: string;
  sidebarHeaderBg: string;
  statusBarBg: string;
  editorBg: string;
  terminalBg: string;
  tabBarBg: string;
  tabActiveBg: string;
  tabInactiveBg: string;
  overlayBg: string;
  overlayElevatedBg: string;
  inputBg: string;
  tooltipBg: string;
  menuItemBg: string;
  menuItemHoverBg: string;
  menuItemSelectedBg: string;
  scrim: string;

  // Explorer
  explorerRowHoverBg: string;
  explorerRowSelectedBg: string;
  explorerRowOpenBg: string;
  explorerIndentGuide: string;
  explorerFileFg: string;
  explorerActiveFg: string;

  // Borders
  border: string;
  paneBorder: string;
  /** The focused pane's outline — the app's main "you are here" signal. */
  paneBorderFocused: string;
  tooltipBorder: string;
  /** Keyboard focus ring. Must stay visible against every surface. */
  focusRing: string;

  // Text
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  fgAccent: string;
  fgDanger: string;
  fgWarning: string;
  fgSuccess: string;

  // Buttons
  buttonBg: string;
  buttonHoverBg: string;
  buttonFg: string;
  buttonAccentBg: string;
  buttonAccentHoverBg: string;
  buttonAccentFg: string;

  // Editor chrome
  editorGutterBg: string;
  editorLineNumber: string;
  editorLineNumberActive: string;
  editorActiveLineBg: string;
  editorSelectionBg: string;
  editorCursor: string;
  editorSearchMatchBg: string;
  editorSearchMatchActiveBg: string;

  // Git
  gitStagedFg: string;
  gitChangedFg: string;
  gitUntrackedFg: string;

  // Scrollbars
  scrollbarThumb: string;
  scrollbarThumbHover: string;

  // Errors
  errorBorder: string;
  errorTitleFg: string;
}

export type RoleKey = keyof ThemeRoles;

/**
 * Syntax colors as ten semantic groups rather than a grammar's ~25 token
 * types. Theme authors shouldn't have to know what `attr-value` is; the
 * token -> group mapping is the editor's business.
 */
export interface ThemeSyntax {
  /** Text no grammar claimed, and the fallback for unmapped token types. */
  plain: string;
  comment: string;
  keyword: string;
  string: string;
  number: string;
  function: string;
  variable: string;
  class: string;
  tag: string;
  punctuation: string;
}

/** A fully resolved theme: what the store holds and components read. */
export interface Theme {
  name: string;
  /** Human-readable one-liner, shown in the theme picker. */
  description: string;
  /** Whether the background is dark. Drives the `color-scheme` CSS property. */
  dark: boolean;
  palette: ThemePalette;
  /** Resolved roles — always literal hex, never a palette key name. */
  colors: ThemeRoles;
  syntax: ThemeSyntax;
}

/**
 * A theme as written on disk or shipped as a built-in.
 *
 * Everything but `name` is optional: whatever a definition leaves out comes
 * from the theme it `extends` (and ultimately from the default theme), so
 * recoloring one thing is a four-line file.
 */
export interface ThemeDefinition {
  name: string;
  description?: string;
  dark?: boolean;
  /**
   * Theme to inherit from, by name. Defaults to the built-in default theme.
   * Chains are followed until a theme without `extends` is reached; a cycle is
   * reported and the chain cut rather than hanging.
   */
  extends?: string;
  colors?: {
    palette?: Partial<ThemePalette>;
    /** Each value is a literal hex color or the name of a palette key. */
    roles?: Partial<Record<RoleKey, string>>;
    syntax?: Partial<ThemeSyntax>;
  };
}

export interface ThemeStore {
  theme: Theme;
  /** Every theme that can be selected: built-ins plus whatever config adds. */
  available: ThemeDefinition[];
  setTheme: (theme: Theme) => void;
  setAvailable: (available: ThemeDefinition[]) => void;
}
