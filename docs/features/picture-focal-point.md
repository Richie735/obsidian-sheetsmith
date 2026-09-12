# Picture focal point

Status: draft
Board card: let a reader choose which part of their own picture stays visible
when its frame crops it, since `cover` (`docs/features/picture-fit-and-suggest.md`)
always centres and a centred crop is wrong exactly whenever the interesting
part of a photo — a face, most often — is not in the middle of it.

## Model question

**This is character data, not layout data, and that is the whole of why it did
not ship with `fit`.** A layout's placement and its chosen `fit` are one
decision an author makes once for everyone using that layout. Two players
sharing a "Portrait" placement with `cover` on will each want a different part
of their own photo kept visible, so the value has to live in the character's
own note, in the section the picture already comes from — exactly the test
Constraint 4 and the rest of §3.1 already apply to every other value on a
sheet.

**Neither component's storage has anywhere to put it today, and the two
components are wrong for different reasons.** Image's whole body *is* its
value — one scalar, `parse/markdown-body.ts`'s `bodyText`/`writeBodyText`,
shared with Rich text — so there is no second slot beside the embed for
anything, structured or not. Passport already holds a second thing beside its
embed line, but it is a *declared* fence: every entry in it corresponds to a
layout-authored field or the name key, and `storableFields`/`write` only ever
touch keys the layout named. A focal point is neither — no layout declares it,
and it exists for every picture whether the layout thought of it or not — so
adding it as an undeclared fence entry would make Passport's fence hold two
kinds of thing under one mechanism: values the layout owns and one value the
component owns for itself. That is a distinction nothing else in this fence
has ever had to draw.

**The proposed answer is a third thing beside the embed, one line, shared by
both components rather than invented twice.** An HTML comment immediately
after the embed line —

    ![[Thora.png]]
    <!-- sheetsmith-focus: top-right -->

— which Obsidian's markdown view already renders as nothing, live preview
included, so the note reads exactly as a hand-written one does: a picture,
with an invisible technical marker beside it neither view nor reader has any
reason to touch by hand. It answers the reframing entry's own open sub-question
— "whether Obsidian's plain markdown view would still render the note
sensibly with that value present" — for the reason a comment is the one
markdown construct built to be present and unseen. It is written only where the
focus is not the default (see below), so an untouched note carrying `cover`
with a centred crop stays exactly the single embed line it is today —
Constraint 3 costs nothing here that Passport's own "found, not positioned"
embed line did not already pay.

**One module, not two.** `components/picture-focus.ts` (or `parse/`, if the
line-finding half turns out to want no `obsidian` at all — decided when it is
written) holds the marker's syntax, its read and its write, exactly on
`embed-rule.ts`'s and `fenced-link.ts`'s precedent: a policy two components
share is extracted at the second consumer rather than duplicated, and this
arrives with two from the start. What differs per component is only *where*
the found line sits relative to the rest of the section — directly after
Image's one line, or directly after Passport's embed line and before its fence
— which is the same "found, not positioned" shape `passport.ts`'s
`pictureLine`/`writePictureLine` already implements for the embed itself, one
level in.

**Storage grows for Image, and that is the real cost this document exists to
name plainly.** Image's contract does not change — `scopeValues`, `read`'s
failure shape and `write`'s guarantees are all untouched — but its *storage
kind* effectively becomes "an embed plus an optional marker," which
`parse/markdown-body.ts`'s single-scalar model was never built to hold. Image
gains a small file-shaped structure of its own for the first time since it
moved off fenced storage, and while the shape is small and additive (every
existing note is unaffected, since the marker line is absent from every one of
them), a reader of `image.ts`'s own header — "the section body *is* the embed
the reader would have written anyway" — should know that sentence gains an
asterisk here.

**What is deliberately not proposed: a value a formula can read.** A focal
point says where to look, not what to compute, and nothing about §5's language
gets easier or harder for it existing — it is drawn and never published,
exactly as `hidePicture` and `fit` are config a formula cannot see, except this
one is stored per character rather than authored per layout.

## What it does

Wherever a picture is set to crop (`fit: cover`), a small control on the frame
lets the reader choose which of nine positions — the corners, the edges, or the
centre — stays in view, the way a photo editor's crop tool anchors a crop to a
side rather than always to the middle. Left alone, a picture crops centred,
exactly as it does without this feature.

## Smallest version

Nine fixed positions (three-by-three, `object-position`'s own keyword pairs),
never a freeform drag. One control, shown only while `fit: cover` is in
effect. No effect on `contain` or `stretch`, and no effect on Image's or
Passport's failure or empty states.

## Design

**The value.** One of `top-left`, `top`, `top-right`, `left`, `center`,
`right`, `bottom-left`, `bottom`, `bottom-right`. `center` is the default and
is the value an absent marker line means, so it is never written — the
component reads a missing marker as `center`, exactly as `nameKey`'s own
missing-key fallback works. Mapped straight to CSS: `object-position:
<second word> <first word>` (`top-right` → `right top`), one shared rule in
`sheet.css` rather than nine.

**The control.** Shown only while the resolved `fit` is `cover` — under
`contain` nothing is ever cropped, and under `stretch` there is no slack for a
crop to move inside, so the control would be a live setting with no visible
effect either way, which is worse than absent. A small square icon button in
the frame's corner (the icon-and-popup shape `interaction/modifier-form.ts`
already established for a control that would otherwise crowd a small surface),
opening a nine-cell grid in `ui/anchored-panel.ts`'s existing popup, one button
per position with the current one marked current; a press commits immediately
and closes the popup, matching every other control on a sheet committing on
its own gesture rather than needing a separate confirm. Keyboard: the grid is
nine buttons in a native tab order, arrow keys move between adjacent cells the
way a `radiogroup` already would, Enter or Space commits the focused cell,
Escape closes without changing anything.

**Empty and error states.** An empty frame (no embed) or a refused embed draws
exactly as it does today; the reframe control is part of a *drawn picture* and
does not appear over either, since there is nothing yet to crop.

**What it reuses, by name.** `ui/anchored-panel.ts` for the popup; the
icon-and-popup shape from `interaction/modifier-form.ts`; `object-position`'s
own keyword vocabulary rather than a percentage pair invented here.

## Config fields

None. The focal point is character data with no layout-declared key, on
exactly `fit`'s inverse: `fit` is config a formula and a layout own and every
character shares; a focal point is a value one character owns and no layout
sees.

## Data and file model

Adds one optional line per section, `<!-- sheetsmith-focus: <value> -->`,
placed immediately after the embed line it belongs to (Image's only line;
Passport's, before its fence). Absent wherever the stored focus is `center`,
which includes every note written before this feature exists — Constraint 4
holds by construction, since nothing here removes or rewrites a section a
character already has, and a layout that turns `fit` off leaves a stored
marker line untouched and inert rather than deleting it, on the same rule that
keeps a removed component's old section in place (§10). `read` treats a marker
whose value is not one of the nine positions the way Passport treats a fence
value it cannot parse under its own rules for scalars it does not recognise —
named in the equivalent acceptance criterion once the exact failure shape is
decided against `image.ts`'s existing "a read that cannot fail" rule, since
Image's `read` currently never fails at all and this should not be the value
that changes that.

## Acceptance criteria

*Left unticked, as every spec in this repository is: ticking is a
`/spec-review` finding, not a claim made while drafting.*

- [ ] `components/picture-focus.ts` (or `parse/picture-focus.ts`, decided when
      written) holds the marker's read and write, imported by both `image.ts`
      and `passport.ts`; neither component duplicates the syntax or the
      position vocabulary.
- [ ] A section with no marker line reads as `center`; one with a recognised
      marker reads that position; `write` of `center` removes an existing
      marker line rather than writing one out, and `write` of any other value
      adds or updates the line in place without moving the embed or, for
      Passport, the fence.
- [ ] An unchanged section — marker present or absent — round-trips byte for
      byte (Constraint 3), including a hand-written comment that is not this
      marker's own syntax, which is preserved and never read as a focus.
- [ ] The reframe control appears only while the component's resolved `fit` is
      `cover`, on both Image and Passport; it is absent under `contain`,
      `stretch`, an empty frame, and a refused embed.
- [ ] The nine-position popup opens from the frame's control, marks the
      current position, commits on a press with no separate confirm, and is
      fully operable by keyboard (arrow keys between cells, Enter/Space to
      commit, Escape to close without changing the stored value).
- [ ] Turning a layout's `fit` from `cover` back to `contain` leaves a
      character's stored marker line untouched (Constraint 4's rule applied to
      a component's own config rather than to its removal).
- [ ] `npm run harness:shot` shows a placement cropping off-centre in both
      themes, and the popup open with a non-centre cell marked current.
- [ ] `npm run lint`, `npm test` and `npm run build` pass.
- [ ] `docs/SPEC.md` §4.2's Image and Passport entries gain the marker line and
      the control; §13's reframing line (added by
      `docs/features/picture-fit-and-suggest.md`) is resolved here rather than
      left open a second time. Written by `/land-it`.

## Commit boundaries

1. `feat: Let a character's picture remember where to look`. `picture-focus.ts`,
   its read/write, and its tests, with no rendering yet — Image's and
   Passport's `read`/`write` grow the marker with no visible change.
2. `feat: Let a reader choose the crop`. The frame control, the nine-position
   popup, the `object-position` CSS, and the config-dependent visibility rule.
3. `test: Show a reframed picture in the harness`. The harness sample, the
   shots.
4. `docs: Record the focal point in the catalog`. SPEC §4.2, §13's resolution.

## Deliberately not doing

- **Freeform positioning.** A drag gesture with continuous percentages is the
  richer answer and the harder one — pointer capture, a coordinate system
  relative to the image's own natural size rather than its frame, and a value
  shape (`{x, y}`) the marker-line syntax above would have to grow into. Nine
  fixed positions cover the common case (a face near a corner or an edge) at a
  fraction of the interaction cost; revisit if nine proves not enough on a real
  vault fixture.
- **A live preview while dragging.** Falls away with freeform positioning.
- **Anything published to a formula.** Named above; a focal point is drawn and
  never read by anything else on the sheet.
- **Reframing under `contain` or `stretch`.** Neither ever crops, so neither
  has anything for a focal point to decide.
