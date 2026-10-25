/**
 * What the markdown page draws in place of syntax it has hidden.
 *
 * Every widget here answers `eq`, and that is most of what matters about
 * them: the decorations are rebuilt whenever the cursor moves into a different
 * block, and a widget that compares equal to the one already on screen keeps
 * its DOM. Without it, every click would reload every picture on the page and
 * every table would flicker.
 */
import { WidgetType, type EditorView } from '@codemirror/view';
import { renderHtml, type Align } from './editor-markdown-html.service';
import { drawPicture } from './editor-markdown-picture.service';

/** A bullet drawn where a `-`, `*` or `+` list marker is. */
export class BulletWidget extends WidgetType {
  constructor(readonly glyph: string) {
    super();
  }

  eq(other: BulletWidget): boolean {
    return other.glyph === this.glyph;
  }

  toDOM(): HTMLElement {
    const bullet = document.createElement('span');
    bullet.className = 'cm-md-bullet';
    bullet.textContent = this.glyph;
    return bullet;
  }

  // Clicks fall through to CodeMirror, which puts the cursor in the item —
  // the same as clicking its text.
  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * A to-do's `[ ]` or `[x]`, as a box that can be ticked without going into the
 * source.
 *
 * The click edits the one character between the brackets and nothing else, so
 * it lands in the undo history as the edit it is.
 */
export class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked;
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-md-checkbox';
    box.checked = this.checked;
    box.addEventListener('mousedown', (event) => {
      // Kept from reaching CodeMirror, which would move the cursor into the
      // item and turn the box back into brackets under the pointer.
      event.preventDefault();
      toggleTask(view, view.posAtDOM(box));
    });
    return box;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function toggleTask(view: EditorView, at: number): void {
  const marker = view.state.doc.sliceString(at, at + 3);
  if (!/^\[[ xX]\]$/.test(marker)) return;
  view.dispatch({
    changes: {
      from: at + 1,
      to: at + 2,
      insert: marker[1] === ' ' ? 'x' : ' ',
    },
    userEvent: 'input',
  });
}

/** A soft line break inside a paragraph, drawn as the space it means. */
export class SpaceWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const space = document.createElement('span');
    space.textContent = ' ';
    // Collapsible, unlike the editor's own `pre-wrap` text, so a break that
    // lands on the end of a wrapped line vanishes into the wrap instead of
    // indenting the next one by a space.
    space.style.whiteSpace = 'normal';
    return space;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** A `---` drawn as a rule. */
export class RuleWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const rule = document.createElement('span');
    rule.className = 'cm-md-rule';
    return rule;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * The opening fence of a code block, drawn as the language and a copy button.
 *
 * The code itself is never a widget. It stays text in the document, highlighted
 * by the grammar its fence names, so a code block reads the same rendered as it
 * does in source — and the cursor can go into it without the block changing
 * shape.
 */
export class CodeHeaderWidget extends WidgetType {
  constructor(
    readonly language: string,
    readonly code: string
  ) {
    super();
  }

  eq(other: CodeHeaderWidget): boolean {
    return other.language === this.language && other.code === this.code;
  }

  toDOM(): HTMLElement {
    const header = document.createElement('span');
    header.className = 'cm-md-code-header';

    const label = document.createElement('span');
    label.textContent = this.language || 'text';
    header.append(label);

    const copy = document.createElement('button');
    copy.className = 'cm-md-code-copy';
    copy.textContent = 'Copy';
    copy.addEventListener('mousedown', (event) => event.preventDefault());
    copy.addEventListener('click', () => {
      void navigator.clipboard.writeText(this.code).then(() => {
        copy.textContent = 'Copied';
        setTimeout(() => (copy.textContent = 'Copy'), 1200);
      });
    });
    header.append(copy);

    return header;
  }

  // The button is the widget's own; anywhere else on the header is a click
  // into the block, which reveals its fences.
  ignoreEvent(event: Event): boolean {
    return (event.target as HTMLElement | null)?.closest?.('button') != null;
  }
}

/** One row of a pipe table, split on the pipes that are not escaped. */
function cellsOf(line: string): string[] {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  return text
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * A table cell's markdown as HTML, for `renderHtml` to draw.
 *
 * The inline syntax a README puts in a cell — code, bold, italics, links,
 * pictures — and the HTML it puts there too, `<kbd>` above all, which goes
 * through untouched. Code spans are escaped first and kept out of the rest,
 * so `` `Frodon-<version>.dmg` `` is text and not a tag called `version`.
 *
 * Regexes rather than the parser: a cell is one line of mostly plain words,
 * and the tree has no node for a cell that is empty.
 */
function cellHtml(cell: string): string {
  return cell
    .split(/(`[^`]*`)/)
    .map((part, i) =>
      i % 2
        ? `<code>${escapeHtml(part.slice(1, -1))}</code>`
        : part
            .replace(
              /!\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g,
              '<img alt="$1" src="$2">'
            )
            .replace(/\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g, '<a href="$2">$1</a>')
            .replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>')
            .replace(/~~(.+?)~~/g, '<del>$1</del>')
            .replace(/(^|[^\w*])[*_]([^*_]+)[*_](?=[^\w*]|$)/g, '$1<em>$2</em>')
    )
    .join('');
}

/**
 * A pipe table, drawn as a table.
 *
 * Parsed from the text rather than from the syntax tree, because the tree has
 * no node for a cell that is empty, and a grid that drops its empty cells puts
 * every value after one in the wrong column.
 */
export class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly file: string | null
  ) {
    super();
  }

  eq(other: TableWidget): boolean {
    return other.source === this.source && other.file === this.file;
  }

  toDOM(view: EditorView): HTMLElement {
    const lines = this.source.split('\n');
    const header = cellsOf(lines[0] ?? '');
    const align = cellsOf(lines[1] ?? '').map((cell) => {
      const left = cell.startsWith(':');
      const right = cell.endsWith(':');
      return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
    });

    const wrap = document.createElement('div');
    wrap.className = 'cm-md-table';
    const table = document.createElement('table');
    wrap.append(table);

    const row = (cells: string[], tag: 'th' | 'td') => {
      const tr = document.createElement('tr');
      for (let i = 0; i < header.length; i++) {
        const cell = document.createElement(tag);
        cell.append(renderHtml(view, cellHtml(cells[i] ?? ''), this.file));
        const alignment = align[i];
        if (alignment) cell.style.textAlign = alignment;
        tr.append(cell);
      }
      return tr;
    };

    const head = document.createElement('thead');
    head.append(row(header, 'th'));
    const body = document.createElement('tbody');
    for (const line of lines.slice(2)) body.append(row(cellsOf(line), 'td'));
    table.append(head, body);

    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * A picture, drawn where its `![alt](src)` or its inline `<img>` is.
 *
 * A picture that cannot be drawn shows its alt text, with the reason on
 * hover: a README's row of badges from the web reads as a row of words rather
 * than three sentences about the CSP.
 */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly file: string | null,
    readonly width: string | null = null,
    readonly height: string | null = null
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.file === this.file &&
      other.width === this.width &&
      other.height === this.height
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const frame = document.createElement('span');
    frame.className = 'cm-md-image';

    const img = document.createElement('img');
    img.alt = this.alt;
    if (this.width) img.setAttribute('width', this.width);
    if (this.height) img.setAttribute('height', this.height);
    frame.append(img);

    drawPicture(view, img, this.src, this.file, (reason) => {
      const note = document.createElement('span');
      note.className = 'cm-md-image-missing';
      note.textContent = this.alt || this.src;
      note.title = reason;
      frame.replaceChildren(note);
    });

    return frame;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * An HTML block, drawn as the elements it describes — see
 * `editor-markdown-html.service.ts`.
 *
 * Carries the alignment of any container it sits inside, because a block
 * widget is not a line and the line classes that center the markdown around
 * it do not reach it.
 */
export class HtmlWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly file: string | null,
    readonly align: Align | null
  ) {
    super();
  }

  eq(other: HtmlWidget): boolean {
    return (
      other.source === this.source &&
      other.file === this.file &&
      other.align === this.align
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-md-html';
    if (this.align) wrap.style.textAlign = this.align;
    wrap.append(renderHtml(view, this.source, this.file));
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
