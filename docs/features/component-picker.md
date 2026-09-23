# Component picker

Status: shipped
Board card: Replace the layout editor's Add component control with a picker that
tells an author what each component does and what it looks like before it is
placed.

*Why it matters: the **Add component** row is one native `<select>` of 20 names,
the 12 registered types in registry order with their 8 palette entries indented
under them by figure spaces (`addChoices` and `renderAddRow` in
`src/editor/layout-editor.ts`). A palette entry shows its `description` below the
row (`src/editor/described-row.ts`); a bare type shows nothing, because
`ComponentDefinition` has no type-level description. Nothing in the menu draws a
component, although every sampled type already says what a section of itself
holds (`sample`). The owner reports that it is not clear which component does
what, or what it looks like, when adding one. Passport, Pool, Roster and Record
set are names that carry no cue, and today the only way to learn one is to add
it, look at the canvas, and undo.*

## Model question

**Touches one §13 entry, and grows the §4.1 contract twice.** The route is
**Full** (`docs/WORKFLOW.md` § Routes): no pane in this plugin has drawn a
catalog before, and two contract members are added.

### §13: "Whether the layout editor's configuration panel has a copy budget"

The entry was recorded "so the next surface is designed with a budget rather
than inheriting the absence of one". This is that surface, and the owner settled
its budget before design. **Decided for this feature, and not yet resolved**:
the `Resolved:` wording is `/land-it`'s once the picker is built
(`.claude/skills/feature-spec/SKILL.md` § Rules). The three decisions are now
recorded in the entry itself (`docs/SPEC.md` §13) so they stand as decisions
before anything is built:

1. **`ComponentDefinition` gains a required type-level `description`. It gets no
   `keywords` member.** Search matches type names, palette entry names, and both
   descriptions.
2. **The preview is drawn from data.** A palette entry previews `sample` over
   its own config, which is exactly what inserting it produces. A bare type
   previews `sample` over an empty config, which is exactly what inserting it
   produces (`config: {}`), unless that drawing shows nothing useful. In that
   case the type declares an optional **`example`** config that the preview draws
   instead, and the picker labels the drawing as an example. A palette entry's
   config is never borrowed for a bare type.
3. **Copy budget:** a picker entry's name is at most 3 words. A description,
   whether a type's or a palette entry's, is at most 90 characters and one
   sentence. The contract test enforces both. All eight current palette
   descriptions run 200 to 400 characters, so they are rewritten, not trimmed,
   and every clause that leaves one either moves into the description of the
   config field it concerns or is deleted with a reason (§ Copy).

The modifier-rules half of that §13 entry is untouched by this feature and keeps
the entry open.

### §4.1: `description`, a required declared property

It sits with `type` and `storage` as a fact the type declares, not as a sixth
behaviour among the five. It is required rather than optional, on
`configFields.description`'s own argument, which §4.1 already makes: it is the
only explanation of the type an author is given. There is no optional-member
rule to pass, because nothing is optional about it. **It must describe what the
component looks like, never a job**, for the reason the next section gives.

### §4.1: `example`, an optional member

`example?: Partial<Omit<TConfig, EditorOwnedKey>>`: a configuration the picker
hands to `sample` when drawing the bare type, where the empty config draws
nothing useful.

**It passes §4.1's rule for optional members exactly as `palette` does.** The
alternative is a table in the editor holding Table's column shape, Roster's
stats-and-rows shape and Track's `count`, which is code outside a component
knowing that component's data shape. It passes on the same terms as `sample`,
one step back: `sample` is the body a config holds, and `example` is the config
to ask about. It is optional because most types draw themselves well from an
empty config (§ The photographs), and a member every type had to fill would make
every type invent a configuration it does not need.

**How it differs from a palette entry, which the contract enforces rather than
leaves to review:** an entry is inserted and an example never is. So an example
names no job, has no name, is never written to a layout, and never appears as a
line in the list. It is the type drawn with enough in it to be recognisable.

**What the contract test checks** (`src/components/contract.test.ts`):

- It is declared only on a component that declares `sample`, since it is drawn
  through `sample`. A container declares none, and neither does Image, whose
  missing `sample` is §4.1's own recorded exception.
- It sets no key in `EDITOR_OWNED_KEYS`. The type forbids it, and the test asks
  again at runtime for the reason `EDITOR_OWNED_KEYS`' own comment gives: the
  registry holds definitions typed without their config, so the `Omit` widens.
- Every key it sets is a config field the component renders, as for palette
  entries. An example is a configuration an author could reach through the form,
  never one they could not.
- It is not empty. `{}` is what the bare type already draws.
- `read(sample(example))` is `ok`, and `write` of that data returns the body
  byte for byte: the existing sample round trip, swept over one more config per
  declaring type.
- `sample(example)` holds no wikilink and enrols in no modifier, which is the
  existing sample sweep extended.
- Member order: `example` sits between `configName` and `sample` (`docs/PATTERNS.md`
  §3). It is a configuration read by `sample`, so it comes directly before the
  body it produces. `description` sits directly after `type`, where the name and
  its gloss read together.

What no test can check is that an example's vocabulary is filler. That is
judgement, and the rule is `docs/features/preview-sample-values.md` §2's rule
applied to config: the `Entry 1`, `Stat 1`, `Row 1` spelling and never a game's
word. A Card set example keyed `STR` would be a D&D sheet in the catalog.

### Search matches names and descriptions, never job words

The owner settled this, and the case it has to survive settles it too. A job does
not name one component across systems. In Blades in the Dark, Stress is a Track,
Harm is a Table of free-text slots, and Trauma is a checklist. Five other systems
use one Pool for the same job. "Stress" is a row of boxes in Fate and Blades, and
a single number in Mothership. A row of boxes serves death saves, Lancer
structure, Ironsworn progress and a Blades clock. A keyword list mapping "stress"
to Track would be wrong for Mothership and incomplete for everything else: it is
system flavour collecting in the catalog, which §4.2's palette rule exists to
stop.

**So a job-word query finds what a description literally says, which is usually
nothing.** `stress` matches no line. The empty state then says what does work:
search by shape (§ Empty and error states). A job keeps its place in a palette
entry's name and description, per §4.2's rule, so `inventory` finds Inventory,
because an entry is allowed to name a job and a type is not. A job needing
several components, such as Harm and Stress and Trauma together, is a layout
pattern and not a picker line. No entry is invented for one.

### The rest of the model checklist

- **Publishes** nothing. **Stores** nothing new: `description` and `example` are
  code, never written to a layout or a note.
- **Round trip:** unaffected. Insertion writes exactly the config the dropdown
  wrote, type for type and entry for entry (§ Insertion is unchanged).
- **Existing notes and layouts:** untouched. No type is renamed, no config key
  changes, and the clause relocations change field *descriptions* only.
  Constraints 3 and 4 are not reached.
- **The flattening question.** The comments on `AddChoice` and on
  `paletteEntries` say the menu's flattening stays in the editor until a second
  consumer exists, and name "M4's grid canvas" as that consumer. The canvas
  shipped without taking it. **The picker is not a second consumer. It replaces
  the first**, because the dropdown is deleted. So the flattening does not move
  to the registry. It leaves `layout-editor.ts` for a module of the picker's own
  on `docs/PATTERNS.md` §1's *atomic* rule, not its *reusable* one. Both comments
  are corrected to say so and to drop the stale M4 prediction.

## What it does

**Add component** opens a picker in place, above the tree, instead of a
dropdown. It lists every type with its palette entries grouped beneath it, and
each line gives a name and one sentence. The active line, chosen by a press or
the arrow keys, draws a live preview of the component. A search field narrows the list
by name and description. The author picks where the component goes and presses
**Add**. The picker stays open for the next one, and the canvas above shows each
new component land.

## Smallest version

*Not chosen. The owner approved the full design, search and stay-open included;
this stays as the record of the alternative.*

The same inline picker, grouped list, the two contract members and the full copy
rewrite, with the preview of the active line, including `example` for the four
leaf types. **Without** search (20 lines in 12 groups is readable unfiltered),
without staying open (it closes on **Add** and the new component is selected, as
today), and without placeholder children for containers (Group and Tab set draw
their empty selves). It gives up the convergent catalog behaviour of search, the
fix for Gutenberg 11632's close-after-every-insert, and any drawing of a Tab set
beyond its heading.

## Design

### §1. The photographs: what a bare type draws from an empty config

Every one of the 12 types was drawn with `config: {}` through the canvas's own
render path (`renderEditorPane` with a one-component layout, samples on). A
throwaway scratchpad page did the drawing, because the harness's `choice=` only
selects a dropdown option and cannot place a type. The component sat on a
four-column grid, spanning all four columns and three rows. That is the preview
frame this design adopts (§4). At insert size, two of twelve columns by one row,
most types clip, as `bare-record-set-insert.png` shows, which is why the preview
does not draw at insert size.

PNGs, under
`/private/tmp/claude-501/-Users-ricardopereira-Developer-obsidian-sheetsmith/ff8bbdf0-d99a-4b30-bf70-bbc780bef72f/scratchpad/picker/shots/`
(abbreviated `shots/` below). Each has the sample body printed above the pane:

| Type | Photograph | What the empty config draws | Verdict |
| --- | --- | --- | --- |
| Card | `shots/bare-card-frame.png` | A label, `11`, `Note 1` | **Useful.** No example |
| Card set | `shots/bare-card-set-frame.png` | The heading and nothing else: no entries means an empty body | **Nothing.** Example |
| Group | `shots/bare-group-frame.png` | A heading, a rule, an empty region | Container (§2) |
| Image | `shots/bare-image-frame.png` | An empty picture frame | **Useful**: an empty frame *is* the component. No `sample`, so no example possible |
| Passport | `shots/bare-passport-frame.png` | Picture frame beside `Character name` at headline size | **Useful.** Two of its three parts, and the recognisable two. No example |
| Pool | `shots/bare-pool-frame.png` | `7` with its − ± + steppers | **Useful.** No example |
| Record set | `shots/bare-record-set-frame.png` | Two collapsed records and **Add record** | **Useful.** No example |
| Rich text | `shots/bare-rich-text-frame.png` | Two paragraphs of filler prose | **Useful.** No example |
| Roster | `shots/bare-roster-frame.png` | "No stats yet. Add one to this component in the layout." | **Nothing**: an empty-state message. Example |
| Table | `shots/bare-table-frame.png` | "No rows yet. Rows come from the layout…" | **Nothing**: an empty-state message. Example |
| Tab set | `shots/bare-tab-set-frame.png` | The heading and nothing else | Container (§2) |
| Track | `shots/bare-track-frame.png` | "This track needs a number of segments, named levels, or rows." | **Nothing, and an error.** Example |

**The threshold, stated so the next type is judged by it:** a type gains an
`example` where its empty-config drawing is blank, is an empty-state message, or
is a configuration error. A drawing that is incomplete but recognisable, like
Passport without its tag line, keeps the honest drawing of what the insert
produces.

**So four types get an `example`**, each photographed with a candidate:

- **Card set**: three entries keyed `Entry 1`, `Entry 2`, `Entry 3`
  (`shots/example-card-set.png`, three cards reading 11, 18 and 10). It is not
  Currency's five denominations.
- **Roster**: two stats (`Stat 1`, `Stat 2`), one number column (`Value`), three
  rows with two under the first stat and one under the second
  (`shots/example-roster.png`, two bands, each stat's value in its band head).
- **Table**: one number column (`Value`) and three declared rows (`Row 1` to
  `Row 3`), with `openRows` off (`shots/example-table.png`). It is not
  Inventory's open list with a total.
- **Track**: `count: 5` (`shots/example-track.png`, three of five boxes marked).
  It is not Checkbox's `count: 1`.

The exact strings are the build's, held to the filler rule above. These configs
are what was photographed.

The eight palette entries were photographed too (`shots/entry-<type>-<index>.png`).
All eight draw usefully from their own config, which is the claim that lets an
entry never need an example.

### §2. Containers: placeholder children the picker supplies

**The owner chose (a), the proposal below.** An `example`
cannot help a container. What a Group or Tab set draws depends on its `children`,
and `children` is an editor-owned key an example may not set. A Tab set with no
children draws only its heading, which is "nothing" under the threshold above.

**Decided: the picker draws a container's preview holding two placeholder
children, and labels it an example.** This is legitimate because `children` is
the *editor's* key: the editor writes it on every insert into a container, so
the picker composing a preview config with children uses no knowledge the editor
does not already own. The placeholders are the **first registered leaf type that
declares a `sample`, over an empty config**, labelled `Component 1` and
`Component 2`. That resolves to Card today, and the picker names no type
literally. In a Group they sit side by side, two columns by two rows each. In a
Tab set they are two tabs. Photographed: `shots/placeholder-group.png` and
`shots/placeholder-tab-set.png`.

The rejected alternatives:

- **(b) Let a container's `example` carry `children`.** Rejected: Tab set's
  example would then name `type: 'card'`, so a component would know another
  component exists, which is the isolation rule `CLAUDE.md` repeats above all
  others.
- **(c) Draw the empty container.** Honest and cheapest, and it is the smallest
  version's choice. The cost is a Tab set preview that is a bare heading, the
  one line in the picker whose drawing says nothing.

### §3. Where the picker lives: in place, in the pane, not a modal

The **Add component** row keeps its place above the tree, where the pane put it
so a long component list does not bury it. Its three controls, the type
dropdown, the destination dropdown and **Add**, become one button, **Choose**,
carrying `aria-expanded` and `aria-controls`. Pressing it opens the picker
**inline, directly under the row, in the pane's own flow**. While the picker is
open the button reads **Done**, and pressing it closes the picker.

**Why not a `Modal`**, although `new-layout.ts` and the two `SuggestModal`s are
the precedents nearest to hand:

- A modal's backdrop hides the canvas, so staying open for a second insert would
  mean inserting blind. Inline, the new component lands on the canvas above the
  picker in both regimes.
- A `SuggestModal` chooses on a click. That leaves no step between seeing an
  entry and inserting it, so a touch user would insert every entry they tried to
  look at.
- The iOS failure the OnlyWorlds plugin shipped, an unscrollable modal with its
  buttons behind the keyboard, fixed in 3.2.1 with a viewport cap, a scrolling
  body and pinned actions, is avoided by construction. The picker scrolls with
  the pane, and only its action bar is pinned (§6).

**Why not the configuration panel**, which is where the pane configures a
selection: the panel sits below the tree in the single-column regime, so the
picker would open a tree's length away from the button that opened it. It would
also make "add" a selection, displacing the component being configured. Inline
under the button is the same place at every width.

It is a disclosure region, not a floating surface. It uses none of
`ui/anchored-panel.ts`, which `docs/UI.md` §12 already records as the largest
thing this plugin draws. It is clothed like the pane's other blocks, the same
background and radius as the `.setting-item` rows around it, so it reads as part
of the pane and not as a fifth kind of panel.

### §4. Anatomy, top to bottom

1. **Search field.** `type="search"`, placeholder **Search components**,
   focused when the picker opens. It is a `role="combobox"` with
   `aria-expanded="true"`, `aria-controls` naming the list, and
   `aria-activedescendant` naming the active option. This is the WAI-ARIA
   combobox-with-listbox pattern with the list always shown, which is also how
   Obsidian's own suggesters are built.
2. **The list**, a `role="listbox"` labelled **Components**, in registry order.
   Each type starts a `role="group"` whose `aria-labelledby` is that type's own
   option: the type is an option, and its palette entries follow it, indented
   by real padding, not figure spaces. §4.2's rule is kept as it stands: types
   stay on the list beside their entries, because an author who wants a plain
   Track has to be able to ask for one
   (`docs/features/palette-entries-and-flags.md` §4).
3. **Each option** has two lines: the **name** (a type's display name from
   `componentDisplayName`, or an entry's `name`), and under it the
   **description** (the type's or the entry's), muted, wrapping where the width
   runs out. The option's accessible name is the name. Its description is
   referenced by `aria-describedby`.
4. **The active option expands in place** to draw its preview under its
   description (§5). Only one option is active, so only one preview exists.
5. **The action bar**, pinned (§6): the destination dropdown, **On the sheet** /
   **In <container>**, drawn only where the layout has a container that still
   takes a child, exactly as today; **Add <name>** (**Add Checkbox**, **Add
   Track**); and a `role="status"` line reporting the last insert.

**What the list does not do:** rank. Order is always registry order with entries
under their types, filtered or not, so the list's structure is always the
catalog. §4 of the palette spec's argument for why the dropdown stayed readable
is the same argument here.

### §5. The preview

**Rendered from data, never kept as a picture**, which is where the evidence
converges: Gutenberg renders each block's `example` (issue 17488, WordPress 5.3),
Figma draws its component playground live, and NN/G cites Revit's hover
renderings. GrapesJS's static thumbnails are the floor, and they would be 20
pictures that go stale whenever a component's look changes.

- **What is drawn:** one component, on a four-column grid at the option's width,
  spanning all four columns and three grid rows, the frame §1 photographed. The
  config is the entry's `config` for an entry. For a bare type it is `example`
  where the type declares one, or `{}` otherwise. A container gets the §2
  placeholders. The body is `sample(config)`, read through the component's own
  `read` and drawn by `renderGrid`, the canvas's own path, so a preview can
  never look different from the canvas. A Table grows past three rows rather
  than scrolling, which is its rule on the sheet as well.
- **Always sampled**, whatever the canvas's **Sample values** toggle says. The
  toggle governs the canvas, and a preview of an empty section would be the
  "nothing useful" drawing §1 exists to avoid.
- **Inert.** The whole preview subtree is `inert` and `aria-hidden="true"`. It
  is a picture of a component, not a component, so there is nothing to focus
  and nothing to hear. The option's text is what assistive tech reads. This is
  why a preview inside an `option` does not break the listbox pattern: the
  pattern forbids *interactive* content in an option, and the preview has none.
- **The example label.** Where the drawing came from `example` or from §2's
  placeholders, a tag reading **Example** sits at the preview's top-left corner,
  in the muted small type Obsidian uses for a flair. The option's accessible
  description gains the sentence "The preview is an example. It is added empty."
  The label is required because the drawing is not what **Add** produces, and a
  Track inserted after an example preview arrives showing its configuration
  error. The label is what makes that error expected rather than a betrayal.
- **One live render at a time, created on activation and discarded on the next.**
  Gutenberg 35719 measured about ten seconds to open an inserter that parsed
  thousands of entries eagerly. At 20 entries eager rendering would be cheap,
  but the price of the lazy version is also nothing, so no preview exists
  except the active one's.
- **Why it is inline under the active option, at every width**, and not in a
  side column or a pinned band: it is the one placement that sits next to the
  line it depicts at any width, with no side column the outline cannot always
  afford, and no pinned preview taking half a phone's height. On a phone, a tap
  shows the preview exactly where the finger is. The cost is that the list moves
  as the active option changes. Moving down collapses the preview above and
  opens one at the new option, so the active line stays close to where it was.
  Moving up opens the preview below the new active line, above nothing that
  moves. Scrolling keeps the active option and its preview in view
  (`scrollIntoView({ block: 'nearest' })`).

### §6. Interactions

Every interaction reuses Obsidian's or the pane's own gestures. There is no new
one.

- **Open.** **Choose** opens the picker, and focus moves to the search field.
  The first visible option is active: Card, in registry order.
- **Keyboard, from the search field.** Typing filters. ↑/↓ move the active
  option across groups as one sequence, wrapping at neither end.
  **Enter** adds the active option, into the chosen destination. **Escape**
  clears a non-empty query first, then closes the picker, returning focus to
  **Choose**. **Tab** leaves the field for the action bar.
- **Pointer and touch.** A press on an option makes it active and moves focus to
  the listbox (`tabindex="-1"`, with `aria-activedescendant` of its own), so a
  phone's keyboard drops and the action bar is in reach. ↑/↓/Enter work from
  there too. **A press never inserts.** Seeing and adding are two steps, because
  a touch user has no hover to look with. That is `docs/UI.md` §7's "never a
  hover-only affordance", and WCAG 2.1 SC 1.4.13's concern about content on
  hover does not arise, because nothing is shown on hover alone. Hover paints
  Obsidian's own hover surface on an option and changes nothing else.
- **Add.** **Add <name>** inserts the active option (§7), and so does Enter.
- **Stays open.** After an insert the picker is still open, with the query, the
  active option, the destination and the scroll position all kept (the scroll
  by the pane's own restore, below), so a second
  Track is one more press. This is the fix for Gutenberg 11632, an inserter that
  was a small scrolling window closing after each insert. The new component is
  selected, as today, so in the two-column regime its configuration opens in the
  panel beside the picker.
- **Announce.** The status line names the label the new component was given,
  which is what landed: **Added Checkbox on the sheet**, **Added Checkbox in
  Gear**, and **Added Checkbox 2 on the sheet** for the second one. It is visible because in the single-column regime the
  canvas may be scrolled out of view, and `role="status"` covers assistive tech
  (`docs/UI.md` §6, "announce what is not visible"). The new tree row takes the
  pane's existing flash.
- **Close.** Press **Done**, or Escape on an empty query. Opening another layout
  in the pane also closes the picker and clears its state, as it clears the undo
  stack.
- **Survives redraw.** Every insert, undo and panel edit redraws the pane, which
  replaces its children. The picker's open flag, query, active option and
  destination are held on the editor instance, like the **Sample values**
  boolean. The scroll offset is not the picker's to hold: the picker sits in the
  outline column, and the pane already restores that column's scroll across
  every redraw, which covers the picker too. Focus comes back through the
  pane's existing focus tokens (`data-sheetsmith-focus`: `picker-search`, `picker-list`,
  `picker-add`).
- **Undo.** An insert is still one `persist()` and one undo step. Undoing with
  the picker open leaves it open.

**Hit targets.** An option is two lines of text with padding, so it is taller
than the 44px `.claude/skills/design-review/reference/legibility.md` asks of a
coarse pointer. The whole option is the target. **Choose**, **Done** and **Add**
are Obsidian buttons.

### §7. Insertion is unchanged

**Add** does exactly what the dropdown's **Add** does today, and the code moves
without changing what it writes. The prefill is spread first, then `id`, `type`,
`label` and `position` from the editor. The label is `uniqueLabel(entry name or
display name)`, the id is `uniqueId(label)`, and the position is the next free
row at width `min(2, parent width)`, or the container's own box for a child of a
one-child container. A bare type inserts `config: {}`, **never its `example`**,
which is why the example is labelled. Every existing insertion test keeps
passing through the new control.

### §8. The destination: one surface

The destination stays on the picker's action bar, beside **Add**, as it sits
beside **Add** today. Where a component goes is a property of *this insert*, not
of the component. A second surface for it, dragging an entry onto the canvas, is
§7's own unbuilt "dragging a new component in from a palette" and stays out of
scope. The destination persists across inserts while the picker is open, so
filling a Group is repeated presses of **Add**. Its default stays **On the
sheet**, as today.

### §9. The pane's regimes and the phone

The picker is one column at every width. It needs no regime of its own, because
it is laid out as a list, not as columns.

- **Two-column regime** (pane above its derived threshold, about 1176px): the
  picker fills the outline column under the canvas. The panel beside it shows
  the last inserted component's configuration.
- **Single-column regime:** the picker fills the pane's width, still directly
  under **Choose** and above the tree. The canvas is above it and may be
  scrolled away, which is why the status line is visible.
- **Below about 470px** the pane has no narrow regime (`docs/BACKLOG.md`), and
  this feature does not fix that row. The picker's own content wraps: long
  descriptions wrap and the preview scales with the option's width. So the
  picker is no worse than the rows around it and is photographed there (§
  Acceptance criteria), and the row stays deferred.
- **The action bar is pinned:** `position: sticky; bottom: 0` inside the pane's
  scroll container. When the picker's end is on screen it sits at the picker's
  foot, and when the list runs past the viewport it stays at the viewport's
  bottom, so **Add** is always in reach. This is the OnlyWorlds fix, pinned
  actions and a scrolling body, applied to a pane rather than a modal.
- **Phone.** A press moves focus off the search field (§6), so the on-screen
  keyboard drops before the author reaches for **Add**. Whether a sticky bar
  clears the iOS keyboard while the search field has focus is an app-only fact.
  It is a manual check in the acceptance criteria, with its recipe.

### §10. Empty and error states

- **No match.** The list is replaced by one line, **Nothing matches "stress".
  Search by shape: number, boxes, list, table, picture, text.** It names the
  query and gives the fix, `docs/UI.md` §12's rule for a message, and it teaches
  the shape vocabulary §2 names components by. Each of the six shape words
  matches at least one line today (Card, Track, Dropdown, Roster, Image, Rich
  text), and a test holds each to a match. **Add** is disabled with no active option, and the status line keeps
  its last report.
- **A preview that cannot draw.** It draws the component's own error, exactly as
  the canvas does, since it is the canvas's render path. The contract test
  makes this unreachable for any declared sample or example, so it remains only
  for a component that has neither and whose empty section will not read. No
  such component exists today: Track was the one, and it now has an example.
- **A layout with no container:** no destination dropdown, as today.
- **Every type and entry always exists,** since the catalog is code, so there is
  no empty catalog state.

### §11. Search

Case-insensitive. The query is split on whitespace and **every term must
appear** (AND) in the searched text:

- A **type** is searched over its display name and its `description`.
- An **entry** is searched over its `name` and its `description`.

Grouping decides visibility. **A type that matches shows its whole block**,
because its entries *are* that type configured (`table` shows Table, Inventory
and Conditions). **An entry that matches shows under its type**, and the type
line is shown too, still selectable, because an entry never floats without the
type it prefills. The first visible option becomes active on every change of
query.

### §11a. Copy

Names are unchanged. All 20 are within three words already, and renaming a
catalog term to tidy a picker is the trap of Gutenberg's reusable-blocks-to-
patterns rename.

**Type descriptions** (new, every one ≤90 characters, one sentence, saying what
it looks like and never a job):

| Type | `description` | Chars |
| --- | --- | --- |
| Card | One labelled value on a card, with an optional derived number and a note line. | 78 |
| Card set | A row of cards, one per named value, under one heading and one shared formula. | 78 |
| Group | A region with a heading that holds other components on a grid of its own. | 73 |
| Image | A picture from the vault, embedded in the note and fitted to its frame. | 71 |
| Passport | A name at headline size beside a picture, over a line of short values. | 70 |
| Pool | A current value against a maximum, stepped up and down, with an optional buffer. | 80 |
| Record set | A list of named entries, each with a few typed fields and a paragraph of prose. | 79 |
| Rich text | A block of markdown prose the character writes, links included. | 63 |
| Roster | One table of stats, each stat heading a band of its own rows. | 61 |
| Table | Named rows under typed columns: numbers, text, toggles and computed values. | 75 |
| Tab set | A strip of tabs, each showing one component or region at a time. | 64 |
| Track | A row of boxes marked in order, as a count or as named levels. | 62 |

**Palette descriptions, rewritten**, with every clause of the current text
accounted for. "→ `key`" moves the clause into that config field's description
(the new wording is in § Config fields). "Deleted" gives the reason.

**Currency** (Card set) → *Coins as one card per denomination, each a value a
formula can read.* (68)

| Current clause | Goes to |
| --- | --- |
| Coins as five cards in a row, one per denomination: CP, SP, EP, GP, PP. | The new line, without the list. Deleted from the line: the preview draws the five denominations, and `entries` holds them |
| A Card set, so the note stores one entry per denomination | Deleted: `entries` already says "Each key is the entry name in the note" |
| and each publishes a name a formula can read. | The new line |
| Rename or drop the ones your game does not use. | Deleted: an instruction true of every entry, which §4.2 already defines as "a starting point the author edits". The list field's own controls show it |

**Dropdown** (Card) → *A value chosen from a closed list of options.* (45)

| Current clause | Goes to |
| --- | --- |
| A value chosen from a closed list: race, alignment, heritage. | The new line. The examples are deleted: three D&D words, and the only search they would serve is the job-word search this feature declines |
| The note stores the chosen option's value, so a choice can carry arithmetic — 2 shown as "Expertise" — | Deleted: `options` already says this, down to the same "Expertise" example |
| and nothing is chosen until the reader chooses it. | Deleted: `options` already says "Nothing is chosen until the reader chooses it" |
| Edit the options below; | Deleted: an instruction, as for Currency |
| the note line under the value stays for the detail a choice cannot carry. | → `hideNote` |

**Header** (Passport) → *The character's name and picture over a line of
identity values.* (64)

| Current clause | Goes to |
| --- | --- |
| The character's name, a picture and a short line of identity values: class, species and level. | The new line. The three field names are deleted: the preview draws them as chips |
| The name comes from the note's own filename and is not edited here; | **Deleted as false.** The name has been a fence entry under `nameKey` since the change `passport.ts` records in its own comment ("an entry in the fence, not the note's filename"). The copy outlived the decision |
| the three values are edited on the sheet. | → `fields` |
| Rename, reorder or drop the fields your game does not use. | Deleted: an instruction, as for Currency |
| Two rows suit a header with a picture; turn the picture off and one row suits it, since the text alone does not fill two. | Deleted: `hidePicture` already says this ("give it one row … two of them leaves a band of empty card") |

**Spellbook** (Record set) → *Spells the character adds, each with a level, a
prepared flag and its text.* (75)

| Current clause | Goes to |
| --- | --- |
| A list of spells the character adds, each with its level, whether it is prepared, and its description under it. | The new line |
| A Record set, so a spell is a heading in the note with its own paragraph, | Deleted: a fact about every Record set, stated by §4.2 and by the type's own new description ("a paragraph of prose"), not about this entry |
| and a spell named as a wikilink keeps a working link. | Deleted: likewise true of every Record set (Constraint 2's consequence, §3.1). No field concerns it, and the entry line has no room for a type-wide fact |

**Features** (Record set) → *Features the character adds, each with uses,
modifiers and its full text.* (73)

| Current clause | Goes to |
| --- | --- |
| A list of features, traits or moves the character adds, each with a uses counter, | The new line. "traits or moves" is deleted for the budget |
| the modifiers it applies while it is switched on, | The new line, **without "while it is switched on"**, which is inaccurate: the entry's fields are `Uses` and `Modifiers`, and there is no flag to switch |
| and its full text under it. | The new line |
| A Record set, because a feature's text is a paragraph and a table cell is one line. | Deleted: the reason for choosing the type, which is design rationale. It is recorded in the palette entries' feature doc, and an author acts on nothing in it |

**Inventory** (Table) → *Gear the character adds, with quantity and weight, and
the weight totalled.* (75)

| Current clause | Goes to |
| --- | --- |
| An open list of gear: the character adds every row, names it, and fills in a quantity and a weight. | The new line |
| A Table with the weights totalled under it, | The new line |
| storing as ordinary markdown, so an item named as a wikilink stays a real link the vault indexes. | Deleted: true of every Table (Constraint 2's consequence), not of this entry |

**Conditions** (Table) → *States the character is in, each switched on or off
with the modifiers it applies.* (82)

| Current clause | Goes to |
| --- | --- |
| An open list of the states the character is in: raging, blessed, poisoned. | The new line. The examples are deleted for the budget |
| Each row carries an Active flag beside the Modifiers it applies while that flag is set, | The new line |
| so a modifier conditioned on Active stops counting the moment the row is switched off. | Deleted: the condition is typed in the modifier form's condition field (`ui/anchored-panel.ts`), which is not a component config field. Explaining modifier conditions is the **modifier-rules half** of §13's copy-budget entry, which stays open and is not this feature's |
| A Table storing as ordinary markdown, | Deleted: true of every Table |
| so a rest can be bound to empty the whole Active column at once. | Deleted: the reset binding (`reset`, an editor-owned field) lists the Active column by name through `resetColumns`, which is where an author meets it |

**Checkbox** (Track) → *One yes-or-no flag, drawn as a single ring.* (43)

| Current clause | Goes to |
| --- | --- |
| One yes-or-no flag: inspiration, equipped, trained. | The new line. The examples are deleted for the budget |
| A track of one segment, so the note stores yes or no rather than a count, and the card draws one ring. | Deleted: `count` already says this ("A plain 1 makes this a checkbox … stored in the note as yes or no") |
| Name the levels to letter the ring, | → `levels` |
| or add rows for a checklist of flags under one heading. | → `rows` |

### §12. Where the code goes

- **`src/types.ts`**: `description: string` on `ComponentDefinition`, after
  `type`. `example?` between `configName` and `sample`. `PaletteEntry.description`'s
  comment loses "state the consequence", which the budget replaced with
  "one sentence, what it is".
- **`src/components/*.ts`**: 12 descriptions, 4 examples, 8 palette rewrites,
  and 4 field-description relocations (card `hideNote`, passport `fields`, track
  `levels` and `rows`).
- **`src/editor/picker-catalog.ts`** and a test beside it: the flattening
  `addChoices` did, plus the search filter. It is pure, with no DOM, so both are
  tested without a pane. `AddChoice` moves here, and its comment is corrected
  (§ Model question).
- **`src/editor/sample-read.ts`**: what a component reads with no character
  behind it, which is `Canvas.readForCanvas`'s body lifted out. The canvas and
  the preview are two consumers of one **policy** (a container reads nothing, a
  sample is read through `read`, a missing sample is an empty section), so it
  climbs `docs/PATTERNS.md` §1's ladder in one step. The contract test's source
  scan, which asserts `sample(` is called only from `editor/canvas.ts`, moves to
  this module.
- **`src/editor/component-preview.ts`**: draws one config inert on the preview
  frame through `buildSheet` and `renderGrid`, the way `Canvas.draw` does,
  without overlays or gestures. It also holds the container placeholder rule
  (§2).
- **`src/editor/component-picker.ts`**: the disclosure, search field, listbox,
  action bar, status line, and the state that survives redraw.
- **`src/editor/layout-editor.ts`**: `renderAddRow` becomes the **Choose**
  row. `addChoices`, `AddChoice` and `ADD_DESCRIPTION_ID` leave it. `indent`
  keeps one consumer, the destination dropdown, and its comment says so.
- **`src/editor/described-row.ts`**: its header drops the pane's Add row. Two
  consumers remain (New layout's **Start from**, the **Layout file** row), so it
  stays a module.
- **`src/styles/editor.css`**: the picker's rules. `styles.css` is rebuilt,
  never hand-edited.
- **`harness/editor-pane.ts`, `harness/harness.ts`, `harness/shot.mjs`**:
  `PaneView.choice` is replaced by `picker` (`open`), `pickerQuery`,
  `pickerActive` (`<type>` or `<type>:<index>`), `pickerInto` (a container id,
  for the destination, which `picker-destination` needs) and `pickerAdd`, each
  driving the control a user would press. The shots are listed under § Acceptance
  criteria.
- **`docs/UI.md`** §9: the **Add component** paragraph becomes history for
  `.sheetsmith-add-row`, which keeps its New layout and Layout file consumers. A
  row for the picker's vocabulary goes in: an inline disclosure with a pinned
  action bar. **`docs/PATTERNS.md`** §3: the member order gains `description` and
  `example`.

## Config fields

The feature adds no component config field. It rewrites four existing field
descriptions to receive relocated clauses. Each is shown as it will read, with
the addition in bold:

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `hideNote` (Card) | boolean | Hide note | Leave the note line off the card. Stored text is kept. **On a dropdown, the note line holds the detail a choice cannot carry.** |
| `fields` (Passport) | entries | Fields | The values shown under the name, in this order, **each typed on the sheet.** Each key is the entry's name in the note, … (rest unchanged) |
| `levels` (Track) | text-list | Level names | … (unchanged) … so this wins over the count above. **On a checkbox, naming the levels letters its ring.** |
| `rows` (Track) | track-rows | Rows | … (unchanged) … Rows and named levels do not combine. **With one segment each, rows make a checklist of flags under one heading.** |

The budget does not apply to config field descriptions. It applies to the picker
line only. The four additions are one clause each.

## Data and file model

Nothing is stored. `description` and `example` are code. Insertion writes the
same component the dropdown wrote (§7). No layout, no note, no key and no type
name changes, so every existing file reads as before and round-trips
byte-identically. The four field-description edits are copy.

## Acceptance criteria

### Contract (`src/components/contract.test.ts`)

- [x] `gives every type a description of one sentence within 90 characters`
- [x] `keeps every palette entry description to one sentence within 90 characters`,
      where "one sentence" means it ends in `.` and holds no `.`, `!` or `?`
      followed by a space before that
- [x] `names every type and palette entry in at most three words`
- [x] `declares an example only beside a sample, and never on a container`
- [x] `sets no editor-owned key in an example`
- [x] `declares every example key as a config field it also renders`
- [x] `never declares an empty example`
- [x] The sample sweeps (reads back, writes byte for byte, no wikilink, no
      modifier enrolment) include every declared `example`
- [x] Member order places `description` after `type`, and `example` between
      `configName` and `sample`. `docs/PATTERNS.md` §3 says so
- [x] The source scan finds `sample(` called only from `editor/sample-read.ts`
- [x] Exactly Card set, Roster, Table and Track declare `example`. Adding a
      fifth means updating this spec's §1 table with its photograph

### Copy

- [x] The 12 type descriptions and 8 palette descriptions read as § Copy states,
      or as the owner revises them
- [x] The four relocated clauses are in `hideNote`, `fields`, `levels` and `rows`
      as § Config fields states
- [x] No clause of the eight old descriptions appears anywhere else in the
      source, which is checked by grepping each one

### Catalog and search (`src/editor/picker-catalog.test.ts`)

- [x] Order is registry order, each type followed by its own entries
- [x] Matching is case-insensitive over name and description, with all terms
      required
- [x] A matching type shows its whole block. A matching entry shows under its
      type
- [x] `stress` matches nothing. Each shape word the empty state offers matches
      at least one line
- [x] `inventory` finds Inventory under Table

### The picker (pane tests)

- [x] **Choose** carries `aria-expanded` and `aria-controls`. Opening moves
      focus to the search field, and Card is active
- [x] ↑/↓ move `aria-activedescendant` across groups. Enter adds the active
      option
- [x] A press on an option activates it and inserts nothing
- [x] Exactly one preview exists while the picker is open, and it is `inert` and
      `aria-hidden`
- [x] The **Example** tag and its sentence appear for Card set, Roster, Table,
      Track, Group and Tab set, and for no palette entry and no other type
- [x] A bare Track's preview is drawn from its `example`, never from
      Checkbox's config
- [x] **Add** inserts the same component the dropdown inserted, for a bare type
      and for an entry, on the sheet and into a container. The existing insert
      tests pass through the new control
- [x] After **Add** the picker is open, with query, active option, destination
      and scroll kept. The status line reads **Added <label> on the sheet** or
      **… in <container>**, the label the component was given (**Added
      Checkbox 2 on the sheet** for a second Checkbox), and focus returns to
      the control that added
- [x] Escape clears a query, then closes and focuses **Choose**. **Done** closes
- [x] The destination dropdown appears only where a container can take a child,
      and persists across inserts
- [x] The picker survives an undo and a panel edit while open, and closes when
      the pane opens another layout

### Look (the land stop: every state photographed, shots named in `harness/shot.mjs`)

Taken with `npm run harness` then `npm run harness:shot`. Scoped shots carry the
entry's own `size=`.

- [x] `picker-closed`: the **Choose** row in place of the three old controls
- [x] `picker-open-light` and `picker-open-dark`: open, Card active, bare sample
      preview
- [x] `picker-example`: Track active, with the **Example** tag and five boxes
- [x] `picker-entry`: Checkbox active, drawn from its own config, with no tag
- [x] `picker-container`: Tab set active, two placeholder tabs, and the tag
      (§2)
- [x] `picker-image`: Image active, the empty frame
- [x] `picker-search`: query `box`, showing Track's block
- [x] `picker-no-match`: query `stress`, showing the empty state
- [x] `picker-destination`: the harness layout, which has containers, with the
      destination set to a container
- [x] `picker-after-add`: after **Add**, still open, with the status line and the
      new component on the canvas
- [x] `picker-bounded`: the bounded pane with the list running past the
      viewport, and the action bar pinned at the bottom
- [x] `picker-stacked`: the single-column regime
- [x] `picker-narrow-480` and `picker-narrow-380`: the pane as it is below its
      missing narrow regime. The picker content wraps and nothing clips that
      the surrounding rows do not
- [x] `picker-large-text`: `text=24`
- [x] `picker-forced-colors`: the active option and the focus ring still visible
- [x] Reviewed against `docs/UI.md` §6 and §7 by `/design-review`, with the PNGs
      at the land stop even if it comes back clean

### In the app (manual, throwaway vault only)

The harness cannot show a phone keyboard. Recipe: in the throwaway vault, open
any layout in the layout editor pane, on desktop with the pane narrowed to a
single column, and on a phone or a mobile emulation of Obsidian. Press
**Choose**, type `tr`, tap **Track**, and confirm that the keyboard drops and
**Add Track** is reachable without scrolling. Press it twice and confirm two
Tracks appear and the picker is still open.

### Gates

- [x] `npm run lint`, `npm test`, `npm run build` pass

## Commit boundaries

A plan for `/land-it`, applied once at the end, not a schedule to follow while
building.

1. **`feat: Give every component a line saying what it is`**: the
   `description` member, 12 descriptions, the eight palette rewrites and the four
   field relocations, the budget checks in the contract test, and the
   member-order update in `docs/PATTERNS.md` §3. The old dropdown's description
   line shows a bare type's description too, so the member has a reader from its
   first commit.
2. **`refactor: Read a sample for drawing in a module of its own`**:
   `editor/sample-read.ts`, the canvas moved onto it, and the source scan moved
   with it. No behaviour change.
3. **`feat: Let a component offer an example configuration`**: the `example`
   member, the four examples, and their contract checks.
4. **`feat: Choose a component from a picker that previews it`**:
   `picker-catalog.ts`, `component-preview.ts`, `component-picker.ts`, the
   `layout-editor.ts` wiring and deletions, the CSS, the harness parameters and
   shots, and the tests.
5. **`docs: Describe the component picker`**: `docs/UI.md` §9,
   `described-row.ts`' header if not already in 4, and the `docs/SPEC.md` edits
   below.

## What `/ship` changes in docs/SPEC.md

Named clause by clause, because finding them again is the expensive part.

- **§4.1, the property table or the paragraph after it:** `description` as a
  required declared property, beside `type` and `storage`: "what the type looks
  like, in one sentence of at most 90 characters, never a job".
- **§4.1, the optional members:** a bullet for **`example`**, with the argument
  in § Model question (it passes the rule on `palette`'s grounds, is drawn only
  through `sample`, sets no editor-owned key, is never inserted and never
  written).
- **§4.1, `palette`:** "a description" gains "of one sentence, at most 90
  characters", and the name gains "at most three words".
- **§4.2, "What earns a palette entry":** "the menu is grouped by type with each
  entry under its own" stays true. Add that search matches names and
  descriptions only, so a job reaches the picker through an entry's words or
  not at all.
- **§7, the add-menu sentence:** "Its add menu offers palette entries beside the
  bare types, each entry indented under the type it prefills and its description
  shown below the row" becomes the picker: grouped, searchable, each line a name
  and one sentence, the active line previewed live from `sample`, with an
  `example` labelled as one, staying open across inserts. "Types stay on the
  list" stays word for word.
- **§7, the "Grid canvas" bullet:** "the **Add component** row and its
  destination dropdown are still how one is created" becomes "the component
  picker and its destination are still how one is created".
- **§13, copy budget:** the "Decided for the add control" paragraph written by
  this spec becomes `Resolved:` for the add control's half. The modifier-rules
  half keeps the entry open.
- **§13, a new open question, since the owner chose §2's (a):** whether a
  container's preview should be composed by the editor or declared by the
  container, recorded with (b)'s isolation cost.

## Deliberately not doing

- **No new palette entry.** A computed entry over Card is deliberately deferred.
- **No type is renamed**, and no entry either.
- **No `keywords` member**, and no job-word synonyms in any description.
- **The pane's missing narrow regime below 470px** stays a `docs/BACKLOG.md`
  row. The picker works inside the pane as it is.
- **Other UI rows in `docs/BACKLOG.md`** stay deferred.
- **The canvas's Preview (Sample values) toggle** is unchanged, and the picker
  ignores it.
- **Dragging an entry onto the canvas** (§7's unbuilt palette drag).
- **Ranking search results**, recently used entries, and favourites. The list is
  always the catalog in registry order.
- **Defaulting the destination to the selected container.** It stays **On the
  sheet**, as today.
- **Moving the flattening into the registry.** The picker replaces the one
  consumer, and a second has not arrived.
- **The bare Track insert error.** A bare Track's empty config is a
  configuration error whatever the add control is, and it predates the picker.
  Nothing is added to Track in this branch beyond its `example`; it is a separate
  short task after this lands.
- **Rewriting other config field descriptions** to the budget. It governs the
  picker line only.
