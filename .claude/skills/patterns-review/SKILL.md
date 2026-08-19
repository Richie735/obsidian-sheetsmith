---
name: patterns-review
description: "Use when reviewing code against this project's documented patterns: after a feature first works, before design polish. Checks the diff against docs/PATTERNS.md and reports findings only."
argument-hint: "[optional: path, or a git ref to diff against]"
allowed-tools: Read, Glob, Grep, Bash
---

Review the current work against `docs/PATTERNS.md`. **Scope:** $ARGUMENTS
(defaults to the uncommitted diff plus any commits not on `main`).

Run this **after the feature first works and before design polish**, not at the
end. Structural drift is expensive to fix once polish is built on top of it;
appearance is cheap to fix late. This is the pass that has to come first.

## Before reviewing

1. Read `docs/PATTERNS.md` in full. It is the standard; do not substitute
   general clean-code instincts for it.
2. Read `docs/PATTERNS.md` §11, the conformance backlog. **Anything already
   recorded there is known debt, not a finding.** Reporting it wastes the
   review. New code that *adds* to a known gap is a finding; say which row.
3. `git diff` the scope. Review what changed, not the whole codebase.

## What to check

Work through `PATTERNS.md` in order. The high-value checks:

- **§1 Atomic.** Can each new or changed file's job be stated in one sentence
  without "and"? Length alone is never the finding.
- **§1 Reusable.** Is this the third consumer of something duplicated? Then it
  should be extracted. Is it the second, with no test driving both copies? Then
  either add the guard test or extract. Does a component import another
  component?
- **§2 Structure.** Is a new module in the folder naming what it does?
- **§3 File shape.** Header comment stating what this is and what it is *not*.
  Member order. Exported `Config` and `Data` with doc comments.
- **§4 Failure.** Does anything throw where it should return a result? Does
  `data: null` get treated as an error?
- **§5 Render.** `ownerDocument` not global `document`. `replaceChildren` not
  `innerHTML`. Config guard first. Optimistic paint before `onChange`.
- **§6 Interaction.** Whole card as hit target with a `closest()` guard. Focus on
  `pointerdown`, commit on `click`. One route for keyboard and pointer. ARIA
  state present.
- **§7 Data.** Delta not snapshot. Spelling preserved. Foreign keys untouched.
- **§8 Config fields.** Descriptions state a consequence.
- **§10 Testing.** Round trip covered. Anything expressible in
  `contract.test.ts` put there rather than repeated per component.

## Three things not to report

- **Comment density.** This codebase runs 40-50% comment by design
  (`PATTERNS.md` §9). Decision records, the argument against the design not
  taken, are the point and must never be reported as bloat. The only comment
  finding worth making is a doc comment that *restates its own identifier*, or
  one duplicating a `configFields` description.
- **Anything the spec axis owns.** Whether the work is what the feature spec asked
  for, and whether it quietly grew past it, is `/spec-review`'s report. Code that
  follows every rule here and implements the wrong thing is a finding, just not
  yours.
- **A `[judgement]` rule cited as if binding.** `PATTERNS.md` marks every rule
  `[checked]`, `[warned]` or `[judgement]`. Report a judgement departure as a
  question with the tradeoff, not as a violation. Never claim the build enforces
  something it does not.

## Output

Findings only. Change nothing.

Rank most-severe first. For each:

- **file:line**
- **What rule**, with its `PATTERNS.md` section and its marker
- **Why it matters here**, concretely: the failure it allows, not a principle
- **The smallest fix**

Then, in one line each:

- Anything that should become a **checked** rule because you just found it by
  hand. That is the signal `PATTERNS.md` §11 wants.
- Anything that suggests `PATTERNS.md` itself is wrong. The doc is young; if the
  code has a better answer, say so rather than filing a finding against it.

If nothing is wrong, say so plainly and stop. Do not pad the list.
