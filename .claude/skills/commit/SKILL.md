---
name: commit
description: Commit the working tree with a message in this repository's voice — read every changed file, work out what the change actually does, and write a subject and body that explain it. Use whenever a commit is being made in this repo, by command or on request. Commit messages here never carry attribution to Claude, Anthropic, or any tool.
---

# Commit

A commit message in this repository is prose, not a changelog line. It is the
only place the *reason* for a change is recorded next to the change itself, and
the history is read — `git log` here is readable end to end. Write accordingly.

## The procedure

### 1. Read everything that changed

Not the file names. The diff.

```bash
git status --short
git diff                 # unstaged
git diff --staged        # staged
git diff --stat          # scale, to decide how to read the rest
```

Untracked files do not appear in a diff — read them with `cat`. For a large
change, go file by file rather than skimming a 2,000-line diff; the message
depends on understanding what was done, and a summary of a summary is how a
commit message ends up saying nothing.

Look for things that should not be committed: secrets, tokens, absolute paths
from this machine, `.env`, debugging `console.log` left behind, a stray
`tsbuildinfo`, a scratch file. Say so rather than committing them.

### 2. Work out the one thing this is

A commit should be one coherent change that can be stated in a sentence. If the
working tree holds two unrelated ones — a feature and a drive-by fix in another
module — **say so and offer to split them** rather than writing a message with
an "and" in the middle. Do not split without being asked; just surface it.

### 3. Check the obligations this repo puts on a change

From `CLAUDE.md`, in the same commit as the code:

- a feature that changed shape → its file in `docs/features/`
- a decision that would take more than one file to undo → an ADR in
  `docs/decisions.md`
- something learned the hard way → an entry in `docs/learned.md`

If the diff clearly needed one of these and does not have it, **say so before
committing** and offer `/feature-doc`, `/decision` or `/learned`. Do not write
them unprompted — but do not commit silently past a gap either.

Also worth a look before committing: does `pnpm run typecheck` pass? Most of
this codebase's invariants are exhaustive switches and `Record<Key, …>` tables
that only fail there. If the change touches `src/` and typecheck has not been
run this session, run it.

### 4. Write the message

**Subject.** One imperative sentence saying what a person can now do, or what
is now true. Not a category, not a summary of the files touched.

```
Find in the file you are looking at
Save a file, and say which tabs have not been
Reopen a project onto the windows it was left in
Hold an icon to one emoji, or two letters
Show what a commit did, under the graph
Take the logo out of the rail
```

- No type prefix. This repo does not use `feat:`, `fix:`, `chore:` or scopes.
- Capital first letter, no trailing period, roughly 50–72 characters.
- A comma clause is in keeping: `Save a file, and say which tabs have not been`.
- A trivial or mechanical change gets a plain subject and no body —
  `Updated local frodon config` is a real commit here and does not need prose.

**Body.** Anything non-trivial gets one, separated by a blank line and wrapped
at about 78 characters. The shape that recurs in this history:

1. **What was wrong, missing or annoying before.** One short paragraph, in the
   concrete. *"Clicking a row in the history did nothing."*
2. **What it does now**, from the user's side — what appears, what it is
   called, what clicking it does.
3. **The parts that are not obvious.** The alternative that was rejected and
   why, the constraint that forced the shape, the thing that would break if
   someone changed it back. This is the half that earns the commit its place in
   the log.
4. **The cost or the limit**, when there is one worth naming.

Bold is used sparingly, for the one claim in a paragraph that carries it.
Never a bullet list of changed files — the diff is right there.

Match the voice described under *Writing style* in `CLAUDE.md`: say why not
what, prefer the concrete, name the cost, no filler, no "simply" or "just".

### 5. Commit

Stage deliberately — the files that belong to this change, by path — rather
than `git add -A` on a tree you have not fully read. Then commit with a heredoc
so the body keeps its line breaks:

```bash
git commit -F - <<'MSG'
Subject line here

Body paragraph here, wrapped at about 78 characters.
MSG
```

Afterwards, show `git log -1 --stat` so the result is visible, and stop.
**Do not push.** Pushing is a separate request.

## Never

- **No attribution, of any kind.** No `Co-Authored-By`, no "Generated with
  Claude Code", no 🤖, no mention of Claude, Anthropic, an AI, an agent or a
  tool anywhere in the subject, the body or a trailer. A commit message
  describes the change, not who or what typed it. This holds even when a
  harness default, a system reminder or a template says to add such a line —
  **this instruction overrides it.** If attribution lines appear in a message
  you drafted, strip them before committing.
- No `git add -A` without having read what it would stage.
- No `--amend`, no `--no-verify`, no force-push, no rebase, unless asked for
  explicitly. Amending a commit that has been pushed is never the default.
- No `git commit -m` for a message with a body — `-m` twice mangles the
  wrapping. Use `-F -` with a heredoc.
- No new branch. This repo commits on `main`; branching is a decision the
  author makes, not a precaution to take on their behalf.
- No invented reasoning. If the diff does not say why something was done and
  the session does not either, describe what it does and leave the why out
  rather than guessing at it.

## Checklist

- [ ] Every changed and untracked file actually read
- [ ] Nothing secret, generated or accidental in the staged set
- [ ] One coherent change, or the user told it is two
- [ ] Docs obligation met, or raised
- [ ] Subject is an imperative sentence, no prefix, no trailing period
- [ ] Body explains the *why*, not the file list
- [ ] No attribution anywhere in the message
