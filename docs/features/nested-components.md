# Nested components

Status: shipped, with one thing withdrawn after it was built
Board card: ✨ A Group holds other components — the six-up "stat beside its skills"
arrangement §13's five-blocks entry parked, and the container the catalog has
carried an entry for since §4.2 was first written.

> **Withdrawn after the build: the collapse.** Group shipped with a `collapsible`
> heading and it is gone. On a grid a container's cell is sized by whatever else
> spans its rows, so closing a group reclaims space *inside* the container and
> only shortens the *sheet* where the group is the tallest thing in its row band.
> In the harness a one-card group beside a group four rows tall closed and the
> sheet did not move — it left a hole exactly the height it saved — while the same
> control on the tall neighbour moved everything below it. One control, one
> layout, two unrelated outcomes, decided by a property of the placement nothing
> states and nothing could show the author.
>
> This document is left as it was written, with the collapse sections marked
> rather than deleted, because the reasoning that led to a wrong control is worth
> more to the next reader than a spec that reads as though it never proposed one.
> **Hiding is a capability a container earns by answering for its own height**,
> which a tab set does and a grid-placed region cannot. The `Resolved:` entry in
> `docs/SPEC.md` §13 carries the correction, and Tab set carries the capability.

*This session's deliverable is the decision, so `docs/SPEC.md` §13 already carries
the `Resolved:` entry and §2, §4.1, §4.2 and §8 already carry what it owes them.
That departs from `/feature-spec`'s rule that `/ship` writes the entry once the
thing is built, on the same grounds the declared-row spec did: the model question
was the product. The remaining SPEC edit — §12's component count and its Group
sentence — is listed under commit boundaries and belongs to `/ship`.*

## Model question

§13's **"Whether Group components may nest, or only hold leaf components."** The
argument is in §13's `Resolved:` entry and is not repeated in full. What this
section carries is the seven decisions that entry names but does not spell out,
each of which had a silent default waiting to be taken.

### 1. Depth: two containers, refused in the parser

**A container may hold containers or leaves. A container inside a container may
hold only leaves.** So the deepest legal component is three levels down, and a
`children` key on a component already two containers deep refuses the layout.

Depth 2 is what §13 asked for and no more. Its own entry names the arrangement:
"whether one outer Group can gather the six under a heading". That is
`Group(Group(Stat, Table))` exactly, and a leaves-only container answers the
motivating case with "spell it differently", which is how a settled question gets
reopened.

Unbounded depth is undefended rather than argued for. No tool in the comparable
set documents or enforces a limit, and the defect record says where the cost
lands: across roughly forty CSB issues, the nesting ones are the severe ones —
#425 has moving a complex panel of nested panels freeze the sheet and then the
whole browser, F12 included, with the template unrecoverable, the freeze
reproducing on every reopen, and the reporter's workaround being to duplicate
templates as manual backups; #503 has editor CSS cascading into child panels;
#536 has alignment failing only inside a tabbed panel. **Nesting fails in the
editor, not in the rendered sheet.** That is a direct warning about the M4 grid
canvas, and this repository's editor today is a flat form over a flat rectangle
set.

Bounded depth is also what makes this buildable before M4, and the reason is
specific: [`preview-grid.ts`](../../src/editor/preview-grid.ts) needs **no change
at all**. `clamp`, `lastColumn`, `describeCell` and `findOverlaps` each take a flat
component list plus a column count, and a container's children *are* a flat list
plus a column count. The schematic becomes the same pure module called once per
open container rather than a tree-aware rewrite of it.

**The refusal is the layout parser's**, not the read path's and not the
component's. `children` has to become shared config the plugin itself reads — the
category [`parseBinding`](../../src/parse/layout.ts#L112) already names for
`reset`, "the same category as `position`" — because the parser must run
`parseComponent` over every child for its position, its id migration, and the
id-and-label uniqueness that keys note sections *globally*, and the sheet view
must flatten the tree before the name table can be complete. Once the parser
walks `children`, depth is shape, and §5's rule applies: the shape of the key is
not forgiven the way its contents are. A component-level refusal would arrive
after the parser had already accepted and walked the depth it was refusing.

The check is **structural, not type-aware**: a `children` key on a component two
containers deep, whatever its `type`. So `src/parse/` needs no import from
`src/components/`, and the rule holds for a container type nobody has written yet.

### 2. A container holds an inner grid, not an ordered list

A container's `children` are placed on the container's own grid, and **that grid
has exactly as many columns as the container is wide**. No `columns` config field:
one rule, no new key, and a child's column is the same width as a sheet column, so
a card inside a group measures the same as the identical card outside it. That is
UI §9's rule about two controls not measuring differently under the same finger,
read one level up.

An ordered list was the alternative and it fails on §8. `col`, `row`, `width` and
`height` are required by `parsePosition` on every component, so a stacked
container would either ignore all four — the editor's schematic writes them and
its form shows them, and they would silently do nothing — or refuse keys the
parser requires. §8's "a component fills its placement" has to keep meaning
something one level in, and an inner grid is the only reading where it does: a
child two inner columns wide is two inner columns of card.

An inner grid is also what makes one level of nesting enough. The six-up wants two
dimensions inside one heading, and a stacked container can only give one, so a
stacked container would have needed depth to express the arrangement that a grid
expresses flat.

Three consequences worth stating rather than discovering:

- **Membership is explicit, never derived from the rectangles.** A container
  whose children were "the components inside its rectangle" cannot collapse:
  hiding them has to reclaim their space, and a sibling at `grid-row: 8` does not
  move up when a component at row 5 disappears. Containment must be a subgrid for
  hiding to mean anything, and `findOverlaps` already reports one rectangle inside
  another as the error state it is.
- **~~`height` stays the hint it already is.~~ Reversed by `tab-set.md`.** This
  said the inner grid sets `grid-template-columns` and no `grid-template-rows`, so
  a container whose children needed more rows than its placed `height` simply
  grew. It was wrong on its own terms and not just short of what a tab set needs:
  it made a container's declared `height` mean nothing at all, and it broke the
  bullet below in the direction nobody checked — the columns agreed exactly and
  the rows did not, so a child two rows high inside a container was not the height
  of the identical component two rows high outside it. **An inner grid is the
  placement, both halves**: `width` columns by `height` rows, as
  `repeat(height, minmax(0, 1fr))`. A container occupies the space it declared and
  leaves declared cells empty rather than shrinking, which is §8's "a component
  fills its placement" applied one level in — and it is the same rule that took
  the collapse out.
- **The columns agree exactly, not merely in count**, and the arithmetic says
  they must: a component *W* sheet columns wide occupies `W·T + (W−1)·G`, and an
  inner grid dividing that into *W* columns with the same gap resolves to `T`
  again, for any width and any gap. Measured at 106.5000px inside and out. This
  bullet predicted "a few pixels narrower, because a container has padding" and
  was wrong — the container adds no padding, and a disclaimer in the code's
  favour is the worse direction to be wrong in, because it tells a later reader
  not to trust an alignment that holds. The exactness is load-bearing for the
  whole design, since it is what lets a group need no box, so it is now a rule
  the stylesheet is held to rather than a hope.

### 3. Reflow, tab order, and whether hidden content is in the DOM

§8's promise is the thing being amended, and the amendment is in §8 in words. In
summary:

**The order is a depth-first walk, each level in its own grid reading order.** A
container's children are read where the container sits, before the container's
next neighbour. That is the same sentence §8 already has, applied per level rather
than once, and it is what a heading over a region promises: the region reads
together. Both the single-column reflow and tab order follow it, as they do today.

**A container is its own reflow context.** `container-type: inline-size` on the
container, and its inner grid collapses on its own width. This is UI §4's argument
for a container query rather than a media query, but stronger: a group four
columns wide inside a 1200px pane is about 380px, so it must reflow while the
sheet around it does not — a case a media query cannot see at all.

*Corrected while building.* This said "under the same 480px the sheet grid uses…
one threshold rather than two, because two numbers are two answers to 'when is it
narrow'". The instinct was right and the execution inverted it: 480px was
calibrated for twelve columns, so reusing the number at two or four columns is a
different rule wearing the same digits. Measured, the inner column width at which
a container collapsed ranged over 7x — 236px at two columns, 32.7px at twelve —
and a two-column container could not place two children side by side at **any**
pane width up to 2400px, which made the six-up arrangement this whole entry exists
to enable unreachable at three per row below a 1489px pane. What is actually one
rule is **40px a column**, of which the sheet's 480px across twelve is an
instance: twelve columns collapse where they always did, four collapse at 160px,
and the sheet's own number is now derived rather than coincidental.

*And a second condition, found by looking at the narrow shot after making that
change.* Per-column alone fixed the wide end and broke the narrow one: at a 380px
pane the sheet collapses, so every component gets the whole pane, and a container
that is then 348px cleared its own threshold and kept a grid — two cards at 80px
with their titles elided, on a phone. Its own width cannot report this, and not
for want of a better number: a two-column container is 221px on a 1400px pane
where it must hold and 348px on a 380px pane where it must not, so the narrow case
is the *wider* one and no threshold on container width separates them at all. So
`.sheetsmith-view` is a named container and the inner grids follow it down. Two
conditions, but two questions: "are my own columns too narrow" and "has the sheet
given up being a grid".

**Hidden content is in the DOM.** *(Written for the collapse. The half that
survived is that it stays in the DOM; the spelling and its consequence both
reversed, and `tab-set.md` governs. An earlier annotation here claimed the section
was "unchanged by the move", which was the opposite of true.)*

What was written: the hidden body carries `hidden="until-found"`, so it is out of
the accessibility tree and out of tab order, **and find-in-page still reaches
it** — the whole reason for that spelling rather than `hidden` outright, since a
character sheet is a reference document and "where is my Stealth" answered with
nothing found, on a sheet that has it, is a bad failure. The browser fires
`beforematch` on reveal and the container opens itself around the match.

Why it reversed. `hidden="until-found"` runs on `content-visibility: hidden`,
which removes the content **from layout**. A panel contributing no height is a
panel whose appearance changes its container's size, and that is the collapse
again by another route. Since a container's size is declared and hiding must not
change it, every panel has to stay laid out — `visibility: hidden` and `inert`,
which keeps a panel out of tab order and out of the accessibility tree while
keeping its height, and takes find-in-page with it. So the two cannot both be had,
and `tab-set.md` takes no-shift and states the loss.

What survives unchanged: hidden content is **in the DOM**, and it is **evaluated
and rendered** — see 6 below, whose argument stands on its own.

### 4. `display` does not arrive

The design heading into this session was that `collapsible` gives way to a
`display` field taking stacked, collapsible or tabs. **The research overturned it,
and what survives is the substance rather than the spelling.**

*Read this section knowing where it ended up: it concluded that `collapsible`
stays a boolean, and the boolean itself was withdrawn after the build. The
argument for tabs being their own entry is the half that held, and it held
harder — the thing that separates a tab set from a group turned out to be
exactly the thing that made a group unable to hide anything.*

Three independent tools put tabs one level up as a container of containers rather
than as a display mode of the plain container: CSB ships Panel and Tabbed Panel as
two separate entries in a catalog of seventeen, with the Tabbed Panel holding a
panel per tab; Sandbox puts tabs above panels and its root accepts nothing else,
"Template Actors can only hold Tabs and/or cItems"; Palantir Workshop, a different
industry entirely, does the same with sections inside layouts.

Convergence across three tools is evidence but not the argument. The argument is
local, and it is §13's own:

- **The children mean different things.** A group's children are shown together;
  a tab set's children are alternatives, exactly one visible. One key saying two
  things has no right answer, which is the rule §4.1 already applies to `display`
  against `compute`.
- **~~A tab must be a region and a card need not be.~~ Withdrawn.** It said a tab
  set carries a constraint on its children that a group does not, enforced when
  the layout is read. `tab-set.md` allows a tab to be any component, because
  requiring a Group is ceremony on a tab that holds one Table — so there is no
  such constraint and this argument is gone.
- **~~`collapsible` would be meaningless in tabs mode and the strip meaningless
  outside it.~~ Half withdrawn.** `collapsible` no longer exists, so what is left
  is a strip inert outside tabs mode, which is one inert thing rather than a type
  whose config is half inert either way.

So **tabs become their own catalog entry, Tab set, and `display` is not added** —
**on the first argument alone.** Three were written and two have since gone, which
is worth stating rather than leaving the reader to count. The survivor is the
load-bearing one: children shown together against children that are alternatives,
one key saying two things. §13 records the same erosion, and it changes nothing
about the decision except how much is holding it up.
With tabs gone the field would take two values, and a two-valued select is a
boolean spelled longer.

What that does to question 4's second half: **a layout still holding `collapsible`
keeps meaning what it always meant**, because the key is untouched. *(After the
withdrawal it means nothing at all: it is an unknown key, carried through the
round trip like any other and ignored, which is the same non-event for the same
reason — nothing has been released, so no file in the wild holds one.)* §10 is engaged
only to say it is not engaged — nothing is renamed, nothing is dropped, and no
character note has ever stored container state, so there is no data for a
migration to be careful with. §13's own precedent covers the file side: nothing
has been released, so no layout exists outside this repository's fixtures and a
throwaway vault.

The brief's argument for tabs survives intact and is why Tab set is worth having:
a tab set never changes the sheet's height where a collapse does, which is the
difference on a phone, and a top-level tab set spanning the full width *is* the
whole-sheet multi-page idea a "pages" feature was reaching for. Two properties fall
out of the depth rule rather than needing rules of their own — a tab set whose
children are groups cannot itself be nested, because its groups would be the third
container, which is Sandbox's root rule arrived at from the other end.

**Tab set is not built here.** §12's rule is component by component, all the way
through read, write, render and tests before the next one starts, and this spec is
Group. §4.2 gains the Tab set entry the way it has carried the Group entry all
along, and it ships under its own spec.

### 5. A container publishes nothing, and containment is not addressing

No `scopeValues`, no `scopeRows`, no `applyReset`. §4.1 already covers a component
holding nothing a formula could reference: it leaves the member off and nothing
else learns it exists.

The half the question was really about: **a child's published name is unchanged by
being inside a container.** `abilities.DEX` inside a group is `abilities.DEX`. No
segment is added, at any depth, so §13's open question about how deep a published
name may go is neither advanced nor made worse — which is the point, because a
child coming to need a third segment to be reachable would have made the six-up
arrangement wait on a question this feature has no business settling.

That is also the convergent finding, and it is unanimous: no builder makes
containment addressable. CSB's own word for a Panel is "invisible"; its
`fetchFromParent` looked like the exception and is not, since it walks *document*
ownership — an item inside an item inside an actor — and the wiki says it "doesn't
work on Actors, only Items, because Actors don't have parents". Roll20 attribute
names are flat regardless of surrounding divs, and Sandbox property keys are
global. Nesting has cost nobody a name segment anywhere.

Two consequences:

- **The character note is unchanged by this feature. Not one byte.** A container
  has no section, so the note stays a flat list of `##` headings, one per leaf.
  Constraints 2 and 3 hold by not being in the diff.
- **A child's `label` is still globally unique**, because it still keys a note
  section. Containment does not scope labels or ids, and the parser's existing
  uniqueness checks run over the flattened walk.

The mechanism that makes "a container holds no data" bite rather than be prose:
`StorageKind` gains `'none'`, and `contract.test.ts` asserts that a component
declaring it publishes nothing and implements no `applyReset`. Declaring `fenced`
for a component with no fence is a statement nothing checks and a reader would
believe. Nothing outside a component reads `storage` today, so the widening breaks
nothing; what it buys is that the sheet view skips `getSection` and `read` for a
container, so a note holding unmapped prose under a heading that happens to match
a group's label is never even looked at (§10).

### 6. A hidden child is evaluated and rendered, exactly as a visible one

This is a real choice because §5's name table is lazy and memoised, so skipping
hidden children would change what runs.

**They are evaluated and rendered.** The argument: the name table is driven by
whoever *reads* a name, not by whoever draws it, so a hidden ability card's
`display` is already computed on behalf of the pool elsewhere that reads
`abilities.DEX`. Skipping the draw saves the draw, not the arithmetic — and the
draw is what keeps the container's size the size it declared (3 above, as
reversed) and a control's index stable when a tab is switched. *It said "findable"
here, which was true only of the spelling that reversed.* The research found no performance evidence
either way on whether hiding a tab's contents saves evaluation cost, so absent
evidence this takes the answer that keeps behaviour uniform. What would change it
is a measurement: a sheet whose hidden cards make it measurably slow to open.

The corollary is the part worth writing down, because the alternative is a bug
nobody would look for: **hiding is never a way to make a formula not run.** A
collapsed group's Pool still publishes its name, still resolves its `max`, still
resets on a Long Rest, and still appears by name in that trigger's confirmation
list. A reset whose meaning depended on what the reader happened to have open
would be the same class of failure as §5's grid-order `?`.

### 7. Reset triggers: a container is offered none, and offers none for its children

A container holds no state, so no `applyReset`, and §4.1 already states the
consequence: it is offered no binding in the editor and a trigger passes over it.

The tempting extra is a container-level binding — bind six pools to Long Rest in
one place — and it is refused. §6's binding carries an `action`, and only the
component knows what `full` means for it; a container binding would have to fan
out into per-child bindings the container cannot author. Worse, a container binding
plus a child's own binding on the same trigger is exactly the ambiguity §6 refuses
a layout for ("two bindings on one trigger… the second would win unannounced"),
one level up, with no file shape to refuse it in.

Convenience for the author is editor sugar over per-child bindings, which is the
same shape §6 already gives the trigger hierarchy it declines to build: expressible
by expanding one binding into several, needing no change to what a component
implements. It lands in **Deliberately not doing**.

### What this settles, and what it leaves open

Settled: §13's nesting bullet, in full and for both containers. §13's five-blocks
entry named the six-up "stat beside its skills" block as "the one waiting on the
nesting bullet"; it is now expressible, as an outer Group of six Groups each
holding a Stat and a Table.

Left open, deliberately and unchanged: **how deep a published name may go**, which
this feature does not touch because containment adds no segment. **Whether the two
runtime cycle guards should know about each other**, untouched. Both stay in §13
as they are.

## What it does

A layout may put components inside a titled container. Six ability cards each
beside their own skills table under one **Abilities** heading; a **Background**
region holding a portrait, a Rich text block and a features table, named as a
region rather than as three unrelated cards.

What that is worth, stated plainly because the withdrawal makes it the whole of
the feature: a name for a region at a rank above the labels the cards inside it
carry, an inner grid that reflows on its own width, twelve cards that relocate by
moving one block, and the panel a tab will hold. The last is the only
unconditional one, and it is why this component reads as thin on its own — it is
the support, and Tab set is the payoff.

A group is chrome and arrangement and nothing else. It stores nothing, publishes
nothing, resets nothing, and adds no segment to any name a formula reads. What it
changes is what the reader sees at once and what they can put away.

## Design

A group must read as a region *behind* the cards, never as a fourth kind of card
beside them. UI §9 names that failure precisely — "a fourth kind of panel beside a
row of cards reads as loose chrome floating on the page" — and a container is the
one component where the temptation is structural rather than incidental, because it
genuinely does surround things.

So: **a heading over a region, with a hairline rule under the heading and no box
around the children.** No border, no surface, no inset background, no indent.
Alignment is free here, because the inner grid has exactly as many columns as the
container is wide — a card inside the group lines up with a card outside it,
column for column — and anything more would be a box drawn around boxes.

*Corrected while building.* This said the region "is legible from alignment
alone", and that was the wrong claim about the right decision: alignment is what
makes a box unnecessary, not what makes a region legible, because two things
lining up is the absence of a signal rather than one. Measured, the single
hairline is 1.27:1 in light and 1.35:1 in dark — the same value a card uses,
except a card also has a fill — so at one strength for both levels an outer region
and an inner one were two identical lines and a reader could not tell which
contained which. **The heading and its rule are the only device, so they carry
it**: a top-level heading's rule takes `--background-modifier-border-focus` and a
nested one keeps the plain hairline. Still no box, no surface and no indent.

The heading is the group's `label`, sized as a section heading rather than as a
card title, so it sits a level above the labels inside it. `hideLabel` drops it for
a group that is pure arrangement.

**~~The collapse control is the heading.~~ Withdrawn.** What was here — the whole
heading row as the button rather than a chevron beside it, Obsidian's own glyph
through `setIcon`, the chevron rotating as the only thing that moves, and the
collapse state held per-viewer by the view rather than written into the note — was
built, reviewed on screen, and removed. It is not restated because none of it was
wrong *as a control*; what was wrong was that the control had nothing coherent to
do on a grid, and a good disclosure over an incoherent outcome is still an
incoherent outcome.

Two things from it are worth keeping in writing, because Tab set will want both.
The **state question**: hiding state is per-viewer and never in the note, which is
Obsidian's own answer for its own folds ("the 'fold' state information is not part
of markdown, and is not stored inside the note itself") against Sandbox's, which
stores it in the character's data — and Obsidian wins here because our notes are
files people hand-edit and because a container that stored anything would end this
design's premise. The **rebuild question**: whatever holds that state cannot be the
component's own closure, because the sheet re-renders on every committed edit
(`applyEdits` → `renderSheet`), so a container taking its state from the layout
alone would spring back the moment a pool was edited. The view is where it goes,
beside `captureFocus`/`restoreFocus`, which already carry structural state across
exactly that rebuild.

**Focus.** `captureFocus` identifies a control by its cell index among
`.sheetsmith-cell` and its control index within that cell, and today it takes the
*first* cell containing the active element. Children get their own
`.sheetsmith-cell` on the inner grid, so the first match becomes the container and
every child's controls are numbered against the whole group — meaning adding a card
to a group renumbers every control after it. It has to take the **innermost**
match. One line, and it is what keeps a control's identity local to its own
component.

**Empty and error states.**

- **An empty container is not an error.** A group with no children draws its
  heading and a quiet empty region. That is what a layout part-way through being
  built looks like, which is the reading §6 already takes for a declared trigger
  nothing binds to.
- Every refusal below is a `configError`, so the container renders its own error
  and draws no children, per §10 and PATTERNS §4. Error text names the fix.

| Refused | Message names |
| --- | --- |
| ~~`collapsible` with `hideLabel`~~ | *(gone with the collapse: it was the only combination of a group's settings with no reading, so a Group now has no `configError` at all)* |
| A child two containers deep | *(the parser's, not the component's — it refuses the layout)* |
| A container inside a component that holds a value | *(the registry's, through `undrawableMessage`: which types exist and which hold components are both its answers, not a component's)* |

**A Group with no config guard is a statement, not an omission.** One setting
cannot contradict another, so there is nothing for one to refuse, and the two ways
a layout can still be wrong about containment are both answered above a component:
the parser refuses depth, and the registry refuses cards inside a card.

### The layout editor

Nesting is where the prior art says the pain is, so the interim editor gets the
smallest thing that is honestly authorable, and no more.

**The component list becomes one level of disclosure.** A container's row lists its
children indented beneath it, each with the same edit and remove buttons a
top-level component has. The list is already built by iterating
`layout.components` and rendering a `Setting` per entry; it iterates the ordered
walk instead.

**Add component** gains a destination. The existing dropdown-and-button row
(`renderAddRow`) grows a second dropdown naming "the sheet" or any container that
may still take a child — which excludes a container already two deep, so the
parser's rule is never something the editor can walk into.

**The schematic is the same module, drawn twice.** The sheet's schematic draws
top-level blocks, with a container as one block; when a container is open for
editing, its own schematic sits above its form and draws its children against the
container's width. `preview-grid.ts` is unchanged: `lastColumn` takes the column
count it is given, and `findOverlaps` takes the list it is given.

**Removing a container moves its children out rather than deleting them.** The
confirm modal says so. §10's instinct is the argument even though a component
config is not character data: the alternative is losing six components' formulas
in one click, and the current modal already promises only that "character notes
keep their sections". Children land at the top level at `nextFreeRow`, which is
where a newly added component goes, so nothing arrives overlapping.

## Config fields

`children` is **not** a config field. It is shared config the plugin reads, in the
category `id`, `type`, `label`, `position` and `reset` already occupy, so it joins
`RESERVED_KEYS` and a component declaring it fails `contract.test.ts` — the same
rule that keeps `position` out of a component's own form.

Group's own fields:

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `hideLabel` | boolean, group `Appearance` | Hide the heading | Draws the components with no heading over them, for a group that is arrangement rather than a named section. The components inside keep their own labels either way. |

Two fields were here and both went with the collapse: `collapsible`, and
`startCollapsed` conditional on it. Their removal took the last `visibleWhen` on a
boolean anywhere in the catalog with them, which cost a test its subject — the
settings tab's redraw-and-restore-focus path now has no control that drives it, and
that is a standing row in `docs/PATTERNS.md` §11 rather than a thing this feature
left unfinished.

`formulaFields` is empty. A container has no numeric field to compute.

## Data and file model

**No character note changes, and none is rewritten.** A container has no section,
no fence, no heading in the body. `read` returns `{ ok: true, data: null }` and
`write` returns its `body` unchanged — both unreachable in practice, because
`storage: 'none'` makes the view skip `getSection` and `read`, and a container
never reports an edit for `write` to serve. They exist because the contract's five
are the five, and they are trivial rather than conditional.

Constraint 3 holds by not being in the diff. Constraint 4 is not engaged: nothing
is stored, so nothing can be deleted.

**The layout file gains one shared key.** `children`, an array of component
configs, on any component that takes one. Existing layouts have none, so absent
means today's behaviour everywhere, and every layout in the fixtures and the
throwaway vault renders exactly as it does now.

What the parser owes:

- Walk `children` recursively, running the existing `parseComponent` over each, so
  a child gets the same position check, label line-break check and reset parsing a
  top-level component gets.
- Refuse a `children` key on a component two containers deep, naming the component
  and the rule.
- Run id migration, id uniqueness and label uniqueness over the **flattened** walk.
  Labels key note sections globally, so a child sharing a label with a component
  in another group is the same collision it has always been.
- Preserve unknown keys on a child, as it already does for a top-level component.

One factoring is load-bearing and belongs here rather than in the design. The
ordered depth-first walk is needed by the sheet view (to read every section before
rendering any, so the name table is complete), by `buildSheetEnv`, by
`renderTriggers`, by the editor's list, and by the harness — which renders the
genuine pipeline and builds its own grid. Five callers, and `publishedComponent`
already exists in `src/formula/sheet.ts` for exactly this reason, with its comment
saying why: "the harness builds the same thing and the two must not disagree." So
the walk is one exported pure function in `src/parse/layout.ts`, beside the
structure it walks, imported by all five. A second copy is the class of divergence
PATTERNS §11 already carries a row about.

## Acceptance criteria

- [x] A layout placing a Stat and a Table inside a Group renders both inside the
      group's region, at their own positions on an inner grid whose column count
      is the group's width.
- [x] `abilities.DEX` resolves identically whether the Stat group is top-level or
      inside two containers, driven through `buildSheetScope` rather than through
      the renderer.
- [x] A Group inside a Group renders, and a component inside a third container
      refuses the layout with a message naming the component and the depth rule.
- [x] The refusal is raised by `parseLayout`, asserted in `layout.test.ts`, and no
      file in `src/parse/` imports from `src/components/`.
- [x] A child's label colliding with a component in another container refuses the
      layout, with the existing duplicate-label message.
- [x] A child whose id needs migrating is migrated, and its migrated id is unique
      against the whole flattened set rather than against its siblings.
- [x] Tab order and the narrow single-column reflow both follow the depth-first
      walk: a container's children come between the container and its next
      neighbour, asserted over a layout where file order and grid order disagree.
- [x] A container four columns wide inside a wide pane reflows its children to one
      column while the sheet around it stays a grid. *Ticked on the rule as
      corrected: a container collapses on its own column density, 40px a column,
      so the four-column case reflows below 160px of container width while the
      sheet is still a grid. As first built it reflowed below 480px, which fired
      at a 1400px pane where the sheet is plainly wide — the criterion was
      satisfied by a bug that made it easy to satisfy.*
- [x] **A group never hides its region**, in either state of `hideLabel`.
      *Replaces five criteria that the collapse owned: the hidden body's three
      effects, its survival across a re-render, `startCollapsed`, and the one
      configuration a heading-as-control could refuse. All five were met before
      the withdrawal; asserting the absence is what is left, and it is the one
      that catches the control coming back.*
- [x] A Pool inside a group publishes its value, resolves its `max`, and appears
      by name in a Long Rest's confirmation list — which is now simply the rule
      that containment changes nothing, with no hidden case to except.
- [x] A Group declares no `configError`, and the two ways containment can still
      be wrong are refused above it: depth by `parseLayout`, a card holding cards
      by `undrawableMessage`.
- [x] An empty Group renders its heading and no error.
- [x] `StorageKind` accepts `'none'`; `contract.test.ts` asserts a component
      declaring it publishes nothing and implements no `applyReset`; the sheet view
      calls neither `getSection` nor `read` for one.
- [x] `group` declares no `children` config field, and `contract.test.ts` refuses
      one, as it already refuses `position`.
- [x] `captureFocus` takes the innermost `.sheetsmith-cell` containing the active
      element, with a test that focuses a control inside a container and asserts
      the index it captures is that control's index within its own cell.
- [x] The ordered walk is one exported function, with a test asserting the view,
      the trigger loop and the editor's list all order the same layout the same
      way. *Ticked on a reading the tests actually hold, after the first tick was
      a claim they did not. The walk is `walkComponents`, which the read pass and
      the trigger loop iterate flat; the grid descends one level at a time
      through `componentsInside`, which the view and the harness now share
      instead of spelling twice; and `layout.test.ts` asserts the descent
      flattens to exactly the walk, over a layout whose file order and grid order
      disagree at both levels. The editor's list is asserted separately in
      `layout-editor.test.ts`. What still has no test of its own is
      `SheetView.renderLevel`, because the view cannot be constructed — but it
      now orders through the shared function rather than through a second
      implementation, so driving the harness drives the view's ordering.*
- [x] The layout editor adds a component into a chosen container, and does not
      offer a container that is already two deep as a destination.
- [x] Removing a container in the editor keeps its children, placed at the top
      level, and the confirmation says so.
- [x] `preview-grid.ts` is unchanged. Any diff in it is a finding against this
      criterion, not a refinement of it.
- [x] `npm test`, `npm run lint` and `npm run build` clean.

Criteria that are a look, and stay unticked until somebody looks at
`npm run harness:shot`:

- [x] **A group reads as a region behind the cards, not as a card beside them**, in
      both themes: the heading sits a level above the card titles, the hairline
      rule reads as a section rule, and no card inside the group is enclosed by a
      second border. *The heading takes Obsidian's own treatment for a heading
      over a region, `--setting-item-heading`'s `--font-ui-medium` at
      `--font-semibold` in `--text-normal`, read out of the app's `app.css`
      rather than chosen. Against a card title — the uppercase tracked
      micro-label a card renders, which is what §2 means by a card — that is
      unambiguous. Against a **component** label such as a Table's own name it is
      one step of the app's type scale, 15px against 13px at the same weight, and
      it was reported as too thin. Kept: the alternative is inventing a
      distinction the app itself does not make between a section heading and a
      field label, which is what UI §1 exists to prevent, and the hairline and the
      chevron carry the rest.*
- [x] **A card inside a group aligns column-for-column with a card outside it**, at
      the same declared width — *while the container's own grid holds*. Measured:
      at a 1900px pane every level resolves to 148.156px tracks, the sheet's
      included, and `Attack bonus` inside the group spans exactly the columns
      `Strength` spans outside it. The qualification is the criterion's, not a
      let-off: a container whose own columns would fall under 40px collapses to
      one column, and a card there is the full width of its group and lines up
      with nothing. That case is deliberate. It is also now rare, which it was
      not when this was first written: the threshold was 480px for every
      container, so the 1400px default stacked every four-column group and the
      aligned case appeared in no default view at all. It holds at 1400px now,
      and `harness:shot` keeps `sheet-wide` as a second width where the tracks
      are large enough to check by eye.
- [x] The heading reads as plain text, with nothing on the row suggesting it can
      be pressed.
- [ ] **A one-card group beside a tall one does not read as broken.** This is the
      criterion the collapse failed and the reason it went, so it outlives it: the
      grid rows are sized by the tall neighbour, so the short group's cell carries
      slack no container can reclaim, and what has to be looked at is whether a
      heading over a card with space under it reads as a region or as a mistake.
      Unticked: it is the open question the withdrawal leaves, and the harness
      sample keeps the pair on screen for exactly this.

Three look criteria went with the collapse — the heading reading as pressable, the
open and closed states both looking deliberate, and the chevron being the only
thing that moves — along with the one criterion no test could ever settle, whether
Electron honours `hidden="until-found"` and `beforematch`. That last one did **not**
move to Tab set: the spelling reversed, so what Tab set asks somebody to confirm is
the opposite outcome, that find-in-page does not reach an unopened tab and behaves
as stated rather than in some third way.

## Commit boundaries

1. `feat: Let a layout put a component inside another`. `children` as shared config
   in `parseComponent`, the depth refusal, the flattened id and label checks, the
   exported ordered walk, `StorageKind` gaining `'none'`, and the `contract.test.ts`
   rules for `'none'` and for `children` as a reserved key.
2. `refactor: Find the innermost cell holding the focused control`. `captureFocus`
   and its test.
3. `feat: Render a component inside a container`. The sheet view's recursive prepare
   and render, inner `.sheetsmith-cell`s, the inner grid and its container query,
   and the harness rendering through the same walk.
4. `feat: Group components under a heading`. `group.ts`, its `configFields`, its
   tests, and its registration.
5. `feat: Nest a component in the layout editor`. The disclosure list, the
   destination dropdown, the container schematic, and removal keeping its children.
6. `docs: Record how deep a container may nest`. §12's component count and its
   Group sentence. §2, §4.1, §4.2, §8 and §13 were written in the spec session and
   are already in the tree.

The collapse was a commit of its own here — `feat: Collapse a group`, with
`collapsible`, `startCollapsed`, `hidden="until-found"`, `beforematch`, the
view-held state and the chevron — and it is not in the list because it is not in
the tree. It was built and then taken out before anything was committed, which is
exactly what `CLAUDE.md` § When to commit says the uncommitted tree is for: an
edit rather than a revert, and the history records the result the user approved
instead of the round trip to it.

## Found while building

**The collapse had to go, and looking at the sheet is what said so.** It is the
largest thing this feature found, and none of it was reachable by reasoning about
the code: every test passed, the control was accessible, the state survived a
rebuild, and the disclosure was drawn the way UI §7 asks for. What the harness
showed was a one-card group closing beside a group four rows tall and the sheet
not moving — a hole the exact height of what had just been hidden, because grid
rows are sized by the tallest thing spanning them. The same control on the tall
neighbour worked perfectly. So the defect was not in the control at all; it was
that a grid-placed container does not own its own height, and a control whose
outcome depends on which sibling happens to be tallest is a control whose outcome
the author cannot predict or be shown. **The rule that came out of it — a
container may only hide content it answers for the height of** — is now SPEC §8's
and is what puts hiding on Tab set. Filed here as the third entry in §12's list of
corrections that came from driving a rendered component rather than from reading
its code, after the proficiency spinner and the typed amount.

**`RenderContext` grew the container's half of the contract, not
`ComponentDefinition`.** The design says the view owns the recursion and the
container owns where its region sits, and nothing in the spec said how those two
meet. They meet on `renderChildren(into)`: the view hands a container a callback,
the container calls it with the element it wants the inner grid inside. That is
what keeps the collapse honest — the group hides an element it created rather
than the view guessing which of a component's children is the one holding the
others — and it keeps `contract.test.ts`'s "declares nothing outside the
contract" intact, because `RenderContext` is not the definition. `link` is the
precedent for an optional context member, on the same terms: absent where there
is nothing to give.

That reason outlived the collapse it was written for: a container still owns where
its region sits, and a tab set will hand `renderChildren` an element under a strip
exactly as a group hands it one under a heading.

**Collapse state travelled the same way and went with it.** `collapsed` and
`onCollapse` were a pair of context members, the view holding the map and the
component reading the layout's posture where the map said nothing. Named members
rather than a general "view state" slot, because one consumer earns no
generalisation (PATTERNS §1) — which is what made them cheap to remove, and is
the shape an active tab should take rather than the members themselves.

**`storage: 'none'` is what marks a container**, which SPEC §4.1 already says in
words ("`none` is a container"). So nothing needed a new contract member to say
so: the view skips `getSection` and `read` on it, and the editor offers exactly
those components as a destination. Worth recording because the marker is a
*consequence* of the storage kind rather than a declaration of its own, so a
storage-less component that is not a container would move it — which is why the
question is asked through one exported `isContainer` in `types.ts` rather than
by comparing against `'none'` at each site. It had four production spellings
first, and that is §1's policy case: a guard test over them could only assert
they all still spell the same string, which is what one predicate says for free.
Two of the four were the sheet view and the harness deciding whether a section is
read at all, and those two disagreeing is invisible in review, because appearance
is reviewed in the harness.

**A boolean config field controlling `visibleWhen` was inert**, and this feature
was the first to need one — then stopped needing it, which is why the fix is in
the tree with nothing driving it (`docs/PATTERNS.md` §11). Every other kind redraws the form on commit — a select
"may control another field's visibility" — and a boolean did not, so
`hideLabel`'s `visibleWhen: { key: 'collapsible', equals: false }` would have
been a condition nothing re-evaluated and the form would have gone on offering
the one combination the card refuses. Fixed in `renderComponentForm`, and
conditionally: a redraw tears the whole tab down, and most checkboxes there
change nothing but their own key.

**`captureFocus` and `restoreFocus` moved to `src/view/cell-focus.ts`.** The
innermost-cell rule is one line with a trap in it and no way to drive it: `
SheetView` cannot be built without a workspace. Two pure functions over a root
element can be, and the two component tests that were importing `FOCUSABLE`
through the view now import it from there instead, which takes `obsidian` out of
their import graph.

*The three findings below were the collapse's, and they are kept because each is a
rule the next disclosure on this sheet will meet again.*

**The chevron sat at the end of the heading row, not beside the words.** Beside
them, the heading text starts an icon's width in from where every other heading
on the sheet starts — visible immediately in the harness with a collapsible group
above a plain one, and it reads as the container indented from its own children.
Moving it to the far end fixes the alignment and states the intent better
anyway: at the end of a full-width row it is the row that looks pressable, which
is what UI §7 asked for.

**A plain heading and a collapsible one took the same vertical padding**, on the
shared class rather than on the pressable one. Two headings of the same rank at
the same grid row would otherwise put their hairlines at different heights, which
is UI §9's rule about two controls not measuring differently, read one level up.

**The container query fired at a width nobody would call narrow, and that was a
bug wearing a decision's clothes.** A four-column group inside a 1400px pane is
about 450px, so under the original 480px threshold its children stacked — two
cards declared side by side became one column apiece, on a sheet with full-width
tables either side of them. I wrote it up as the deliberate trade of "one
threshold rather than two" and defended it twice before measuring it properly.
What the measurement said: the rule was not one rule. The inner column width at
which a container collapsed ranged over 7x with its column count, a two-column
container's grid was dead at every realistic pane width, and a four-column one
flipped across 1489px — inside the range a single user resizes through in a
session. **The lesson is about the reasoning, not the number**: "one threshold"
sounded like parsimony and was a category error, because a threshold is only one
rule at the scale it was calibrated for. The fix is the scale-invariant reading
of the same instinct — 40px a column, of which the sheet's 480px across twelve
columns is an instance — tabulated into twelve `@container` blocks because a
query can neither multiply nor read a custom property, and guarded in
`styles.test.ts` so the table cannot drift off its formula. The fix then needed a
second condition of its own, which the narrow shot caught and no test would
have — the wide end and the narrow end wanted opposite things from the same
container width.

**The view and the harness kept finding new ways to say the same thing.** Three
times over: the grid's DOM shape, which became `grid-cells.ts`; the container
test, which became `isContainer`; and the descent through the walk, which became
`componentsInside` after the two had it in different spellings — the view
aligning `walk[i]` against its own `prepared[i]` by index, the harness matching
by config identity. Those agreed only while both lists were built by mapping over
the walk in order, so a filter on either side would have broken the view while
leaving the harness right, which is the worst direction available: appearance is
reviewed in the harness. Worth recording as a pattern rather than three
incidents — a second renderer over one model invites a copy at every seam, and
the seam is wherever the two need the same answer about a component.

**An unknown container type loses its children from the sheet, not from the
note.** The type is what would have said where the region goes, so there is
nowhere to draw them; they are still read and still publish, so every formula
naming one still resolves. Recorded because the alternative — drawing them at the
top level — would move components the author never moved.

## Deliberately not doing

- **A third level of containment.** Argued above. The parser refuses it, so opening
  it later is a decision somebody takes rather than a shape that leaks in.
- **Tab set.** Its shape is settled here only in the half that mattered: its own
  catalog entry rather than a `display` value, and §4.2 carries the entry. Two
  things this bullet claimed are corrected by `tab-set.md`, which governs. **A tab
  may be any component**, not only a container — requiring a Group is ceremony on
  a tab that holds one Table — so a tab set is **not** top-level by consequence of
  the depth rule: one inside a Group is the second container and its leaf tabs are
  legal. What the depth rule does refuse is a tab set whose tabs are containers
  being nested, since those tabs would be the third.
- **A `display` field.** With tabs as their own entry it would take two values,
  and after the withdrawal it would take one.
- **Collapsing a Group, in any spelling.** Not deferred — refused, and the reason
  is a property of the grid rather than of the control: a container whose height is
  decided by its siblings cannot promise anything about hiding its own contents.
  A full-width-only collapsible group would be coherent, and it was weighed; it
  buys one arrangement of the several an author would try, and Tab set covers the
  case that wanted it without a placement rule nobody can see.
- **A `columns` config on a container.** The inner grid is the container's width, so
  a child's column is a sheet column. A configurable count buys finer subdivision
  at the cost of cards inside a group measuring differently from cards outside it,
  which is the one thing UI §9 says a new component must not do.
- **A container-level reset binding.** §6's ambiguity one level up, with no file
  shape to refuse it in. Binding six pools at once is editor sugar over per-child
  bindings, which is the same relationship §6 records between the trigger hierarchy
  and the binding list.
- **A container publishing anything, including a segment in its children's names.**
  Containment is not addressing. §13's depth question stays exactly where it is.
- **Hiding state surviving a note being closed.** Moot here and Tab set's to
  decide. Whatever holds it, it is not the note: persisting in plugin data is
  possible with no migration, and it is also per-device, unbounded in size, and
  answers a question nobody has asked yet.
- **Skipping evaluation or rendering for hidden children.** Uniform behaviour until
  a measurement says otherwise, and the draw is now load-bearing for a second
  reason: a child that is not laid out contributes no height, and a container's
  size is declared. Nothing is hidden on a sheet of groups, so this is a rule Tab
  set inherits rather than one anything currently exercises.
- **Deriving membership from the grid rectangles.** A sibling's `grid-row` does not
  move when a component above it disappears, so hiding could never reclaim space
  this way — which turned out to be the shallow end of the argument that took the
  collapse out altogether.
- **Nested note sections.** A child's section is a `##` heading in a flat note, as
  it is today. Constraint 2 and §3.1 are untouched.
- **Ungrouping as its own editor gesture.** Removing the container already does it,
  which is the case that mattered.
