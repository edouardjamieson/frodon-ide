import { useEffect, useRef, useState } from 'react';
import type { EmbeddedTerminalRenderable } from '@opentui/core';
import Logger from '~/lib/logger/logger.service';
import {
  registerTerminalProcess,
  killTerminalProcess,
} from './terminal.registry';

// A login+interactive shell so profiles load (PATH, aliases) and a prompt
// shows; falls back to zsh, the macOS default.
const SHELL = process.env.SHELL ?? 'zsh';

// ETX, the byte the emulator emits for Ctrl+C.
const CTRL_C = 0x03;
// The ISIG bit of termios c_lflag — set when the foreground program wants
// signal-driven interrupt rather than the raw ^C byte. The flag value differs
// by platform.
const ISIG = process.platform === 'linux' ? 0x00000001 : 0x00000080;

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
export function useTerminal(focused: boolean, onFocusRequest?: () => void) {
  const terminalRef = useRef<EmbeddedTerminalRenderable>(null);
  const ptyRef = useRef<Bun.Terminal | null>(null);
  const shellPidRef = useRef<number | null>(null);
  const [exited, setExited] = useState(false);

  // Bridge clicks into window focus. Clicking the terminal focuses the embedded
  // renderable for keyboard input, but when the foreground program has mouse
  // reporting on (e.g. Claude) the renderable consumes the mouse-down and stops
  // it propagating — so it never reaches the window box's own focus handler and
  // the window doesn't become focused, leaving the editor still receiving keys.
  // `onMouse` is a catch-all listener the renderable fires for every mouse event
  // before its per-type handlers, so hooking it requests focus without touching
  // the built-in mouse-down that forwards the click to the PTY.
  const onFocusRef = useRef(onFocusRequest);
  onFocusRef.current = onFocusRequest;
  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;
    term.onMouse = (event) => {
      if (event.type === 'down') onFocusRef.current?.();
    };
  }, []);

  // Keep the PTY's window size matched to the emulator so full-screen programs
  // (vim, htop, an AI agent) lay out against the real viewport.
  //
  // The size alone isn't enough. `Bun.spawn({ terminal })` wires the PTY to the
  // child's stdio but never makes it the child's *controlling* terminal — the
  // shell ends up with no session and the PTY with no foreground process group
  // (`ps` reports `TTY ??`, `TPGID 0`, and the shell announces "no job
  // control"). TIOCSWINSZ only raises SIGWINCH on that foreground group, so with
  // nobody in it the resize lands silently: `stty size` reports the new box, yet
  // nothing running inside is ever told. A program that measured the terminal at
  // startup and redraws on SIGWINCH — which is every full-screen one — keeps
  // painting at the old dimensions, so splitting a window or resizing the host
  // terminal leaves its screen mangled until something else forces a repaint.
  //
  // So deliver the signal by hand, to the shell's process group: the login shell
  // makes itself a group leader, job control is off, and everything it runs
  // stays in that group — the same assumption `handleData` leans on to turn
  // Ctrl+C into SIGINT.
  const resizePty = (cols: number, rows: number) => {
    // A terminal hidden behind another tab is laid out with `display: none` and
    // can measure as 0×0; ignore those so a backgrounded shell keeps its size
    // and full-screen programs don't collapse when the tab is reactivated.
    if (cols <= 0 || rows <= 0) return;

    const pty = ptyRef.current;
    if (!pty) return;
    pty.resize(cols, rows);

    const pid = shellPidRef.current;
    if (!pid) return;
    try {
      process.kill(-pid, 'SIGWINCH');
    } catch (error) {
      // ESRCH means the group isn't there to signal: either the shell has
      // exited, or it hasn't finished claiming its own process group yet (the
      // opening resize below runs within a tick of the spawn). Neither needs
      // reporting -- a shell still starting up reads the size we just set.
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ESRCH') {
        Logger.log(
          `terminal: failed to notify group ${pid} of resize: ${error}`
        );
      }
    }
  };

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
      shellPidRef.current = proc.pid;
      // Track the shell so its whole process tree — not just the shell — is torn
      // down on close and on app quit (see terminal.registry).
      registerTerminalProcess(proc.pid);

      // The emulator reports its measured box through `onTerminalResize` on the
      // first layout pass, which falls either side of this effect depending on
      // whether the pane mounts with the frame or into one already laid out.
      // When it lands first there's no PTY yet to apply it to and the shell is
      // left on the 80×24 seed above; replaying the measurement closes that gap.
      const term = terminalRef.current;
      if (term) resizePty(Math.floor(term.width), Math.floor(term.height));
    } catch (error) {
      Logger.log(`terminal: failed to spawn ${SHELL}: ${error}`);
      setExited(true);
    }

    return () => {
      disposed = true;
      if (proc?.pid) killTerminalProcess(proc.pid);
      pty.close();
      ptyRef.current = null;
      shellPidRef.current = null;
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

  // Bytes the emulator wants to send back to the shell. Ctrl+C needs help:
  // Bun's PTY ships with the INTR control char disabled, so a lone ETX (0x03)
  // never becomes SIGINT on its own. Reproduce a real terminal's behaviour by
  // hand — if the foreground program uses signal-driven interrupt (ISIG on: a
  // shell prompt, `npm run dev`, `top`), send SIGINT to the shell's process
  // group; if it's in raw mode (ISIG off: an editor, `claude`, a REPL), forward
  // the raw byte so the program can react to Ctrl+C itself. Job control is off,
  // so the whole tree shares the shell's group and the group signal reaches the
  // running command.
  const handleData = (bytes: Uint8Array) => {
    const pty = ptyRef.current;
    if (!pty) return;

    const pid = shellPidRef.current;
    const isCtrlC = bytes.length === 1 && bytes[0] === CTRL_C;
    if (isCtrlC && pid && (pty.localFlags & ISIG) !== 0) {
      try {
        process.kill(-pid, 'SIGINT');
      } catch (error) {
        Logger.log(`terminal: failed to interrupt group ${pid}: ${error}`);
      }
      return;
    }

    pty.write(bytes);
  };

  // The emulator's own measurement of its box, forwarded to the shell.
  const handleResize = (cols: number, rows: number) => resizePty(cols, rows);

  return { terminalRef, exited, handleData, handleResize };
}
