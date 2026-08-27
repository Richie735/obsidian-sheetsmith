# UI conventions

How a Sheetsmith sheet looks and behaves. Read this when designing a component
and when reviewing one; `docs/PATTERNS.md` covers the code side, `SPEC.md`
covers what the plugin does.

Markers match `PATTERNS.md`: **[checked]** fails the build, **[warned]** is a
lint warning that does not, **[judgement]** is a default with a reason.

The design reviewer should look at the **harness** (`npm run harness`) rather
than at CSS. Reviewing appearance by reading a stylesheet describes what the
code should look like, not what it does.

The harness renders all three screens: the sheet, the layout editor pane, and
the settings tab. The editor is where most of a sheet is actually configured, so
it gets the same scrutiny as the cards. The sheet and the editor are joined
(`Surface → Both`), so saving in the editor re-renders the sheet and a config
field can be judged by what it does to the card rather than by its label alone.
The settings tab is two preferences and a button, and is reviewed for whether
its rows still sit in Obsidian's own rhythm.

---

## 1. The plugin has no colours of its own

**Never write a literal colour** [judgement, should be checked]. Not a hex, not
an `rgb()`, not a named colour. There are zero in 322 selectors today and that
number should stay zero.

Every colour comes from an Obsidian theme variable, so a sheet inherits whatever
theme the user runs:

- text: `--text-normal`, `--text-muted`, `--text-faint`, `--text-accent`,
  `--text-error`, `--text-on-accent`
- background: `--background-primary`, `--background-primary-alt`,
  `--background-secondary`
- state: `--background-modifier-hover`, `--background-modifier-active-hover`,
  `--background-modifier-border`, `--background-modifier-error`
- accent: `--interactive-accent`, `--interactive-accent-hover`

Sizing, spacing, radii and fonts come from the same place: `--size-4-*`,
`--size-2-*`, `--radius-s|m|l`, `--font-ui-*`, `--font-smallest`,
`--font-monospace`, `--icon-s`, `--layer-popover`.

### Deriving a colour safely

Blend with `color-mix(in srgb, ...)` against `--background-primary`, never with
opacity on the element. The graded level fill is the model:

```css
background-color: color-mix(
	in srgb,
	var(--interactive-accent) calc(var(--sheetsmith-level, 1) * 100%),
	var(--background-primary)
);
```

Text placed on such a blend uses `--text-normal`, which is defined against
`--background-primary`, the same colour the blend is mixed with, so it holds in
a light theme and a dark one alike. That reasoning is the rule: **pick the text
variable defined against whatever you mixed into**.

---

## 2. The `.sheetsmith-view` scope rule

Every rule styling a form control on a sheet must be scoped under
`.sheetsmith-view` [checked: `styles.test.ts`].

Obsidian styles `input[type='text']` at specificity (0,1,1). A bare class is
(0,1,0) and loses, so every declaration taking chrome off an input is dropped
with no warning and the field keeps its form-control look and its small font.
This is invisible in review precisely when it matters most: a component that paints its
own border never reveals the loss. Pool shipped that way once.

`styles.test.ts` is the guard. If you add a field class, it is covered
automatically by the `-input` / `-current` / `-select` naming; a control named
outside that pattern needs the test widened. A `<select>` is the same case as an
input and was the third spelling: Obsidian's bare `select` rule sets a height, a
background, a shadow and a font size, so a card's value drawn as a menu reverts
to a form control the moment one of ours loses to it.

---

## 3. Sheetsmith's own knobs

The plugin's tunables are custom properties declared on `body`, prefixed
`--sheetsmith-`, each carrying the reason it holds that value. They exist to be
overridden from a user CSS snippet.

Publish one **when a second component has to line up with the first**. The
comment on `--sheetsmith-card-abbr-space` states the test: re-deriving
`1.2 × 0.85 × --font-ui-smaller` somewhere else would drift the moment either
constant moved.

A knob is public API once shipped. Renaming it breaks someone's snippet.

---

## 4. Space, and how the sheet reflows

- **A component fills its grid placement** (`SPEC` §8). A card placed two
  columns wide occupies two columns. Card set's opt-in `fixed` sizing is the
  single exception.
- **The sheet fills the pane.** A sheet is a dashboard, not prose, so nothing
  holds it at reading width. `--sheetsmith-sheet-max-width` gives reading width back
  to anyone who wants it.
- **Reflow uses a container query, never a media query** [judgement]. A narrow
  split in a wide window must reflow too, and a media query cannot see that.
  `.sheetsmith-view` sets `container-type: inline-size`; the grid collapses to a
  column under 480px of *container* width.
- **A container is its own reflow context** (`SPEC` §8). A Group four columns
  wide inside a wide pane is narrow even though the sheet is not, so
  `.sheetsmith-subgrid` carries `container-type` and the grid inside it collapses
  on its own width. **One rule, not one number: 40px a column**, which is the
  sheet's own 480px across twelve columns. Twelve columns still collapse at
  480px; four collapse at 160px.
- **A threshold calibrated for one column count is not one rule.** This bullet
  used to say the container answered the sheet's 480px, and defended it as one
  threshold rather than two. It was one number applied to twelve questions, and
  the spread was 7x: a container collapsed while its columns were still 236px
  wide at two columns, and was allowed down to 32.7px at twelve. A two-column
  container could not place two children side by side at any pane width up to
  2400px, and a four-column one flipped between stacked and side-by-side across
  1489px, which reads as broken rather than as responsive. Recorded because the
  reasoning was the failure, not the number: whenever a threshold is reused at a
  different scale, check what it means there before reusing it.
- **A container also follows the sheet down.** Two conditions, because they
  answer two questions: "are my own columns too narrow" and "has the sheet given
  up being a grid". The second cannot be derived from the first — once the sheet
  is one column each component has the whole pane, so a two-column container is
  221px on a 1400px pane where it must keep its grid and 348px on a 380px pane
  where it must not. **The narrow case is the wider one**, so no threshold on a
  container's own width can separate them. `.sheetsmith-view` carries
  `container-name: sheetsmith-sheet` and the inner grids query it by name.
- **A rule a container query cannot compute is tabulated, not approximated.** A
  query can neither multiply nor read a custom property, and
  `repeat(auto-fit, minmax(…))` renumbers the columns and breaks explicit
  placement — so the view stamps the column count as a class and `sheet.css`
  writes the formula out once per count. `styles.test.ts` holds every entry to
  the rule, so a table cannot drift off the thing it tabulates.
- **Media queries are for user preference and device capability only**:
  `prefers-reduced-motion`, `forced-colors`, pointer coarseness. Never for space.
- **Cascade order is load-bearing.** `@container` adds no specificity, so an
  override must sit *below* the rule it overrides. An equal selector placed
  above it simply loses.

---

## 5. Type

- **Relative units for anything that should follow the vault's text-size
  setting** [judgement]. The card's headline number is `1.75em`, not a pixel
  size, so the card scales with the user's setting.
- `--font-ui-small` / `--font-ui-smaller` for secondary and tertiary text;
  `--font-smallest` below that.
- **`font-variant-numeric: tabular-nums` on every number that changes.** A value
  that reflows while stepping reads as movement the user did not ask for.
- Secondary text, an abbreviation under a stat name or a gloss beside a row, is
  one style: sized down, tracked, faint. Reuse it rather than inventing a
  second quiet style.

---

## 6. Accessibility is part of the control

Not a pass afterwards. Each of these is already load-bearing somewhere in the
sheet.

- **Forced-colors mode discards `box-shadow`.** A focus ring drawn as a
  box-shadow carries a transparent `outline` companion, invisible in an ordinary
  theme and repainted as a real ring wherever the browser drops shadows:
  ```css
  box-shadow: 0 0 0 2px var(--interactive-accent);
  outline: 2px solid transparent;
  ```
  Prefer an outline outright where the offset allows it.
- **One focus treatment per component.** The same gesture in the same component
  must not produce two different rings.
- **`prefers-reduced-motion: reduce` removes transitions**, and every animated
  rule needs the companion block.
- **`.sheetsmith-sr-only`** carries text for assistive tech only.
- **`aria-label` replaces a name; `title` adds to one.** A control whose text is
  on screen keeps that text as its accessible name, and anything supplementary —
  where a link goes, what a glyph is called — rides in `title`. An `aria-label`
  there announces a word that appears nowhere in the control, which fails WCAG
  2.5.3 and leaves voice control nothing to match. An aliased wikilink in a cell
  was the case that taught this: it copied Obsidian's own markup, which puts the
  link target in `aria-label`. `aria-label` is for a control whose visible mark is
  *not* words — a ring, a glyph button — which is the next rule.
- **State goes in ARIA, not only in paint.** `aria-pressed` on a two-state mark;
  `aria-label` composed from the label and the state name the layout author
  chose, since "Stowed" says more than "not pressed".
- **Announce what is not visible.** A commit or an Escape-restore that changes
  nothing on screen is announced.
- **A mark whose state is only a fill strength has one channel.** Filled against
  empty is a shape difference and carries itself; two marked levels differing
  only by how far the mix went do not. `paintLevelRing` is the model, and its
  comment says so: the ramp "costs nothing, because the glyph and the name were
  already carrying the exact answer." A new mark either has that second channel
  or the review says what a reader sees without it.

The numbers these rules are judged against, and the way to measure them, are in
`.claude/skills/design-review/reference/legibility.md`: contrast ratios by text
size, the 10px type floor, hit target sizes with the gap rule beside them, and
reading order against visual order. §1's "pick the text variable defined against
whatever you mixed into" is the rule; that file is what shows whether a given
case obeys it.

---

## 7. Touch

- **A finger has no hover and no pixel to aim at.** Hit targets are the card,
  not the mark: a ring is 1.6em, and a card answering only on the ring reads as
  dead everywhere else.
- **Focus on `pointerdown`, commit on `click`.** A tap cannot preview what it is
  about to hit, so focus moves while the finger is down; committing on release
  is what lets a mis-aimed press slide off and be taken back.
- Never a hover-only affordance. Anything reachable by hover is reachable
  another way.
- **Where focus is not an outcome, the press has to produce one** [judgement]. A
  card routes a press to the control nearest it, which on a field is the whole
  edit gesture — a caret, and a keyboard on a phone — and on a `<select>` is a
  ring on a desktop and nothing at all under a finger. So a card's menu opens on
  that press (`showPicker()`, falling back to focus), or the card's own hit target
  answers with silence. The measurement is the argument: a menu's box is as wide
  as the chosen option, so the same card gives a field 432x29 and a menu 28x29
  with nothing stored, and neither grows under a coarse pointer.

---

## 8. Motion

Movement is judged by frequency first. A character sheet is a control panel: the
same rings, pools and tracks are pressed dozens of times in a session, so
anything that animates on every press puts a wait in front of every press, and
the sheet gets slower to use the longer the session runs. **Restraint here is the correct answer, not a lack of ambition.**

The sheet also lives inside someone's notes and should not behave more
energetically than the app around it.

- **Motion earns its place by doing a job** [judgement]: showing state changed,
  keeping the reader oriented, softening a jump, confirming a press landed.
  Anything touched every few seconds gets feedback, not animation.
- **Transitions, never `@keyframes`** [judgement]. A transition can be
  interrupted and retargeted mid-flight; a keyframe animation restarts from
  zero. Everything here is repeatable and reversible, so everything is a
  transition. The plugin currently has zero `@keyframes` and that is worth
  keeping.
- **Never `ease-in`.** It delays the instant the user is watching.
- **Motion stays under 300ms.** A colour or opacity fade is not motion and may
  run longer when it is deliberately slow.
- **Prefer `transform` and `opacity`.** Animating `width` or `height` costs
  layout and paint, so it needs a reason stated in a comment. The pool fill and
  the track response both animate `width` and both carry that reason.
- **Gesture values are grabbable at any instant** and continue from where they
  are, rather than snapping to a start.

The tuned constants in `src/interaction/`, covering projection deceleration,
throw decay, scrub resistance, the hold ramp and the velocity window, are
decisions taken against the real control, with the argument in the code beside
them. Treat them
as settled unless a specific failure is observed.

The full standards, and the vocabulary for describing motion precisely, are in
`.claude/skills/design-review/reference/motion.md`.

---

## 9. The shared vocabulary

New components reuse these rather than inventing a lookalike. A fourth kind of
panel beside a row of cards reads as loose chrome floating on the page.

The card is shared vocabulary *and* a component name, which SPEC §2 settles:
a Card is the component that is nothing but one card, a Card set is a strip of
them, and Pool borrows the look. Reusing the card is still the rule — the name
belongs to the component that is only that, not to whoever renders one.

| Thing | Where | Used by |
| --- | --- | --- |
| The card | `.sheetsmith-card`, `.sheetsmith-card-single` | Card, Card set, Pool |
| A heading over a region | `.sheetsmith-group-heading` | Group, Tab set |
| A component's own name | `.sheetsmith-component-label` | the card face, Pool, Track, Rich text, Image |
| A strip of alternatives over a region | `.sheetsmith-tabset-strip` | Tab set's tabs |
| The level ring | `paintLevelRing`, `.sheetsmith-level-ring` | Table's `level` and `toggle` columns, Track's flag, the editor's level sample |
| The editing gesture | `editable.ts` | every stored value on a sheet |
| Secondary text | `.sheetsmith-card-abbreviation` | Card set |
| Inline error | `.sheetsmith-error` | every component's own failure |
| Arm, then commit | `.sheetsmith-table-remove-button` | Table's row delete |
| A total under a table | `tfoot` + `.sheetsmith-table-value` | Table's column totals |
| A control in the row position | `.sheetsmith-table-add` | Table's add row |
| Rendered text over its own field | `.sheetsmith-table-linked`, `.sheetsmith-rich-text-box`, `.sheetsmith-image-box`; `ui/spellcheck.ts` | Table's wikilinks, Rich text's prose, Image's reference |
| Text with its wikilinks as links | `components/linked-text.ts` | Table's cells; Rich text's fallback, **and the anchors the app's own renderer drew** — the module both paints anchors and adopts them, because the press and the hover are the same policy either way |
| A box sized by its placement | `.sheetsmith-placed`, `.sheetsmith-placed-box` | Rich text, Image |
| Reveal on hover, only when clipped | `ui/truncation.ts` | The card's label, Table's links |
| A choice from a closed list | a native `<select>`; `.sheetsmith-card-select`, `.sheetsmith-table-select` | Card's options, Table's `level` column set to a select |

**An irreversible control arms before it fires** [judgement]. The first press
takes a warning tint, marks what it would take, and names it; the second
applies it. §12's rule from the pool's typed amount is the reason: where a
control's input is not its outcome, the outcome has to be on screen before it is
applied, and an irreversible outcome is the strongest case of it. The shared
confirmation is also not available to reach for — `ConfirmModal` takes an `App`
and `RenderContext` carries no route to one, so a component's only confirmation
surface is the card itself. **The
next press anywhere else stands it down**, along with Escape, focus leaving the
control, and arming another one; all of them leave the file exactly as it was.
The outside press is the load-bearing one, and it is §7 again: a finger has no
gesture for moving focus away, and a tap does not focus a button, so a control
disarmed only by `blur` is a two-step gesture that becomes one step on touch.
`popover.ts` makes the same dismissal for the same reason.

**Rendered text and the field that edits it are stacked, never swapped**
[judgement]. Both sit in one grid cell: the field stays in the DOM and in the tab
order in both states, which is what keeps the view's focus restoration counting
the same controls across a rebuild, and neither child changes size on focus, so
nothing reflows under a pointer already resting on the cell. Unfocused, the
display layer is opaque over a field whose own text is transparent, and only the
links inside it take a press. A cell with nothing to render gets none of it,
which is what keeps an eighteen-row card the DOM it always had.

**A prose block refuses one line, and shows the draft while it does.** `## ` at
the start of a line is the note's own section delimiter, so Rich text declines to
commit a draft holding one and draws `.sheetsmith-error` under its box naming the
line and the fix. The state needs a rule of its own because of the row above: the
field's text is transparent unfocused, so a refusal left alone would put the
*stored* prose back on screen with an error under it and the reader's actual words
invisible. `.sheetsmith-rich-text-refused` undoes both halves together — the layer
stays hidden as it is on focus, and the field keeps its colour — so what is on
screen is the text the message is about. Focus is not taken back, deliberately:
refocusing on blur is the other way to keep the draft visible and it steals the
pointer from wherever the reader just clicked.

**Which layer answers the press is per component, and only the cell falls
through.** A table cell's layer is `pointer-events: none`, so a click reaches the
field and the browser puts the caret where it landed — one line, nothing to
scroll, and the landing position is meaningful because both layers hold that line
in the same shape. Neither other consumer can copy it. **Rich text's layer is a
scrollport**, and a scrollport that is not a hit target never receives a wheel:
the spelling shipped, and the gesture went to the invisible field behind it, which
scrolled 150px in a real browser while the visible prose stayed at 0. That layer
now routes the press itself, and `styles.test.ts` forbids the declaration by name.
**Image's field is the inert one instead** — it is a single line stretched across
the middle of a portrait, so the frame under it owns the press and a click near the
top of the picture reaches the frame rather than dying on the field. So the rule
this row shares is the stacking and the tab order, not the hit testing.

**Transparent is not invisible, so the field's spellcheck follows its focus.**
`color: transparent` suppresses the glyph fill and nothing else: the engine
paints the spelling marker as decoration, independently of the colour the text is
drawn in, so an unfocused field's squiggles come through the layer above it —
under words the reader can see, positioned by the source line the word sits on
rather than by where the rendered word ended up, and left behind when the two
layers scroll separately. `ui/spellcheck.ts` is what all three call. It is the
one part of hiding the field that CSS cannot do, and the two ways of hiding it
harder are both ruled out by rules above: `visibility: hidden` takes the field
out of the tab order, and `opacity: 0` takes the placeholder, which is
deliberately the one part of an unfocused field that shows through.

**The same arrangement at block scale is Rich text's, with three stated
departures** [judgement]. A cell and a prose box share the rule above and differ
in three mechanical ways, each with its reason, because a shared gesture is only
shared if the differences are written down. **The rendered layer is hidden rather
than left transparent**: a cell's two layers hold one line in one shape and can
overlap, while a block's hold one text in two — a rendered heading is not the
height of its source line — and two differently-shaped copies of one text
overlaid are unreadable. **The caret is not moved**, for the same reason: a point
in the rendered view is not the same character in the source, so there is no
landing position to preserve and pretending otherwise puts the caret confidently
in the wrong place. **The box never changes size, but its scroll extent does** —
the rule above holds where it was written, since the placement is fixed and
nothing on the sheet moves. The two layers are separately scrolled because one
offset shared between two shapes puts them out of step, and **the reader's place
is not carried across**: this once said a focused field "scrolls to its caret,
which is what the reader asked for by clicking", and the departure above is
precisely that there is no such caret. §12 holds the row.

**A component's box is never sized by its content** [checked: `styles.test.ts`].
Rich text is where this first bit, and it is `SPEC` §8's "a component fills its
placement" read for a component whose content has no natural height. The prior
art is four issues over four years on the closest analogue — a prose block with
no vertical size, at zero height, squished, or absent — and the oldest states the
defect exactly: it "grows according to its content which does not allow to
control its position in the sheet in a stable way". Three CSS facts hold it and
each answers a different one of those four: a `min-height` from the placement, so
the row is sized by the layout and cannot collapse; `overflow-y: auto` **on the
layers rather than on the box**, so the text scrolls rather than escaping and each
layer scrolls on its own; and both layers out of flow, so nothing inside
contributes intrinsic height and the floor cannot be pushed past. None is visible
in a unit test, which is why all three are scanned rather than trusted.

**The row height in that `min-height` is a measured number, not a derivation, and
it is a floor rather than a height.** `--sheetsmith-grid-row` is `4.75em`
(`tokens.css`), and the block's floor is `--sheetsmith-rows` × that. The grid
genuinely has no row height to derive from — the sheet's rows are content-sized —
so what a placed box actually gets is `max(the row's own height, 4.75em × rows)`,
and `SPEC` §8's "`height` grid rows tall whatever is in it" is that, approximated.
`em` rather than pixels so it follows the vault's text size the way a card's
headline does.

**Why the approximation is safe is the direction it can be wrong in.** Where a
card in the same grid row is taller, the row grows and a placed box fills it —
both measured at 178px — so the two cannot drift apart upward; the number decides
only the minimum height of a row nothing else makes taller. There is also no
second copy to drift *from*: a card's height is emergent from its padding, its
label and its value size and is written down nowhere, so deriving this in `calc()`
would invent a coupling rather than remove one, and changing a card's padding
would then resize every backstory on the sheet. **And it survives nesting**,
which is the case the floor could plausibly have got wrong: a Group and a Tab set
each holding a Rich text and an Image render them at matching heights in
Obsidian's own shots. Named for the grid rather than for either component, which
is the correction Image forced — it was `--sheetsmith-rich-text-row` while prose
was the only consumer, and raising it to give backstories more room would silently
have resized every portrait on the sheet.

**The box is one thing and not two, and naming only the number is how it nearly
was not.** This table's row for it used to name `--sheetsmith-rows` ×
`--sheetsmith-grid-row`, which is the arithmetic and not the object — and while
that was all it named, both components wrote the *rule* out in full: fourteen
identical declarations in two copies, including the coarse-pointer and
high-contrast blocks. That is `PATTERNS.md` §1's `roundSum` mistake exactly, "a
policy shared and its application duplicated", and the drift it allowed was
silent: change the surface's radius for a portrait and prose keeps the old one,
with no type, lint or test reporting it. One class each for the component and its
surface, and what a component keeps is only what it does *inside* the box — which
is the one thing the two do not share. The guard moved with the risk: the
stylesheet is checked for what the shared rule says and for nobody writing it out
again, and each component's own test checks that it asks for the class.

**Image is the same rule on the harder case, and it is where the token got its
name.** A picture *has* an intrinsic size, so the failure is not a box that
collapses but a box sized by the *file* — a character's note deciding a box the
layout author placed. The answer is identical: the picture is out of flow and the
block takes its floor from `--sheetsmith-rows` × `--sheetsmith-grid-row`. The
token was `--sheetsmith-rich-text-row` while prose was the only consumer, and a
reader raising it to give backstories more room would silently have resized every
portrait; it is named for the grid because that is whose fact it is. Duplicating
the number instead is what `PATTERNS.md` §1's one-step tier refuses outright.

**A picture fits its box and is never stretched to fill it** [checked:
`styles.test.ts`]. `object-fit: contain`, bounded in both directions, with the
slack left as the frame's own surface. The convergent prior art is width-and-height
where two dimensions may distort, so a stretched picture is exactly what a reviewer
would mistake for correct — and a still cannot show it unless the sample happens to
have the wrong aspect ratio for its box, which is why the harness draws the *same
file* in a wide box and a tall one and puts a circle in it.

**Content the app or the vault renders into a sheet inherits the reader's theme
and snippets** [judgement], and that is correct rather than a defect — the same
bargain this section records for a borrowed class name. The plugin styles the box,
not what is drawn in it. What it does own is the element: a picture carries
`.sheetsmith-image-picture` rather than being a bare `<img>`, so this plugin's own
`object-fit` is stated rather than hoped for. The caution is a real report, open and
unanswered elsewhere: an image whose *filename* ended in `-portrait` rendered
cropped while the same file renamed displayed whole, which is a filename-keyed rule
in the reporter's own theme reaching an element that had nothing of its own to say.

**Borrowing one of Obsidian's class names buys the name, not the styling**
[checked: `styles.test.ts`]. Every `.internal-link` rule in `app.css` is scoped to
`.markdown-rendered` or `.metadata-property-value`, and the editor's unresolved
marker to `.markdown-source-view.mod-cm6`. A sheet is none of those, so an anchor
in a cell gets the bare `a` rule — colour, underline, pointer — and no state
styling at all: a link to a note that does not exist looked exactly like one to a
note that does. So a state class on a borrowed element is styled here, under the
view scope, from the app's own documented variables. And give the ones that carry
the meaning a fallback: an undefined custom property makes `color` invalid at
computed-value time, which computes to `inherit`, so a missing variable paints a
link in the cell's own text colour and it stops reading as a link at all.

**One control, two classes, where the same element is not the same object on the
page** [judgement]. The row above names the `<select>` twice on purpose. A cell's
select is `--font-ui-small` in a row of cells; a card's value is the card's
headline size, bold and centred, and drops into a small pill when a `derived`
takes the headline — so a shared class would have to mean two sizes, and a native
select needs no gesture module, so there is nothing else to share. This is what
`.sheetsmith-card-input` and a table cell's field already are: one gesture
(`editable.ts`), two classes, two sets of clothes. It is not the lookalike this
section opens against — that is a *fourth kind of panel* beside a row of cards,
and two selects at two sizes are the card and the cell agreeing about what a menu
is. What they do share is the reason both have to carry the view scope (§2):
Obsidian's bare `select` rule sets a height, a background, a shadow and a font
size, and `styles.test.ts` covers the `-select` naming for it.

The delete glyph is deliberately **not** a shared class. It borrows the level
ring's measurements through `--sheetsmith-table-control`, because two glyph
buttons in one table row must not measure differently under the same finger, and
that number is the whole of the agreement: two consumers earn duplication, not a
module (`PATTERNS.md` §1). This table gains a class when a third appears.

**A component's own name is one rank, and the table above had no row for it until
it had five copies** [checked: `styles.test.ts`]. Uppercase, tracked, muted,
`--font-ui-smaller`: quiet enough that the value under it is what the eye lands
on, and distinct from the row above it, which is a name over a *region of other
components*. The card face, Pool, Track, Rich text and Image each wrote the nine
declarations out in full, because the agreement was recorded in each file's
comment — "on the pool's and the track's rank" — rather than in a name, and a
comment is not something the next component can reuse. Four were byte-identical
and the fifth declared the same properties in a different order, which is why a
review counting copies found four: the fifth was found by checking for the *rank*
rather than for the text of a rule.

**What did not move is each component's own narrow-card override**, and that is
the interesting half. Three of the five tighten the tracking on a narrow card and
they do not agree on the threshold — 130px for a card's label against 160px for a
pool's — because the two are not the same width. The other two *cannot*: the card
face, Pool and Track set `container-type` on their own card, so a container query
asks about the card, while a Rich text block establishes none and the same query
inside one resolves against the sheet and fires essentially never. So a shared
rank does not mean a shared reflow, the overrides stay with the components that
have a container to ask, and each has to sit after the shared rule in the cascade
to win. **Two things at two different tiers, in one place, is what the single copy
was hiding.**

Note which half is *tested* and why, because it is not symmetry. The stylesheet is
checked for declaring the rank exactly once; whether each component asks for it is
not, while the placed box's equivalent is. The difference is what failure looks
like: a box that forgot its class has no height and may be subtly wrong, and a name
that forgot its class renders in the body font and is obviously wrong the first
time anyone looks at it. `§11` is the check for the second kind.

**One hairline under a container's chrome, whichever container drew it**
[judgement]. A Group's heading carries the rule; a Tab set's strip carries the
same rule in the same place, and `.sheetsmith-tabset > .sheetsmith-group-heading`
zeroes the heading's own so the two never stack. A tab set drew both at first —
a rule under its name and a second under its strip, ~37px apart — and beside a
group of the same declared size it read as a heavier, more built-up object, which
is this section's opening sentence one level up. The heading class is shared for
the same reason the painter below is: two headings of the same rank must not
measure differently.

**When a card and a cell do the same job, they share the painter** [judgement].
A single-level mark on a card and the same mark in a table cell must go through
`paintLevelRing` rather than a lookalike, precisely so one flag cannot measure
differently from the other under the same finger. Track's flag is the card half:
a run of one segment is two states, so it draws the ring and not a segment, and
`docs/features/palette-entries-and-flags.md` carries the argument. **The class is
named for the painter and not for a caller**, which is why it is
`.sheetsmith-level-ring` rather than the table it used to be spelled after — a
Track card carrying a class called `table` is a name a reader would believe
(`PATTERNS.md` §1). The ring's expanded hit target rides on that class rather
than on a table cell, and the price is on whoever stacks rings: a checklist has
to keep its rows further apart than the target reaches, or the later ring wins
the press. Track's `.sheetsmith-track-flags` row-gap and the editor's
`.sheetsmith-level-sample` gap are the same arithmetic for the same reason.

**A settings row whose description grows puts it below the controls, never beside
the name** [judgement]. Obsidian draws a setting row as one centred flex line, so
copy in the info column widens it until the control column wraps — and what wraps
is the control the author is about to reach for. The layout editor's **Add
component** row is where this first bit: its description is empty for a bare type
and three lines for a palette entry, so choosing an entry dropped the destination
dropdown and **Add** about 35px while the menu they were chosen from kept the
first line. `.sheetsmith-add-row` is the answer — `descEl` appended after the
controls and given `flex-basis: 100%` — so the first line's height is fixed
whatever is selected and the copy grows downward into space nothing is placed in.

**Moved rather than reserved**, which was the open half of this question. Reserving
a line of description height shows as a gap under every row whose copy happens to
be empty, and it has to be as deep as the longest copy to be worth anything;
clamping to one line with the rest in a `title` hides text that is often the only
explanation a field gets (`PATTERNS.md` §8). One consumer today, so this is a class
rather than a row in the table above — the second settings row with growing copy
reuses it rather than inventing a second answer, which is this section's opening
sentence applied to the editor rather than to a card.

---

## 10. Failure appears in place

A misconfigured component renders `.sheetsmith-error` into its own container and
nothing else. The rest of the sheet stays live and editable (`SPEC` §10). There
is no global error state, and a broken component never blanks the page.

Error text names the fix: `"max: 'con' is not defined on this sheet"`, not
`"could not resolve"`.

---

## 11. Reviewing appearance

Run `npm run harness`. Check each of these, because none is visible in code.

**The sheet:**

- both themes, light and dark
- narrow container: does the grid actually collapse, and does anything overflow
- a component at 1, 2 and 3 grid columns wide: does it fill its placement
- numbers mid-step: do they jitter, or hold on tabular figures
- focus: visible on every interactive element, one treatment per component.
  `&focus=<css selector>` focuses one, so this is photographable rather than
  taken on trust — the sheet styles `:focus` and not `:focus-visible`, so a
  programmatic focus paints what a tab press paints
- an error state and an empty state, not only the populated one
- a larger text size (`Text → 24`, or `sheet-large-text.png`): does truncation
  grow, does the hierarchy reorder, does anything collide. §5 rests the card on
  relative units so it follows the vault setting, and that is where the claim is
  either true or not

**A harness that rebuilds on hover cannot review anything a pointer does.** The
fake link context redrew the sheet on a preview, so the element under the pointer
was replaced mid-gesture: a press landed on one anchor and released on its
replacement, the click never dispatched, and a tooltip revealed on hover vanished
with the element that had it. The app rebuilds on an edit and never on a preview,
so every one of those failures was the instrument's. Anything the harness does in
response to a gesture updates in place.

**An approximation in the harness for something the plugin should own is worse
than no approximation.** The unresolved-link colour was written into
`harness/theme.css` first, so the harness showed the two link states as different
shades while the app showed them identical — the instrument was kinder than the
thing, and the review passed. When a stand-in makes a shot look right, check
which stylesheet is doing the work.

Run `npm run harness:calibrate` first. It reads the installed Obsidian's own
`app.css` out of its asar and generates the real theme palette and settings
chrome, so the harness borrows Obsidian's frame instead of approximating it.
Re-run it after an Obsidian update. Without it the harness falls back to the
hand-written approximation in `harness/theme.css` and is close but not exact.

`npm run harness:shot` renders every view to `harness/shots/`, covering both
themes, all three screens, the narrow reflow on each, the larger text size, a
focused control, forced colors, a pane with a fold in it, and the empty and error
states of both the sheet and the editor — a vault with no layouts, and a layout
file that will not parse — so a review can look at PNGs rather than clicking
through.

**Every shot but two lets the surface grow past the window**, so what it captures
is the whole surface laid out flat rather than one screen. That is the right
default — a review that has to scroll for its findings misses them — and its cost
is that nothing about scrolling, clipping, or what falls below the fold is in any
of them. `&bounded` on any view gives the leaf the window's own height instead —
a query rather than a button, because the bar had no room for a seventh group
without wrapping and costing every 1400 shot 38px. `editor-bounded` and
`editor-threshold` are the two that take it. What it still cannot show is a
*scrolled* pane: a still has no scroll position, so a panel that scrolls out of
the leaf when a row low in the tree is selected is visible by pressing, never by
looking.

**The layout editor pane** (`Surface → Editor`, or `Both` for it beside a sheet):

- does a new config field read as a setting, or as a form field dumped in a list
- is its description a consequence, or a restatement of its label (§8 of
  `PATTERNS.md`)
- do the list-shaped fields for rows, columns, entries and triggers stay
  legible once they hold ten entries rather than two
- does the grid preview agree with what the sheet actually renders
- does the tree read as the layout's table of contents, with nothing between a
  container's row and the rows of what it holds
- do the two columns still hold at the threshold, and does the stacked order
  read as schematic, tree, panel — `editor-light` and `editor-stacked` bracket
  the number on purpose, and `editor-threshold` is the split at its narrowest,
  where the panel is under the width its fields are known at
- how much of the pane arrives in one screen, and what falls below the fold —
  `editor-bounded`, the one editor view given a real leaf height. The leaf's
  bottom edge has to be *in* the picture, with both columns clipping on it: two
  scrollers rather than one is the whole of what the split promises, and a chain
  with an auto height anywhere in it draws a crop of a grown pane that looks
  much the same
- what happens to the sheet when the field changes: `Both` shows it live

---

## 12. Backlog

Where the code does not yet match this file. These are findings, not licences:
new work follows the sections above. A row leaves when it is fixed. A backlog
that keeps solved rows stops being read.

| Gap | Where | Fix |
| --- | --- | --- |
| Focus cannot be put back onto content the app has not finished rendering | `view/cell-focus.ts`, `components/rich-text.ts` | `restoreFocus` identifies a control by its index among `FOCUSABLE` inside its cell, and a Rich text block drawn by the app's own renderer holds *fewer* controls at restore time than at capture time: `MarkdownRenderer.render` is asynchronous, so the rendered layer is empty for a microtask while its anchors were tabbable when focus was captured. Reachable by Shift-Tab backwards out of an edited field in the component after a prose block — the layer is tabbable whenever its field is not focused, so focus lands on the block's last anchor, and that same Shift-Tab commits and rebuilds the sheet. **The loss is fixed and the miss is not.** A past-the-end index now lands on the cell's last control, so focus stays inside the component instead of falling to the body, which is the outcome `PATTERNS.md` §5 records as the reason not to repaint a cell optimistically; `cell-focus.test.ts` drives it. What remains is that the reader wanted the anchor and gets the block's field, and **no identity scheme fixes that** — the anchor does not exist yet, so matching on `data-href` finds nothing that matching on an index did not. The cure is for the restore to wait until every render started by the pass has landed, which is a change to the view's render loop and costs a focus jump on every rebuild whether or not any block is drawing. Invisible in the harness by construction: the fallback painter is synchronous and its anchors are there, which is why this is a row rather than a look criterion. **Waiting on:** a second component that draws asynchronously, or evidence that the miss is felt — one more Shift-Tab currently resumes where the reader was going. |
| An unlabelled example reads as the field's value | `editor/trigger-list-field.ts`, `editor/function-library-field.ts`, `editor/layout-editor.ts` | Each renders a bare `<code>` under its description with no framing word, while the textarea's own `setPlaceholder` already carries a *different* example in the idiomatic place. In the harness sample the function library's visible example is byte-identical to the saved value, so the field reads as though the value were printed twice, and the triggers field shows "Short rest" both as the example and as a real entry. Frame it with "For example: …", or drop it and let the placeholder do the work. |
| The stat note clips mid-word | `.sheetsmith-card-note-input` | No `text-overflow`, so at a 620px container "chain mail, shield" renders as "chain mail, sl": a hard cut with room to spare inside the pill, which reads as damaged data rather than as truncation. Five other rules in `sheet.css` already set `text-overflow: ellipsis`, and the card label directly above it correctly shows "ARMOUR C…". Set it here too, since it applies to an unfocused input, and carry the full value in `title`. **Image's reference field is a second instance and it is worse**, because that field's text is *transparent* when unfocused rather than merely clipped: at a two-column placement it holds about 26 characters, `![[Sildar Hallwinter.png]]` fills it exactly, and a real vault path — `Assets/Portraits/Sildar Hallwinter.png` — cannot be read at all without focusing and arrowing through it. **And the blocker is shared, which is why neither is a one-liner:** the answer this table names for a clipped value is `ui/truncation.ts`, and `revealWhenTruncated` reads `el.textContent`, which is the empty string on a form control. So the fix for both is to teach that module a control's `value`, on the same argument its own header already makes for reading the element rather than a string passed in — one change, two rows. |
| A value the file already holds is never marked as wrong | `editor/list-fields.ts`, `editor/layout-editor.ts` | Every inline error in the editor fires from a `change` handler, so validation happens to what is typed and never to what is loaded. A layout arriving with a value its component refuses — a row key that is not a name, a totalled column key with a space in it, a duplicate row label — draws a field that looks perfectly normal beside a card rendered entirely as an error, and a layout file is a thing people hand-edit and share, so arriving invalid is its ordinary way of being wrong. Visible now that `state=broken` reaches the editor pane. The fix is to run each list field's own rule over its stored value as it renders and seed `context.errors` from it, which is the same rule in the same place rather than a second copy of it. |
| A flag outlives the control that sets it | `editor/list-fields.ts` | **Show a total** and **Publish per row** are offered only on the column types that can carry them, but changing a column's type leaves the flag where it was. Tick either on a number column, switch it to text, and the layout still holds it while the checkbox that would clear it is gone: the card renders a configuration error and the form offers no way out of it except guessing that the type has to go back. The total's own message even says "or turn the total off", naming a control that is no longer on screen. Either clear a flag the new type cannot carry, or keep offering the control while the flag is set. Found reviewing publication, which inherited the behaviour rather than introduced it. |
| No view renders `prefers-contrast: more`, for any component | `harness/shot.mjs`, `styles/sheet.css` | The stylesheet carries several `prefers-contrast: more` blocks — the card's border, the abbreviation, the unresolved glyph, a dropdown's chevron — and not one of them has ever been looked at. The reduced-motion block is photographed because Chrome takes `--force-prefers-reduced-motion` on the command line. **`forced-colors` turned out to have one too — `--force-high-contrast` — and `editor-forced-colors` now uses it**, which is how the editor pane's selected row was found to have no mark at all in that mode. `prefers-contrast: more` still has none: the two obvious guesses do nothing (`--force-prefers-contrast` renders a byte-identical PNG), so this row is now about that feature alone. It is reachable only through the DevTools protocol's `Emulation.setEmulatedMedia`, which means driving a browser rather than screenshotting a page — and `shot.mjs` opens with the reason it does not: the harness is a static page and a screenshot of it is not worth a hundred megabytes of `node_modules`. So these blocks are read rather than seen, and a mark that is *only* legible because of one would look fine in every shot the review has. **Waiting on:** a reason to drive a browser at all — the same fixture a hover or a press would need, which `docs/UI.md` §11 already says a still cannot capture. |
| An error card renders without its component name | `components/card.ts`, `view/sheet-view.ts` | The view prefixes a failed `read` with the component's label, so a broken card says "Armour class: …". A failure raised in `render` instead — a Card with an unusable key and no stored value yet — carries no prefix, and the error replaces the whole card including its heading, so nothing on screen says which component failed. The same misconfiguration is labelled or not depending on whether the note happens to have a body for it. **A dropdown card is the first component that takes the bare path unconditionally**, and the first to draw it in the harness at all: an options list that will not configure is not a reason `read` can fail — a card with two options sharing a value parses its note perfectly well — so the guard is `render`'s alone, and `sheet-error.png` now shows a prefixed table error directly above a card error naming nothing. On a sheet holding three dropdowns, nothing on screen says which one to open. Fix it in the view, which already composes the prefix, rather than in each component, or the labelled path ends up saying it twice — and note what that costs, since it is why this is still a row: the view can only prefix what it is handed, and a render-time guard draws into the cell itself, so the fix is a contract member the view asks *before* rendering rather than a change inside any component. **The second half of this row arrived with Image and is now closed, by that component rather than by the member.** It had three failure paths in *two shapes*: a `render` failure in the frame under the label, and a failed `read` that never reaches `render` at all, arriving as a bare prefixed box with no frame and no label row. What settled it was not the aesthetics but a user report — **a failed `read` leaves no field, so an Image whose body it refused could not be edited back**, and Image is the first component whose own editing gesture can produce such a body (type a web address into the field and blur). The reader was locked out of a value they had entered one second ago, with the message telling them to do something they could not do from where they stood. So Image's `read` no longer fails at all: a body it cannot use is still a body it can hold, the field draws it, and `render` puts the reason in the frame. All four failures land in one place, and the component prefixes its own message where it drew no heading — which it can do without saying it twice, precisely because the view no longer composes a prefix for it. **The general row stands** for every component whose read failure comes from a hand-edited note, and it is still the member that fixes those. |
| A wide table with few columns clips its first and last while a middle one takes the slack | `components/table.ts`, `.sheetsmith-table` | Measured on the Features sample at 1400px and 12 grid columns: three columns — Feature, Source, Notes — and the middle one spans roughly x=130 to x=1230 while the row name truncates to "Fey Ance…" and every Notes cell clips ("advantage agair", "once per short r"). So text is being cut with about 500px of that row empty. **Not `secondary`, and not the palette entry that found it**: rendering the identical sample with `secondary` off gives a pixel-identical layout, so this is how a table distributes width whenever it has few columns and plenty of it, and the Features prefill is only the first sample shaped to show it. Truncation itself is intended — §9's reveal-on-hover row — and the defect is the distribution, not the ellipsis. Not diagnosed further here: the fix is a column-width rule for a table that has more room than columns, which is a design question about which column should absorb slack (the name, the last, or all of them evenly) and not a one-line change. Visible in the default `sheet-light` shot since the sample grew. |
| `hideLabel` puts a component out of line with its labelled siblings | `components/group.ts`, `components/image.ts`, `components/rich-text.ts` | **Three components now, and the newest instance is the legible one.** Measured on a row of six Image frames: the unlabelled one's box top sits at +0px within its cell where all five labelled ones sit at +19px, and it is 19px taller — 228px against 209px. The empty view is plainer still, five identical `![[Portrait.png]]` placeholders with one of them on a different line, and two copies of the *same file* eight pixels apart vertically. A row of frames side by side says this far louder than the group case does, which is the argument for the row's priority rather than for a different fix: everything below is unchanged and still governs. Measured: two sibling groups on one inner grid row, one labelled and one not, put their first cards 39px apart — exactly the heading's height. In the harness sample "Tool bonus" floats a whole heading above "Attack bonus". `card-face.ts` already answers this exact question for cards in a row, and its answer is the shape of the problem: `reserveAbbreviation` keeps an empty slot "so cards in a row share a baseline. Defaults to true; a lone card has no row to align with, and an empty slot there is just a gap." So reserving is right beside a labelled sibling and wrong for a group standing alone, and a group cannot tell which it is — the three fixes are always reserve (a gap over a lone group), never reserve (today), or let something that knows the row decide, which means a config key or a new `RenderContext` member for one appearance case. **Not the same call as two headings in one row putting their hairlines at the same height**: there both are a heading the author asked for, so differing heights were unambiguously wrong, where here the author asked for no heading and the space arguably should differ. Left as a design decision rather than picked here. The sample keeps the mixed pair on purpose, so the cost of the flag is on screen, and the Image row now keeps a second one for the same reason — `symbol` is unlabelled beside five labelled frames. **The same three fixes and the same blocker reach all three components**: a component cannot tell whether it has a labelled sibling on its row, only something that knows the row can, so this stays a design decision rather than a component's bug. **Worse once stacked**: at 380px every level is one column, so an unlabelled group's cards follow the previous sibling's with nothing between them and read as that sibling's — a heading is the only thing that says a new region starts here, and `hideLabel` removes it. Whatever fixes the baseline should answer this too. |
| No fenced component's read error is drawn except one | `harness/samples.ts` | `brokenSamples()` breaks *config* — a key, a column, a row, a child — so until a review found it, no section holding something its component cannot parse had ever been rendered, for Card, Card set, Pool or Track. That is the state a hand-edited note actually arrives in, and the state whose text §10 says has to name the fix; the flag's said "not a number of marks" on a card that writes yes and no, and nothing on screen would have shown it. Track's flag now carries a broken body and the error is in `sheet-error.png`. The rest are not, because which breakage is worth a picture is a choice per component — a malformed fence, a duplicate key, a value of the wrong kind — and four of those judgements do not belong in the diff that found the first. Whoever adds the next one needs only an id and a body: the mechanism is there. |
| A disabled control looks exactly like an enabled one | `editor/layout-editor.ts`, `styles/editor.css` | The tab-order arrows are the first control in the plugin to call `setDisabled` on an icon button — the ↑ on the first tab and the ↓ on the last. Obsidian's own CSS carries `is-disabled` rules for `.setting-item.mod-action` and `.checkbox-container` and none for `.clickable-icon`, and the plugin styles no disabled state at all, so all six arrows render identically in the harness. Behaviour is right either way: the buttons carry `disabled` and `moveItem` refuses an out-of-range move, which a test asserts. What is missing is the paint, and UI §6's rule read backwards — state in the DOM that never reaches the paint is half a control. Not fixed here because the smaller half of the fix is four lines of `editor.css` and the larger half is a question this pass should not answer alone: the plugin's three *other* reorder controls never disable their ends at all, relying on the same range guard, so styling this one makes it the odd one out and styling all four is a change to controls this feature never touched. Found only because a missing stub glyph was fixed and the control became reviewable for the first time. |
| A nested component's placement is edited against a grid the pane never draws | `editor/layout-editor.ts` | Select a card inside a container — `open=weapon_bonus`, two levels in — and the panel offers **col 1, row 1, width 2, height 1** while the only schematic on screen is the sheet's twelve-column grid, which does not contain that card. No block anywhere carries the selected mark, because `renderContainerSchematic` draws a grid only when the *selected* entry is itself a container that places children. So the two ways to work on a nested component are mutually exclusive: select its parent and the grid appears with the card as a draggable block, but the panel then configures the parent; select the card and the four numbers appear with no grid that they address. Four editable fields pointing at something off screen is worse than the settings tab's version of the same gap, where the form at least sat under the row it belonged to. The fix is to draw the *parent's* grid when the selection has one, with the selected child marked — which is a third schematic case and a question about what the left column shows when the selection is three levels deep, so it is a slice rather than a patch. **Waiting on:** a decision about whether the left column follows the selection or the container. |
| The harness bar splits a group across two rows | `harness/index.html`, `harness/theme.css` | The bar is `flex-wrap: wrap` over sixteen buttons and five bare `<strong>` labels, with nothing tying a label to the buttons it names and nothing keeping a group's buttons together — so wherever it wraps, a group can break, and it can break in the middle. Measured at 1000px, which is the `settings-light` and `settings-dark` frame: row one ends with **Surface**, **Sheet**, **Editor** and **Settings**, and **Both** drops to row two on its own, ahead of **State**. Pre-existing and unchanged by the `&bounded` work: `index.html` is byte-identical to the commit before it, and the bar measures 85px in two rows there either way. Not fixed because the fix is markup — a group element per label-and-buttons, `white-space: nowrap` — and **the bar is not free**: it is `flex-wrap`, so anything that changes its wrapping changes its height, and its height comes off every shot at every width where it rewraps. Two buttons added to it once already put it on two rows at 1400 and took 38px off four default views. So this is a change to shared chrome that has to be re-measured at every default width, which is its own pass. **Waiting on:** nothing but that. |
| A bad drag is marked by border colour alone, so forced colors shows none of it | `styles/editor.css` | `.sheetsmith-preview-overlap` recolours the border and the text to `--text-error`, and `.sheetsmith-preview-clamped` recolours `border-right-color` — and forced-colors mode repaints every border on the page one system colour, so both marks land on top of the thing they are trying to differ from. Exactly the failure the *selected* block had, found in the same pass and fixed there with a wider outline at a different offset. **Not fixed here because neither state can be looked at.** Both exist only during a pointer drag, `harness/shot.mjs` opens with why there is no browser to drive one, and writing a forced-colors treatment nobody can photograph is the "read rather than seen" bargain the `prefers-contrast` row above already refuses. `clamped` is also not a copy of the block's fix: it marks *one edge* to say which side stopped growing, and an outline has no one-edge form, so what a single-edge mark becomes in a mode with no border colours is a design question rather than a second application of an answer already given. **Waiting on:** the same fixture a hover or a press would need, which is what the `prefers-contrast` row is waiting on too — take them together. |
| The layout editor pane has no narrow regime, and does not fit below about 470px | `styles/editor.css`, `editor/layout-editor.ts` | The pane's reflow rule stacks its two columns below 1176px and says nothing about anything narrower, so a pane in a sidebar or on a phone overflows horizontally — which in a leaf is a scrollbar dragging the tree and the panel sideways, not only the schematic. Seen in `editor-narrow`: the picker's delete icon is clipped, the schematic runs off the right, and the panel's `height` field is off-screen entirely. **Two independent contributors, each confirmed by hiding the other.** The `.setting-item` rows do not stack, and stacking them the way Obsidian stacks a settings row on mobile removes that half — verified with a throwaway override. The schematic's twelve-column grid overflows on its own with every row hidden. **Why it was never seen:** no editor shot went below 1190, and in a settings tab these same rows sat inside `.vertical-tab-content` where Obsidian's own narrow-settings CSS reaches them; a leaf never receives it, and `harness/calibrate.mjs` carries an at-rule only for the modes a shot can be *taken* in — `forced-colors` and `prefers-reduced-motion` — so the harness has none of Obsidian's width queries either and cannot say what the tab did. Not fixed here because only the first half is contained: the second is a design question the spec never asked — whether a twelve-column schematic at phone width shrinks to ~29px tracks, scrolls inside its own box, or is not drawn — and the stacking threshold has to be derived rather than borrowed, which is the failure §4 records. **Waiting on:** that decision, which is adjacent to the M4 canvas since it is about what a grid is for when it cannot be read. |

| Entering edit mode on a Rich text block loses the reader's place | `components/rich-text.ts`, `.sheetsmith-rich-text-box` | The two layers are separate scrollports — they hold the same text in two different shapes, so one shared offset would put them out of step — and nothing carries the offset across. Scroll a long backstory to paragraph twelve, click, and the field opens at paragraph one. **The alarming half is fixed and the gap is what is left.** The field used to open at its *last* line: assigning `value` moves the text entry cursor to the end, and focusing scrolls it into view — measured in Chrome at `scrollTop` 2062 of a possible 2062, on a forty-paragraph block. `setSelectionRange(0, 0)` after the assignment makes the landing a chosen position instead of an inherited one, and `rich-text.test.ts` drives it. What remains is that the chosen position is not the reader's. Carrying the offset over is a proportional map on focus and would be a few lines, **but only honest if the caret moves with it**: a reader looking at paragraph twelve whose keystrokes land in paragraph forty is worse off than one who can see where they are, and the caret is currently at the start by the same decision above. That pairing reverses departure 2 in `rich-text.ts` — the caret is deliberately *not* placed from the click, because a point in the rendered view is not a character in the source — so the fix is a design decision rather than a patch, and it was declined when offered. Invisible in the harness by construction: a still cannot show a scroll position before and after a focus. **Waiting on:** evidence that the jump is felt on a backstory long enough to scroll, which is the one length the sample does not have.

Add a row when a review finds a gap it is not fixing in the same pass.
