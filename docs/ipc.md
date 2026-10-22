# IPC

Every conversation between the two processes goes through
`src/shared/ipc.def.ts`. Channel strings are written there once and nowhere
else.

## Adding a channel

Four edits, in this order. TypeScript fails the build between each one until
the next is done, which is the point.

**1. Declare it** in `src/shared/ipc.def.ts`:

```ts
export interface IpcContract {
  // ...
  'git:status': { req: { root: string }; res: GitStatus };
}
```

**2. Implement it** in `src/main/ipc/ipc.handlers.ts`:

```ts
handle('git:status', ({ root }) => readGitStatus(root));
```

`handle` is typed against the contract, so the argument is destructured with
real types and a wrong return type is a compile error. It also logs any thrown
error with its channel name — exceptions cross the boundary as an opaque
`Error invoking remote method`, so the real stack has to be captured on this
side or it is lost.

**3. Expose it** on the bridge, in `src/shared/ipc.def.ts` (`FrodonApi`) and
`src/preload/index.ts`:

```ts
git: {
  status: (root: string) => ipcRenderer.invoke('git:status', { root }),
},
```

**4. Call it** from a renderer hook: `await window.frodon.git.status(root)`.

## Events (main → renderer)

Declared in `IpcEvents`. Main broadcasts with `webContents.send`; the preload
wraps the subscription so the renderer gets an **unsubscribe function** back
rather than a reference to the emitter:

```ts
useEffect(() => window.frodon.project.onChanged(setFiles), [setFiles]);
```

Events are one-way and unacknowledged. A watcher firing into a window that has
since closed is normal, not an error.

Most events go to every window — the tree and the repository are one fact the
whole app shares. Two do not, and both are _subscriptions_: terminal output
goes back to the window that spawned the shell, and `file:changed` goes to the
windows that registered that path through `file:watch`. When an event is
addressed rather than broadcast, keep the address on `event.sender` at the
handler — a `WebContents`, which can be asked whether it is still alive and
can say when it goes — rather than inventing a window id for the renderer to
carry around.

## Rules worth not relearning

**Everything crossing the boundary is structured-cloned.** Plain data only —
no class instances, no functions, no zustand stores. `Map` and `Set` clone
fine; anything with a prototype does not survive.

**Chatty channels are the performance trap.** Each call costs a full clone of
its payload in both directions. The project tree is pushed only when
`sameTree` says it actually changed, because a push that changed nothing still
costs a clone of the entire tree plus a React reconcile on the other side.
Apply the same discipline to git polling and to anything per-keystroke.

**Never expose a channel the UI does not use.** The exposed surface is the
security boundary.

**A channel does not take a project root; it resolves one from the sender.**
`git:*`, `config:project`, `board:*`, `bookmark:*`, `search:*` and the `file:*`
channels that join a parent and a name all answer for whichever project the
*asking window* has open — `askingRoot(event)` and `askingRepo(event)` in
`ipc.handlers.ts`, over the registry in `main/session/`. A directory named by
the renderer is a directory main then reads and writes files in; the invoke
event's sender is something the page cannot forge. The one exception is
`window:open`, which reads and writes nothing: the root it takes is handed to
a new window, which opens it through `project:tree` like any other open.

A handler whose window has no project answers the empty value — `[]`, `{}`,
`emptyGitStatus()` — rather than throwing. It is the same forgiveness the
layout, recents and config readers show, and it keeps a stale window from
turning into an unhandled rejection in the renderer. The cost is that a
channel added without a session resolver fails silently instead of loudly;
see [decisions.md](decisions.md) ADR-0032.

**Streams don't fit this model.** A PTY emits thousands of small writes a
second and one `invoke` round-trip per write would be absurd. `terminal:data`
is how that is handled: a one-way event channel, with main pooling output for
8ms or 64KB before it crosses (`main/terminal/terminal.constant.ts`). The
round-trip survives in the _other_ direction — `terminal:write` is one call
per keystroke, which is a few bytes at human speed.

**An event can outlive what it describes.** `terminal:exit` is sent for a
session that main has already dropped, and a chunk can be in flight when the
window that asked for it closes. Both are normal. What is _not_ normal is
acting on an event whose id has since been reused: main checks that the
session it is reporting on is still the registered one before sending, and
the preload filters output by id so a chunk only wakes the terminal it
belongs to.
