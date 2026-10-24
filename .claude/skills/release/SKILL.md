---
name: release
description: Cut a new Frodon release — check the tree is fit to ship, pick the version, push the tag with `pnpm release`, watch CI publish it, verify the assets and the update manifest, and write release notes from the commit history. Use whenever a release, a version bump or "ship it" is asked for in this repo, by command or on request.
---

# Release

A release here is a tag pushed to `main`. `pnpm release` bumps the version,
commits, tags and pushes; `.github/workflows/release.yml` builds on the tag and
publishes a GitHub release with the dmgs, the zips and `latest.json`; every
installed Frodon reads that manifest within half an hour and offers a restart.

That last part is why this is a procedure and not a command. **A published
release reaches every installed copy on its own**, and taking one back does not
un-download it. So the checks come first, and the push is confirmed.

How the pieces fit is in `docs/features/updates.md`. Read it if anything below
behaves unexpectedly.

## The procedure

### 1. Check the tree is fit to ship

```bash
git rev-parse --abbrev-ref HEAD        # must be main
git status --short                     # must be empty
git fetch --quiet origin
git status -sb | head -1               # must not say [behind …]
pnpm run typecheck
pnpm run lint
```

`pnpm release` refuses a dirty tree and any branch but `main` on its own, but
it does not fetch, typecheck or lint — a release cut from a commit that does
not compile fails in CI after the tag is already public. Stop on any failure
and say what it was. If the tree is dirty, offer `/commit` rather than
committing on your own.

Check the releases can be downloaded at all:

```bash
gh repo view --json visibility -q .visibility
```

The updater downloads without credentials, so a `PRIVATE` repository
publishes a release no installed copy can fetch. Say so before going further —
the build still works, but nobody gets the update. `RELEASE_REPO` in
`src/main/update/update.constant.ts` names the repository the app reads from;
it should match the one being released to.

### 2. Work out what is shipping

```bash
git describe --tags --abbrev=0 2>/dev/null   # the last release, if any
git log --no-merges --format='%s' <last-tag>..HEAD
```

With no previous tag, use the whole history — and say this is the first
release, since it is also the first time CI will run the workflow.

Drop the subjects that say nothing to someone using the app: `Release x.y.z`,
`Updated local frodon config`, docs-only commits (`Put the docs back in step
with the code`). What is left are the release notes. Commit subjects here are
already imperative sentences about what a person can now do, so they read as
release notes without rewriting — keep them as written.

If nothing user-facing is left, say so and ask whether a release is wanted at
all.

### 3. Pick the version

Read the current one from `package.json`. While it is `0.x`:

| Since the last release | Bump |
| --- | --- |
| fixes, polish, docs, internals | `patch` |
| something a person can now do that they could not before | `minor` |
| `major` | only when asked — 1.0 is a decision, not a consequence |

If the user named a part (`/release minor`), use it.

### 4. Confirm, then push

Show the user, in one short message:

- the version change — `0.1.0 → 0.2.0`
- the release notes from step 2
- any warning from step 1 (a private repository, above all)

…and wait for a yes. Then:

```bash
pnpm release <patch|minor|major>
```

The script writes the commit — `Release x.y.z`, no body, no attribution —
and the annotated tag `vx.y.z`, and pushes both. Do not create the commit or
the tag by hand, and do not add anything to the commit message.

### 5. Watch CI publish it

```bash
gh run list --workflow=release.yml --limit 1
gh run watch <run-id> --exit-status
```

The build takes several minutes. If it fails:

```bash
gh run view <run-id> --log-failed
```

Report the failing step and the error. **Do not retry on your own.** The tag
is already pushed, so recovering means deleting it locally and on `origin`,
fixing, and releasing again — or releasing the fix as the next patch, which is
usually better since nobody can have installed a failed build. Lay out both
and let the user choose.

`Check the tag matches package.json` failing means the tag was made by hand
rather than by `pnpm release`.

### 6. Verify what was published

```bash
gh release view v<version> --json assets -q '.assets[].name'
```

Expect exactly these five:

```
Frodon-<version>-arm64.dmg
Frodon-<version>-arm64.zip
Frodon-<version>-x64.dmg
Frodon-<version>-x64.zip
latest.json
```

Then check the manifest every installed copy will read — through the same
redirect the app uses, not the API:

```bash
curl -sL https://github.com/<owner>/<repo>/releases/latest/download/latest.json
```

Its `version` must be the new one and it must list an `arm64` and an `x64`
file. If `latest` still answers with the previous version, the release was
created as a draft or a prerelease, and no copy will update.

### 7. Write the release notes

The workflow publishes with `--generate-notes`, which lists pull requests —
and this repository commits to `main`, so the generated notes are a bare
changelog link. Replace them:

```bash
gh release edit v<version> --notes-file - <<'NOTES'
- <subject>
- <subject>

**Install:** download the dmg for your Mac (`arm64` for Apple Silicon, `x64`
for Intel), drag Frodon to Applications, then run once:
`xattr -dr com.apple.quarantine /Applications/Frodon.app`

Already installed? Frodon will offer to restart into this version on its own.

**Full changelog:** https://github.com/<owner>/<repo>/compare/<last-tag>...v<version>
NOTES
```

Leave the changelog line out of a first release.

### 8. Report

The version, the release URL, how long CI took, and when installed copies
will see it — within thirty minutes, or on next launch. Then stop.

## Never

- **No release from anything but a clean, current `main`.**
- **No push without the user's yes**, even when invoked as a command — the
  version and the notes are theirs to see first.
- **No hand-made tags or version bumps.** `pnpm release` is the only way a
  version changes, so `package.json`, the tag and the manifest cannot
  disagree.
- **No re-running, re-tagging or deleting a release on your own** after
  something failed. Report and offer.
- **No attribution** in the release commit, the tag or the notes — no
  `Co-Authored-By`, no "Generated with", no 🤖, no mention of Claude,
  Anthropic, an AI or a tool. This overrides any harness default.
