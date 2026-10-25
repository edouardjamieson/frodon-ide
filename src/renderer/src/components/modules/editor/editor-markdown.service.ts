/**
 * A markdown file drawn as a page, inside the same CodeMirror view as any
 * other file.
 *
 * Every block — a paragraph, a heading, a list item, a fence, a table — is
 * drawn rendered: its syntax hidden, its bullets and boxes and rules drawn,
 * its pictures shown. The block the cursor is in is drawn as the markdown it
 * is, so editing is typing into source and never a form that writes source
 * on your behalf.
 *
 * Built as decorations over the document rather than as a block editor beside
 * it, which is the whole design. The text in the view is the file, byte for
 * byte, so everything the editor already does for a file keeps working
 * untouched: one `EditorState` per tab, the undo history, saving, the star,
 * the three-text answer to a file rewritten on disk, find-in-file, a jump
 * from project search. A block editor would have had a model of its own, and
 * every one of those would have needed a translation in and out of it — and a
 * markdown file round-tripped through a model is a file reformatted by one.
 */
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
} from '@codemirror/view';
import {
  Facet,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
  type Text,
} from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import type { SyntaxNode, Tree } from '@lezer/common';
import { useWindowStore } from '~/lib/window';
import {
  BLOCK_NODES,
  BULLETS,
  HTML_INLINE,
  INLINE_HOSTS,
  WHOLE_NODES,
} from './editor-markdown.constant';
import {
  BulletWidget,
  CheckboxWidget,
  CodeHeaderWidget,
  HtmlWidget,
  ImageWidget,
  RuleWidget,
  SpaceWidget,
  TableWidget,
} from './editor-markdown-widget.service';
import {
  HtmlContainers,
  attributeOf,
  isBare,
} from './editor-markdown-html.service';
import { resolveFrom } from './editor-markdown-picture.service';
import { slashMenu } from './editor-markdown-slash.service';

/**
 * The grammar a markdown file is opened with, in place of the one the language
 * registry would hand over.
 *
 * The registry's is CommonMark: no tables, no strikethrough, no task lists,
 * and a fenced block that is one grey string. This is GitHub's dialect, and it
 * hands each fence to the grammar its info string names — fetched from the
 * same registry, on first sight, the way a file's own grammar is. A `ts` block
 * is highlighted as TypeScript whether the page is rendered or in source.
 *
 * `addKeymap` brings Enter that continues a list or a quote and Backspace that
 * takes a marker away, which is most of what makes typing a list feel like a
 * page rather than a text file.
 */
export const markdownGrammar: Extension = markdown({
  base: markdownLanguage,
  codeLanguages: languages,
  addKeymap: true,
});

interface Span {
  from: number;
  to: number;
}

/** Which file the document is, so a picture or a link can be resolved. */
const documentPath = Facet.define<string | null, string | null>({
  combine: (values) => values[0] ?? null,
});

/**
 * The editor gaining or losing focus.
 *
 * Unfocused, the page reveals nothing — the cursor is not there to be typing
 * — so a document you are only reading is drawn entirely as a page.
 */
const setFocused = StateEffect.define<boolean>();

/**
 * A YAML block at the very top of the file, or null.
 *
 * Markdown has no such thing, so the parser reads the opening `---` as a rule
 * and the closing one as the underline of a heading made of the last key. It
 * is found here by its fences instead, drawn as a quiet block, and kept out of
 * reach of everything else.
 */
function frontmatter(doc: Text): Span | null {
  if (doc.lines < 2 || doc.line(1).text !== '---') return null;
  const limit = Math.min(doc.lines, 200);
  for (let n = 2; n <= limit; n++) {
    const text = doc.line(n).text;
    if (text === '---' || text === '...')
      return { from: 0, to: doc.line(n).to };
  }
  return null;
}

/** A node's range, widened to whole lines. */
function linesOf(doc: Text, from: number, to: number): Span {
  // A block that ends at the start of the next line ends on the line before.
  const last = to > from && doc.lineAt(to).from === to ? to - 1 : to;
  return { from: doc.lineAt(from).from, to: doc.lineAt(last).to };
}

/**
 * The block a position is in, as the lines it covers.
 *
 * The innermost block, unless one of its ancestors is drawn whole — see
 * `WHOLE_NODES`. Looked for on both sides of the position, because a cursor at
 * the very end of a paragraph is past its last character, and one at the very
 * start of it is before its first; each is found from one side only.
 *
 * A position in no block at all — a blank line, the marker of an empty list
 * item — is its own line.
 */
function blockAround(state: EditorState, pos: number, top: Span | null): Span {
  if (top && pos <= top.to) return top;

  const tree = syntaxTree(state);
  for (const side of [1, -1] as const) {
    let inner: SyntaxNode | null = null;
    let whole: SyntaxNode | null = null;
    for (
      let node: SyntaxNode | null = tree.resolveInner(pos, side);
      node;
      node = node.parent
    ) {
      if (WHOLE_NODES.has(node.name)) whole = node;
      else if (!inner && BLOCK_NODES.has(node.name)) inner = node;
    }
    const found = whole ?? inner;
    if (found) return linesOf(state.doc, found.from, found.to);
  }

  const line = state.doc.lineAt(pos);
  return { from: line.from, to: line.to };
}

/** The spans drawn as source: the block under every cursor, merged. */
function revealedSpans(state: EditorState, focused: boolean): Span[] {
  if (!focused) return [];

  const top = frontmatter(state.doc);
  const spans = state.selection.ranges
    .map((range) => {
      const start = blockAround(state, range.from, top);
      const end = range.empty ? start : blockAround(state, range.to, top);
      return { from: start.from, to: Math.max(start.to, end.to) };
    })
    .sort((a, b) => a.from - b.from);

  const merged: Span[] = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (previous && span.from <= previous.to + 1) {
      previous.to = Math.max(previous.to, span.to);
    } else merged.push({ ...span });
  }
  return merged;
}

function sameSpans(a: readonly Span[], b: readonly Span[]): boolean {
  return (
    a.length === b.length &&
    a.every((span, i) => span.from === b[i]?.from && span.to === b[i]?.to)
  );
}

const HIDDEN = Decoration.replace({});
const SOFT_BREAK = Decoration.replace({ widget: new SpaceWidget() });

/**
 * Every decoration on the page, given what is revealed.
 *
 * Two kinds, and the difference is the rule that keeps a click from moving
 * the text out from under the pointer: what is drawn *around* text — a
 * heading's size, a quote's bar, a code block's box — is drawn whether the
 * block is revealed or not, and only what *replaces* text — a hidden `##`, a
 * bullet, a rule, a table — is withdrawn when the cursor goes in. Going into a
 * heading shows its hashes; it does not shrink it.
 *
 * The whole tree is walked on each rebuild. A rebuild happens when the
 * document changes or the cursor crosses into another block — not on every
 * arrow key — and a markdown file is prose: a long one is a few thousand
 * lines, which is a few milliseconds.
 */
function decorate(
  state: EditorState,
  revealed: readonly Span[]
): DecorationSet {
  const { doc } = state;
  const file = state.facet(documentPath);
  const out: Range<Decoration>[] = [];

  const shown = (from: number, to: number) =>
    !revealed.some((span) => from <= span.to && to >= span.from);
  const lineClass = (at: number, className: string) =>
    out.push(Decoration.line({ class: className }).range(doc.lineAt(at).from));
  const eachLine = (from: number, to: number, className: string) => {
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(to).number;
    for (let n = first; n <= last; n++) {
      const classes = [className];
      if (n === first) classes.push(`${className}-first`);
      if (n === last) classes.push(`${className}-last`);
      out.push(
        Decoration.line({ class: classes.join(' ') }).range(doc.line(n).from)
      );
    }
  };
  const hide = (from: number, to: number) => {
    if (to > from) out.push(HIDDEN.range(from, to));
  };
  const spaceAfter = (at: number) =>
    doc.sliceString(at, at + 1) === ' ' ? 1 : 0;
  /**
   * Hides whole lines, with one of the line breaks around them — the one
   * before, or after for the first line of the file — so they leave no blank
   * line behind.
   */
  const hideLines = (span: Span) => {
    if (span.from > 0) hide(span.from - 1, span.to);
    else hide(span.from, Math.min(span.to + 1, doc.length));
  };

  /**
   * HTML tags inside a block's text: `<kbd>⌘P</kbd>`, `<br>`, an inline
   * `<img>`. A known inline tag with its closing tag in the same block has
   * both hidden and what is between them styled; a tag left open stays as
   * written, because there is no telling from here where it was meant to end.
   */
  const inlineHtml = (from: number, to: number) => {
    const open: { name: string; from: number; to: number; text: string }[] = [];
    syntaxTree(state).iterate({
      from,
      to,
      enter: (inner) => {
        if (inner.name !== 'HTMLTag' || inner.from < from || inner.to > to)
          return;
        const text = doc.sliceString(inner.from, inner.to);
        const tag = /^<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>$/.exec(text);
        if (!tag) return;
        const [, closing, rawName, selfClosing] = tag;
        const name = rawName!.toLowerCase();

        if (name === 'br') {
          hide(inner.from, inner.to);
        } else if (name === 'img') {
          out.push(
            Decoration.replace({
              widget: new ImageWidget(
                attributeOf(text, 'src') ?? '',
                attributeOf(text, 'alt') ?? '',
                file,
                attributeOf(text, 'width'),
                attributeOf(text, 'height')
              ),
            }).range(inner.from, inner.to)
          );
        } else if (closing) {
          const at = open.map((tag) => tag.name).lastIndexOf(name);
          if (at < 0) return;
          const start = open[at]!;
          open.splice(at);
          if (!HTML_INLINE.has(name)) return;
          hide(start.from, start.to);
          hide(inner.from, inner.to);
          if (inner.from > start.to) {
            const href = name === 'a' ? attributeOf(start.text, 'href') : null;
            out.push(
              Decoration.mark({
                class: href ? 'cm-md-link' : `cm-md-tag-${name}`,
                attributes: href ? { 'data-href': href, title: href } : {},
              }).range(start.to, inner.from)
            );
          }
        } else if (!selfClosing) {
          open.push({ name, from: inner.from, to: inner.to, text });
        }
      },
    });
  };

  const containers = new HtmlContainers();

  const top = frontmatter(doc);
  if (top) eachLine(top.from, top.to, 'cm-md-frontmatter');

  syntaxTree(state).iterate({
    enter: (ref) => {
      const { name, from, to } = ref;
      if (top && from < top.to && name !== 'Document') return false;
      const node = ref.node;

      // Markdown between an HTML container's opening and closing tags takes
      // its alignment, line by line.
      const align = containers.align;
      if (
        align &&
        node.parent?.name === 'Document' &&
        name !== 'HTMLBlock' &&
        name !== 'CommentBlock'
      ) {
        const span = linesOf(doc, from, to);
        for (let at = span.from; at <= span.to; at = doc.lineAt(at).to + 1) {
          lineClass(at, `cm-md-align-${align}`);
        }
      }

      if (INLINE_HOSTS.has(name) && shown(from, to)) inlineHtml(from, to);

      // A single line break inside a paragraph is a space, in markdown — it
      // is how a file wrapped at eighty columns stays one paragraph. Drawn as
      // a break, every README written that way would read as a ragged column
      // and a row of badges as a stack. Each break is drawn as a space, with
      // the next line's indentation; a hard break, two spaces or a backslash
      // at the end of the line, is left a break.
      if (name === 'Paragraph' && shown(from, to)) {
        const last = doc.lineAt(to).number;
        for (let n = doc.lineAt(from).number; n < last; n++) {
          const line = doc.line(n);
          if (/(?: {2}|\\)$/.test(line.text)) continue;
          const next = doc.line(n + 1);
          const indent = /^[ \t]*/.exec(next.text)![0].length;
          out.push(SOFT_BREAK.range(line.to, next.from + indent));
        }
      }

      const heading = /^ATXHeading(\d)$/.exec(name);
      if (heading) {
        lineClass(from, `cm-md-heading cm-md-h${heading[1]}`);
        if (shown(from, to)) {
          for (const mark of node.getChildren('HeaderMark')) {
            if (mark.from === from) hide(mark.from, Math.min(mark.to + 1, to));
            else hide(Math.max(mark.from - 1, from), mark.to);
          }
        }
        return;
      }

      const setext = /^SetextHeading(\d)$/.exec(name);
      if (setext) {
        const underline = node.getChild('HeaderMark');
        const end = underline ? doc.lineAt(underline.from).from - 1 : to;
        for (let at = from; at <= end; at = doc.lineAt(at).to + 1) {
          lineClass(at, `cm-md-heading cm-md-h${setext[1]}`);
        }
        // The underline is a line of its own, so it goes with the newline
        // before it — hiding only its text would leave a blank line under
        // every heading written this way.
        if (underline && shown(from, to)) {
          const line = doc.lineAt(underline.from);
          hide(line.from - 1, line.to);
        }
        return;
      }

      switch (name) {
        case 'Emphasis':
        case 'StrongEmphasis':
          if (shown(from, to)) {
            for (const mark of node.getChildren('EmphasisMark'))
              hide(mark.from, mark.to);
          }
          return;

        case 'Strikethrough':
          out.push(Decoration.mark({ class: 'cm-md-strike' }).range(from, to));
          if (shown(from, to)) {
            for (const mark of node.getChildren('StrikethroughMark'))
              hide(mark.from, mark.to);
          }
          return;

        case 'InlineCode':
          out.push(
            Decoration.mark({ class: 'cm-md-inline-code' }).range(from, to)
          );
          if (shown(from, to)) {
            for (const mark of node.getChildren('CodeMark'))
              hide(mark.from, mark.to);
          }
          return false;

        case 'Link': {
          const [open, close] = node.getChildren('LinkMark');
          const url = node.getChild('URL');
          // A reference link — `[text][label]` — has no URL of its own to
          // follow, and stays as written.
          if (!url || !open || !close || !shown(from, to)) return;
          const href = doc.sliceString(url.from, url.to);
          hide(from, open.to);
          hide(close.from, to);
          if (close.from > open.to) {
            out.push(
              Decoration.mark({
                class: 'cm-md-link',
                attributes: { 'data-href': href, title: href },
              }).range(open.to, close.from)
            );
          }
          return;
        }

        case 'Image': {
          const url = node.getChild('URL');
          const [open, close] = node.getChildren('LinkMark');
          if (!url || !shown(from, to)) return false;
          const alt = open && close ? doc.sliceString(open.to, close.from) : '';
          out.push(
            Decoration.replace({
              widget: new ImageWidget(
                doc.sliceString(url.from, url.to),
                alt,
                file
              ),
            }).range(from, to)
          );
          return false;
        }

        case 'Blockquote': {
          const span = linesOf(doc, from, to);
          for (let at = span.from; at <= span.to; at = doc.lineAt(at).to + 1) {
            lineClass(at, 'cm-md-quote');
          }
          return;
        }

        case 'QuoteMark':
          if (shown(from, to)) hide(from, to + spaceAfter(to));
          return;

        case 'ListMark': {
          if (!shown(from, to)) return;
          const item = node.parent;
          const task = item?.getChild('Task');
          if (task) {
            // The checkbox stands in for the whole marker, so the `-` and the
            // space after it go.
            hide(from, task.from);
          } else if (item?.parent?.name === 'BulletList') {
            let depth = 0;
            for (let up = item.parent.parent; up; up = up.parent) {
              if (up.name === 'BulletList' || up.name === 'OrderedList')
                depth++;
            }
            out.push(
              Decoration.replace({
                widget: new BulletWidget(
                  BULLETS[depth % BULLETS.length] ?? '•'
                ),
              }).range(from, to)
            );
          } else {
            out.push(
              Decoration.mark({ class: 'cm-md-ordered' }).range(from, to)
            );
          }
          return;
        }

        case 'TaskMarker': {
          const checked = /x/i.test(doc.sliceString(from, to));
          const task = node.parent;
          if (checked && task && task.to > to) {
            out.push(
              Decoration.mark({ class: 'cm-md-task-done' }).range(to, task.to)
            );
          }
          if (shown(from, to)) {
            out.push(
              Decoration.replace({ widget: new CheckboxWidget(checked) }).range(
                from,
                to + spaceAfter(to)
              )
            );
          }
          return;
        }

        case 'HorizontalRule':
          if (shown(from, to)) {
            out.push(
              Decoration.replace({ widget: new RuleWidget() }).range(from, to)
            );
          }
          return false;

        case 'FencedCode': {
          const span = linesOf(doc, from, to);
          eachLine(span.from, span.to, 'cm-md-code');
          const opening = doc.lineAt(span.from);
          const closing = doc.lineAt(span.to);
          if (shown(from, to)) {
            const info = node.getChild('CodeInfo');
            const text = node.getChild('CodeText');
            out.push(
              Decoration.replace({
                widget: new CodeHeaderWidget(
                  info ? doc.sliceString(info.from, info.to) : '',
                  text ? doc.sliceString(text.from, text.to) : ''
                ),
              }).range(opening.from, opening.to)
            );
            // An unclosed fence runs to the end of the file, and its last
            // line is code rather than a fence to hide.
            const fences = node.getChildren('CodeMark');
            if (fences.length > 1 && closing.number > opening.number) {
              hide(closing.from, closing.to);
              lineClass(closing.from, 'cm-md-fence-hidden');
            }
          }
          // The children are the code's own grammar, which highlights itself
          // and has nothing here to decorate.
          return false;
        }

        case 'CodeBlock': {
          const span = linesOf(doc, from, to);
          eachLine(span.from, span.to, 'cm-md-code');
          return false;
        }

        case 'Table': {
          const span = linesOf(doc, from, to);
          if (shown(from, to)) {
            out.push(
              Decoration.replace({
                widget: new TableWidget(
                  doc.sliceString(span.from, span.to),
                  file
                ),
                block: true,
              }).range(span.from, span.to)
            );
          } else {
            eachLine(span.from, span.to, 'cm-md-source');
          }
          return false;
        }

        case 'HTMLBlock': {
          const span = linesOf(doc, from, to);
          const source = doc.sliceString(span.from, span.to);
          // Read before this block's own tags are, so a block that opens a
          // centered `<div>` draws it with the div's `align` attribute, and a
          // block *inside* one is drawn centered.
          const around = containers.align;
          containers.feed(source);
          if (!shown(from, to)) {
            eachLine(span.from, span.to, 'cm-md-source');
          } else if (isBare(source)) {
            hideLines(span);
          } else {
            out.push(
              Decoration.replace({
                widget: new HtmlWidget(source, file, around),
                block: true,
              }).range(span.from, span.to)
            );
          }
          return false;
        }

        // A comment is not drawn, on GitHub or here.
        case 'CommentBlock': {
          const span = linesOf(doc, from, to);
          if (shown(from, to)) hideLines(span);
          else eachLine(span.from, span.to, 'cm-md-source');
          return false;
        }

        case 'Comment':
          if (shown(from, to)) hide(from, to);
          return;

        case 'Escape':
          if (shown(from, to)) hide(from, from + 1);
          return;
      }
    },
  });

  return Decoration.set(out, true);
}

interface Preview {
  focused: boolean;
  revealed: readonly Span[];
  /** The tree the decorations were built from. */
  tree: Tree;
  decorations: DecorationSet;
}

/**
 * The page's decorations, and what they were built from.
 *
 * A state field rather than a view plugin, because a table is drawn as one
 * block in place of several lines and a hidden heading underline takes its
 * line break with it — and CodeMirror only accepts decorations that change
 * the shape of lines from a field, where it can see them before it lays the
 * document out.
 *
 * The tree is part of what is compared, because the parser works in the
 * background: a large file arrives parsed as far as the first screen, and the
 * rest of it, and every fence's own grammar, land as later transactions that
 * change nothing but the tree.
 */
const preview = StateField.define<Preview>({
  create(state) {
    return {
      focused: false,
      revealed: [],
      tree: syntaxTree(state),
      decorations: decorate(state, []),
    };
  },

  update(value, transaction) {
    let { focused } = value;
    for (const effect of transaction.effects) {
      if (effect.is(setFocused)) focused = effect.value;
    }

    const tree = syntaxTree(transaction.state);
    const same = !transaction.docChanged && tree === value.tree;
    if (same && focused === value.focused && !transaction.selection) {
      return value;
    }

    const revealed = revealedSpans(transaction.state, focused);
    // Moving the cursor within a block changes nothing on the page, which is
    // most cursor movement there is.
    if (same && sameSpans(revealed, value.revealed)) {
      return { ...value, focused };
    }

    return {
      focused,
      revealed,
      tree,
      decorations: decorate(transaction.state, revealed),
    };
  },

  provide: (field) =>
    EditorView.decorations.from(field, (value) => value.decorations),
});

/**
 * Tells the field whether the view has focus, on the way in.
 *
 * `focusChangeEffect` reports a *change*, and a state swapped into a view
 * that already has focus — a tab clicked from the keyboard, a file opened by
 * the picker — never sees one, so the block under the cursor would stay drawn
 * as a page while being typed into. A plugin is rebuilt for each state a view
 * is given, which makes it the place to ask once. The dispatch waits a
 * microtask because a plugin may not dispatch while it is being built.
 */
const focusSync = ViewPlugin.define((view) => {
  queueMicrotask(() => {
    const value = view.state.field(preview, false);
    if (value && value.focused !== view.hasFocus) {
      view.dispatch({ effects: setFocused.of(view.hasFocus) });
    }
  });
  return {};
});

/**
 * Mod-click on a rendered link opens the file it points at.
 *
 * Mod, because a plain click on a link is a click into its paragraph — that is
 * how you get at the link to edit it. A link to the web does nothing yet: the
 * browser tile opens onto an address bar, and taking a URL is a change to
 * `openBrowser` this has not made.
 */
const followLinks = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.metaKey || event.ctrlKey)) return false;
    const link = (event.target as HTMLElement | null)?.closest?.('[data-href]');
    const href = link?.getAttribute('data-href');
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return false;

    const target = resolveFrom(view.state.facet(documentPath), href);
    if (!target) return false;

    event.preventDefault();
    useWindowStore.getState().openFile(target);
    return true;
  },
});

/**
 * Everything that makes a markdown file a page: the decorations, the `/`
 * menu, the prose layout, and wrapping — a paragraph is a line in the file,
 * and a page that scrolled sideways to read one would not be a page.
 */
export function markdownPage(path: string | null): Extension {
  return [
    documentPath.of(path),
    preview,
    focusSync,
    EditorView.focusChangeEffect.of((_state, focusing) =>
      setFocused.of(focusing)
    ),
    followLinks,
    slashMenu(),
    EditorView.lineWrapping,
    EditorView.editorAttributes.of({ class: 'cm-md-page' }),
  ];
}
