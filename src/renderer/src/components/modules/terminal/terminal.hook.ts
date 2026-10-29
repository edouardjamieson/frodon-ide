/**
 * One xterm instance, bound to one shell in main.
 *
 * Two byte streams cross here, and nothing else does:
 *
 *   shell → screen   `terminal:data` events, batched in main, written into
 *                    the emulator, which parses the VT stream and draws it.
 *   screen → shell   whatever xterm encoded for a keypress — including the
 *                    control bytes — sent straight back over `terminal:write`.
 *
 * The renderer never learns the pid, never sees a signal, and makes no
 * decisions about either. That is what the process split buys: the hard parts
 * of a terminal — the controlling tty, the line discipline, SIGWINCH, killing
 * a process tree — are the kernel's and main's, and this file is a view.
 */
import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useTheme } from '~/lib/theme';
import { useTerminalText } from '~/lib/config';
import { terminalFont, xtermTheme } from './terminal.theme';

interface UseTerminalOptions {
  /** The session id, shared with main. Changing it is a different shell. */
  sessionId: string;
  /** Where the shell starts. The project root, normally. */
  cwd: string;
  /** Whether this session is the visible tab in its window. */
  active: boolean;
  /** Whether the owning window has focus. */
  focused: boolean;
  /** Called when the shell exits — `exit`, Ctrl+D, or a crash. */
  onExit: () => void;
}

export function useTerminal({
  sessionId,
  cwd,
  active,
  focused,
  onExit,
}: UseTerminalOptions) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  /**
   * The mount effect's fit, for the font effect below. A new size changes the
   * cell, not the element, so the `ResizeObserver` never hears about it and
   * the grid would stay the shape it was for the old font.
   */
  const fitRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const theme = useTheme();
  const text = useTerminalText();
  /**
   * Values the mount effect needs but must not re-run for. Rebuilding the
   * emulator because the theme changed would throw away the scrollback — and
   * killing the shell because the project moved would be worse.
   */
  const latest = useRef({ theme, text, cwd, onExit });
  // Declared before every other effect so it has already run by the time they
  // read it, on this commit and on every later one.
  useEffect(() => {
    latest.current = { theme, text, cwd, onExit };
  });

  // One emulator and one shell, for as long as the tab exists.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: terminalFont(latest.current.text.fontFamily),
      fontSize: latest.current.text.fontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      // Deep enough to scroll back through a build, shallow enough that a
      // runaway log doesn't grow without bound.
      scrollback: 5000,
      // Left Option as Meta, which is what a Mac user who has set up their
      // shell expects — Option+B/F for word movement.
      macOptionIsMeta: true,
      theme: xtermTheme(latest.current.theme),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    termRef.current = term;

    /**
     * Fit, but only while the tab is actually on screen.
     *
     * A hidden tab is `display: none`, and the fit addon measures it with
     * `getComputedStyle` — which inside a `display: none` subtree returns the
     * *computed* value of `height: 100%`, i.e. the string "100%", which
     * `parseInt` happily reads as a hundred pixels. The result is a proposed
     * 10x5 grid, a SIGWINCH, and a full-screen program in a background tab
     * redrawing itself into a corner. `clientWidth` is the honest answer: zero
     * for anything not being laid out.
     */
    const fitIfVisible = () => {
      if (host.clientWidth === 0 || host.clientHeight === 0) return;
      try {
        fit.fit();
      } catch {
        // The element can go away between an observation and this call.
      }
    };

    fitIfVisible();
    fitRef.current = fitIfVisible;

    const offData = window.frodon.terminal.onData(sessionId, (data) =>
      term.write(data)
    );
    const offExit = window.frodon.terminal.onExit(sessionId, () =>
      latest.current.onExit()
    );

    // Keystrokes. `term.onData` hands over exactly what a real terminal would
    // put on the wire — `\x03` for Ctrl+C, escape sequences for the arrows —
    // and the PTY's line discipline in main turns those into signals. There is
    // nothing to interpret on this side.
    const input = term.onData((data) => {
      void window.frodon.terminal.write(sessionId, data);
    });

    // The one exception. A terminal has no encoding for Shift+Enter — xterm
    // sends the same `\r` as Enter, so the shell submits the line. Sending
    // `ESC CR` instead, Meta+Enter, is what VS Code's terminal settled on:
    // zsh's emacs keymap inserts a newline for it, and the TUIs that take
    // multi-line input (Claude Code among them) read it the same way. The
    // kitty keyboard protocol would be the honest answer, but xterm.js does
    // not speak it. Every event type is swallowed, not only the keydown, so
    // xterm never gets a keypress to turn into a second `\r`.
    term.attachCustomKeyEventHandler((event) => {
      const shiftEnter =
        event.key === 'Enter' &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey;
      if (!shiftEnter) return true;
      if (event.type === 'keydown') {
        void window.frodon.terminal.write(sessionId, '\x1b\r');
      }
      event.preventDefault();
      return false;
    });

    // xterm reports its own geometry after a fit, so the PTY is told only
    // when the character grid actually changed — not on every pixel of a drag.
    const resized = term.onResize(({ cols, rows }) => {
      void window.frodon.terminal.resize(sessionId, cols, rows);
    });

    void window.frodon.terminal
      .create({
        id: sessionId,
        cwd: latest.current.cwd,
        cols: term.cols,
        rows: term.rows,
      })
      .catch((cause: unknown) => setError(String(cause)));

    // A pane is resized by dragging a splitter, by the window being split, and
    // by a tab becoming visible again — all of which are element size changes
    // and none of which are window resizes.
    const observer = new ResizeObserver(fitIfVisible);
    observer.observe(host);

    return () => {
      observer.disconnect();
      offData();
      offExit();
      input.dispose();
      resized.dispose();
      // The shell dies with its tab. Everything it started dies with it too —
      // that part is `terminal.registry.ts` in main.
      void window.frodon.terminal.kill(sessionId);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  // Recolor in place. xterm rebuilds its glyph atlas from this; the buffer,
  // the scrollback and the running program are untouched.
  useEffect(() => {
    const term = termRef.current;
    if (term) term.options.theme = xtermTheme(theme);
  }, [theme]);

  // Change the face in place, like the colors. xterm re-measures its cell from
  // these, and the fit afterwards turns the new cell into a new grid — and
  // the PTY hears about that through `onResize`, so a full-screen program
  // redraws at the new size rather than into the old one.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const fontFamily = terminalFont(text.fontFamily);
    if (
      term.options.fontFamily === fontFamily &&
      term.options.fontSize === text.fontSize
    ) {
      return;
    }

    term.options.fontFamily = fontFamily;
    term.options.fontSize = text.fontSize;
    fitRef.current?.();
  }, [text]);

  // Keystrokes go to exactly one shell: the visible tab of the focused window.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (active && focused) term.focus();
    else term.blur();
  }, [active, focused]);

  return { hostRef, error };
}
