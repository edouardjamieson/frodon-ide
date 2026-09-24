import { useEffect, useRef, useState } from 'react';
import type { EmbeddedTerminalRenderable } from '@opentui/core';
import Logger from '~/lib/logger/logger.service';

// A login+interactive shell so profiles load (PATH, aliases) and a prompt
// shows; falls back to zsh, the macOS default.
const SHELL = process.env.SHELL ?? 'zsh';

// ETX, the byte the emulator emits for Ctrl+C.
const CTRL_C = 0x03;
// Ctrl+E + Ctrl+U: jump to end of line, then kill it — clears the typed input.
const CLEAR_LINE = new Uint8Array([0x05, 0x15]);

/**
 * Owns a real pseudo-terminal for one terminal window: spawns the user's shell
 * attached to a `Bun.Terminal` PTY and bridges it to OpenTUI's embedded VT
 * emulator.
 *
 * Two byte streams cross here:
 *  - shell → screen: the PTY's `data` callback feeds bytes into the emulator
 *    (`terminalRef.write`), which parses the VT stream and renders it.
 *  - screen → shell: the emulator's `onData` (keystrokes it encoded, plus VT
 *    responses like cursor-position reports) is written back to the PTY.
 */
export function useTerminal(focused: boolean) {
  const terminalRef = useRef<EmbeddedTerminalRenderable>(null);
  const ptyRef = useRef<Bun.Terminal | null>(null);
  const [exited, setExited] = useState(false);

  // Spawn the shell + PTY once, for the lifetime of the window.
  useEffect(() => {
    // Guards the async `data` callback against firing after teardown, when the
    // emulator handle is already gone.
    let disposed = false;

    const pty = new Bun.Terminal({
      // Seed values only; the emulator derives the real size from its box and
      // corrects the PTY through `onTerminalResize` once layout settles.
      cols: 80,
      rows: 24,
      data: (_pty, bytes) => {
        if (!disposed) terminalRef.current?.write(bytes);
      },
      exit: () => {
        if (!disposed) setExited(true);
      },
    });
    ptyRef.current = pty;

    let proc: ReturnType<typeof Bun.spawn> | null = null;
    try {
      proc = Bun.spawn([SHELL, '-il'], {
        cwd: process.cwd(),
        env: { ...process.env, TERM: 'xterm-256color' },
        terminal: pty,
      });
    } catch (error) {
      Logger.log(`terminal: failed to spawn ${SHELL}: ${error}`);
      setExited(true);
    }

    return () => {
      disposed = true;
      try {
        proc?.kill();
      } catch (error) {
        Logger.log(`terminal: failed to kill shell: ${error}`);
      }
      pty.close();
      ptyRef.current = null;
    };
  }, []);

  // Focus follows the owning window: only the focused terminal registers a
  // keypress handler, so keystrokes reach exactly one shell.
  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;
    if (focused) term.focus();
    else term.blur();
  }, [focused]);

  // Bytes the emulator wants to send back to the shell. Ctrl+C arrives as a lone
  // ETX (0x03); rather than forward it as SIGINT, rewrite it to clear whatever
  // the user is typing. CLEAR_LINE is Ctrl+E (move to end of line) followed by
  // Ctrl+U (kill the line) so the whole input is discarded regardless of cursor
  // position, in both zsh and bash.
  const handleData = (bytes: Uint8Array) => {
    const pty = ptyRef.current;
    if (!pty) return;
    if (bytes.length === 1 && bytes[0] === CTRL_C) {
      pty.write(CLEAR_LINE);
      return;
    }
    pty.write(bytes);
  };

  // Keep the PTY's window size matched to the emulator so full-screen programs
  // (vim, htop, less) lay out against the real viewport.
  // A terminal hidden behind another tab is laid out with `display: none` and
  // can measure as 0×0; ignore those so a backgrounded shell keeps its size and
  // full-screen programs don't collapse when the tab is reactivated.
  const handleResize = (cols: number, rows: number) => {
    if (cols <= 0 || rows <= 0) return;
    ptyRef.current?.resize(cols, rows);
  };

  return { terminalRef, exited, handleData, handleResize };
}
