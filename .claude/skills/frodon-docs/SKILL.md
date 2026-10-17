---
name: frodon-docs
description: Frodon's documentation conventions — the structure of docs/, the voice, and the rules for the feature files, the decision log (ADRs) and the learned log. Use when writing or editing anything under docs/, when writing CLAUDE.md, when a change to the app needs its documentation updated, and whenever a decision with an architectural consequence or a hard-won discovery should be recorded.
---

# Frodon documentation conventions

Documentation in this repository is a deliverable, not a follow-up. The repo is
heading for open source and for people forking it, and the docs are what makes
that possible for an agent as much as for a person.

## The structure

```
CLAUDE.md                 the contract: rules, recipes, what not to do
docs/README.md            the index — entry point for any new reader
docs/architecture.md      cross-cutting law only: the split, module convention,
                          state ownership, security
docs/ipc.md               the channel contract and the four-step recipe
docs/theme.md             palette → roles → CSS custom properties
docs/migration.md         the TUI ledger, the roadmap, the parked designs
docs/decisions.md         ADRs, newest first
docs/learned.md           discoveries, grouped by kind
docs/features/*.md        one per feature
```

**One topic, one home.** If something is specific to a feature it lives in that
feature's file, and `architecture.md` gets at most a paragraph and a link.
Duplicating prose between the two is the failure mode this structure exists to
prevent — two copies is one chance for them to disagree.

## When to write what

| The change | Write |
| --- | --- |
| a feature gains or loses a flow, a rule, or a gap | its file in `docs/features/` |
| a boundary, ownership rule, file format, dependency or refusal is decided | an ADR in `docs/decisions.md` |
| a platform behaviour, library trap, measurement or usage insight is found | an entry in `docs/learned.md` |
| a new feature is built | a new `docs/features/<name>.md`, plus a row in the index table in `docs/README.md` |

All of it in the same commit as the code.

**Decision or learning?** A decision is a choice that could have gone the other
way and you picked one. A learning is a fact you did not know. If you chose
something *because* of a discovery, write both and link them.

## The feature-file shape

Every file in `docs/features/` uses these headings, in this order. Omit a
section only when it would be empty.

```markdown
# <Feature>

One or two sentences stating what it is.

## Goal
What problem this solves and for whom. The product argument, not the
implementation.

## Where it lives
A table: path → what it holds. Main, renderer and shared together, so a reader
sees both halves of the boundary at once.

## How it works
The mechanism, in prose, with `###` subsections for the parts that carry
weight. Name the functions. State invariants as rules.

## User flows
Numbered, from the user's first act to the last thing on screen. One `###` per
flow. This is the section most likely to be missing and most likely to be
wanted.

## Rules
The things that must not be changed casually, as a bullet list, each with its
reason in the same sentence.

## Not there yet
Known gaps, honestly. A reader needs to tell "not built" from "built badly".

## See also
Links to the two or three most related docs.
```

## The ADR shape

Newest first, directly under the intro in `docs/decisions.md`, with the next
number. Four fields, all of them:

```markdown
### ADR-00NN — <the decision, as a statement>

**When** YYYY-MM-DD · **Status** active · **Touches** <features>

**What.** What was decided, as a rule rather than a story.

**Why.** The reason, including what was rejected and what it would have cost.
This is the field a future reader actually needs.

**How.** How it is implemented, and where. Name the files and functions.

**Cost.** What this makes harder, slower or impossible.
```

- `Status` is `active`, `parked`, or `superseded by ADR-NNNN`.
- A reversed decision is never deleted. Its status changes and the new entry
  says what changed.
- An entry with no `Cost` is usually one that has not been thought through.
  Find the cost.
- Cross-link related ADRs by their anchor.

## The learned-log shape

Grouped under `## The platform`, `## The libraries`,
`## Measurements and performance` and `## Product`. Newest first within a
group.

```markdown
### <the lesson, as a statement>
`code` or `product` · YYYY-MM-DD · `path/that/bit/us.ts`

The fact, the symptom that gave it away, and what was done about it. Two to
six sentences. End with the general form of the lesson when there is one.
```

One fact per entry. The title should be readable on its own in a list — state
the conclusion, not the topic. `A sandboxed preload cannot be ESM`, not
`Preload notes`.

## The voice

The prose here is dense, declarative and specific. It is the reason the repo is
navigable, and it is worth the effort to match.

- **Say why, not what.** Record the alternative you rejected.
- **Prefer the concrete.** "A build log is thousands of writes a second" beats
  "for performance reasons".
- **Name the cost.** Nearly every design note ends by saying what the choice
  makes harder.
- **State rules as rules.** "Never read a color in JS", not "it is generally
  preferable to avoid".
- **No filler.** No "simply", "just", "note that", "it's important to".
- **Em dashes and short paragraphs.** Wrap prose at roughly 78 characters to
  match the existing files.
- **Tables for anything with more than three parallel items**, prose for
  reasoning.

## Checks before finishing

- Does `docs/README.md` link every file that exists? A new feature file needs a
  row in its table.
- Does the feature file name real files and functions, and do they still exist?
- Did the change deserve an ADR or a learned entry that was not written?
- Is anything now stated in two places? Delete one and link to the other.
