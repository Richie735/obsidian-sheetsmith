---
name: design-review
description: "Use when reviewing how a feature looks and behaves, after it works. Reviews the rendered harness against docs/UI.md and the feature's spec. Requires looking at the UI, not reading CSS."
argument-hint: "[feature name, or path to its docs/features file]"
allowed-tools: Read, Glob, Grep, Bash
---

Review appearance and usability. **Feature:** $ARGUMENTS

Read `docs/UI.md` and the feature's `docs/features/<slug>.md` before starting.

**If the change touches a transition, a gesture, or anything that moves, also
read `reference/motion.md` in this skill's folder** before judging it. It carries
the standards for frequency, easing, duration, interruptibility and how a gesture
should respond, the vocabulary for saying precisely what is wrong, and a record of where this
codebase already stands so a review does not re-litigate settled ground.

It lives in the repository rather than as an installed skill on purpose: a clone
on another machine has to review by the same standard, and a delegation to
something machine-local would fail with no sign rather than with an error.

## You must look at it

```bash
npm run harness:calibrate   # once per Obsidian version
npm run harness             # build
npm run harness:shot        # writes harness/shots/*.png
```

Then **read the PNGs**. They are the review. `harness/shots/` holds both themes,
both screens, the narrow reflow, and the empty and error states.

- `harness:calibrate` extracts the real theme palette and settings chrome from
  the installed Obsidian, so what you are looking at is the app's own frame
  rather than an approximation. Skip it and the shots still render, from the
  hand-written fallback in `harness/theme.css`. Say so in your report if you had
  to.
- `harness:shot` takes any view the harness can show:
  `node harness/shot.mjs surface=settings theme=dark width=620`.

**If you cannot see the rendered result, say so and stop.** Reviewing appearance
by reading a stylesheet describes what the code should look like, not what it
does: it invents findings about problems that do not exist and misses the ones
that do. Every visual bug found so far in this project was found by looking.

Prefer a fresh session for this review. A session that wrote the design is
anchored on it and will check conformance rather than critique.

For a question the harness cannot answer, such as how a community theme treats
this or whether the real app agrees, `harness/inspect.mjs` drives the running Obsidian
over the DevTools protocol. It needs the app started with a debug port, so it is
the deeper tool, not the default one.

## What to check

Against the spec first:

- Does it meet each acceptance criterion? Name the ones it misses.
- Did it build something the spec's "deliberately not doing" ruled out?

Then against `docs/UI.md` §11, both screens:

**Sheet.** Both themes; narrow container reflow and overflow; the component at
1, 2 and 3 columns wide filling its placement; numbers holding still while
stepping; one focus treatment, visible everywhere; the empty and error states,
not only the populated one.

**Settings.** Does a new config field read as a setting or as a form field
dumped in a list; is its description a consequence or a restatement; do the
list-shaped fields stay legible at ten entries; does the grid preview agree with
what the sheet renders. `Surface → Both` shows a config change hit the card live.

Then the judgement calls `UI.md` cannot check for you:

- Is this the shared vocabulary (`UI.md` §9), or a lookalike that will drift?
- What does a reader take from this at a glance, and is that the right thing?
- Is anything reachable only by hover, or only by a gesture with no keyboard
  route?
- Does anything move that is pressed every few seconds? `UI.md` §8 puts
  frequency first, and a control panel earns feedback rather than animation.
- Does the error text name a fix or only a fault?

## Output

Findings only. Change nothing.

Group as **breaks the spec** / **breaks a `UI.md` rule** / **judgement**, most
severe first. For each: what you saw, where, why it matters to someone using it,
and the smallest change that fixes it.

Keep judgement findings clearly separate. They are the ones the user overrules
most often, and mixing them with rule breaks makes the whole list easier to
dismiss.

Feed findings back a few at a time rather than as one dump. The fixes are
iterative and the user paces them.
