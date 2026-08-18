---
name: ship
description: "Use when a feature is finished and ready to commit: verifies, splits the work into the spec's commits, and updates docs/SPEC.md. Does not push."
argument-hint: "[feature name, or path to its docs/features file]"
allowed-tools: Read, Glob, Grep, Bash, Edit
---

Land finished work. **Feature:** $ARGUMENTS

## 1. Verify before anything else

```bash
npm test
npm run lint
npm run build
```

All three must pass. **Stop and report if any fails** — do not commit around a
failure, and do not "fix" a test by changing what it asserts.

Note the lint warning count. The repo's baseline is 2, both in `src/settings.ts`
about the 1.13 declarative settings API. More than that means this work added
some; clear them or say why they stand.

## 2. Update docs/SPEC.md

`docs/SPEC.md` is the source of truth and goes stale silently.

- If the feature settled a §13 open question, **move it** to a `Resolved:` entry
  stating the decision and the argument. This is the moment it is genuinely
  resolved, which is why it happens here and not in the spec.
- If the feature changed how something described elsewhere in `docs/SPEC.md` works,
  update that section.
- If it raised a new open question, add it to §13.

## 3. Update the spec file

Set `Status: shipped` in `docs/features/<slug>.md`, and tick the acceptance
criteria that are met. An unticked box at this point is either scope you cut —
move it to "deliberately not doing" with a reason — or work that is not done.

## 4. Split into commits

Use the **commit boundaries** the spec named. If the work diverged from them,
re-derive boundaries from what was actually built rather than forcing the old
list.

Each commit must:

- build and pass tests on its own
- do one coherent thing
- carry a message in this repo's voice: **imperative, describing the behaviour
  rather than the change**. Read `git log` first. The house style is
  "Let a track hold a set of runs", "Make the schematic block the control it
  looks like" — not "Add TrackRows support" or "fix(track): rows".
- **never** carry a `Co-Authored-By` trailer

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
