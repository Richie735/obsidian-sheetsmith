---
name: ship
description: "Orchestrate one feature end to end: spec, build, review waves, findings, landing. Spawns a persistent dev agent and per-wave reviewers, and stops at the owner's breakpoints. One run is one feature and ends at the land stop. Invoked with a route by the planning handoff."
argument-hint: "[route: full | standard | short | bug] [feature]"
allowed-tools: Read, Glob, Grep, Bash, Agent, SendMessage, PushNotification
disable-model-invocation: true
---

Run the workflow for one feature, as its project manager. **Route and feature:**
$ARGUMENTS

The prompt that invoked this carries the scope, the reading list, the evidence,
and the route. The routes themselves are defined in `docs/WORKFLOW.md` § Routes:
read that section first, state which steps this route runs, and record every
skip on one line with its reason. A skip recorded is a decision; a skip omitted
is how the workflow rots.

## One feature, one run

This session ends at the land stop. Nothing that arrives after it re-enters
here: a design note implying a redesign, a follow-on the spec deferred, a second
surface the feature revealed. Each is a new route through the planning handoff
and a new `/ship`.

The pull is strongest right after a wave, when the dev is primed and a follow-on
looks like an amendment. An amendment has no edge, and that is how one feature
becomes four. A spec amendment is in scope only while the feature has not landed
and only where the current spec is wrong. Anything that adds a surface is out.

Out means a stop, not advice. The moment a proposed amendment adds a surface,
present exactly two options: defer it through the planning handoff as its own
route, or abandon this run and respec. Building it inside this run is not on the
menu. One run took 43 hours by absorbing its follow-ons as amendments; the rule
held as prose and failed in practice, which is why it is now a breakpoint.

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

Five on the full route: the spec agent, the dev, two structural reviewers, one
design reviewer. Shorter routes carry fewer. A sixth is a decision, not a
convenience: name on one line what it is for and why no agent already alive can
do it, before spawning. Every extra agent looks reasonable on its own, which is
why the constraint is a count.

**The spec agent** (full and standard routes). Spawned after the model question
is settled, with the scope, the settled §13 answer, and the instruction to run
`/feature-spec` for this feature. It writes `docs/features/<slug>.md` and
returns the path. It stays alive until the owner approves the spec, so a
rejection is a follow-up message carrying the owner's feedback, not a respawn.
Dismissed once the spec is approved.

**The dev.** One agent, spawned once, alive for the whole feature. On routes
with a spec, spawn it the moment the spec goes to the owner for approval, not
after the answer: its opening prompt says to read `docs/PATTERNS.md` and
`docs/UI.md` and then hold, so the expensive prime runs inside the approval wait
instead of adding to the build. The approved spec path follows as a message. On
the bug route the opening prompt carries the bug report instead and the dev runs
`/diagnose`. Either way the opening prompt carries the standing rules: the tree
stays uncommitted, tests and lint run from `package.json` scripts, nothing lands
without them green. The dev reads the big docs once and keeps them; every later
exchange is a follow-up message, never a respawn. At the end the dev runs
`/land-it`. If the spec comes back rejected, the held dev costs nothing: the
docs it read serve whatever the respec produces.

The dev has died mid-feature to network errors and to machine sleep. A
replacement is primed on the spec path and `git diff`, not on the full reading
list: `PATTERNS.md` and `UI.md` are what made the first prime expensive, and the
tree already embodies them. Say in the replacement's prompt what the dead one
had done.

After building, the dev reports back three things, not a narrative: what changed
by file, what it decided that the spec did not dictate, and what it deliberately
did not do. The middle one is what reviewers will flag and what the PM otherwise
cannot judge.

**Early eyes.** The moment the build's gates run green, and where the work
touches pixels, run `npm run harness:shot` and hand the owner the PNG paths in
one line, non-blocking, then spawn the structural wave. This is the one full-set
shot run of the feature; every later shot is scoped to the views a change
touched, via the script's own parameters
(`node harness/shot.mjs surface=... theme=...`), because the full set costs two
minutes and most of its views did not change. The owner glances whenever; this
costs the run nothing because the wave runs meanwhile. Design feedback arriving
here re-enters as a spec amendment before any remediation is built on top of the
wrong shape, which is hours cheaper than the same feedback arriving at the land
stop or after land.

**The reviewers.** Fresh read-only agents, one per axis, spawned per wave and
dismissed when their wave closes. Each runs the existing skill (`/patterns-review`,
`/spec-review`, `/design-review`) and reports findings verbatim. Freshness is
the point: a reviewer with no memory of the build cannot check conformance
instead of critiquing.

## The waves

**Structural wave.** `/patterns-review` and `/spec-review` in parallel, on the
same diff. They are one step because they read the same tree; interleaving a
fix between them would hand the second reviewer a different diff.

**Design wave.** Only on routes that touch pixels, and in parallel with the
structural remediation, not after it: spawn `/design-review` on the early-eyes
PNGs while the dev works the structural batch, naming those PNG paths in its
prompt so it reads them instead of re-shooting. Structural fixes rarely move
pixels, and serializing the two waves used to add the reviewer's whole runtime
to the feature. When the structural batch closes, check its diff: if it touched
a rendering path (`src/components/`, `src/ui/`, `src/styles/`, any `.css`),
re-shot just the affected views and send them to the still-alive design reviewer
to re-check before its wave closes. If the fixes stayed structural, the early
shots stand and nothing re-runs.

Nothing merges or reranks the axes. The ledger keeps them separate, and the
land stop presents them separate.

## Findings

One batch per wave. The wave's findings go to the dev together and the dev works
them with `/findings`, one at a time inside the batch: batching the delivery is
what saves the round trips, batching the judgement is what gets a finding judged
by its worst neighbour. A second batch exists only when the first batch's fixes
uncovered something. A third says the wave was wrong, not that the work is
thorough.

The PM filters before the dev judges. A finding goes into the batch only when it
cites a rule with its section, a spec line, or a measured break. Observations
and taste go straight on the ledger marked as such; they cost the dev's round
trip nothing, and the owner decides them at the land stop. A 15-finding batch
where 6 are observations is a 9-finding batch.

For each finding:

1. The dev, holding the code, judges validity via `/findings`: real, not real,
   or real but costlier than it looks. It says why from the code.
2. The PM decides priority: fix now, defer, or reject.
3. Where the two disagree, neither wins by rank. The finding goes on the ledger
   as disputed and the owner settles it at the land stop.

**Verification closes the wave, it is not a pass of its own.** When the dev
reports the batch fixed, run the gates yourself, then message that wave's
reviewers once with the accepted findings and the result: scope is those
findings plus any regression the fixes introduced, nothing else. Nothing is
reported fixed without a green run. A brand-new, non-regression finding goes on
the ledger for the owner, not back to the dev; acting on it restarts the work
the verification exists to close.

No re-review of an axis. If the fixes reshaped the code enough to want one, that
is the owner's call at the land stop.

## Gates

`npm test`, `npm run lint`, `npm run build`. The PM runs all three at each wave's
close and once at the land stop, never after a fix batch. The dev runs `npm test`
alone after a fix; lint and build after every fix cost minutes each and catch
what the wave-close run catches anyway.

A green run stands until the tree moves. At the land stop, if `git status` and
`git diff` match what the last green run saw, present that run's numbers and say
they are standing, instead of re-proving them. Re-running gates on an unchanged
tree has cost runs ten minutes to confirm nothing.

## Breakpoints

Which stops a route carries is in `docs/WORKFLOW.md` § Routes. Every stop it
carries is a hard stop: present, then wait. The owner's answer is the only thing
that resumes the work. At every stop, send a push notification naming the stop
and the feature. The profiled cost of a stop is not the owner's answer; it is
the 30 to 40 minutes before the owner sees that a question fired.

1. **The model question.** Before the spec agent exists: read the named §13 entry, put the question with
   the live arguments, wait. The settled answer goes to the spec agent. The
   `Resolved:` entry in `docs/SPEC.md` is still written by `/land-it`, because
   nothing is resolved until it is built.
2. **Spec approval.** Present the spec with an adversarial read, not a courier's
   note: does it match the scope with nothing added or dropped, does it honour
   the settled model answer, does it contradict anything settled in `SPEC.md`.
   Concerns go alongside the approval request.
3. **The land stop.** Once, after all waves are remediated and the gates are
   green. One presentation carries everything: the full ledger with
   dispositions, deferred items in plain language, disputed items with both
   arguments, `git diff --stat`, the harness PNG paths, and the gate results.
   This stop fires even when the design axis came back clean, whenever the route
   touched pixels: the look at the PNGs belongs to the owner, and a clean report
   is exactly when it would be skipped silently. Approval means the dev runs
   `/land-it`. An answer that orders a fix sends one more batch to the dev,
   re-runs the gates, and re-presents. Nothing commits before this stop, and
   nothing pushes after it. It replaces the separate findings and land stops:
   between the two, nothing happened but a gate run, and each cost an owner
   round trip.

## Resume

If this session dies mid-feature, re-invoke with the same route and feature. Do
not keep a state file; derive the phase from what the repository records:
`docs/features/<slug>.md` and its `Status:` line say whether the spec exists and
was agreed, `git status` says whether the build started, the ledger is gone but
the reviews are cheap to re-run. Spawn a fresh dev primed with the spec and the
current diff, and continue from the first phase whose artifact is missing.

## Planning stays outside

Planning and issue tracking live outside this repository. Nothing here reads
them, writes to them, or names them: no board, no card titles, no planning
paths, in this session's output or in any agent's prompt. Deferred findings
leave as plain-language descriptions the owner can track wherever planning
lives.
