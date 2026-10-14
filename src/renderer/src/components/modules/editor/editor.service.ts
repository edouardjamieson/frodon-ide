/**
 * Text work the editor does that is neither React nor CodeMirror.
 */

/** One splice that turns a document into another one. */
export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

/** Whether a code unit is the second half of a surrogate pair. */
function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * The smallest single replacement turning `before` into `after`, or null if
 * they are already the same.
 *
 * Used when a file changes on disk under an open document. Replacing the whole
 * text would also work and would be two lines shorter — and it would throw the
 * cursor to the top, kill the selection, and scroll a person away from the
 * line they were reading, every time an agent touched the end of the file.
 * Trimming the common prefix and suffix instead means CodeMirror maps the
 * selection and the scroll through a change that is usually a few characters
 * long and usually nowhere near them.
 *
 * It is not a diff: one hunk, not many, so a change at each end of a file
 * rewrites everything between. That is the right trade here — the result is
 * always correct, it costs two scans of the text, and the common case is one
 * region of one file having been rewritten.
 *
 * Both boundaries are kept off the inside of a surrogate pair. The two code
 * units of an emoji are one character, and a position between them is not a
 * position a document can hold.
 */
export function minimalChange(
  before: string,
  after: string
): TextChange | null {
  if (before === after) return null;

  const shortest = Math.min(before.length, after.length);

  let start = 0;
  while (
    start < shortest &&
    before.charCodeAt(start) === after.charCodeAt(start)
  ) {
    start += 1;
  }
  if (start > 0 && isLowSurrogate(before.charCodeAt(start))) start -= 1;

  let end = before.length;
  let endAfter = after.length;
  while (
    end > start &&
    endAfter > start &&
    before.charCodeAt(end - 1) === after.charCodeAt(endAfter - 1)
  ) {
    end -= 1;
    endAfter -= 1;
  }
  if (end < before.length && isLowSurrogate(before.charCodeAt(end))) {
    end += 1;
    endAfter += 1;
  }

  return { from: start, to: end, insert: after.slice(start, endAfter) };
}
