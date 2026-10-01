import type { ThemeSyntax } from '~/lib/theme';

/**
 * Maps refractor's token types onto the ten syntax groups a theme defines.
 *
 * Refractor emits ~25 distinct token classes, but they collapse into far fewer
 * things a reader actually distinguishes — a keyword and an operator want the
 * same color, as do a string and an attribute value. Keeping the mapping here
 * rather than in the theme means a theme author never has to know what
 * `function-variable` or `attr-value` are; they color ten named groups and the
 * editor does the rest.
 *
 * Anything unmapped falls back to `plain`, so a grammar emitting an exotic
 * token renders as ordinary text instead of disappearing.
 */
export const SYNTAX_GROUP_BY_TOKEN: Record<string, keyof ThemeSyntax> = {
  comment: 'comment',
  prolog: 'comment',
  doctype: 'comment',
  cdata: 'comment',

  keyword: 'keyword',
  operator: 'keyword',
  'attr-name': 'keyword',

  string: 'string',
  char: 'string',
  regex: 'string',
  'attr-value': 'string',

  number: 'number',
  boolean: 'number',
  constant: 'number',
  property: 'number',

  function: 'function',
  'function-variable': 'function',
  'variable-function': 'function',

  variable: 'variable',

  class: 'class',
  'class-name': 'class',
  builtin: 'class',

  tag: 'tag',

  punctuation: 'punctuation',
};
