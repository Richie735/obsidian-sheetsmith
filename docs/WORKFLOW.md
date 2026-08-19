# Workflow

The loop a feature goes through, and which command owns each step. Everything
here is a pointer: the rules live in the documents named, and this page exists so
nobody has to remember which one.

## The loop

Picking up once a feature has been chosen and researched, which happens outside
this repository.

| # | Step | Session | What runs |
| --- | --- | --- | --- |
| 1 | Settle the model question, then design | design | `/feature-spec` |
| 2 | Build | build | ordinary work against the spec |
| 3 | Check the patterns, and check the spec | review | `/patterns-review` and `/spec-review` |
| 4 | Look at it | review | `npm run harness:shot`, then `/design-review` |
| 5 | Judge the findings, address the real ones | build | `/findings`, tree stays uncommitted |
| 6 | Land it | build | `/ship` |

Steps 3 and 4 are in that order on purpose. Structural drift is expensive to fix
once polish is built on top of it; appearance is cheap to fix late. Discovering
that the wrong thing was built is dearer than either, which is why the spec axis
sits beside the patterns one rather than after the polish.

The reviews report separately and nothing merges or reranks them. Code can follow
every pattern and implement the wrong feature, or implement the right feature and
look wrong; keeping the axes apart is what stops one from masking another.
`/ship` reads them and reconciles none of them.

### Why the sessions are separate

**The review session must not be the one that produced the work.** This is the
boundary that matters. A session that wrote the design is anchored on it and
will check conformance rather than critique it, and a session that wrote the
code already believes its own reasoning. Start the reviewer fresh, hand it the
spec and the screenshots, and let it disagree.

**Design and build can share a session or not.** The spec is a committed file, so
the handoff is a path rather than a conversation. Splitting them keeps the
builder from inheriting assumptions the spec never wrote down; keeping them
together is faster on a small feature. Judgement call.

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
test. It rejoins the loop at step 3 and lands through `/ship` like anything else.
With no feature spec to read, `/spec-review` says so and skips: the regression
test is what stands in for an acceptance criterion.

Planning and issue tracking live outside this repository, and nothing here reads
them or should learn where they are.

## Commits

One uncommitted tree through steps 2 to 5. `/ship` is the only thing that
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
| `/ship` | Plugin guidelines | Release artifacts, manifest and `versions.json` rules |

Links are in `AGENTS.md` § References. Cite what the documentation says when it
settles a question, so the next session does not look it up again.

## Gates

Nothing lands without `npm test`, `npm run lint` and `npm run build`. Lint runs
at `--max-warnings 0`, so a warning fails exactly like an error.

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
