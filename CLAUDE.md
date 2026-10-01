# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A terminal-based IDE ("Frodon") built with [OpenTUI](https://github.com/msmps/create-tui) and React, running on Bun. The UI is rendered to the terminal — JSX intrinsics like `<box>`, `<text>`, `<scrollbox>`, and `<ascii-font>` come from `@opentui/react` (configured via `jsxImportSource` in `tsconfig.json`), not the DOM. There is no browser.

## Commands

```bash
bun install          # install dependencies (requires Bun >= 1.3.0)
bun dev              # run the app with hot reload (bun run --watch src/index.tsx)
bun run typecheck    # tsc --noEmit
```

There is no test runner and no `lint` script, though an `eslint.config.ts` and `.prettierrc` exist (2-space, single-quote, semicolons, `es5` trailing commas). Run `bunx eslint .` manually if needed.

## Debugging: no console

Because the app owns the terminal, **`console.log` will corrupt the render**. Use the file logger instead:

```ts
import Logger from '~/lib/logger/logger.service';
Logger.log(anything);   // appends to ./test.log
```

Tail `./test.log` to observe runtime behavior.

## Module convention

Every feature — whether a visual module under `src/components/` or a service under `src/lib/` — is a folder of single-responsibility files sharing a name prefix, re-exported through a barrel `index.ts`:

- `*.component.tsx` — the React/OpenTUI view
- `*.hook.ts` — `use*` hooks wrapping the store and holding logic (components stay thin)
- `*.store.ts` — a zustand `create<...>()` store (all app state lives in zustand, not React state)
- `*.def.ts` — types, interfaces, and enums for the feature
- `*.constant.ts(x)` — constants (`.tsx` when they hold JSX, e.g. the route table)

Import across features via the barrel and the `~/*` path alias (`~/*` → `./src/*`), e.g. `import { useProject } from '~/lib/project'`.

Layout:
- `src/lib/` — non-visual services and stores: `router`, `project`, `window` (layout/state), `fs`, `logger`, plus `theme` (colors + icons).
- `src/components/modules/` — feature UI (editor, explorer, sidebar, window).
- `src/components/ui/` — reusable primitives (button, loader).
- `src/pages/` — top-level route screens.

## Architecture

**Entry** (`src/index.tsx`): creates the OpenTUI renderer and renders `<App>`, which renders whatever component the router currently points at.

**Routing** (`src/lib/router/`): a hand-rolled router, not a URL router. `ROUTE` is an enum; `ROUTES` (in `router.constant.tsx`) maps each route to a JSX element; the zustand store holds the active route + params. Navigate with `const { navigate } = useRouter(); navigate(ROUTE.HOME)`. `RootPage` loads the project then navigates to `HOME`.

**Project loading** (`src/lib/project/` + `src/lib/fs/`): `useProject().load()` reads `process.cwd()` recursively via `readFilesFromDir` into a nested `File` tree (dirs sorted first, then alphabetical) and stores it. `useProjectSync()` (mounted once in `main.tsx`) then watches the root recursively via `watchDirectory` and rescans on a debounce, so changes made outside Frodon — another terminal, an AI agent — reach the explorer; a rescan that finds the same tree (`sameTree`) stores nothing, so content-only writes don't re-render it. `HomePage` = `Sidebar` + `WindowsManager`.

**Window manager** (`src/lib/window/` + `src/components/modules/window/`): a tiling grid. Each `Window` has a `rowIndex`/`colIndex` and a `type` (`CODE_EDITOR` | `TERMINAL`); `useCalculateLayout` derives percentage-based `left/top/width/height` from how many windows share each row. Windows with no `type` render a welcome screen. Editor files and terminal sessions are tracked in the window store keyed by `windowId`.

**Editor** (`src/components/modules/editor/`): syntax highlighting is built on `refractor` — `useEditor` reads the file, flattens the refractor AST into positioned `Token`s, and groups them into `Line`s (`buildLines`) for rendering, mapping refractor token types onto the theme's ten syntax groups via `SYNTAX_GROUP_BY_TOKEN` (`editor.constant.ts`). The render output is currently a stub.

**Theming** (`src/lib/theme/`): colors and glyphs both come from the active theme, held in a zustand store and read with `useTheme()` (`const { colors, icons, syntax } = useTheme()`). **Never hardcode a color or a glyph in a component** — add a role to `ThemeRoles`/`ROLE_DEFAULTS` or an icon to `ThemeIcons`/`DEFAULT_ICONS` instead. Colors resolve in three layers: a ~17-entry `palette` a theme author writes, ~48 `roles` that each default to a palette entry (`sidebarBg` → `bg`) and that components actually read, and ten `syntax` groups. Themes are selected by name from `preferences.theme` and may be defined in config; resolution flattens the `extends` chain in `theme.service.ts`, deliberately outside the config layer merge (which is shallow and would clobber a partial theme). Icons must measure one or two terminal cells (emoji are two, and are the default for pictograms); the loader rejects anything else, and `Icon` reserves the width it measures. Structural marks — tree arrows, bullets, the inline dismiss — stay single-cell Geometric Shapes because they have to dim with their row and emoji ignore `fg`. `docs/themes.md` is the reference.

**Explorer** (`src/components/modules/explorer/`): recursive `ExplorerNode` tree over the project `File` tree; expanded-directory state lives in `explorer.store.ts` keyed by path.

Note several handlers/components are stubbed or commented (window spawning from the welcome screen, editor rendering) — this is an early-stage WIP.
