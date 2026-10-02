# Development

Working on Frodon itself. For using it, start at the
[README](../README.md).

```bash
bun install
bun dev          # hot-reloading: bun run --watch src/index.tsx
bun run typecheck
bunx eslint .    # no lint script; run it directly
bun run build    # bundles dist/index.js for publishing
```

Bun 1.3.0 or later, same as the app — `engines.bun` is the single source of
that floor, and the build asserts it against `MINIMUM_BUN`.

Formatting is Prettier's defaults with two-space indent, single quotes,
semicolons and `es5` trailing commas (`.prettierrc`). There is no test runner.

## There is no console

Frodon owns the terminal, so **`console.log` corrupts the render** — the output
interleaves with the frame the renderer is drawing and the screen tears. Use the
file logger and tail it from another shell:

```ts
import Logger from '~/lib/logger/logger.service';
Logger.log(anything);   // appends to ./test.log
```

```bash
tail -f test.log
```

## Rendering model

JSX intrinsics (`<box>`, `<text>`, `<scrollbox>`, `<ascii-font>`) come from
`@opentui/react` via `jsxImportSource` in `tsconfig.json`, **not** the DOM.
There is no browser, no CSS and no `document`. Layout is flexbox through Yoga,
and colors are hex strings that come from the active theme.

Never hardcode a color or a glyph in a component. Add a role to `ThemeRoles` /
`ROLE_DEFAULTS`, or an icon to `ThemeIcons` / `DEFAULT_ICONS`, and read it with
`useTheme()`:

```ts
const { colors, icons, syntax } = useTheme();
```

Icons must measure one or two terminal cells — the loader rejects anything else,
and `Icon` reserves the width it measures. Structural marks (tree arrows,
bullets, the inline dismiss) stay single-cell Geometric Shapes, because they
have to dim with their row and emoji ignore `fg`. See
[themes.md](themes.md) for the full color and glyph model.

## Module convention

Every feature — a visual module under `src/components/` or a service under
`src/lib/` — is a folder of single-responsibility files sharing a name prefix,
re-exported through a barrel `index.ts`:

| File              | Holds                                                      |
| ----------------- | ---------------------------------------------------------- |
| `*.component.tsx` | the OpenTUI view; kept thin                                |
| `*.hook.ts`       | `use*` hooks wrapping the store, and the logic             |
| `*.store.ts`      | a zustand store — app state lives here, not in React state  |
| `*.service.ts`    | non-visual logic with no React dependency                  |
| `*.def.ts`        | types, interfaces, enums                                   |
| `*.constant.ts`   | constants (`.tsx` when they hold JSX)                      |

Import across features through the barrel and the `~/*` alias (`~/*` →
`./src/*`), e.g. `import { useProject } from '~/lib/project'`.

## Layout

| Path                       | What                                                        |
| -------------------------- | ----------------------------------------------------------- |
| `src/index.tsx`            | renderer creation, crash handlers, the app root             |
| `src/pages/`               | top-level route screens                                     |
| `src/lib/`                 | services and stores — see below                             |
| `src/components/modules/`  | feature UI: editor, explorer, sidebar, window, terminal, palette, git |
| `src/components/ui/`       | primitives: button, dialog, loader, tooltip, error boundary |

Under `src/lib/`: `project` (load the tree) · `fs` (filesystem + the scan) ·
`ignore` (the one exclusion matcher) · `search` (project-wide text search) ·
`window` (tiling layout) · `router` · `config` (layered settings) · `actions`
(event-bound commands) · `git` · `preflight` (the Bun version gate) · `crash`
(terminal restore on fatal errors) · `language` · `clipboard` · `logger` ·
`theme`.

## How the pieces fit

**Routing** is hand-rolled, not URL-based. `ROUTE` is an enum, `ROUTES` (in
`router.constant.tsx`) maps each route to a JSX element, and a zustand store
holds the active route plus params:

```ts
const { navigate } = useRouter();
navigate(ROUTE.HOME);
```

`RootPage` loads the project, then navigates to `HOME`, which is
`Sidebar` + `WindowsManager`.

**Project loading** reads `process.cwd()` recursively through `readFilesFromDir`
into a nested `File` tree (directories first, then alphabetical).
`useProjectSync()` watches the root and rescans on a debounce, so edits made
outside Frodon — another terminal, an agent writing to the repo — reach the
explorer. A rescan that finds the same tree stores nothing, so content-only
writes don't re-render it.

**The window manager** is a tiling grid. Each `Window` carries a
`rowIndex`/`colIndex` and a type (`CODE_EDITOR` | `TERMINAL`), and
`useCalculateLayout` derives percentage `left/top/width/height` from how many
windows share each row. A window with no type renders the welcome screen. Open
files and terminal sessions are tracked in the window store, keyed by
`windowId`.

**The editor** builds syntax highlighting on `refractor`: `useEditor` reads the
file, flattens the refractor AST into positioned `Token`s, and groups them into
`Line`s for rendering, mapping refractor token types onto the theme's ten syntax
groups via `SYNTAX_GROUP_BY_TOKEN`.

**Themes** resolve in three layers — a ~17-entry `palette` a theme author
writes, ~48 `roles` that each default to a palette entry (`sidebarBg` → `bg`)
and that components actually read, and ten `syntax` groups. The `extends` chain
is flattened in `theme.service.ts`, deliberately outside the config layer merge,
which is shallow and would clobber a partial theme.

## Reference

[Config](config.md) · [Actions](actions.md) · [Themes](themes.md) ·
[Keybindings](keybindings.md)
