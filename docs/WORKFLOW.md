# Workflow

The loop a feature goes through, and which command owns each step. Everything
here is a pointer: the rules live in the documents named, and this page exists so
nobody has to remember which one.

## The loop

Picking up once a feature has been chosen and researched, which happens outside
this repository.

The loop is normally driven end to end by `/ship <route> [feature]`, which runs
it as one orchestrated session: a persistent dev agent, fresh reviewer agents
per wave, and hard stops wherever the owner decides. The table is the
definition either way; running it by hand, one session per step, remains the
fallback when the orchestrator misbehaves.

| # | Step | Session | What runs |
| --- | --- | --- | --- |
| 1 | Settle the model question, then design | design | `/feature-spec` |
| 2 | Build | build | ordinary work against the spec |
| 3 | Check the patterns, and check the spec | review | `/patterns-review` and `/spec-review`, in parallel on the same diff |
| 4 | Judge those findings, fix the real ones | build | `/findings`, tree stays uncommitted |
| 5 | Look at it | review | `npm run harness:shot` fresh, then `/design-review` |
| 6 | Judge those findings, fix the real ones | build | `/findings` |
| 7 | Land it | build | `/land-it` |

Steps 3 and 4 sit before 5 on purpose. Structural drift is expensive to fix
once polish is built on top of it; appearance is cheap to fix late. Discovering
that the wrong thing was built is dearer than either, which is why the spec axis
sits beside the patterns one rather than after the polish. And the design review
reads the structurally settled tree, so its findings are not invalidated by a
patterns fix landing after it looked.

The reviews report separately and nothing merges or reranks them. Code can follow
every pattern and implement the wrong feature, or implement the right feature and
look wrong; keeping the axes apart is what stops one from masking another.
`/land-it` reads them and reconciles none of them.

### Why the sessions are separate

**The review session must not be the one that produced the work.** This is the
boundary that matters. A session that wrote the design is anchored on it and
will check conformance rather than critique it, and a session that wrote the
code already believes its own reasoning. Under `/ship` this is structural:
reviewers are spawned fresh with no memory of the build. By hand, it is a habit:
start the reviewer fresh, hand it the spec and the screenshots, and let it
disagree.

**Design and build do not share a head.** The spec is a committed file, so the
handoff is a path rather than a conversation, and splitting them keeps the
builder from inheriting assumptions the spec never wrote down. `/ship` always
splits them; by hand, sharing a session is faster on a small feature and stays a
judgement call.

**Findings come back to the build session**, a few at a time rather than as one
dump, and `/findings` is what works them there. The review session stays out of
the code, so its next pass reads what changed rather than remembering what it
asked for. Whether a finding is worth acting on is the build session's call and
no reviewer's: a session that fixes everything it is handed writes code shaped by
whichever reviewer went last.

### When it is a bug

A bug does not start at step 1, because there is nothing to design yet. Run
`/diagnose`, which refuses to theorise until one command goes red on the bug, then
minimises it, fixes at the layer that owns it, and locks it with a regression
test. It rejoins the loop at step 3 and lands through `/land-it` like anything else.
With no feature spec to read, `/spec-review` says so and skips: the regression
test is what stands in for an acceptance criterion. On the orchestrated path
this is the `bug` route, and the dev agent is the one running `/diagnose`.

Planning and issue tracking live outside this repository, and nothing here reads
them or should learn where they are.

## Routes

The planning handoff names one of four routes; `/ship` runs the steps that route
keeps and records every skip with its reason. Under-routing is the worse failure
of the two: a surface built without a spec gets rebuilt.

- **Full.** Gated on an open `SPEC` §13 question, or a surface nobody has built
  before. Every step, opening with the model question before any design exists.
  Stops: the model question, spec approval, the findings stop, land approval.
- **Standard.** A surface whose mechanism the repository already has. Spec it
  briefly, or skip the spec where named precedent files carry the design. Build,
  both review waves, the design wave only where there are pixels. Stops: spec
  approval where a spec was written, the findings stop, land approval.
- **Short.** A decision, a chore, or debt with no user-facing surface. Build,
  structural wave, land. One stop: land approval, with the findings summary
  folded in.
- **Bug.** `/diagnose` first, no spec. Rejoins at the structural wave, lands like
  anything else. Stops: the findings stop where the fix touched pixels, land
  approval.

Whatever the route, the findings stop fires whenever the work touched pixels,
even when `/design-review` came back clean. The look at the PNGs belongs to the
owner, and a clean report is exactly when it would be skipped silently.

## Commits

One uncommitted tree through steps 2 to 6. `/land-it` is the only thing that
commits, at the end, once. One tracked issue usually spans several commits;
never force it into one.

Subjects are Conventional Commits, standard type names only, with the subject
itself in the log's voice: `feat: Let a track hold a set of runs`.

`style:` means whitespace and formatting. **It never means visual design** — that
is `feat:` when it improves something and `fix:` when it was wrong.

## Which document answers what

| Question | Document |
| --- | --- |
| What does the plugin do? | `docs/SPEC.md` |
| What does this term mean? | `docs/SPEC.md` §2 |
| What is still undecided? | `docs/SPEC.md` §13 |
| What was this feature meant to do? | its `docs/features/<slug>.md`, checked by `/spec-review` |
| How is code written here? | `docs/PATTERNS.md` |
| How does a sheet look and behave? | `docs/UI.md` |
| What may move, and how? | `docs/UI.md` §8, then `design-review/reference/motion.md` |
| Where does this file go? | `docs/PATTERNS.md` §2 |
| What must never be broken? | `CLAUDE.md` § Hard constraints |
| Obsidian platform rules | `AGENTS.md` |
| Known gaps, deliberately unfixed | `docs/PATTERNS.md` §11, `docs/UI.md` §12 |

## When to read Obsidian's docs

`AGENTS.md` is the distilled version and answers most platform questions on its
own. Go to the live documentation when it does not, or when the answer may have
moved: this project has been caught twice by that, once when Obsidian 1.13
redrew the settings tab as cards, and once when a doc here claimed a lint rule
was enforced that only warned.

| Step | Read | For |
| --- | --- | --- |
| Spec, build | TypeScript API | Whether the platform already offers what the feature needs, before designing around a guess |
| `/diagnose` | TypeScript API | Whether the behaviour is the platform's own, before it is called a bug |
| `/patterns-review` | Developer policies, plugin guidelines | Anything touching the network, user data, or the release surface |
| `/design-review` | CSS variables, style guide | Which theme variables exist, and casing for user-facing text |
| `/land-it` | Plugin guidelines | Release artifacts, manifest and `versions.json` rules |

Links are in `AGENTS.md` § References. Cite what the documentation says when it
settles a question, so the next session does not look it up again.

## Gates

Nothing lands without `npm test`, `npm run lint` and `npm run build`. Lint runs
at `--max-warnings 0`, so a warning fails exactly like an error.

Run `caffeinate -dis` for the duration of an orchestrated session. The dev
agent has died to machine sleep mid-response; keeping the machine awake is
cheaper than the respawn.

For anything visual, `npm run harness:calibrate` once per Obsidian version, then
`npm run harness:shot` and **look at the PNGs**. A review that reads CSS instead
of looking invents findings and misses real ones.

## Rules of thumb

- A rule worth having is worth checking. Prose decays; `contract.test.ts` and
  `styles.test.ts` are the cheap places to make one bite.
- A gap that is not being fixed goes in a backlog table with its reasoning, not
  in a comment and not nowhere.
- Anything the workflow depends on lives in this repository. A clone on another
  machine has to work the same way.
