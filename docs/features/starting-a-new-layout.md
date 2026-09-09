# Starting a new layout

Status: shipped
Board card: 🧱 Starting a new layout — SPEC §7's **Manage layouts** bullet
promises six operations on the pane's **Layout file** row and has three. Make
creating a layout a visible control rather than a dropdown entry, and let a new
layout start from an existing one. The create half of the bullet: create and
duplicate, with the import that landed on the open 0.2.0 branch folded in
beside them.

## Model question

**None, and §13 gains no entry.** All nineteen live entries were read: they are
about the catalog (a set of runs, a clock face, a card's option source, a
`select` column, composition as grounds for an entry), about the expression
language (strings, the two cycle guards, a card's mark, an undeclared bonus
type), about surfaces inside a sheet or the configuration panel (the anchored
panel's type size, the panel's copy budget, a list field's height cap, what a
flag says), and about the render seam. Not one of them is about layout
management — no entry mentions creating, duplicating or naming a layout file.
That absence is the answer rather than an omission to repair, so no `Resolved:`
entry is owed and none may be invented.

Every other question step 1 asks answers itself the same way, and for the same
reason `docs/features/layout-import-export.md` gave: no component is added and
the contract (§4.1) does not grow; nothing new is published to formulas; no
character note is opened, read or written, so Constraint 3 has no new round trip
to keep and Constraint 4 has nothing to lose beyond the refusals below; and the
layout format is untouched — `parseLayout` gains no rule, `serialiseLayout`
gains no key, and the schema is exactly what it was.

**One SPEC sentence is overturned rather than amended**, and it is named here
rather than discovered in review: §7's **Manage layouts** bullet does not leave
this feature's placement open, it answers it the other way. The argument is
under *Where the control lives*, and the commit boundary that rewrites the
bullet is boundary 5.

## What it does

The layout editor pane's **Layout file** row gains a labelled **New layout**
button, and the dropdown beside it goes back to holding layout names and nothing
else. The button opens one modal that asks what the new layout starts from — a
blank grid, an existing layout in the folder, or pasted JSON — and what it is
called; the same button and the same modal are what a vault holding no layouts
is offered, which is how a reader who has been sent a layout and has none can
finally get it in.

Nothing is overwritten and nothing is suffixed behind the user's back. A name
the folder already holds is refused in `createLayout`'s own words, and every arm
parses its source before anything is written, so a refusal leaves the vault byte
for byte as it was.

## Smallest version

The **New layout** button on the row and in the vacant state, opening a modal
with two sources — a blank grid and an existing layout — and a name typed by
hand. It gives up the third source, so `Import a layout…` stays a dropdown
option, cold-start import stays unreachable and `docs/BACKLOG.md`'s row about it
stays open; and the prefilled `<source> copy` name, so every copy is named from
scratch and a taken name is met as a refusal rather than avoided. **Three things
are not cuttable at any size**: the copy arm reads the source *file*, and reads
it inside `src/layouts.ts` under a `{ copyOf }` arm rather than in the modal; it
goes through `installLayoutSource`, so parse-before-write and
one-writer-one-spelling both hold; and `startLayout` stays, because two arms is
already PATTERNS §1's one-step tier — a refusal set and an ordering — so
spelling it at the call site is the mistake §1 names rather than a saving.

## Design

### One gesture with three sources, and why the category's two controls lose

**Create absorbs duplicate and import.** One control, named for what it does —
make a layout that did not exist — with a **Start from** row naming what it
starts from: a blank grid, an existing layout, or pasted JSON. Duplicate is not
a file operation beside create; it is create *with a source*, and so is import.

**The convergent evidence is against this and it is answered on three local
facts rather than dismissed.** Every surveyed tool with both gestures keeps them
as two controls, and in all three create is reached from the container while
duplicate is reached from the item: Foundry VTT's Actors directory pairs a
**Create Actor** button with a per-item context menu; Quest Portal pairs
**Create New Template** on the Templates tab with an ellipsis on the template
card; Fantasy Statblocks pairs create in settings with a duplicate on the layout.
No in-category create gesture takes an existing item as its source. The one
merged pattern found — a blank tile in the same picker as the templates — is out
of category and snippet-only (Google Docs, Miro). So this design wins against
the category or not at all, and here is why it wins:

1. **There is no item to hang duplicate on.** In all three tools the item is a
   row in a list already on screen, so reaching it is free. This pane has no
   list of layouts: the only place every layout is enumerated is a `<select>`,
   and a `<select>` option carries no per-item action. The nearest transplant —
   duplicate acts on the layout that is *open* — makes reaching the source cost
   **opening it in the editor**: releasing the current layout, reparsing,
   redrawing the tree, the canvas and the panel, for a 7-24KB file the author
   does not want to look at. Right-clicking an actor in Foundry's directory
   opens no sheet. The observed placement's precondition is absent, and
   transplanting it literally costs more here than it cost where it was observed.
2. **This row has already spent the word "copy".** **Copy layout JSON** shipped
   last cycle as an extra button on exactly the row where a **Duplicate layout**
   button would go, so the separate-controls design puts two adjacent controls
   both meaning "copy" with different destinations — one to the clipboard, one to
   the folder — and asks a reader to tell `copy` from `copy-plus` at 16px. None
   of the three surveyed tools has a clipboard-copy control beside where its
   duplicate lives. This is the fact that decides it.
3. **The vacant state has to be offered something, and one gesture is one place
   that enumerates the sources.** Under two controls the empty-folder state needs
   **Create layout** plus an import affordance, with duplicate meaningless and so
   hidden — a second enumeration of which create-ish operations exist, which is
   `docs/PATTERNS.md` §1's policy tier exactly: the only thing a guard could
   assert over the two copies is that they still list the same sources. Under one
   gesture the source list is *derived* — blank always, an existing layout only
   where `hasLayouts` is true, pasted JSON always — from the predicate
   `src/layouts.ts` already exports for this question.

**What the merge gives up, so a reviewer does not report it as a gap.** The word
"duplicate" appears on no control, so a reader who thinks in that word has to
find it inside **New layout**. The mitigation is the source option's own
description, which says what it is in a sentence — *The new layout starts as a
copy of the one you choose. Editing it never touches the original.* — and the
fact that the gesture a duplicator is looking for starts with "make another one"
in any case. It also gives up the two-step discoverability of a named button, and
that is the trade this design accepts.

**A blank start stays reachable in one step**, which is a floor rather than a
preference. Lancer needs a pilot sheet and a mech sheet sharing no structure, so
a create that only ever asks for a source is worse than the blank it replaced.
**A blank grid is the default source**, so **New layout** → type a name →
**Create** never touches the **Start from** row. That is also why the commonest
want — copy the layout I am looking at — is *not* the default: it costs one
selection, and the floor costs none.

### Where the control lives, and the §7 sentence it overturns

**A labelled button on the **Layout file** row, after the dropdown and before
the two icon buttons.** `Import a layout…` and `New layout…` both leave the
dropdown, which then holds layout names and nothing else.

**SPEC §7 answers this the other way and the answer is overturned.** The bullet
states the row rule — the dropdown answers *which layout is open*, the row's
buttons *act on the layout already open* — and then applies it: `New layout…`
and `Import a layout…` are dropdown options "both ending with a different layout
open". The same argument is a comment at `src/editor/layout-editor.ts:566-570`.

**The losing argument, named.** The row rule is genuine and it survives; what
fails is its application to create. The rule is a two-way partition, and create
is a third kind of thing: it acts on the **folder**, not on the open layout and
not on the choice of which layout is open. Filed under "it ends with a different
layout open", create was placed by a side effect rather than by what it is —
and **delete is the tell that the partition was already leaking**: delete also
ends with a different layout open, and it is correctly a button, because what
decides it is that delete *acts on* something rather than *choosing among*
things. Create acts on the folder. So the rule becomes three-way, and the
dropdown gets *stricter* rather than looser: it holds nouns only.

Three further facts carry it, all local and all checkable:

- **A verb hiding among nouns is not discoverable.** A reader with one starter
  layout installed sees a dropdown showing that layout's name and two glyphs.
  Nothing on screen says a layout can be made. The card's first clause is exactly
  this.
- **Deleting `Import a layout…` costs no relearning, because nobody has met
  it.** 0.2.0 is unreleased: the last tag is `0.1.1` and both `manifest.json` and
  `package.json` still read `0.1.1`, so the option this feature removes has never
  been in anyone's vault. Stated as a fact rather than leant on — the argument
  above does not need it — so that a reviewer does not weigh churn that does not
  exist.
- **The dropdown-as-verb needs a mechanism a button does not**, and it is in the
  code three times: choosing a sentinel option leaves the `<select>` showing the
  wrong value, so both modals take an `onCancel` that redraws the pane purely to
  snap it back (`promptCreateLayout`, `promptImport`, and the comments at both).
  A button press changes no `<select>` value, so **`onCancel` is deleted outright**
  and the redraw-on-cancel goes with it.
- **`addButton` on a row with dropdowns is this pane's own precedent.** The
  **Add component** row is a dropdown, a conditional second dropdown, and a plain
  **Add** button. Not a CTA: creating a layout is not the pane's primary action.
  The vacant state's button keeps its CTA, because there it is the only thing on
  screen.

**The label is one const beside `promptNewLayout`, not the string typed twice.**
**New layout** is now one gesture name in two places — the row's button and the
vacant CTA — with a criterion on each, and two literals is the drift §1's
one-step tier is about: the only thing a guard could assert over them is that
they still read the same, which is what one name says for free. It sits beside
the prompt because the modal's title is the third place the words appear.

**Why not a row of its own.** A second row named **Layouts** above **Layout
file** would put two rows about layouts at the top of the pane whose names differ
by one letter — which is §7's own naming argument ("two adjacent rows both named
Layout would be a reader's problem") with more force, not less. One row, one
extra control.

**Why not a palette command.** `docs/features/layout-import-export.md` settled
this and nothing here reopens it: the pane owns the layout folder, and a command
would have to ask *which folder* and *which source layout* with suggesters
answering questions the pane has already answered. **Add a starter layout** stays
a command for its own reason (§7: cold start is the one moment no pane, file or
state exists to condition on), and this feature touches neither it nor **Create a
character**.

### The modal

Obsidian's `Modal` of `Setting` rows, titled **New layout**, in
`src/editor/new-layout.ts` — `src/editor/layout-import.ts` renamed and grown,
since its paste box, its refusal behaviour and its whole argument are one of the
three sources now. Beside its one consumer rather than in `src/ui/`, which is
`ConfirmModal`'s, `NameModal`'s and `StarterModal`'s shared precedent and §1's
"one consumer earns no generalisation". `NameModal` in `layout-editor.ts` is
deleted; this modal replaces it.

Rows, in this order — what it starts from, exactly which, then what it is
called:

- **Start from** — a dropdown: **A blank grid** (default), **An existing
  layout**, **Pasted JSON**. **An existing layout** is offered only where the
  folder holds one, which is `hasLayouts`, and is omitted the way the **Add
  component** row omits its destination dropdown: "a dropdown offering the sheet
  and nothing else says a layout has containers when it has none". The row's
  description changes with the choice, which is the same row's `describe`
  mechanism, and it is wired with `aria-describedby` for the same reason that one
  is — a description that changes and is not programmatically associated is a
  change a screen-reader user does not hear. **The id is generated per
  instance, not a module literal like the pane's `ADD_DESCRIPTION_ID`.** That
  literal is safe where it lives because a redraw replaces the whole container,
  so only one element ever carries it; a modal is a different lifetime — it can
  be opened, closed and opened again, and a stale container is what
  `onClose`'s `empty()` is for rather than a guarantee the DOM never holds two.
  A duplicated id points a reader's screen reader at the wrong description
  silently.
  **It therefore carries `.sheetsmith-add-row` and `.sheetsmith-wrapping-row`,
  and that is required rather than optional.** `docs/UI.md` §9 is a settled rule
  here, not a backlog row: a settings row is one centred flex line with no wrap,
  so growing copy in the info column squeezes the control the author is reaching
  for — which is precisely the **Add component** row this design borrows its
  `describe` mechanism from, where selecting a palette entry used to drop the
  button 35px. The rule's own words are that "the second settings row with
  growing copy reuses it rather than inventing a second answer", and this is that
  second row. It paints in a modal because both classes are bare and unscoped,
  which is the scoping test `.sheetsmith-input-invalid` failed and the problem
  list passed.

  **What it buys here is narrower than on the pane, which is stated rather than
  borrowed.** The pane's copy grows into space nothing is placed in, so nothing
  moves. Three rows follow this one — the chosen source's input, **Name**, and
  the buttons — so a **Start from** switch still moves them: a line of copy
  pushes them down and revealing a source row pushes them further, which puts
  the autofocused **Name** field and **Create** somewhere new. What is fixed is
  the first line, where the reader's pointer is: the dropdown being operated
  stays put while the sources are cycled. Accepted rather than solved, on
  `docs/UI.md` §8's frequency-first rule — a source switch happens at most twice
  in a gesture that ends in one press — and the vault procedure below is where it
  is looked at rather than argued.
- **Layout to copy** — a dropdown over `listLayouts`, prefilled to the layout
  currently open in the pane. Visible only for the existing-layout source. Named
  **Layout to copy** rather than **Layout**, which would read as a second answer
  to the question the row above already asked.
- **Layout JSON** — the shipped textarea, placeholder *Paste the layout's JSON
  here*, six rows, for the shipped reason: a real layout is 7-24KB and nobody
  reads that in a textarea. It is a paste target, not an editor. Visible only for
  the pasted-JSON source.
- **Name** — a text field, focused when the modal opens. Description: *What the
  file is called, and a name the folder already holds is refused rather than
  overwritten. Leave it empty only when starting from pasted JSON, which carries
  a name of its own.*
- **Cancel** and **Create**, in `ConfirmModal`'s button order. **Create** is
  disabled while the gesture cannot succeed: for the blank and existing sources,
  while **Name** is blank or whitespace; for the pasted source, while the paste
  box is blank, since a blank name is legal there. `NameModal`'s stated reason —
  a live button that silently does nothing is indistinguishable from a broken
  one.

**The rule is per-source, so it is recomputed when **Start from** changes and
not only in the two inputs' `onChange`.** Otherwise a reader who leaves **Name**
empty on the blank source, switches to **Pasted JSON** and pastes a layout meets
a dead **Create** for a gesture that would succeed. A case drives it in both
directions: empty name on blank → paste → enabled, and a filled paste → back to
**A blank grid** with an empty name → disabled.

**Who owns the **Name** box: a `nameTouched` flag, and the two rules only cohere
with one.** The box is either the reader's or the tool's, and once it is the
reader's it is never taken back:

- **Untouched, the tool writes it.** Choosing **An existing layout** fills it
  with `<source> copy`; changing **Layout to copy** refills it for the new
  source.
- **Touched, nothing writes it, ever.** A later prefill is skipped, not merged.
- **An untouched, tool-written prefill is cleared when **Start from** leaves the
  copy source.** This is the half the first draft of this spec got wrong, and it
  was a genuine contradiction rather than an omission: the preservation rule
  above would leave `Scratch copy` in the box after a switch to **Pasted JSON**,
  where it would silently override the pasted layout's own name — and directly
  contradict this row's own description, which tells the reader to leave the box
  empty for exactly that source. Clearing it costs nothing, because nobody typed
  it. A name the reader typed survives every source switch, because that one is
  theirs.

**Whether that disabled state is visible is a question this pane owns, so it is
answered here rather than assumed.** `docs/BACKLOG.md` carries a standing row
saying a disabled control looks exactly like an enabled one, and it names
`editor/layout-editor.ts` as its *Where*: "Behaviour is right and tested; state
that never reaches the paint is half a control (§6)." Disabling **Create** puts
a possibly-invisible state on this feature's primary confirm control, in the
pane that owns that row, so leaving a reader to assume the row does not reach it
is not good enough.

**It does not reach it, and this is checkable by looking rather than by
argument.** Obsidian's own `app.css`, as `harness/calibrate.mjs` extracts it,
carries a rule for exactly this element:

```css
button[disabled],
button[aria-disabled="true"],
button[disabled="true"] {
  cursor: not-allowed;
  opacity: 0.7;
}
```

**Two channels, not one — `cursor` and `opacity` — and a bare `button` is not a
`.clickable-icon`**, which has no `is-disabled` rule at all and is what the
backlog row is actually about. `NameModal`'s **Create** is the same control in
the same shape of modal and has shipped that way. So the invisible-disabled row
does not reach this control, and **the blank-name arm's criterion is the disabled
rule itself, asserted on the paint channel rather than only on behaviour**. No
conditional fallback is owed, because the question was answerable by citation
rather than by looking.

Two things still belong in the vault procedure, because they are about the app
rather than about the CSS: that `ButtonComponent.setDisabled(true)` actually
lands the attribute the rule matches — the stub sets both the property and the
attribute, and both `NameModal` and `ImportModal` already rest on it in
production — and `aria-disabled="true"` as the belt-and-braces route to the
identical rule if it turns out not to.

**The writer refuses a blank name anyway, and that is not the fallback above.**
`startLayout` returns it as a value (PATTERNS §4) in one sentence naming the fix,
for two reasons that have nothing to do with paint: `createLayout` handed a blank
name today would write `<folder>/.json`, and boundary 1 can then drive the arm
with no modal in existence. It is a writer-side guarantee about a module-level
function, not a second user-facing sentence competing with the disabled control —
from this surface both the button and the Enter handler make it unreachable.

**Enter in **Name** creates, guarded by exactly the condition that disables
**Create**.** This is shipped behaviour of the control being deleted:
`NameModal` submits on Enter and the import modal never did, so carrying it over
is what keeps this design's own floor — **New layout**, type a name, done —
one gesture rather than three. Guarding it on the same condition is what stops
`NameModal`'s silent return on a blank name coming along with it.

This takes no part of the four-control paint ruling `docs/BACKLOG.md` is waiting
on; that entry stays in *Deliberately not doing* and this feature still adds no
`.clickable-icon` that calls `setDisabled`.

**Both source inputs are built once and never rebuilt, and the one that is not
in use is hidden with `toggleVisibility`.** A reader who pastes 23KB, switches to
**A blank grid** to look at something, and switches back still has their paste.
That is the shipped modal's own argument — the input is expensive to reproduce —
applied one level in. Only the *visible* source is read on **Create**: a paste
held behind a blank source is ignored and preserved.

**The mechanism is named because the obvious one does not work.** `settingEl.hidden
= true` leaves both rows on screen in the app: Obsidian's `app.css` declares
`.setting-item { display: flex }` at author level, which beats the UA sheet's
`[hidden] { display: none }`, and no `[hidden]` rule exists in `app.css`,
`styles.css`, `src/styles/` or `harness/theme.css` to restore it. A unit test
asserting the attribute would pass while the app showed both source inputs at
once — green in the suite and wrong in the app, which is the class
`docs/PATTERNS.md` §2 grants `obsidian-stub.test.ts` its whole exception for.
`toggleVisibility(visible)` is Obsidian's own public member on `HTMLElement`
(`obsidian.d.ts:97`) and writes inline `display`, so it wins. It costs about
three lines in the stub's `installDomHelpers`, which today installs
`createEl`/`createDiv`/`createSpan`/`appendText`/`addClass`/`removeClass`/`toggleClass`/`setCssStyles`/`setText`/`empty`
and none of `show`/`hide`/`toggle`/`toggleVisibility` — the `hide()` at stub line
1425 is `View`'s, not a DOM helper.

**The rejected alternative: detach the unused row and reattach it before the
**Name** row.** It needs no stub work at all and it also never rebuilds the
input, so the preservation promise survives either way. It lost because a row's
*position* then becomes state the modal maintains — reattaching in the wrong
place silently reorders the form — where visibility is a property of the row
itself, and because the DOM is then not a picture of the form: a reader
inspecting it cannot see that a paste is being held.

**So the criterion asserts the row is not visible by the same means the app
uses**, not that an attribute is set. Anything weaker is the failure this
paragraph exists to prevent.

**On a refusal the modal stays open with every box exactly as typed, and the
reason arrives as a `Notice`.** Inherited from the shipped import modal rather
than re-argued: the input is expensive, and the fix for the commonest refusal —
a taken name — is in the box already on screen. The problem-list vocabulary is
declined for the reason `editor.css` already gives in words (it is for a line
being typed, "not the bordered box that means a layout file is unreadable"), and
`showFieldError` for the reason the shipped feature found (`.sheetsmith-input-invalid`
is scoped to `.sheetsmith-layout-editor-pane` and would not paint on a modal).

**On success the modal closes, one `Notice` announces the write, and the pane
opens what landed** — `openLayout`, which already exists and is already shared
over three callers. **All three arms announce, in `installLayoutSource`'s
sentence, `Added "X" to <folder>.`** This is a deliberate change to shipped
behaviour: a blank create is silent today. One gesture with three sources that
announces two of them and stays quiet on the third invites a reader to infer the
quiet one did something different, and the sentence names the *folder*, which is
configurable.

### Naming a copy

**The tool proposes the name; the writer never applies one.** Choosing **An
existing layout** fills **Name** with `<source> copy`, and where the folder
already holds that, `<source> copy 2`, `copy 3`, and so on until one is free.
The box is editable and on screen before **Create** is pressed, so the suffix is
a suggestion rather than a fait accompli.

That is the reconciliation question 4 asks for, and both halves matter:

- **The surveyed tools all name it, and none of them refuses.** Quest Portal:
  "A duplicated template will create a new Template and automatically name it
  the came with the addition of 'copy'", asking the user nothing. Foundry names
  an unnamed new actor "New Actor" with a number appended.
- **`createLayout`'s refusal stays, and its reason is restated for this case.**
  Its stated reason is about a starter reinstall — "the existing file may be the
  user's edited copy of an earlier install" — which does not transfer. The reason
  that does: under a copy, the file already holding that name is most likely a
  **previous copy the user has been editing**, and `Cutter copy` landing on top
  of a `Cutter copy` somebody has worked in for a week is Constraint 4 broken by
  the one operation whose entire promise is that it *adds* a file. So the default
  name is the *pane's* policy and the refusal is the *writer's*, and neither
  reaches into the other. `createLayout` is not touched by this feature.
- **The suffix is searched when the source is chosen**, against `listLayouts`,
  so in the ordinary case the refusal is never met. Where another pane takes the
  name between the prefill and the press, the refusal fires, the modal stays open,
  and the box is the fix.

**`<source> copy` rather than Obsidian's own `<source> 1`.** The platform
precedent loses on two counts: a layout name is a sheet's name an author reads
back later, and "Cutter 1" reads as a *variant* of Cutter rather than a copy of
it — while "copy" is legible as a placeholder, which is the more useful prompt to
rename. The suffix policy lives in `src/layouts.ts` beside the folder it reads,
which is `hasLayouts`'s stated reason ("one place that knows how the layout
folder is read") and `noLayoutsMessage`'s and `nameAlreadyDeclared`'s precedent
for a user-facing name policy living there.

### The vacant state, and the cold-start gap it closes

**`renderVacant` keeps its shape and its sentence, and its button becomes the
same gesture.** *"No layouts yet."* and one CTA, centred, no tree and no panel —
unchanged. What changes is that the button is labelled **New layout**, matching
the row's, and opens the same modal, whose **Start from** row there offers a
blank grid and pasted JSON (an existing layout is omitted by `hasLayouts`, which
is false *because* this branch was reached — the predicate and the branch agree
by construction rather than by agreement).

**That is the fix for the recorded gap, and it is question 3 answered yes:
cold-start import is a case this plugin owes.** The argument: the reader with no
layouts is the *most* likely person to be holding a layout somebody sent them —
a fresh install is exactly when a friend hands you their sheet — and today they
must first make a layout they do not want, or run a starter command, before the
control that accepts theirs exists at all. §7's own sentence already says the
starter command's argument "does not transfer to import, which is a reader
holding a layout somebody sent them rather than a reader with nothing at all";
this closes the case where they are both at once. No prior art was found on
either side (only Quest Portal's docs even imply an empty state), so it is
decided on that argument rather than on the category.

**The pane still draws no **Layout file** row when the folder holds no
layouts**, and that stays right: a dropdown over zero rows cannot succeed under
any input, which is `docs/features/layout-picker.md`'s own argument for not
drawing a picker there.

**`docs/BACKLOG.md`'s Patterns row is retired by ruling, and the ruling is what
chose this design over the two-control one.** The row — *"The pane draws no
**Layout file** row when the folder holds no layouts"* — waits on "a ruling on
whether cold-start import is a case this plugin owes", and offers a two-armed
Fix: "Offer **Import a layout…** beside **Create layout** there, or accept that a
first layout arrives by starter or by hand." Read against that, the
separate-controls design fails three ways at once: a **New layout** button
dropped into `renderVacant` **delivers neither arm** — it does not offer import
there, and it does not accept the status quo either — while still **not
answering what the row waits on**, so it would edit the row's subject, ship
neither proposed fix, and leave the ruling open, in a file this cycle may not
touch. One gesture with a derived source list takes the ruling instead: cold-start
import is owed, and it is owed through create rather than through a second
control. That closes the row.

**The retirement is a note at the land stop for the owner to apply, not an edit
by this feature.** A chore branch in another session holds uncommitted work in
`docs/BACKLOG.md`, so the file is not this feature's to touch, and
`src/backlog.test.ts` — which checks the rows and is equally off limits — is why
that is safe to say rather than sloppy: a spec that changes a row's *truth*
without editing the file is exactly the right outcome here, and the edit follows
once the chore branch lands. **No criterion below asserts anything about either
file.**

### What a duplicate copies, and what it does not

**It reads the source's file off disk, and reconstructs nothing from editor
state.** This is the design rule counter-example two earns. Fantasy Statblocks
issue 443 — open, unassigned, no maintainer reply — reports that duplicating the
Basic Pathfinder 2e layout and assigning the copy "results in a stat block
rendered in the 5e style" while "The original copied layout renders properly in
the PF2e Style", reproduced on Fate Core and 13th Age. Whatever the mechanism,
the report's *shape* is that the copy path rebuilt something the source had
rather than carrying it across. So: **every value the copy path reconstructs is
a place the copy can differ from the source**, and the copy path reconstructs
nothing. The pane's in-memory layout is editor state and is not read, even though
every mutation writes immediately and it would usually agree; another pane may
have written since.

**And that is a claim about `src/layouts.ts`, not about the modal**, which is
what the `{ copyOf: <basename> }` arm buys (see *What it reuses*): the surface
hands over a name, the module reads the file. A design where the modal read the
file could be refactored into reading editor state without any writer-side
guarantee noticing; this one cannot. The missing-source arm is the module's too,
in one sentence beside `loadLayout`'s own "returns null when no such file
exists".

**The source text goes through `installLayoutSource`**, which is where the
guarantee lives: `parseLayout` first, `createLayout` second, so a source that
will not parse never reaches the vault, and the write is `serialiseLayout`'s —
one writer, one spelling, the same gate every layout in the folder passed. The
`rename` parameter replaces the `name` inside, so the filename and the `name` key
still agree, which is the invariant `loadLayout` and `listLayouts` both rest on.

**So a duplicate parses rather than copying bytes, and that is the opposite of
export on purpose.** §3.2 draws the line already: "the validates rather than
copies bytes rule is about the *install* path, which is the direction that
writes". Export copies bytes because it *leaves* the vault, where a key this
parser does not know must not be silently dropped and a file that will not parse
at all is exportable so somebody can fix it. A duplicate *enters* the vault, so
it inherits the install rule, and the cost is stated rather than hidden: **a
hand-authored source carrying a key this version's parser does not know loses it
in the copy, and a source that will not parse cannot be duplicated at all.** The
route for that reader exists and is one control to the right — **Copy layout
JSON** hands them the broken bytes.

### Import no longer means destroy, and the spec says so out loud

**In the tool this project's data-safety criterion comes from, import means
overwrite.** Foundry's own documentation says Import Data's JSON "overwrite the
existing actor you imported the data into", so Custom System Builder issue 516 —
import destroying the template it imported into, open since December 2025 — is
core semantics meeting a template rather than a CSB defect. Import there targets
an existing document. Here, pasted JSON is a **source for a file that does not
exist yet**: it is refused where the name is taken, and it overwrites nothing
under any input. They are two operations sharing one word, and folding the word
under **New layout** changes which one it names — in the safe direction. Written
down because the next reader will otherwise arrive carrying the destructive
meaning.

### The drift this manufactures, accepted as a decision

**This gesture makes near-identical layout files easy to produce and ships
nothing that keeps them in step.** Blades in the Dark needs seven layouts, one
per playbook, sharing action ratings, stress, trauma, harm and load and differing
in each playbook's own XP trigger; Forged in the Dark and PbtA games are
playbook-based by construction. Seven files is seven places to fix one mistake.
That is not a defect of this feature: §7 declares layouts independent,
"duplicated and diverged rather than inherited", §11 lists **layout inheritance**
as a non-goal, and §10 declines the migration that would carry a change across
them. So the cost is stated here as a decision rather than met later as a support
question: **the answer to "I changed one and the other six did not move" is that
they are separate files, and this feature is what made them easy to make.**

### What it reuses

Everything that writes, and everything that opens. `installLayoutSource` and
`InstallResult` from `src/layouts.ts` for the two text arms; `createLayout` for
the blank arm and, through `installLayoutSource`, for the other two — one file
writer, and its folder creation and its taken-name refusal reached by all three
arms alike. `listLayouts` for the source dropdown and for the suffix search;
`hasLayouts` for whether that dropdown exists at all. `openLayout` for the tail.
`Modal`, `Setting`, `ButtonComponent` and `Notice` for every surface.

**One new name in `src/layouts.ts`: `startLayout(app, folder, name, source)`,
returning `InstallResult`.** `source` has **three** arms, one per source:
`{ blank: true } | { copyOf: string } | { text: string }`.

**The third arm is the whole point, and a two-arm version would be
two-thirds done.** Left as `{ text: string }`, the copy source would have to be
read *in the modal* — and `getFileByPath` returns `null` for a source another
pane deleted rather than throwing, so the modal would invent both the branch and
the sentence for it. That is a second failure shape in the one surface
`startLayout` exists to spare, with a user-facing sentence owned by nobody.
`{ copyOf: <basename> }` puts the read, the missing-file words and the
`InstallResult` in `src/layouts.ts` beside `loadLayout`, which already owns
"returns null when no such file exists". It is also what makes *What a duplicate
copies* a claim about the **writer's module** rather than about the modal — the
module reads the file, so no surface can be refactored into reading editor state
instead — and it lets boundary 1 drive the deleted-source arm with no modal in
existence.

**And the notice's sentence is split into one builder both arms call.** Today
`Added "X" to <folder>.` lives inside `installLayoutSource`, and the blank arm
goes through `createLayout`, which composes no message — so all three arms
announcing in one voice needs the sentence to have a name. That is sanctioned by
`installLayoutSource`'s own header, in its words: "the *order* is what may not be
duplicated, and the wording is negotiable". Not `startLayout` re-deriving the
sentence for its blank arm: two copies of a policy is §1's one-step tier, where
the only thing a guard test could assert is that they still say the same thing.

**It is what PATTERNS §1 asks for rather than something extra.** Three arms is
the "Three consumers. Extract" rung outright, and what they share is a *set*
plus a *policy* — the refusal set (blank name, taken name, a name the vault
refuses, a source that will not parse) and the ordering that parses before it
writes — which is §1's one-step tier, where the only thing a guard test over two
copies could assert is that they still agree. Spelling it at the call site
instead would reproduce the mistake §1 names twice: `roundSum`'s own history and
`--sheetsmith-grid-row`'s are both a number or a fact shared while its
*application* stayed written out at both sites. **Share the application, not just
the fact.** So the branch, the try/catch and the blank-name refusal live in the
module that owns the folder, and the modal has one `'error' in result` to read.

It gives the three arms one result shape, which they do not have today:
`createLayout` throws and `installLayoutSource` returns a value, and PATTERNS §4
is explicit that a failure a user can cause is a value the caller can act on. It
sits beside `installLayoutSource` for that function's own stated reason, and it
is what stops the blank arm being the one path with a different failure shape —
and the one path with no blank-name refusal at all.

### Pixels

**No new rule.** One `addButton` on an existing row, one `Modal` of `Setting`
rows, one button label changed in the vacant state, two `addOption` calls
removed. Nothing under `src/styles/` is added or changed, nothing inside
`.sheetsmith-view` is touched, and the sheet does not change.
`docs/features/starter-layouts.md`'s position mostly held: every surface is
Obsidian's own chrome, with **two existing class names borrowed** —
`.sheetsmith-add-row` and `.sheetsmith-wrapping-row` on the **Start from** row,
which `docs/UI.md` §9 requires rather than permits (see *The modal*).

**The review splits cleanly in two, and the split is the instrument's, not a
judgement.**

**What the harness can answer: the row and the vacant state.** `editor-vacant`
already exists as a shot (`surface=editor&theme=light&layout=none`, `size:
'1000,700'`), so the changed CTA is reviewable by looking, and `editor-light`
and `editor-dark` frame the whole pane at `EDITOR_FRAME`, so the row's new
button is too. All three are real renders. Those are the design axis of the land
stop.

**What the harness cannot answer: the narrow axis, and this is measured rather
than inferred.** `editor-narrow`'s entry in `harness/shot.mjs` reads `size:
'380,8050'`, which is a **window** size — and `docs/BACKLOG.md`'s UI table
records that headless Chrome floors `innerWidth` at 500 whatever `--window-size`
says. So the PNG is a 500px render cropped to a 380px frame, which is
indistinguishable from a narrow pane that overflows and could read either way.
The same table adds that no editor shot has ever gone below 1190, and that the
pane has no regime below about 470px at all. **So adding a third control to that
row is a call taken blind on the narrow axis**, and the spec says so rather than
resting the decision on a picture that cannot carry it.
It is not a blocker: the row below 500px is already broken with two controls —
the delete icon is already clipped there — so a third changes nothing about a
state that is already wrong, and fixing that regime is not this feature's work.

**What only the vault can answer: the modal.** `harness/calibrate.mjs` extracts
Obsidian's palette, its settings chrome and its workspace-leaf chrome, and names
no modal rules, so `harness/obsidian.generated.css` carries none: a shot of this
modal would show `Setting` rows on a bare `div`, which is the instrument showing
something the app does not. The throwaway-vault procedure below is what reviews
it — including the one thing a shot could not show anyway, that a disabled
**Create** paints at `opacity: 0.7` and no more.

## Config fields

None. No component is added, no `configFields` are declared, and no key is added
to the layout schema or to `data.json`. `settings.layoutFolder` is read, never
changed.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| — | — | — | This feature declares no config fields. |

## Data and file model

**Exactly one file is written, and nothing else in the vault is touched.** The
path is `<layoutFolder>/<name>.json`; the folder is created when missing, by
`createLayout`, which already owns that. The bytes are `serialiseLayout`'s in all
three arms. No existing file is modified, moved or trashed. No character note is
opened, so every `sheet-layout` in the vault still names what it named before,
and Constraint 4 has nothing to say here beyond the refusals.

**One file is read, in one arm.** The existing-layout source reads the source
file and nothing else. It is not modified. Constraint 3 is untouched throughout:
no character note is parsed or serialised on any path in this feature.

**Nothing about the layout format changes.** `parseLayout` gains no rule,
`serialiseLayout` gains no key, so a layout written before this feature copies
identically to one written after it. A layout that lands here is an ordinary
layout the user owns from the moment it does — `installStarter`'s own words — and
a later plugin version rewrites nothing.

**Round trip.** A layout the plugin wrote copies byte-identically, because
`serialiseLayout` wrote it both times. A hand-edited one may differ after the
copy (whitespace, key order, a key the parser does not know), which is correct
and is the install rule stated under *What a duplicate copies*: §3.2 gives layout
files no byte-identical promise, and Constraint 3 is about character notes.

**Every failure arm leaves the vault exactly as it was**, which is the
load-bearing axis and the reason the ordering may not be respelled:

| Arm | What refuses it | State after |
| --- | --- | --- |
| Blank name | `startLayout`, as a value; **Create** is disabled ahead of it | nothing written |
| Name the folder holds | `createLayout`, in its own words | nothing written |
| Name the vault refuses | the vault's own reason, through `createLayout` | nothing written |
| A file where the layout folder must go | `createFolder`'s own refusal, through `createLayout` | nothing written, existing file's bytes intact |
| Paste that will not parse | `parseLayout`, before `createLayout` runs | nothing written |
| Paste that parses but is not a usable layout | `parseLayout`'s own rules, same ordering | nothing written |
| Paste carrying no `name`, with **Name** left empty | `parseLayout`: *The layout needs a non-empty "name" string.* | nothing written |
| Source layout missing or unreadable | `startLayout`'s `{ copyOf }` arm, in `src/layouts.ts`'s words | nothing written |
| Layout folder does not exist | not a failure: `createLayout` creates it | one folder, one file |

### Vault fixture

**No new fixture layout or character note.** This feature adds no component, so
the one-fixture-per-component convention has nothing to place; what the review
needs is a procedure over the vault the reviewer already has
(`~/Developer/sheetsmith-test-vault/`, layouts in `Sheetsmith layouts/`).

What the vault must hold: at least three layouts in `Sheetsmith layouts/`, so
the **Layout to copy** dropdown has rows and the prefill has a candidate. The
existing set (`DnD 5e Standard`, `DnD 5e Caster`, `Blades in the Dark`, and the
`<Thing> variations` fixtures) is enough; nothing is added.

What to press:

1. Open the layout editor pane on `DnD 5e Standard`. The row reads **Layout
   file**, a dropdown of layout names *with no `New layout…` or `Import a
   layout…` in it*, **New layout**, the copy glyph, the trash glyph.
2. Press **New layout**. **Start from** shows **A blank grid**; **Name** is
   focused and empty; **exactly one source row is on screen** — if both the
   paste box and **Layout to copy** are visible, `toggleVisibility` is not
   doing its job and no unit test will say so. **Then look at **Create** before
   typing anything**, which is the one thing only this screen answers: it must
   read as disabled at Obsidian's own `opacity: 0.7` and `cursor: not-allowed`,
   and the question is whether 0.7 is legible enough to be worth having.
   Confirm with the inspector that `setDisabled(true)` landed the `disabled`
   attribute the rule matches; if it did not, `aria-disabled="true"` reaches the
   identical rule and is the fix. Press Enter on the blank name and confirm
   nothing happens — same guard as the button, no silent half-gesture. Then type
   `Scratch`, press **Create**. A notice names the folder, and the pane opens an
   empty six-column layout.
3. Press **New layout**, choose **An existing layout**. **Layout to copy**
   prefills to `Scratch` — the open one — and **Name** fills with `Scratch copy`.
   Change **Layout to copy** to `Blades in the Dark`; **Name** becomes `Blades in
   the Dark copy`. Press **Create**, then compare the copy's tree against the
   original's: same components, same formulas, same triggers, same modifiers.
4. Repeat step 3 without changing the name. The copy is refused by name, the
   modal stays open with the source and the name as they were, and typing
   `Blades in the Dark copy 2` succeeds.
5. Press **New layout**, choose **Pasted JSON**, paste a layout (use **Copy
   layout JSON** on another layout first), leave **Name** empty. It lands under
   the name inside the JSON, or is refused where the folder holds it. Then paste
   `{` and confirm the parser's refusal with nothing written.
6. **Walk the sources in order and watch what moves.** With the modal open,
   choose **A blank grid**, then **An existing layout**, then **Pasted JSON**,
   and watch where **Name** and **Create** land at each step. The **Start from**
   dropdown itself must not move under the pointer; the rows below it will, by a
   line of copy and by a revealed row, and the question is whether that reads as
   the form answering or as the buttons running away. This is the one thing
   `.sheetsmith-add-row` does *not* fix in a modal (see *The modal*), and it can
   only be judged by looking.
7. Switch **Start from** from **Pasted JSON** to **A blank grid** and back. The
   paste is still there, and only one source row is ever visible. Then choose
   **An existing layout**, let **Name** prefill, switch to **Pasted JSON** and
   confirm the box **emptied** — an untouched prefill must not override a pasted
   layout's own name. Type a name of your own, switch source twice, and confirm
   it survived.
8. **Settings → Sheetsmith → Layout folder** → `Sheetsmith layouts empty`. The
   pane shows *"No layouts yet."* and **New layout**. Open it: **Start from**
   offers **A blank grid** and **Pasted JSON** and no third option. Paste a
   layout, confirm it lands and the pane opens it — **this is the cold-start
   import that was unreachable**. Set the folder back afterwards.

## Acceptance criteria

Placement and the gesture

- [x] The **Layout file** row's dropdown holds layout basenames and nothing
      else: no `New layout…`, no `Import a layout…`. The existing case at
      `layout-editor.test.ts:4879` is rewritten to assert exactly that.
- [x] The row carries a **New layout** button, in `Setting` control order after
      the dropdown and before the copy and trash extra buttons, so the
      irreversible control is still last.
- [x] The button is not a CTA on the row and is a CTA in the vacant state.
- [x] The vacant state draws *"No layouts yet."* and one button labelled **New
      layout**, with no tree, no panel and no `.setting-item`. The existing case
      at `layout-editor.test.ts:4088` is updated for the label and keeps both
      absence assertions.
- [x] Both controls open the same modal, titled **New layout**.
- [x] The label is one const beside `promptNewLayout`, read by the row's button
      and by the vacant CTA. A case asserts each control's text, and the string
      appears once in the source.
- [x] No `onCancel` parameter survives on either prompt, and no code path
      redraws the pane because a modal was cancelled. Cancelling leaves the pane
      untouched — a case asserts the dropdown still shows the open layout and
      the tree was not rebuilt.
- [x] `NameModal` no longer exists in `src/editor/layout-editor.ts`, and
      `src/editor/layout-import.ts` is `src/editor/new-layout.ts` with its cases
      carried over rather than rewritten.

The modal

- [x] Rows in order: **Start from**, both source inputs with only the chosen
      one visible, **Name**, then **Cancel** and **Create**.
- [x] **Start from** defaults to **A blank grid**, so a blank layout is name,
      press, done, with no source selection.
- [x] **An existing layout** is absent where the folder holds none, and present
      where it holds one or more.
- [x] The **Start from** description changes with the choice and is wired with
      `aria-describedby` to the dropdown, under an id generated per instance
      rather than a module literal. A case opens the modal twice and asserts the
      two ids differ.
- [x] **Layout to copy** lists `listLayouts`' basenames and prefills to the
      layout open in the pane; where none is open it prefills to the first.
- [x] **Layout JSON** keeps the shipped placeholder and six rows.
- [x] **Create** is disabled while **Name** is blank for the blank and existing
      sources, and while the paste box is blank for the pasted source — where a
      blank **Name** is legal. **Asserted on the paint channel, not only on
      behaviour**: the case reads the `disabled` attribute off the element, which
      is the selector Obsidian's own `button[disabled] { cursor: not-allowed;
      opacity: 0.7 }` rule matches.
- [x] **The rule recomputes when **Start from** changes**, not only in the two
      inputs' `onChange`. Two cases: an empty **Name** on the blank source, then
      **Pasted JSON** with a paste typed, leaves **Create** live; a filled paste,
      then back to **A blank grid** with **Name** still empty, leaves it
      disabled.
- [x] The **Start from** row wears the described-row treatment, and there is
      **one spelling of that treatment and one of its assertion**:
      `src/editor/described-row.ts` applies both classes, moves the description
      below the controls, sets its id and the control's `aria-describedby`, and
      repaints the copy per choice, with the id passed in; `src/test/described-row.ts`
      asserts it, and both this row's case and the **Add component** row's call
      that one function rather than transcribing it.
- [x] **`docs/UI.md` §9 records the second consumer** of
      `.sheetsmith-add-row`, since this feature is the second settings row with
      growing copy that section predicted and it read "One consumer today". The
      edit belongs to boundary 5, with the code it describes in boundary 2.
- [x] **`startLayout` refuses a blank name as a value**, in a sentence naming
      the fix, covered by a `layouts.test.ts` case asserting the folder gained no
      file — in particular no `.json`. A writer-side guarantee, driveable at
      boundary 1 with no modal in existence.
- [x] **Enter in **Name** creates**, carrying over `NameModal`'s shipped
      behaviour, guarded by exactly the condition that disables **Create** — so
      Enter on a blank name does nothing rather than returning silently past a
      guard of its own. A case per direction.
- [x] **The unused source row is hidden by `toggleVisibility`, and the case
      asserts it is not visible by the means the app uses** — inline `display`,
      or `isShown()` — never that an attribute is set. `settingEl.hidden` would
      leave both rows on screen in the app and the case green.
- [x] Switching source away and back preserves what was typed in the other
      source's input, because the input is built once and never rebuilt: a case
      types a paste, switches to **A blank grid**, switches back, and reads the
      paste out of the same element.
- [x] Only the visible source is read: a case leaves a paste in the box, chooses
      **A blank grid**, creates, and asserts the written layout is the empty one.
- [x] Success closes the modal, announces `Added "X" to <folder>.` for all three
      sources including the blank one, and leaves the pane open on the layout
      that landed.
- [x] **The sentence comes from one builder**, called by the blank arm and by
      `installLayoutSource` alike. A case asserts the blank arm's notice is that
      builder's output rather than a second spelling of it.

Naming a copy

- [x] Choosing **An existing layout** fills **Name** with `<source> copy`, and
      changing **Layout to copy** refills it for the new source.
- [x] Where `<source> copy` is taken, the prefill is `<source> copy 2`, and
      where that is taken too, `copy 3`. A case drives at least the second step.
- [x] **A name the reader typed is never touched by anything** — not by a later
      prefill, and not by a source switch. Governed by a `nameTouched` flag; a
      case types a name, switches source twice, and reads it back unchanged.
- [x] **An untouched, tool-written prefill is cleared when **Start from** leaves
      the copy source.** A case takes `Scratch copy`, switches to **Pasted
      JSON**, and asserts the box is empty — so the pasted layout's own name is
      what lands, which is what the **Name** row's description promises.
- [x] `createLayout` is unchanged: it still refuses a taken name in its own
      words and still never suffixes. A case asserts the refusal message is
      `createLayout`'s rather than a second copy of it.

What a copy carries

- [x] The copy is built from the source **file's** text, not from the pane's
      in-memory layout, and the read happens in `src/layouts.ts` under
      `startLayout`'s `{ copyOf }` arm rather than in the modal. A case writes a
      different layout to the source's path behind the pane and asserts the copy
      matches the file.
- [x] A copy of a layout the plugin wrote is byte-identical to the source except
      for its `name`, and the copy's `name` key equals its filename.
- [x] Copying a layout whose file will not parse is refused in `parseLayout`'s
      own words, with nothing written.

Data safety — one case per arm of the table above

- [x] A name the folder already holds: refused, modal open, every box as typed,
      the existing file byte for byte unchanged.
- [x] A name the vault refuses: refused with the vault's own reason, nothing
      written anywhere. **An arm and a case of its own**, since it is the one
      that reaches `vault.create`'s own rejection — the taken name is refused
      before the vault is touched and the folder-shaped arm below comes out of
      `createFolder`. **The throw is injected rather than provoked by a
      separator**, which the double cannot drive: `createLayout` builds
      `<folder>/<name>.json`, the stub writes `<folder>/sub/x.json` happily, and
      `listLayouts` lists direct children only so it cannot even see the write —
      recorded in `docs/BACKLOG.md`, whose ENOENT model stays out of this run at
      81 test files' cost. So the case stubs `Vault.create` to throw Obsidian's
      own message, which is `layout-editor.test.ts`'s technique for the
      unreadable file one control over, and asserts the pass-through: the vault's
      sentence verbatim, and the folder unchanged.
- [x] **A file where the layout folder must go**: refused by `createFolder`
      through `createLayout`, with the existing file's bytes intact. This is the
      one folder-shaped refusal the double honours, and it is the route the
      shipped import feature already took — its header records that this case
      alone cannot make its claim as a folder count, so it asserts the bytes.
- [x] A paste that will not parse: refused, nothing written, and the paste still
      in the box.
- [x] A paste that parses but is not a usable layout: refused by `parseLayout`,
      nothing written.
- [x] A paste with no `name` and **Name** left empty: refused with *The layout
      needs a non-empty "name" string.*
- [x] A source layout deleted between the dropdown being drawn and **Create**:
      refused in `src/layouts.ts`'s own words, nothing written. Driven at
      `startLayout` with no modal, since `getFileByPath` answers `null` rather
      than throwing.
- [x] A layout folder that does not exist: created, and the file lands in it.
- [x] Every refusal arm asserts the folder's file list is unchanged, not merely
      that an error was returned. **That claim is a `listLayouts` count over the
      layout folder**, with its two stated limits — direct children only, and the
      stub has no `Vault.getFiles()` — which is why the file-where-the-folder-goes
      arm asserts bytes instead.

Pixels and gates

- [x] `npm run lint`, `npm test` and `npm run build` are clean, and
      `--max-warnings 0` means sentence case on every new string.
- [x] No new CSS rule: nothing added or changed under `src/styles/`, and
      `styles.css` unchanged. The two borrowed class names are the only styling
      this feature writes.
- [ ] `npm run harness:shot` regenerated, and **`editor-vacant`,
      `editor-vacant-dark`, `editor-light` and `editor-dark` looked at by the
      owner** — the vacant state's CTA and the row's new button, which is the
      whole of what the harness can answer here. **Four views, not three**: the
      design review found the vacant state shot in one theme against
      `docs/UI.md` §11's first bullet, so `shot.mjs` gained the dark twin.
      **Outstanding at the land stop, and the owner's to tick.** The set was
      regenerated and the vacant state and the row were looked at *before* that
      view existed, so `editor-vacant-dark.png` has never been rendered — one
      `harness:shot` run and one look settles it. Nothing else about the shots
      changed in the design wave: no plugin markup or CSS moved, so every
      existing PNG still stands.
- [x] **`editor-narrow` is not a criterion for the row**, and the spec says why:
      a sub-500px shot is a 500px render cropped, so the narrow axis is
      unreviewable and the row's third control is a call taken blind there. The
      criterion is that this is stated, not that a picture is judged.
- [ ] The vault procedure above run end to end, including step 8's cold-start
      import, step 6's look at what a source switch moves, and the disabled
      **Create** at `opacity: 0.7`. **Outstanding at the land stop, and the
      owner's to tick.** Nothing in the repository can settle it: the modal is
      the one surface the harness cannot draw (see *Pixels*), so the whole of
      this criterion is a person in a vault. The build session may not tick it on
      its own reading, which is what ticking from a review rather than from the
      code is for.

## Commit boundaries

A plan for `/land-it`, applied once at the end. The tree stays uncommitted
through implementation and every round of findings.

**What landed is five commits, and two of the boundaries below moved**, recorded
here because the plan is the thing a reader compares the log against. The
described-row extraction became a `refactor:` of its own *ahead* of the modal,
rather than riding inside boundary 2: it is behaviour-preserving over a row that
already existed, so it stands alone and is worth reading alone, and the two
`src/test/` helpers landed with the first consumer of each. Boundaries 3 and 4
merged into one `feat:`, and not by preference — the vacant state's button calls
the method that replaces the deleted `promptCreateLayout`, and the rename of
`layout-import.ts` forces the pane's import to change in the same commit as the
file, so any split of those two produces a commit that does not compile. The
dark vacant shot the design review asked for is a `test:` of its own, on this
repository's own convention for a harness view.

1. `feat: Give the three ways of starting a layout one result shape`.
   `startLayout` and its three-armed source —
   `{ blank: true } | { copyOf: string } | { text: string }` — in
   `src/layouts.ts` beside `installLayoutSource`, the notice sentence split into
   one builder both writers call, and the suffix policy (`suggestCopyName`)
   beside `listLayouts`. `src/layouts.test.ts` covers all three arms, the suffix
   ladder, and every failure arm that belongs to the writer: the blank-name
   refusal (**new behaviour rather than a move** — nothing refuses one today),
   the missing-source arm the `{ copyOf }` read owns, and the taken name. All of
   it driveable with no modal in existence. Nothing calls it yet; `createLayout`
   is untouched.

   **Five names rather than the two this doc first authorised**, and the three
   extra are what the one-result-shape argument turns out to require rather than
   additions to it. `landed(name, folder)` is the notice sentence *and* the whole
   `ok` arm in one builder, which is the correction to splitting only the
   sentence: two writers assembling three fields around a shared string is
   `PATTERNS.md` §1's "share the application, not just the fact", and the next
   field added to that arm would have been added by one of them and missed by the
   other. `nameRequiredFor(source)` is the arm split — a paste carries a name of
   its own and the other two sources have none — exported because the modal's
   disabled rule was deriving it independently, one on the shape of the source
   and one on a control's own `'paste'`. `reason(error)` is the `catch`-to-`{
   error }` ternary, private, with twelve anonymous copies outside this file
   named in its header as a backlog row rather than swept up here.
   `layoutNotFound(name, folder)` is the missing-layout sentence, which
   `appendModifierDefinition` was already spelling inline: **that function is
   rewired to both of the last two with no behaviour change** — the same
   sentence, the same ternary — which is the one edit in this boundary to code
   outside this feature, and it is why it is named here rather than found in
   review. A third spelling of that sentence stands in `view/sheet-view.ts` and
   stays there: it is the sheet view's, not this feature's.
2. `feat: Start a new layout from a blank grid, a layout or a paste`.
   `src/editor/layout-import.ts` becomes `src/editor/new-layout.ts`: the
   **Start from** row with `.sheetsmith-add-row`, `.sheetsmith-wrapping-row` and
   its per-instance `aria-describedby`; the two source rows toggled with
   `toggleVisibility`, plus the three stub lines that member needs; the
   `nameTouched` prefill and its clearing rule; the per-source disabled rule and
   the Enter handler under the same condition; `promptNewLayout` and the label
   const. **This boundary owns the `hasLayouts` omission of **An existing
   layout** and its case**, because it is the boundary that builds the source
   list at all — offering the option unconditionally here would either ship
   wrong behaviour or duplicate the list. Its existing cases carry over renamed.

   **Three shared modules land with this boundary, because this is the boundary
   that makes each of them a second consumer.** `src/editor/described-row.ts`
   holds the described-settings-row treatment — both classes, the description
   moved below the controls, its id, the control's `aria-describedby`, and the
   repaint per choice — with the id as a parameter so the pane's module literal
   and this modal's per-instance id both survive; the **Add component** row is
   rewired onto it in the same commit, even though that row lives in boundary 3's
   file, because a module with one consumer is not the thing being landed.
   `docs/UI.md` §9 required the class and `PATTERNS.md` §1's one-step tier
   required the rest: what was duplicated is a five-part policy, and the two
   copies of the *assertion* were near-transcriptions, which is the rung §1 does
   not offer. `src/test/described-row.ts` is that one assertion, on
   `spoken-order.ts`'s precedent; `src/test/modal.ts` is the modal a gesture
   opened and the button in it by label, hand-rolled at four sites in this
   feature; and `src/test/layout-folder.ts` is the folder listing every
   data-safety arm asserts, whose two limits were being argued in two doc
   comments.
3. `feat: Offer New layout as a button on the pane's Layout file row`. The
   `addButton`, the two `addOption` calls and both sentinels removed, `NameModal`
   / `promptCreateLayout` / `createLayoutNamed` deleted, `promptImport` folded
   in, `onCancel` gone from every call site. `layout-editor.test.ts`'s dropdown
   and vacant cases updated.
4. `feat: Offer the same gesture where the folder holds no layouts`. The vacant
   state's label, its modal call, and the case that the vacant modal offers
   exactly two sources. Narrower than it first read — the `hasLayouts` omission
   itself belongs to boundary 2 — and it stays a boundary of its own because it
   is the ruling on question 3 and a reviewer should be able to read that alone.
5. `docs: Record that create acts on the folder, not on which layout is open`.
   §7's **Manage layouts** bullet rewritten: create, duplicate and import as one
   gesture with three sources; the row rule restated as three-way with the
   losing two-way reading named; the cold-start gap marked closed; the
   duplicate-manufactures-drift cost stated beside "duplicated and diverged
   rather than inherited". §3.2's import paragraph updated to say the paste is a
   source for a file that does not exist yet. §12's M5 row updated. This feature
   doc's status.

   **And `docs/UI.md` §9, which this doc quoted as authority and therefore has
   to amend.** That section read "One consumer today, so this is a class rather
   than a row in the table above — the second settings row with growing copy
   reuses it rather than inventing a second answer." This feature *is* that
   second row, so the sentence is now false in its own terms. The edit records
   the second consumer, the two things it settles that one could not — that both
   classes are bare and unscoped so the treatment paints in a modal, and that the
   description's id is per instance there — and that the reuse happened as
   predicted, which is what keeps it a class rather than earning a row in that
   section's table. Amending a cited authority is a decision rather than an
   implementation detail, so it is named here and lands in this boundary rather
   than beside the code.

## Deliberately not doing

- **Rename**, the fourth missing operation. Renaming a layout has to migrate
  every character note's `sheet-layout`, which §10 declines. Its own work, and
  the **Name** field here is not a down payment on it: it names a layout that
  does not exist yet, so it migrates nothing.
- **Component rename migration** (§10). Its own backlog item.
- **A layout library, gallery or index.** Refused when the starters shipped, and
  §11 bans bundled rules content. This ships a gesture and no catalogue.
- **Any change to the layout format, the schema, or `parseLayout`'s rules.**
- **The starter layouts and their command**, and **Create a character**. Both
  keep their gestures, their modals and their tests. §7's argument for their
  being commands is untouched.
- **Export and the copy button.** Shipped and reviewed. **Copy layout JSON**
  keeps its bytes-not-a-re-serialisation behaviour, which is the deliberate
  opposite of what a copy into the folder does, for the reason under *What a
  duplicate copies*.
- **A bespoke sentence for duplicating a layout that will not parse.** The
  refusal is `parseLayout`'s own words through `installLayoutSource`, unchanged.
  Inventing a second sentence here would be a copy of a message the module owns,
  and the reader's actual route — hand the broken bytes to somebody who can fix
  them — is **Copy layout JSON**, one control to the right and already there.
- **A `Duplicate layout` button, and the word "duplicate" on any control.**
  Argued out under *One gesture with three sources*; recorded here so its absence
  is read as a decision.
- **Layout inheritance, or anything that keeps seven playbook copies in step.**
  §11's non-goal, and the cost is stated under *The drift this manufactures*
  rather than mitigated.
- **A palette command for creating a layout.** The pane owns the folder;
  `docs/features/layout-import-export.md`'s argument is inherited whole.
- **Importing a `.json` file chosen from the vault**, rather than pasted. Still
  out, and the two facts the shipped doc recorded still apply:
  `Vault.getFiles()` is real and `src/test/obsidian-stub.ts` has no double for
  it, so a suggester over the vault's files costs a stub addition plus a policy
  for which `.json` files are candidates — including the layout folder's own,
  which would be a self-import.
- **Reading the clipboard on the plugin's behalf.** The user pastes.
- **Taking the disabled-control paint decision.** `docs/BACKLOG.md`'s
  invisible-disabled row is waiting on one ruling covering four shipped reorder
  controls, and this feature is not authorised to take it. What it guarantees is
  that it does not make that ruling harder: no `.clickable-icon` it adds calls
  `setDisabled`, and it adds none — the population stays four. The modal's
  **Create** is not a fifth member, because Obsidian styles `button[disabled]`
  and carries no rule for `.clickable-icon`; that is settled under *The modal*
  by reading the app's own CSS, and it settles this feature's control only.
- **Cutting the pane's Layout file row down.** `docs/BACKLOG.md`'s *"The pane
  still holds which layout is open alongside what is in it"* row wants the
  picker extracted out of the render loop, and this feature is again not that
  trigger — though it *eases* it rather than growing it, since `NameModal`,
  `promptCreateLayout` and `createLayoutNamed` all leave `layout-editor.ts`.
  The extraction stays unspecced work reaching `plugin.app`, `plugin.settings`,
  `releaseLayout` and `setLayoutName`, and it is out of this run.
- **Editing `docs/BACKLOG.md`, `src/backlog.test.ts` or
  `src/components/isolation.test.ts`.** Uncommitted work in another branch owns
  those files. The cold-start row's retirement is recorded under *The vacant
  state* as the owner's to apply, and no criterion here asserts anything about
  that file.
- **A harness shot of the modal.** Argued under *Pixels*: the harness borrows no
  modal chrome, so the shot would show something the app does not. The vault
  procedure is what reviews it.

**Three design findings ship unaddressed, deferred at the land stop rather than
argued down.** Each was judged real; each was held back because its blast radius
or its authority sits outside this feature, and the owner routes them.

- **Calibrating the CTA's paint.** `harness/calibrate.mjs`'s CHROME list carries
  `app.css`'s unlayered bare-`button` rule and deliberately refuses
  `button.mod-cta`, while `harness/theme.css`'s `mod-cta` fallback sits inside
  `@layer harness-fallback` and so loses to it whatever its specificity — the
  `select` failure that file's own comment records, one control over. So no
  `mod-cta` in this plugin has ever been photographed as a CTA, and the vacant
  state's button measures 1.35:1 in dark. **Deferred, not disputed**: the fix is
  one entry, `/^button\.mod-cta/`, measured against `obsidian-1.13.7` as
  matching four rules that carry only colour and a focus shadow — no geometry, so
  it repaints one button in four PNGs and re-measures nothing. It is the
  instrument's bug rather than this feature's, and it lands with a shot run.
- **The row's control order.** Four controls at one pitch express none of the
  three-way partition *Where the control lives* argues for, and the labelled
  **New layout** now sits immediately left of a clipboard-`copy` glyph — a milder
  form of the `copy`-versus-`copy-plus` adjacency that decided this design.
  **Deferred because it reverses placement this doc approved**, and because the
  proposed fix has its own cost: the first control in a row named **Layout file**
  would stop answering that name, against the **Add component** row's own shape.
  Six lines of code, one case, two spec sentences and about eleven PNGs if taken.
- **A clause in the vacant state.** The headline claim is that cold-start import
  is reachable, and it is reachable only by opening the button and finding
  **Pasted JSON**; a reader holding a friend's layout meets a sentence about
  absence and a button about newness. **Deferred because *The vacant state* keeps
  that sentence by approval**, and because it does not stand alone:
  `noLayoutsMessage` — shown on the sheet's missing-layout state, by **Create a
  character**, and by the layout picker — still names **Add a starter layout** as
  the way a first layout arrives, which this feature made incomplete. One clause
  here would leave the plugin saying two different things, so it is one copy pass
  over both sentences or neither.
