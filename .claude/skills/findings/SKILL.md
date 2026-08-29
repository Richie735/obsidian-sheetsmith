---
name: findings
description: "Use when the user passes review findings, feedback, or a critique to act on: judge each one honestly, fix what is real, and say plainly what is not. Stays active while the batch is worked."
argument-hint: "[the first finding, or nothing if it follows in the next message]"
allowed-tools: Read, Glob, Grep, Bash, Edit, Write
---

Work through findings the user passes you. **First finding:** $ARGUMENTS

This runs at steps 4 and 6 of the workflow, in the build session. The three reviews report on
their own axes and nothing merges them, so this is the one place all of them
converge, and the judgement about what is worth doing lives here rather than in
any reviewer.

## This stays on

Findings arrive as a batch, one batch per review wave, so this is a standing
mode rather than one task. Until the batch is done, or the work moves on to
`/land-it`:

- Open every response with `[FINDINGS]`, so the mode survives a compaction.
- Take one finding at a time, all the way through, before reading the next. The
  batch is how they arrive, not how they are judged: judged together, they get
  judged by their worst member.
- Report back once, when every finding in the batch has a verdict.
- If a later message is plainly another batch, treat it as one without being
  told again.

## 1. Check the claim before judging it

A finding is a claim about the code, not a fact about it. Go read the code it
names. A verdict formed from the finding's own prose is agreement, not judgement,
and agreement is what makes a review worthless.

State what the code actually does, with `file:line`. Often this settles the
finding on its own: reviewers misread call sites, miss a guard three lines up, and
report behaviour that a test already covers.

## 2. Reach a verdict

Four, and each demands something different:

- **Fix.** Real, and worth changing now. Requires a **concrete failure**: what
  breaks, for whom, under what input or state. If you cannot name one, this is not
  a fix.
- **Later.** Real, but not now. Requires a **home**, because a gap that is not
  being fixed goes in a backlog table with its reasoning, never in a comment and
  never nowhere: `PATTERNS.md` §11 for a conformance gap, `UI.md` §12 for an
  appearance one, `SPEC.md` §13 for an open question. Writing the row is part of
  the verdict, not a promise to write it.
- **Reject.** Not a real finding. Requires the **reason**, and these are the
  common ones: already recorded as known debt, a scope cut the spec recorded under
  "deliberately not doing", a `[judgement]` rule cited as if the build enforced
  it, comment density flagged as bloat when this codebase runs 40 to 50 percent
  comment by design (`PATTERNS.md` §9), or the code simply does not do what the
  finding says.
- **Not this axis.** A real observation about something else: a feature request
  wearing a finding's clothes, or a patterns point raised in a design review. Say
  where it belongs. Do not fix it here to be helpful.

## 3. Fix it

Smallest change that addresses the mechanism. Then run `npm test`. Lint and
build run once at the wave's close, not after every fix: they cost minutes each
and catch what the wave-close run catches anyway. For anything visual,
`npm run harness:shot` again and look at the PNG, because the finding was about
what it looks like and so is the check.

Leave the work **uncommitted**. `/land-it` is the only thing that commits, at the
end, once.

## Honesty rules

The failure mode here is not laziness, it is agreeableness. A session that fixes
every finding it is handed produces code shaped by whichever reviewer talked last.

- **Reject out loud.** A finding you dismiss is reported with its reason, never
  quietly skipped. The user is choosing whether to overrule you, and cannot if
  they never see it.
- **No "good catch", no "you're absolutely right".** Say what is true and move on.
- **Argue the cost, not the taste.** "This adds an abstraction for one caller" is
  a reason. "This does not feel idiomatic" is not.
- **A fix bigger than its finding is itself a finding.** Say what the full fix
  would touch, propose the contained version, or send it to a backlog row. Do not
  quietly start a refactor because a review mentioned a symptom of one.
- **The spec outranks the reviewer.** A finding asking for something the spec
  deliberately excluded is rejected on that ground until the user changes the
  spec.
- **Findings can contradict each other.** When two do, say so and pick, with the
  reason. Do not implement both.

## Stop and ask when

The fix would change the spec, break a hard constraint in `CLAUDE.md`, or alter a
design the user already approved. Those are decisions, and this skill decides only
whether a finding is worth acting on.

## Per finding, report

- **Verdict**, one of the four.
- **What the code does**, at `file:line`, where the claim needed checking.
- **Why**, in a sentence or two: the concrete failure, or the concrete reason it
  is not one.
- **What changed**, or which backlog row now holds it, or nothing.
