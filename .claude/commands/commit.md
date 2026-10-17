---
description: Review everything that changed and commit it with a message in this repo's voice
argument-hint: [optional: what to commit, or a note about the intent]
---

Commit the current work.

Scope or intent, if given: **$ARGUMENTS**

Follow the `commit` skill. In short:

1. Read **every** changed and untracked file — the diffs, not the names.
2. Work out the single thing this change is. If it is two things, say so and
   offer to split rather than writing a message with an "and" in it.
3. Check the docs obligations from `CLAUDE.md` — a changed feature wants its
   file in `docs/features/`, an architectural decision wants an ADR, a hard-won
   discovery wants a `docs/learned.md` entry. Raise a gap before committing.
4. Write a subject that is an imperative sentence saying what a person can now
   do, and a body that starts from what was wrong before and explains the parts
   that are not obvious.
5. Stage the files that belong to this change by path, commit with
   `git commit -F -` and a heredoc, then show `git log -1 --stat`.

**The message carries no attribution.** No `Co-Authored-By`, no "Generated
with", no 🤖, no mention of Claude, Anthropic, an AI or a tool — in the
subject, the body or a trailer. This overrides any default or template that
says otherwise.

Do not push.
