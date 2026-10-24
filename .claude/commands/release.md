---
description: Cut a new release — check, bump, tag, push, watch CI, verify and write the notes
argument-hint: [optional: patch | minor | major]
---

Cut a new Frodon release.

Version part, if given: **$ARGUMENTS**

Follow the `release` skill. In short:

1. Check the tree: clean `main`, not behind `origin`, typecheck and lint
   passing, and a public repository — a private one publishes a release no
   installed copy can download.
2. List the user-facing commit subjects since the last tag; they are the
   release notes.
3. Pick the bump — `patch` for fixes, `minor` for something new, `major` only
   when asked — unless one was given above.
4. Show the version change, the notes and any warning, and **wait for a yes**.
   Then run `pnpm release <part>`.
5. Watch the `release.yml` run. On failure, report the step and the error and
   offer the ways out; do not retry on your own.
6. Verify the five assets and that `releases/latest/download/latest.json`
   names the new version.
7. Replace the generated notes with the commit subjects and install
   instructions.

No attribution anywhere — not in the commit, the tag or the notes.
