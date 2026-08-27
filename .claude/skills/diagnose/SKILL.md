---
name: diagnose
description: "Use when something is broken, throwing, failing, flaky, or slower than it was, or when the user says debug or diagnose. Builds a loop that goes red on the bug before theorising about it."
argument-hint: "[what is broken, with how to see it]"
allowed-tools: Read, Glob, Grep, Bash, Edit
---

Find the cause of a bug and lock it down. **Bug:** $ARGUMENTS

The rule the whole skill exists to enforce: **no theorising until something goes
red on this bug.** A hypothesis formed while the bug is still invisible gets
tested by reading code, which is how a plausible wrong answer survives to become
a wrong fix.

## 1. Go red

Get one command that fails on this bug and passes without it. Route by where the
bug lives:

- **Parsing, serialising, formulas.** A vitest case, and the cheapest loop in the
  repository: `src/parse/` and `src/formula/` import nothing from `obsidian`
  (Constraint 5), so they run with no app and no stub.
- **A component's data or render behaviour.** A vitest case against the component,
  on `src/test/obsidian-stub.ts`.
- **Appearance, layout, or a gesture.** `npm run harness:shot`, then look at the
  PNG. The red state is a picture here, and the bug is what you can see in it.
- **Only reproducible in the app.** `harness/inspect.mjs` drives the running
  Obsidian. Say in your report that this is where the repro lives, because it is
  the one loop nobody else can re-run cheaply.

**If you cannot get it red, stop and say so.** Report what you tried and what the
bug would need in order to be observable. A fix aimed at a bug nobody can see is
a guess, and it will be reviewed as if it were a fix.

Two smells worth naming here. A bug that only reproduces through the app usually
means the logic is not where Constraint 5 wants it. A bug nothing can assert on
usually means there is no seam to assert at, which is a `PATTERNS.md` §11 finding
rather than a dead end.

## 2. Minimise

Cut the repro until every remaining line is load-bearing. Fewer moving parts is
the point, but the useful side effect is that a minimal repro is usually the
regression test already written.

## 3. Hypothesise, then observe

Name the mechanism in one sentence, and say what observation would prove it
wrong. Then go make that observation: log, assert, print the parsed structure,
render the intermediate state. Read the value, do not assume it.

For anything touching the file model, check the two hard constraints first, since
they are the ones a plausible-looking change breaks quietly: does parse then
serialise still come back byte-identical (Constraint 3), and does the path
preserve sections whose component is gone (Constraint 4)?

## 4. Fix at the right layer

Smallest change that addresses the mechanism. If the bug is one component's, fix
it there. If the same mistake is available to every component, the fix belongs in
the shared layer or in the contract, and fixing only the caller leaves the bug
loaded for the next component.

Do not "fix" a failing test by changing what it asserts.

## 5. Lock it

The regression test is not optional, and where it goes matters. A bug that any
component could have had goes in `src/components/contract.test.ts`, which runs
against every registered component, rather than in the one component that
happened to show it (`PATTERNS.md` §10). A bug specific to one component goes in
its own test file.

Then verify: `npm test`, `npm run lint`, `npm run build`.

## 6. Report and hand off

Say, briefly: what the red loop was, what the mechanism turned out to be, what
changed, and where the regression test lives. If the bug was reachable because a
`[judgement]` rule was carrying weight a check should carry, say which rule. That
is the signal `PATTERNS.md` §11 wants, and it is worth more than the fix.

**Leave the work uncommitted.** The tree stays open through the reviews, and
`/land-it` is the only thing that commits. Never commit here, and never push.
