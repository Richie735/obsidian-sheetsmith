# One control module for the two-state ring

Status: shipped
Board card: two rows in `docs/BACKLOG.md` § Patterns, taken together because the second cannot be closed without the first's answer — "A shared vocabulary's member is computed and its value discarded" (`components/stored-flag.ts`, `components/table.ts`, `components/track.ts`) and "The two-state ring's ARIA wiring is spelled in all three components that draw one, and its touch route in two" (`components/table.ts`, `components/track.ts`, `components/record-set.ts`). Both rows leave `docs/BACKLOG.md` when this lands.

## Model question

**`docs/SPEC.md` §13: "Whether an unnamed two-state control says 'Yes' or 'No' to a listener, or lets `aria-pressed` say it."**

**Ruled by the owner: `aria-pressed` says it.** This is a fixed premise of the rest of this document, not something the document argues its way to. What §13 recorded as the case for taking that side stands as the reason: `aria-pressed` is the platform's own word for exactly this state, every screen reader already reads it, and a custom "Yes" beside it is a second name for one state — announced after the name the platform already announced. The two per-component comments that say so were written as asides and turn out to be the rule:

> Two states is a toggle button, and ARIA has a word for that; more than two is not, so those carry their state in the name instead. — `table.ts` ~2432
>
> A `<button aria-pressed>` because that is the word ARIA has for two states, where the run's `role="slider"` is for a value with positions between its ends. — `track.ts` ~2041

Four things follow, and each is a deliverable rather than a remark:

1. **`flagReading` goes**, with the three call sites that compute it and discard it — `table.ts:2401`, `track.ts:2085` and `roster.ts:1331`. Four components draw the ring and three of them computed the reading: Record set never called it, reaching `levelName` directly, and its ungraded toggle takes no reading at all. `table.ts`'s and `roster.ts`'s `nameOf` collapse to `levelName`; `track.ts`'s `reading` collapses to `stepLabel`, which is already `levelName` one step over. Every use of the discarded branch is unreachable today: a select is only drawn for a graded column, the name-carrying `aria-label` is only taken when `count > 1`, and a `title` is only set for a named level — so an ungraded toggle takes none of the three. That is why inverting the function passes the whole suite.
2. **The rule is promoted out of the two comments into one place in `docs/PATTERNS.md` § 6 Interaction conventions**, beside the existing "ARIA is part of the control, not a retrofit" bullet, which today says `aria-pressed` for two-state marks without saying what the *other* states do or that a word beside `aria-pressed` is forbidden. A rule, not a longer backlog row.
3. **The new module carries a naming parameter and no reading parameter.** What a *level* is called is already one policy in `level-ring.ts`; what the *ring itself* is called is the thing that differs per component, and it is the only string the module takes.
4. **One cost is accepted, explicitly.** "Yes" and "No" leave the vocabulary. A later surface that needs a *word* for a flag — a summary line, a printed or exported sheet, a formula reading a flag into text — reopens the question, and it should reopen it there rather than inherit an answer: that surface needs a reading for a stored value, which is a different question from what a control announces to a listener standing on it. If it comes back, it comes back as a reading beside that surface's own vocabulary, and `stored-flag.ts` is where it would land only if a second such surface appears.

**Nothing else in the model moves.** The component contract (SPEC §4.1) does not grow. Nothing new is published to formulas. No write path is touched, so Constraint 3 holds by construction rather than by test, and Constraint 4 is not engaged: no layout key, label or stored spelling changes, so no character note can be orphaned by this. `src/parse/` and `src/formula/` are not touched at all.

## What it does

Nothing a reader of a sheet sees changes. Four components — Table, Track, Record set and Roster — stop each spelling out what a level ring announces, what it says when it is asked, and what a press and the arrow keys do to it, and call one module that decides all of it. `flagReading` and its three discarded call sites go, so `aria-pressed` is the only thing that says which way an unnamed flag is set.

## Smallest version

Delete `flagReading` and collapse its three call sites, and promote the two component comments into one rule in `PATTERNS` §6. That is the §13 answer shipped on its own: it closes the first backlog row, ships no behaviour, and needs no module.
What it gives up is the second row — four spellings of the ARIA stay where they are, the touch route stays three-and-a-half spellings, nothing reports a fifth copy, and the row stays open with its stale touch-route clause corrected in place rather than deleted.

## Design

### The boundary is four components, not the three the row names

`src/components/roster.ts` ~1325-1390 draws a near-verbatim copy of Table's level/toggle cell: the same `paintLevelRing`, the same `aria-pressed`/`aria-label` pair, the same `bindLongPress` under the same named-level predicate, the same wrapping click and the same arrow keydown, and it calls `flagReading` at 1331. Leaving it out would put a fourth spelling outside the new module on the day the module lands and force the new check to carry an exemption for it. So the extraction is Table, Track, Record set and Roster.

Recorded the way `docs/features/component-rename-migration.md` recorded its own wider boundary: **the question named three surfaces and the code has four**, and the count came from grepping for the marker rather than from the names in the row. `grep -n "aria-pressed" src/components/*.ts` finds four components, not three.

### Where it lives and what it is named

**`src/components/ring-control.ts`**, exporting `bindRingControl`.

One sentence, per `PATTERNS` §1: *it makes a control out of a painted level ring.* The painter stays in `level-ring.ts` and keeps a consumer this module must not reach: the layout editor's level sample. **Corrected from an earlier draft, which said that sample "paints a ring and binds nothing"** — it does bind, a `<button>` with an `aria-label`, an `aria-pressed`, a `title` and a click (`editor/list-fields.ts` ~1294-1311), and the real reason is better than the one that was written. Its two states are a fact about the *layout* an author is writing, "this level shows a mark" against "shows nothing", where every state the module carries is a fact about a character's level; and its press sets a level's glyph rather than cycling the ring. So folding the ARIA into `paintLevelRing` would overwrite a true statement with a false one. Painting and controlling are two responsibilities and stay two files.

Named for the ring rather than for a cell, which is `level-ring.ts`'s own argument one file over: the class is `sheetsmith-level-ring` rather than naming a table precisely because a card and a cell share it. `components/` rather than `interaction/` because the module reaches for the painter, and a module in `interaction/` that knows what a level ring is has the layering backwards; `PATTERNS` §2's test is which folder names what the module *does*, and what this one does is ring-shaped.

It declares no `ComponentDefinition`, is in no registry, imports nothing from `obsidian`, and touches no file. It goes on the sibling allowlist in `eslint.config.mts` in both spellings (`'!./ring-control'` and `'!../components/ring-control'`) and into the enumerated import spellings in `components/isolation.test.ts` — which `PATTERNS` §2 requires to be a decision rather than an inheritance. The decision: four consumers, one past the rung §1 stops arguing at.

### What it takes

Bind-shaped, like `bindEditable`, `bindLongPress` and `bindArmToConfirm`: the caller makes the element and classes it, the module wires it.

| Parameter | What it is | Why it is a parameter |
| --- | --- | --- |
| `button` | The `<button>` the caller has already made and classed | Track adds `sheetsmith-track-flag`, `sheetsmith-track-harm` and a `tabIndex` of its own; Table, Record set and Roster add none. A module beside the components must not know a track exists (`PATTERNS` §1, `linked-text.ts`'s paragraph) |
| `column` | The `LevelColumn` the painter reads — `levels`, `max` | Track synthesises one from its card config (`{ levels: config.levels }`); the other three pass the column or field itself |
| `count` | How many levels above none. `1` is a two-state control | **Not derived from `column`.** A `toggle` column may still carry the `levels` of the `level` column it used to be, and `levelCount` would then answer for a control the layout no longer asks for. The count is the caller's reading of its own config, which is what all four already compute |
| `graded` | Whether the ring shows a glyph and a share of the ramp (SPEC §4.2) | Table, Record set and Roster: the type is `level`. Track: the steps are named. A one-segment Track is the case where `count === 1` *and* `graded` — the combination no cell ever has |
| `level` | The level to start at | Reading a stored value stays with the caller (below) |
| `name` | What this ring is called | **The one difference the backlog row named.** A cell by its column label, a card by its config label or its row name when it is a row set, a record by its field-and-record name, a roster cell by its column label |
| `nameOnScreen` | Whether that name is already visible beside the ring | The Record set divergence, named for its reason rather than its effect (below) |
| `onSet(level)` | Run when the level changes, and only then | Every caller's write differs: drafts and a recompute in a cell, a row key in a card, an added-record branch in a record |
| `onVertical(step)` | Optional. Answer Up and Down where the caller owns that axis; returns whether it did | On a Track card Up and Down move between the flags of a checklist — the row set's own focus rule — where in a cell they step the level. Omitted, the module steps |

It returns `{ setLevel(level), repaint() }`, and **`setLevel` reports nothing** — it moves the ring and paints it, where a press is the route that calls `onSet`. That is `Run.setMarks`'s own contract, "move the run without writing": `commit` writes every dirty run in one change to the note, which is the whole argument for a row set over three components, so a programmatic move that wrote for itself would turn a sweep over a checklist into one change per row.

**Track is the only consumer of either member**, filling the `paint` and `setMarks` of its `Run` record, which a sweep at `track.ts:1746` repaints through. **Table, Roster and Record set need neither**, and an earlier draft of this paragraph said they needed `repaint` "for the same reason their current code keeps a `let repaint` forward declaration". They do not: that forward declaration existed only because `show` was defined after `setLevel` in source order, and the paint it stood in for now happens inside the module. The reason behind it still holds and is now the module's — a write that produces the same file does not rebuild the view, and the control must never be left showing a level the user has moved off.

### What the module decides, and why it needs no second naming parameter

Given the parameters above it derives, in one place:

- **`aria-label`.** `count === 1` → `name`, with `aria-pressed` carrying the state. `count > 1` → `${name}: ${levelName(column, level)}`, because more than two states is not a toggle button and the state has to ride in the name.
- **The word**, where there is one: `graded && column.levels !== undefined ? levelName(column, level) : null`. An unnamed level shows the number that is already the whole answer.
- **`title`** — and this is the one place the four disagree on purpose, below.
- **The long press**, bound on every ring, yielding exactly the string `title` holds and `null` where there is none.

**The three namings reduce to one string, which is the result that makes this a parameterised module rather than three.** What a *level* is called was already one policy — `levelName` in `level-ring.ts`, which answers with the level's name where the layout gave it one and its number where it did not, and which `stepLabel` already delegates to. With `flagReading` gone there is nothing left for a caller to decide about a level's word. What is left is what the ring itself is called, and that is `name`.

### The `title` rule, and Record set's departure

`docs/UI.md` §6: "Only a named level earns a `title`, and a tooltip repeating what is already legible is noise." Record set departs from it deliberately, and the argument is in the long comment at `record-set.ts` 1967-1989 — preserved, not flattened:

> Table and Track set a `title` only for a named level, and in a cell that is right, because the field's own name is already in a `<th>` over the column and only the level's word is missing. **A record has no `<th>`.** Here the missing word is the field's own name, and it is missing on a `toggle` as much as on a `level`: a reader sees `Fireball · Level 3 · ●` and nothing on screen says the dot is "Prepared".

So it is a parameter, not a caller's business — because the thing that differs is a *fact about the surface*, and a fact is what a parameter is for. Which side of it a caller is on is the caller's business; what to do about it is not. `nameOnScreen` is named for the fact rather than for the effect, so the call site reads as a statement about the surface (`nameOnScreen: true` in a table cell, `false` in a record) rather than as a request for a tooltip:

- `nameOnScreen` → `title` is the word, and is removed where there is none.
- not `nameOnScreen` → `title` is `${name}: ${word}` where there is a word, and `name` alone where there is not.

Both branches reproduce today's four call sites exactly. `docs/UI.md` §6's bullet gains the condition it was always relying on: *a tooltip repeats what is legible only where the control's name is on screen beside it.* Without that clause the rule reads as saying Record set is wrong, and it is not.

### The touch route, and the correction to the backlog row

The row's clause "Its ring binds no `bindLongPress` either, so a named level's word is unreachable by touch there" is stale and describes none of the four. The true shape today: `bindLongPress` is spelled in all four — `table.ts` 2461, `roster.ts` 1371, `record-set.ts` 2012 bind unconditionally, `track.ts` 2120 binds only when the steps are named. What actually differs is what the provider yields on the *flag* route: `null` in Table and Roster, nothing at all in Track because the binding is guarded away, the field's accessible name in Record set.

The module says it once: **the long press says exactly what the tooltip says.** It is bound on every ring, and where there is nothing to say it opens nothing — which is what `bindLongPress`'s own contract already does with a `null` provider, and what Record set already spells as `() => button.getAttribute('title')`. That satisfies `docs/UI.md` §7's "never a hover-only affordance" for all four at once, and it removes Track's guarded binding in favour of a provider that answers `null`, which is the same behaviour with one fewer branch.

### What stays with the caller

Everything whose answer is about the component and not about the ring.

- **Reading the stored value into a level.** Table reads a toggle through `typedValue(column, raw) === true`, Record set and Roster through `isFlagSet(raw)`, Track through its own `storedMarks`. The module takes a number, so none of these moves and none of them can drift into the module. (The first two agree today because `typed-value.ts`'s boolean rule *is* `isFlagSet`; that is an observation, not a thing this feature touches.)
- **Writing.** `stateOf`, the drafts map, `recompute`, `commit`, `context.onChange` and Record set's added-record branch all stay, reached through `onSet`.
- **Class names and the element.** Per `linked-text.ts`'s precedent, taken one step further: the class name is not even passed in, because the caller makes the button.
- **The `<select>` branch.** Where a graded column asks for `input: 'select'`, three of the four draw a native menu instead of a ring. It is not this module's: it carries no ring, no `aria-pressed`, no long press and no cycling, and it only exists above two states. What is worth saying is that after `flagReading` goes those three copies become literally identical but for a class name — if they earn a module it is a different one, and it is not this one.
- **Track's run.** The slider path, its drag, its segment hit test, its `role="slider"` and its own `bindLongPress` at 2822 are untouched. Only the one-segment flag branch is in scope.

### The one behaviour change, named

Track's flag keydown calls `commit()` after `run.setMarks(wanted)` **whether or not the value moved** — an arrow press on an already-set flag writes. Table, Record set and Roster have never done this: their `setLevel` returns early and commits nothing.

The module fires `onSet` only on a change, so Track's unconditional commit goes. It is a deliberate change rather than an accident of extraction, and the reason is that a commit of a value nobody moved is a write of bytes the file already holds — which Constraint 3 makes unobservable in the note and which the other three components' behaviour already treats as the rule. It earns a criterion below rather than a footnote, because it is the one line of this feature that a diff reader would otherwise have to take on trust.

### Empty and error states

A ring has neither of its own, and that is worth stating rather than leaving to be discovered. Level zero is an empty ring, which is the ordinary unset state and not an empty state. A stored value the control cannot represent never reaches the module: `levelOf` holds a hand-edited number inside the column's range before it is passed, and Track reports a value that is neither a number nor a flag as a malformed section (`isFlagSpelling`) and never draws a ring at all. The module has no failure of its own to report, so it draws no `.sheetsmith-error` and takes no message.

### What happens to `stored-flag.ts`

It keeps `flagText`, `isFlagSet` and `isFlagSpelling` — the three note-format members — and loses `flagReading`. Its header currently names "three things that would drift" and comes out naming two: which spellings mean yes, and what gets written. The third bullet, "What a two-state control is called", goes with the function.

Two documented claims about that module also need correcting in the same pass, or the file and the docs disagree:

- `PATTERNS` §10's shared-vocabulary paragraph lists "what a two-state control is called" among what `stored-flag.ts` holds, and ends "One member of `stored-flag.ts` does not meet the condition below, and §11 holds it." Both sentences go.
- `PATTERNS` §11 points at `docs/BACKLOG.md` § Patterns, where both rows are removed.

The module stays in `components/`, stays on the sibling allowlist, and stays a vocabulary tested through its consumers. With the reading gone, every member it holds is driven by a real read or a real write in `table.test.ts` and `track.test.ts`, so §10's exception applies to it cleanly for the first time.

### What is not a fifth copy

`src/editor/list-fields.ts` ~1288-1310 draws rings and sets `aria-pressed` on them, and it stays exactly where it is. Its two states are *"this level shows a mark"* against *"shows nothing"* — a fact about the layout the author is writing, not about a character's level — and its own comment says so. It is a different control that happens to borrow the same painter, which is what the painter is for. Named here so that the next reader does not widen the check's file set to catch it.

## Config fields

None. This feature adds no config field, changes no field's description, and changes nothing the layout editor draws.

## Data and file model

Nothing stored changes. `flagText`, `isFlagSet` and `isFlagSpelling` keep their behaviour to the character: a note holding `yes`, `true`, `x`, `✓`, `✔` or `1` reads as set, `no` and `false` read as cleared, and a press writes `yes` or `no` exactly as it does today. No read path, write path or serialiser is touched, so Constraint 3's byte-identical round trip is preserved by construction, and every existing round-trip test passes unedited. A character note written yesterday reads identically tomorrow, and Constraint 4 is not engaged because no label, key or section name moves.

No vault fixture work: nothing a character note holds and nothing a layout can configure changes, so there is no new variation to place.

## Acceptance criteria

- [x] `grep -rn "flagReading" src docs` finds **no live reference**: the function, its export, its three call sites and its bullet in `stored-flag.ts`'s header are all gone. **Amended from "nothing outside this spec's own history"**, which was not checkable as written, because the removal earned three records and a grep cannot tell a record from a use — this document, the superseded note in `docs/features/palette-entries-and-flags.md`, and `SPEC` §13's `Resolved:` entry. Each names the member to say it went.
- [x] `stored-flag.ts` exports exactly `flagText`, `isFlagSet` and `isFlagSpelling`, and its header names two things that would drift, not three.
- [x] `src/components/ring-control.ts` exists, declares no `ComponentDefinition`, imports nothing from `obsidian`, and is reached by exactly four component files.
- [x] `table.ts`, `track.ts`, `record-set.ts` and `roster.ts` each call `bindRingControl` and none of them spells `aria-pressed`, `aria-label` or `bindLongPress` for a ring.
- [x] Every existing test in `table.test.ts`, `track.test.ts`, `record-set.test.ts` and `roster.test.ts` that asserts a ring's attributes passes **unedited**, except the single Track case named below. A test that had to be changed to pass is a behaviour change nobody decided on.
- [x] `ring-control.test.ts` drives the module directly against a plain button and a stub column, over: a two-state ring (`aria-pressed` set, `aria-label` the bare name, no `title`); a named two-state ring (`title` the word); a graded ring above two states (no `aria-pressed`, `aria-label` reading `name: word`); an unnamed graded ring (`aria-label` reading `name: 3`, no `title`); and both `nameOnScreen` branches. It earns its own file under `PATTERNS` §10's default rule rather than an exception: it has an entry point and a reportable output, and it needs no component to be driven.
- [x] The long press opens exactly what `title` holds, on all four components — `table.test.ts`, `record-set.test.ts` (the field-and-record name on an ungraded toggle), and cases added for `roster.test.ts` and `track.test.ts` during review, which had none. **The second clause is narrower than "per component" and is recorded rather than rounded up**: that it opens *nothing* where there is no `title` is asserted in `track.test.ts` — the one call site whose touch route changed shape, having lost a guarded binding — and in `ring-control.test.ts`, which owns the branch. Table and Roster can both draw an unnamed graded ring and neither asserts it. Judged not worth a case each, since the branch is the module's and the module is driven directly; the ledger says so rather than the criterion claiming four.
- [x] The press and the keys are unchanged: a click cycles and wraps at the top; Left and Down step down and Right and Up step up without wrapping, clamped to `0..count`; on a Track card Up and Down move between the flags of a checklist instead, and a card with one flag still answers neither.
- [x] **The named behaviour change:** an arrow key that does not move a Track flag writes nothing. `track.test.ts` asserts no `onChange` for an ArrowRight on an already-set flag.
- [x] `contract.test.ts` reports a component file that spells `'aria-pressed'` as a quoted literal, naming the file, and the report is empty.
- [x] That scan cannot pass vacuously — and **the four-file assertion alone did not achieve it**, which review caught. `ring-control.ts` declares no `ComponentDefinition`, so it is outside `componentFiles()`, and it is now the only non-test file in `components/` spelling the marker at all: both scans run over populations that cannot contain their own proof, so a mistyped constant read exactly like a rule nothing violates. What makes it non-vacuous is a case proving each constant against the spellings it must catch and the prose it must not, asserted against the constant itself on `NATIVE_CHECKBOX`'s model, plus a read of `ring-control.ts` for the one live spelling. Mutating either constant now fails the build.
- [x] A second scan reports a component file that names `'sheetsmith-level-ring'` without calling `bindRingControl` — the hand-wired ring the first scan cannot see, because a copy that forgot `aria-pressed` is exactly the disagreement worth catching.
- [x] **What the scan asserts it does not report** (`PATTERNS` §10, so it is not tested in one direction only): prose. `track.ts` names the attribute in a comment explaining why a flag is a `<button aria-pressed>`, the scan runs over that file, and it reports nothing — because the predicate is the quoted literal an attribute is actually set with. The known limit is pinned rather than claimed: a comment that *quotes* the attribute **is** reported, asserted as such, with the fix named as the shared source reader `docs/BACKLOG.md` already waits on. **Two halves this criterion listed were removed rather than built**, because each held under every implementation: filtering Track out of a set already shown to contain no match for its run's `aria-valuenow`, and asserting that `componentFiles()` excludes `modifier-breakdown.ts`, which `finds every component file` already holds and which tests the filter rather than this predicate. Both facts, and `src/editor/list-fields.ts` being outside the file set by construction, are kept as prose in the test's own comment so the next reader does not re-add them or widen the scan. This is `NATIVE_CHECKBOX`'s lesson applied twice over: a guard whose false positive is the sentence explaining the guard is a guard somebody will delete, and a guard that cannot fail is one nobody should trust.
- [x] `npm test`, `npm run lint` and `npm run build` pass. `eslint.config.mts` and `components/isolation.test.ts` both carry `ring-control` in both import spellings, and `isolation.test.ts` still fails on an import of a real sibling component.
- [x] `npm run harness:shot` shows rings identical to the pre-change shots on both themes — a Table's proficiency column, a Record set's prepared toggle, a Track checklist and a Roster's cell. This is a refactor; a visible difference is a finding.
- [x] `docs/PATTERNS.md` §6 carries the promoted rule in one bullet, `docs/UI.md` §6's `title` bullet carries the name-on-screen condition, `docs/UI.md` §9's level-ring row names the control module beside the painter, and both rows are gone from `docs/BACKLOG.md` § Patterns.

## Commit boundaries

A plan for `/land-it`, not a schedule to build to. The tree stays uncommitted through implementation and every round of findings.

1. `refactor: Let aria-pressed be the only word a flag says`. Removes `flagReading` and its export, collapses `nameOf` in `table.ts` and `roster.ts` to `levelName` and `reading` in `track.ts` to `stepLabel`, and rewrites `stored-flag.ts`'s header to name two drifts. Ships no behaviour; this is the §13 answer, and it is also the Smallest version in one commit.
2. `feat: One module behind a level ring's ARIA, its word and its presses`. Adds `src/components/ring-control.ts` and `ring-control.test.ts`, adds it to the sibling allowlist in `eslint.config.mts` and to the spellings in `components/isolation.test.ts`, and moves `table.ts` onto it — the reference copy, so the module's shape is proven against the fullest call site before it has four.
3. `refactor: Draw the other three rings through it`. Moves `record-set.ts` (carrying its title argument into the module as `nameOnScreen`'s own comment), `track.ts` (dropping the guarded `bindLongPress` and the unconditional commit) and `roster.ts`.
4. `test: Report a ring wired by hand`. Replaces `contract.test.ts`'s painter-marker checks with the two scans and their non-vacuity and does-not-report halves.
5. `docs: One rule for what a two-state mark announces`. `PATTERNS` §6's rule and §10's two corrected sentences, `UI` §6's condition and §9's row, and both rows out of `BACKLOG`. `docs/SPEC.md` §13's `Resolved:` entry is `/land-it`'s, not this commit's.

## Deliberately not doing

- **No component's stored spelling changes.** `flagText`, `isFlagSet` and `isFlagSpelling` keep their behaviour exactly, and no read or write path is edited.
- **Not `docs/BACKLOG.md` § UI's "Three same-size circles in one summary line mean focus, on, and off."** That is a judgement about fill against outline, not about ARIA wiring, and it is deferred whole.
- **Not the editor-side ARIA rows** — "An inline field error is neither announced nor linked to the input it is about" and "The suggestion popup carries no ARIA". A different surface; both stay open.
- **Nothing about Track's run.** The slider, its drag, its segment hit test and its own long press stay untouched. Only the one-segment flag branch moves.
- **Not the `<select>` branch** that a graded column can ask for. It carries no ring and no `aria-pressed`; that three copies of it become identical once `flagReading` goes is recorded above, not acted on.
- **Not the editor's level sample.** `src/editor/list-fields.ts` keeps its own ring and its own `aria-pressed`, because its two states are a fact about the layout rather than about a character.
- **Not reconciling how the four read a stored flag.** Table goes through `typedValue`, Record set and Roster through `isFlagSet`, Track through `storedMarks`; the module takes a level, so none of them moves.
- **Not moving `stored-flag.ts`.** With only note-format members left it starts to look like a `parse/` primitive; it stays in `components/` and stays on the sibling allowlist, because moving it would change which rule in `PATTERNS` §10 governs how it is tested, and that is a separate decision.
