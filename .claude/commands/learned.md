---
description: Record a hard-won discovery in docs/learned.md
argument-hint: [what was learned — or nothing, to use this session's work]
---

Record an entry in `docs/learned.md`.

The lesson: **$ARGUMENTS**

If nothing was given above, work out what was learned in this session. Favour
the thing that cost time — the behaviour that was not what anyone expected.

Do this:

1. Read the `frodon-docs` skill if it is not already loaded, and skim
   `docs/learned.md` so the new entry matches its neighbours and does not
   repeat one.
2. **Check it qualifies.** A learning is a *discovery*, not a choice: a
   platform behaviour, a library's small print, a measurement, or something
   about how the app is actually used. The test is whether someone could
   reasonably have done it the other way and only found out by trying. If it
   was a choice, it belongs in `docs/decisions.md` instead — say so and offer
   to write it there.
3. **Pick the group**: `## The platform`, `## The libraries`,
   `## Measurements and performance`, or `## Product`. Add a new group only if
   none of the four fits.
4. **Write it**, newest first within that group:
   - A title that states the conclusion and reads on its own in a list — `A
     sandboxed preload cannot be ESM`, not `Preload notes`.
   - The metadata line: `` `code` `` or `` `product` ``, today's date, and the
     path that bit us.
   - Two to six sentences: the fact, the symptom that gave it away, and what
     was done about it. End with the general form of the lesson when there is
     one.
5. **Follow through.** If this learning caused a decision, write that ADR too
   and link them. If it explains a rule in a feature file, add the link there.

Then show me the entry you wrote, and nothing else.
