/**
 * Getting a picture a markdown file points at onto the page — for a
 * `![alt](src)` and for an HTML `<img>` alike.
 *
 * A file on disk is read through main, the way an image tab is, and drawn from
 * an object URL: the renderer cannot read a file by itself, and the CSP admits
 * `blob:` and `data:` and nothing remote. A picture on the web is reported as
 * missing for that reason — fetching it would mean main fetching it, the way
 * ADR-0029 has it for everything else remote, and nothing does yet.
 */
import type { EditorView } from '@codemirror/view';

/**
 * Where a link or a picture in `file` points, as an absolute path — or null
 * when it points nowhere on disk.
 *
 * Relative to the markdown file's own folder, which is what every renderer
 * that shows a README does. A leading `/` is taken as an absolute path rather
 * than the project root: it is the reading that needs nothing else to know.
 */
export function resolveFrom(file: string | null, href: string): string | null {
  let target = href.replace(/^<|>$/g, '').split(/[?#]/)[0] ?? '';
  try {
    target = decodeURI(target);
  } catch {
    // A stray `%` that is not an escape; the path is used as written.
  }
  if (!target) return null;
  if (target.startsWith('/')) return target;
  if (!file) return null;

  const parts = file.split('/');
  parts.pop();
  for (const segment of target.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment && segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

/**
 * The types a picture in a page can be. The image tab's list, plus SVG — which
 * an image tab opens as text because it is opened to be edited, but which a
 * README embeds to be looked at.
 */
const PICTURE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
};

/**
 * Pictures already read, as object URLs, by path.
 *
 * Module-level, so the same screenshot in two tabs is read once, and the
 * decorations being rebuilt never re-reads one. The cost is that a picture
 * rewritten on disk keeps its old pixels in the page until the app restarts —
 * acceptable for something that is almost never rewritten while a document
 * that shows it is open.
 */
const pictures = new Map<string, Promise<string>>();

function pictureUrl(path: string): Promise<string> {
  let url = pictures.get(path);
  if (!url) {
    const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    url = window.frodon.file
      .readBytes(path)
      .then((bytes) =>
        URL.createObjectURL(
          new Blob([bytes], { type: PICTURE_TYPES[extension] ?? '' })
        )
      );
    // A failed read is not remembered, so the picture appears once the file
    // does.
    url.catch(() => pictures.delete(path));
    pictures.set(path, url);
  }
  return url;
}

/**
 * Points `img` at `src`, as seen from `file`, or calls `missing` with the
 * reason it cannot be drawn.
 *
 * The `src` attribute of the element is never the string from the file: a
 * remote URL there would be a request the CSP refuses in the console, and a
 * relative one would resolve against the app rather than the document.
 */
export function drawPicture(
  view: EditorView,
  img: HTMLImageElement,
  src: string,
  file: string | null,
  missing: (reason: string) => void
): void {
  // A picture arriving changes the height of its line, which CodeMirror has
  // to be told about or the lines below it are clicked in the wrong place.
  img.addEventListener('load', () => view.requestMeasure());
  img.addEventListener('error', () => missing('could not be drawn'));

  if (/^data:image\//i.test(src)) {
    img.src = src;
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(src)) {
    missing('remote pictures are not loaded');
  } else {
    const path = resolveFrom(file, src);
    if (!path) missing('no file');
    else
      pictureUrl(path).then(
        (url) => (img.src = url),
        () => missing('not found')
      );
  }
}
