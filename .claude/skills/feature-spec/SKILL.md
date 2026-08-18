---
name: feature-spec
description: "Use when planning a feature before building it: write the spec the dev session implements against. Resolves the model question first, then the design. Writes docs/features/<slug>.md."
argument-hint: "[feature name or board card]"
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

Write the spec a build session implements against, and a review session checks
against. **Feature:** $ARGUMENTS

Read `docs/SPEC.md` (especially §13), `docs/PATTERNS.md` and `docs/UI.md` before
writing anything.

## The order matters

Most of what is left in this plugin is gated on a **model** decision, not a UI
one. §13's live questions are about scope resolution, catalog shape and nesting.
Designing a surface before those are settled produces a design that assumes the
problem away.

So work in this order, and do not skip step 1 because the feature "looks like UI".

### 1. Resolve the model question

Ask, in order:

- Does this feature depend on an open question in `SPEC` §13? Name it.
- Can a component express this through the existing contract (`SPEC` §4.1),
  or does the contract have to grow? Growing it is a real answer, but it must be
  a decision, not a side effect.
- What does it publish to other components' formulas, if anything?
- What does it store, and can that round-trip byte-identically (Constraint 3)?
- What happens to existing character notes (Constraint 4)?

If a §13 question blocks the feature, **settle it here or stop**. Settling it
means writing the argument, not asserting the answer. If it cannot be settled
without building the thing that makes the answer obvious, say so explicitly and
scope the feature to what does not depend on it.

For a feature that genuinely touches no model question, say so in one line and
move on. The step is cheap when it is cheap.

### 2. Design the surface

Only now. Cover:

- What the component looks like and what a reader takes from it at a glance.
- Every interaction, against `docs/UI.md` §6 and §7. Reuse the shared gestures;
  a new gesture needs an argument.
- What it reuses from the shared vocabulary (`UI.md` §8) rather than redrawing.
- Its empty state and its error state, not only the populated one.
- Its `configFields`: each field's label, kind, and a description stating a
  consequence.

### 3. Name the acceptance criteria

The spec's most important section, because it is the only thing that ends the
iteration loop. Write criteria a reviewer can check by looking at the harness or
by reading a test name. "Feels right" is not one.

### 4. Name the commit boundaries

A list of commits in order, each a coherent step that builds and passes tests.
This is what stops the work being retro-sliced at the end.

## Output

Write to `docs/features/<kebab-slug>.md`, committed with the feature. Use exactly
this shape:

```markdown
# <Feature>

Status: draft | agreed | built | shipped
Board card: <text of the card this implements>

## Model question

<Which §13 question this touches, and the answer, with the argument. Or: "None —
<one line why>.">

## What it does

<Two or three sentences. What a user gets.>

## Design

<The surface. Interactions. What it reuses. Empty and error states.>

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

<What it stores, how it round-trips, what happens to existing notes.>

## Acceptance criteria

- [ ] <checkable statement>

## Commit boundaries

1. <commit message> — <what it contains>

## Deliberately not doing

<Scope cuts, so a reviewer does not report them as gaps.>
```

## Rules

- Propose the design, then **stop and wait** for approval before the spec is
  taken as agreed. Flip `Status` to `agreed` only when the user says so.
- Do not write implementation code. This skill produces a spec, nothing else.
- Where the spec settles a §13 question, the `Resolved:` entry in `docs/SPEC.md` is
  written by `/ship`, not here — it is not resolved until it is built.
- If the feature contradicts a hard constraint in `CLAUDE.md`, say so and stop.
