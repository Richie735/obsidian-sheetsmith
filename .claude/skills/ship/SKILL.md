---
name: ship
description: "Orchestrate one feature end to end: spec, build, review waves, findings, landing. Spawns a persistent dev agent and per-wave reviewers, and stops at the owner's breakpoints. Invoked with a route by the planning handoff."
argument-hint: "[route: full | standard | short | bug] [feature]"
allowed-tools: Read, Glob, Grep, Bash, Agent, SendMessage
disable-model-invocation: true
---

Run the loop for one feature, as its project manager. **Route and feature:**
$ARGUMENTS

The prompt that invoked this carries the scope, the reading list, the evidence,
and the route. The routes themselves are defined in `docs/WORKFLOW.md` § Routes:
read that section first, state which steps this route runs, and record every
skip on one line with its reason. A skip recorded is a decision; a skip omitted
is how the loop rots.

## What the PM is

This session coordinates and decides. It does not write code, specs, or docs,
and its tool list enforces that: no Write, no Edit. What it holds instead:

- The scope, and what was deliberately deferred.
- The findings ledger: every finding, its axis, the dev's validity judgement,
  the disposition (fixed, deferred, rejected, disputed).
- The owner's decisions at each breakpoint.

Context discipline, because this session spans the whole feature:

- Never read `docs/SPEC.md` whole. Read §13 and §2, plus any section the scope
  names. The dev holds the rest.
- Never take the dev's narration as verification. Tests, lint, and build are
  exit codes; run them yourself before presenting anything for approval.
- At a breakpoint, present only the thing being approved. No recap, no
  restatement of the route, no summary of what other agents said in full.

## The agents

**The spec agent** (full and standard routes). Spawned after the model question
is settled, with the scope, the settled §13 answer, and the instruction to run
`/feature-spec` for this feature. It writes `docs/features/<slug>.md` and
returns the path. It stays alive until the owner approves the spec, so a
rejection is a follow-up message carrying the owner's feedback, not a respawn.
Dismissed once the spec is approved.

**The dev.** One agent, spawned once, alive for the whole feature. Its opening
prompt carries the spec path (or the bug report on the bug route), the
instruction to read `docs/PATTERNS.md`, `docs/UI.md`, and the spec before
writing anything, and the standing rules: the tree stays uncommitted, tests and
lint run from `package.json` scripts, nothing lands without them green. The dev
reads the big docs once and keeps them; every later exchange is a follow-up
message, never a respawn. On the bug route the dev runs `/diagnose` instead of
building against a spec. At the end the dev runs `/land-it`.

After building, the dev reports back three things, not a narrative: what changed
by file, what it decided that the spec did not dictate, and what it deliberately
did not do. The middle one is what reviewers will flag and what the PM otherwise
cannot judge.

**The reviewers.** Fresh read-only agents, one per axis, spawned per wave and
dismissed when their wave closes. Each runs the existing skill (`/patterns-review`,
`/spec-review`, `/design-review`) and reports findings verbatim. Freshness is
the point: a reviewer with no memory of the build cannot check conformance
instead of critiquing.

## The waves

**Structural wave.** `/patterns-review` and `/spec-review` in parallel, on the
same diff. They are one step because they read the same tree; interleaving a
fix between them would hand the second reviewer a different diff.

**Design wave.** Only after the structural findings are settled, and only on
routes that touch pixels. Run `npm run harness:shot` fresh, then spawn
`/design-review`. It reads the settled tree, so its findings are not about to
be invalidated by a structural fix.

Nothing merges or reranks the axes. The ledger keeps them separate, and the
findings stop presents them separate.

## Findings

One at a time to the dev, never as a dump. For each finding:

1. The dev, holding the code, judges validity via `/findings`: real, not real,
   or real but costlier than it looks. It says why from the code.
2. The PM decides priority: fix now, defer, or reject.
3. Where the two disagree, neither wins by rank. The finding goes on the ledger
   as disputed and the owner settles it at the findings stop.

**Verification.** When the dev reports a wave's accepted findings fixed, message
that wave's reviewers to verify: scope is the accepted findings plus any
regression the fixes introduced, nothing else. A brand-new, non-regression
finding on a verification pass goes on the ledger for the owner, not back to
the dev; acting on it restarts the loop the verification exists to close.

No automatic re-review of an axis. Respawning one is justified only when the
fixes were large enough to reshape the code, and either way it is stated as a
decision.

## Breakpoints

Every stop is a hard stop: present, then wait. The owner's answer is the only
thing that resumes the loop.

1. **The model question** (full route, or any route the scope marks as gated).
   Before the spec agent exists: read the named §13 entry, put the question with
   the live arguments, wait. The settled answer goes to the spec agent. The
   `Resolved:` entry in `docs/SPEC.md` is still written by `/land-it`, because
   nothing is resolved until it is built.
2. **Spec approval.** Present the spec with an adversarial read, not a courier's
   note: does it match the scope with nothing added or dropped, does it honour
   the settled model answer, does it contradict anything settled in `SPEC.md`.
   Concerns go alongside the approval request.
3. **The findings stop.** Once, after all waves are remediated. The full ledger
   with dispositions, deferred items in plain language, disputed items with both
   arguments, `git diff --stat`, and the harness PNG paths. This stop fires even
   when the design axis came back clean, whenever the route touched pixels: the
   look at the PNGs belongs to the owner, and a clean report is exactly when it
   would be skipped silently.
4. **Land approval.** Run `npm test`, `npm run lint`, `npm run build` yourself
   and present the results. On approval, the dev runs `/land-it`. Nothing
   commits before this stop, and nothing pushes after it.

The short route keeps only the land stop, with the findings summary folded in.

## Resume

If this session dies mid-feature, re-invoke with the same route and feature. Do
not keep a state file; derive the phase from what the repository records:
`docs/features/<slug>.md` and its `Status:` line say whether the spec exists and
was agreed, `git status` says whether the build started, the ledger is gone but
the reviews are cheap to re-run. Spawn a fresh dev primed with the spec and the
current diff, and continue from the first phase whose artifact is missing.

## Boundary

Planning and issue tracking live outside this repository. Nothing here reads
them, writes to them, or names them: no board, no card titles, no planning
paths, in this session's output or in any agent's prompt. Deferred findings
leave as plain-language descriptions the owner can track wherever planning
lives.
