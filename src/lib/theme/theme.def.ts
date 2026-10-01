/**
 * Frodon's theming model.
 *
 * Colors resolve in three layers, each one narrower than the last:
 *
 *   palette  — the ~18 colors a theme author actually writes
 *   roles    — every themeable surface in the UI, each defaulting to a palette
 *              entry (`sidebarBg` → `bg`) and individually overridable
 *   syntax   — ten semantic groups the editor maps refractor tokens onto
 *
 * Components only ever read *roles* and *syntax*, never the palette directly.
 * That indirection is what makes a light theme possible: nothing in the UI
 * knows that `bg` happens to be dark.
 *
 * A theme on disk is a `ThemeDefinition` — partial everywhere, `extends`-ing
 * another theme for whatever it leaves out. A `Theme` is what the store holds
 * once that chain has been flattened and validated: every field present, every
 * color a literal hex string, every icon a single terminal cell wide.
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

  /** Separators, window borders, dialog outlines. */
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

/** A palette key, usable anywhere a role wants "whatever that color is". */
export type PaletteKey = keyof ThemePalette;

/**
 * Every themeable surface in the UI.
 *
 * A theme may leave any of these out; the omitted ones fall back to the palette
 * entry named in `ROLE_DEFAULTS`. A role that *is* given is either a literal
 * hex string or the name of a palette key, so `"windowBorderFocused": "danger"`
 * works without repeating the hex.
 */
export interface ThemeRoles {
  // Surfaces
  appBg: string;
  sidebarBg: string;
  sidebarToolbarBg: string;
  statusBarBg: string;
  terminalBg: string;
  editorBg: string;
  tabBarBg: string;
  tabActiveBg: string;
  tabInactiveBg: string;
  overlayBg: string;
  overlayElevatedBg: string;
  inputBg: string;
  tooltipBg: string;
  menuItemBg: string;
  menuItemSelectedBg: string;
  scrim: string;

  // Explorer
  explorerRowSelectedBg: string;
  explorerRowOpenBg: string;
  explorerDirExpandedBg: string;
  explorerIndentBorder: string;
  explorerFileFg: string;
  explorerActiveFg: string;

  // Borders
  border: string;
  windowBorder: string;
  /** The focused window's outline — the app's main "you are here" signal. */
  windowBorderFocused: string;
  tooltipBorder: string;

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
  editorLineNumber: string;
  editorSelectionBg: string;
  editorCursorBg: string;
  editorSearchMatchBg: string;
  editorSearchMatchActiveBg: string;

  // Git
  gitStagedFg: string;
  gitChangedFg: string;

  // Errors
  errorBorder: string;
  errorTitleFg: string;
}

export type RoleKey = keyof ThemeRoles;

/**
 * Syntax colors as ten semantic groups rather than refractor's ~25 token types.
 *
 * Theme authors shouldn't have to know what `attr-value` or `function-variable`
 * are; the token → group mapping is the editor's business (see
 * `editor.constant.ts`).
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
 * The glyphs the UI draws.
 *
 * Each must measure one or two terminal cells — emoji are two, BMP symbols and
 * Nerd Font glyphs are one. The width itself doesn't matter; what matters is
 * that it's *known*, because `Icon` reserves exactly that many cells. A glyph
 * measuring zero or three-plus is rejected at load, since nothing can lay it
 * out predictably.
 *
 * Two caveats come with emoji, and they're why the bullets below aren't: emoji
 * ignore the foreground color, so they stay full-saturation in a dimmed or
 * unfocused pane, and a terminal occasionally disagrees with the layout engine
 * about their width.
 */
export interface ThemeIcons {
  // Disclosure / tree
  chevronRight: string;
  chevronLeft: string;
  chevronDown: string;
  /** Directory marker, shown next to the chevron — so not a chevron itself. */
  folder: string;
  folderOpen: string;
  file: string;

  // Bullets / status
  dot: string;
  circle: string;
  disc: string;
  diamond: string;
  square: string;

  // Status / actions
  check: string;
  /** The close *button*. For an inline affordance use `dismiss`. */
  close: string;
  /** Inline dismiss — the × on a tab or a search box, not a standalone button. */
  dismiss: string;
  cancel: string;
  cross: string;
  warning: string;
  blocked: string;
  plus: string;

  // Arrows
  arrowRight: string;
  arrowLeft: string;
  arrowUp: string;
  arrowDown: string;

  // Explorer toolbar
  newFile: string;
  newFolder: string;
  rename: string;
  delete: string;

  // Navigation
  menu: string;
  commands: string;
  search: string;
  document: string;
  terminal: string;

  // Windows
  splitHorizontal: string;
  splitVertical: string;
  move: string;

  // Git
  gitBranch: string;
  gitPush: string;
  gitPull: string;

  // Theming
  palette: string;
}

export type IconName = keyof ThemeIcons;

/** A fully resolved theme: what the store holds and components read. */
export interface Theme {
  name: string;
  /** Human-readable one-liner, shown in the theme picker. */
  description: string;
  /** Whether the background is dark. Drives nothing in-app yet; informational. */
  dark: boolean;
  palette: ThemePalette;
  /** Resolved roles — always literal hex, never a palette key name. */
  colors: ThemeRoles;
  syntax: ThemeSyntax;
  icons: ThemeIcons;
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
   * reported and the chain is cut rather than hanging.
   */
  extends?: string;
  colors?: {
    palette?: Partial<ThemePalette>;
    /** Each value is a literal hex color or the name of a palette key. */
    roles?: Partial<Record<RoleKey, string>>;
    syntax?: Partial<ThemeSyntax>;
  };
  icons?: Partial<ThemeIcons>;
}

export interface ThemeStore {
  theme: Theme;
  /** Every theme that can be selected: built-ins plus whatever config adds. */
  available: ThemeDefinition[];
  setTheme: (theme: Theme) => void;
  setAvailable: (available: ThemeDefinition[]) => void;
}
