/**
 * OS bookkeeping files that are never worth showing. These are deliberately
 * not part of `files.exclude`: that list is the user's to shrink, and shrinking
 * it should never resurrect `.DS_Store`.
 */
export const ALWAYS_IGNORED = [
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '.Spotlight-V100',
  '.Trashes',
  '.fseventsd',
  '.AppleDouble',
  '.localized',
];
