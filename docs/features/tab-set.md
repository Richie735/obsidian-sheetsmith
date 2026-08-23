# Tab set

Status: shipped
Board card: ✨ A tab set — one region of the sheet showing one of several alternatives,
which is what a whole-sheet "pages" idea was reaching for. Settled as its own catalog
entry by §13's nesting entry, and it is what makes Group worth having.

## Model question

None open. §13's nesting entry settled the three that would have been: tabs are their
own catalog entry rather than a `display` value on Group, a container may hold
containers one level deep, and a container publishes nothing. What this spec owes is
the design that follows, plus the four decisions that entry names as Tab set's to
make.

It is worth saying why this component exists at all, because Group answers the
question "what is a container for?" badly on its own. A group buys a name for a
region, an inner grid that reflows on its own width, and twelve cards that relocate
by moving one block — real but modest, which is exactly how it read when it landed
alone. **Tab set is the capability the containment work was for.** It is also the
answer to a thing Group tried and failed to do.

### What the collapse taught, and why it lands here

Group shipped with a `collapsible` heading and lost it (§13). The rule that killed it
is the rule this component is built on, so it leads:

**A component fills its placement (§8), so a container's size is declared and never
derived, so hiding must never change it.**

A collapse is a component *ceasing* to fill its placement. What that produced was
not a shorter sheet but the placement's own space left as a hole, in a layout where
something else spanned the same rows — and the same control on the tallest component
in a row band moved everything below it instead. One control, two unrelated outcomes,
picked by a property of the placement nothing states.

A tab set does not have that problem, and not by being careful: **a tab has no
placement of its own — every tab is the whole panel, and the panel is the tab set's
placement.** A tab set three columns by two rows holds a tab that is a Group of a
2×2 beside a 1×2, and a tab that is one 3×2 Table, and the two are interchangeable
without anything moving anywhere on the sheet. The no-shift property is structural,
and there is no "which tab decides the height" question to answer.

**This is the one exception to "a container's inner grid is its own placement".** A
container that is a tab gets its inner grid from the *tab set's* `width × height`
rather than from its own, because the panel it fills is the tab set's box. So a tab
carries no meaningful `col`, `row`, `width` or `height` at all, the editor shows none
of them for a tab. **A tab still carries a position in the file, and nothing reads
it or keeps it in step**: `parsePosition` requires all four numbers, so the add row
writes the container's own size as the honest value at creation, and it goes stale
the moment the tab set is resized. That is not a gap to close — every drawing asks
`innerPlacement` for the live box, and *reading* that stored number was the bug a
review found here, so a sync would reintroduce it. An earlier draft of this
sentence claimed there were no duplicated numbers at all, which was never
achievable. Stated as an exception rather than left to be
discovered, because it is the one place a component's `position` is not what places
it.

### The inner grid is the placement, both halves

The containment work shipped with `openSubgrid(into, columns)` — `width` columns and
implicit rows — so a container's declared `height` did nothing and a child two rows
high inside a group was not the size of the identical component two rows high outside
it. **That is a defect in what is already built, and this feature fixes it**, because
a tab set cannot promise a fixed box on top of an inner grid whose height is whatever
its contents happen to need.

After: an inner grid is `width` columns by `height` rows. An inner column is a sheet
column and an inner row is a sheet row, which is the alignment claim Group already
made for columns extended to the direction it had left out.

A tab whose children leave inner cells empty **leaves them empty** rather than
shrinking the box. That is the same sentence as "a component fills its placement",
and it is what an author is choosing when they declare a size.

### The stage, and why reflow made it necessary

This spec did not mention reflow at all in its first draft, and that was a hole
rather than an omission: `nested-components.md` establishes that a container's inner
grid drops to a single flex column on its own width, at 40px a column. Under a flex
column, elements that were overlapping in one grid cell **stack vertically** — so a
tab set whose panels lived on a reflowing grid would become as tall as every tab put
together, with one visible and the rest as empty space.

So the panels do not live on a grid that reflows. The DOM is three layers:

```
cell        the tab set's placement on the parent grid
  strip     role=tablist, one button per tab
  stage     one cell, never reflows; every panel occupies it
    panel   role=tabpanel, one per tab, all but one hidden
              a container tab opens its own subgrid here, at the
              tab set's width x height
```

The stage is a one-cell grid whose only job is that the panels occupy the same space.
It has no `container-type` and answers no query, so nothing about the sheet's width
changes what it does. A container tab's own subgrid sits *inside* its panel and
reflows normally, which is what should happen: a Group tab four columns wide is narrow
on a phone and stacks its children, exactly as the same Group would outside a tab set.

Two consequences worth stating because they are easy to get wrong:

- **The no-shift guarantee does not come from `grid-template-rows`.** It comes from
  every panel staying laid out, which is true at every width. A reflowed tab set still
  cannot move the sheet when a tab changes.
- **The declared box does not survive reflow, and that is correct.** In a flex column
  the inner rows are inert and each child takes the height it needs, exactly as the
  sheet's own grid does at 480px. A phone has no columns to divide, so a declared
  `3×2` is nothing to hold on to there; what has to hold is that switching tabs moves
  nothing, and it does.

Recorded because the two-layer version — panels straight onto a reflowing inner grid —
type-checks, passes every test in this spec, and looks right at 1400px. It fails only
in the narrow shot.

**One more piece of precision, because the first draft's wording invites a wrong
build.** "The box is the declared size" means a declared row *count*, not a fixed
height: `repeat(height, minmax(0, 1fr))` in an auto-height container equalises its rows
to the tallest content across everything laid out in it. So a 3×2 tab set is two equal
rows as tall as the tallest row of any tab, and it is stable because every tab is laid
out. There is no pixel height to look for.

### The four decisions §13 hands over

**1. Hidden content stays in the DOM and stays laid out.** Every tab's panel renders;
the inactive ones carry `visibility: hidden` and `inert`. That puts them out of tab
order and out of the accessibility tree, and keeps them contributing height — which
is the point, because a panel removed from layout contributes none, and a container
whose height depends on which panel is showing is the collapse again.

**The cost, stated once and not buried: find-in-page does not reach an unopened
tab.** `hidden="until-found"` is the spelling that would have kept it, and it runs on
`content-visibility: hidden`, which is exactly the removal-from-layout being ruled
out. So the two cannot both be had. This takes no-shift, on the grounds that movement
on every tab press is the worse failure and that a strip at least tells the reader
there is content they have not opened, where the collapse's hole told them nothing.
What would reverse it is a way to hold a container's height without laying out its
hidden children — a declared row unit on the sheet grid would be one, and that is a
sheet-wide model change rather than this component's business.

**2. Hidden children are evaluated and rendered.** §5's name table is driven by
whoever reads a name rather than by whoever draws it, so a hidden card's value is
already being computed for the pool elsewhere that reads it: skipping the draw saves
the draw, not the arithmetic. The corollary is the one worth writing down, because
the alternative is a bug nobody would look for — **hiding is never a way to make a
formula not run.** A Pool on a tab nobody has opened publishes its name, resolves its
`max`, resets on a Long Rest, and appears by name in that trigger's confirmation
list, exactly as a visible one does. A reset whose meaning depended on which tab the
reader had open would be §5's grid-order `?` in a new place.

**3. Which tab is active is per-viewer, and never in the note.** This is the one place
the two nearest prior arts disagree outright: Obsidian keeps fold out of the markdown
entirely — per a developer, "the 'fold' state information is not part of markdown, and
is not stored inside the note itself" — while Sandbox stores it as a checkbox property
in the character's own data. Obsidian's answer, because our notes are files people
hand-edit and because a container that stored anything would end §13's premise that a
container holds no data.

So the *layout* declares nothing and the *view* remembers: the first tab is active
until the reader presses another. It has to be the view rather than the component's
own closure, for the reason the collapse already proved — the sheet re-renders on
every committed edit (`applyEdits` → `renderSheet`), so a tab set holding its own
state would snap back to the first tab the moment a pool inside it was edited. The
precedent is `cell-focus.ts`, which carries structural state across exactly that
rebuild, and the mechanism is the one the collapse used and took with it: a `Map`
keyed by component id on the view, cleared when the leaf changes file, reaching the
component through `RenderContext`.

No `defaultTab` config. The research found tab state persistence undocumented in
every builder examined, so there is no prior art to follow and the first tab is the
answer that needs no key.

**4. A container is offered no reset binding and offers none for its children.**
Unchanged from Group. §6's binding carries an action only the component can
interpret, and a container binding beside a child's own binding on one trigger is
precisely the two-bindings ambiguity §6 refuses a layout for, one level up and with
no file shape to refuse it in.

### What a tab may be

**Any component.** A tab holding a Group is a region; a tab holding one Table is a
spellbook. Requiring a Group would be ceremony on the second case, and the depth rule
already bounds the first: a Group inside a Tab set is the second container, so its own
children must be leaves, and a Tab set inside a Tab set is refused because its tabs
would be the third.

**The tab's name is the child's own `label`.** No `tabs: [{label, children}]` shape
beside `children`, because that is a second nesting spelling for the parser to know
and the label is already there, already unique, already what the editor edits. A tab
holding a Group shows that group's heading as its tab name and does not draw it twice.

**Tab order is the order of `children`**, and this is the one place §8's grid reading
order does not reach — a consequence of a tab having no placement rather than a second
rule invented for it. An earlier draft claimed tab order *was* grid reading order while
also claiming every tab is the same box, and the two exclude each other: identical
positions make that sort degenerate, so an author would have had no way to reorder tabs
at all.

The editor reorders with up/down buttons, the mechanism `moveAttribute` already
provides for a list whose order is its meaning. A hand-authored layout reorders by
moving the entry, which is what the file already reads like.

## What it does

A layout may give one region of the sheet several alternatives and a strip to choose
between them. A **Combat** tab holding attacks, AC and hit points beside a **Spells**
tab holding a spellbook; a **Notes** tab nobody opens mid-fight. A tab set spanning
the full width at row 1 is the multi-page sheet.

Nothing moves when a tab changes. The region is the size the layout gave it, whichever
tab is showing.

## Design

**The strip sits above the panel**, tabs left to right in reading order, the active
one marked. It is chrome over a region, so it follows Group's restraint rather than
inventing a surface: the tab set's own `label` is a heading on Group's rules,
`hideLabel` drops it, and the strip's bottom edge is the hairline that Group draws
under its heading. One rule under the chrome, in the same place, whichever container
drew it.

The active tab is marked by weight and the accent, not by a raised tab shape. A
folder-tab silhouette is a fourth surface beside the cards, which is UI §9's
loose-chrome failure, and it needs a border that has to disappear into the panel edge
on exactly one side — the kind of detail that looks fine in one theme.

**Every tab is in the focus order**, rather than the ARIA pattern's single tab stop
with arrow keys inside it. Deque names that pattern's focus behaviour a defect, and on
a control whose whole job is hiding things the failure is concrete: a keyboard user
who cannot reach the fourth tab without knowing to press an arrow key has lost the
content behind it. Arrow keys work too, so the pattern's own idiom is not taken away.
Semantics are `role="tablist"`, `role="tab"` with `aria-selected`, and
`role="tabpanel"`, with `tabindex="0"` on every tab rather than a roving one.

**Focus and the switch.** Switching away from a tab that holds focus moves focus to
that tab's own button, because `visibility: hidden` makes the control it was on
unfocusable and a sheet with focus nowhere is a sheet the keyboard has fallen out of.
`captureFocus` needs no change: it already takes the innermost `.sheetsmith-cell`
containing the active element, and a hidden panel's controls are not the active
element.

**Motion.** None. Per UI §8 a tab strip is pressed dozens of times in a session, and
a cross-fade between panels puts a wait in front of every press. The mark on the
active tab is a colour change, which UI §8 says is not motion and may run longer than
300ms; the panel itself is simply the other one.

**Empty and error states.**

- A tab set with no children draws its strip area empty and its panel empty. A layout
  part-way through being built, not an error — the reading §6 takes for a declared
  trigger nothing binds to, and Group's for an empty region.
- A tab set with one child draws one tab. Not an error either: it is a layout on its
  way to two, and refusing it would mean an author cannot build the second tab first.
- Nothing else. Like Group, a tab set has no pair of settings that can contradict, so
  it declares no `configError`. The two ways a layout can be wrong about containment
  are both answered above a component: `parseLayout` refuses depth, and
  `undrawableMessage` refuses cards inside a component that holds a value.

### The layout editor

Everything nesting needs is already there from Group: the disclosure list, the
destination dropdown on **Add component**, the second schematic, and removal keeping
its children. A Tab set appears in the destination dropdown exactly as a Group does,
because that list is built from `isContainer`.

Two things it owes:

- **An open Tab set gets no schematic of its own**, because its children have no
  positions to draw. It gets an ordered list of its tabs instead, with up/down
  buttons — and `findOverlaps` is never run over them, which sidesteps the problem
  a grid of identically-placed tabs would have created. `preview-grid.ts` stays
  untouched, as it did for Group.
- **A tab's own form drops the position fields**, since none of the four does
  anything. That is the editor knowing one thing about a parent's type, and it is the
  same thing the renderer knows: a tab fills its panel.
- **A container tab's form still shows its own children's positions**, which are real
  — they sit on the inner grid the tab set sized.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `hideLabel` | boolean, group `Appearance` | Hide the heading | Draws the tabs with no heading above them, for a tab set that is the whole region rather than a named section. The tabs keep their own names either way. |

That is the whole of it, and the sparseness is the design rather than an omission:
the tabs are `children`, which is shared config the editor owns (§4.1); their names
are their own `label`s; their order is their own `position`; and which one is showing
is the reader's, not the layout's.

`formulaFields` is empty. A container has no numeric field to compute.

## Data and file model

**No character note changes, and none is rewritten.** A container has no section, no
fence, no heading in the body. `storage` is `'none'`, so the view calls neither
`getSection` nor `read`; `read` and `write` exist because the contract's five are the
five, and both are trivial and unreachable. Constraint 3 holds by not being in the
diff, and Constraint 4 is not engaged because nothing is stored.

**The layout file gains no key.** `children` is the same shared key Group uses, walked
by the same parser, bounded by the same depth rule. A Tab set is a `type` and nothing
else, which is what §4.3 promises every component: the schema grows by exactly that
component's config block, and this one's is one boolean.

One change to shared rendering, and it is the defect this feature has to fix before it
can promise anything: `openSubgrid` takes the container's whole `GridPosition` rather
than its `columns`, and sets `grid-template-rows: repeat(height, minmax(0, 1fr))`
beside the columns it already sets. That makes a container's declared `height` mean
something for the first time, and it changes Group as built — a group whose children
needed more rows than declared previously grew, and now divides the rows it was given.
It is the right change for both components and it belongs to this one, because a tab
set is the component that cannot work without it.

Existing layouts are unaffected in the file and *are* affected on screen: a Group
whose declared `height` was smaller than its content will now divide that height
rather than grow past it. The fixture and the harness sample both need looking at
under the new rule, which is what the first look criterion below is for.

## Acceptance criteria

- [x] A Tab set three columns by two rows, holding a Group tab of a 2×2 beside a 1×2
      and a Table tab of one 3×2, renders each tab filling the panel, and the Group
      tab's children at their declared positions on a 3×2 inner grid taken from the
      tab set rather than from the Group's own position.
- [x] A tab's own `col`, `row`, `width` and `height` change nothing about how it
      renders, and the editor offers none of them for a tab.
- [x] A tab whose children leave inner cells empty leaves them empty: the tab set's
      box is its placement, not its content.
- [x] An inner grid is `width` columns by `height` rows, with `openSubgrid` taking the
      position; a child two rows high inside a container occupies the same height as
      the identical component two rows high outside it.
- [x] An inactive panel is in the DOM, is not in the tab order, is not in the
      accessibility tree, and still contributes height. *The last is the one that
      matters and the one happy-dom cannot answer, so it is asserted on the mechanism
      — `visibility` and `inert` rather than `hidden` — with the geometry left to the
      look criteria.*
- [x] A Pool on an inactive tab publishes its value, resolves its `max`, and appears
      by name in a Long Rest's confirmation list.
- [x] The first tab is active on first render; pressing another makes it active; and
      committing an edit inside a tab leaves that tab active across the re-render.
- [x] The first tab is active where the view remembers nothing, which is what a
      reopened note starts from.
- [x] Every tab is in the focus order with `tabindex="0"`, carries `role="tab"` and
      `aria-selected`, and its panel carries `role="tabpanel"`.
- [x] Switching away from the tab holding focus moves focus to that tab's button.
- [x] Arrow keys move between tabs as well as Tab.
- [x] Tab order is the order of `children`, and a layout whose tab positions all read
      1/1 still orders its tabs as written.
- [x] The editor's up/down buttons reorder tabs, and the order is what the strip draws.
- [x] A Tab set with no children draws its heading over a quiet empty region and
      **no strip and no panels at all** — an empty `tablist` is an ARIA oddity, and
      this is Group's empty region on Group's terms. One with a single child renders
      one tab, with no error either: a layout on its way to two.
- [x] The panels occupy a stage that is not a reflowing grid, so a reflowed tab set
      shows one panel rather than every panel stacked. *Asserted on the DOM's three
      layers and on the stage carrying no `container-type`, since happy-dom will not
      lay the reflow out.*
- [x] A Tab set declares no `configError`.
- [x] **A nested Tab set is refused exactly when its tabs are containers.** One
      inside a Group or another Tab set whose own tabs are cards parses cleanly and
      is an ordinary second-level container; one whose tabs are Groups is refused by
      `parseLayout` with a message naming the depth rule. *This read "a Tab set
      inside a Tab set is refused" and contradicted the bullet under **Deliberately
      not doing** that governs it — the depth rule counts containers, not tab sets,
      and the implementation follows the bullet.*
- [x] A tab holding a Group shows that group's heading as the tab name and does not
      draw it twice.
- [x] Overlap is reported within a tab and never across tabs, driven through **an
      open container tab's** schematic — not the tab set's, which has none. Tabs
      share one position by definition, so the absence of a schematic over them is
      what makes "never across tabs" true rather than any check; `findOverlaps` runs
      per schematic over one list, so a tab's own children are compared only with
      each other.
- [x] `preview-grid.ts`'s exported functions are unchanged; only their caller learns
      which children are siblings.
- [x] `npm test`, `npm run lint` and `npm run build` clean.

**The no-movement guarantee is verified in two halves, and neither half is a
geometric assertion.** Two criteria here used to ask for one — "the position of
nothing else on the sheet changes", and the same at 380px — and no test in this
repository can produce it: the component tests run under happy-dom, which lays
nothing out, so a coordinate read back from it is not evidence of anything. They
were removed rather than moved, because their halves already exist. The
**mechanism** is above: every panel drawn, hidden by `visibility` and `inert` so
it goes on contributing height, and a stage that is not a reflowing grid. The
**outcome** is below, watched rather than measured, at both widths. A criterion
that no run can settle is worse than no criterion, because it reads as covered.

Criteria that are a look, and stay unticked until somebody looks at
`npm run harness:shot`:

- [x] **The declared-rows change did not break what already renders.** Every existing
      component in the harness sample, and the fixture layout, under an inner grid
      that now divides declared rows instead of growing past them. This is the
      regression risk of this feature and the first thing to look at. *Looked at
      against a calibrated harness on Obsidian 1.13.7, both themes, at 1900px,
      1400px and 380px, and in the empty and error states. Nothing regressed.*
- [x] The strip reads as chrome over a region, not as a fourth surface beside the
      cards: no folder-tab silhouette, and one hairline under the strip in the same
      place Group draws one under its heading. *Ticked after a correction: it drew
      two rules at first, one under its heading and one under the strip, ~37px
      apart, which read as a heavier object than the group it has to match.*
- [ ] The active tab is unmistakable in both themes, at 1400px and at 380px.
- [x] Switching tabs, watched rather than measured: nothing outside the tab set moves,
      and nothing inside it moves that is not the panel changing. *Three tab states
      captured identically and compared: the tab set's own heading and the card
      beside it sit at the same pixel in all three.*
- [x] A tab set beside a Group of the same declared size look like the same kind of
      object. *True once the two draw one hairline each, and not before.*
- [x] **At 380px, a tab set shows one tab's worth of content**, not every tab
      stacked. This is the failure the stage exists to prevent and the only width it
      is visible at. *Confirmed in the narrow shot.*
- [ ] **A note reopened comes back on its first tab.** Open one, switch to the
      third tab, open another note, come back. The view drops its map when the leaf
      changes file, and nothing in this repository can drive that: `SheetView`
      cannot be constructed without a workspace, which is the same limitation that
      put `cell-focus.ts` in a module of its own. Stated on the mechanism instead
      is not available either — the mechanism *is* one line inside `clear()`. The
      gap is a standing row in `docs/PATTERNS.md` §11.
- [ ] **Find-in-page does not reach an unopened tab**, checked in Obsidian rather than
      the harness. This is the known cost, and it is a look criterion so that somebody
      confirms it behaves as *stated* rather than in some third way.

## Commit boundaries

1. `fix: Give a container the rows its placement declares`. `openSubgrid` takes the
   `GridPosition`, `grid-template-rows`, and the callers in the view and the harness.
   Its own commit and first, because it changes Group's rendering and is the thing the
   rest of this feature stands on.
2. `feat: Show one of several regions in one placement`. `tab-set.ts`, the strip, the
   stage and its overlapping panels, `visibility`/`inert`, the ARIA, the keyboard,
   its `configFields` and its registration.
3. `feat: Remember which tab the reader opened`. The view's map, its `clear()`, and
   the `RenderContext` members it reaches the component through.
4. `feat: Author a tab set in the layout editor`. Up/down reordering for a tab set's
   children, the position fields withdrawn for a tab, and the child list naming the
   tabs in tab order.
5. `docs: Record what a tab set settles`. §12's component order and count, and the
   `docs/UI.md` §9 vocabulary row for the strip. §2, §4.1, §4.2, §8 and §13 already
   carry this component's rules from the nesting entry.

## Found while building

**Satisfying one sentence about labels changed five components that have nothing
to do with tabs, and this is the entry that most needs to exist.** The spec said
a tab holding a Group "does not draw it twice" and, separately, that a tab may be
any component. Those two lines together mean *every* component can be a tab, and
every component draws its own label — so the rule cannot live in Group. It is
`RenderContext.parentShowsLabel`, set by `renderGrid` on the `childRegions` path
only, and asked through one predicate, `showsOwnLabel(config, context)` in
`types.ts`. **Card, Card set, Pool, Track and Table all changed for it, and Pool
gained label-hiding it never had.** That is not scope creep; it is what those two
spec lines require, and a reader finding five components asking a predicate about
containers deserves to find the reason here rather than reconstructing it.

The predicate is one rather than five guards because the bug *was* one consumer
forgetting: Group honoured the flag and the other five did not, so a Table tab
drew its heading under a strip that had just named it, in a different type
treatment, which reads as damage rather than repetition. `contract.test.ts` holds
every component declaring a `ComponentDefinition<…>` and reading `config.label`
to asking the predicate. Only the *visible* label is suppressed — `aria-label`,
`title` and status text name a control for someone who cannot see the strip, so
they stay in every case.

**The containment contract grew twice, and the spec had assumed once was
enough.** It was written against `renderChildren(into)`, which puts every child
on one grid — all a region wants, and useless to a strip. So `RenderContext`
gained **`childRegions`**, one drawable per child in file order, and a container
uses exactly one of the two: "all of my children on a grid" against "my *n*th
child, filling this element". One callback answering both would need a second
argument changing what the first means, which is the shape §4.1 already refuses
for `display` against `compute`.

Then the editor needed **`ComponentDefinition.showsOneChild`**, and that one is a
component-contract member rather than a context one. The editor has to tell a
container that places its children from one that shows them one at a time, and it
cannot work it out: both hold `children`, both take the same context, and which
half of containment a component reaches for is invisible from outside it. Declared
for exactly `hasBuffer`'s reason. Without it the editor drew a grid schematic of
children that all sit at the same position — stacked on one another, every one
reported as overlapping every other, no way left to reorder the tabs, and four
position fields editing numbers nothing reads.

**One hairline under a container's chrome, and the rule is that it lives under
whichever chrome closes the region.** The spec asserted this as intent and the
build drew both: a rule under the heading and another under the strip, 37px apart,
which made the tab set read as a heavier, more built-up object than the Group
beside it. Found by looking, in both themes and at both widths; two borders are
not a type error and not a behaviour. Now a documented rule in `docs/UI.md` §9,
guarded in both directions in `styles.test.ts` — the heading's rule dropped, the
strip's kept — because dropping both leaves the chrome with no closing edge, which
is the same object read the other way.

**The editor's schematic did not draw declared rows, so it disagreed with the
sheet about the one thing this component's design rests on.** A tab declared 8×3
holding one row of cards previewed as one row while the sheet drew three. The box
is the placement and the editor is the only place an author can see a declared row
nothing fills. Fixed from the same `innerPlacement` the sheet uses — and
deliberately *not* with the sheet's `minmax(0, 1fr)`: `previewMetrics` maps a
pointer's Y to a row index through `grid-auto-rows`, so fractional rows would have
silently broken every drag in the schematic, and the preview paints its own
lattice in fixed steps that a different track height would slide out of. What has
to agree with the sheet is the row *count*, not the pixel height.

**The reorder buttons were a new glyph for an existing job.** They shipped as
`chevron-up`/`chevron-down` and became `arrow-up`/`arrow-down`, which every other
reorder control in the plugin already uses — and `chevron-down` already means
"this row is open" two rows up in the same list. Surfaced by the instrument rather
than by review: `src/test/obsidian-stub.ts` had no `chevron-up`, and its fallback
paints the icon's *name* as text, so the harness read "chevron-up ⌄" and the whole
control could not be reviewed. `harness/stub-icons.test.ts` now scans every
`setIcon` call in `src/` and asserts the stub draws an svg for each. Worth noting
which direction that failed in: the instrument was *harsher* than the app, not
kinder, so it cost a review rather than passing a bad one — but it cost it
silently.

**And the acceptance criteria were wrong in a consistent way, which is the
lesson.** Four had to be corrected after the fact: two asked for geometry no test
here can produce, one named a driver the spec's own editor section forbids, and
one contradicted a bullet under **Deliberately not doing**. Each read as ordinary.
The pattern is that a criterion written before the mechanism exists tends to name
an *outcome* the author can picture rather than a check anything can run — so the
question to ask of a new criterion is not "is this true?" but "what in this
repository would fail if it stopped being true?" Where the answer is nothing, it
belongs in the look list, and a criterion no run can settle is worse than none
because it reads as covered.

## Deliberately not doing

- **Find-in-page into an unopened tab.** Ruled out by the no-shift guarantee, not
  deferred. What would reverse it is a declared row unit on the sheet grid, which is a
  sheet-wide model change.
- **A `defaultTab` config.** The first tab, and no prior art suggests otherwise.
- **Remembering the active tab across sessions.** The view remembers it while the leaf
  is open. Plugin data would persist it with no migration, since nothing is in the
  note either way, and it is per-device, unbounded, and answers a question nobody has
  asked.
- **A nested Tab set whose tabs are containers.** Those tabs would be the third
  container. One whose tabs are cards is an ordinary second-level container and is
  not refused — which corrects `nested-components.md`, where this was written as
  "top-level by consequence of the depth rule".
- **Giving a tab a placement inside the panel.** A tab is the whole panel. A tab
  placed smaller than the box is a state nothing needs and it would put four fields
  on a form that mean something for every component except this one.
- **Extending §8's grid reading order to tab order.** It cannot reach a child with no
  placement. The exception is stated in §8 rather than worked around.
- **A collapsible tab set.** The same rule that took the collapse off Group: a
  container that stops filling its placement leaves a hole.
- **Animating the panel change.** UI §8. A control pressed dozens of times a session
  gets feedback, not animation.
- **A vertical strip, or tabs below the panel.** One arrangement until somebody wants
  another; either is a config key over the same DOM.
- **A tab set publishing anything, including a segment in its children's names.**
  Containment is not addressing. §13's name-depth question stays where it is.
- **Closing or adding tabs from the sheet.** A tab is layout, not data. The editor
  adds and removes them, like every other component.
