# Updates

Packaging Frodon as a Mac app, publishing it from a tag, and a running copy
that finds the new version on its own and offers a restart into it.

## Goal

Using Frodon should not mean running a dev server. It should be an app in
/Applications — and since it is changed often, a change should reach every
installed copy without anyone downloading anything: push a release, and a
"Restart to update" button appears in the header within half an hour.

The build is unsigned. There is no Apple Developer account behind it, and the
updater is shaped around that rather than around a signature it will never
have — see
[ADR-0037](../decisions.md#adr-0037--frodon-updates-itself-by-swapping-its-own-bundle-not-through-squirrel).

## Where it lives

| Path | What it holds |
| --- | --- |
| `electron-builder.yml` | the packaging: targets, arches, ad-hoc signing, what gets unpacked from the asar |
| `scripts/release.mjs` | `pnpm release`: bump, commit, tag, push |
| `.github/workflows/release.yml` | builds on a `v*` tag and publishes the GitHub release |
| `scripts/write-manifest.mjs` | `dist/latest.json` — the version, and each zip's arch, size and SHA-512 |
| `src/main/update/update.constant.ts` | the repository, the manifest URL, the check interval, `~/.frodon/updates/` |
| `src/main/update/update.service.ts` | the check, the download, the swap script, `rootsToReopen` |
| `src/shared/update.def.ts` | `UpdateState`, the one fact that crosses |
| `src/renderer/src/lib/update/` | the replica store, `useUpdateSync`, `useReadyUpdate` |
| `src/renderer/src/components/modules/update/` | the restart button, in the header and on the launcher |

## How it works

### Packaging

`pnpm dist` runs the normal build, then electron-builder, into `dist/`: a dmg
and a zip per arch, arm64 and x64, all named `Frodon-<version>-<arch>`. The dmg
is for installing by hand; the zip is what the updater fetches.

The bundle is **ad-hoc signed** (`identity: '-'`). Apple Silicon will not run
code with no signature at all, and the signature Electron ships with stops
covering the bundle once electron-builder renames it. Ad-hoc is a valid
signature tied to no identity — enough to launch, not enough for Gatekeeper,
which is why the first install needs the quarantine flag removed by hand.

node-pty is unpacked from the asar (`asarUnpack`), because a `.node` file
cannot be loaded out of an archive and `spawn-helper` has to be a real
executable. Its N-API prebuilds already cover both arches, so `npmRebuild` is
off — see [learned.md](../learned.md#electron-builders-native-rebuild-leaves-a-build-that-shadows-node-ptys-prebuilds).

### Publishing

`pnpm release [patch|minor|major]` refuses a dirty tree or any branch but
`main`, bumps `package.json`, commits `Release x.y.z`, tags `vx.y.z` and pushes
both. It builds nothing.

The tag starts `release.yml` on a macOS runner: install, check the tag
matches `package.json`, `pnpm dist`, write `latest.json`, and
`gh release create` with the dmgs, the zips and the manifest. The release is
published, not drafted — a draft is invisible to `releases/latest`, and the
point is that pushing is the whole act.

### Checking

`startUpdateChecks` runs once the first window is up, and every
`CHECK_INTERVAL_MS` (thirty minutes) after. It does nothing in a dev build,
off macOS, or in a translocated bundle; those set `unsupported` with a reason
and stop.

A check reads `releases/latest/download/latest.json` — a redirect to the
asset, which costs nothing against the GitHub API's unauthenticated limit.
A 404 means no release yet and is not an error. If the manifest's version is
not newer than `app.getVersion()`, the check clears `~/.frodon/updates/` and
settles on `idle`.

### Downloading

A newer version finds its zip by `process.arch`, checks that the folder the
app sits in is writable — the swap needs to rename the bundle — and streams
the zip into `~/.frodon/updates/<version>/`, hashing as it writes. A hash
mismatch throws the directory away. `ditto` unpacks it, the zip is deleted,
and a `.complete` marker is written last.

A directory with the marker is reused by the next launch, so quitting without
restarting does not cost a second download. One without it is an interrupted
download and is deleted.

### Swapping

`installUpdate` writes a small shell script to `~/.frodon/updates/` and starts
it detached, passing this process's pid, the bundle path, the staged bundle,
and a `--frodon-reopen=<root>` per window with a project. Then it quits.

The script waits for the pid to exit, moves the old bundle aside, moves the
new one in — or the old one back if that fails — and `open`s the result with
the reopen arguments. On launch, `rootsToReopen` reads them out of argv and
`index.ts` opens a window on each instead of the launcher. Each window's own
layout then puts its tiles back, as it would on any open.

The new bundle is not quarantined, because nothing set the attribute: a file
downloaded by an app that has not opted into quarantine arrives without it.
So Gatekeeper does not look at the update, and the warning a person sees on
first install never comes back.

## User flows

### Installing for the first time

1. Download `Frodon-<version>-arm64.dmg` (or `-x64`) from the latest release.
2. Drag Frodon to Applications.
3. Clear the quarantine flag once — `xattr -dr com.apple.quarantine
   /Applications/Frodon.app` — because macOS calls an unsigned download
   "damaged" and offers only the Trash.
4. Open it. The launcher appears.

### Shipping a change

1. Commit and push to `main` as usual.
2. `pnpm release`. The version bumps, the tag is pushed.
3. A few minutes later the release is on GitHub with its manifest.

### Receiving it

1. Within half an hour of the release, every running copy downloads it in
   the background. Nothing is drawn while it does.
2. "Restart to update" appears in the header — or at the top right of the
   launcher. The tooltip names the version.
3. Click it. Frodon quits, the bundle is swapped, and Frodon opens again on
   the same projects, one window each.

Settings → Feedback shows the version and what the updater is doing, which is
where "why have I not got it yet" gets answered.

## Rules

- **Never adopt `electron-updater` or `autoUpdater` while the build is
  unsigned** — Squirrel.Mac rejects every update to an ad-hoc signed app, and
  the failure only shows up on the first real update.
- **The repository releases come from must be public**, because the app
  downloads without credentials and a private repo's assets answer 404.
- **The manifest names zips by arch, and `artifactName` must keep the arch in
  every file name** — electron-builder's default drops it for x64.
- **A tag must match `package.json`**, or the release's manifest describes a
  different version than its title; CI enforces it.
- **The swap script moves the old bundle aside before it deletes anything**,
  so the worst outcome of a failed update is the old version, not no Frodon.
- **No `checking` state crosses the boundary** — a check every half hour that
  almost always finds nothing should push nothing.

## Not there yet

- **Unsaved edits are lost** on the restart, as on any quit, until the
  unsaved-changes dialog exists.
- **No Windows or Linux build.** Each would need its own installer story;
  on Windows, `electron-updater` with NSIS works unsigned and would be the
  obvious choice.
- **Full downloads only**, around 130 MB each. electron-builder writes
  blockmaps for deltas, and nothing reads them.
- **A standard (non-admin) account** cannot write /Applications, and gets
  an error in Settings → Feedback rather than an update.
- **No "check now".** A release is noticed on launch or within thirty
  minutes.
- **Signing and notarization**, which would make the first-install step go
  away and would make Squirrel usable again.

## See also

- [decisions.md](../decisions.md) — ADR-0037
- [learned.md](../learned.md) — Squirrel and signatures, the native rebuild trap
- [project.md](project.md) — the launcher and window reopening
