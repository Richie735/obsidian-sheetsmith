---
name: design-review
description: "Use when reviewing how a feature looks and behaves, after it works. Reviews the rendered harness against docs/UI.md and the feature's spec. Requires looking at the UI, not reading CSS."
argument-hint: "[feature name, or path to its docs/features file]"
allowed-tools: Read, Glob, Grep, Bash
---

Review appearance and usability. **Feature:** $ARGUMENTS

Read `docs/UI.md` and the feature's `docs/features/<slug>.md` before starting.

Two reference files in this skill's folder carry the standards `UI.md` states as
rules but does not put numbers on. Read the one the change touches, before
judging it. Each ends with a measured record of where this codebase already
stands, so a review does not re-litigate settled ground.

- **`reference/motion.md`**, for a transition, a gesture, or anything that
  moves: frequency, easing, duration, interruptibility, how a gesture should
  respond, and the vocabulary for saying precisely what is wrong.
- **`reference/legibility.md`**, for a colour, a mark that carries state, a
  control's size, or grid placement: whether colour is carrying meaning alone,
  the contrast ratios and how to measure them off the theme variables, the type
  size floor, hit targets and the gap beside them, and reading order against
  visual order.

They live in the repository rather than as installed skills on purpose: a clone
on another machine has to review by the same standard, and a delegation to
something machine-local would fail with no sign rather than with an error.

## You must look at it

```bash
npm run harness:calibrate   # once per Obsidian version
npm run harness             # build
npm run harness:shot        # writes harness/shots/*.png
```

Then **read the PNGs**. They are the review. `harness/shots/` holds both themes,
both screens, the narrow reflow, the larger text size, and the empty and error
states.

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

**What `reference/legibility.md` adds to that sweep**, when the change touches a
colour, a mark, a control's size or grid placement: does any state differ only
by fill strength, with no glyph or shape behind it; does text on a mixed fill
clear 4.5:1 in *both* themes; does a derived size land under 10px; does
`sheet-large-text` truncate more, reorder the hierarchy, or overflow; does a
stacked control's gap stay wider than its hit target reaches; does tab order
still walk the sheet in the order the eye does once it has reflowed.

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
