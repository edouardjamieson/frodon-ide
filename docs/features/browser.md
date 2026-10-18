# Browser

Web pages in a tile, each tab able to be pinned to a device size so a layout
can be previewed at a width the pane is not, with the pages worth keeping
saved as [bookmarks](bookmarks.md).

## Goal

See the thing you are building beside the code that makes it, without alt-
tabbing to a browser — and preview it at a phone's width in a pane that is
nothing like a phone.

This is the one place remote content enters the app, so most of the design is
about what a guest page is *not* allowed to be.

## Where it lives

| Path | What it holds |
| --- | --- |
| `main/browser/browser.service.ts` | `hardenWebviews` — the entire main-process side, and it is all refusal |
| `shared/browser.def.ts` | the partition, the scheme list, `isAllowedBrowserUrl` |
| `renderer/src/lib/browser/browser.def.ts` | tabs, viewports, and the slice of the tag this module touches |
| `renderer/src/lib/browser/browser.store.ts` | tab state, and the seeds a restored layout left |
| `renderer/src/lib/browser/browser.service.ts` | `normalizeUrl`, `fitScale` |
| `components/modules/browser/` | the toolbar, the viewport, the element |
| `components/modules/bookmark/` | the star and the menu in that toolbar, and the page a blank tab shows — see [bookmarks.md](bookmarks.md) |

## How it works

### It adds almost no IPC channel

A `<webview>` is a DOM element, so the address bar, the history and the page
all live in the renderer. Nothing about a live tab crosses the boundary, and
the only main-process code in `main/browser/` is refusal.

The exception is bookmarks, which are the one part of this module that
outlives the window: a page saved last week comes back from a file, and the
renderer cannot read one. That is `bookmark:list` and `bookmark:save`, and
the rule is narrowed to those two rather than dropped — see
[bookmarks.md](bookmarks.md) and ADR-0028.

### The lockdown is main's, not the renderer's

`main/browser/` clamps every preference in `will-attach-webview`, before the
guest exists:

- `preload` **deleted** — the only preload in this app is the bridge to main,
  and handing that to a page from the internet would hand it the filesystem
- `nodeIntegration`, `nodeIntegrationInSubFrames` off; `contextIsolation`,
  `sandbox`, `webSecurity` on; `allowRunningInsecureContent` and
  `experimentalFeatures` off
- the partition pinned to `persist:frodon-browser` — a storage boundary is not
  the renderer's call, and pinning it also keeps a login alive across tabs
- `allowpopups` **removed, not set to `'false'`**: it is an HTML boolean
  attribute, read by presence, so writing `'false'` into it is how you grant
  popups while believing you refused them
- the `src` checked against the scheme list, and an attach with anything else
  on it cancelled outright

Overwritten, not defaulted, and not merged — a `<webview>` built with the wrong
attributes becomes a safe one rather than a rejected one.

The renderer writes the same settings onto the element itself, which is
**documentation rather than defence**: the element's attributes are written by
the side being defended against.

`webviewTag: true` on the host window lets the renderer *ask* for a guest. It
decides nothing about what the guest is allowed to be.

**The renderer's meta CSP does not reach a guest page.** That is by design on
Chromium's part — the guest is its own `WebContents`, not a frame of our
document — and it is what lets the IDE keep `default-src 'self'` while a tab
three pixels away is on the open web. It is also why the guest's isolation has
to be real: the CSP is doing nothing to help it.

`javascript:` is the scheme worth naming out loud. Typed into an address bar it
executes in whatever page is already loaded, which is how a pasted "fix" for a
broken site turns into a session hijack. It is not on the list, and anything
not on the list is treated as a search query rather than a URL.

### The element is created by hand

A `<webview>` reloads its page when it is moved in the DOM, so a re-render of
an unrelated prop could throw away a page and a half-filled form. It is created
once in a mount effect and mutated through refs — the same shape
`terminal.hook.ts` has, for a related reason.

### A pinned viewport is a layout size, not a zoom

Pinning a tab to 393 × 852 sizes the frame the guest fills to exactly that, so
the page's media queries answer for a phone. It is then CSS-transform-scaled
**down** to whatever room the tile has, never up. The page is laid out at the
device and drawn at the pane — `fitScale` is the one line that matters, and the
percentage in the toolbar is there so a small-looking page is never mistaken
for a design problem.

### Tab state is a store, not window state

A tab's title and loading flag are drawn in the window's header, and the page
in its body: two components with a window frame between them. Keeping them on
the window store was the other option and is the wrong one — a page load
rewrites the title, the url and three flags, which would hand a new `windows`
array to `useWindowRows` and re-render every pane in the workbench because one
page finished loading.

**The address bar shows where the guest *is*, not where you asked to go.** A
page can redirect, and an address bar that shows the request is how a phishing
page keeps a bank's URL on screen. `draft` is what is being typed; it is
cleared the moment a navigation commits.

### Restored tabs

A url is a string that still means something tomorrow, so browser tabs do come
back — unlike a shell. The url goes on the element's `src` *before* it
attaches, so a tab opens on the right page rather than flashing `about:blank`
on the way, and its back stack starts empty instead of one entry deep.

That needed a `restored` map separate from `tabs`, because `dropTab` would
otherwise take the seed straight back out when React mounts the view twice in
development. The pinned viewport rides along, because pinning is a decision the
person made and not a fact the page reported. History does not: the back stack
lives in the guest process and dies with it.

A url read off `~/.frodon/layouts.json` is **input** — the file can be
hand-edited — so it is checked in `main/layout/` on read and again at
`will-attach-webview`. A url dropped on read is a tab that never existed; one
dropped at attach is a tab whose guest failed to load.

## User flows

### Opening a page

1. `openBrowser` routes to a browser window and always adds a new tab.
2. A new tab shows the bookmarks as a grid — the new-tab page — with the
   cursor already in the address bar.
3. Typing in the address bar: anything that parses as an allowed URL is
   navigated to; anything else becomes a search.
4. Back, forward, reload, and the guest's own title in the tab.

### Previewing a layout

1. The size picker offers presets in CSS pixels.
2. The page is laid out at that size and scaled down to fit the tile.
3. The toolbar shows the scale, so 61% is visibly a fit and not a bug.

## Rules

- **Every capability a guest has is set by main.** If a security property is
  only written on the element, it is not set.
- **The only channels this module has are the two bookmark ones.** Anything
  else that seems to need one is probably asking the renderer to do main's
  vetting, or main to do the renderer's drawing. The test bookmarks passed:
  the thing being stored outlives the guest process.
- **Nothing navigates the window holding the preload bridge.**
  `setWindowOpenHandler` denies every new window and sends http(s) to the
  user's real browser.

## Not there yet

- Devtools for the guest.
- A way to see or clear the shared session's cookies.
- Per-tab partitions, which would trade the shared login for isolation.

## See also

[bookmarks.md](bookmarks.md) · [workbench.md](workbench.md) ·
[architecture.md](../architecture.md) · [decisions.md](../decisions.md)
