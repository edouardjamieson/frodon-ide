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

**Streams don't fit this model.** A PTY emits thousands of small writes a
second and `invoke` round-trips are the wrong shape for it. When terminals
land, they want a dedicated high-frequency event channel carrying batched
`Uint8Array` chunks — see `docs/migration.md`.
