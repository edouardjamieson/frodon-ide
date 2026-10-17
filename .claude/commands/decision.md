---
description: Record an architectural decision in docs/decisions.md
argument-hint: [the decision, in a few words — or nothing, to use this session's work]
---

Record an ADR in `docs/decisions.md`.

The decision: **$ARGUMENTS**

If nothing was given above, work out what the decision was from this session —
the choice that was made, not the code that was written.

Do this:

1. Read the `frodon-docs` skill if it is not already loaded, and the intro plus
   the two most recent entries of `docs/decisions.md` for the house shape.
2. **Check it qualifies.** A decision belongs in that file when undoing it
   would mean changing more than one file: a boundary, an ownership rule, a
   file format, a dependency, a refusal. An ordinary implementation choice does
   not. If it does not qualify but was a *discovery*, write it to
   `docs/learned.md` instead and say so. If it qualifies as neither, say that
   rather than padding the log.
3. **Find the facts before writing.** Read the code that carries the decision,
   so `How` names real files and functions. Use today's date, and check the
   highest existing ADR number.
4. **Write the entry** directly under the intro paragraph in
   `docs/decisions.md` — newest first — with the next number and all four
   fields: `What`, `Why`, `How`, `Cost`.
   - `Why` must say what was rejected and what it would have cost. That is the
     field a future reader actually needs.
   - `Cost` must not be empty. If nothing is harder as a result, look again —
     an entry with no cost is usually one that has not been thought through.
   - If it supersedes an existing ADR, change that one's status to
     `superseded by ADR-NNNN` and say what changed.
5. **Follow through.** If the decision changes how a feature works, update that
   feature's file in `docs/features/` too. If it rests on something discovered
   the hard way, write the `docs/learned.md` entry as well and link the two.

Then show me the entry you wrote, and nothing else.
