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
import type { TextPreferences } from '~/lib/config';

/**
 * The face code is set in: the chosen one in front of the app's own stack,
 * so a face this machine lacks falls through to a monospace one rather than
 * to whatever the browser defaults to.
 */
function codeFont(text: TextPreferences): string {
  return text.fontFamily
    ? `${text.fontFamily}, var(--font-mono)`
    : 'var(--font-mono)';
}

/**
 * Takes the text preferences as well as the theme, because both end up in
 * the one stylesheet and a second `EditorView.theme` for the font would be a
 * second stylesheet arguing with this one about `fontSize` — CodeMirror's
 * precedence between two themes is mount order, which is nothing anyone
 * should have to reason about to change a font.
 */
export function codeMirrorTheme(
  theme: Theme,
  text: TextPreferences
): Extension {
  const { colors, syntax } = theme;
  const font = codeFont(text);

  const base = EditorView.theme(
    {
      '&': {
        color: syntax.plain,
        backgroundColor: colors.editorBg,
        height: '100%',
        fontSize: `${text.fontSize}px`,
      },
      '.cm-content': {
        fontFamily: font,
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
      '.cm-scroller': { fontFamily: font, lineHeight: '1.6' },
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
    { tag: [t.strikethrough], textDecoration: 'line-through' },
  ]);

  return [base, syntaxHighlighting(highlight), markdownTheme(theme)];
}

/**
 * A markdown file drawn as a page — see `editor-markdown.service.ts`.
 *
 * Every rule is scoped by a class only the page puts on the editor, or by a
 * class only its decorations put on a line, so it costs a source file nothing
 * to carry. Installed with the rest of the colors rather than with the page,
 * so a theme change reaches it through the one compartment that already
 * handles theme changes.
 *
 * Tinted surfaces — a code block, inline code — are the text color mixed
 * thin rather than a role of their own. CodeMirror draws the selection
 * *behind* the lines, so an opaque line background would hide it, and a tint
 * of the foreground reads as a surface on a light theme and a dark one alike.
 */
function markdownTheme(theme: Theme): Extension {
  const { colors } = theme;
  const tint = `color-mix(in srgb, ${colors.fg} 6%, transparent)`;
  const prose =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif";

  return EditorView.theme({
    '&.cm-md-page .cm-scroller': { fontFamily: prose, lineHeight: '1.7' },
    // A measure, not the width of the tile: prose past eighty-odd characters
    // a line is hard to read, and a wide tile is the common case here.
    '&.cm-md-page .cm-content': {
      fontFamily: prose,
      fontSize: '14px',
      maxWidth: '760px',
      margin: '0 auto',
      padding: '28px 40px 40vh',
    },
    // Flush with the column, so a code block's box and a quote's bar line up
    // with the prose around them instead of hanging into the margin.
    '&.cm-md-page .cm-line': { padding: '0' },

    '.cm-md-heading': { fontWeight: '600', lineHeight: '1.35' },
    '.cm-md-h1': { fontSize: '1.85em', paddingTop: '0.5em' },
    '.cm-md-h2': { fontSize: '1.45em', paddingTop: '0.45em' },
    '.cm-md-h3': { fontSize: '1.2em', paddingTop: '0.35em' },
    '.cm-md-h4, .cm-md-h5, .cm-md-h6': { paddingTop: '0.25em' },

    '.cm-md-quote': {
      borderLeft: `3px solid ${colors.border}`,
      color: colors.fgMuted,
    },
    '&.cm-md-page .cm-line.cm-md-quote': { paddingLeft: '14px' },

    '.cm-md-bullet': {
      color: colors.fgMuted,
      display: 'inline-block',
      minWidth: '0.8em',
    },
    '.cm-md-ordered': { color: colors.fgMuted },
    '.cm-md-checkbox': {
      accentColor: colors.fgAccent,
      margin: '0 6px 0 0',
      verticalAlign: '-2px',
      cursor: 'pointer',
    },
    '.cm-md-task-done': {
      color: colors.fgSubtle,
      textDecoration: 'line-through',
    },
    '.cm-md-strike': { textDecoration: 'line-through' },
    '.cm-md-rule': {
      display: 'inline-block',
      width: '100%',
      height: '1px',
      verticalAlign: 'middle',
      backgroundColor: colors.border,
    },
    '.cm-md-link': {
      color: colors.fgAccent,
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
    },
    '.cm-md-inline-code': {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.88em',
      backgroundColor: tint,
      borderRadius: '4px',
      padding: '1px 4px',
    },

    // Paddings rather than margins throughout: CodeMirror measures a line by
    // its box, and a margin it cannot see puts every click below it off by
    // that much.
    '.cm-md-code, .cm-md-frontmatter, .cm-md-source': {
      fontFamily: 'var(--font-mono)',
      fontSize: '12.5px',
      lineHeight: '1.6',
    },
    '&.cm-md-page .cm-line.cm-md-code, &.cm-md-page .cm-line.cm-md-frontmatter':
      { backgroundColor: tint, padding: '0 16px' },
    '.cm-md-code-first, .cm-md-frontmatter-first': {
      borderTopLeftRadius: '6px',
      borderTopRightRadius: '6px',
      paddingTop: '4px !important',
    },
    '.cm-md-code-last, .cm-md-frontmatter-last': {
      borderBottomLeftRadius: '6px',
      borderBottomRightRadius: '6px',
      paddingBottom: '4px !important',
    },
    '.cm-md-frontmatter, .cm-md-source': { color: colors.fgSubtle },
    // The parser reads frontmatter as a rule and a heading, and colors it
    // that way. It is neither, so its highlighting is taken back off.
    '.cm-md-frontmatter span': {
      color: 'inherit',
      fontWeight: 'inherit',
      textDecoration: 'none',
    },
    '.cm-md-fence-hidden': { fontSize: '6px', lineHeight: '1' },
    '.cm-md-code-header': {
      display: 'inline-flex',
      width: '100%',
      justifyContent: 'space-between',
      fontFamily: prose,
      fontSize: '11px',
      color: colors.fgSubtle,
    },
    '.cm-md-code-copy': {
      cursor: 'pointer',
      color: colors.fgMuted,
      background: 'none',
      border: 'none',
      padding: '0',
      font: 'inherit',
    },
    '.cm-md-code-copy:hover': { color: colors.fg },

    '.cm-md-table': { padding: '6px 0', overflowX: 'auto' },
    '.cm-md-table table': { borderCollapse: 'collapse', fontSize: '13px' },
    '.cm-md-table th, .cm-md-table td': {
      border: `1px solid ${colors.border}`,
      padding: '4px 12px',
      textAlign: 'left',
    },
    '.cm-md-table th': { backgroundColor: tint, fontWeight: '600' },

    // Inline, so a run of badges sits in a row the way it does on GitHub and
    // a centered container centers a picture the way it centers text.
    '.cm-md-image img': {
      display: 'inline-block',
      verticalAlign: 'middle',
      maxWidth: '100%',
      // A screenshot is often taller than the pane; a page you have to
      // scroll past one picture to keep reading is not much of a page.
      maxHeight: '60vh',
      borderRadius: '6px',
      margin: '4px 0',
    },
    '.cm-md-image-missing': {
      display: 'inline-block',
      color: colors.fgSubtle,
      fontSize: '12px',
      border: `1px solid ${colors.border}`,
      borderRadius: '4px',
      padding: '0 6px',
      margin: '2px 4px 2px 0',
    },

    // HTML written in the file — see `editor-markdown-html.service.ts`.
    '.cm-md-align-center': { textAlign: 'center' },
    '.cm-md-align-right': { textAlign: 'right' },
    // A flow root, so the margins of what is inside stay inside the box
    // CodeMirror measures.
    '.cm-md-html': { display: 'flow-root', padding: '2px 0' },
    '.cm-md-html p, .cm-md-html ul, .cm-md-html ol, .cm-md-html pre': {
      margin: '0.4em 0',
    },
    '.cm-md-html ul, .cm-md-html ol': { paddingLeft: '1.5em' },
    '.cm-md-html ul': { listStyle: 'disc' },
    '.cm-md-html ol': { listStyle: 'decimal' },
    '.cm-md-html h1, .cm-md-html h2, .cm-md-html h3': {
      fontWeight: '600',
      margin: '0.4em 0',
    },
    '.cm-md-html h1': { fontSize: '1.85em' },
    '.cm-md-html h2': { fontSize: '1.45em' },
    '.cm-md-html h3': { fontSize: '1.2em' },
    '.cm-md-html summary': { cursor: 'pointer' },
    '.cm-md-html table': { borderCollapse: 'collapse', margin: '0 auto' },
    '.cm-md-html th, .cm-md-html td': {
      border: `1px solid ${colors.border}`,
      padding: '4px 12px',
    },
    '.cm-md-html b, .cm-md-html strong, .cm-md-tag-b, .cm-md-tag-strong': {
      fontWeight: '600',
    },
    '.cm-md-html i, .cm-md-html em, .cm-md-tag-i, .cm-md-tag-em': {
      fontStyle: 'italic',
    },
    '.cm-md-tag-u, .cm-md-tag-ins': { textDecoration: 'underline' },
    '.cm-md-tag-s, .cm-md-tag-del, .cm-md-tag-strike': {
      textDecoration: 'line-through',
    },
    '.cm-md-tag-sub': { verticalAlign: 'sub', fontSize: '0.8em' },
    '.cm-md-tag-sup': { verticalAlign: 'super', fontSize: '0.8em' },
    '.cm-md-tag-small': { fontSize: '0.85em' },
    '.cm-md-tag-mark, .cm-md-html mark': {
      backgroundColor: colors.editorSearchMatchBg,
      color: 'inherit',
    },
    '.cm-md-tag-code, .cm-md-html code, .cm-md-table code': {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.88em',
      backgroundColor: tint,
      borderRadius: '4px',
      padding: '1px 4px',
    },
    '.cm-md-tag-kbd, .cm-md-html kbd, .cm-md-table kbd': {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.85em',
      border: `1px solid ${colors.border}`,
      borderBottomWidth: '2px',
      borderRadius: '4px',
      padding: '0 5px',
      backgroundColor: tint,
    },

    // The `/` menu. CodeMirror's tooltip, dressed as the app's other menus.
    '.cm-tooltip.cm-tooltip-autocomplete': {
      backgroundColor: colors.overlayElevatedBg,
      border: `1px solid ${colors.tooltipBorder}`,
      borderRadius: '8px',
      padding: '4px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      fontFamily: prose,
      minWidth: '220px',
      maxHeight: '320px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '4px 8px',
      borderRadius: '6px',
      color: colors.fg,
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: colors.menuItemSelectedBg,
      color: colors.fg,
    },
    '.cm-md-slash-badge': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '24px',
      height: '24px',
      border: `1px solid ${colors.border}`,
      borderRadius: '4px',
      fontSize: '11px',
      color: colors.fgMuted,
      backgroundColor: colors.editorBg,
    },
    '.cm-completionLabel': { fontSize: '13px' },
    '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '600' },
  });
}
