import type { ViewportPreset } from './browser.def';

/** Where a tab sits before it has been pointed at anything. */
export const BLANK_URL = 'about:blank';

/**
 * What a typed string that is not a URL turns into.
 *
 * A browser without a search box is a browser you have to know the URL for,
 * which is not one anybody uses. DuckDuckGo rather than Google because this
 * query is whatever someone typed into an IDE, and the one that doesn't build
 * a profile out of it is the better default. It is a constant and not a
 * setting only because there is no settings layer yet — see
 * `docs/migration.md`.
 */
export const SEARCH_URL = 'https://duckduckgo.com/?q=';

/**
 * The device sizes in the picker, in CSS pixels.
 *
 * Deliberately short. These are the widths a layout actually breaks at — a
 * small phone, a current phone, a tablet, a laptop, a desktop — and a list of
 * forty devices is a list nobody reads past the first five. Anything else is
 * two number fields away under "Custom".
 */
export const VIEWPORT_PRESETS: ViewportPreset[] = [
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667 },
  { id: 'iphone', label: 'iPhone', width: 393, height: 852 },
  { id: 'ipad', label: 'iPad', width: 820, height: 1180 },
  { id: 'laptop', label: 'Laptop', width: 1280, height: 800 },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900 },
];

/**
 * How far a custom viewport may be dragged.
 *
 * The floor is a real phone's narrowest sensible width; the ceiling is past
 * any display anyone is previewing for, and exists so a typo in the width
 * field cannot ask the compositor for a 90,000-pixel-wide layer.
 */
export const MIN_VIEWPORT = 200;
export const MAX_VIEWPORT = 4000;
