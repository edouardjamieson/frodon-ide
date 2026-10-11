/**
 * The CodeMirror theme, derived from the active Frodon theme.
 *
 * CodeMirror is one of the few places that can't read our CSS custom
 * properties directly — it builds stylesheets through its own `EditorView.theme`
 * API — so this is where a resolved `Theme` gets handed over explicitly.
 *
 * `syntaxHighlighting` maps Lezer's highlight tags onto our ten semantic
 * groups. That mapping replaces the TUI's `SYNTAX_GROUP_BY_TOKEN`, which did
 * the same job for refractor's token classes: a theme author still colors ten
 * named groups and never learns what a `tagName` or a `propertyName` is.
 */
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';
import type { Theme } from '~/lib/theme';

export function codeMirrorTheme(theme: Theme): Extension {
  const { colors, syntax } = theme;

  const base = EditorView.theme(
    {
      '&': {
        color: syntax.plain,
        backgroundColor: colors.editorBg,
        height: '100%',
        fontSize: '13px',
      },
      '.cm-content': {
        fontFamily: 'var(--font-mono)',
        caretColor: colors.editorCursor,
        padding: '8px 0',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: colors.editorCursor,
        borderLeftWidth: '2px',
      },
      // CodeMirror draws its own selection layer when `drawSelection` is on,
      // and the native `::selection` still shows through on some surfaces —
      // both are set so the color holds either way.
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        { backgroundColor: colors.editorSelectionBg },
      '.cm-activeLine': { backgroundColor: colors.editorActiveLineBg },
      '.cm-gutters': {
        backgroundColor: colors.editorGutterBg,
        color: colors.editorLineNumber,
        border: 'none',
        borderRight: `1px solid ${colors.border}`,
      },
      '.cm-activeLineGutter': {
        backgroundColor: colors.editorActiveLineBg,
        color: colors.editorLineNumberActive,
      },
      '.cm-searchMatch': { backgroundColor: colors.editorSearchMatchBg },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: colors.editorSearchMatchActiveBg,
      },
      '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
      // The focus ring belongs to the pane, not the text area.
      '&.cm-focused': { outline: 'none' },
    },
    { dark: theme.dark }
  );

  const highlight = HighlightStyle.define([
    {
      tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
      color: syntax.comment,
      fontStyle: 'italic',
    },
    {
      tag: [
        t.keyword,
        t.modifier,
        t.controlKeyword,
        t.operatorKeyword,
        t.definitionKeyword,
        t.moduleKeyword,
      ],
      color: syntax.keyword,
    },
    {
      tag: [
        t.operator,
        t.compareOperator,
        t.logicOperator,
        t.arithmeticOperator,
      ],
      color: syntax.keyword,
    },
    {
      tag: [t.string, t.special(t.string), t.regexp, t.character],
      color: syntax.string,
    },
    {
      tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom],
      color: syntax.number,
    },
    {
      tag: [
        t.function(t.variableName),
        t.function(t.propertyName),
        t.macroName,
      ],
      color: syntax.function,
    },
    {
      tag: [t.variableName, t.propertyName, t.attributeValue],
      color: syntax.variable,
    },
    {
      tag: [t.className, t.typeName, t.namespace, t.standard(t.variableName)],
      color: syntax.class,
    },
    { tag: [t.tagName, t.angleBracket], color: syntax.tag },
    { tag: [t.attributeName], color: syntax.keyword },
    {
      tag: [
        t.punctuation,
        t.separator,
        t.bracket,
        t.paren,
        t.brace,
        t.squareBracket,
      ],
      color: syntax.punctuation,
    },
    { tag: [t.invalid], color: colors.fgDanger },
    {
      tag: [t.link, t.url],
      color: colors.fgAccent,
      textDecoration: 'underline',
    },
    { tag: [t.heading], color: syntax.function, fontWeight: 'bold' },
    { tag: [t.emphasis], fontStyle: 'italic' },
    { tag: [t.strong], fontWeight: 'bold' },
  ]);

  return [base, syntaxHighlighting(highlight)];
}
