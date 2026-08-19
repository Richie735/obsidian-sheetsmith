---
name: ship
description: "Use when a feature is finished and ready to commit: verifies, splits the work into the spec's commits, and updates docs/SPEC.md. Does not push."
argument-hint: "[feature name, or path to its docs/features file]"
allowed-tools: Read, Glob, Grep, Bash, Edit
---

Land finished work. **Feature:** $ARGUMENTS

**Run this once, at the end.** Not after the first implementation, not after
each finding is addressed. The work sits in one uncommitted tree through the
whole review loop, and this skill turns the settled result into commits when the
user says it is done. If the tree still has open findings against it, say so and
stop rather than committing a half-reviewed change.

## 1. Verify before anything else

```bash
npm test
npm run lint
npm run build
```

All three must pass. **Stop and report if any fails.** Do not commit around a
failure, and do not "fix" a test by changing what it asserts.

Note the lint warning count. The repo's baseline is 2, both in `src/settings.ts`
about the 1.13 declarative settings API. More than that means this work added
some; clear them or say why they stand.

## 2. Update docs/SPEC.md

`docs/SPEC.md` is the source of truth, and nothing announces when it goes stale.

- If the feature settled a §13 open question, **move it** to a `Resolved:` entry
  stating the decision and the argument. This is the moment it is genuinely
  resolved, which is why it happens here and not in the spec.
- If the feature changed how something described elsewhere in `docs/SPEC.md` works,
  update that section.
- If it raised a new open question, add it to §13.

## 3. Update the feature spec

Set `Status: shipped` in `docs/features/<slug>.md`, and tick the acceptance
criteria that are met. An unticked box at this point is either scope you cut,
which moves to "deliberately not doing" with a reason, or work that is not done.

## 4. Split into commits

Use the **commit boundaries** the spec named. If the work diverged from them,
re-derive boundaries from what was actually built rather than forcing the old
list.

Each commit must:

- build and pass tests on its own
- do one coherent thing
- carry a **Conventional Commits** subject: `type: Subject`
- **never** carry a `Co-Authored-By` trailer

### The subject

The type is machine-readable; the rest keeps this repo's voice. Both matter.

**Standard types only**, no invented ones: `feat`, `fix`, `docs`, `refactor`,
`test`, `perf`, `style`, `build`, `ci`, `chore`.

**After the colon, write as the log already reads**: imperative, describing the
behaviour rather than the change. `feat: Let a track hold a set of runs`, not
`feat: add TrackRows support`. Read `git log` for the tone before writing.

**`style:` means formatting and whitespace. It never means visual design.** In a
project whose work is largely visual this is the trap: a change to how something
looks is `feat:` when it improves it and `fix:` when it was wrong. Reserve
`style:` for changes a reader would see no difference from.

**`refactor:`** is behaviour-preserving movement: the folder moves and
extractions, where tests pass unchanged before and after.

**No scope.** `feat(pool):` adds noise in a single-plugin repository where the
subject already names the thing.

**Breaking changes.** A change to the layout file format, or to the shape of
what a character note stores, breaks user data. Mark it `feat!:` or `fix!:` and
add a `BREAKING CHANGE:` footer saying what the user must do. Constraint 4 makes
this the most consequential footer this repo has.

Commits made before this convention stay as they are; nothing is rewritten.

Body paragraphs are welcome where a decision needs its argument recorded.

Stage deliberately, file by file. Do not `git add -A` and hope.

## 5. Report

List the commits made, what remains uncommitted, and anything in `docs/SPEC.md` or
`docs/features/` you changed.

**Do not push.** Pushing is the user's call.

## Not this skill's job

Board and backlog tracking live outside this repository, which is public.
Nothing here reads or writes them, and nothing here should learn where they are.
They reconcile from the git log this skill produces.
