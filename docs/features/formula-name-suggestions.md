# Formula inputs suggest the names a layout publishes

Status: shipped
Board card: Add name suggestions to the formula inputs in the layout editor
pane. An author writing an expression should not have to hold the layout's
published-name set in their head.

## Model question

**None is settled, and three are cited.** No component-contract member is
added, no config field is added, nothing is stored, nothing is published, and
no character note is read or written.

- **The contract already declares what this needs.** What a component
  publishes is `scopeValues` (§4.1), read statically through
  `modifierTargetSource` in `src/formula/modifier-targets.ts`, which is
  already how the layout editor's target picker knows the published-name set
  without a character in hand. Whether a component holds rows an aggregate may
  walk is `scopeRows`. Which config fields hold column keys and row values is
  the `columns` and `rows` field *kinds* in `types.ts`, which the editor
  already draws. Everything the suggester offers is derived from those three
  declarations, so no component learns that a suggester exists. **The
  contract does not grow.**
- **What it publishes: nothing.** This draws into the DOM and nowhere else.
- **What it stores: nothing new.** Accepting a suggestion edits the text in an
  input the way typing does; the field's own `change` commit
  (`src/editor/field-commit.ts`) is what writes the layout, unchanged. No
  `persist()` call is added or removed, so Constraint 3 is untouched by
  construction: the layout is written exactly when it was written before, with
  exactly the text the field holds.
- **Existing character notes: not touched.** Constraint 4 does not apply.
- **§13, "Whether the layout editor's configuration panel has a copy budget":
  relieved, not opened.** That entry records the panel teaching the name
  grammar through field descriptions and footnotes, and expects a later
  surface to take the explanation over. This is that surface for the *name*
  half of it: the inventory in the panel shows a component's real published
  names as chips, and the popup shows each candidate beside the label of the
  component that owns it, so the two footnotes that spell the grammar as a
  placeholder pattern — `"<component id>.<column key>"` and
  `"<component id>.<row key>"` — lose the pattern, and the Table `columns` and
  `openRows` descriptions lose their `sum(<component id>, <expression>)`
  clauses. Measured against the shipped strings: **84, 28, 39 and 31
  characters** respectively (`src/editor/list-fields.ts` lines 1365 and 1398,
  `src/components/table.ts` lines 940 and 947), and one line of the pane's
  lead-in sentence is replaced whole. **The pattern appears nowhere in the
  pane's copy afterwards**, in either spelling, which is what the panel's own
  case asserts.
  The entry stays open, because the modifier-rules half of it — what a target
  is, that a formula has to read the slot, best-of-a-type — is not about names
  and this feature does not touch it. The `Resolved:` note is `/land-it`'s.

  **The fourth trim was found after this section was agreed, and is the record
  of why it happened rather than the case for it.** `table.ts`'s `openRows`
  description taught `sum(<component id>, <expression>)`, the same placeholder
  clause trim 3 removes from `columns` a few lines above it — and it was the one
  a reader meets on the flag that *creates* the rows an aggregate is the only
  way to read. The inventory already draws `sum(<id>, …)` as a copyable chip on
  every component with rows, which is exactly what that clause spells out, so
  the case for it was the case for the other three. It was left out of the build
  and recorded here, because a fourth copy change was past what this document
  agreed; the owner ruled and it is trim 4.
- **§10's renaming question is cited and not opened.** Rename safety here
  comes from the id being the durable identity while the label is what a
  reader sees — a suggestion shows the label as secondary text and inserts the
  id — so the reason 24 of 27 surveyed tools leave a reference as characters
  in a string does not bite. Migrating formulas when an *id* changes is §10's
  question and stays there.
- **SPEC §5's sentence "only Table publishes any" rows is stale**, and this
  feature's design is what makes it visible: `src/components/record-set.ts`
  declares `scopeRows` so that `count(traits, …)` works. The vocabulary
  therefore asks the registry which definitions answer `scopeRows` rather than
  naming Table, and `/land-it`'s SPEC edit corrects the sentence. Not a
  question this spec settles; a fact it reports.

## What it does

Every formula input in the layout editor pane completes the name under the
caret from what the layout actually publishes: component ids, their members
after a dot, `.value` and `.left`, the `mod.` namespace, the layout's own
functions and the standard helpers. Inside a `sum(` or `count(` the list knows
which argument the caret is in and offers the named table's columns first.
Beside it, the configuration panel's lone copyable id chip becomes an inventory
of every name the selected component publishes, each a copyable chip, so the
names are inspectable away from the cursor as well as under it.

## Smallest version

The inventory alone, with the four description trims — commit 4 below,
nothing else. A component's panel lists every name it publishes as a copyable
chip, `.value`, `.left` and `mod.` forms included, so the set is on screen
while the author types and casing is one copy away. What it gives up: every
insertion is still a paste, the aggregate's argument structure is still held in
the author's head, a typo is still found on the card, and no stub or harness
change is needed — so the popup's four platform costs are not paid either.

## Design

### 1. The vocabulary: what is offered where

Every formula input has a base vocabulary fixed by what the input is for, and
the aggregate scan in §2 layers row vocabulary on top of it.

| Input | Where it is drawn | Base vocabulary |
| --- | --- | --- |
| `derived`, `effective` (Card, Card set); `max` (Pool); `count` (Track) | `config-panel.ts`, the `kind: 'formula'` branch | sheet |
| `rows.*.count` (Track) | `renderEntriesEditor`, the segments cell | sheet |
| `rows.*.values.*` (Table) | `renderRowsEditor`, one cell per row value | sheet |
| `reset.*.to` | `reset-field.ts`, **Resets to** | sheet |
| `columns.*.formula` (Table), `fields.*.formula` (Record set) | `renderColumnsEditor`, the **Formula** cell on a computed column | the row's own keys first, then sheet |

**The sheet vocabulary** is a tree, walked one segment at a time:

- **Top level:** the id of every component that publishes at least one name
  (`values.self` or a non-empty `values.named`), in layout order; then `mod`,
  the namespace every modifier reference starts with, which is the only route
  into the tree below and so has to be offered somewhere; then the
  layout's function names from `parseFunctions(layout.functions).library`;
  then the standard helpers, which are `RESERVED_NAMES` in
  `src/formula/expression.ts` — `floor`, `ceil`, `round`, `abs`, `min`,
  `max`, `if`, `sum`, `count`, `true`, `false`. One list, interleaved by
  prefix rather than sectioned, which is what five of the surveyed tools do;
  a function is inserted as its bare name and the author types the
  parenthesis. The list is deduplicated by name with the first winning, which
  matters for exactly one collision: `mod` is not reserved, so a layout may
  define a function called `mod`, and the fixture below does.
- **After `<id>.`:** the component's named members (`abilities.` offers
  `STR`, `DEX`, …), plus `value` where the component publishes a bare name
  itself, plus `left` where that entry sets `ScopeEntry.left`.
- **After `<id>.<member>.`:** `value`, and `left` where that entry sets it.
- **After `mod.`:** `self`, then the same ids as the top level; after
  `mod.<id>.`, the members. `mod.` never offers `.value` or `.left`, since the
  slot table registers neither.

That tree is what keeps the measured 261 candidates on the largest bundled
layout from being one list: the top level of that layout is 54 ids plus at most
16 function names, and a one-letter prefix cuts it further. `.value`, `.left`
and `<id>.<member>` are reached by typing the dot, which is also how the
language spells them.

**Row vocabulary** is the keys of every entry in a component's `columns`-kind
config fields (Table's `columns`, Record set's `fields` — both are that kind,
which `formula-field-errors.md` already relied on) plus the value names under
its `rows`-kind field (the row-value names Table's rows editor calls `names`).
Derived from the field kinds rather than from a component's name, so a third
component declaring a `columns` field gets it for nothing and no editor module
knows a Table exists. On a computed column's **Formula** cell the row
vocabulary of the component being edited comes before the sheet's top level;
inside an aggregate it is the *named* table's, as §2 says.

**The candidate set is assembled from `modifierTargetSource`, not beside it.**
`src/formula/modifier-targets.ts`'s header records why there is exactly one
assembly of "what does this layout publish": two independent ones once
disagreed about a totalled prose column and a component whose section failed
to read, and the divergence reached the sheet. The panel already builds the
`ModifierTargetSource[]` for its target picker (`modifierSources` in
`config-panel.ts`), and `publishedTargets` already spells each name with the
label a picker shows. The vocabulary takes that array and the parsed library
and adds nothing a third reader could assemble differently. `.left` is read off
the same `values` — `values.self.left`, `values.named[key].left` — which is
the one thing `publishedTargets` does not carry because the slot pass never
needed it.

### 2. The caret: fragment and aggregate context

A pure function in `src/formula/completion.ts`, tested on its own:

```ts
completionAt(text: string, caret: number): Completion | null
// Completion = { start, end, path: string[], prefix: string,
//                aggregate?: { table: string; argument: number } }
```

- **The fragment** is the maximal run of letters, digits, underscores and dots
  around the caret, extended in both directions. `start`/`end` is its range,
  and the splice in §3 replaces exactly that range — never the whole value,
  which is the pain point where an insertion deletes an adjacent `)` or the
  function to the left. The fragment's segments before the last dot are
  `path`; the text after the last dot is `prefix`.
- **A fragment beginning with a digit returns `null`.** That is a number
  literal, or the caret sitting immediately after a digit run, and the
  evidence is five reports of a completion firing on a literal being switched
  off wholesale. The check is on the fragment's first character, so `10` and
  `2d6` are both silent while `d6` is a name like any other.
- **An empty fragment returns `null`.** Nothing is offered unsolicited: not on
  focus, not after a space, not after `(`. The author asks by typing a
  character or a dot. `abilities.` is a non-empty fragment with an empty
  `prefix`, which is how the second level opens.
- **The aggregate scan** walks backwards from `start`. It counts parentheses —
  a `)` deepens, a `(` shallows — and commas at depth zero. Reaching a `(` at
  depth zero it reads the identifier run immediately before it: `sum` or
  `count` ends the scan with `argument` set to the commas counted and `table`
  set to the identifier text after that `(` up to the first comma, trimmed;
  any other identifier (`floor(`) resets the comma count to zero and keeps
  walking outward, because the caret is then in an argument of a call nested
  inside whatever encloses it. Reaching the start of the text without a hit
  means no aggregate. It is a character scan and not a parse, because
  `parseExpression` throws on the half-typed text every keystroke produces,
  and it never throws itself.
- **In argument 0** the vocabulary is only the ids of components whose
  definition declares `scopeRows`, read as identifier text — SPEC §5's rule
  that the first argument is a component reference and nothing else. **In
  argument 1 and later** the named table's row vocabulary comes first, then
  the sheet's top level; a `table` naming no component falls back to the sheet
  alone.

It lives in `src/formula/` rather than `src/editor/` because everything it
knows is the language's own syntax — which characters make a name, that `(`
and `,` structure a call, which two names are aggregates — and nothing it
knows is about an input. It imports the language's own `AGGREGATE_NAMES` and
nothing from `obsidian` (Constraint 5) — the names derived from the aggregate
table in `expression.ts` rather than the two literals spelled here, which is
this paragraph's own drift argument applied to the one list it names. Its fragment predicate is deliberately not
`expression.ts`'s `SEGMENT`: the fragment has to admit a leading digit in
order to refuse it, which a name grammar never does, and the header says so.

### 3. The popup

`src/editor/formula-suggest.ts` holds one class extending Obsidian's
`AbstractInputSuggest<Candidate>` (constructor `(app, HTMLInputElement |
HTMLDivElement)`, present since 1.4.10, below the manifest's `minAppVersion`)
and one exported function that binds it:

```ts
attachFormulaSuggest(app: App, input: HTMLInputElement,
                     vocabulary: () => Vocabulary,
                     owner?: string): FormulaSuggest
```

`owner` is the component whose own row vocabulary this field reads first, which
§1's table requires and which is a computed column's **Formula** cell and
nothing else.

`vocabulary` is a thunk, read on every query, so the list reflects the layout
as the pane last rendered it and the panel does not rebuild the tree on every
keystroke of every field.

- **`getSuggestions(query)` receives the whole input value**, by the platform's
  design. The class resolves the fragment itself from
  `inputEl.selectionStart` through `completionAt`, and returns `[]` — which
  closes the popup — where that is `null`.
- **Matching is exact, then prefix, then nothing.** The exact tier is
  case-sensitive equality with `prefix`, so Enter on a fully typed name
  re-inserts the same text; the prefix tier is case-insensitive, so `str`
  offers `STR`, which is the "forgetting casing" half of the recall problem.
  No substring matching: with it, a short name that is a substring of a longer
  one is the wrong name one Enter away. Within a tier, candidates keep layout
  order — the order the tree lists components in — with library functions
  after the published names and built-ins last. `limit` stays at the class's
  default of 100; the popup clamps its own height and scrolls.
- **Each suggestion renders the name in code type with the owner as secondary
  text**: the item takes Obsidian's `mod-complex`, and inside it a
  `.suggestion-content` column holds a `<code class="suggestion-title">` for the
  name and a `.suggestion-note` for the label. **The class is the rank**, and
  this section shipped without it once: `app.css` styles `.suggestion-note` in
  exactly one place, `.suggestion-item.mod-complex .suggestion-note`, so an item
  without it draws the note at the item's own size and colour and what this
  bullet buys the whole copy budget for — a name and its owner — comes out as
  two identical lines.

  An id shows its component's label; a member shows the component's label
  **alone**, not `publishedTargets`' `<label> · <key>`: the key is already the
  item's own visible name, and `UI.md` §9's drop rule is explicit that a token
  carrying no information is dropped. `value` shows
  "Stored value", `left` "Remaining", `self` "This name's own modifier
  total", `mod` itself "Modifiers pushed at a name", a layout function its
  signature (`mod(score)`), a built-in "Built
  in", a column key "<table label> · column", a row value "<table label> · row
  value". This is the copy budget being spent in the popup — a label per name,
  on demand — rather than as a fifth line under a field.
- **Accepting splices over the fragment's range and closes.** The base
  `selectSuggestion` only calls `onSelect`, so the class overrides it:
  `setRangeText(name, start, end, 'end')` over the fragment, then a dispatched
  `input` event, then `close()`. The caret lands after the inserted text —
  stated explicitly rather than left to `'end'`, because the test DOM puts it
  at the end of the whole value instead.

  **This paragraph argued for `document.execCommand('insertText')` and the
  measurement retired the argument.** The claim was that Chromium resets an
  input's change-tracking baseline on a programmatic write, so a name accepted
  that way and followed by Enter would fire no `change`, the field would never
  commit, and the layout would silently not be written. It was a claim about
  Chromium rather than about this plugin, so it was measured *before* the path
  was built, in Obsidian's own renderer (Chromium 142.0.7444.265), driving a
  real `<input>` with real key events:

  | after real typing | `value =` | `setRangeText` | `execCommand` |
  | --- | --- | --- | --- |
  | Enter | `change` ×1 | `change` ×1 | `change` ×1 |
  | blur only | `change` ×1 | `change` ×1 | `change` ×1 |
  | no typing at all, then Enter | ×0 | ×0 | ×1 |

  **The reset is real and unreachable here.** It bites only where the *whole*
  value came from the write and the author never typed, and this popup opens
  only on a non-empty fragment — so every accept is preceded by a user edit.
  What the deprecated call would have bought is therefore nothing, and what the
  standard one buys is that production and the tests drive one path:
  `execCommand` is absent from the test DOM, so it would have shipped a branch
  no case here could enter. Nothing calls `persist()`: the accept is an edit,
  and the field's own `change` remains the one commit.
- **Enter accepts while open, and a second Enter commits.** The class's pushed
  keymap scope consumes Enter, Escape, the arrows, Home, End and PageUp/Down
  only while the popup is open; once it closes the next Enter reaches the
  input and fires `change`. Because the exact tier sorts first and the first
  item is the one highlighted, Enter on a fully typed name inserts the same
  text and closes, which is what makes the second Enter a commit rather than a
  surprise. Escape closes the popup and does nothing else; a second Escape
  reaches an input that has no Escape behaviour.
- **A caret move that is not typing closes the list.** The popup consumes
  Up/Down for the list while open, so those never move the caret, which is
  the arrow-key pain point answered by the platform. Left and Right are not
  consumed, and a list left open after one would be about text the caret has
  left; the binding closes on `keydown` of ArrowLeft/ArrowRight and on
  `pointerdown` inside the input, and the author reopens it by typing.
- **Nothing on focus.** The class calls `getSuggestions` on `focus` as well as
  on `input`, with no way to tell the two apart from inside. The binding
  registers its own `focus` and `input` listeners on the element *before*
  constructing the class — listeners fire in registration order — and keeps
  one flag: `input` arms it, `focus` and `blur` disarm it, and
  `getSuggestions` answers `[]` while disarmed. So a field holding
  `10 + abilities.DEX` does not pop a one-item list over what the author was
  reading the moment it is tabbed into; it pops when they type.

### 4. The platform costs, and how each is handled

Verified against the 1.13.7 bundle; recorded here so the build does not
rediscover them.

- **No teardown.** `close()` detaches the popup and leaves the `input`,
  `focus` and `blur` listeners on the element. **No input in the pane survives
  a rebuild**: `layout-editor.ts` empties its container on every render and
  `restoreFieldErrors` re-finds inputs by focus token in the new DOM precisely
  because the old ones are gone; the function library textarea, the one
  control whose text is read back across a rebuild, is out of scope. So an
  instance dies with its element and nothing is ever re-bound. **One thing
  does not die with it:** an input removed while its popup is open fires no
  `blur` (a removed focused element does not), so a redraw triggered from the
  keyboard — **Undo layout edit** while a list is up — would orphan the popup
  at the notice layer. The **editor** therefore keeps the instances it bound this
  render in a list and calls `close()` on each at the top of its next
  `render`, before anything is drawn or torn down; `close()` is a declared
  public member of `PopoverSuggest` and is idempotent. The editor rather than
  the panel, which is where this said it would go: what outlives a render
  belongs to the thing that owns the render loop, which is the argument
  `layout-editor.ts` already makes for holding `fieldErrors` there. The panel
  reaches it through one host command, `suggestNames`, so neither the panel nor
  the two field modules learns that a suggester or an `App` exists.
- **A mousedown on the popup's padding blurs the input.** The class prevents
  `mousedown` only on `.suggestion-item`, so a press on the container's
  padding blurs the input, fires `change`, commits the half-typed text,
  persists and takes an undo snapshot. **Accepted.** It is exactly what
  clicking anywhere else already does: the field stores the text and reports
  the parse problem under itself (`formula-field-errors.md`), and one undo
  step restores the previous layout. Guarding it would need the undeclared
  `suggestEl`, and a guard reaching an undeclared member is a guard the next
  Obsidian release removes silently.
- **No way to ask whether it is open.** `isOpen` and `suggestEl` are
  undeclared. Nothing in this design asks: the binding closes unconditionally
  where it wants closed, arms and disarms on events it owns, and the tests
  observe the popup through the DOM the stub renders, never through the class.
- **No ARIA.** The popup carries no role, the input no `aria-expanded` or
  `aria-controls`, and the platform offers no hook to add them. **Accepted and
  recorded.** The input gains `aria-autocomplete="list"`, which is an honest
  statement about the input's own behaviour — it says a list of completions
  may appear, and does not claim the state `aria-expanded` would — and
  `docs/BACKLOG.md` § Patterns gains a row beside "An inline field error is
  neither announced nor linked to the input it is about", waiting on the
  platform exposing the popup element. The visible list is not the only
  channel: the inventory in §5 is plain DOM, keyboard-operable, and holds
  every name the popup ever offers.
- **Mobile** is the class's own concern — deferred until the keyboard settles,
  closed by the back gesture, items bound to click — and `isDesktopOnly` stays
  `false`.
- **The popup is appended to `document.body`** at the notice layer, flips,
  clamps its height and repositions on scroll, so clipping by the pane's two
  scrollers is not a concern and no CSS of the plugin's touches it.

### 5. The inventory in the configuration panel

The line `Formulas reference this component as <id>` at the top of a component
form (`renderComponentForm`, `config-panel.ts` line ~497) is replaced by
`src/editor/published-names.ts`, drawing one of three states from the same
`ModifierTargetSource` and the definition:

- **A component publishing names.** A lead-in "Formulas read this component
  as" and then one *group* per published name, groups flowing and wrapping as
  a paragraph of chips, each group unbreakable: the full name as a chip
  (`abilities.STR`), then its forms as smaller chips showing only the part
  they add — `.value`, `.left` where the entry sets one, `mod.` — each copying
  the composed full name (`abilities.STR.value`, `mod.abilities.STR`) with
  that full name in `title`, since `title` adds to a visible name where
  `aria-label` would replace it (`UI.md` §6). The chips are `copyableName`,
  unchanged: press or Enter or Space copies, and a `Notice` says what was
  copied. A component publishing rows as well ends the block with `sum(<id>,
  …)` and `count(<id>, …)` as two more chips, copying `sum(<id>, ` and
  `count(<id>, ` so the paste lands the caret in the second argument.
- **A component publishing rows and no names** (Record set): the lead-in reads
  "Formulas read this component with" and the block is the two aggregate
  chips. **A component with both says two sentences and draws two runs** — the
  names under "Formulas read this component as", then "and read its rows with"
  over a run of its own. The calls are not names: one is a call template whose
  copy stops inside the second argument, and drawn at the tail of the same run
  at the same gap and rank the second of them reads as one more name, which is
  what forced colors caught when `count(inventory, …)` wrapped alone onto a
  line. They keep the *name* rank rather than the form rank, because a form chip
  is a suffix that only means anything beside the name above it while these are
  whole strings — and on a Record set they are the block's only content.
- **A component publishing nothing** (Group, Tab set, Image, Rich text): one
  sentence, "Formulas cannot read this component.", and no chip, in place of
  a copyable id that nothing could have used.

**Sizing: no cap and no disclosure, answered off the picture rather than ahead
of it.** The largest case the harness stages is a Card set publishing six names:
six groups over two lines in a 606px run inside a 620px panel, 37px tall, no
horizontal scroll. At the 1210px split threshold it is the same six over two
lines in 570px of 584; at **Text** 24 it is unchanged. Grouping measures 4px
inside a group against 16px between, a 4x ratio — and it does not rest on the
gap at all now, because every chip carries a resting surface (§6), so the
boundary is structural. The inner gap is 4px rather than 2px for the focus
ring's sake: at 2px a focused chip's mark reached exactly as far as the chip
beside it. Nothing about six groups argues for a cap. What does not
scale is nine lines of chips and fifty-six tab stops at eighteen groups, and
that is the backlog row rather than this pass. The per-row chip beside each row in the rows editor
(`list-fields.ts` line 530) stays: it sits where the key is typed, and a name
is not copy.

**This paragraph estimated eighteen groups of about 200px and no view stages
one.** The sample layout's Skills table carries four rows of which one has a
key, so it draws three groups; eighteen exists only in the vault's 5e layout,
which is a check to press rather than a picture to look at. So the wrap is
judged at six and the eighteen-row case is a vault check — `docs/BACKLOG.md`
§ UI holds the row, and the cap decision "Deliberately not doing" defers to a
picture defers to that one.

**The four trims**, which are the copy budget relief the model section
measured: the totals footnote becomes "A total is a name formulas read, so a
totalled column's key is letters, digits and underscores, where a column
without a total may be headed anything."; the publication footnote loses
`"<component id>.<row key>", ` and nothing else; the Table `columns`
description ends "a formula elsewhere can sum any expression over the rows
instead."; and its `openRows` description ends "total a column, or aggregate
over the rows instead." Each still states its consequence (`PATTERNS.md` §8).
No new description is added anywhere by this feature.

### 6. Styling

Four rules for the block in `src/styles/editor.css`:
`.sheetsmith-published-names` (a flex-wrap run, a tight row gap and a wide
column gap from the size scale), `.sheetsmith-published-name` (an inline-flex
group, `white-space: nowrap`),
`.sheetsmith-published-name .sheetsmith-published-key` (the name, and any whole
string a chip copies, at `--font-ui-smaller`) and
`.sheetsmith-published-name .sheetsmith-published-form` (the suffix chips,
muted). **The rank rule is one sentence: a chip that copies a whole string takes
12px, a chip that only adds a suffix takes whatever the app gives a `code` in a
description.**

**The two ranks were the wrong way round for a wave, and the arithmetic is why.**
This block sits in a `.setting-item-description`, which is 12px, and Obsidian
shrinks every `code` inside one to `--font-smaller` — `0.875em`, so 10.5px. The
rule written to size the *forms* down set them to a literal `--font-ui-smaller`,
which is 12px, so it cancelled the app's shrink and sized them **up**: the name
measured 10.5px against its own qualifiers at 12px, backwards by 14%, with the
primary content of a new block half a pixel above `legibility.md`'s floor.
Invisible at the default because colour carried the hierarchy, and unmissable in
forced colors where size is the only channel left. Deliberately not
`--font-smaller` on the form: 0.875 × 10.5 is 9.2px, under the floor.

**And `.sheetsmith-copyable` itself gained a resting surface and a focus ring**,
which is two rules more and reaches every copyable name in the pane rather than
only this block. A cursor and a hover background was survivable while the pane
drew one chip at the top of a form; this block draws eighteen on a six-entry
Card set, and at that count a run of bare monospace words is a sentence rather
than a row of controls, with discovery hover-only, which `UI.md` §7 forbids. The
focus half is the sharper one: `app.css` sets a global `:focus { outline: none }`
and restores a ring only on its own control kinds, none of which a
`<code role="button" tabindex="0">` matches, so every chip was a tab stop with
nothing saying where focus was. The mark borrows the canvas overlay's treatment,
as an `outline` so forced colors keeps it. The popup takes Obsidian's own `.suggestion-*` styling
and the plugin writes no rule for it; the one class the plugin adds inside an
item is on the `<code>`, and it inherits.

**Two declarations this section did not describe, both decided off a shot.**
The gaps are asymmetric, because at an even 8px both ways six groups of three
chips read as one run of text — Obsidian gives a `code` in a description a
radius and a padding and *no* background, so the gap is the only channel there
is. And the group carries a `color` of `--text-normal` against the muted
description it sits in, so the name an author came to copy is what the eye
lands on and the forms stay at the description's own rank; that is `UI.md` §5's
one quiet style reused rather than a fainter second one invented. The third
rule is two classes deep at (0,2,0) deliberately: `.sheetsmith-copyable` beside
it is (0,1,0), so a single class would be settled by source order rather than
by weight.

### 7. The stub and the harness

**`src/test/obsidian-stub.ts` gains a minimal `AbstractInputSuggest<T>`.** It
is the shape a test and the harness both need and nothing more, on the
`SuggestModal` entry's own rule: `limit`; the constructor binding `input`,
`focus` and `blur` on the element exactly as the app does, `blur` closing;
`getValue`/`setValue`; `open()` rendering `div.suggestion-container >
div.suggestion > div.suggestion-item` children into `document.body` with
`is-selected` on the first; `close()` removing it; `selectSuggestion` calling
`onSelect`; and a keydown handler on the input for Enter (accept the selected
item), Escape (close) and ArrowUp/ArrowDown (move the selection) *only while
open*. `PopoverSuggest` is declared alongside as the base holding `open`,
`close`, `renderSuggestion` and `selectSuggestion`. `obsidian-stub.test.ts`
drives each member. Nothing else the real class does — flipping, clamping,
mobile deferral, the keymap scope's other keys — is modelled, and each is named
in the stub's comment as not modelled rather than left to be assumed.

**`harness/editor-pane.ts` gains `suggest?: string`** on `PaneView`, spelled
`<focus token>:<text>`: focus the input the token addresses, set its value to
`text` with the caret at the end, and dispatch `input`, which is the event the
class opens on and the same dispatched-not-clicked route `setSamples` already
takes for a detached pane. Views added to `harness/shot.mjs`, all at
`EDITOR_FRAME` (`scoped-harness-shots-need-an-explicit-frame` is the memory
that says why):

| View | Query | What it photographs |
| --- | --- | --- |
| `editor-suggest-light` | `open=armour_class&suggest=cfg-armour_class-derived:10 + abil` | the top level: `abilities` with its label as secondary text, the code type, the popup against the pane |
| `editor-suggest-dark` | the same, `theme=dark` | both themes, as the owner asked |
| `editor-suggest-members` | `open=armour_class&suggest=cfg-armour_class-derived:10 + abilities.` | the second level: six members and **no** `value`, because a Card set publishes no bare name for one to be worth |
| `editor-suggest-aggregate` | `open=encumbrance&suggest=cfg-encumbrance-derived:sum(inventory, We` | argument 1 inside an aggregate: `Weight` first, the sheet after |
| `editor-inventory` | `open=abilities` | six groups of chips replacing the id line |
| `editor-inventory-table` | `open=skills` | a Table's own shape: one published row's name beside the two aggregate chips, which a Card set has no half of |

**`harness/calibrate.mjs`'s `CHROME` list gains `/^\.suggestion/`**, so the
generated CSS carries Obsidian's real popup chrome, and `harness/theme.css`
gains a hand-written fallback for `.suggestion-container`, `.suggestion-item`
and `.is-selected` so the harness works before calibration has run
(`PATTERNS.md` §2, the self-contained rule). Without the first, the popup in
every shot above is an unstyled list of divs and the review is of the wrong
thing.

**`%2B` and not `+` in a `suggest=` query.** `harness.ts` reads it through
`URLSearchParams`, which decodes a `+` as a space, so two views rendered
`10   abil` for a wave and the operator whose survival they exist to show was not
there to survive.

**And `theme.css`'s fallback is scoped exactly as the app scopes it.** It was a
bare `.suggestion-note`, which painted a secondary rank on every note whether or
not its item carried `mod-complex` — the app's only rule for it being the
`mod-complex`-scoped one. So the instrument was kinder than the thing: four shots
showed a name and its owner correctly while the app drew two identical lines
(`UI.md` §11). `calibrate.mjs`'s `RESET` also gained `:focus`, which is the
same failure one rule over and reaches every review of a non-native control.

**What still cannot be photographed:** the highlighted item's *hover* state,
and the popup's flip when the input sits at the bottom of the window — both
need a driven browser, which is the standing `prefers-contrast` row's blocker.
`docs/BACKLOG.md` § UI gains one row for the pair, waiting on that same
fixture.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| — | — | — | None added. Three existing descriptions are shortened (§5); no component declares anything new. |

## Data and file model

Nothing is stored and nothing is published. An accepted suggestion is an edit
to an input's text; the layout is written by the field's existing `change`
commit, at the moment and with the text it would have been written anyway, so
the serialiser never sees a byte this feature produced. No character note is
read or written, and a layout opened and closed without an edit is not
re-serialised.

## Acceptance criteria

**Completion context (`src/formula/completion.test.ts`)**

- [x] `completionAt('10 + abil', 9)` returns `start: 5, end: 9, path: [],
      prefix: 'abil'` and no aggregate; the same text with the caret at 2
      (inside `10`) returns `null`; caret at 4 (after the space) returns
      `null`.
- [x] `completionAt('abilities.', 10)` returns `path: ['abilities'], prefix:
      ''`; `completionAt('mod.abilities.ST', 16)` returns `path: ['mod',
      'abilities'], prefix: 'ST'`.
- [x] `completionAt('sum(inventory, Qty * We', 23)` returns `aggregate:
      { table: 'inventory', argument: 1 }`; `completionAt('sum(inv', 7)`
      returns `argument: 0`; `completionAt('sum(inventory, floor(We', 23)`
      returns `argument: 1` with `table: 'inventory'`, not `floor`;
      `completionAt('count(inventory, equipped) + Wei', 32)` returns no
      aggregate, because the call is closed.
- [x] The fragment extends in both directions: `completionAt('abilities.DEX
      + 1', 4)` returns the whole `abilities.DEX` as `start: 0, end: 13`.
- [x] No input makes it throw: a property test over random strings of the
      language's characters and every caret position returns a value or
      `null`.

**Vocabulary (`src/formula/vocabulary.test.ts`)**

- [x] Over a layout holding a Card `armour_class`, a Card set `abilities`
      with `STR` and `DEX`, a Track with a row set, a Table `inventory` with
      columns `Qty`, `Weight` and a row value `ability`, a Record set
      `traits`, and a library defining `mod(score)`: the top level is
      `armour_class`, `abilities`, the track's id, `inventory` — not
      `traits`, which publishes no name — then `mod`, then the eleven built-ins
      in that order; after `abilities.` it is `STR`, `DEX` with no `value`
      (a Card set publishes no bare name); after `armour_class.` it is
      `value`; after the track's id and its row's key it includes `left`;
      after `mod.` it is `self` then the same ids; argument 0 of an aggregate
      is exactly `inventory` and `traits`.
- [x] The row vocabulary of `inventory` is `Qty`, `Weight`, `ability`, in
      that order, labelled column, column, row value.
- [x] The vocabulary is built from `modifierTargetSource` output: a test
      constructs the sources through that function and asserts the name set
      equals `publishedTargets(sources)` plus the derived forms and nothing
      else — so a component whose `scopeValues` the picker does not see, the
      suggester does not see either.

**Popup (`src/editor/formula-suggest.test.ts`, against the stub)**

- [x] Typing `abil` into a bound input renders a `.suggestion-container` in
      `document.body` holding one `.suggestion-item` whose `<code>` reads
      `abilities` and whose note reads `Abilities`.
- [x] Focusing an input holding `10 + abilities.DEX` renders no popup;
      typing one further character does.
- [x] Typing `10` renders no popup; typing `2d` renders none; typing `d6`
      renders the prefix matches for `d`.
- [x] With `abilities` fully typed, the first item is the exact match;
      pressing Enter leaves the value `abilities`, closes the popup, and does
      not fire `change`; dispatching `change` afterwards commits once.
- [x] Accepting on `floor(abil) + 1` with the caret after `abil` yields
      `floor(abilities) + 1` — the `)` and the `floor` survive.
- [x] Typing `abilities.st` offers `STR` (prefix, case-insensitive), and
      accepting yields `abilities.STR` — the casing corrected by the accept.
- [x] Typing `armour` offers `armour_class` and not `mod.armour_class`; typing
      `class` offers nothing (no substring matching).
- [x] ArrowLeft while the popup is open closes it; ArrowDown moves the
      selection and does not move the caret.
- [x] The bound input carries `aria-autocomplete="list"`.
- [x] The cases above drive the shipping accept path rather than a fallback:
      `setRangeText` plus a dispatched `input` event is what production runs
      and what the test DOM runs, and a comment in the test says why the
      measurement retired the alternative.

**Wiring (`layout-editor.test.ts`, `list-fields.test.ts`,
`reset-field.test.ts`)**

- [x] Every input in the table in §1 carries `aria-autocomplete="list"`
      after a render: the six panel keys across Card, Card set, Pool and
      Track; a computed column's **Formula**; a record field's **Formula**; a
      row value cell; a track row's segments cell; **Resets to** on a formula
      reset. `formula-field-coverage.test.ts`'s header gains the sentence that
      its `COVERED` list is this feature's coverage too, so a sixth list path
      fails there for both.
- [x] On a computed column's **Formula** cell of `inventory`, typing `W`
      offers `Weight` before any sheet name; on the Pool `max` of the same
      layout, typing `W` offers no `Weight`.
- [x] Rendering the panel twice closes any popup the first render left open:
      open one, call `render` again, and assert `document.body` holds no
      `.suggestion-container`.
- [x] The panel over a Card set shows six `.sheetsmith-published-name`
      groups, each holding a chip reading `abilities.<key>`, a `.value` chip
      whose `title` is `abilities.<key>.value` and copies it, and a `mod.`
      chip copying `mod.abilities.<key>`; over a Track with a row set the
      group also holds `.left`; over a Record set the block holds exactly
      `sum(traits, …)` and `count(traits, …)`; over a Group it reads
      "Formulas cannot read this component." and holds no chip.
- [x] The pane's text no longer contains `<component id>` anywhere, in either
      spelling, and the four trimmed strings read as §5 spells them. Two of the
      four carry no quote and no trailing dot, so the negative guard cannot see
      them and each is asserted by its own sentence.

**Appearance (harness, both themes)**

- [x] The six views in §7 exist and render; in `editor-suggest-light` and
      `-dark` the code type and the muted note are legible against the popup
      at the default text size, and the popup does not cover the input it
      belongs to.
- [x] `editor-inventory` shows six groups wrapping inside the panel's column
      with no horizontal scroll, and the first field of the form is visible in
      the frame below them; `editor-inventory-table` shows the other shape, a
      published row's name beside the two aggregate chips. Six is the largest
      the harness stages, so the eighteen-group wrap is a vault check
      (`docs/BACKLOG.md` § UI) rather than a picture.
- [x] `harness/theme.css` styles the popup before `harness:calibrate` has
      run.

**Vault fixture (`Sheetsmith Test` vault, the 5e layout, by hand)**

**Unticked deliberately, except the measurement.** Every other section is ticked
from `/spec-review`'s report; these four need a hand on the app and nobody has
put one there, so ticking them would be the session that built the work grading
what it cannot see.

- [x] **Taken first, before the accept path was written, and it is a record
      rather than an instruction now.** Driven over the Chrome DevTools
      Protocol against a second Obsidian launched on its own user-data
      directory, so the reviewer's own app was untouched: a real `<input>`,
      real key events, `change` counted. After any user edit, all three of
      `value =`, `setRangeText` and `execCommand` fire exactly one `change` on
      Enter and one on blur; with no typing at all, the first two fire none
      and `execCommand` fires one. **The baseline reset §3 argued from is real
      and cannot be reached here**, because a popup opens only on a non-empty
      fragment. `setRangeText` ships. The table is in §3.
- [ ] On the **Derived** field of a card, type `10 +
      abil`, press Enter, press Enter again, open the layout file — the text
      reads `10 + abilities` and one **Undo layout edit** restores it. Still
      worth pressing by hand; it no longer discriminates between the paths.
- [ ] Accept a suggestion, then click a tree row: the field commits and the
      popup is gone.
- [ ] Type `10 + abil`, press Escape: the popup closes and the text stays;
      click the popup's padding on a second attempt: the text commits and the
      parse problem shows under the field, as clicking anywhere else does.
- [ ] Press **Undo layout edit** with a popup open: no popup remains on
      screen after the redraw.

## Commit boundaries

1. `feat: Read a formula's completion context from the caret`.
   `src/formula/completion.ts` and its test: the fragment, the digit and
   empty refusals, the aggregate scan.
2. `feat: Assemble the names a layout offers a formula`.
   `src/formula/vocabulary.ts` and its test, built on `modifierTargetSource`
   and `publishedTargets`, with the row vocabulary read from field kinds and
   the aggregate's first argument from `scopeRows`.
3. `test: Give the stub an AbstractInputSuggest`. The minimal class and
   `PopoverSuggest` in `obsidian-stub.ts`, driven in `obsidian-stub.test.ts`.
4. `feat: List what a component publishes in its panel`.
   `src/editor/published-names.ts` replacing the id line in
   `config-panel.ts`, its test, the seven `editor.css` rules §6 describes —
   four for the block and three on the copyable chip, which is shared with the
   rows editor — and the four description trims in `list-fields.ts` and
   `table.ts` with the tests that read them.
5. `feat: Suggest names on the layout editor's formula inputs`.
   `src/editor/formula-suggest.ts`, the binding at the five call sites, the
   panel's close-before-render list, `aria-autocomplete`, its test and the
   wiring cases, and the coverage test's header sentence.
6. `chore: Stage the suggestion popup in the harness`. `PaneView.suggest`,
   the six views, `calibrate.mjs`'s `CHROME` entry, `theme.css`'s fallback.
7. `docs: Record the suggester's backlog rows`. Six rows: the ARIA row, the
   one about restating a rule two components own, and the bare global event
   constructor, all three under § Patterns; the hover-and-flip row, the
   unstaged-eighteen-groups row and the roving-`tabindex` row under § UI.
   Plus this document's status, and `docs/PATTERNS.md` §10's list of editor
   modules with neither half of the test-file rule, which `copyable-name.ts`
   left when it grew a rule about which string a chip shows and which it
   copies. SPEC §7's paragraph and §5's row-publisher sentence are
   `/land-it`'s.

## Deliberately not doing

- **The per-layout function library textarea.** `AbstractInputSuggest`'s
  constructor accepts `HTMLInputElement | HTMLDivElement` and refuses a
  textarea; the library is a textarea by design (one definition per line,
  `field-lines.ts`). A definition's *body* would want the same vocabulary, and
  gets nothing here.
- **The `[[` file suggester in the Rich text component.** A different
  surface, a different vocabulary, and the sheet side.
- **Renaming a component id and migrating the formulas that read it.** SPEC
  §10 declines the migration; this feature makes the id easier to type and
  says nothing about changing it.
- **The sheet side.** This is an authoring surface only; nothing a player
  edits gains a popup.
- **A name-aware error.** SPEC §7 rules that parsing is the whole of a formula
  field's check, because a name the sheet does not publish is a claim about
  data the character may not hold yet, and the component reading it already
  says so on its own card. Unchanged. A typo is visible as the name being
  absent from the list while it is typed, and absent from the inventory
  afterwards.
- **The canvas picking gesture** (focus a formula input, click a component on
  the live canvas to splice its path — Foundry Custom Fields' shape). Deferred
  as its own route, for three reasons that each need a design of their own:
  canvas components are `inert` and the overlay button's press *opens the
  configuration panel*, which destroys the input being edited, so a pick mode
  would have to suspend the overlay's primary gesture; on the narrow regime the
  canvas sits above the panel and the input scrolls out of view as the author
  reaches for a component; and the gesture in its only shipped form is
  mouse-only, where this pane holds keyboard parity as a rule
  (`grid-canvas.md`'s indent/outdent and arrow-key criteria).
- **ARIA beyond `aria-autocomplete="list"`.** The platform exposes no popup
  element to point `aria-controls` at and no open state to mirror into
  `aria-expanded`; recorded as a backlog row rather than reached through
  undeclared members.
- **Substring or fuzzy matching.** Exact, then prefix, then nothing (§3).
- **A component's internal words** — `value` on a Card's `derived`, a row's
  own cells on a row-value cell. The component's inner scope is a
  resolve-time fact (`display.scope`) no declaration states, and offering
  `value` on a Pool's `max`, where it means nothing, would be wrong more often
  than helpful; the two Card descriptions already name it.
- **Inserting a `(` after a function, or argument placeholders.** A name is
  inserted as a name; the author types the call.
- **An unsolicited list** on focus, after a space, or on an empty fragment.
- **Remapping Enter, or accepting on Tab.** The platform's keymap owns the
  keys while the popup is open, and seven surveyed tools' accept-versus-commit
  collision is answered here by ordering (exact first) rather than by a second
  key.
- **A disclosure or a cap on the inventory.** **Answered, not deferred:** the
  measurement is in §5 and nothing about six groups argues for one.
- **A roving `tabindex` over the inventory**, making the block one tab stop with
  arrow keys inside it. The defect it would answer — dozens of stops ahead of the
  form's first field — is real at eighteen groups and is the backlog row; what it
  costs is a keyboard model of its own inside a pane whose focus restoration is
  token-based and runs on every redraw, so the block would need its own
  restoration story. The resting surface and the focus ring are the cheaper
  answer to the same complaint and are what shipped: the stops are now marked and
  ordered, which is what made them unusable rather than merely many.
- **Hover and flip states of the popup in the harness.** Need a driven
  browser; one backlog row, beside the `prefers-contrast` row that already
  waits on the same fixture.
