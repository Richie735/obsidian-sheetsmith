# Preview with sample values

Status: shipped
Board card: Preview with sample values — build the layout editor's Preview:
render the current layout with sample values while editing it. `docs/SPEC.md`
§7's last item of the full editor, and the last editor item with nothing
blocking it.

## Model question

**No `SPEC.md` §13 entry is touched. One contract member is added, and that is
the whole of the model question.** The canvas already renders the layout live
(`docs/features/grid-canvas.md`); everything this feature adds is an answer to
one question the canvas deliberately left open, and `grid-canvas.md` §
Deliberately not doing names it by name: *"still blocked on where sample values
live outside `harness/samples.ts`."* So this document opens where that one
stopped.

### Where sample values come from

**A component declares its own sample, as a section body, derived from the
config it is handed.** One new optional member on `ComponentDefinition`:

```ts
sample?(config: TConfig): string;
```

It returns what a section of this component would hold in a character note —
the same text `read` takes on a real sheet — and the canvas hands it to that
component's own `read` in place of the empty body it passes today. Nothing else
in the render path changes.

**Why the body and not the data.** The alternative shape, `sample?(config):
TData`, is compiler-checked and reaches `render` one step sooner. It was refused
because it skips the one call that makes a sample *true*: a body goes through
the component's own `read`, so what the preview draws is exactly what a note
holding that text would draw, and a sample that could not be stored in a note
fails loudly instead of drawing a state no character can be in. It also buys
two checks a data-shaped member could not have — `read(sample(config))` is `ok`,
and `write(that data, sample, config)` returns the sample byte for byte, which
is Constraint 3 asserted over one more body per component — and it costs one
seam change (`canvas.ts`'s `readForCanvas` passes `sample(config)` instead of
`''`) rather than a second data path beside the read.

**Why it passes §4.1's rule for an optional member.** The rule: *a member is
optional only where the alternative is code outside the component knowing that
component's data shape.* The alternative here is code outside Pool knowing that
a Pool's section is a `sheet` fence holding `current`, `max` and `temp`; that a
Card's is one key the author named; that a Table's is a markdown table whose
header is the author's own column keys, that a `modifier` cell enrols a row in a
definition, and that a declared row is not a row the sample may add. That is the
entirety of seven components' data shapes, and it is precisely what
`harness/samples.ts` is — 1487 lines of exactly that knowledge, written by hand,
outside every component. So the member passes the rule squarely, and it passes
it for the same reason `palette` does: the alternative is a table somewhere else
holding what each component is.

**Optional rather than required, and Image is why.** The obvious tightening is
"required wherever `storage` is not `none`", which would kill the mixed state
where some components draw samples and their neighbours draw empty. It is
refused on a real case: `image.ts` draws an empty frame and no error whenever
`RenderContext.resource` is absent, and the canvas has no vault to give it one,
so an Image sample would be a body nothing could ever paint. A member every
component must implement and one component can only implement uselessly is a
member with a lie in it. Absent means what it already means everywhere else in
the contract — this component has nothing to say, and nothing else learns the
question was asked.

**Refused: reuse `harness/samples.ts`.** It is a *fixed sheet*, not a function
from a config to a body: it hard-codes `armour_class`, `worn_count`,
`encumbrance` and their 5e vocabulary, and `effectiveSamples()` already carries a
throwing guard because those ids are hard-coded. None of the three ways of
reusing it survives contact with an arbitrary author's layout. **Moving** it into
`src/` ships a 5e fixture inside `main.js` that still cannot answer what a Card
keyed `Fatigue` should show. **Generating** from it needs a mapping from an
arbitrary config to one of its hand-written bodies, which is the per-type
knowledge the contract exists to keep out of the editor. **Duplicating a slice**
puts Pool's fenced spelling in a second place, which is the drift §1 exists to
prevent, and buys nothing the first two did not already fail at. The deeper
point is that the two files answer different questions and should stay two:
`harness/samples.ts` is a *reviewer's* sheet, deliberately meaningful ("an
ability score is the one vocabulary every reader already has"), and a component's
`sample` is an *author's* filler, deliberately meaningless. Merging them would
make one of the two worse. This feature does not touch that file.

**Refused: synthesise from the declared shape at draw time.** There is no
declared data shape to synthesise from. `configFields` describes *config*, not
data; `storage` says `fenced` or `markdown` and nothing about what goes in it.
So this option is really two: either the editor holds per-type knowledge — the
thing `CLAUDE.md`'s "nothing outside a component needs to know that component
exists" forbids outright — or the contract grows a *description of every
component's data shape*, which is a far larger growth than one optional member
and would have to describe fenced keys, markdown tables and prose in one
vocabulary. The narrow variant, synthesising values into the formula environment
through `scopeValues` alone and leaving `data` null, was refused separately and
on its own merits: it would draw computed numbers sitting over blank stored ones,
which is a state no character can ever be in, so the preview would be lying
about the very thing an author is looking at it to judge.

### The rest of the model checklist

**What it publishes to formulas: nothing new.** Sample data flows through the
`scopeValues` / `scopeRows` / `scopeModifiers` members that already exist, into
the same `buildSheet` call the canvas already makes, so a `derived` formula
resolves against sample values with no new mechanism. A formula naming a
component that does not exist still fails with the sheet's own `Unknown name
"…".`, because that failure comes from the structural name table and never from
stored data — the property `grid-canvas.md` §1 established, preserved here.

**What it stores: nothing.** No layout key, no frontmatter key, no setting. The
toggle is per-pane posture, on `Canvas.activeTab`'s own terms. `serialiseLayout`
is untouched and `persist()` is never called by anything this feature adds.

**Constraint 3 is strengthened, not risked.** No file is written, and the
registry contract gains a round-trip over every declared sample.

**Constraint 4 is not reachable.** There is no character note in this path at
all: `write` is never called, and a sample never leaves the canvas.

**Constraint 5 holds.** `sample` lives in `src/components/`, which imports
nothing from `obsidian` beyond `setIcon`; `src/parse/` and `src/formula/` are
untouched.

## What it does

The layout editor's canvas fills the layout with plausible values instead of
drawing every card empty: a Card shows a number, a Track shows some marks, a
Table shows rows, and every formula on the canvas resolves against them. An
author can therefore judge the layout they are building the way a player will
see it — whether a card is wide enough for its number, whether a table pushes its
neighbour off the grid — rather than judging a grid of blanks. A **Sample
values** toggle above the canvas turns it off, which puts the canvas back to
exactly what a brand-new character sees.

## Design

### §1. Preview is a state of the canvas, not a second surface

**There is no second render, no preview pane and no split.** The canvas is
already the sheet's own render path, drawn by the sheet's own `renderGrid`
against the sheet's own stylesheet; a second, read-only copy of it beside the
first is the "lookalike beside a preview" that `grid-canvas.md` §1's evidence
rejected outright (Custom System Builder #503: an editor and a sheet sharing one
DOM and still drawing it differently). It would also cost the left column the
vertical space the tree needs, in a pane that already reflows to one column
below 1176px.

So Preview is **the same canvas with a different data source**, and `SPEC` §7's
own wording is what settles it: *render the layout with sample values **while
editing***. Selection, drag, resize, the corner handle, the tree and the panel
all keep working exactly as they do now, with values in the cells.

**Every live component stays `inert`.** Sample values are not a character, so
there is nothing to edit and no file for an edit to land on. The whole of
`grid-canvas.md` §1's `inert` and capture-phase blocking is unchanged, and the
two hazards it dissolves stay dissolved. A reviewer should not read an unusable
scrub bar over a sample number as a bug: it is the same boundary as before, now
with something drawn under it.

### §2. What a sample looks like

**A sample never invents vocabulary. It fills the author's own vocabulary with
obvious filler.** Every key, column, entry and row label in a sample comes from
the config the component was handed; only the *values* are the component's. That
is what keeps the plugin system-agnostic (`SPEC` §2) with no effort: a Card keyed
`AC` samples `AC`, a Card keyed `Fatigue` samples `Fatigue`, and nothing in
`src/` ever ships the word "Strength".

The rules a sample follows, which are also what a design review checks it
against:

- **Numbers are small, two digits at most, and different from one another** —
  never 0 and never 1. A formula reading a sample has to visibly be doing
  arithmetic: six abilities all reading 10 make `floor((value - 10) / 2)` look
  broken, and a lone 1 makes a multiplication invisible. **Across components as
  well as within one**, which is the half the first build missed: a component
  sees only its own config, so filler counted from zero makes every plain Card in
  a layout hold the same number. Each component's run therefore starts at a
  `sampleSeed` of its own `id` — `id` and not `label`, so renaming a component
  does not repaint the canvas under an author mid-edit.
- **A dropdown samples the first choice a formula can be read through**, and the
  first choice otherwise. Two rules meet here: a sample must hold a value the
  list offers, because a stored value the menu has no line for is a state no
  character can be in, and a sampled number must not be 0 or 1. A proficiency
  dropdown of `0, 1, 2` under `ability + value * 2` breaks the second at its first
  option, so an option worth reading is preferred and the first is the fallback —
  a value the list does not hold is *wrong*, where an uninformative one is merely
  dull.
- **Text reads as filler at a glance.** The field's or column's own name with an
  index — `Name 1`, `Name 2` — so nobody mistakes a preview for their own data,
  and a screenshot is unambiguous about which state it is in.
- **A two-state value shows both states.** Where a component has rows or entries
  with a flag, the sample sets some and clears others, so both paints appear.
- **A partial state is preferred to a full one.** A Track is part-marked, a Pool
  sits below its max with a temporary segment where `hasTemp` is declared: a full
  bar and an empty bar look the same at a glance, and a partial one does not.
- **A sample holds no wikilink.** There is no vault behind the canvas, so a link
  would draw as unresolved and read as a fault in the author's layout.
- **A sample enrols in no modifier.** A `modifier` cell is left empty: naming a
  definition the author's layout may not declare would put a definition problem
  on screen that the author did not cause.
- **A sample adds no row the config refuses.** A Table with `openRows` off fills
  its declared rows and adds none.
- **A config that names nothing to fill gets an empty body**, which is exactly
  today's behaviour and the honest answer rather than an invented key.

**New module: `src/components/sample-values.ts`.** The filler vocabulary — the
number sequence, the `Name n` spelling, and where one component's own run of it
starts — shared by the six components that speak it, so the canvas reads as one
system rather than as six authors' idea of a placeholder. It is a
shared-vocabulary module in the sense `column-types.ts` and `stored-flag.ts`
already are, and §1's "share on the third consumer" is met on arrival — there are
six.

**It does *not* take `PATTERNS` §10's second stated exception, and this paragraph
used to say it did.** Corrected in review rather than left standing: the
exception is for a module whose own test "could assert little past a constant
equalling itself", and two things here are not that. `samplePart` is an algorithm
with an invariant — never none and never all of it — whose boundary cases are
reachable through a level column's count and passed by no component's fixture.
The number sequence carries a *stated property* rather than a value: no two
adjacent entries equal, the wrap pair at the ends included, which is what every
"no two neighbours alike" claim in the catalog rests on and what a one-character
edit could break with the whole suite green, since each component's own test only
ever sees the two or three entries its fixture reaches. Both live in
`sample-values.test.ts`; the consumers still hold the other half, which is that a
sample reads, writes back byte for byte, and looks right on a card.

### §3. The toggle

A `Setting` row directly below **Layout file** and above the canvas, matching the
two `Setting` rows the pane already draws in that column:

```
Layout file  [DnD 5e Standard ▾] [🗑]
Sample values                       [ ●]
┌──────────────────────────────────────┐
│  the canvas, filled                  │
```

- **Name:** `Sample values`.
- **Description:** `Draw the canvas with example values instead of an empty
  character's. Nothing is written to any note.` The second sentence is the one
  worth having: the first thing a cautious author wonders on seeing numbers
  appear is whose they are.
- **Default: on**, per pane, reset every time the pane opens. The argument, since
  this is the reversible half of the design: an empty canvas is the state that
  *hides* the mistakes Preview exists to reveal — a column too narrow for its
  number, a table that pushes its neighbour off the grid, a formula that reads
  fine at zero. It is also already reachable in one press, whereas a feature
  defaulted off is a feature most authors never see.
- **It is not a preference and not in Settings.** `SPEC` §7 says the settings tab
  keeps two preferences and a button; a third would be a persisted answer to a
  question that only exists while a pane is open.
- **It is not in the configuration panel** either, even though the Layout row's
  panel is where the layout's own settings live. Everything in that panel writes
  the layout file; this writes nothing, and a view-state switch among fields that
  persist is a confusion worth one row of chrome to avoid.
- Toggling calls `canvas.redraw()` and nothing else: no `persist()`, so no undo
  snapshot, and the tree's selection, the panel's fields and the scroll position
  all survive it. The toggle carries a focus token
  (`dataset.sheetsmithFocus = 'sample-values'`) so a full pane redraw for any
  other reason puts the author back on it.

### §4. Empty and error states

- **A component with no `sample`** (Image) draws exactly what it draws today, in
  both states. This is visible mixed-ness and it is the honest reading: the
  component has nothing to show without a vault.
- **A broken config still draws its error card**, sample or not, because a
  component's own `read` checks its config before it looks at a body — the same
  path `readForCanvas` already relies on. A sample never suppresses or replaces
  an error.
- **A sample that would not read** cannot ship: the registry contract fails it
  (§5). On the canvas the existing failure path would draw it in place, so the
  failure mode is loud rather than blank.
- **Samples off** is byte-for-byte the canvas that ships today.

### §5. Where the code goes

This list is a map of the settled diff, not a plan — it grew past the six items
below once review found `eslint.config.mts` and `isolation.test.ts` unnamed and
`src/test/sample.ts` extracted from six duplicated helpers. See
`git diff --stat` on the landed commits for the exact shape.

- **`src/types.ts`** — the `sample` member, doc-commented with §4.1's rule and
  the argument above. It sits **directly before `read`** in the member order: it
  is the body `read` is handed, which is the data path's own first step in the
  one context where there is no note.
- **`src/components/sample-values.ts`**, with `sample-values.test.ts` beside
  it — the filler vocabulary (§2), and the two things in it that are an
  algorithm rather than a constant (§2): `samplePart`'s invariant and
  `NUMBERS`'s no-two-neighbours-alike property, neither reachable through any
  one component's own fixture.
- **`eslint.config.mts` and `src/components/isolation.test.ts`** — the new module
  added to the sibling-import allowlist, in both spellings and in both places.
  **Named here because the first build named neither**, and half of the pair is
  the failure mode `isolation.test.ts` exists to prevent: `PATTERNS` §1 marks
  "no component imports a sibling" `[checked]`, and it is only checked because
  that file enumerates every spelling the config allows. A module the config
  permits and the enumeration omits is the rule standing half-verified again.
- **`src/components/{card,card-set,pool,track,table,rich-text}.ts`** — one
  `sample` each, and one `describe('<type>.sample', …)` block added to each of
  their six test files. `image.ts` declares none, with the reason in its own
  header — a comment-only diff, and the one file here that gains no code.
- **`src/test/sample.ts`** — `sampleOf`, extracted once six component test files
  held a copy of the same wrapper: it throws rather than returning `''` where a
  component declares no sample, so a component that stopped declaring one fails
  the test that exercises it instead of quietly asserting against an empty
  string. Not a render-path file — `contract.test.ts`'s source scan skips
  `src/test/` by name, on the grounds that nothing under it is reachable from
  `src/main.ts`.
- **`src/components/contract.test.ts`** — the registry-wide sweep: member order,
  refused on a container, reads and round-trips every declared sample over its
  bare config and each palette entry, holds no wikilink, enrols in no modifier,
  and the source scan asserting `sample(` is called only from
  `editor/canvas.ts`.
- **`src/editor/canvas.ts`** — `readForCanvas` passes
  `component.sample?.(config) ?? ''` where it passes `''` today, gated on
  `host.sampleValues`. `CanvasHost` gains `readonly sampleValues: boolean`,
  read rather than cached, on the same rule `selection` already follows. This is
  the entire render-path change: `renderGrid`, `buildSheet`,
  `resolveFormulaFields`, the overlays, `markInert` and `blockEvents` are all
  untouched. `canvas.test.ts` gains a `describe` block driving both states of
  the flag over the render loop, the overlay, `inert` and the error path.
- **`src/editor/layout-editor.ts`** — the toggle row and the boolean behind it,
  with `layout-editor.test.ts`'s own `describe('the sample values row', …)`
  covering the default, the write/undo guarantee, and the focus token.
- **`harness/editor-pane.ts`, `harness/harness.ts`, `harness/shot.mjs`** —
  `PaneView` gains a `samples` member and the `&samples=off` query param that
  drives it, and three new shots (§ Look).
- **`docs/PATTERNS.md`, `docs/UI.md`, `docs/features/grid-canvas.md`,
  `docs/SPEC.md`** — the member order, the new UI backlog row, the superseded
  bullet, and §7/§4.1, respectively (§ Acceptance criteria, Whole feature).

`src/parse/`, `src/formula/`, `src/view/` and `harness/samples.ts` have no diff
from this feature.

## Config fields

None. No component's `configFields` change, no layout-level field is added, and
no setting is added. `sample` is a contract member, not a config field: an author
never types a sample anywhere.

## Data and file model

**Stores nothing, writes nothing, reads no note.** The whole feature lives
between a component's `sample` and its own `read`, inside one editor pane. No
character note is opened, no layout key is added, `serialiseLayout` is untouched
and `persist()` is never called.

**Round-trip.** Constraint 3 gains coverage rather than exposure: every declared
sample is a body the registry contract reads and then writes back, asserting the
result is byte-identical. A sample is therefore also a round-trip fixture, one
per component, over a config the component did not choose.

**Existing character notes.** Unaffected in every way, including by a layout that
was edited with the preview on. There is no write path for this feature to have
a Constraint 4 exposure in.

## Acceptance criteria

**The contract (§5)**

- [x] `contract.test.ts`'s `MEMBER_ORDER` holds `sample` between `configName` and
      `read`, and a component declaring it elsewhere fails.
- [x] A component whose `storage` is `none` declaring `sample` fails the contract
      test, on `showsOneChild`'s precedent: a member with no reading is worse
      than none.
- [x] For every registered component declaring `sample`, over a bare config *and*
      over each of that component's palette entry configs:
      `read(sample(config), config)` is `ok`. The check asserts a floor on how
      many samples it read before asserting anything about them.
- [x] For the same set: `write(read(sample(config)).data, sample(config), config)`
      returns the sample byte for byte.
- [x] No sample body contains `[[`.
- [x] A sheet built from a layout holding one sampled component reports no
      modifier problem — a sample enrols in no definition.
- [x] A source scan asserts `sample(` is called from `src/editor/canvas.ts` and
      nowhere else, with a floor of one call, so a sample can never reach a real
      sheet.
- [x] No other `ComponentDefinition` member, `ConfigFieldSpec` kind or
      `RenderContext` member is added.

**The canvas (§1, §4)**

- [x] With sample values on, a Card whose config names a key draws a stored value
      in its pill, and a Card whose `derived` formula names a sibling resolves to
      a number computed from that sibling's sample — asserted on the rendered
      text, not on the data.
- [x] With sample values on, a Table draws its declared rows *and* the sample's
      character rows, and a totalled column's `tfoot` reads the sum of the sample
      cells.
- [x] With sample values off, `read` is called with an empty body for every
      component and the rendered canvas matches the pre-feature output.
- [x] A component with no `sample` draws identically in both states.
- [x] A component with a broken config draws `.sheetsmith-error` with the same
      message in both states.
- [x] A formula naming a component that is not in the layout still shows
      `Unknown name "…".` with sample values on.
- [x] Every live cell's content is still `inert` with sample values on, and
      dispatching `pointerdown`/`click`/`change` inside one calls no `onChange`
      and opens no anchored panel — the `grid-canvas.md` criteria re-run against
      a filled canvas rather than an empty one.

**The toggle (§3)**

- [x] Toggling redraws the canvas and calls neither `persist` nor `write`: a test
      toggles twice and asserts the layout's serialised bytes and the undo stack
      depth are both unchanged.
- [x] Toggling preserves the tree selection and the configuration panel's field
      values.
- [x] The pane opens with sample values on.
- [x] The toggle's copy is sentence case and lint passes at `--max-warnings 0`
      with `obsidianmd/ui/sentence-case` live.

**Look (`npm run harness:shot`, both themes)**

- [x] `harness/editor-pane.ts`'s `PaneView` gains a way to drive the toggle, so
      both states are photographable.
- [x] New shots: the canvas with sample values in light and dark, and the same
      layout with sample values off for comparison.
- [x] A design review can check against §2's rules on those shots: filler reads
      as filler; no two neighbouring numbers are equal; a Track shows marked and
      unmarked; a Pool's bar is partway with a temporary segment; a Table shows
      both states of a flag column; and no sampled component overflows or clips
      its placement — the failure this feature exists to make visible, and the
      one it must not itself introduce.

**Whole feature**

- [x] `npm test`, `npm run lint`, `npm run build` pass.
- [x] `docs/SPEC.md` §7's **Preview** bullet describes what is built rather than
      what is planned, and §4.1's optional-member list gains `sample` with the
      rule argument, in the same voice as `palette`'s entry.
- [x] `docs/PATTERNS.md` §3's member order gains `sample`.
- [x] `docs/features/grid-canvas.md` § Deliberately not doing's *No preview
      panel, no sample values* bullet is replaced with a pointer here, not left
      standing as if still true.
- [x] `docs/UI.md` §12 gains one new row: **a Rich text sample draws as plain
      paragraphs, not markdown** — the canvas passes no `renderMarkdown`, so
      `rich-text.ts` takes its `paintParagraphs` fallback. Invisible until now,
      because an empty canvas drew no prose at all; visible the moment a sample
      exists. Waiting on: a decision about whether the editor pane should own a
      markdown pass of its own, which is a diff of its own either way.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. **`feat: Let a component say what a sample of itself looks like`.**
   `types.ts`'s optional `sample`, `components/sample-values.ts`, and Card and
   Card set implementing it. `contract.test.ts` gains the sample rules — member
   order, refused on a container, reads, round-trips, holds no wikilink, enrols
   in no modifier — each with its floor, so none of them can pass vacuously
   against two components.
2. **`feat: Give the rest of the catalog a sample of itself`.** Pool, Track,
   Table and Rich text. Image declares none, with the reason in its own header
   rather than only in this document.
3. **`feat: Draw the editor's canvas with sample values`.** `canvas.ts`'s
   `readForCanvas` seam and `CanvasHost.sampleValues`. Nothing user-visible yet:
   the host answers `true` and the toggle does not exist.
4. **`feat: Turn sample values off and on above the canvas`.** The `Setting` row,
   the per-pane boolean, the focus token, and the no-persist/no-undo guarantee.
5. **`test: Show the canvas with sample values in the harness`.** `PaneView`'s
   new member and the shots named above, both themes.
6. **`docs: Record what Preview settled and what it left open`.** `SPEC` §7 and
   §4.1, `PATTERNS` §3, `grid-canvas.md`'s superseded bullet, and the new
   `UI` §12 row.

## Deliberately not doing

**No author-written samples.** A layout file holds no sample values, and there is
no sample character note. `SPEC` §3.2 is explicit that a layout holds no
per-character data, and the surface for typing one would be a whole editing
experience for data nobody keeps.

**`harness/samples.ts` is not moved, generated from, sliced, or deleted.** It
stays the reviewer's 5e sheet; component samples are the author's filler. The
model question above argues why they are two things.

**No interactivity on the canvas.** Everything stays `inert`; a sample number is
not editable and never reaches a file. Unchanged from `grid-canvas.md`, and
recorded again because filled cards invite the press that empty ones did not.

**No markdown rendering for a Rich text sample.** It draws through
`paintParagraphs`. Recorded as a new `UI` §12 row instead of fixed here, because
giving the pane a markdown pass is a decision about the editor's relationship to
`obsidian`'s renderer, not a detail of this feature.

**No preview of a *specific* character.** "Show me Aramil in this layout" is a
different feature with a file behind it, and it is not what `SPEC` §7 asks for.

**No settings preference, no persisted toggle state.**

**None of the queued backlog rows.** The six `docs/UI.md` §12 rows on the sheet,
the containers and the editor are their own work, and the `docs/PATTERNS.md` §11
conformance rows — the pane holding which layout is open, the untested undo/redo
Notice feedback, the unchecked declared property name — are untouched. This
feature adds exactly one new backlog row, named in the criteria above.

**No promoted fields, no layout import or export, no palette drag onto the
canvas.** All three are separate `SPEC` §7 items.

**No change to the canvas's reparenting, undo, or gesture behaviour.** It just
landed; this feature changes what is drawn inside the cells and nothing about the
cells.
