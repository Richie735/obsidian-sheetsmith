# Motion

Standards for judging movement on a sheet. Read when a change touches a
transition, a gesture, or anything that moves.

> Adapted from **emilkowalski/skills** (`review-animations`, `animation-vocabulary`,
> `apple-design`), MIT licensed, Copyright (c) 2026 Emil Kowalski. Permission is
> hereby granted, free of charge, to any person obtaining a copy of this software
> and associated documentation files to deal in the Software without restriction,
> subject to the copyright notice being included. The Software is provided "as is",
> without warranty of any kind.
>
> Adapted rather than copied: the originals target React and Framer Motion, and
> this plugin is vanilla DOM inside a host app with no animation library. Vendored
> into the repository on purpose, so a clone on another machine reviews by the same
> standard (PATTERNS §1).

---

## 1. Should it move at all? Ask this first

Frequency decides. A control used constantly must not celebrate itself.

| How often the user meets it | Decision |
| --- | --- |
| Every few seconds (stepping a pool, cycling a ring, filling a track) | No motion, or motion so small it reads as feedback rather than animation |
| Many times a session (opening a component form, switching layouts) | Reduce hard |
| Occasional (a reset trigger firing, a confirmation) | Standard transition |
| Rare (first render of a sheet) | May carry a little delight |

**This is the rule that matters most here.** A character sheet is a control
panel: the same rings, pools and tracks are hit dozens of times in one session.
Anything that animates on every press puts a wait in front of every press, and
the sheet gets slower to use the longer the session runs. Restraint is not timidity in this project, it is the correct answer.

Valid reasons for motion: showing state changed, keeping the user oriented,
softening a jarring jump, confirming a press landed. "It would look nice" is not
one, on anything touched repeatedly.

Motion also competes with the host. A sheet lives inside someone's notes; it
should not behave more energetically than the app around it.

## 2. Easing

- Entering or leaving → `ease-out`
- Moving or resizing on screen → `ease-in-out`
- Hover and colour → `ease`
- Constant motion → `linear`
- Unsure → `ease-out`

**Never `ease-in` on interface.** It starts slow and delays the exact instant
the user is watching. `ease-out` at 200ms reads as faster than `ease-in` at 200ms.

CSS built-ins are weak. Stronger curves, worth reaching for when a transition
reads as flat:

```css
cubic-bezier(0.23, 1, 0.32, 1)      /* strong ease-out */
cubic-bezier(0.77, 0, 0.175, 1)     /* strong ease-in-out */
```

## 3. Duration

| Thing | Duration |
| --- | --- |
| Press feedback | 100 to 160ms |
| Popover, cell bubble | 125 to 200ms |
| Dropdown, select | 150 to 250ms |
| Modal, confirmation | 200 to 500ms |

**Motion stays under 300ms.** A colour or opacity fade is not motion and may run
longer where it is deliberately slow: judge those on whether the element still
answers the press without a wait, not against this number.

## 4. Physicality

- **Never `scale(0)`.** Start at `0.9` to `0.97` with `opacity: 0`. Nothing real
  appears out of nothing.
- **Scale from the trigger, not the centre**, for anything anchored to a control.
  A cell popover grows out of its cell. Centred modals are the exception.
- **Press feedback** is `transform: scale(0.97)` with a 160ms `ease-out`. Subtle,
  between 0.95 and 0.98.

## 5. Interruptibility

The single most important structural rule.

**CSS transitions can be interrupted and retargeted mid-flight. `@keyframes`
restart from zero.** Anything a user can trigger repeatedly, or reverse, must be
a transition.

The same principle governs gestures: a value being animated has to be grabbable
at any instant, and must continue from where it currently is rather than
snapping to a start.

## 6. Performance

- **Prefer `transform` and `opacity`.** They skip layout and paint. `width`,
  `height`, `padding`, `top` and `left` trigger all three.
- Where another property is animated anyway, it needs a reason in a comment
  saying why the cheap pair could not express it.
- Do not drive children's transforms through a custom property on the parent: it
  restyles every child. Set the transform on the element that moves.

## 7. Gestures

The vocabulary `src/interaction/` implements. Judge a new gesture against it.

- **Velocity, not distance.** A flick should act even if it travelled a short
  way. Compute speed over elapsed time and act on it.
- **Momentum projection.** Animate to where the gesture was going, not to where
  the finger stopped.
- **Damping at the edges.** Past a boundary, movement resists and slows rather
  than hitting an invisible wall.
- **Pointer capture** once a drag starts, so leaving the element does not drop it.
- **Ignore extra touches** after a drag begins, or the value jumps.
- **Reversible mid-motion.** The user changing their mind halfway is a normal
  input, not an edge case.

## 8. Reduced motion

`prefers-reduced-motion: reduce` means **fewer and gentler**, not none. Keep
opacity and colour transitions that aid comprehension. Remove movement and
position change. Every animated rule needs its companion block.

Gate hover-triggered motion behind `@media (hover: hover) and (pointer: fine)`:
touch fires a false hover on tap.

## 9. Words to use in findings

Being precise is the difference between a finding that can be acted on and one
that cannot.

**Entrances**: fade in, slide in, scale in, pop in (with overshoot), reveal.
**Timing**: duration, delay, stagger, orchestration, interpolation, fill mode.
**Transforms**: translate, scale, rotate, transform origin, origin-aware.
**Between states**: crossfade, morph, layout animation, continuity transition,
direction-aware transition, accordion.
**Feel**: interruptible, velocity handoff, momentum, damping, rubber-banding,
settle.

Say "the ring's fill is not origin-aware, it scales from centre instead of from
the mark" rather than "the ring animation feels off".

## 10. Where this codebase already stands

Measured, so a review does not re-litigate settled ground:

- **Zero `@keyframes`.** Every transition in the plugin is interruptible. This is
  the rule most projects fail and this one passes outright.
- **No `ease-in` anywhere.**
- Transitions animate `background-color`, `color`, `opacity` and `width`.
- **The `width` transitions are argued in place.** The pool fill follows a scrub
  1:1 because the property is rewritten every frame, and the track's response
  deliberately refuses a stagger. Both carry their reasoning in a comment.
- **One 400ms transition**, a colour-only fade on an editor mark, explicitly
  "nothing motion-shaped".
- `src/interaction/` holds the tuned gesture constants: projection deceleration,
  throw decay, scrub resistance, hold ramp, velocity window.

**Those constants are decisions, not defaults.** They were tuned against the real
control. Do not propose new values without a specific observed failure, and never
because a general rule suggests a different number.
