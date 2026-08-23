# UI conventions

How a Sheetsmith sheet looks and behaves. Read this when designing a component
and when reviewing one; `docs/PATTERNS.md` covers the code side, `SPEC.md`
covers what the plugin does.

Markers match `PATTERNS.md`: **[checked]** fails the build, **[warned]** is a
lint warning that does not, **[judgement]** is a default with a reason.

The design reviewer should look at the **harness** (`npm run harness`) rather
than at CSS. Reviewing appearance by reading a stylesheet describes what the
code should look like, not what it does.

The harness renders **both** screens: the sheet, and the settings tab holding
the layout editor. The editor is where most of a sheet is actually configured,
so it gets the same scrutiny as the cards. The two are joined, so saving in the
editor re-renders the sheet and a config field can be judged by what it does to
the card rather than by its label alone.

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
automatically by the `-input` / `-current` naming; a control named outside that
pattern needs the test widened.

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
  columns wide occupies two columns. Stat group's opt-in `fixed` sizing is the
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

| Thing | Where | Used by |
| --- | --- | --- |
| The card | `.sheetsmith-stat`, `.sheetsmith-stat-single` | Stat, Stat group, Pool |
| A heading over a region | `.sheetsmith-group-heading` | Group, Tab set |
| A strip of alternatives over a region | `.sheetsmith-tabset-strip` | Tab set's tabs |
| The level ring | `paintLevelRing`, `.sheetsmith-level-ring` | Table's `level` and `toggle` columns, Track's flag, the editor's level sample |
| The editing gesture | `editable.ts` | every stored value on a sheet |
| Secondary text | `.sheetsmith-stat-abbreviation` | Stat group |
| Inline error | `.sheetsmith-error` | every component's own failure |
| Arm, then commit | `.sheetsmith-table-remove-button` | Table's row delete |
| A total under a table | `tfoot` + `.sheetsmith-table-value` | Table's column totals |
| A control in the row position | `.sheetsmith-table-add` | Table's add row |
| Rendered text over its own field | `.sheetsmith-table-linked` | Table's wikilinks |
| Reveal on hover, only when clipped | `ui/truncation.ts` | Stat card's label, Table's links |

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
links inside it take a press — everything else falls through to the field, so a
click still puts the caret where it landed. A cell with nothing to render gets
none of it, which is what keeps an eighteen-row card the DOM it always had.

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

The delete glyph is deliberately **not** a shared class. It borrows the level
ring's measurements through `--sheetsmith-table-control`, because two glyph
buttons in one table row must not measure differently under the same finger, and
that number is the whole of the agreement: two consumers earn duplication, not a
module (`PATTERNS.md` §1). This table gains a class when a third appears.

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
- focus: visible on every interactive element, one treatment per component
- an error state and an empty state, not only the populated one

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
themes, both screens, the narrow reflow, and the empty and error states, so a
review can look at PNGs rather than clicking through.

**The settings tab** (`Surface → Settings`, or `Both` for the two side by side):

- does a new config field read as a setting, or as a form field dumped in a list
- is its description a consequence, or a restatement of its label (§8 of
  `PATTERNS.md`)
- do the list-shaped fields for rows, columns, attributes and triggers stay
  legible once they hold ten entries rather than two
- does the grid preview agree with what the sheet actually renders
- what happens to the sheet when the field changes: `Both` shows it live

---

## 12. Backlog

Where the code does not yet match this file. These are findings, not licences:
new work follows the sections above. A row leaves when it is fixed. A backlog
that keeps solved rows stops being read.

| Gap | Where | Fix |
| --- | --- | --- |
| An unlabelled example reads as the field's value | `editor/trigger-list-field.ts`, `editor/function-library-field.ts`, `editor/layout-editor.ts` | Each renders a bare `<code>` under its description with no framing word, while the textarea's own `setPlaceholder` already carries a *different* example in the idiomatic place. In the harness sample the function library's visible example is byte-identical to the saved value, so the field reads as though the value were printed twice, and the triggers field shows "Short rest" both as the example and as a real entry. Frame it with "For example: …", or drop it and let the placeholder do the work. |
| The stat note clips mid-word | `.sheetsmith-stat-note-input` | No `text-overflow`, so at a 620px container "chain mail, shield" renders as "chain mail, sl": a hard cut with room to spare inside the pill, which reads as damaged data rather than as truncation. Five other rules in `sheet.css` already set `text-overflow: ellipsis`, and the card label directly above it correctly shows "ARMOUR C…". Set it here too, since it applies to an unfocused input, and carry the full value in `title`. |
| A value the file already holds is never marked as wrong | `editor/list-fields.ts`, `editor/layout-editor.ts` | Every inline error in the editor fires from a `change` handler, so validation happens to what is typed and never to what is loaded. A layout arriving with a value its component refuses — a row key that is not a name, a totalled column key with a space in it, a duplicate row label — draws a field that looks perfectly normal beside a card rendered entirely as an error, and a layout file is a thing people hand-edit and share, so arriving invalid is its ordinary way of being wrong. Visible now that `state=broken` reaches the settings tab. The fix is to run each list field's own rule over its stored value as it renders and seed `context.errors` from it, which is the same rule in the same place rather than a second copy of it. |
| A flag outlives the control that sets it | `editor/list-fields.ts` | **Show a total** and **Publish per row** are offered only on the column types that can carry them, but changing a column's type leaves the flag where it was. Tick either on a number column, switch it to text, and the layout still holds it while the checkbox that would clear it is gone: the card renders a configuration error and the form offers no way out of it except guessing that the type has to go back. The total's own message even says "or turn the total off", naming a control that is no longer on screen. Either clear a flag the new type cannot carry, or keep offering the control while the flag is set. Found reviewing publication, which inherited the behaviour rather than introduced it. |
| An error card renders without its component name | `components/stat.ts`, `view/sheet-view.ts` | The view prefixes a failed `read` with the component's label, so a broken card says "Armour class: …". A failure raised in `render` instead — a Stat with an unusable key and no stored value yet — carries no prefix, and the error replaces the whole card including its heading, so nothing on screen says which component failed. The same misconfiguration is labelled or not depending on whether the note happens to have a body for it, which is visible in `sheet-error.png` with the two cards side by side. Fix it in the view, which already composes the prefix, rather than in each component, or the labelled path ends up saying it twice. |
| `hideLabel` drops a group's children a heading's height below its siblings' | `components/group.ts`, `.sheetsmith-group-heading` | Measured: two sibling groups on one inner grid row, one labelled and one not, put their first cards 39px apart — exactly the heading's height. In the harness sample "Tool bonus" floats a whole heading above "Attack bonus". `stat-card.ts` already answers this exact question for cards in a row, and its answer is the shape of the problem: `reserveAbbreviation` keeps an empty slot "so cards in a row share a baseline. Defaults to true; a lone card has no row to align with, and an empty slot there is just a gap." So reserving is right beside a labelled sibling and wrong for a group standing alone, and a group cannot tell which it is — the three fixes are always reserve (a gap over a lone group), never reserve (today), or let something that knows the row decide, which means a config key or a new `RenderContext` member for one appearance case. **Not the same call as two headings in one row putting their hairlines at the same height**: there both are a heading the author asked for, so differing heights were unambiguously wrong, where here the author asked for no heading and the space arguably should differ. Left as a design decision rather than picked here. The sample keeps the mixed pair on purpose, so the cost of the flag is on screen. **Worse once stacked**: at 380px every level is one column, so an unlabelled group's cards follow the previous sibling's with nothing between them and read as that sibling's — a heading is the only thing that says a new region starts here, and `hideLabel` removes it. Whatever fixes the baseline should answer this too. |
| An open container's form sits between it and its children | `editor/layout-editor.ts` | A form goes directly under the row it belongs to, which is what every component's does, so opening a container puts its whole form — around 500px for a Group with a schematic in it — between its row and the indented rows of what it holds. The disclosure relationship is furthest apart exactly when the container is being worked on. The indent chain itself is sound: measured, the row and its form share a left edge, and at one level in the form's first field sits within 3px of its row's name, so the accent bracket reads as continuous. Not reordered, because each way out costs more than it buys — children above the form inverts the convention every other component follows, the form after the whole subtree puts it further from its own row, and nesting the child rows inside the form would put a child's edit and remove controls inside its parent's configuration. Deferred to the M4 workspace view, which replaces this form entirely (`SPEC` §12) and is where a tree-shaped editor gets designed rather than patched. |

| No fenced component's read error is drawn except one | `harness/samples.ts` | `brokenSamples()` breaks *config* — a key, a column, a row, a child — so until a review found it, no section holding something its component cannot parse had ever been rendered, for Stat, Stat group, Pool or Track. That is the state a hand-edited note actually arrives in, and the state whose text §10 says has to name the fix; the flag's said "not a number of marks" on a card that writes yes and no, and nothing on screen would have shown it. Track's flag now carries a broken body and the error is in `sheet-error.png`. The rest are not, because which breakage is worth a picture is a choice per component — a malformed fence, a duplicate key, a value of the wrong kind — and four of those judgements do not belong in the diff that found the first. Whoever adds the next one needs only an id and a body: the mechanism is there. |
| A disabled control looks exactly like an enabled one | `editor/layout-editor.ts`, `styles/editor.css` | The tab-order arrows are the first control in the plugin to call `setDisabled` on an icon button — the ↑ on the first tab and the ↓ on the last. Obsidian's own CSS carries `is-disabled` rules for `.setting-item.mod-action` and `.checkbox-container` and none for `.clickable-icon`, and the plugin styles no disabled state at all, so all six arrows render identically in the harness. Behaviour is right either way: the buttons carry `disabled` and `moveItem` refuses an out-of-range move, which a test asserts. What is missing is the paint, and UI §6's rule read backwards — state in the DOM that never reaches the paint is half a control. Not fixed here because the smaller half of the fix is four lines of `editor.css` and the larger half is a question this pass should not answer alone: the plugin's three *other* reorder controls never disable their ends at all, relying on the same range guard, so styling this one makes it the odd one out and styling all four is a change to controls this feature never touched. Found only because a missing stub glyph was fixed and the control became reviewable for the first time. |

Add a row when a review finds a gap it is not fixing in the same pass.
