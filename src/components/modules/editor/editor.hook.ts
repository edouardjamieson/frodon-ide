import { useEffect, useMemo, useRef, useState } from 'react';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { refractor } from 'refractor';
import { useKeyboard, useRenderer } from '@opentui/react';
import Logger from '~/lib/logger/logger.service';
import { resolveLanguageId, useLanguageStore } from '~/lib/language';
import { readClipboard, writeClipboard } from '~/lib/clipboard';
import { triggerActions, ActionEvent } from '~/lib/actions';
import { watchFile } from '~/lib/fs';
import type {
  EditorProps,
  EditorState,
  HighlightSegment,
  Position,
  SearchHighlight,
  SearchMatch,
} from './editor.def';
import { usePaletteStore } from '../palette/palette.store';

/** GitHub-dark inspired colors keyed by refractor token type. */
export const TOKEN_COLORS: Record<string, string> = {
  plain: '#E6EDF3',

  comment: '#8B949E',
  prolog: '#8B949E',
  doctype: '#8B949E',
  cdata: '#8B949E',

  keyword: '#FF7B72',
  operator: '#FF7B72',
  'attr-name': '#FF7B72',

  string: '#A5D6FF',
  char: '#A5D6FF',
  regex: '#A5D6FF',
  'attr-value': '#A5D6FF',

  number: '#79C0FF',
  boolean: '#79C0FF',
  constant: '#79C0FF',
  property: '#79C0FF',

  function: '#D2A8FF',
  'function-variable': '#D2A8FF',
  'variable-function': '#D2A8FF',

  variable: '#E6EDF3',

  class: '#FFA657',
  'class-name': '#FFA657',
  builtin: '#FFA657',
  tag: '#7EE787',

  punctuation: '#F0F6FC',
};

const DEFAULT_COLOR = TOKEN_COLORS.plain!;

interface FlatToken {
  text: string;
  type: string;
}

/** Depth-first flatten of a refractor AST into typed text runs. */
function flatten(node: any, inherited = 'plain'): FlatToken[] {
  if (node.type === 'text') {
    return [{ text: node.value, type: inherited }];
  }
  if (node.type !== 'root' && node.type !== 'element') return [];

  let type = inherited;
  if (node.type === 'element') {
    const classes: string[] = node.properties?.className ?? [];
    type = classes.find((c) => c !== 'token') ?? inherited;
  }

  return node.children.flatMap((child: any) => flatten(child, type));
}

/**
 * Tokenizes `code` with refractor and splits the result into visual lines,
 * each being an ordered list of colored segments. Preserves empty lines and
 * whitespace so it stays aligned with the raw `value.split('\n')`.
 */
export function highlightToLines(
  code: string,
  language: string | null
): HighlightSegment[][] {
  const plainLines = (): HighlightSegment[][] =>
    code
      .split('\n')
      .map((line) =>
        line.length ? [{ text: line, color: DEFAULT_COLOR }] : []
      );

  if (language === null || !refractor.registered(language)) return plainLines();

  let flat: FlatToken[];
  try {
    flat = flatten(refractor.highlight(code, language));
  } catch (error) {
    Logger.log(`editor: highlight failed for ${language}: ${error}`);
    return plainLines();
  }

  const lines: HighlightSegment[][] = [[]];
  for (const token of flat) {
    const color = TOKEN_COLORS[token.type] ?? DEFAULT_COLOR;
    const parts = token.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part.length > 0) lines[lines.length - 1]!.push({ text: part, color });
    });
  }
  return lines;
}

/** Absolute offset of the first character of each line. */
function lineStartOffsets(value: string): number[] {
  const starts = [0];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function offsetToPosition(value: string, offset: number): Position {
  const clamped = Math.max(0, Math.min(offset, value.length));
  const before = value.slice(0, clamped);
  const row = before.split('\n').length - 1;
  const col = clamped - (before.lastIndexOf('\n') + 1);
  return { row, col };
}

/** Inverse of `offsetToPosition`: clamps a row/col onto the nearest offset. */
function positionToOffset(value: string, row: number, col: number): number {
  const starts = lineStartOffsets(value);
  const clampedRow = Math.max(0, Math.min(row, starts.length - 1));
  const lineStart = starts[clampedRow]!;
  const lineEnd =
    clampedRow + 1 < starts.length ? starts[clampedRow + 1]! - 1 : value.length;
  return lineStart + Math.max(0, Math.min(col, lineEnd - lineStart));
}

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(n, max));

/** Offset of the first character at which `a` and `b` differ. */
function firstDivergence(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a[i] === b[i]) i++;
  return i;
}

// --- pure editing / navigation transitions -------------------------------

const selMin = (s: EditorState) =>
  s.selection ? Math.min(s.selection.anchor, s.selection.head) : s.cursor;
const selMax = (s: EditorState) =>
  s.selection ? Math.max(s.selection.anchor, s.selection.head) : s.cursor;

/** Moves the cursor to `offset`, extending or clearing the selection. */
function moveTo(s: EditorState, offset: number, extend: boolean): EditorState {
  const cursor = clamp(offset, 0, s.value.length);
  if (!extend) return { ...s, cursor, selection: null };
  const anchor = s.selection ? s.selection.anchor : s.cursor;
  return {
    ...s,
    cursor,
    selection: anchor === cursor ? null : { anchor, head: cursor },
  };
}

/** Replaces the current selection (or nothing) with `text`. */
function insert(s: EditorState, text: string): EditorState {
  const from = selMin(s);
  const to = selMax(s);
  const value = s.value.slice(0, from) + text + s.value.slice(to);
  return { value, cursor: from + text.length, selection: null };
}

/** Deletes the selection if present, else the char before/after the cursor. */
function deleteText(
  s: EditorState,
  direction: 'back' | 'forward'
): EditorState {
  if (s.selection) {
    const from = selMin(s);
    const to = selMax(s);
    return {
      value: s.value.slice(0, from) + s.value.slice(to),
      cursor: from,
      selection: null,
    };
  }
  if (direction === 'back') {
    if (s.cursor === 0) return s;
    return {
      value: s.value.slice(0, s.cursor - 1) + s.value.slice(s.cursor),
      cursor: s.cursor - 1,
      selection: null,
    };
  }
  if (s.cursor >= s.value.length) return s;
  return {
    value: s.value.slice(0, s.cursor) + s.value.slice(s.cursor + 1),
    cursor: s.cursor,
    selection: null,
  };
}

/** Cursor offset one visual line up/down, preserving the current column. */
function verticalMove(s: EditorState, dir: -1 | 1): number {
  const starts = lineStartOffsets(s.value);
  const { row, col } = offsetToPosition(s.value, s.cursor);
  const targetRow = clamp(row + dir, 0, starts.length - 1);
  if (targetRow === row) return dir < 0 ? 0 : s.value.length;

  const lineStart = starts[targetRow]!;
  const lineEnd =
    targetRow + 1 < starts.length ? starts[targetRow + 1]! - 1 : s.value.length;
  return lineStart + Math.min(col, lineEnd - lineStart);
}

/** Offsets of the start / end of the line containing `offset`. */
function lineBounds(
  value: string,
  offset: number
): { start: number; end: number } {
  const start = value.lastIndexOf('\n', offset - 1) + 1;
  const nextNl = value.indexOf('\n', offset);
  const end = nextNl === -1 ? value.length : nextNl;
  return { start, end };
}

/** The current line's text including its trailing newline, for line copy. */
function currentLineText(s: EditorState): string {
  const { start, end } = lineBounds(s.value, s.cursor);
  const hasNewline = end < s.value.length;
  return s.value.slice(start, end) + (hasNewline ? '\n' : '');
}

/** Removes the whole line the cursor sits on, newline included, for line cut. */
function deleteLine(s: EditorState): EditorState {
  const { start, end } = lineBounds(s.value, s.cursor);
  // Take the trailing newline with the line, or the preceding one when it's
  // the last line, so no blank line is left behind.
  const from = end < s.value.length ? start : Math.max(0, start - 1);
  const to = end < s.value.length ? end + 1 : end;
  const value = s.value.slice(0, from) + s.value.slice(to);
  return { value, cursor: Math.min(from, value.length), selection: null };
}

/** Leading whitespace of the line containing `offset` (for auto-indent). */
function leadingWhitespace(value: string, offset: number): string {
  const { start } = lineBounds(value, offset);
  const match = value.slice(start).match(/^[ \t]*/);
  return match ? match[0] : '';
}

const INDENT = '  ';

interface KeyLike {
  name: string;
  sequence: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  option: boolean;
}

/**
 * Pure state transition for a single keypress. Returns the same reference when
 * the key is not handled, so no-ops don't trigger a re-render.
 */
function reduce(s: EditorState, key: KeyLike): EditorState {
  const extend = key.shift;

  switch (key.name) {
    case 'left':
      if (!extend && s.selection) return moveTo(s, selMin(s), false);
      return moveTo(s, s.cursor - 1, extend);
    case 'right':
      if (!extend && s.selection) return moveTo(s, selMax(s), false);
      return moveTo(s, s.cursor + 1, extend);
    case 'up':
      return moveTo(s, verticalMove(s, -1), extend);
    case 'down':
      return moveTo(s, verticalMove(s, 1), extend);
    case 'home':
      return moveTo(s, lineBounds(s.value, s.cursor).start, extend);
    case 'end':
      return moveTo(s, lineBounds(s.value, s.cursor).end, extend);
    case 'backspace':
      return deleteText(s, 'back');
    case 'delete':
      return deleteText(s, 'forward');
    case 'return':
    case 'enter':
      return insert(s, '\n' + leadingWhitespace(s.value, selMin(s)));
    case 'tab':
      return insert(s, INDENT);
  }

  // Select all
  if ((key.ctrl || key.meta) && key.name === 'a') {
    return {
      ...s,
      cursor: s.value.length,
      selection: { anchor: 0, head: s.value.length },
    };
  }

  // Printable text. A keypress is normally one character, but a bracketed
  // paste can arrive as a multi-character sequence — insert either, as long as
  // every character is printable (tabs and newlines allowed, control bytes and
  // DEL rejected so escape sequences from special keys don't leak in).
  if (!key.ctrl && !key.meta && !key.option && isInsertable(key.sequence)) {
    return insert(s, key.sequence);
  }

  return s;
}

/**
 * Classifies a text-changing transition for undo coalescing: a lone typed
 * character (into no selection) is `'type'` and merges with adjacent typing;
 * everything else — deletes, enter, tab, and multi-character pastes — is
 * `'other'` and forms its own undo step.
 */
function editKind(
  prev: EditorState,
  next: EditorState,
  key: KeyLike
): 'type' | 'other' {
  const single =
    !prev.selection &&
    next.value.length === prev.value.length + 1 &&
    key.name !== 'return' &&
    key.name !== 'enter' &&
    key.name !== 'tab' &&
    key.sequence.length === 1;
  return single ? 'type' : 'other';
}

/** True if `seq` is non-empty and contains only insertable text. */
function isInsertable(seq: string): boolean {
  if (seq.length === 0) return false;
  for (const ch of seq) {
    const code = ch.codePointAt(0)!;
    const printable = code === 9 || code === 10 || (code >= 32 && code !== 127);
    if (!printable) return false;
  }
  return true;
}

const EMPTY_STATE: EditorState = { value: '', cursor: 0, selection: null };

export const useEditor = (props: EditorProps) => {
  const { filePath, focused = true, onDirtyChange } = props;
  const { open: paletteOpen } = usePaletteStore();
  const renderer = useRenderer();

  const [state, setState] = useState<EditorState>(EMPTY_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Undo / redo history. `past`/`future` hold whole-document snapshots (cheap:
  // `EditorState` is immutable and mostly shares its `value` string). A run of
  // plain typing coalesces into one entry via `lastKind`, so undo steps back a
  // word-ish chunk at a time rather than character by character.
  const past = useRef<EditorState[]>([]);
  const future = useRef<EditorState[]>([]);
  const lastKind = useRef<'type' | 'other' | 'external' | 'none'>('none');

  // In-editor find: a small overlay box that highlights matches in the doc.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);

  // File contents + language, recomputed only when the path changes.
  const meta = useMemo(() => {
    if (!filePath) return null;
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) return null;

    try {
      return {
        content: readFileSync(filePath, 'utf-8'),
        language: resolveLanguageId(filePath),
        name: filePath.split('/').pop() ?? filePath,
      };
    } catch (error) {
      Logger.log(`editor: failed to read ${filePath}: ${error}`);
      return null;
    }
  }, [filePath]);

  // Lazily register the file's refractor language (cached across editors).
  const languageId = meta?.language ?? null;
  const loadLanguage = useLanguageStore((s) => s.load);
  const languageReady = useLanguageStore((s) =>
    languageId ? Boolean(s.loaded[languageId]) : false
  );

  useEffect(() => {
    if (languageId) loadLanguage(languageId);
  }, [languageId, loadLanguage]);

  // A baseline used to derive `dirty`; updated on load and on save.
  const baseline = useRef(meta?.content ?? '');

  // Load (or reset) the document whenever the target file changes. History is
  // per-document, so it's discarded here alongside the old content.
  useEffect(() => {
    baseline.current = meta?.content ?? '';
    past.current = [];
    future.current = [];
    lastKind.current = 'none';
    setState(
      meta ? { value: meta.content, cursor: 0, selection: null } : EMPTY_STATE
    );
  }, [meta]);

  const dirty = meta !== null && state.value !== baseline.current;

  // Report dirty transitions up so the tab bar can show an unsaved marker and
  // prompt before closing. Only fires when `dirty` actually flips, avoiding a
  // render loop with the store update it triggers.
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty]);

  // The document is discarded on unmount (e.g. switching tabs), so clear its
  // unsaved-changes flag once it's gone.
  useEffect(() => {
    return () => onDirtyChange?.(false);
  }, []);

  const HISTORY_LIMIT = 500;

  /**
   * Applies `next` as the new document state, recording the transition for
   * undo. `kind` is `'type'` for a single typed character (coalesced into the
   * current undo step) or `'other'` for anything else (delete, enter, paste,
   * cut — each its own step). A cursor/selection-only change records nothing but
   * ends the current typing run.
   */
  const applyEdit = (next: EditorState, kind: 'type' | 'other') => {
    const prev = stateRef.current;
    if (next.value !== prev.value) {
      // Drop OpenTUI's native selection highlight so it doesn't linger over the
      // now-changed text (our own overlay is driven by `state.selection`).
      renderer.clearSelection();
      const coalesce = kind === 'type' && lastKind.current === 'type';
      if (!coalesce) {
        past.current.push(prev);
        if (past.current.length > HISTORY_LIMIT) past.current.shift();
      }
      future.current = [];
      lastKind.current = kind;
    } else {
      lastKind.current = 'none';
    }
    stateRef.current = next;
    setState(next);
  };

  const undo = () => {
    if (past.current.length === 0) return;
    const prev = past.current.pop()!;
    future.current.push(stateRef.current);
    lastKind.current = 'none';
    stateRef.current = prev;
    setState(prev);
  };

  const redo = () => {
    if (future.current.length === 0) return;
    const next = future.current.pop()!;
    past.current.push(stateRef.current);
    lastKind.current = 'none';
    stateRef.current = next;
    setState(next);
  };

  /** The currently selected text, or '' when there's no selection. */
  const selectedText = () => {
    const s = stateRef.current;
    if (!s.selection) return '';
    return s.value.slice(selMin(s), selMax(s));
  };

  /**
   * Re-reads the file from disk and adopts it as the buffer. Called after
   * on-save actions settle so a blocking formatter's output shows up live, and
   * by the file watcher so external rewrites (e.g. an AI agent editing the file
   * from the terminal) stream into the open editor. Skips if the user has typed
   * since the last baseline (don't clobber fresh edits) or if disk already
   * matches the buffer.
   *
   * `follow` reveals where the change landed by moving the cursor to the first
   * divergence — used for watcher-driven external edits so an unfocused editor
   * scrolls to the live edit. It's suppressed while the editor is focused so a
   * background rewrite (or an on-save formatter reflow) never yanks the cursor
   * out from under the user; the pre-change state stays undoable either way.
   */
  const adoptDiskChanges = (follow = false) => {
    if (!filePath) return;
    if (stateRef.current.value !== baseline.current) return; // edited since save
    let disk: string;
    try {
      disk = readFileSync(filePath, 'utf-8');
    } catch (error) {
      Logger.log(`editor: reload after actions failed for ${filePath}: ${error}`);
      return;
    }
    if (disk === stateRef.current.value) return;

    // Consecutive external rewrites coalesce into a single undo step, the way a
    // run of typing does, so a burst of streamed edits undoes as one action.
    const coalesce = lastKind.current === 'external';
    if (!coalesce) {
      past.current.push(stateRef.current);
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
    }
    future.current = [];
    lastKind.current = 'external';
    baseline.current = disk;

    const doFollow = follow && !focused;
    const cursor = doFollow
      ? Math.min(firstDivergence(stateRef.current.value, disk), disk.length)
      : Math.min(stateRef.current.cursor, disk.length);

    const next: EditorState = { value: disk, cursor, selection: null };
    stateRef.current = next;
    setState(next);
  };

  // Stream external edits into the buffer: watch the open file and adopt disk
  // changes as they land. This is the live-editing view for AI agents rewriting
  // the file from the terminal. `adoptDiskChanges` guards against clobbering
  // unsaved local edits, and a self-write from `save()` re-reads to the same
  // content and no-ops. Held in a ref so the watcher, armed once per file,
  // always calls the latest closure.
  const adoptRef = useRef(adoptDiskChanges);
  adoptRef.current = adoptDiskChanges;

  useEffect(() => {
    if (!filePath) return;
    return watchFile(filePath, () => adoptRef.current(true));
  }, [filePath]);

  const save = () => {
    if (!filePath || !meta) return;
    try {
      writeFileSync(filePath, stateRef.current.value);
      baseline.current = stateRef.current.value;
      setState((s) => ({ ...s })); // re-render so `dirty` recomputes
      Logger.log(`editor: saved ${filePath}`);
      // Fire on-save actions (linters, formatters). Blocking formatters may
      // rewrite the file on disk; once they settle, adopt their output.
      void triggerActions(ActionEvent.SAVE, { path: filePath }).then(() =>
        adoptDiskChanges()
      );
    } catch (error) {
      Logger.log(`editor: save failed for ${filePath}: ${error}`);
    }
  };

  useKeyboard((key) => {
    if (!focused || !meta || paletteOpen) return;

    // Ctrl/Cmd+F toggles the in-editor find box (Ctrl+Shift+F is the palette's
    // project-wide search and is handled there).
    if ((key.ctrl || key.meta) && !key.shift && key.name === 'f') {
      if (searchOpen) closeSearch();
      else openSearch();
      return;
    }

    // While the find box is open its <input> owns character input; the global
    // key handler only drives navigation so typing doesn't edit the document.
    if (searchOpen) {
      if (key.name === 'escape') {
        closeSearch();
      } else if (key.name === 'return') {
        stepMatch(key.shift ? -1 : 1);
      }
      return;
    }

    if ((key.ctrl || key.meta) && key.name === 's') {
      save();
      return;
    }

    // Undo / redo. Cmd/Ctrl+Z undoes, add Shift to redo; Ctrl+Y also redoes.
    if ((key.ctrl || key.meta) && key.name === 'z') {
      if (key.shift) redo();
      else undo();
      return;
    }
    if (key.ctrl && key.name === 'y') {
      redo();
      return;
    }

    // Clipboard — Ctrl only (Cmd never reaches a hosted terminal app; it's
    // intercepted by the terminal emulator). Copy/cut act on the selection, or
    // on the whole current line when there's none. Paste drops the system
    // clipboard at the cursor, replacing any selection. `pbcopy`/`pbpaste` are
    // async, so paste applies once the read resolves.
    if (key.ctrl && key.name === 'c') {
      const s = stateRef.current;
      const text = s.selection ? selectedText() : currentLineText(s);
      if (text) void writeClipboard(text);
      return;
    }
    if (key.ctrl && key.name === 'x') {
      const s = stateRef.current;
      if (s.selection) {
        void writeClipboard(selectedText());
        applyEdit(deleteText(s, 'back'), 'other');
      } else {
        const text = currentLineText(s);
        if (text) void writeClipboard(text);
        applyEdit(deleteLine(s), 'other');
      }
      return;
    }
    if (key.ctrl && key.name === 'v') {
      void readClipboard().then((text) => {
        if (text) applyEdit(insert(stateRef.current, text), 'other');
      });
      return;
    }

    const current = stateRef.current;
    const next = reduce(current, key);
    if (next === current) return; // unhandled key — no-op, no history
    applyEdit(next, editKind(current, next, key));
  });

  // Highlight only once the language is registered; until then render plain
  // text, then re-highlight when `languageReady` flips.
  const lines = useMemo(
    () => highlightToLines(state.value, languageReady ? languageId : null),
    [state.value, languageId, languageReady]
  );

  const cursor = useMemo(
    () => offsetToPosition(state.value, state.cursor),
    [state.value, state.cursor]
  );

  // All hits for the current query, as absolute offsets. Case-insensitive,
  // literal (the query is regex-escaped).
  const searchMatches = useMemo<SearchMatch[]>(() => {
    const query = searchQuery;
    if (!searchOpen || !query) return [];

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    const out: SearchMatch[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(state.value)) !== null) {
      out.push({ offset: m.index, length: m[0].length });
      if (m.index === regex.lastIndex) regex.lastIndex++; // guard empty matches
    }
    return out;
  }, [state.value, searchQuery, searchOpen]);

  // Keep the focused match index in range as the query / doc changes.
  const activeMatchIndex =
    searchMatches.length === 0
      ? -1
      : ((activeMatch % searchMatches.length) + searchMatches.length) %
        searchMatches.length;

  /** Project all matches onto visual rows, keyed by row, as column ranges. */
  const highlightsByRow = useMemo(() => {
    const byRow = new Map<number, SearchHighlight[]>();
    if (searchMatches.length === 0) return byRow;

    const starts = lineStartOffsets(state.value);
    searchMatches.forEach((match, i) => {
      const from = match.offset;
      const to = match.offset + match.length;
      // Walk the rows this match spans (queries rarely cross lines, but be safe).
      for (let row = 0; row < starts.length; row++) {
        const lineStart = starts[row]!;
        const lineEnd =
          row + 1 < starts.length ? starts[row + 1]! - 1 : state.value.length;
        if (from >= lineEnd + 1 || to <= lineStart) continue;

        const start = Math.max(from, lineStart) - lineStart;
        const end = Math.min(to, lineEnd) - lineStart;
        if (end <= start) continue;

        const list = byRow.get(row) ?? [];
        list.push({ start, end, active: i === activeMatchIndex });
        byRow.set(row, list);
      }
    });
    return byRow;
  }, [searchMatches, state.value, activeMatchIndex]);

  /** Move the cursor to the currently focused match so the viewport follows. */
  const focusMatch = (index: number) => {
    const match = searchMatches[index];
    if (!match) return;
    lastKind.current = 'none';
    setState((s) => ({ ...s, cursor: match.offset, selection: null }));
  };

  // A new query restarts navigation from the first hit.
  useEffect(() => {
    setActiveMatch(0);
  }, [searchQuery]);

  const openSearch = () => {
    setSearchOpen(true);
    setActiveMatch(0);
  };

  const closeSearch = () => {
    setSearchOpen(false);
  };

  /** Step to the next (`+1`) or previous (`-1`) match and reveal it. */
  const stepMatch = (dir: 1 | -1) => {
    if (searchMatches.length === 0) return;
    const next =
      (((activeMatchIndex + dir) % searchMatches.length) +
        searchMatches.length) %
      searchMatches.length;
    setActiveMatch(next);
    focusMatch(next);
  };

  /** Moves the cursor to a clicked row/col; `extend` keeps the selection. */
  const moveCursorTo = (row: number, col: number, extend: boolean) => {
    lastKind.current = 'none'; // a click ends the current typing undo step
    setState((s) => moveTo(s, positionToOffset(s.value, row, col), extend));
  };

  /** For a visual row, the selected [startCol, endCol) range, if any. */
  const selectionForRow = (
    row: number
  ): { start: number; end: number } | null => {
    if (!state.selection) return null;
    const from = Math.min(state.selection.anchor, state.selection.head);
    const to = Math.max(state.selection.anchor, state.selection.head);
    if (from === to) return null;

    const starts = lineStartOffsets(state.value);
    const lineStart = starts[row];
    if (lineStart === undefined) return null;
    const lineEnd =
      row + 1 < starts.length ? starts[row + 1]! - 1 : state.value.length;

    if (to <= lineStart || from > lineEnd) return null;

    const start = Math.max(from, lineStart) - lineStart;
    let end = Math.min(to, lineEnd) - lineStart;
    if (to > lineEnd) end += 1; // selection spans the newline; hint a trailing cell
    if (end <= start) return null;
    return { start, end };
  };

  /** Search highlights for a visual row, if any. */
  const highlightsForRow = (row: number): SearchHighlight[] =>
    highlightsByRow.get(row) ?? [];

  return {
    hasFile: meta !== null,
    fileName: meta?.name ?? '',
    dirty,
    focused,
    lines,
    cursor,
    selectionForRow,
    moveCursorTo,
    // search
    searchOpen,
    searchQuery,
    setSearchQuery,
    closeSearch,
    highlightsForRow,
    matchCount: searchMatches.length,
    activeMatchIndex,
  };
};
