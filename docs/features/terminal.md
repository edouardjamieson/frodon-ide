# Terminal

Real shells on real pseudo-terminals, in a tile. The clearest case of the
process split paying for itself.

## Goal

Run the thing you are building without leaving the window it is built in — and
have Ctrl+C, resizing, job control and cleanup behave the way they do in a
terminal emulator, because they are being done by the kernel rather than
imitated.

## Where it lives

| Path | What it holds |
| --- | --- |
| `main/terminal/terminal.service.ts` | spawn, write, resize, kill, and the output batching |
| `main/terminal/terminal.registry.ts` | killing a shell and everything it started |
| `main/terminal/terminal.constant.ts` | `FLUSH_MS`, `MAX_BATCH`, the default shell |
| `components/modules/terminal/terminal.hook.ts` | the xterm instance, wired through refs |
| `components/modules/terminal/terminal.theme.ts` | the sixteen ANSI colors, handed to xterm's `ITheme` |

## How it works

The shell, its PTY, its signals and its process tree live in main. The renderer
has an emulator, a byte stream and a size, and never learns the pid.

```
keystroke ──> terminal:write ──> pty.write          one invoke per keypress
pty.onData ──> pooled 8ms / 64KB ──> terminal:data  one event per batch
```

**Output is batched; input is not.** A build log is thousands of small writes a
second, and one message per write would spend more time in structured clone
than in the terminal. Keystrokes are a few bytes at human speed, so they keep
the typed round trip.

**The renderer names the session.** Main spawns the shell and keys its registry
by that name. Main minting the id and returning it would leave the tab without
an identity for the round trip, and every tab needs one the moment it is drawn.

**Output is addressed, not broadcast.** The window that asked for the shell is
kept on `event.sender` at the handler — a `WebContents`, which can be asked
whether it is still alive — rather than inventing a window id for the renderer
to carry. The preload then filters by session id, so a workbench full of
terminals does not wake every one of them for every chunk.

### What a real controlling terminal gave us for free

node-pty uses `forkpty`, so the child gets a real controlling terminal with a
line discipline. Two things the TUI did by hand are simply gone:

- **Ctrl+C.** `0x03` written to the master is turned into `SIGINT` for the
  foreground process group by the kernel — and a program in raw mode (an
  editor, an agent, a REPL) still receives the byte, because turning raw mode
  on is exactly what clears `ISIG`. The TUI read termios flags to decide
  between the two. Nothing here reads a termios flag anywhere.
- **SIGWINCH.** `resize()` is `ioctl(TIOCSWINSZ)` on a master that *has* a
  foreground group, so the kernel raises the signal. The TUI's PTY had no
  session, so nothing was in that group and the signal had to be sent by hand.

### What it did *not* give us: teardown

`IPty.kill()` is `SIGHUP` to the shell alone. The `pnpm dev` it launched, the
watcher that launched, the dev server that launched — none are signalled, and
all keep running after the tab is gone.

The shell is a session leader, so its process *group* is its own pid and
signalling the negative pid reaches the shell plus anything in the foreground,
in one syscall with no subprocess. That is not enough on its own, and this is
where the TUI's version was quietly wrong: its shells had no controlling
terminal, so job control was off and everything stayed in the shell's group.
Here the shell turns job control on and puts every background job in a group of
its own, so `sleep 600 &` survives a kill aimed at the shell's group. Walking
the real parent→child tree with `pgrep` is what reaches it — and it has to run
**before** the shell dies, or the children are already reparented to init.

Electron's `will-quit` does not fire for a signal, so `SIGINT`/`SIGTERM`/
`SIGHUP` handlers are installed on the first spawn. Each of these leaked a
process until it was fixed.

**A closing window takes its own shells and nobody else's.** `disposeTerminals`
kills every shell in the process, which is right for quitting and wrong the
moment there are two windows. `killSessionsOf(senderId)` is the per-window
version, called from the window's `closed` handler — the registry already
carries `senderId` on each session for routing output, so the owner was
already known. SIGTERM rather than SIGKILL: a window closing is an orderly
end, and a shell that wants to write its history should get the chance.
See [ADR-0032](../decisions.md).

## User flows

### Opening a shell

1. `openTerminal` routes to a terminal window — asked for, else focused, else
   any, else a new one — and always adds a **new** session.
2. The renderer mints the id, sizes the emulator, and calls `terminal:create`
   with the project root as `cwd`.
3. Main spawns the shell and answers with the pid and the program.

### Closing the window

1. Every session whose `senderId` is that window's is killed; every other
   window's keep running.
2. The dev server in the window you closed stops. The one in the window you
   did not keeps serving.

### Closing one

1. Closing the tab calls `terminal:kill`.
2. Main walks the process tree with `pgrep`, signals the descendants deepest
   first, then the shell's group.
3. `terminal:exit` arrives for a session main has already dropped. That is
   normal.

### Reopening a project

A saved terminal window comes back as its tile with one fresh shell. The shell
is a process, it is gone, and the scrollback with it — saying so in the type is
better than a field that always comes back empty.

## Rules

- **Nothing about the shell crosses except bytes and a size.** No pid, no
  environment, no process tree. The renderer has an emulator.
- **The emulator is created by hand, not by JSX**, and mutated through refs. An
  xterm instance re-parented in the DOM loses its state; so does a
  `<webview>`, for a related reason. See [browser.md](browser.md).
- **An event can outlive what it describes.** A chunk can be in flight when the
  window closes. What is *not* acceptable is acting on an event whose id has
  been reused — main checks the session it is reporting on is still the
  registered one before sending.
- **`terminal:data` is the one genuinely high-frequency channel in the app.**
  Treat any new per-keystroke or per-frame channel as needing the same
  justification.
- **node-pty needs `scripts/fix-spawn-helper.mjs`.** The 1.1.0 prebuild ships
  `spawn-helper` without its executable bit and the first terminal dies with
  `posix_spawnp failed`. It runs from `postinstall`. Packaging will also need
  `prebuilds/` unpacked from the asar.

## Not there yet

- Scrollback is not persisted, and will not be.
- The shell is `$SHELL` or a default; nothing configurable yet. It wants the
  config layer.
- The env stamp (`FRODON_PROJECT`, `FRODON_SESSION`, `FRODON_WINDOW`) is five
  lines and designed but unbuilt — see the parked MCP note in
  [migration.md](../migration.md).

## See also

[workbench.md](workbench.md) · [theme.md](../theme.md) ·
[ipc.md](../ipc.md) · [decisions.md](../decisions.md)
