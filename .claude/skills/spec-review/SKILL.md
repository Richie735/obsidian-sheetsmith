---
name: spec-review
description: "Use when reviewing whether the work matches its feature spec: checks the diff against docs/features/<slug>.md, reports findings only. The spec axis, run beside patterns-review."
argument-hint: "[feature name, or path to its docs/features file]"
allowed-tools: Read, Glob, Grep, Bash
---

Review the work against the spec it was built from. **Feature:** $ARGUMENTS

Run this **beside `/patterns-review`**, after the feature first works and before
design polish. Both read the same diff, both are cheap, and building the wrong
thing costs more to discover after the polish is on top of it.

**Prefer a fresh session.** A session that wrote the code is anchored on the spec
it interpreted, so it checks conformance to its own reading rather than to what
the spec says. This is the same reason `/design-review` asks for one.

## What you may read

Two things: `docs/features/<slug>.md`, and the diff. Nothing else scopes this
review, and in particular:

- **Not planning or issue tracking.** Both live outside this repository and
  nothing here should learn where.
- **Not `docs/PATTERNS.md`.** Code quality is the other axis. A correct
  implementation written badly is a `/patterns-review` finding, not one of yours.

Default scope is the uncommitted diff plus any commits not on `main`, same as
`/patterns-review`. `git diff` it; review what changed.

If there is no spec for this work, say so and stop. Do not reconstruct one from
the diff: a spec inferred from the code can only ever agree with it.

## The acceptance criteria are the checklist

The spec's acceptance criteria are the primary object of this review, because
they are the only thing that ends the iteration loop. Take them in order and mark
each one:

- **Met.** Name the test or the observable behaviour that shows it.
- **Not met.** Say what is missing.
- **Not checkable.** The criterion cannot be settled by a test name or by looking
  at the harness. This is a finding **against the spec**, not against the code,
  and it is the one finding here that asks for a doc edit rather than a code
  change.

Never tick a box. Reporting the state is this skill's job and `/ship` is what
writes it down.

## Three classes of finding

Quote the spec line each one comes from:

- **Missing or partial.** The spec asked for it and the diff does not deliver it.
- **Unasked-for.** Behaviour in the diff the spec never called for. Scope creep
  is a finding even when the code is good, because it was not agreed and it has
  to be maintained.
- **Wrong.** Present, apparently implemented, but not what the spec describes.
  The most valuable class and the easiest to miss, because the code looks
  finished.

## What is not a finding

- **Anything in the spec's "Deliberately not doing" section.** That is a recorded
  scope cut. Reporting it wastes the review, exactly as reporting a `PATTERNS.md`
  §11 row does. Work that *extends* a recorded cut is a finding; say which line.
- **A §13 question the spec explicitly left open.** The spec settles a model
  question or scopes around it. Scoping around it was a decision.
- **Anything the other two axes own.** Structure and naming belong to
  `/patterns-review`, appearance and gesture to `/design-review`.

## Output

Findings only. Change nothing, tick nothing.

Lead with the criteria table: each criterion, its state, and one line of
evidence. Then the findings, ranked most severe first. For each:

- **What the spec asked**, quoted, with its section
- **What the diff does** instead
- **Which class** it falls in
- **The smallest fix**, or the spec edit if the spec is what is wrong

If everything is met and nothing is amiss, say so plainly and stop. Do not pad
the list.

**Do not reconcile with the other reviews.** Each axis reports on its own, and
nothing merges or reranks them. A change can follow every pattern and implement
the wrong feature, or implement the right feature in the wrong shape; reporting
the axes separately is what stops one from masking the other.
