---
name: release
description: "Use when a version branch has accumulated enough to ship: confirms the number, bumps it, merges the branch into main, tags, pushes, and opens the next version branch. The only thing in this repository that pushes."
argument-hint: "[version to release, e.g. 0.2.0] [next version to open, optional]"
allowed-tools: Read, Glob, Grep, Bash, Edit
disable-model-invocation: true
---

Release the open version branch. **Version:** $ARGUMENTS

**This runs when the owner says a cycle is done, never because a feature
landed.** A release is a decision about a set of changes, not about the last one
in it. `/ship` and `/land-it` know nothing about this skill, and neither of them
may invoke it.

Read `docs/WORKFLOW.md` § Branches before doing anything. It defines the branch
model this skill closes.

## 1. Refuse before acting

Run these checks in order and stop at the first failure. Say which check failed
and what would fix it; do not work around one.

```bash
git branch --show-current
git status --porcelain
git fetch origin
git log --oneline origin/main..main
git log --oneline main..release/<version>
git branch --list 'feat/*' 'fix/*' 'chore/*' --no-merged release/<version>
git tag --list '<version>'
git ls-remote --tags origin '<version>'
```

Stop when:

- **The current branch is not `release/<version>`.** This skill releases the
  branch it is standing on, and the argument has to agree with it.
- **The working tree is not clean.** A release built from an uncommitted tree
  ships something no commit records.
- **`main` holds commits the version branch does not.** Someone worked on main.
  Merge main into the version branch, re-run the gates, then come back. Do not
  paper over it with a merge in the release direction.
- **A work branch is unmerged.** List it. Either it belongs in this release and
  has to land first, or it does not and the owner says so on the record.
- **The tag already exists**, locally or on origin. A released version is
  immutable; the answer is a new number, never a moved tag.
- **`git log main..release/<version>` is empty.** There is nothing to release.

## 2. Confirm the number

Read the commit subjects since the last tag and derive what the bump should be:

```bash
git log --oneline "$(git describe --tags --abbrev=0)"..HEAD
git log "$(git describe --tags --abbrev=0)"..HEAD --grep='BREAKING CHANGE' --format='%h %s'
```

- Any `feat!:` / `fix!:` subject, or a `BREAKING CHANGE:` footer, is a breaking
  change. While the plugin is `0.x`, that bumps the **minor**, because SemVer
  gives `0.y.z` no major to spend.
- Otherwise any `feat:` bumps the minor.
- Otherwise a patch.

State the derivation in one line. **The argument wins if the two disagree**, but
say they disagree before proceeding: shipping a breaking change as a patch is a
user's layout file broken by an update they were told was safe.

Constraint 4 is what makes this worth a paragraph. A change to the layout file
format or to what a character note stores is breaking even when nothing in the
diff looks like it.

## 3. Bump

Edit `version` in `package.json` by hand, then:

```bash
npm run version
```

Not `npm version`, whose lifecycle commits and tags. The script carries the
number into `manifest.json` and `versions.json` and leaves `minAppVersion`
alone, which is correct: it is a claim about which API members the code uses, so
it moves when somebody has checked it. If this release raised the floor, edit
`minAppVersion` in `manifest.json` yourself, before running the script, and say
in the report which API member forced it.

Read all three files back. `manifest.json` must carry the version, and
`versions.json` must have gained exactly one key.

Commit on the version branch, staging those files by name:

```bash
git add package.json manifest.json versions.json
git commit -m "chore: Prepare <version>"
```

No `Co-Authored-By` trailer, here or anywhere.

## 4. Gates

```bash
npm test
npm run lint
npm run build
```

All three, on the bumped tree, before the merge. Lint runs at
`--max-warnings 0`. **Stop and report on any failure.** Nothing about a release
justifies merging around a red gate, and this is the last run before the tag
makes the result public.

## 5. Merge into main

```bash
git switch main
git merge --no-ff release/<version> -m "Release <version>"
```

`--no-ff` even when a fast-forward is possible. The merge commit is what makes a
release one identifiable point in the log rather than a run of commits that
happen to end at a tag. Its subject is not a Conventional Commit: it is a merge,
and the types describe changes.

If the merge conflicts, stop. A conflict here means main moved, which check 1
should have caught, and resolving it inside a release is how a release ships
something nobody reviewed.

## 6. Tag and push

```bash
git tag <version>
git push origin main
git push origin <version>
```

**No leading `v`.** Obsidian matches the tag against `manifest.json`'s `version`
exactly, and a `v0.2.0` tag is a release nobody can install.

Push main first and the tag second. The tag is what fires
`.github/workflows/release.yml`, and a tag that arrives before its commit is a
build of a ref the runner cannot resolve.

**This is the only push in the whole workflow.** Everything before it, every
feature branch and the version branch itself, stays local.

## 7. Hand over the notes

The Action builds the plugin and creates a **draft** release carrying `main.js`,
`manifest.json` and `styles.css`. It writes no notes, and publishing is the
owner's.

Produce the notes and print them for pasting. Group by what the reader gets, not
by commit type:

- **Breaking** first, when there is any, each with what the user has to do.
- **Added** from `feat:`.
- **Fixed** from `fix:`.
- Everything else is omitted. `refactor`, `test`, `chore`, `build` and `docs`
  are the log's business, not a release note's.

One line per change, in the plugin's own vocabulary rather than the commit's.
`feat: Let a track hold a set of runs` becomes "A track can hold a set of runs."
A reader of these notes has never seen this repository.

Then tell the owner: check the run, read the draft, publish it. Do not wait on
the Action and do not publish the draft.

## 8. Open the next cycle

```bash
git switch -c release/<next> main
git branch -d release/<version>
git push origin --delete release/<version>   # only if it was ever pushed
```

`git branch -d`, never `-D`: the safe form refuses a branch that is not merged,
which is exactly the check worth having here.

The next number is the argument's second value, or ask. Guessing is fine to
propose and wrong to assume: whether the next cycle is `0.3.0` or `0.2.1`
depends on what the owner intends to put in it, which is not in the repository.

There is always exactly one open version branch. That is the invariant `/ship`
depends on, and this step is the only thing that maintains it.

## 9. Report

- The version released, and the derivation that justified it.
- The commits it carried, by count and by type.
- The gate results.
- The tag pushed, and the Action run to look at.
- The next version branch, open and empty.
- Anything left uncommitted or unmerged, which should be nothing.

## Not this skill's job

- **Publishing the draft.** The owner reads the notes and publishes.
- **The community directory.** Only the first version is submitted there, by
  hand, per `AGENTS.md` § Versioning & releases. An update needs no directory
  action.
- **Board and backlog tracking.** They live outside this repository, which is
  public, and they reconcile from the git log and the tags.
- **Deciding that a cycle is done.** That is the whole of what the owner brings
  to this skill.
