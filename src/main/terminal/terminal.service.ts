/**
 * Shells, and the pseudo-terminals they run on.
 *
 * This is the piece the TUI could not have done well in a browser process and
 * the clearest case of the split the app is built on: the PTY, the child
 * process and its signals live here in Node, and the renderer gets a byte
 * stream and a size. It never learns the pid.
 *
 * Two things the TUI had to do by hand are gone, because node-pty uses
 * `forkpty` rather than wiring stdio to a bare file descriptor:
 *
 * - **Ctrl+C.** The child gets a real *controlling* terminal with a line
 *   discipline, so `0x03` written to the master is turned into `SIGINT` for
 *   the foreground process group by the kernel — and a program in raw mode
 *   (an editor, an agent, a REPL) still receives the byte itself, because
 *   turning raw mode on is exactly what clears `ISIG`. The TUI had to read
 *   termios flags and decide which of the two to do.
 * - **SIGWINCH.** `resize()` is `ioctl(TIOCSWINSZ)` on a master that *has* a
 *   foreground group, so the kernel raises the signal. The TUI's PTY had no
 *   session, so nothing was in that group and the signal went nowhere; it had
 *   to be sent by hand after every resize.
 *
 * What did survive is teardown — see `terminal.registry.ts`.
 */
import { spawn, type IPty } from 'node-pty';
import { webContents } from 'electron';
import { homedir } from 'node:os';
import { createLogger } from '@main/logger';
import { killTree } from './terminal.registry';
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  DEFAULT_SHELL,
  FLUSH_MS,
  MAX_BATCH,
  SHELL_ARGS,
} from './terminal.constant';
import type { Req } from '@shared/ipc.def';
import type { TerminalInfo } from '@shared/terminal.def';

const log = createLogger('terminal');

interface Session {
  id: string;
  pty: IPty;
  pid: number;
  /** The window that asked for this shell, and the only one told about it. */
  senderId: number;
  /** Output waiting to be sent, and the timer that will send it. */
  buffer: string;
  timer: NodeJS.Timeout | null;
}

const sessions = new Map<string, Session>();

/** Sends a payload to the one window that owns the session. */
function send(session: Session, channel: string, payload: unknown): void {
  const target = webContents.fromId(session.senderId);
  // A window can close with its shells still running — the kill goes through
  // `disposeTerminals`, but a chunk already in flight arrives here first.
  if (!target || target.isDestroyed()) return;
  target.send(channel, payload);
}

function flush(session: Session): void {
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }
  if (!session.buffer) return;

  const data = session.buffer;
  session.buffer = '';
  send(session, 'terminal:data', { id: session.id, data });
}

/** Pools output, and sends it a frame later or once it gets big. */
function queue(session: Session, chunk: string): void {
  session.buffer += chunk;

  if (session.buffer.length >= MAX_BATCH) {
    flush(session);
    return;
  }
  session.timer ??= setTimeout(() => flush(session), FLUSH_MS);
}

/**
 * Spawns a shell for `id`.
 *
 * Re-creating a live id replaces it rather than failing. That is what a dev
 * reload asks for — React's StrictMode mounts, unmounts and mounts again, and
 * HMR remounts the component with the same session — and leaving the first
 * shell running would orphan it with nothing left holding its id.
 */
export function createSession(
  { id, cwd, cols, rows }: Req<'terminal:create'>,
  senderId: number
): TerminalInfo {
  const existing = sessions.get(id);
  if (existing) {
    log.info(`replacing session ${id} (pid ${existing.pid})`);
    killSession(id);
  }

  const shell = process.env['SHELL'] ?? DEFAULT_SHELL;

  const pty = spawn(shell, SHELL_ARGS, {
    name: 'xterm-256color',
    cols: cols > 0 ? cols : DEFAULT_COLS,
    rows: rows > 0 ? rows : DEFAULT_ROWS,
    // An unreadable cwd makes the spawn throw rather than fall back, and the
    // project root can be '' before a folder is open.
    cwd: cwd || homedir(),
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  });

  const session: Session = {
    id,
    pty,
    pid: pty.pid,
    senderId,
    buffer: '',
    timer: null,
  };
  sessions.set(id, session);

  pty.onData((chunk) => queue(session, chunk));

  pty.onExit(({ exitCode, signal }) => {
    // An exit always arrives, including for a shell we killed ourselves — and
    // by then the id may already belong to a *different* session, because a
    // dev reload replaces one in place. Reporting this exit would then close
    // a tab whose shell is alive and drop it from the registry. So the event
    // only counts while this session is still the one registered.
    if (sessions.get(id) !== session) return;

    // Whatever the shell printed on its way out goes first, or the goodbye
    // arrives after the obituary.
    flush(session);
    sessions.delete(id);
    send(session, 'terminal:exit', { id, exitCode, signal });
    log.info(`session ${id} exited (code ${exitCode})`);
  });

  installTeardownHooks();

  log.info(`session ${id} on ${shell} (pid ${pty.pid}) in ${cwd || homedir()}`);
  return { id, pid: pty.pid, shell };
}

export function writeSession(id: string, data: string): void {
  sessions.get(id)?.pty.write(data);
}

export function resizeSession(id: string, cols: number, rows: number): void {
  // A terminal behind another tab is laid out at zero size. Passing that on
  // would tell every full-screen program it has no room, and they do not
  // recover gracefully from being told the window is 0x0.
  if (cols <= 0 || rows <= 0) return;

  const session = sessions.get(id);
  if (!session) return;

  try {
    session.pty.resize(cols, rows);
  } catch (error) {
    // The shell can exit between the renderer measuring and this arriving.
    log.error(`resize ${id} failed`, error);
  }
}

/** Ends a session and everything its shell started. */
export function killSession(id: string, walkTree = true): void {
  const session = sessions.get(id);
  if (!session) return;

  sessions.delete(id);
  if (session.timer) clearTimeout(session.timer);
  killTree(session.pid, 'SIGTERM', walkTree);
}

/**
 * Ends every session belonging to one window.
 *
 * Closing a window is not quitting. Its shells — and the dev servers,
 * watchers and agents they started — have to go, and every other window's
 * have to survive, which is why this exists beside `disposeTerminals` rather
 * than as a flag on it. SIGTERM rather than SIGKILL for the same reason
 * `killSession` uses it: a window closing is an orderly end, and a shell that
 * wants to save its history should get the chance.
 */
export function killSessionsOf(senderId: number): void {
  const owned = [...sessions.values()].filter(
    (session) => session.senderId === senderId
  );
  if (owned.length === 0) return;

  log.info(`window ${senderId} closed — ending ${owned.length} session(s)`);
  for (const session of owned) killSession(session.id);
}

/**
 * Tears every shell down. SIGKILL, because quitting cannot wait out a shell
 * that ignores SIGTERM.
 *
 * @param walkTree whether `pgrep` may be used to find jobs that are not in
 *   the shell's own process group. It is needed — see `killTree` — and it is
 *   available everywhere except inside the `exit` handler, which is the one
 *   place left where spawning a process is not dependable.
 */
export function disposeTerminals(walkTree = true): void {
  if (sessions.size > 0) {
    log.info(`tearing down ${sessions.size} session(s)`);
  }
  for (const session of [...sessions.values()]) {
    sessions.delete(session.id);
    if (session.timer) clearTimeout(session.timer);
    killTree(session.pid, 'SIGKILL', walkTree);
  }
}

/**
 * The paths out of the process that Electron's `will-quit` does not cover.
 *
 * `will-quit` fires for a real quit — Cmd+Q, the last window closing — and
 * for nothing else. A signal does not go through Electron at all: Node's
 * default action for SIGTERM is to die on the spot, so the handler that kills
 * the shells never runs, and `pnpm dev` stopped from the terminal leaves a
 * tree of orphaned shells and whatever they were running. Verified the hard
 * way: a backgrounded `sleep` outlived the app every time until this existed.
 *
 * Installed on the first spawn rather than at startup, so an app that never
 * opens a terminal never changes its own signal handling.
 */
let hooksInstalled = false;
function installTeardownHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  // Runs even on `process.exit()`, but this late only a bare `kill` syscall
  // can be relied on, so it gets the group and nothing else. By then the
  // handlers below have normally already done the thorough version.
  process.on('exit', () => disposeTerminals(false));

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => {
      log.info(`${sig} — killing every shell before exiting`);
      disposeTerminals();
      process.exit(0);
    });
  }
}
