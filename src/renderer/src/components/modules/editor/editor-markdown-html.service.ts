/**
 * HTML written inside a markdown file, drawn as the elements it describes.
 *
 * READMEs lean on it for what markdown cannot say — a centered header, a logo
 * at a set size, a key drawn as a key — so a page that showed it as source
 * would get the first screen of nearly every README wrong.
 *
 * It is never handed to `innerHTML`. The markup is parsed by `DOMParser`,
 * which builds an inert document — no scripts run, no pictures are fetched —
 * and then copied element by element into this page through an allowlist: a
 * tag that is not on it is unwrapped to its text, one that can run or embed
 * something is dropped with its contents, and only presentational attributes
 * cross. The file is the project's, but a page is also how you read a README
 * someone else wrote, and the renderer holds the preload bridge.
 */
import type { EditorView } from '@codemirror/view';
import {
  HTML_ATTRIBUTES,
  HTML_CONTAINERS,
  HTML_DROPPED,
  HTML_TAGS,
} from './editor-markdown.constant';
import { drawPicture } from './editor-markdown-picture.service';

export type Align = 'left' | 'center' | 'right';

/** One attribute of a tag as written, or null. Quoted either way, or bare. */
export function attributeOf(tag: string, name: string): string | null {
  const match = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>/]+))`,
    'i'
  ).exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

/** A width or a height worth passing on: a number of pixels, or a percentage. */
function dimension(value: string | null): string | null {
  return value && /^\d+(?:\.\d+)?(?:px|%)?$/.test(value.trim())
    ? value.trim()
    : null;
}

function picture(
  view: EditorView,
  source: Element,
  file: string | null
): HTMLElement {
  const frame = document.createElement('span');
  frame.className = 'cm-md-image';
  const img = document.createElement('img');
  const alt = source.getAttribute('alt') ?? '';
  img.alt = alt;
  for (const name of ['width', 'height']) {
    const value = dimension(source.getAttribute(name));
    if (value) img.setAttribute(name, value);
  }
  frame.append(img);

  const src = source.getAttribute('src') ?? '';
  drawPicture(view, img, src, file, (reason) => {
    const note = document.createElement('span');
    note.className = 'cm-md-image-missing';
    note.textContent = alt || src;
    note.title = reason;
    frame.replaceChildren(note);
  });
  return frame;
}

function copy(view: EditorView, node: Node, file: string | null): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const source = node as Element;
  const tag = source.localName;
  if (HTML_DROPPED.has(tag)) return null;
  if (tag === 'img') return picture(view, source, file);

  const children = [...source.childNodes]
    .map((child) => copy(view, child, file))
    .filter((child): child is Node => child !== null);

  if (!HTML_TAGS.has(tag)) {
    const unwrapped = document.createDocumentFragment();
    unwrapped.append(...children);
    return unwrapped;
  }

  const made = document.createElement(tag);
  for (const name of HTML_ATTRIBUTES) {
    const value = source.getAttribute(name);
    if (value !== null) made.setAttribute(name, value);
  }
  // Never a live `href`: a click on the page is a click into the source, and
  // following a link is mod-click's job — see `followLinks`.
  if (tag === 'a') {
    const href = source.getAttribute('href');
    if (href) {
      made.setAttribute('data-href', href);
      made.setAttribute('title', href);
      made.className = 'cm-md-link';
    }
  }
  made.append(...children);
  return made;
}

/** `source` as elements on this page, through the allowlist. */
export function renderHtml(
  view: EditorView,
  source: string,
  file: string | null
): DocumentFragment {
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  const out = document.createDocumentFragment();
  for (const child of [...parsed.body.childNodes]) {
    const copied = copy(view, child, file);
    if (copied) out.append(copied);
  }
  return out;
}

/**
 * An HTML block with nothing to draw: tags and comments and whitespace only,
 * like the `<div align="center">` that opens a README's header and the
 * `</div>` that closes it. It is hidden rather than drawn as an empty box,
 * and what it means for the blocks between them is `HtmlContainers`'s job.
 */
export function isBare(source: string): boolean {
  if (/<(img|hr|br|picture|video|table|input)\b/i.test(source)) return false;
  return (
    source
      .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
      .replace(/<[^>]*>/g, '')
      .trim() === ''
  );
}

/**
 * The HTML containers open at a point in the document, so the markdown
 * written between an opening `<div align="center">` and its `</div>` is
 * centered the way it would be on GitHub.
 *
 * Markdown makes those two tags separate blocks with ordinary markdown in
 * between, so no single node knows the alignment; this is fed every HTML
 * block in document order and answers for whatever comes next.
 */
export class HtmlContainers {
  private readonly open: { name: string; align: Align | null }[] = [];

  feed(source: string): void {
    const tags = source
      .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
      .matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g);
    for (const [whole, closing, rawName, , selfClosing] of tags) {
      const name = rawName!.toLowerCase();
      if (!HTML_CONTAINERS.has(name)) continue;
      if (closing) {
        const at = this.open.map((entry) => entry.name).lastIndexOf(name);
        if (at >= 0) this.open.splice(at);
      } else if (!selfClosing) {
        const written = attributeOf(whole, 'align')?.toLowerCase();
        const align =
          name === 'center'
            ? 'center'
            : written === 'center' || written === 'right' || written === 'left'
              ? written
              : null;
        this.open.push({ name, align });
      }
    }
  }

  /** The alignment of the innermost open container that has one. */
  get align(): Align | null {
    for (let i = this.open.length - 1; i >= 0; i--) {
      const align = this.open[i]?.align;
      if (align) return align;
    }
    return null;
  }
}
