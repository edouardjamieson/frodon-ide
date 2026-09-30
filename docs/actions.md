# Actions

User-configured shell commands bound to filesystem events. The point (per the
product vision) is to lean on the user's real toolchain — linters, formatters,
codegen — instead of reimplementing IDE features natively. You declare commands
in the `.frodon` config and Frodon runs them when files are saved, created,
renamed, or deleted.

## Configuring

Actions live in the `actions` array of any config layer:

```jsonc
{
  "actions": [
    {
      "on": "save",                              // save | create | rename | delete | change
      "run": "bunx prettier --write {{filePath}}", // shell command, run via `sh -c`
      "match": "**/*.{ts,tsx,js,jsx,json,md}",    // optional glob (project-relative); omit = all files
      "blocking": true                             // await before continuing (formatters); default false
    }
  ]
}
```

### Template variables

Resolved against the file that triggered the action:

| Variable           | Value                                             |
| ------------------ | ------------------------------------------------- |
| `{{filePath}}`     | absolute path                                     |
| `{{fileName}}`     | basename (`button.tsx`)                            |
| `{{fileDir}}`      | absolute directory                                |
| `{{relativePath}}` | path relative to the project root                 |
| `{{fileExt}}`      | extension incl. dot (`.tsx`)                       |
| `{{projectRoot}}`  | absolute project root (also the command's cwd)    |
| `{{oldPath}}`      | absolute prior path — **rename only**, else empty |

An unknown `{{variable}}` doesn't run; the action is recorded as an error.

### Layering

Config resolves `defaults < user < project (git) < local (git-ignored)`.
Unlike other sections (which override key-by-key), **`actions` accumulate across
layers** — a personal format-on-save in `~/.config/frodon/config.json` and a
team linter in `.frodon/config.json` both fire.

### Execution semantics

- Matching actions for an event run in declared order.
- `blocking: true` actions are awaited in order; the rest launch detached.
- Commands run through `sh -c` with cwd = project root, so pipes / `&&` / `npx`
  work as written.
- Every run (exit code, stdout, stderr, errors) is recorded in the actions
  store (`ActionRun`), ready for a results panel.

## How saves adopt formatter output

When a `blocking` save-action rewrites the file on disk (e.g. `eslint --fix`),
the editor re-reads it and swaps the buffer to match — so the reformat shows up
live and is undoable. It's skipped if you've typed since saving, so an async
formatter can't clobber fresh edits. This same reload seam is the intended plug
point for future live streaming (AI edits into the open editor, `fs.watch`).

## Where it lives

| Concern                    | File                                                    |
| -------------------------- | ------------------------------------------------------- |
| Types (`Action`, events)   | `src/lib/actions/actions.def.ts`                        |
| Run history store          | `src/lib/actions/actions.store.ts`                      |
| Resolve / match / run      | `src/lib/actions/actions.service.ts`                    |
| `triggerActions` + hook    | `src/lib/actions/actions.hook.ts`                       |
| Config schema + merge      | `src/lib/config/` (`config.def.ts`, `config.service.ts`)|

Triggers are fired from the **callers** of a filesystem change, not from the
pure `fs.service.ts` leaf:

- `onSave` — editor `save()` in `src/components/modules/editor/editor.hook.ts`
- `onCreate` / `onRename` / `onDelete` — the explorer handlers in
  `src/components/modules/explorer/explorer.hook.ts`

## Status

Built:

- Action model, config schema (with cross-layer accumulation), variable
  resolution, glob matching, `sh -c` execution with run history.
- Wired triggers: `save`, `create`, `rename`, `delete`.
- Blocking-formatter output adoption in the editor.

Not built yet:

- `change` event. The `fs.watch` it needs now exists — open buffers already
  adopt external edits live (`watchFile` in `editor.hook.ts`) — but that seam
  doesn't fire an action trigger yet.
- A results panel surfacing `ActionRun` output.
