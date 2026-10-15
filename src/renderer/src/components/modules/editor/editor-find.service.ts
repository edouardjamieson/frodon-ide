/**
 * Finding text in the document on screen.
 *
 * The query engine is `@codemirror/search`'s and the rest of it is not, which
 * is a split worth explaining because the package ships a whole find feature
 * and this uses about a fifth of it.
 *
 * What is taken: `SearchQuery`. It is the part that is genuinely hard — the
 * difference between a literal and a regular expression, case folding that is
 * right for more alphabets than this one, whole-word boundaries, `\n` and `\t`
 * in a typed string, and a cursor that walks a rope instead of a copy of the
 * file. None of that is worth rewriting, and the TUI's editor is a 829-line
 * argument for not trying.
 *
 * What is not taken: the panel. `search()` draws its own — a row of labelled
 * checkboxes and a replace field — and, more to the point, its highlighter
 * returns no decorations at all unless that panel is open. So a find bar that
 * looks like the rest of Frodon and sits where this editor already puts a
 * strip of its own (see `Notice`) has to bring its own highlighting. That is
 * what the field and the plugin below are: about forty lines, against a panel
 * restyled from the outside and a `findNext` that would reach into it.
 *
 * The decoration classes are deliberately `@codemirror/search`'s own:
 * `editor.theme.ts` has styled `.cm-searchMatch` and
 * `.cm-searchMatch-selected` from its first version, and `ThemeRoles` has
 * carried `editorSearchMatchBg` and `editorSearchMatchActiveBg` for just as
 * long. A theme written for this app already colors these.
 */
import {
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import { Decoration, ViewPlugin } from '@codemirror/view';
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';
import { SearchQuery } from '@codemirror/search';
import { HIGHLIGHT_MARGIN, MAX_MATCHES } from './editor-find.constant';

/** The three toggles, as the bar holds them. */
export interface FindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export const NO_FIND_OPTIONS: FindOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
};

/** A position in the document, as a match occupies one. */
export interface Match {
  from: number;
  to: number;
}

/**
 * What the bar shows to the right of the field.
 *
 * `index` is 1-based and 0 means "the selection is not sitting on a match" —
 * true before the first Enter, and true again the moment someone clicks
 * somewhere else.
 */
export interface FindCount {
  total: number;
  index: number;
  /** The scan stopped at `MAX_MATCHES`, so `total` is a floor, not a count. */
  capped: boolean;
}

export const NO_MATCHES: FindCount = { total: 0, index: 0, capped: false };

/**
 * The query a typed line and three toggles amount to.
 *
 * Always a `SearchQuery`, never null — an empty or malformed one answers
 * `valid: false`, which is the single question everything downstream asks, and
 * a nullable second way of spelling the same thing would mean two.
 */
export function queryOf(search: string, options: FindOptions): SearchQuery {
  return new SearchQuery({
    search,
    caseSensitive: options.caseSensitive,
    wholeWord: options.wholeWord,
    regexp: options.regex,
  });
}

/* -------------------------------------------------------------------------
 * The query, as the document holds it
 * ---------------------------------------------------------------------- */

/** Hands the highlighter a query, or null to put the highlights away. */
export const setFindQuery = StateEffect.define<SearchQuery | null>();

/**
 * The query this document is being searched for.
 *
 * On the state rather than on the view, which is the usual CodeMirror answer
 * and has one consequence worth knowing here: an editor window swaps a whole
 * `EditorState` in when its tab changes, so the query does not travel between
 * tabs on its own. `useEditorFind` puts it back — see `applyTo`.
 */
const findQuery = StateField.define<SearchQuery | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setFindQuery)) return effect.value;
    }
    return value;
  },
});

const matchMark = Decoration.mark({ class: 'cm-searchMatch' });
const currentMark = Decoration.mark({
  class: 'cm-searchMatch cm-searchMatch-selected',
});

/**
 * The stretches of document worth scanning: what is visible, widened by
 * `HIGHLIGHT_MARGIN`, with neighbours that would overlap after widening
 * merged into one.
 *
 * The merge is not tidiness. A `RangeSetBuilder` requires its ranges in order
 * and without duplicates, so two scans that both found the same match would
 * throw rather than draw it twice — which is exactly what happens at a fold,
 * where the viewport comes in several pieces. Testing against `2 ×` the margin
 * is what guarantees the widened ranges cannot touch.
 */
function scanRanges(view: EditorView): Match[] {
  const visible = view.visibleRanges;
  const length = view.state.doc.length;
  const ranges: Match[] = [];

  for (let i = 0; i < visible.length; i++) {
    const range = visible[i];
    if (!range) continue;

    let to = range.to;
    for (;;) {
      const next = visible[i + 1];
      if (!next || to <= next.from - 2 * HIGHLIGHT_MARGIN) break;
      i += 1;
      to = next.to;
    }

    ranges.push({
      from: Math.max(0, range.from - HIGHLIGHT_MARGIN),
      to: Math.min(length, to + HIGHLIGHT_MARGIN),
    });
  }

  return ranges;
}

/** Every match on screen, the one holding the selection marked apart. */
function highlight(view: EditorView): DecorationSet {
  const query = view.state.field(findQuery);
  if (!query?.valid) return Decoration.none;

  const builder = new RangeSetBuilder<Decoration>();
  const { ranges } = view.state.selection;

  for (const range of scanRanges(view)) {
    const cursor = query.getCursor(view.state, range.from, range.to);
    for (let step = cursor.next(); !step.done; step = cursor.next()) {
      const { from, to } = step.value;
      const current = ranges.some(
        (selected) => selected.from === from && selected.to === to
      );
      builder.add(from, to, current ? currentMark : matchMark);
    }
  }

  return builder.finish();
}

const highlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = highlight(view);
    }

    update(update: ViewUpdate) {
      // The selection, because the match under the cursor is drawn
      // differently from the rest; the viewport, because only what is on
      // screen was scanned in the first place.
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.state.field(findQuery) !== update.startState.field(findQuery)
      ) {
        this.decorations = highlight(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

/**
 * What a document needs in it to be searchable. Installed in every state the
 * editor builds.
 *
 * Low precedence, so a match highlight sits under the selection and under
 * anything a grammar draws, rather than over them. That is where
 * `@codemirror/search` puts its own, and the reason is visible the moment it
 * is not: a highlighted match that paints over the selection makes the one you
 * are standing on the hardest to see.
 */
export function findExtension(): Extension {
  return [findQuery, Prec.low(highlighter)];
}

/* -------------------------------------------------------------------------
 * Stepping through matches
 * ---------------------------------------------------------------------- */

/** The first match at or after `from`, wrapping to the top of the document. */
export function nextMatch(
  state: EditorState,
  query: SearchQuery,
  from: number
): Match | null {
  if (!query.valid) return null;

  const ahead = query.getCursor(state, from).next();
  if (!ahead.done) return ahead.value;

  // Past the last one. Wrapping is what every editor does and what makes
  // Enter a key you can hold: the alternative is a find that stops working
  // three quarters of the way down a file.
  const wrapped = query.getCursor(state, 0).next();
  return wrapped.done ? null : wrapped.value;
}

/**
 * The last match ending at or before `from`, wrapping to the bottom of the
 * document.
 *
 * `from` is the *start* of the selection and not its end, which is what keeps
 * Previous from landing back on the match already under the cursor.
 */
export function previousMatch(
  state: EditorState,
  query: SearchQuery,
  from: number
): Match | null {
  if (!query.valid) return null;

  // Scanned forwards and kept, rather than searched backwards: a cursor only
  // runs one way, and the alternative — walking back in windows of some
  // arbitrary size — gets the answer wrong for any match longer than the
  // window.
  const last = (until: number): Match | null => {
    const cursor = query.getCursor(state, 0, until);
    let found: Match | null = null;
    for (let step = cursor.next(); !step.done; step = cursor.next()) {
      found = step.value;
    }
    return found;
  };

  // Nothing above the cursor: wrap, and the last match in the document is the
  // one before where you were.
  return last(from) ?? last(state.doc.length);
}

/**
 * How many matches there are, and which one the selection is sitting on.
 *
 * One scan answers both. It stops at `MAX_MATCHES`, which bounds the work by
 * a constant rather than by the size of the file — and costs an index for a
 * match past the cap, which is a trade nobody reading "2000+" is making a
 * decision on.
 */
export function countMatches(
  state: EditorState,
  query: SearchQuery
): FindCount {
  if (!query.valid) return NO_MATCHES;

  const { from, to } = state.selection.main;
  const cursor = query.getCursor(state);

  let total = 0;
  let index = 0;

  for (let step = cursor.next(); !step.done; step = cursor.next()) {
    total += 1;
    if (step.value.from === from && step.value.to === to) index = total;
    if (total >= MAX_MATCHES) return { total, index, capped: true };
  }

  return { total, index, capped: false };
}

/**
 * The text to put in the field when the bar opens: whatever is selected, if it
 * is one line of it.
 *
 * What every editor does, and the reason is that Cmd+F is used twice as often
 * to ask "where else is this" as to ask "where is something". A multi-line
 * selection is excluded because it is almost always a block someone is about
 * to move, not a thing they are looking for.
 */
export function seedFrom(state: EditorState): string | null {
  const { from, to } = state.selection.main;
  if (from === to) return null;

  const text = state.sliceDoc(from, to);
  return text.includes('\n') ? null : text;
}
