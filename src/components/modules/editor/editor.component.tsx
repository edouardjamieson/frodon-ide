import { useEffect, useRef } from 'react';
import {
  MacOSScrollAccel,
  TextAttributes,
  type InputRenderable,
  type MouseEvent,
  type ScrollBoxRenderable,
} from '@opentui/core';
import { theme } from '~/lib/theme';
import type {
  EditorProps,
  HighlightSegment,
  Position,
  SearchHighlight,
} from './editor.def';
import { useEditor } from './editor.hook';

export default function Editor(props: EditorProps) {
  const {
    hasFile,
    fileName,
    dirty,
    focused,
    lines,
    cursor,
    selectionForRow,
    moveCursorTo,
    searchOpen,
    searchQuery,
    setSearchQuery,
    closeSearch,
    highlightsForRow,
    matchCount,
    activeMatchIndex,
  } = useEditor(props);

  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const searchInputRef = useRef<InputRenderable>(null);

  // Focus the find box the moment it opens so the user can type immediately.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Wheel scrolling defaults to a flat 1 line per notch (LinearScrollAccel),
  // which feels sluggish. macOS-style acceleration lets fast flicks cover more
  // ground while slow gestures stay precise. Held in a ref so its velocity
  // history survives re-renders (a fresh instance each render would reset it).
  const scrollAccel = useRef<MacOSScrollAccel>(null);
  if (!scrollAccel.current) scrollAccel.current = new MacOSScrollAccel();

  // Gutter is wide enough for the largest line number, plus a padding column.
  const gutterWidth = String(lines.length).length + 1;

  // Keep the cursor inside the viewport, scrolling the box to follow it.
  // Each visual line is one row tall; the cursor column sits after the gutter.
  useEffect(() => {
    const sb = scrollRef.current;
    if (!sb) return;

    const viewportH = sb.viewport.height;
    if (viewportH > 0) {
      const y = cursor.row;
      if (y < sb.scrollTop) sb.scrollTop = y;
      else if (y >= sb.scrollTop + viewportH) sb.scrollTop = y - viewportH + 1;
    }

    const viewportW = sb.viewport.width;
    if (viewportW > 0) {
      const x = gutterWidth + cursor.col;
      if (x < sb.scrollLeft) sb.scrollLeft = x;
      else if (x >= sb.scrollLeft + viewportW)
        sb.scrollLeft = x - viewportW + 1;
    }
  }, [cursor.row, cursor.col, gutterWidth]);

  if (!hasFile) {
    return (
      <box flexGrow={1} alignItems="center" justifyContent="center">
        <text attributes={TextAttributes.DIM}>No file open</text>
      </box>
    );
  }

  return (
    <box flexGrow={1} flexDirection="column" position="relative">
      {/*
        `focusable={false}` stops the scrollbox from capturing the arrow keys
        (its built-in key handler scrolls on up/down); navigation is driven by
        the editor's own keyboard handler and we scroll to follow the cursor.
      */}
      <scrollbox
        ref={scrollRef}
        focusable={false}
        scrollX
        scrollY
        scrollAcceleration={scrollAccel.current}
        flexGrow={1}
        paddingLeft={1}
      >
        {lines.map((segments, row) => (
          <EditorLine
            key={row}
            row={row}
            segments={segments}
            gutterWidth={gutterWidth}
            cursor={cursor}
            selection={selectionForRow(row)}
            highlights={highlightsForRow(row)}
            showCursor={focused}
            onMove={moveCursorTo}
          />
        ))}
      </scrollbox>

      {searchOpen && (
        <EditorSearchBox
          inputRef={searchInputRef}
          value={searchQuery}
          onInput={setSearchQuery}
          onClose={closeSearch}
          matchCount={matchCount}
          activeIndex={activeMatchIndex}
        />
      )}
    </box>
  );
}

interface EditorSearchBoxProps {
  inputRef: React.RefObject<InputRenderable | null>;
  value: string;
  onInput: (value: string) => void;
  onClose: () => void;
  matchCount: number;
  activeIndex: number;
}

function EditorSearchBox({
  inputRef,
  value,
  onInput,
  onClose,
  matchCount,
  activeIndex,
}: EditorSearchBoxProps) {
  const count = value
    ? matchCount === 0
      ? 'No results'
      : `${activeIndex + 1}/${matchCount}`
    : '';

  return (
    <box
      position="absolute"
      top={0}
      right={1}
      zIndex={10}
      flexDirection="row"
      alignItems="center"
      gap={1}
      paddingX={1}
      backgroundColor={theme.colors.neutral[800]}
      border
      borderColor={theme.colors.neutral[700]}
    >
      <text attributes={TextAttributes.DIM}>🔍</text>
      <input
        ref={inputRef}
        value={value}
        onInput={onInput}
        placeholder="Find"
        width={20}
        backgroundColor={theme.colors.neutral[700]}
      />
      {count !== '' && (
        <text attributes={TextAttributes.DIM}>{count}</text>
      )}
      <text attributes={TextAttributes.DIM} onMouseDown={onClose}>
        ✕
      </text>
    </box>
  );
}

interface EditorLineProps {
  row: number;
  segments: HighlightSegment[];
  gutterWidth: number;
  cursor: Position;
  selection: { start: number; end: number } | null;
  highlights: SearchHighlight[];
  showCursor: boolean;
  onMove: (row: number, col: number, extend: boolean) => void;
}

function EditorLine({
  row,
  segments,
  gutterWidth,
  cursor,
  selection,
  highlights,
  showCursor,
  onMove,
}: EditorLineProps) {
  const isCursorRow = cursor.row === row;
  const lineNumber = `${String(row + 1).padStart(gutterWidth - 1, ' ')} `;

  // Column is the click's x offset from the content box's own left edge, which
  // already accounts for the gutter and any horizontal scroll.
  const handleMouseDown = (event: MouseEvent) => {
    const originX = event.currentTarget?.x ?? event.x;
    const col = Math.max(0, event.x - originX);
    onMove(row, col, event.modifiers.shift);
  };

  return (
    <box flexDirection="row" minHeight={1}>
      <text fg={theme.colors.neutral[600]}>{lineNumber}</text>

      {/* Content layer with cursor / selection overlays positioned by column. */}
      <box position="relative" flexGrow={1} onMouseDown={handleMouseDown}>
        {selection && (
          <box
            position="absolute"
            left={selection.start}
            top={0}
            width={Math.max(1, selection.end - selection.start)}
            height={1}
            backgroundColor={theme.colors.neutral[700]}
            zIndex={-2}
          />
        )}

        {highlights.map((hl, i) => (
          <box
            key={i}
            position="absolute"
            left={hl.start}
            top={0}
            width={Math.max(1, hl.end - hl.start)}
            height={1}
            backgroundColor={
              hl.active ? theme.colors.lime.dark : theme.colors.lime.darker
            }
            zIndex={-2}
          />
        ))}

        {showCursor && isCursorRow && (
          <box
            position="absolute"
            left={cursor.col}
            top={0}
            width={1}
            height={1}
            backgroundColor={theme.colors.lime.main}
            zIndex={-1}
          />
        )}

        <text>
          {segments.map((seg, i) => (
            <span key={i} fg={seg.color}>
              {seg.text}
            </span>
          ))}
        </text>
      </box>
    </box>
  );
}
