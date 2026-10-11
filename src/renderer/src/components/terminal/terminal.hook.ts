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
import { monospaceStack, xtermTheme } from './terminal.theme';

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
  const [error, setError] = useState<string | null>(null);

  const theme = useTheme();
  /**
   * Values the mount effect needs but must not re-run for. Rebuilding the
   * emulator because the theme changed would throw away the scrollback — and
   * killing the shell because the project moved would be worse.
   */
  const latest = useRef({ theme, cwd, onExit });
  // Declared before every other effect so it has already run by the time they
  // read it, on this commit and on every later one.
  useEffect(() => {
    latest.current = { theme, cwd, onExit };
  });

  // One emulator and one shell, for as long as the tab exists.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: monospaceStack(),
      fontSize: 13,
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
    };
  }, [sessionId]);

  // Recolor in place. xterm rebuilds its glyph atlas from this; the buffer,
  // the scrollback and the running program are untouched.
  useEffect(() => {
    const term = termRef.current;
    if (term) term.options.theme = xtermTheme(theme);
  }, [theme]);

  // Keystrokes go to exactly one shell: the visible tab of the focused window.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (active && focused) term.focus();
    else term.blur();
  }, [active, focused]);

  return { hostRef, error };
}
