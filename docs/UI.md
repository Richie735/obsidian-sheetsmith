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
The settings tab is three preferences and a button, and is reviewed for whether
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

**A surface that cannot be under `.sheetsmith-view` brings its own scope.** The
anchored panel hangs off `document.body`, because the table that opened it
scrolls inside an overflow box that would clip it, so this section's selector
would never match — and a single class was taken to be enough there. It is not,
and the number above is why: `(0,1,0)` loses to `input[type='text']` at (0,1,1)
and to `button:not(.clickable-icon)` at (0,1,1), whose `:not()` argument counts.
Only `select` is the (0,0,1) that a bare class beats. So the panel's controls
went unscoped and half of them silently kept the app's chrome: list lines drew as
raised buttons clamped to `--input-height`, and the arming tint on a destructive
button was discarded. Every rule whose subject is a control in there now reads
`.sheetsmith-panel .sheetsmith-panel-…`, at (0,2,0), and `styles.test.ts` checks
the weight rather than the spelling.

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
- **Only a named level earns a `title`, and a tooltip repeating what is already
  legible is noise** fired at every pass [judgement]. A two-state mark carries
  its state in `aria-pressed` and its name in `aria-label`, so a tooltip has
  nothing left to say, while a *named* level has a word the glyph cannot draw.
  Written down because the third component to draw a ring set `title`
  unconditionally.
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
| The card | `.sheetsmith-card`, `.sheetsmith-card-single` | Card, Card set, Pool, Passport's face |
| A heading over a region | `.sheetsmith-group-heading` | Group, Tab set |
| A component's own name | `.sheetsmith-component-label` | the card face, Pool, Track, Rich text, Image, Record set, Passport — **six consumers**, which is what took it from a comment in each file to a name in this table |
| A strip of alternatives over a region | `.sheetsmith-tabset-strip` | Tab set's tabs |
| The level ring | `paintLevelRing`, `.sheetsmith-level-ring` | Table's `level` and `toggle` columns, Record set's `level` and `toggle` fields, Track's flag, the editor's level sample |
| The editing gesture | `editable.ts` | every stored value on a sheet |
| The focus a transparent field takes | one selector list in `sheet.css` | Table's cells, Rich text's prose, Image's reference, a record's name, its number fields and its body, a Passport's name |
| The hover a transparent field takes | a second selector list beside it | Table's cells, a record's name and its number fields, a Passport's name — **a deliberately different roster from the focus list above**, and each absence is the roster's own definition rather than an exception: Image's field is `pointer-events: none` until its frame hands the press over, Rich text's display layer owns the press so its field never sees a hover, a record's body is a textarea with chrome of its own, and a Passport's *values* left the list when they became tags, because a control with a surface at rest has nothing to reveal. Order is not load-bearing in either list: `:hover` and `:focus` are pseudo-classes, so every selector is (0,3,0) against its base rule's (0,2,0) |
| Secondary text | `.sheetsmith-card-abbreviation` | Card set, a Record set field's name. **Not a Passport's placeholders**, and the near miss is worth the row: they borrowed this rank once and a design review measured a half-filled line carrying two type sizes on one baseline, with the smallest and faintest string on the face holding the *headline* slot. A placeholder takes the field's own size and only `--text-faint` from here, which is what a Card's empty em dash already does |
| Inline error | `.sheetsmith-error` | every component's own failure |
| Arm, then commit | `interaction/arm-to-confirm.ts`; `.sheetsmith-table-remove-button`, `.sheetsmith-record-remove`, `.sheetsmith-panel-remove` | Table's row delete, Record set's record delete, the modifier form's **Remove** (the sentences only) |
| A total under a table | `tfoot` + `.sheetsmith-table-value` | Table's column totals |
| A control in the row position | `.sheetsmith-table-add`, `.sheetsmith-record-add` | Table's add row, Record set's add record — **one treatment**: a rule across the top, a centred label, and the hover surface every control on the sheet uses |
| Rendered text over its own field | `.sheetsmith-table-linked`, `.sheetsmith-rich-text-box`, `.sheetsmith-image-box`, `.sheetsmith-record-linked`, `.sheetsmith-record-body`; `ui/spellcheck.ts` | Table's wikilinks, Rich text's prose, Image's reference, a record's name and its body |
| Text with its wikilinks as links | `components/linked-text.ts` | Table's cells; Rich text's and Record set's fallback, **and the anchors the app's own renderer drew** — the module both paints anchors and adopts them, because the press and the hover are the same policy either way |
| A box sized by its placement | `.sheetsmith-placed`, `.sheetsmith-placed-box` | Rich text, Image, Record set, Passport — the component's own block, and its picture, which takes the *box* alone inside a card rather than the pair |
| A boundary on that box | `.sheetsmith-placed-box`'s own border | all four, always rather than only under a coarse pointer: the fill alone measures 1.04:1 against the page. Inside a Passport's card the same fill measures 1.035:1 the other way — Obsidian's subtle surfaces are calibrated against the page and a card is already tinted — and it reads as belonging to the card, which the even 8px inset is what does |
| Reveal on hover, only when clipped | `ui/truncation.ts` | The card's label, Table's links, a record's name, a Passport's name. **"Its own text" is `value` on an `<input>` and `textContent` everywhere else**, which the fourth consumer forced: a field has no `textContent`, so the first three's spelling would have set the tooltip to the empty string on a clipped field — a reveal that decided there was nothing to reveal. A copy in the caller is forbidden and unguardable, since `scrollWidth` and `clientWidth` are both 0 under happy-dom |
| A problem list under a textarea field | `.sheetsmith-field-problems`, `-problem`, `-problem-line` | the function library, the reset triggers, the bonus types |
| A choice from a closed list | a native `<select>`; `.sheetsmith-card-select`, `.sheetsmith-table-select`, `.sheetsmith-record-select` | Card's options, Table's and Record set's `level` set to a select |
| The one sentence a fenced value says about a wikilink | `components/fenced-link.ts` | Record set's fields, a Passport's name and values. **A row for a *sentence*, on `arm-to-confirm.ts`'s precedent** — that row already carries "(the sentences only)" for the same reason: Obsidian indexes no link inside a code fence, so a component whose values live in one refuses a link at the commit, and the sentence is the whole of what the reader is told. Two copies of it is one design pass away from saying two things, which is what `components/isolation.test.ts` scans for by clause. The two words that differ arrive as arguments, so the module knows that neither a record nor a passport exists: a record has a name and a body to move a link into, and a passport has neither |
| A form anchored to the control that opened it | `ui/anchored-panel.ts`; `.sheetsmith-panel`, `-body`, `-line`, `-fields`, `-field`, `-why`, `-problem` | Table's `modifier` column, Record set's `modifier` field |
| A value read against its ceiling | `.sheetsmith-pool-ceiling`, `-separator`, `-max` | Pool's max, a Record set `number` field whose ceiling the layout declares or the record holds — **one vocabulary**: the value at full contrast, a `/`, and the ceiling muted with tabular figures. A record overrides the size only, since the pool's ceiling qualifies a headline number and a record's a 13px one; where the ceiling is the record's it is a *field* rather than a span, wearing the record's own chrome and this reading |
| A number something has been pushed at | `.sheetsmith-modified`; `components/modifier-breakdown.ts` | Card's and Card set's `derived`, Table's computed cell |
| A control that is nothing but a glyph | `.sheetsmith-table-modifier-cell`, `-glyph`, `-button`; `.sheetsmith-record-modifier`, `-glyph` | Table's `modifier` column, Record set's `modifier` field |
| A disclosure that opens a block in place | `.sheetsmith-record-disclosure`, `.sheetsmith-record-body` | Record set's records |
| A record's summary line | `.sheetsmith-record`, `-summary`, `-name`, `-fields`, `-field` | Record set |
| A picture in a box, and every reason there is none | `components/picture-frame.ts`; `.sheetsmith-image-frame`, `.sheetsmith-image-picture`, `.sheetsmith-image-input` | Image, Passport. **The classes are spelled `sheetsmith-image-*` and are passed *into* the painter**, `linked-text.ts`'s own arrangement, because a module beside the components must not know that an image exists — so this row is the only record that the two agree on them, and without it the agreement lives in a comment, which is how `.sheetsmith-component-label` bred to six copies. The painter draws the frame, the field stacked over it, the press that hands the field over with its text selected, and all four failure states; what a caller keeps is the box and the chrome around it, which is the one thing the two do not share |
| A tag | Obsidian's `--tag-background`, `--tag-border-color`, `--tag-padding-x`/`-y`, `--tag-weight`, `--tag-decoration` and the `-hover` variants | a Passport's identity values. **Three members of the host's set are deliberately not taken**, each for a measured reason: `--tag-size` is `em`-relative and resolves against a card rather than the sheet's field rank, so it would draw 14px where a cell draws 13px; `--tag-color` measures 3.56:1 on the tag surface over a card against §3's 4.5:1, *and* accent text on a sheet already means **link**, since every anchor `linked-text.ts` paints takes the bare `a` colour; and `--tag-radius` is a full pill, which appeared once in this stylesheet against twenty uses of `--radius-s` — a shape existing nowhere else is the second quiet style §5 forbids. So the corner is `--radius-s`, which is what every *field* takes where `--radius-m` is what every *container* takes. What is borrowed is the tag's surface; the type, the colour and the corner are the plugin's |
| A headline that is also a field | `.sheetsmith-passport-name-input` | a Passport's name. Chromeless at rest so it reads as the headline, revealed by the shared hover and focus lists above, with the empty state as a `::placeholder` at the same size and `--text-faint`. **It carries `-input` in its name deliberately**: that puts it inside `styles.test.ts`'s own `FIELD_CLASS` pattern, so the view scope and the accent focus are both checked without anyone remembering a list — and the scope is not decoration. While the rank sat on a bare class at (0,1,0) it lost its `font-size` to Obsidian's `input[type='text']` at (0,1,1) and a 28px headline drew at **13px**, on the one control whose entire job is to be the largest thing on the card. No gate reported it; a shot did |
| A leaf that is its own reflow context | `container-type` and `container-name` on the component's own block | a Passport. **New vocabulary, and one condition where §4 gives an inner grid two.** §4's two exist because neither derives from the other — once the sheet is one column a two-column container is *wider* than it was — and a leaf's own width separates them, because what decides whether a picture fits beside a name is exactly how much room the face has, and the face has less of it in both cases. Keyed on the sheet alone, a one-column passport on a 1400px sheet never reflowed and drew its picture across the whole card with the name squeezed to nothing. The `container-type` goes on the **block** rather than the face, since a query cannot restyle the element that is itself the container, and it is **named** for `.sheetsmith-view`'s reason one level down: the card inside already establishes an unnamed container, so an unnamed query here would resolve against whichever container happened to be nearest each selector's subject |

**A field with no chrome of its own takes one focus treatment, declared once**
[checked: `styles.test.ts`]. An accent border, the page background, and a
transparent `outline` as the forced-colors escape hatch — four declarations, and
five fields across three components had them written out identically before the
list above existed. §11's own measured threshold for a duplicated rule body is
four declarations and §1 stops arguing at five consumers, so this was past both.
**A selector list rather than a class**, because nothing in any component has to
change for it and the classes already name themselves: the list *is* the roster,
so a sixth field is one line rather than a fifth copy. The card's and the pool's
focus is deliberately not on it — those paint a `box-shadow` ring around a pill
that has its own surface, which is a different treatment for a
differently-shaped control.

**A ceiling is Pool's reading wherever it appears, and a component that grows one
borrows the classes rather than spelling them again** [judgement]. A Record set's
`number` field is the second consumer: `Uses 1` cannot say whether that is all of
them or one of three, so a bounded field reads `Uses 1 / 3`. It overrides exactly one
declaration, the size, because the shared `--font-ui-medium` would draw a 13px
value's ceiling larger than the value. **A `.sheetsmith-record-ceiling` beside the
pool's is what this section opens by forbidding**, and the borrowing is this
section's own rule rather than an exception to it: the name belongs to the component
that is nothing but the thing, and a Pool is a value over its ceiling, exactly as a
card owns the abbreviation a record's field name wears.

**And it takes whichever of Pool's two branches the layout asked for, which is the
clause added rather than a second row.** Where the ceiling is the *field's* — a
literal the layout declared, `maxSource` absent — it is Pool's read-only branch: a
span, no second field, no placeholder. A bare span is `role=generic`, which prohibits
naming, so what carries it to a screen reader is the field's own announcement, "5 of
9", which is how the slash is read aloud. Where the ceiling is the *record's*
(`maxSource: 'record'`) it is Pool's editable branch, drawn on every record whether
or not one is set, with Pool's own `—` placeholder — which is also the only
invitation to type — and, being an input rather than a span, a name of its own beside
the announcement rather than instead of it.

**`.sheetsmith-pool-max-input` is the one class deliberately *not* borrowed, and
that is this section's rule rather than an exception to it.** It is the pool
*card's* field chrome: chromeless, sized in `ch` against the card's value size, with
a hover background and a focus ring of its own. A record's number field already has
chrome, and two fields on one summary line answering a hover two different ways is
exactly the lookalike this section forbids — only here the lookalike would be the
pool's treatment sitting beside the record's. So the editable ceiling wears
`.sheetsmith-record-input` **and** `.sheetsmith-pool-max`: the record's chrome, the
pool's reading. What that costs is one rule putting back the muted colour, a box two
digits wide rather than three, and **no horizontal padding** — which is the
declaration the ruling turns on. A design review measured `Uses 1 / 3` putting 7px
between the slash and its digit where `Level 3 /9` beside it puts 2px, and that 7px
is exactly 2px of the ceiling's own flex gap, which the span pays too, plus 1px of
border and 4px of padding, which only a field pays. Dropping the padding leaves 3px
against the span's 2px. **A field padded like a field cannot read as a span, and
that is the general form**: where a control borrows a reading, the padding is what
gives it away first.

**The box is fixed rather than content-sized**, and the reversal is worth recording
because `field-sizing: content` is the obvious reach and is wrong here. It closes
some of the gap, but the field then grows when a ceiling reaches two digits — so
stepping one from 9 to 10 moves that record's toggles, its computed value and its
modifier glyph 8px right while the reader's finger is on the arrow key. §11 asks
that numbers hold still while they are stepped, and one summary line must not carry
one fixed number field and one elastic one. Left-aligning a two-digit box answers
the gap without buying the movement.

**A disclosure opens a block in place, pushing its siblings inside a box that
does not grow** [judgement]. Record set is the first of these and the rules are
the box's rather than the control's. The prior art picks the direction: the
closest analogue's report is that expanded content "overlaps the +Add and Modify
controls… and/or is buried under the z-order of subsequent repeating items",
written by somebody who wanted the list to drop down instead. **The push is only
safe because the component's box is the placement**: SPEC §8 forbids a component
ceasing to fill its placement and this section's own rule forbids a box sized by
its content, and neither is reached — the box is `--sheetsmith-rows` ×
`--sheetsmith-grid-row` tall whatever is open, the list scrolls inside it, and
opening a record moves the records below it *within the scrollport*. A body
inside that scrollport may be as tall as it is, which is not a violation of the
same rule: that rule is about the *component's* box. **The three surfaces this is
not** are each closed rather than merely unchosen — a modal is unavailable, since
`ConfirmModal` takes an `App` and `RenderContext` carries no route to one; a
drawer is refused on this section's opening sentence, and §12 already records
`ui/anchored-panel.ts` as the largest thing this plugin draws, for which a body
of prose is the worst possible content; and a second editor pane is what SPEC
§4.2 rejected on principle for Rich text.

**What answers the press is the chevron, not the row** [judgement]. A record's
name is a field — it edits on the shared rules and its wikilinks are live — so a
press on the row cannot mean both "put a caret here" and "open this", which is
the two-jobs-on-one-control defect the modifier cell was corrected for. So the
chevron is a glyph-only `<button>` on this section's own rule, with Obsidian's
button chrome stripped, carrying `aria-expanded` and `aria-controls`, opening on
a press and on Enter or Space alike, and taking the level ring's size token so it
measures the same as the marks in the same line under the same finger. **A closed
body is `hidden="until-found"`**, so find-in-page reaches it and a `beforematch`
listener agrees it is open — the one thing Tab set had to give up, available here
because a body contributing no height changes nothing. **Nothing is open on first
render**: a tab set opens its first tab because a tab set showing nothing is a
hole, and a record set showing every name and no body is showing its reading.

**The glyph button now has three consumers and no shared class**, which is the
same position the delete glyph's row records: what they agree on is
`--sheetsmith-inline-control`, the ring's own measurement, so a chevron, a bolt
and a trash in one line cannot measure differently under one finger. The rest —
the resting colour, the hover surface, which state stands down for which — is
each control's own. This table gains a class when the *treatment* is shared
rather than only the number.

**A field holding a list of lines reports its problems under itself, and the
class is named for the field** [judgement]. Three fields in the layout editor
hold a list one-per-line, and all three draw the same inline report: a row per
problem, a quiet locator span where there is one to give, and a count line that
is the only confirmation a working list gets. The classes were
`.sheetsmith-function-problem*` while the function library was the only consumer,
and the third arrival put a class called `function` on a bonus-types field —
which is the name-a-reader-would-believe correction this section already records
for the level ring. **What is deliberately not shared is the field itself**: the
three modules are near copies, and the parts that vary — the layout key, the
parse call's input and result shapes, the problem row's children, the count
sentence, whether a commit redraws — outnumber the skeleton, so one module over
them would be a form-description language. What *is* shared is the two policies
underneath: the class above, and `editor/field-lines.ts`, which names what a line
is (trimmed at both ends for an identifier the file matches on, at the end only
for a line of code).

**A control whose only face is a glyph is a `<button>`, and Obsidian's own button
chrome comes off it** [judgement]. A modifier cell is the first of these: it draws
as one glyph, because a word above it several times its width sets the column's
width against a control that needs none of it, and it manages a *set* — several
modifiers, each with something to say about what it is doing.

**It was a transparent `<select>` stacked over the glyph, and the control kind is
the correction.** A native `<select>` is the right control for choosing one thing
from a closed list and has no shape for "several of these, and here is what each
is doing"; with the popup below carrying that, the select goes and so does the
`opacity: 0` stacking, the `showPicker()` call and the focus ring drawn on a *box*
around an invisible half. What the button costs is one line of CSS discipline and
no new vocabulary: Obsidian styles bare `button` with a background, a radius, a
padding and a shadow, so the rule strips them scoped under `.sheetsmith-view`,
which is §2's own argument read on a new control kind and
`.sheetsmith-table-remove-button`'s own reset copied one column across. The button
takes the level ring's own size token, so a glyph and a ring in the next column
measure the same under the same finger and grow together under a coarse pointer;
the focus ring is on the button, as an `outline`, because that is the one mark
that survives forced-colors mode where a `box-shadow` is discarded — and because
the reset removes `box-shadow`, which is where Obsidian's own ring lives.

**One glyph per row, and the glyph is about the row** [judgement]. A cell holds
every modifier its row applies, so a row may have one applying and another not:
`zap` where any applies, `zap-off` where none does, and a faint `plus` where the
cell is empty. Deliberately **not** a fourth shape for "some" — a partial-state
glyph is a mark most readers meet once and could not name — and deliberately not
one glyph per modifier, which is two answers to one question (below) in the
smallest space available. The count is words: the accessible name says
`2 applying, 1 changing nothing` and the `title` marks the line that is not
applying. The `plus` is at `--text-faint` and steps to `--text-muted` on row hover
and on focus, which is the delete control's own treatment, on the argument that an
empty cell's *state* is the absence of a bolt while the `plus` is an affordance
for the press.

**Its state has exactly one visual channel — the shape — plus the accessible name
for a reader who cannot see it, and the colour is a legibility floor rather than a
channel.** This paragraph said "three channels" and the honest count is one: `zap`
and `zap-off` are now the *same* colour, because a class that was written to dim
the non-applying one declared a value byte-identical to the base rule it was
overriding and therefore never painted anything. So the visual distinction rests
on shape alone. That is legitimate — §1 forbids *colour* alone rather than shape
alone, and the forced-colors shot is the evidence, since that mode repaints the
page in one system palette and the pair survives it — but a rule that counts its
channels wrongly is a rule that will be trusted about the wrong one, so: one
visual channel, and the accessible name carrying it in words on the level ring's
own `${column}: ${state}` shape.

**What the colour still owes is legibility, and that measurement stands.** The
value is `--text-muted`. It was `--text-faint`, on the argument that a different
glyph already carries the fact — and that argument does not survive being looked
at. Measured off the shots, faint is **2.20:1** light and **2.74:1** dark, under
the 3:1 a state mark has to clear and well under the 4.5:1 `legibility.md` §3 asks
of a meaningful glyph; **at 16px the `zap-off` slash is three short strokes, so at
that ratio the whole mark reads as a grey smudge.** The one channel there is is
only a channel while it can be seen, so dimming the shape was subtraction rather
than reinforcement. Muted measures 6.41 and 7.50, and the step is unconditional
rather than behind `prefers-contrast: more`, which §12 records as a query nothing
here can render. Deliberately not `--text-error`: the value resolved perfectly
well and is exactly what the note says, so §4.2's "rendered, not corrected"
governs.

**And this control has one gesture, which is the simplification the panel made
available** [judgement]. It had two, because it had two jobs on one control: a
press opened the picker and a press-and-hold opened the explanation in the shared
popover, through a `claimTouchPress` option added to `bindLongPress` for the one
thing a native `<select>` needs that a level ring does not — the browser opens a
picker on the press itself, so the bubble would open underneath it. The form now
carries the explanation, so there is one job and one gesture: a press opens it, on
a pointer and under a finger alike, and Enter or Space opens it from the keyboard.
`bindLongPress` is back to the two-argument helper the level ring and Track use,
and no modifier cell binds a long press at all.

**A `title` still carries what the row is doing for a pointer, and that is not a
duplicate.** The split is: hover to read, press to change. A reader scanning an
inventory wants to know what row 7 does without pressing anything, and §7's "never
a hover-only affordance" is satisfied because the press works for everyone — the
`title` is the zero-press shortcut a pointer happens to have.

**A form on a cell is this plugin's own anchored panel, and it is the shared
popover's *kind* grown a body** [judgement]. Not a fourth kind of panel: the first
line of this section is about a panel in the page's own flow, sitting beside a row
of cards and reading as chrome, and a transient surface anchored to the control
that opened it, one at a time, dismissed by the next thing the reader does, is
`.sheetsmith-popover`'s kind. So `ui/anchored-panel.ts` extends that regime rather
than inventing a second floating one, and **the placement arithmetic is shared with
`showPopover` rather than copied** — "clamped into the viewport" is one policy, and
two copies of it drifting apart is a visible bug at the one edge nobody
photographs.

**The three cheaper options are closed, and saying which is what stops the next
reader reaching for one.** Obsidian's `Menu` closes on selection and `MenuItem`
takes a title, an icon and a click, so it hosts no controls at all — a target
select, an operator, an amount, a bonus type and a condition cannot live in one. A
`Modal` needs an `App` and `SPEC` §4.2 records that `RenderContext` carries no route
to one. And `showPopover` sets `textContent`, so a bubble admits no per-line styling
and no controls.

**What the panel owes is the four things `Menu` gave free**, and each is a place a
plugin gets a floating surface subtly wrong: placement and clamping, bought back by
sharing the popover's; dismissal on a press outside and on Escape, the popover's
regime with **one departure — a scroll repositions rather than dismissing**, because
a bubble is a thing you read while a form is a thing you are filling in and a table
scrolls inside its own overflow box under the smallest wheel gesture; keyboard
navigation and focus management, **owed** — it carries `role="dialog"` with an
`aria-label` naming the row, focus moves to its first control on open, Tab cycles
within it, and Escape closes it and returns focus to the control, which is the
platform's own contract for a dialog and what makes `aria-haspopup="dialog"` true
rather than decorative; and a phone regime, **owed and read rather than seen**,
since nothing below a 500px viewport has ever been photographed (§12).

**What it holds is a list and one disclosure**, and the state each line carries is
its own words plus its own mark: `zap` / `zap-off` per line, the same mark the
row's glyph draws, so the row's mark and each line's mark are the same mark. A
reason gets a *line of its own* under the line it is about, which is
`.sheetsmith-field-problems`' shape at this surface. **One line opens at a time and
there is no navigation** — a back-stack inside a transient surface would be a second
dismissal regime — and **the panel stays open across every commit**, which is what a
plugin-owned surface buys over the app's menu: the menu closed on select, so
managing several modifiers was one opening each and a swap was two.

**A modified number is marked by a shape, and the mark is one press from what
it is made of** [judgement]. A dotted underline and `cursor: help`, opening the
shared popover — no new gesture (§6, §9), and on touch an ordinary tap, on
`table.ts`'s own argument that a read-only number has no other use for one. The
channel is deliberate: §1 gives the plugin no colours of its own, so the closest
prior art's answer — Sandbox System Builder colours a modified attribute green —
is exactly what may not be drawn here, and `text-decoration` is also the one mark
that survives forced-colors mode. The decoration steps from `--text-faint` to
`--text-muted` under `prefers-contrast: more`, which §12 records as read rather
than seen.

**The breakdown is one popover with several lines, and it needs no markup.**
`showPopover` sets `textContent` and `.sheetsmith-popover` already carries
`white-space: pre-wrap`, so a newline is already a line — and a second kind of
panel beside a row of cards is what this section opens against. What that costs
is per-line styling: a suppressed contributor cannot be drawn faint, so the
parenthetical saying it was not applied carries that instead.

**What it did cost was the bubble's width**, and this is the one rule the
breakdown changed rather than reused. The cap was `20em` — about 34 characters —
chosen when the only payload was a formula, and a breakdown's lines are
sentences: two contributors and a total came out as six wrapped visual lines
with nothing saying where a contributor began. `text-indent` cannot answer it,
because it addresses the first line of a *block* and a newline under `pre-wrap`
starts no block, so a hanging indent leaves exactly one line flush and implies a
hierarchy that is not there. The cap is the answer, set from the longest line
the harness draws and recorded in `shared.css` beside it; a cap is not a width,
so the other two payloads are content-sized as they were and a long formula
merely wraps later. **Below the `100vw` clamp — a phone — the sentences wrap
again and nothing recovers the structure**, which is the honest floor of a
single `textContent` bubble.

**The same text also reaches a reader with no pointer, and the two carriers spell
it differently because the surfaces differ** [judgement]. The number itself is
not a tab stop, so neither carrier can be the number. A card has a field to hang
`aria-describedby` on, so its twin is a `.sheetsmith-sr-only` div the field points
at; a table cell has no field of its own — pointing the row's neighbouring input
at a breakdown would describe the wrong number — and is read as the contents of
its `td`, so its twin is a span *inside* the cell with no ARIA wiring, which is
the idiom a hidden column heading and the delete column's name already use. What
is shared is the text, which is the thing that must not differ, and one builder
owns it. **What neither fixes is the tab stop**: a read-only value display is not
focusable, and making one so would add a stop per modified card and eighteen per
skills card, which is a change to a component's keyboard model rather than to a
mark.

**A contributor line names its contributor with as many of three tokens as carry
information — the component, the row, and the modifier — and the rule is one rule:
a token that carries no information is dropped** [judgement]. Widest scope first,
separated by `·`, then the outcome after an em dash.

- **The component** appears only where the breakdown draws on more than one, and
  then on *every* line of it. The common sheet has one modifier table and reads
  `Bag of Holding — item +2`; two of them, each with a row called "Ring", read
  `Worn items · Ring — item +1`.
- **The row** always appears. It is how a reader finds the thing to untick.
- **The modifier** appears only where the row is not already called by its name.
  An item's row is normally named after the modifier it applies, so the two are
  the same word and printing both would print one word twice — but a cell holds
  *every* modifier its row applies, so a row can apply one it is not named after:
  `Belt of Giant Strength · Bracers of Defence — circumstance +1`, where the row
  alone said a Strength item was giving the reader armour class.

**The component is decided once per breakdown and the modifier per line, and that
is the same rule rather than two.** Dropping the component on some lines would
leave a fact *unrecoverable* — nothing else on an unqualified line says which
component — and would make one line's text depend on another line's spelling.
Dropping the modifier where it equals the row removes a duplicate of a word
already on the line: nothing is missing, and no line depends on any other. So the
granularity follows from what each token would cost, not from a preference.

**One exception, and it is where the rule's premise fails: a breakdown read inside
a component that has rows names its component on every line, however few there
are.** "Carries no information" is true of the breakdown and says nothing about the
reader's *surroundings*. A computed cell in a Skills table drew
`Eyes of the Eagle — item +2` for a contributor living in Magic items, so a reader
read a row name while looking at a list of rows and went hunting for a skill called
that. A card has no rows and so no competing referent, which is why this is the
table's flag rather than a rule for everyone.

**Why the same contributor is spelled differently on a breakdown line and on a
menu line, which is a rule and not an inconsistency** [judgement]. Each surface
drops the token the *reader's own position* already supplies, which is the drop
rule read on the surface instead of on the set of lines:

| Surface | The reader is standing on | So the line reads |
| --- | --- | --- |
| A number's breakdown | the target | component · row · modifier — outcome |
| A row's popup, and its `title` | the row | modifier · target — outcome |

A breakdown line carries no target, because every line of it changes the number
the reader is already looking at; a menu line carries no row, because the reader
pressed that row's own glyph to open it. **What is genuinely one spelling across
all three is the outcome** — `item +2`, `sets to 18` — through one private helper,
which is what stops a row reading "+1" beside a breakdown reading "item +1".
Forcing the identifying half to one shape would put four tokens on every line
where the reader needs two, and the token it added would be the one they are
already looking at.

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
ring's measurements through `--sheetsmith-inline-control`, because two glyph
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
- **hover, which needs a browser being driven rather than pointed at a file.**
  `:hover` matches on the real pointer position and nothing in the page can move
  it, so a `hover:` view in `harness/shot.mjs` opens the headless Chrome it
  already launches over the DevTools Protocol and dispatches a real `mouseMoved`.
  It adds no dependency — `fetch` and Node's own `WebSocket`, the technique
  `harness/inspect.mjs` already uses against the installed app — and a real move
  rather than `CSS.forcePseudoState`, because half of what a hover does here is a
  `pointerenter` handler. Until it existed no hover treatment on a sheet had ever
  been photographed
- **a refusal at the commit**, which is a class of surface no fixture can hold:
  `editable.ts` reports one on *blur*, so the sentence exists only after somebody
  types and looks away. `&type=<selector>|<text>` sets a field and leaves it, and
  it is `&focus=`'s and `&press=`'s third sibling for their reason exactly — a
  wikilink typed into a fence, a `## ` in a prose block, a record left nameless
  and a picture reference that is not an embed are all argued in code and were
  drawn nowhere. A stored body cannot stand in for any of them, because a note
  that already holds the offending value is rendered and carried under SPEC §10
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

Where the code does not yet match this file. The rows moved to
`docs/BACKLOG.md` § UI; that file holds this backlog and `docs/PATTERNS.md`
§11's, a section each. This heading stays because dozens of source comments cite
it as an address. Read and write the rows there. They are findings, not licences:
new work follows the sections above.
