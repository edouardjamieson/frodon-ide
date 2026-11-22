/**
 * The band behind the line the caret is on — but only while nothing is
 * selected.
 *
 * CodeMirror's own `highlightActiveLine` marks the line under every range's
 * head, selection or not. With `drawSelection` on, the selection is painted
 * in a layer *behind* the lines, so a line with a background of its own
 * covers it: a word selected on the caret's line was simply invisible, and a
 * selection spanning lines lost its last row. The band and the selection are
 * both opaque theme roles, so there is no ordering of the two that shows
 * both.
 *
 * Rejected: raising the selection layer above the text, which would need
 * every theme's selection color to be translucent to keep the text legible;
 * and mixing the band down to a tint, which changes how every theme's active
 * line looks to fix a case that only exists while something is selected.
 * Dropping the band while there is a selection is what most editors do, and
 * the gutter keeps saying which line the caret is on.
 */
import type { Extension } from '@codemirror/state';
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view';

/** The class `editor.theme.ts` already colors. */
const activeLine = Decoration.line({ class: 'cm-activeLine' });

function decorationsFor(view: EditorView): DecorationSet {
  let lastLineStart = -1;
  const lines = [];
  for (const range of view.state.selection.ranges) {
    if (!range.empty) continue;
    const line = view.lineBlockAt(range.head);
    if (line.from > lastLineStart) {
      lines.push(activeLine.range(line.from));
      lastLineStart = line.from;
    }
  }
  return Decoration.set(lines);
}

/** `highlightActiveLine`, for carets only. */
export const caretLine: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = decorationsFor(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = decorationsFor(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);
