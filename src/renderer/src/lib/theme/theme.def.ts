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

  /**
   * The accent family: **generated, never authored.**
   *
   * These four are the one part of a resolved palette that does not come from
   * the theme. The accent is the open project's color — see
   * `lib/project/project.service.ts` — built at the lightness and chroma this
   * theme's mode calls for, so every place the UI says "here you are" says it
   * in the color of the project you are in. A theme that shipped an accent of
   * its own would be a second brand color competing with the project's, which
   * is exactly the thing this app does not want: `ThemeDefinition` therefore
   * cannot express one.
   *
   * Only the hue is the project's. The four steps below are the theme's, and
   * they go in opposite directions on a dark background and a light one —
   * which is the whole reason there are four. See `ACCENT_RAMP`.
   */

  /** The project's color. Focus, cursor, current branch, accent fills. */
  accent: string;
  /** A step toward the background: hover states of an accent fill. */
  accentMuted: string;
  /** The faintest wash, behind text that must stay readable. */
  accentSubtle: string;
  /** A stronger wash, still behind body text: the match you are on. */
  accentStrong: string;

  danger: string;
  warning: string;
  success: string;
}

export type PaletteKey = keyof ThemePalette;

/** The entries a theme does not get to write. See `ThemePalette`. */
export type AccentKey =
  'accent' | 'accentMuted' | 'accentSubtle' | 'accentStrong';

/** What a theme author actually writes: everything but the accent family. */
export type AuthoredPalette = Omit<ThemePalette, AccentKey>;

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

  // Terminal chrome. The sixteen ANSI colors are their own layer — see
  // `ThemeAnsi` — because they are a fixed convention rather than surfaces.
  terminalFg: string;
  terminalCursor: string;
  terminalSelectionBg: string;

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
  /** A file with an unresolved merge conflict — the one you cannot commit. */
  gitConflictedFg: string;
  /** Added and removed lines in a patch. The row tint is these at low alpha. */
  gitDiffAddedFg: string;
  gitDiffRemovedFg: string;
  /**
   * The history graph. Lanes are told apart by position rather than by color
   * — the branch you are on is drawn in the project color instead, which is
   * the same "you are here" signal the focused pane uses.
   */
  gitGraphEdge: string;
  gitGraphNode: string;

  // Boards
  /**
   * The drawing surface. A board is a document, not a tool panel, so it sits
   * on the same deepest surface the editor does rather than on the sidebar's.
   */
  boardBg: string;
  /** The dot grid. Must be visible enough to align to and quiet enough to ignore. */
  boardGrid: string;
  /*
   * There is no role for the selection chrome, and none for the *ink* a
   * person draws in. The selection is the project's generated color, the same
   * "you are here" as the focused pane's border; the inks are the theme's
   * ANSI colors, which every theme already ships in full and already chooses
   * to be legible against its own background. See `BoardPaint` and `BoardInk`.
   */

  // Browser
  /**
   * The chrome around an embedded page: the address bar and its row of
   * controls. A tool surface rather than a document one — the page itself
   * brings its own background and we have no say in it.
   */
  browserBg: string;
  /**
   * The matte a sized viewport sits on.
   *
   * Only visible when a tab has been pinned to a device size smaller than the
   * tile, which is exactly when it earns its keep: it is what makes the page
   * read as a device of a known width rather than as a page that failed to
   * fill the pane.
   */
  browserStageBg: string;

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

/**
 * The sixteen colors a shell can ask for by number.
 *
 * A fourth layer, and the only one whose membership is dictated from outside:
 * `\e[31m` means "red" to every program ever written, and a theme that
 * renames it is simply wrong. So unlike roles, these are not overridable
 * individually against the palette — a theme either ships a terminal palette
 * or inherits the one it extends.
 *
 * They are deliberately *not* derived from `syntax`. A terminal's red is
 * `git diff`'s deletions, `npm`'s errors and `ls`'s broken symlink; the
 * editor's keyword color is a stylistic choice that happens to be reddish.
 */
export interface ThemeAnsi {
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
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
  ansi: ThemeAnsi;
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
    /**
     * Not `Partial<ThemePalette>`: the accent family is generated from the
     * open project's hue, so there is nothing for a theme to say about it and
     * saying it is a compile error rather than a value quietly dropped.
     */
    palette?: Partial<AuthoredPalette>;
    /** Each value is a literal hex color or the name of a palette key. */
    roles?: Partial<Record<RoleKey, string>>;
    syntax?: Partial<ThemeSyntax>;
    ansi?: Partial<ThemeAnsi>;
  };
}

export interface ThemeStore {
  /** The live theme, resolved against `available` *and* `hue`. */
  theme: Theme;
  /** Every theme that can be selected: built-ins plus whatever config adds. */
  available: ThemeDefinition[];
  /**
   * The hue the accent family is built from — the open project's — or null
   * when no project is open.
   *
   * It lives here rather than in the project store because it is an input to
   * theme resolution, and because this is the direction that does not make a
   * cycle: `lib/project` already reads the theme (it needs to know whether
   * the background is dark), so it pushes the hue in and reads the color back
   * out. Null is a chroma of zero — a grey accent, which is the honest answer
   * on a launcher with no project to be the color of.
   */
  hue: number | null;

  /** Resolves `name` against the current definitions and hue, and applies it. */
  select: (name: string) => void;
  setAvailable: (available: ThemeDefinition[]) => void;
  /** Re-resolves the live theme around a new accent hue. A no-op if unchanged. */
  setHue: (hue: number | null) => void;
}
