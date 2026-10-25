import { FolderRoot, UserIcon } from 'lucide-react';
import type { SettingsCategory, SettingsSection } from './settings.def';

/**
 * Every page of the dialog, in the order the sidebar lists them.
 *
 * Grouped by scope on screen, so the first thing a page tells you is which
 * file it writes to. Project comes first because it is the one with a
 * consequence for other people: everything on those pages ends up in a
 * commit.
 *
 * Labels and descriptions live here rather than in the components for the
 * reason `DEFAULT_KEYBINDINGS` is a table — the sidebar and the page heading
 * are two views of one list, and two copies of a string is one chance for
 * them to disagree.
 */
export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: 'project.general',
    scope: 'project',
    label: 'General',
    description:
      'How this project introduces itself. Saved in the repository, so everyone who opens it sees the same thing.',
  },
  {
    id: 'project.files',
    scope: 'project',
    label: 'Files',
    description:
      'What the explorer, search and the file picker leave out. Saved in the repository, so everyone who clones it skips the same things.',
  },
  {
    id: 'user.appearance',
    scope: 'user',
    label: 'Appearance',
    description: 'The colors every project is drawn in on this machine.',
  },
  {
    id: 'user.shortcuts',
    scope: 'user',
    label: 'Shortcuts',
    description:
      'The chords the app listens for. Reading only, until the config layer can rebind them.',
  },
  {
    id: 'user.feedback',
    scope: 'user',
    label: 'Feedback',
    description: 'Something broken, or something missing.',
  },
];

/** Where the dialog opens when nobody said. */
export const DEFAULT_SETTINGS_SECTION: SettingsSection = 'project.general';

/** What each scope is called, and which file it writes. */
export const SETTINGS_SCOPES = [
  {
    scope: 'project' as const,
    label: 'Project',
    file: '.frodon/config.json',
    icon: FolderRoot,
  },
  {
    scope: 'user' as const,
    label: 'You',
    file: '~/.frodon/config.json',
    icon: UserIcon,
  },
];

/**
 * The hues the swatch row offers, every 15 degrees.
 *
 * Twenty-four, and they are *presets* rather than the whole choice — the
 * strip underneath them covers all 360, so these exist to be clicked rather
 * than to be the only way through. Fifteen degrees apart is close enough that
 * two neighbours read as the same family and far enough that a row of them
 * still scans as a spectrum.
 *
 * They are drawn through `projectColorFromHue`, so a swatch is the theme's
 * own lightness and chroma: what you see is exactly what the project — and,
 * since the accent follows it, the whole window — will be.
 */
export const HUE_SWATCHES = Array.from({ length: 24 }, (_, step) => step * 15);

/**
 * How many stops the spectrum strip is drawn from.
 *
 * One more than the swatches, so the gradient closes the circle: the last
 * stop is 360°, which is the same color as the first, and without it the
 * strip would run out of red before it got back to it.
 */
export const SPECTRUM_STOPS = 25;

/**
 * A few icons to click instead of type.
 *
 * Not a picker — the platform has one of those, and on macOS it is a chord
 * away in the field right beside this. It is a shortcut for the common case
 * of wanting *something* there, which is why these are generic rather than
 * clever.
 */
export const ICON_SUGGESTIONS = [
  '📦',
  '🚀',
  '🧪',
  '🛠️',
  '🌱',
  '⚡️',
  '🔭',
  '🧩',
  '📓',
  '🎛️',
  '🐙',
  '🧙',
];
