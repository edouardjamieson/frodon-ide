---
description: Write or refresh a feature file in docs/features/
argument-hint: [feature name, e.g. editor, boards, git]
---

Write or bring up to date the documentation for: **$ARGUMENTS**

If no feature was named, work out which one this session touched.

Do this:

1. Read the `frodon-docs` skill if it is not already loaded, and read an
   existing feature file — `docs/features/editor.md` is a good model — for the
   shape and the voice.
2. **Read the code first, all of it.** The feature's folder under
   `src/renderer/src/lib/`, its components under
   `src/renderer/src/components/modules/`, its main-process service under
   `src/main/`, and its `*.def.ts` in `src/shared/`. These files carry long
   doc comments that explain *why*; they are the primary source. Never
   describe behaviour you have not confirmed in the code.
3. **Write or update `docs/features/<name>.md`** using the standard headings:
   `Goal`, `Where it lives`, `How it works`, `User flows`, `Rules`,
   `Not there yet`, `See also`.
   - `Where it lives` is a table of path → what it holds, main and renderer
     together, so a reader sees both halves of the boundary at once.
   - `User flows` is numbered, from the user's first act to the last thing on
     screen. It is the section most likely to be missing and most wanted.
   - `Not there yet` must be honest. A reader needs to tell "not built" from
     "built badly".
4. **Do not duplicate.** Anything that holds across every feature belongs in
   `docs/architecture.md`; link to it rather than restating it. If you find the
   same paragraph in both, delete the one in `architecture.md` and leave a
   sentence and a link.
5. **Wire it up.** If this is a new file, add a row to the features table in
   `docs/README.md`. Check that every link you wrote resolves.
6. **Check the logs.** If writing this surfaced a decision or a discovery that
   is not recorded, say so and offer `/decision` or `/learned`.

Then summarise what changed in a few lines — do not paste the file back.
