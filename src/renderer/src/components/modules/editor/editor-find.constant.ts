/**
 * How far past the visible text the highlighter scans, in characters.
 *
 * Matches are decorated for what is on screen plus this much on either side,
 * which is what keeps a match straddling the top or bottom edge of the
 * viewport from being drawn as half a highlight. The number — and the `2 ×`
 * that uses it when deciding whether two visible ranges are close enough to
 * scan as one — is `@codemirror/search`'s own, kept so that a long regex
 * behaves here the way it does in every other CodeMirror editor.
 */
export const HIGHLIGHT_MARGIN = 250;

/**
 * How many matches are counted before the tally gives up and says "more".
 *
 * Counting is a scan of the whole document, and it runs on every keystroke
 * while the bar is open — which is fine, because a `SearchCursor` walks the
 * rope rather than a copy of the text, and because a cap means the work is
 * bounded by this number rather than by the size of the file. Two thousand is
 * past the point where a count is a number anyone reads; it is "a lot", and
 * the bar says so.
 */
export const MAX_MATCHES = 2000;
