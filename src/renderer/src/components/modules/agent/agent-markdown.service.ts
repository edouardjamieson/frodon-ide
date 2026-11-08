/**
 * The pieces a reply needs to be drawn as markdown: a parser, a highlighter
 * for its code blocks, and the grammar a fence names.
 *
 * The parser is `@lezer/markdown`, the one CodeMirror already uses for a
 * `.md` file — so it costs the bundle nothing, and a reply and a markdown
 * page agree on what a table is. It produces a syntax tree, not HTML, and
 * the tile turns that tree into React elements itself: there is no HTML
 * string anywhere between an agent's words and the screen, so nothing an
 * agent writes — or quotes from a web page it read — can become markup.
 * ADR-0046.
 */
import {
  LanguageDescription,
  type LanguageSupport,
} from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightCode, tagHighlighter } from '@lezer/highlight';
import { GFM, parser } from '@lezer/markdown';
import type { Tree } from '@lezer/common';
import { SYNTAX_TAGS, type ThemeSyntax } from '~/lib/theme';

/** GitHub's dialect: tables, task lists, strikethrough, bare URLs. */
const markdownParser = parser.configure(GFM);

export function parseMarkdown(text: string): Tree {
  return markdownParser.parse(text);
}

/**
 * Each syntax group as a utility class over the theme's own property.
 *
 * Written out whole so Tailwind finds them in the source. A class rather than
 * a color read through `useTheme`, so a theme switch restyles every reply
 * already on screen without a render, the way it restyles everything else.
 */
const GROUP_CLASSES: Record<keyof ThemeSyntax, string> = {
  plain: 'text-(--fd-syntax-plain)',
  comment: 'text-(--fd-syntax-comment)',
  keyword: 'text-(--fd-syntax-keyword)',
  string: 'text-(--fd-syntax-string)',
  number: 'text-(--fd-syntax-number)',
  function: 'text-(--fd-syntax-function)',
  variable: 'text-(--fd-syntax-variable)',
  class: 'text-(--fd-syntax-class)',
  tag: 'text-(--fd-syntax-tag)',
  punctuation: 'text-(--fd-syntax-punctuation)',
};

const codeHighlighter = tagHighlighter(
  SYNTAX_TAGS.map(({ group, tags, italic }) => ({
    tag: tags,
    class: italic ? `${GROUP_CLASSES[group]} italic` : GROUP_CLASSES[group],
  }))
);

/** One run of code text, with the classes its tokens earned. */
export interface CodeSpan {
  text: string;
  className: string;
}

/**
 * The grammar a fence's info string names — ` ```ts `, ` ```python ` — or
 * null for none, or one CodeMirror does not ship.
 *
 * By name and alias rather than by file extension, which is what a fence
 * carries. Only the first word: an info string can say `ts title="x.ts"`.
 */
export function grammarFor(info: string): LanguageDescription | null {
  const name = info.trim().split(/\s/)[0];
  if (!name) return null;
  return LanguageDescription.matchLanguageName(languages, name, true);
}

/** Code as lines of highlighted spans, ready to draw. */
export function highlightLines(
  code: string,
  grammar: LanguageSupport
): CodeSpan[][] {
  const lines: CodeSpan[][] = [[]];
  highlightCode(
    code,
    grammar.language.parser.parse(code),
    codeHighlighter,
    (text, className) => lines[lines.length - 1]?.push({ text, className }),
    () => lines.push([])
  );
  return lines;
}
