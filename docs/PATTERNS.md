# Patterns

How code in this repository is built. `CLAUDE.md` holds the hard constraints
that must never be violated; this file holds the conventions that make new code
look like the code already here.

Read it before writing a component, and when reviewing one. `docs/UI.md` covers
the visual and CSS side; `SPEC.md` (in this folder) covers what the plugin does.

Every rule below carries how strongly it is held:

- **[checked]**. A test or an eslint `error` fails the build. Departing means
  changing the check first.
- **[warned]**. An eslint rule reports it as a warning. `npm run lint` runs
  with `--max-warnings 0`, so a warning fails the build exactly like an error.
  The tier records where the rule came from, `obsidianmd.configs.recommended`
  rather than a hand-set `error`, and not how weakly it is held.
- **[judgement]**. Nothing automated. A default with a reason rather than a law:
  depart deliberately and say why in a comment.

---

## 1. The two principles

Everything else in this file is a consequence of these.

### Atomic: one file, one responsibility

A module does one job and is named for it. `level-ring.ts` paints level rings.
`editable.ts` owns the editing gesture. `card-face.ts` draws the card.

**Length is a symptom, never the rule.** A 400-line module doing one job is
correct; a 200-line module doing two is not. Comment density in this repository
runs 40-50% by design (see §9), so a line count measures documentation as much
as behaviour and is not evidence on its own.

The real test is the one this contract already implies: *could a reader state
this file's job in one sentence without using "and"?* When the answer is no, the
file holds more than one thing.

> **The worked example.** `pool.ts` used to fail this test: its first ~850 lines
> were a gesture engine covering scrub, momentum projection and hold-to-repeat
> ramping, and its `ComponentDefinition` did not begin until line 856. Two
> responsibilities, one file, and neither of them small.
>
> Worth keeping as the example because of what the fix had to get right. The
> gesture moved to `src/interaction/`, but the *class names* stayed with the
> caller: a module in `interaction/` is passed `'sheetsmith-pool-step'` rather
> than naming a pool itself. That is the difference between splitting a file and
> actually separating two responsibilities. The second one leaves neither half
> knowing what the other is for.
>
> Note also what did not move. The flash timings and the temporary-points
> buffer read like gesture code and are not: they are the Pool's own feedback
> and its own rule. Atomicity is what forced the split, not reuse. The engine
> has one consumer, and §1 is explicit that one consumer earns no
> generalisation.

### Reusable: shared on the third consumer, guarded when duplicated

The general rule:

> a shared module is worth adding when a third component wants it rather than on
> the strength of the second

So:

- **One consumer.** Keep it private to that module. Do not generalise ahead of
  evidence.
- **Two consumers.** Duplication is allowed, *if* a test drives both copies
  over the same cases and fails when they disagree. The truthiness spellings a
  second reader of a flag would have to match are the standing example. Without
  that test the duplication is not allowed.
- **Three consumers.** Extract. At three, the shape has been demonstrated by
  use rather than guessed at, and the guard test is no longer cheaper than the
  module.

**That ladder is written for behaviour. A policy climbs it in one step.**
Where the duplicated thing is a timing, a bound, a row count, **a set, or a
predicate**, drift *is* the entire risk, so the two-consumer guard test costs
more than the module and proves less. It can only assert that the copies still
say the same thing, which is what one name says for free. Extract on the second
consumer there.
`interaction/commit-window.ts` holds a single `GESTURE_COMMIT` because Pool and
Track had both settled on 700ms in two places nothing kept in step;
`formula/expression.ts` holds `roundSum` because a Table's totals row and the
formula language's own `sum()` add up the same column from two call sites kept
apart on purpose — a total reads the draft and an aggregate reads the note — and
one expression reading `0.30000000000000004` where the number under the column
reads `0.3` is the whole of what drift means here. Note what got extracted: the
precision started out as a shared constant with `Math.round(x * P) / P` written
at both sites, which is a policy shared and its application duplicated. **Share
the application, not the number**, or the copy that can still drift is the one
nothing is watching;
`editor/list-field-height.ts` holds the row bounds because the two list fields
had already drifted apart twice, once on `rows` and once on their width;
`components/column-types.ts` holds the typed-column vocabulary because a
component and the editor field that configures it were each carrying their own
copy of which types exist, which one is the default, and which can be totalled;
`styles/sheet.css` holds `.sheetsmith-component-label` on the strength of five
consumers, which is two past where this ladder stops arguing — and it bred to five
for a reason worth naming: the agreement lived in each file's comment, "on the
pool's and the track's rank", and a comment is not something the next component
can reuse. `docs/UI.md` §9's vocabulary table had no row for it, so there was
nothing to reuse *by name* either;
`styles/sheet.css` holds `.sheetsmith-placed` and `.sheetsmith-placed-box` on the
strength of Rich text and Image, and it is the clearest instance of the trap this
paragraph warns about, because the number was extracted *first* and the rule was
not: `--sheetsmith-grid-row` became one name while the five declarations using it
stayed written out at both sites, which is a policy shared and its application
duplicated, in the same diff that cited this rule;
`parse/markdown-body.ts` holds the whitespace framing of a body that *is* its
value on the strength of Rich text and Image, because what is shared is *where the
text starts* — read one way and written the other, an untouched note is
reformatted on every save of any component on the sheet, and a guard test could
only assert the two copies still agree to the character;
and `components/linked-text.ts` holds the anchor policy on the strength of Table
and Rich text, because what is shared is a *set* — `internal-link`,
`is-unresolved`, both `href` and `data-href`, `title` and never `aria-label`, and
that a link paints as resolved where there is no vault — and a guard test over two
copies of it could only assert they still spell the same thing. All seven say so in
their headers, which is what a deliberate departure owes.

That last one also shows what does **not** climb with the policy. Table clips its
text and Rich text wraps, so clipping stayed with the callers: the painter takes
one optional argument a caller that does not clip omits whole, and the class name
is passed in rather than named there — `'sheetsmith-table-link-only'` arrives from
`table.ts`, because a module beside the components must not know that a table
exists. That is the pool gesture engine's rule above, applied to a painter.

That last one also shows how to tell the tiers apart. Two copies of a *set* is
the same case as two copies of a number: a guard test could only assert they are
still equal. Where the shared thing can be expressed as a type instead, prefer
that — the editor's labels are a `Record<ColumnType, string>`, so a new column
type does not compile until it has a word, which is a guard nobody has to
remember to run.

**A predicate is the same case again, and it was practice before it was written
here.** `types.ts` holds `isContainer` because four sites were each comparing
`storage` to `'none'`, and `placesChildren` beside it because `showsOneChild` was
spelled four times in two complementary pairs — `=== true` where a caller wanted
one branch and `!== true` where it wanted the other. A guard test over those
could only assert they still negate each other, which is what one name says for
free; and the pairs were far enough apart that a rule growing a second clause
would have been added to one and missed on the other. The tell is the same as for
a number: **if the only thing a test could check is that the copies still agree,
there should be one copy.**

Two consequences of that worth stating, because both were learned the hard way in
one diff. **Share the application, not just the fact.** `placesChildren` takes a
definition, so `view/grid-cells.ts` holds `childIsPlaced` — the same predicate
applied to a parent config, with the registry lookup the callers were otherwise
each doing, including a `?? ''` that leant on the empty string never being a
registered type. And **a third drawing of one model is a third consumer of every
rule under it.** The layout editor is not a renderer of the sheet, so the check
holding the two renderers to `renderGrid` does not reach it — and it had its own
derivation of which placement governs an inner grid, which agreed with the sheet
until a container was resized. `view/grid-cells.test.ts` now holds the rule to one
reader by scanning for the flag's name, which is the check that class of bug
earns: it was findable only by reading two files side by side (§10).

Extraction goes to a module named for the behaviour, never to a component. **A
component must never import from another component** [checked], because that
breaks the isolation the whole contract rests on: nothing outside a component
may know that component exists. Shared behaviour lives in a painter beside them
(`card-face.ts`, `level-ring.ts`), in `interaction/` (`editable.ts`), or in
`ui/` (`popover.ts`), never in a sibling component, whatever the import is
spelled like. Both directory spellings of a sibling and the registry itself are
restricted in `eslint.config.mts`, and the spellings are enumerated in
`components/isolation.test.ts`, which drives eslint rather than trusting a
comment: the rule stood half-enforced for a while because it was verified once,
with one import, in one spelling.

---

## 2. Repository structure

`src/` is organised by responsibility, and three of its boundaries are enforced.

```
src/
  main.ts          plugin lifecycle only, nothing else
  commands.ts
  settings.ts
  types.ts         the component contract
  parse/           note and layout parsing, and the ordered walk over a parsed
                   layout. Imports nothing from obsidian [checked]
  formula/         expression parsing and evaluation. Same rule [checked]
  interaction/     gesture vocabulary shared by every control
  components/      one file per component, plus the painters they share. No
                   component imports a sibling component [checked]
  editor/          the layout editor and its field widgets. Knows nothing
                   about a leaf: it renders into an element it is handed
  styles/          the stylesheet, split by area; styles.css is assembled
                   from these at build time and is not edited directly
  view/            sheet view, layout editor pane, auto-open, reset flow
  ui/              generic building blocks that know nothing of components
  test/            scaffolding only: the stub, the fixtures, and the gestures a
                   test presses a control with. Never test cases
    fixtures/      fixture files, as files: a layout and a character
                   note a test reads off disk and a reader copies into a
                   vault, under the filenames the vault needs
```

A new module goes in the folder naming what it *does*, not what it is *for*. A
gesture used by pools belongs in `interaction/`, not in `components/`.

### A component and `obsidian`

**A component imports nothing from `obsidian` for vault access, and nothing that
needs a DOM at import time** [checked]. Both halves are the rule; "no `obsidian`
in `components/`" was the shorthand, and it was wider than the reasons behind it.

Enforced as an allowlist — `setIcon` and nothing else — in `eslint.config.mts`,
and driven through eslint in `components/isolation.test.ts` beside the sibling
rule. An allowlist rather than a comment because the cost of the first such import
was invisible until it was paid, so the next one has to be a decision rather than
an inherited precedent: adding a name means editing the check first, which is what
this tier means.

**And the allowlist staying one name long is what decided the shape of the form a
modifier cell opens.** The obvious surface was Obsidian's own `Menu`, and something
would have had to import `Menu` — which a component may not, since inheriting the
`setIcon` precedent is exactly what this tier forbids. The import went to
`src/ui/`, which sits outside the restriction, and the module it landed in knew
nothing about modifiers because the domain text arrived as arguments. **Then the
surface became a form**, `Menu` turned out to host no controls at all, and
`ui/anchored-panel.ts` replaced it as plain DOM — so the import left `src/`
entirely, and `components/isolation.test.ts` scans for it. Both times the boundary
produced the right shape rather than merely permitting one: a `ui/` module that
knows nothing about what it holds, with the domain text as arguments.

The allowlist has since gained no name, and the sibling list has gained one:
`components/modifier-form.ts`, the markup of that form. **It is on the list for
atomicity and not for reuse, and the difference is the whole of why the entry is
worth reading.** It has exactly one consumer — Table — where `card-face.ts`,
`linked-text.ts` and `level-ring.ts` have three each and `modifier-breakdown.ts`
five. §1 is explicit that one consumer earns no generalisation, so "shared" is not
what admitted it: `table.ts` was 2450 lines and drawing a six-field form is a second
job in a file whose job is a table, which is the Pool engine's precedent above —
*atomicity is what forced the split, not reuse*.

What it is, for the boundary's purposes: in no registry, declaring no
`ComponentDefinition`, importing nothing from `obsidian` and touching no file. Adding
it to `eslint.config.mts` and to `isolation.test.ts` was the decision; the list is the
record of it. **A one-consumer sibling arrives with the atomicity argument or it does
not arrive**, which is the sentence a reader of this file alone needs, because
"shared" would admit the next one with no argument at all.

`table.ts` takes `setIcon`, and that is the one import of its kind. The
argument for it: the plugin's other three delete controls are Obsidian's trash
icon, drawing an icon touches no vault, and taking the app's icon rather than a
copy of it is what keeps it following the app's icon set. The cost is real and was
not where it was expected — not fidelity, since `src/test/obsidian-stub.ts` draws
the genuine Lucide paths for tests and the harness alike, but *import shape*: the
stub installs its DOM helpers on load, so three node-environment test files (the
registry contract, the reset flow, the worked examples) failed on import the
moment a component reached it. The stub guards those installers now.

That is the check to make before the next such import: not "does it work?" but
"what does the component layer now require in order to be imported at all?"

### The repository is self-contained

**Nothing the workflow depends on may live outside it** [judgement]. Not a
skill, not a hook, not a reference document, not a machine-local setting.

A clone on another machine has to build, test, review and ship by exactly the
same standard. The failure this prevents is silent rather than loud: a skill
delegating to one installed only on the original machine does not error on the
clone. It reviews with whatever generic knowledge it has and reports its
findings with the same confidence. Nothing marks the difference.

That is why `.claude/skills/design-review/reference/motion.md` is vendored into
the repository rather than referenced as an installed skill, and why
`harness/theme.css` carries a hand-written fallback so the harness works before
`harness:calibrate` has ever been run.

### Tests live beside the code they test

`pool.test.ts` sits next to `pool.ts` [judgement]. A mirror `tests/` tree
duplicates the structure, drifts from it, and turns every import into a climb.
It would also hide the real problem rather than fix it: `src/components/` looks
crowded because `pool.test.ts` is 2300 lines and `table.test.ts` 2600, and the answer to that is smaller
modules, not a different folder to keep them in.

`src/test/` is the exception and is not a contradiction: it holds scaffolding,
which is shared infrastructure rather than a test case. `obsidian-stub.ts` is the
app a test runs against; `pointer.ts` is the gestures a test presses a control
with, which went there rather than beside a component because no component owns
a gesture every component is driven by; `workspace.ts` opens a view in a leaf
the way the app does, which is what lets a workspace pane be rendered by a test
and by the harness through one function rather than two.

## 3. Component file shape

Every component follows the same order. A reader who knows one knows them all.

1. **File header comment.** What the component is, its `SPEC` section, the cases
   it covers, and, most importantly, *what it is not and why*. `track.ts`
   opens by ruling out being "a simpler Pool" and saying what differs. This is
   the paragraph that stops the component being redesigned by the next person
   to touch it.
2. **Imports**, shared modules first, then `../types`.
3. **Constants**, each with the reason it holds that value.
4. **`XConfig extends ComponentConfig`**, exported, with `type: 'x'` as a
   literal. A key carries a doc comment where it has something to say that its
   own name and its `configFields` description do not — what it does *to the
   note or the card*, not what it is. **Where the name already carries it, the
   comment is deleted**, which is §9's rule and the one that governs: the `hide*`
   flags are named there as the clear cases, `doc-comments.test.ts` [checked]
   fails a comment that only repeats its description, and five components across
   the catalog now declare one of those flags bare. A container declares its one
   key bare, which is what this looks like at the end. *(It had three when this
   was written; `collapsible` and `startCollapsed` went with the collapse,
   SPEC §13.)*
5. **`XData`**, exported, doc-commented.
6. **Private helpers**: validation, formatting, storage spelling.
7. **`export const x: ComponentDefinition<XConfig, XData>`**, members in this
   order [judgement]:
   `type`, `storage`, `showsOneChild`, `formulaFields`, `configFields`, `palette`,
   `configName`, `read`, `scopeValues`, `scopeRows`, `scopeModifiers`, `write`,
   `hasBuffer`, `applyReset`, `render`.
   Contract first, then the data path in the order it runs, then rendering last
   because it is the longest. `showsOneChild` sits beside `storage` because it is
   the same kind of fact: what this component is structurally, before anything
   about its data or its drawing. `palette` follows `configFields` because it
   reads in that order — here are the settings, and here is one of them filled in
   for a job; `configName` follows `palette` because it is the same job read the
   other way, one offering a configuration under a name and the other naming a
   configuration. `scopeRows` sits beside `scopeValues` because it
   is the same job read the other way: one publishes the component's names, the
   other the rows that have none. `scopeModifiers` sits beside both because it is
   the same job read a third way — the changes this component declares against
   names that are not its own (`SPEC` §5) — and it goes last of the three because
   the other two are about what this component holds and it is about what it does
   to somebody else's number.

Checked in `contract.test.ts`, along with the rule that a component declares
nothing outside the contract. Otherwise a new member falls outside the order and
is covered by neither.

### Registering it

One line in `components/index.ts`. Nothing else. If adding a component requires
touching the renderer, the parser, or the layout editor, the contract has been
broken and that is the bug to fix, not the component.

---

## 4. Failure is a value, never an exception

Components do not throw [judgement]. Every failure that a user can cause is a
value the caller can act on.

- `read` returns `ReadResult<TData>`: `{ ok: true, data }`, `{ ok: true, data:
  null }` for "nothing stored yet", or `{ ok: false, error }`.
- `applyReset` returns `ResetResult<TData>` for the same reason: data returned
  unchanged is indistinguishable from a reset that did nothing.
- Config validation returns a discriminated union, `{ key } | { error }` as in
  `valueKey()` in `card.ts`, checked with `'error' in entry`.

**`data: null` is not an error.** A missing section, an empty fence, and a fence
without this component's key all mean the same thing: an editable empty card.
Reporting a value the note never said would make the first render write a line
nobody asked for.

**Error text names the fix, not the fault** [judgement]. `"max: 'con' is not
defined on this sheet"` beats `"could not resolve"`. Where a component has both
a `resolve` and an `explain` in its context, use `explain` on the failure path.
That is what it is for.

**One component's failure never takes down the sheet** (`SPEC` §10). A
misconfigured component renders its own error into its own container and
returns; everything else stays live and editable.

---

## 5. Render conventions

Fixed opening [judgement]:

```ts
render(container, config, data, context): void {
    const doc = container.ownerDocument;
    container.replaceChildren();
    // config guard, then build
}
```

- `container.ownerDocument`, never the global `document` — **and the element's own
  `window`, never the global one** [judgement]. One rule with two globals in it,
  for one reason: the view may render into a detached or popout window, and a
  timer or a `getComputedStyle` taken from the wrong one is as wrong as a
  `createElement` is. Spell the second `el.win`, which Obsidian types non-null,
  or `ownerDocument.defaultView` where the null path is real — ten production
  sites take the latter because they want `getComputedStyle` and have somewhere to
  bail to.

  Held today on both halves, and the `window` half only just: `document` has
  never been reached for outside two comments, while `schematic-gestures.ts` held
  the one bare `window.setTimeout` in the repository until it was moved to
  `cell.win`. That is the argument for naming the sibling rather than leaving it
  implied — the rule was stated for one global and the exception grew under the
  other, in a file whose own header argues about which folder knows what. Nothing
  enforces either half.
- `replaceChildren()` to clear. Never `innerHTML` [warned:
  `@microsoft/sdl/no-inner-html`]. Obsidian's review rejects it, and it destroys
  listeners with no warning.
- Build with `doc.createElement` and `classList.add`. Every class is prefixed
  `sheetsmith-` [judgement]. Note `obsidianmd/prefer-create-el` is deliberately
  off in `src/components/` so components stay testable under happy-dom.
- **Config guard first.** Render the error, return, build nothing.

### The paint closure

A component with state holds a local `paint()` that redraws everything derived
from it, and calls it once at the end of `render` and again on every change.
State lives in a `let` in the closure, not in the DOM.

### Optimistic paint

Paint **before** reporting the change [judgement]:

```ts
const flip = () => {
    current = !current;
    paint();                        // the control answers the press
    context.onChange({ value: current });
};
```

A write producing an identical file does not rebuild the view, so a component
that waited for the round trip would sometimes never update at all.

**That reason is the test, not the habit.** Where a change always alters the file,
the rebuild always comes and a local paint buys only the milliseconds before it —
which is not free, because a paint replaces DOM. A Table repainted a cell's
rendered wikilinks on commit and destroyed the anchor the browser had just focused
while tabbing out of the field, so focus fell to the body and the view had nothing
to restore. Paint optimistically where a write may produce no rebuild; leave it to
the rebuild where one is certain.

### A component never touches the file

Edits are reported through `context.onChange`. The sheet view owns writing.
No component imports `obsidian` for vault access.

---

## 6. Interaction conventions

These exist so that the same gesture means the same thing everywhere on a sheet.
A component inventing its own is the failure mode to watch for.

- **The whole card is the hit target.** A ring is 1.6em; a card that answered
  only on the mark reads as dead everywhere else.
- **Real controls own their own presses.** Guard with
  `target.closest('a, button, input, select, textarea')` before handling a press
  on the card. A rendered wikilink inside a label must stay a link.
- **Focus on `pointerdown`, commit on `click`.** A tap has no hover to say what
  it is about to hit, so focus moves while the finger is down; committing on
  release is what lets a press slide off and be taken back.
  **The two halves separate only where focus is *preparation* for an outcome**,
  and on a control where focusing *is* the outcome they collapse onto release.
  A card's field is the first kind: focus, type, commit, and the press that
  slid off has taken nothing with it. A prose block and a picture are the
  second — the whole of what their press does is hand over the field — so
  focusing on `pointerdown` would open a mobile keyboard on a press that slid
  off, with nothing left to abandon it with. That is this rule's own forgiveness
  argument reaching the same event from the other side, not an exemption from it.
  `rich-text.ts` and `image.ts` are the two consumers; each has a *second*,
  narrower reason of its own, and the narrow ones are why this general one is
  written here rather than in either file — Rich text's is that its display layer
  is a scroll container and a touch drag begins with a `pointerdown`, which is
  true there and not of a picture, so a component reading only that comment finds
  the reason absent and the precedent unexplained.
- **One route in.** Keyboard activation arrives at the same handler by bubbling.
  Never a second code path for the keyboard. That is how the two drift. **The
  exception is a gesture the other input does not have**: a key cannot express a
  hold, so `interaction/hold-repeat.ts` answers `pointerdown` for the repeat and
  handles the keyboard's `click` separately, telling them apart with
  `event.detail === 0` so a mouse press is not stepped twice. Take that
  exception only where the gesture is genuinely absent from the other input,
  never where routing it through one handler is merely inconvenient, and keep
  the step arithmetic in one place even when the entry points differ.
- **Draft and commit are separate** (`editable.ts`). Typing, arrows and Enter
  change the draft; blur commits; Escape abandons and says so. Nothing reaches
  the file before a commit.
- **A field that owns unusual arithmetic owns its own step** via `onStep`, so
  the arrow keys and the buttons cannot disagree.
- **ARIA is part of the control, not a retrofit** [judgement]. `aria-pressed`
  for two-state marks; `aria-label` composed from the label and the state name
  the layout author chose. Announce commits and restores where the change is not
  visible on its own.
- **Arithmetic uses the formula parser, never `eval`** [checked]. `amountOf`
  and `settleEntry` in `editable.ts` are the shared entry points.

---

## 7. Data and file conventions

- **Report a delta, not a snapshot** [judgement]. `StatData` has `value?` and
  `note?` both optional: an edit reports only the field the user touched, so a
  commit racing a rebuild cannot write back a stale sibling. A component with a
  single field may hold it flat, since there is no sibling to protect.
- **Preserve the note's own spelling.** Constraint 3 is byte-identical
  round-tripping, so `write` reads the body it is handed and keeps a spelling
  that already means the right thing. A hand-written `x` stays an `x`; `true`
  stays `true`.
- **Entries under keys this component does not own are never touched.**
- **A storage key is file vocabulary, not display vocabulary.** It names the
  entry in the note so hand editing reads well. Formulas reference the component
  `id`; the key never appears on the card.
- **Validate what the file format requires, not what looks tidy.** A key is
  refused for containing a colon because a colon separates key from value, not
  because it is ugly.

---

## 8. Config field conventions

- Every field declares `key`, `kind`, `label` [checked], and `description`
  [checked].
- **Descriptions state the consequence.** "Renaming it does not move a stored
  value; the old entry stays in the note under the old key" is the model. A
  description that only restates the label is not worth its line.
- Sentence case, per `AGENTS.md` [warned: `obsidianmd/ui/sentence-case`].
- `group: 'Appearance'` collects presentation toggles under a subheading.
- `default` on booleans; a value matching its default is omitted from the config
  and `visibleWhen` matches the *effective* value, so a condition naming a
  default is satisfied by absence.
- Never redeclare `id`, `type`, `label`, `position`, `reset`, `children`
  [checked]. The editor owns those.
- Declaring `applyReset` obliges `formulaFields` to include `reset.*.to`
  [checked]. Forgetting it leaves the reset button dead with nothing to say so.

---

## 9. Comments

Comment for two reasons, and only two:

1. **The name cannot carry it.** Rename first, always. Comment only where a name
   genuinely cannot express the thing: a unit, a bound, what `null` means, which
   failure a branch handles, when a callback fires.
2. **A design or implementation decision needs recording.** Why this and not the
   obvious alternative, what the choice costs, what was rejected and why.

Everything else is deleted. A doc comment restating its own identifier earns
nothing and costs a line in every future read.

Density is an *output* of those two rules, never a target. Where the decisions
are dense the file is dense: `pool.ts` runs 46% comment and blank, `track.ts`
42%, and nearly all of it is the second kind: the argument against the design
that was not taken. **A reviewer must not report that as bloat**, and a cleanup
pass must not strip it. Deleting the paragraph in `editable.ts` explaining why a
value field does not also read an amount is precisely how that bug gets rebuilt.

Applied honestly, the cut in this codebase is small and specific:

- **A doc comment restating a self-describing name.** The `hide*` config flags
  are the clear cases: `/** Hide the label above the value. */ hideLabel?:
  boolean`, `/** Leave the note line off the card. */ hideNote?: boolean`,
  `/** Show only the derived result... */ hideValue?: boolean`. The identifier
  already says it.
- **An interface comment duplicating a `configFields` description.** Those same
  three sit directly above a `configFields` entry carrying the same sentence as
  user-facing copy. The description must exist; the interface comment is the
  copy to drop. Keep it only where it says something the description does not.
  `components/doc-comments.test.ts` [checked] holds this over every component:
  a comment fails there when *every* sentence in it is one the description
  already carries verbatim. Two things pass deliberately, and neither is a hole
  left open. A restatement in *different words* passes, because no similarity
  threshold separates this codebase's duplicates from its keeps — `track.ts`'s
  `count` comment resembles its own description more closely than the
  cross-reference dropped from `hideLabel` did. And a comment that repeats a
  description sentence and then *adds* to it passes, because the obvious rule
  for catching it — compare the comment's leading clause against a whole
  description sentence — reports "off the sheet, so the run has no visible
  name" exactly as readily as "off the sheet, as on a Card", which would fail
  the build against comments this section asks an author to write. Both stay a
  judgement made in review, and the check only ever reports what it can prove.
- **Restating the code.** `// increment the counter`.

Contrast a comment that stays: `/** Arrow keys step a numeric draft, exactly
like typing the number. */` on `step?: boolean`. The name says nothing about
arrow keys, and "exactly like typing" is the rule that keeps two inputs from
disagreeing.

Where a decision settles an open question, move it into `SPEC` §13 as a
`Resolved:` entry as well. The code comment says how; §13 says that it is
decided.

---

## 10. Testing

- **One test file per module**, beside it. Component behaviour, including its
  read/write round trip, belongs in that component's file.
- **`contract.test.ts` is registry-wide** and runs against every registered
  component. A rule that can be expressed there belongs there rather than in six
  component files, since that is the cheapest place in the repo to enforce a
  rule and the first to reach for when adding a checked rule.
- **Round-trip every component**: parse then serialise with nothing changed is
  byte-identical (Constraint 3).
- **A guard test earns its place when a failure is invisible in review.**
  `styles.test.ts` is the model: an unscoped field rule loses to Obsidian's own
  input styling and nothing in a type check or a unit test would ever notice.
  When you find a bug that review could not have caught, the fix includes the
  guard.
- **A test that could pass vacuously must assert it is testing something.**
  `styles.test.ts` checks it matched more than 8 rules before checking they are
  all scoped.
- **A shared test helper is checked to be the only spelling of what it owns**
  [checked]. `pointer-gestures.test.ts` scans every `*.test.ts` for a bare
  `new PointerEvent('pointerdown'|'pointerup', …)` that carries `pointerId` or
  `button` and no coordinates — which is exactly what `src/test/pointer.ts`
  already says — and fails naming the file and line. It exists because
  extracting that module removed the four redeclarations and left fifteen
  equivalent raw dispatches behind in one file: **an extraction is not finished
  at the declarations, and the call sites are the half nothing was watching.**
  Finding them cost a grep across 2300 lines, which is dearer than the scan and
  would be paid again by every reader who wondered. Same class as
  `view/grid-cells.test.ts` and `components/isolation.test.ts` (§1): a gap
  findable only by reading two files side by side is worth a scan rather than a
  habit. The predicate is narrow on purpose — a drag carries coordinates and a
  card's own surface press carries neither `pointerId` nor `button`, and both are
  hand-written by design — so the check only ever reports what it can prove.
- **Three kinds of module are tested through their consumers instead.** All are
  stated exceptions to one test file per module. What they share is that the
  consumer is the only place what the module owns becomes observable; the reason
  differs, and collapsing them into one reason is what let the condition below
  read as attaching to just the first of them. A gesture has nothing to act on
  without a control. A vocabulary has nothing to assert that is not a tautology.
  A note-format primitive has nothing to be *wrong* about except a caller's
  round trip.

  **A gesture module is tested through a control that drives it.**
  `src/interaction/` is the first: `scrub.ts`, `hold-repeat.ts` and `editable.ts`
  have none of their own and should not grow one. A gesture is only meaningfully
  driven through a control, so a file of its own would have to build a fake card
  before it could press anything — and `pool.test.ts`, `track.test.ts` and the
  component tests already are that card. A second one is the duplication §1
  forbids.

  **A shared-vocabulary module is tested through the consumers that speak it.**
  `components/column-types.ts` and `components/stored-flag.ts` are the second,
  and they hold nothing but the policy §1's one-step tier extracted: which column
  types exist, which is the default, which can be totalled and which published;
  which spellings of a flag a note may hold, what one is written as, and what a
  two-state control is called. A file of its own could assert little past a
  constant equalling itself, which is §1's own reason the copies were merged —
  the only thing such a test could check is that they still agree, and that is
  what one name says for free. What holds them is three consumer test files:
  `table.test.ts` and `track.test.ts` drive every spelling either flag set holds,
  through a read and a rendered control, and those two together with
  `list-fields.test.ts` drive every column type — through a rendered card and
  through the editor field that offers it. Each spelling is written out literally
  rather than iterated from an exported set: a test walking `SET` passes after a
  member is deleted from it, because the deletion takes the iteration with it,
  which is the vacuous pass this section forbids above. One member of
  `stored-flag.ts` does not meet the condition below, and §11 holds it.
  **A note-format primitive is tested through the round trip it is part of.**
  `parse/lines.ts`, `parse/layout-walk.ts` and `parse/markdown-body.ts` are the
  third, and this clause is written because the two above did not describe them —
  settled practice that the rule as stated left out, and the last of the three
  widened the gap. What they share is that the claim each makes only exists
  relative to a caller: `bodyText` alone is `trim`, and `splitLines` alone is a
  split, so a test of either asserts a standard-library call. What is worth
  asserting is Constraint 3 — parse then serialise returns the input byte for
  byte — and that is a *component's* contract, not a primitive's. So
  `character.test.ts` and `fenced.test.ts` hold `lines.ts`, `rich-text.test.ts`
  and `image.test.ts` hold `markdown-body.ts` over ten spellings of a body's
  whitespace each, and `view/grid-cells.test.ts` holds the walk. The tell that
  separates this from a coverage gap is the same one the other two exceptions use:
  a test of its own here could only restate the implementation, while a consumer's
  round trip fails on a real drift.

- **All three exceptions carry the same condition, and the condition is what makes
  any of them safe: what the module owns has to actually be driven
  somewhere.** Read as a licence
  instead, it is how `hold-repeat.ts` came to have its repeat untested — every
  caller released the button on the tick it pressed it, so the ramp, its floor
  and reading Shift per tick never ran, and "writes the note once for a press,
  not once per repeat" passed on a press that had not repeated. Timing the
  gesture owns belongs beside that control's other gesture tests, under fake
  timers, not in a file of its own. A vocabulary fails the same way and is
  cheaper to miss, because nothing about it looks untested: a spelling no
  consumer's fixture holds, or a column type no fixture configures, is a member
  of a set nothing has ever asked about, and the module's whole value is that
  the answer is in one place. Where a *type* can carry the guard instead, prefer
  that (§1) — the editor's labels are a `Record<ColumnType, string>`, so a new
  column type does not compile until it has a word, which is a check nobody has
  to remember to run.
- **Duplication between components requires a test that drives both** (§1).

---

## 11. Conformance backlog

Where the code does not yet match this file. These are findings, not licences:
new code follows the patterns above. A row leaves when it is fixed. A backlog
that keeps solved rows stops being read.

Every row here names what it is waiting for. A row with no trigger is a row
nobody can ever retire, and four of the eight this table held were closed in one
pass precisely because each said what would close it.

| Gap | Where | Fix |
| --- | --- | --- |
| A correctness property is held by the order of two `addEventListener` calls across a module boundary | `components/card-face.ts`, `interaction/editable.ts` | The value pill's swap — effective at rest, stored under a caret — needs its `blur` listener registered **after** `bindEditable`'s, because listeners on one element fire in registration order and the binding's blur is the one that commits. Bound first, the restore would put the effective number back *before* `commitIfChanged` read the field, and the commit would write a number nobody typed into the note (CLAUDE.md 4). That is a data rule resting on the position of two calls relative to a call into another module — and it is invisible from `editable.ts`, which is the module that actually owns `committed`, the baseline the whole swap protects. **The fix that would make it unstatable rather than merely documented** is an `atRest?: string` on `EditableOptions`: the binding already knows when the field is focused and what the baseline is, so it could own the display swap and the ordering question would not exist. **Not taken, on §1**: `card-face.ts` is the only consumer, one consumer earns no generalisation, and this is reuse rather than the atomicity argument that admitted `modifier-form.ts` — `card-face.ts` is not too big for it and the swap is four lines. **What changed since this was raised is the evidence, not the shape.** The property used to be a comment; the Card set gesture cases now render into the document and drive real `focus()`/`blur()`, so moving the two listeners above `bindEditable` turns two cases red — including the one asserting that a blur which changed nothing writes nothing. Measured, not assumed. So what is left is that a reader of `editable.ts` cannot see the constraint, not that a violation would ship. **Waiting on:** a second control wanting a display that differs from its editing baseline, which is where §1 extracts and where the option would stop being a generalisation ahead of evidence. |
| A delta assertion is weaker than a write assertion, and nothing says so where the next author will read it | `src/components/table.test.ts`, `docs/PATTERNS.md` §10 | **Twice in one feature a case asserted the delta a component emitted and missed what the note became.** The second time it was a reported bug: **Remove** on a cell holding one name twice emitted `{cells: {Modifiers: 'Ring of Protection'}}` — a delta that *still names the modifier* and is shape-identical to one that does not, so the assertion passed and the row went on applying it. The lesson in one line: **a delta says what was sent, and only the write says what the note now holds.** §10 should carry it beside its existing rules about what a test must assert, with the cheap form named — carry the delta through the component's own `write` and assert the section text, which is what `table.test.ts`'s round-trip cases already do for edits and now do for removals. **Waiting on:** the §10 edit, which is a sentence rather than a scan and belongs in the docs commit rather than in a diff about modifiers. |
| Nothing catches an assertion entailed by the filter that produced its input | `src/styles.test.ts`, `src/components/contract.test.ts`, and every source scan | §10 already says "a test that could pass vacuously must assert it is testing something", with no scan behind it. **Its cheap half is done and is now true everywhere**: every source scan in the repository asserts a floor on what it read before asserting anything about it — `styles.test.ts` (six), `pointer-gestures.test.ts` (three), `grid-cells.test.ts` (three), `isolation.test.ts` (four), `sheet.test.ts` (three), `doc-comments.test.ts`, `contract.test.ts`. Two were added by the pass that wrote this row, one of them because a review found it: a panel-specificity case filtered on a prefix regex and then asserted that same prefix, so only its floor was live, and its own comment's specificity claim was already false while nothing noticed. **The expensive half is the entailment itself, and the honest position is that it should stay a review concern rather than becoming a scan.** Deciding that a predicate follows from a filter is undecidable in general; the available heuristic — "the assertion's literal appears in the filter expression above it" — would have caught that one case and would fire on every legitimate `filter(x).every(x-ish)` in the suite, which is a check whose false positives an allowlist would then have to carry, and a backlog kept in a test file is what this table is for instead. **Waiting on:** nothing, unless a *second* entailed assertion is found; two instances would be evidence the heuristic is worth its noise, where one is evidence review works. |
| Nothing checks that two selectors do not declare the same rule twice | `src/styles.test.ts`, `styles/sheet.css` | Two §1 violations shipped in one feature and **both were found by normalising every rule body and diffing them**, which is a scan `styles.test.ts` could run today — it already parses every rule. It is exactly §10's case: invisible in review, findable only by reading two files side by side. **What stops it being added in the pass that found it is the threshold, and the number is measured rather than guessed.** As proposed — "no two selectors declare an identical property set" — it fires 42 times and is unusable: most are one-declaration rules saying `color: var(--text-normal)`, which is not duplication but `docs/UI.md` §1 being obeyed. By declaration count the hits are 42, 16, 7, **3**, 2, 0 at thresholds of one to six, so ≥4 is where a *rank* or a *box* lives rather than a palette reference, and ≥6 is now empty because the two biggest were the ones extracted. The three at ≥4: `.sheetsmith-card-set-label` against `.sheetsmith-table-label` (five declarations, the "name over a strip or a table" rank, entirely pre-existing); `table thead th` against `table tfoot .sheetsmith-table-name` (five, one table's header and footer agreeing on purpose, and arguably one selector list rather than two rules); and `.sheetsmith-table-input:focus` against `.sheetsmith-rich-text-input:focus` (four, a field's focus treatment, one half of it new). So adding the guard means either three more extractions — touching Table, Card set and Card, none of which this feature opened — or an allowlist, which is a backlog kept in a test file and is what this table is for instead. **Waiting on:** a decision on the three, taken as its own diff; the guard lands with it, since a guard added before them would only be red. |
| Two extracted modules' cases live beside the editor rather than beside them | `editor/schematic-gestures.ts`, `editor/config-panel.ts` | **This row replaces the gesture engine's, which said it was waiting on a workspace fixture in `src/test/`. That fixture now exists, the cases did not move, and the row was wrong about why.** `src/test/workspace.ts` and `src/test/plugin.ts` open a real pane from a sibling file — `view/layout-editor-view.test.ts` does exactly that — so the import that was named as the blocker is available. What a sibling file still cannot import is the *harness* in `layout-editor.test.ts`: `fixture`, `open`, `control`, `has`, `type`, `choose`, `toggle`, `checkbox`, `confirmAction`, `writes`, `labels`, `grids`, `groups`, `settle`. That is roughly 200 lines and it is a test file's own, not scaffolding (§2), so moving cases means either duplicating it — the duplication §1 forbids — or designing it into `src/test/` as a fixture of its own. **And two harder facts the old row never named.** Neither module has an entry point of its own: every case reaches a gesture or a form by pressing a tree row or a schematic block, both of which the editor draws, so a sibling file would drive the outline to get anywhere. And several cases make one claim about *both* regions deliberately, because the contract is that the two agree — a container that may hold nothing gets no grid *and* a sentence saying why; a tab set draws no schematic *and* lists its tabs in order; a nested component's grid is drawn *and* its position fields offered. Those cannot be assigned to one file without being rewritten, which is the one thing a movement may not do. The cheaper alternative is worse in both cases: a `SchematicGestures` or a `ConfigPanel` over a fake host would rewrite every assertion to test the seam instead of the behaviour. The five small modules the same file drives — `accepts-children.ts`, `component-name.ts`, `copyable-name.ts`, `field-commit.ts`, `form-group.ts` — are the same fact in miniature and are the settled practice here rather than new debt; each says so in its own header. **Waiting on:** the pane harness promoted to `src/test/` as a designed fixture, at which point the cases that make a single-region claim move as they are, and the joint-region ones are the residue this row would shrink to. |
| The pane still holds which layout is open alongside what is in it | `editor/layout-editor.ts` | **This row replaces the one that said the pane's job needed an "and" and that no row named it. The cut it asked for was taken and this is the smaller gap left.** `config-panel.ts` is the panel — the component form, the layout's own settings, the tab order and the two textarea fields the pane reads back on close — parameterised over a `ConfigPanelHost` of six members, five commands and the inline-error map. The whole region moved rather than only `renderComponentForm`, which was the largest cluster: leaving the layout's own settings behind would have left the file drawing into both regions and §1's "and" exactly where it was. 1820 lines became roughly 1260 and 790 — rounded on purpose, unlike the cluster counts below, which the trigger re-runs and which have to be exact; a file total is context and a total stated to the line goes stale on the next comment — with `accepts-children.ts` and `component-name.ts` taking the predicate and the naming policy both halves ask for — §1's one-step tier, since a guard test over two copies could only assert they still agree. **The decisions the old row left open, recorded here because it named them as the decision rather than a detail.** The error map is the *host's*: it outlives the render that fills it, the editor replays it over the whole pane and forgets the entries whose field has gone, so a panel holding its own would lose an error the moment an unrelated field was corrected. The `fieldError` wrapper did not survive as a shared member at all — it was a one-line binding of `field-error.ts`'s `showFieldError` to that map, so each half binds its own and the application stays in one place. `renderChildOrder` moved, every caller being in the panel; `listContext` stayed behind the host, because moving it would replace one member with four the panel has no other use for — `ListContext` has seven and the host already carries `persist`, `redraw` and `errors` — and would hand it state only the outer render loop can apply. **What is left is a smaller "and" in the same file:** the render loop and the outline are one job, but the layout picker with `deleteLayout`, `promptCreateLayout`, `createLayoutNamed` and `NameModal` is another — *which* layout is open rather than what is in it — and it is 87 lines plus the modal. It is not cut here because it is the smallest of the four clusters that were measured and the only one with no host to speak of: it reaches `plugin.app`, `plugin.settings`, `releaseLayout` and `setLayoutName`, which is most of the editor's own state, so the seam would be wider than the code. **What made this move checkable:** not one assertion and not one import changed in the cases as part of it, and thirteen mutations turn one red each — six, one per member of `ConfigPanelHost`; two, one per call site of the new module; three, one per export of the two helper modules; one over the panel's own binding of the error map, which is the half of the old pair that did not become a member; and one over `commitPending`'s reading of both fields before it combines them. Four of the thirteen survived at first and are closed by the three assertions added *after* the move rather than during it. They are the same finding twice over: the errors map and `commitPending` are what carry state across a rebuild, every other path into either goes through a control's own change listener, and a no-op on the path that does not was invisible. **A review then found the one control the panel drew that something outside it wrote:** `syncPositionFields` had stayed with the editor and reached into the panel by DOM query for inputs the panel minted, which is the header's own rule about held references broken by another means, and it left the four keys and the field token spelled in two files. It is the panel's now, `SchematicHost` still names the member because the gesture is what asks for it, and the editor answers by delegating. The token has one spelling, in the panel; the four keys have one in `types.ts`, beside the type they are the keys of, because the parser walks the same four to validate them and a list spelled per reader is one that can fall short of `GridPosition`. Four more mutations over that — the token, the key set, the remembered element and the delegation — each turn a case red. **Waiting on:** the picker ceasing to be the smallest of this file's clusters, which the grid canvas or undo landing here would do — a state, re-checkable by running the same count this row did rather than a judgement about when someone feels like it. |
| A refused edit's complaint outlives the text it was about | `editor/field-error.ts`, `editor/config-panel.ts` | Every validation site in the panel refuses the edit and returns: an empty label, a duplicate label, a position or column count below one, a config number that is not one. None of them writes the layout, so the next rebuild draws the field from the value the layout still holds — the *old, valid* one — and `restoreFieldErrors` replays the message over it. The author sees a red field saying "Whole number, 1 or more." above the number 7. `field-error.ts`'s header states the policy that produces this and states only half of it: invalid input is never silently swallowed and never silently lost, so every message goes through the errors map. It does not say what a message *means* once the input that earned it has been reverted, and that is the open half. **Found as an inconsistency rather than as this.** The label field's duplicate branch was the one site of six calling `showFieldError` without the map, so a rebuild dropped that message and kept the other five — the argument is optional, so nothing compiled or linted differently. That much is fixed: one field's two branches disagreeing is the instrument disagreeing with itself (`docs/UI.md` §11), the policy of record is written down, and the outlier now conforms and has the two cases it never had. **What is not fixed is which way the policy should go**, and it is a decision about the interface rather than about code. Either a refused edit's complaint belongs to the text it was about and goes when the text does — which is the bare call, and means five sites lose the map and three cases invert — or it belongs to the field and the *value* is what should be restored, not reverted. A third answer is likelier than either and it is already in the backlog: `docs/UI.md` §12's row on a stored value never being marked as wrong asks for each field's own rule to run at render and seed the errors map from it. Validation at render makes this question disappear — a reverted field validates clean and clears its own message — so the two rows want the same change and neither should be taken alone. Three cases currently pin the surviving behaviour: the position field's, and the label field's two. **Waiting on:** validation at render time, which is `docs/UI.md` §12's row and not a second trigger; failing that, a decision on which half of `field-error.ts`'s policy governs. |
| No component has a boolean that redraws the editor, so the redraw's focus path is only half driven | `src/editor/layout-editor.test.ts`, `components/*.ts` | A boolean controlling another field's `visibleWhen` rebuilds the pane, and the editor restores focus by a `data-sheetsmith-focus` token. `Collapsible` was the only such boolean anywhere, and it went with the group's collapse (SPEC §13); the two `visibleWhen`s left are both keyed on selects, which the sibling test drives. So the test asserts the precondition — a boolean's checkbox carries a token that addresses it — rather than pressing one and watching focus survive. It moved out of `src/settings.test.ts` with the editor: while the settings tab held the editor the tab did the restoring, and with the editor in a pane the restore belongs to the module that owns the token. That is §10's `hold-repeat` failure with the polarity reversed: there a path had callers that never exercised it, here it has no caller at all. Not fixed by inventing a boolean a component does not need, nor by registering a fake component, which would mean the registry opening a door for a test. **Waiting on:** a component gaining a boolean that controls another field's visibility, at which point the test goes back to driving it. |
| The view's share of a container's tab state has no test | `view/sheet-view.ts` | Three lines with no logic in them — the `Map`, the `clear()` on a file change, and the get/set handed to a container's context — and none of it drivable, because `SheetView` cannot be constructed without a workspace. The component's half *is* tested: `tab-set.test.ts` drives the first tab, the reader's press, the clamp, and the state surviving a rebuild. What is untested is that the view supplies it and drops it, and the second is a real claim: forget the `clear()` and a reopened note inherits the previous note's tab. **This row existed for the collapse's identical `Map` and was retired when the collapse went; Tab set brought the same three lines back, so it is back.** Not extracted the way `cell-focus.ts` was, because that carried logic with a trap in it and this is a `Map` — a module here would test that a `Map` works, behind an abstraction with one caller (§1). **Waiting on:** a `SheetView` a test can *render*, not merely construct. Constructible is the cheaper half and it is not enough: `activeTab` is private and only reachable through the `onActivateTab` callback handed out mid-render, so setting a tab before asserting `clear()` drops it means driving `renderSheet` — a vault, a metadata cache, a layout file to load, and `contentEl` and `file` on the stub's `TextFileView`. That is a workspace fixture in `src/test/`, designed rather than accreted, under §2's rule that the folder holds scaffolding and never test cases. Weighed in the pass that closed four of this table's rows and ruled its own piece of work, since it is larger than all four together; until then it is a look criterion in `docs/features/tab-set.md`. |
| The guard that makes a [checked] rule true fails about one full-suite run in three | `components/isolation.test.ts` | `refuses import { pool } from './pool';` is intermittent. Measured rather than guessed: six for six when the file runs alone, roughly one failure in three full-suite runs, and it reproduces on the pre-`layout-editor-pane` tree, so it is neither new nor caused by that work. The mechanism is contention — this is the only test that boots eslint with the type-aware `projectService`, it does so **once per case** because `lintAsComponent` constructs a `new ESLint()` on every call, and twenty-three of those run in a worker beside thirty-seven other files. **It matters more than an ordinary flake because of what it guards**: §1's "a component must never import a sibling" is [checked] on the strength of this file, and `CLAUDE.md` tells every session that eslint enforces it. A gate that goes red for no reason teaches a reader to re-run rather than to look, which is exactly how a real violation would get waved through. The obvious fix is to hoist the `ESLint` instance to module scope so one project service serves all twenty-three cases; it is not taken here because proving a flake fixed means many repeated full-suite runs, and this is the wrong file to alter in a pass about something else. **Waiting on:** someone taking it deliberately, with the repeated runs to show it stayed green. |
| A fourth list field imports five helpers from one of the other three, and one of them is not geometry | `editor/list-fields.ts`, `editor/modifier-definitions-field.ts` | The modifier definitions list is its own module — its own vocabulary, its own five-control detail line, its own problem report — and a shared *list editor* over four vocabularies would be the form-description language `line-list-field.ts`'s header refuses. What it does share is the **geometry**: `listField`, `labelled`, `addControls` and `addControlSpacers` keep a list's header in step with its rows, its buttons named the way the other three name theirs, and the control tracks the same width on both. Those four are now `export`ed from `list-fields.ts` and imported by a sibling, which is §1's extraction going to *a consumer* rather than "to a module named for the behaviour" — and `addControlSpacers` was private again as recently as the layout-editor pane, with a comment saying so, because at the time all its callers were in that file. **Four consumers is past where §1 extracts**, so `editor/list-geometry.ts` is owed: the four, plus the `--sheetsmith-list-fields` count they are sized by. **A fifth was exported and it belongs somewhere else**, which is the half this row first undercounted: `setOptional` is not geometry at all — it is the file-format rule that an empty field means an *absent key*, which is `parse/layout.ts`'s recorded `options: []` trap and `field-lines.ts`'s category rather than a grid's. A pass acting on "the four" would extract them and leave the fifth exported from a consumer, which is the same gap one name smaller. Not taken here because it is five call sites and a stylesheet comment in a diff about modifiers, and because the fourth consumer is the evidence rather than the trigger — the shape is demonstrated by use and both extractions are mechanical. **Waiting on:** nothing but a pass that does only that, and it has to move both. |
| An extracted line rule is a module rather than a check, so a fourth field can spell it inline | `editor/field-lines.ts`, `editor/*-field.ts` | `field-lines.ts` names the two rules for what a line is in a textarea field — `trim` for a stored identifier the UI matches on, `trimEnd` for a line of code — and it exists because three copies held two rules with nothing saying which applied where. **Nothing stops a fourth field writing `value.split('\n').map((line) => line.trim())` inline and rejoining the drift**, because the extraction is a module and not a guard. §10's own case for this is `pointer-gestures.test.ts`: "an extraction is not finished at the declarations, and the call sites are the half nothing was watching" — there the fix was a scan for the raw spelling the module replaced, which found fifteen equivalent dispatches the extraction had left behind. The same scan is available here and is narrow enough to only ever report what it can prove: a `.split('\n')` in `src/editor/` followed by a `.trim` on the mapped line, outside `field-lines.ts` itself. **Not added in the pass that found it** because two of the three original copies were merged into `line-list-field.ts` in that same pass, so the scan would currently match nothing and be a check with no case — which is the vacuous pass §10 forbids, and the argument for writing it *with* the fourth field rather than before it. **Waiting on:** a fourth field of this kind, or a second inline spelling appearing anywhere in `src/editor/`. |
| One editor field module still has no test file, under a rule that now says it should | `editor/function-library-field.ts` | **This row replaces the one that said the exception's boundary was undecided, and the decision is the part that has been taken.** §10's second exception rests on "each says so in its own header", and the roster did not match: `trigger-list-field.ts`, `reset-field.ts` and `list-fields.ts` had their own files while `function-library-field.ts` — same shape, same entry point, extracted in the same pass as the trigger list — did not, with nothing distinguishing them. So an author adding a field module had to guess, and three did: the item-modifiers pass guessed "own file" and was right by luck, and the modifier-definitions pass guessed the other way. **The rule, now settled:** a module in `editor/` with its own entry point *and* its own reportable output earns a test file; the five true fixtures — `accepts-children.ts`, `component-name.ts`, `copyable-name.ts`, `field-commit.ts`, `form-group.ts` — have neither, being reached only by pressing something the editor drew, and stay under §10's exception. **`modifier-definitions-field.ts` was brought into line in the pass that settled it**, and the cases it holds moved out of `layout-editor.test.ts` rather than being copied into both, which is what the rule is worth: the field's own report, count, empty state, write rules and refusals are the module's, and the pane keeps only the seam. What is left is one module the rule now names: the function library has an entry point and a problem report of its own and no file. **Waiting on:** `function-library-field.test.ts`, which is a diff of its own and no longer a decision. |
| A shared vocabulary's member is computed and its value discarded | `components/stored-flag.ts`, `components/table.ts`, `components/track.ts` | `flagReading` says what a two-state control is called — "Yes" or "No" — and nothing a reader or a listener can reach ever carries the answer. Table computes `nameOf(current)` for a toggle and then takes neither branch that uses it: `aria-pressed` carries the state, `aria-label` is the field's own name, and `title` is removed, because a tooltip repeating what is already legible is noise fired at every pass. Track guards both its call sites on `named`, and `reading` returns `stepLabel` whenever `named` is true, so the flag branch is only ever taken to be thrown away. Measured, not read: inverting the function passes all 1370 tests while making it throw fails, which is the signature of a live call site with a dead result. §10's condition cannot be met by a test here — there is nothing to assert — so this is not a coverage gap but a policy with no application, and §1's "share the application, not the number" is the rule it fails. **Waiting on:** a decision that is the spec's rather than a reviewer's. Either an unnamed two-state control should announce "Yes"/"No" and the two components' comments arguing the opposite are wrong, or it should not and `flagReading` and its three dead branches go. Deleting an export across two components is a diff of its own and ships behaviour either way, which is why it was not taken in the pass that found it. |
| A declared property name is a free string, and nothing checks it against the object the component reads | `types.ts`, `components/card-set.ts`, `components/track.ts`, `components/card.ts` | `entryColumns[n].key` names the property each cell of a two-column list field writes, and it is a `string`. Typo one and the editor stays self-consistent — it writes `nmae` and reads `nmae` back, so the list looks right and round-trips through the layout file — while the component reads `entry.name` and finds nothing. Card's own case fails loudly, because an option with no `value` is already a config error; a Card set entry or a Track row would drop every name in its second column with nothing saying so, which is the class `styles.test.ts` exists for (§10). **The exposure is new, and it is the price of letting each field name its own columns.** While those words were one literal inside the editor, a typo broke all three lists and most of the suite at once; declared per field, it is quiet and local. Two cheaper guards were weighed and both fail: a source scan cannot work, because the two default names are `key` and `name`, so a grep for `.key` in `track.ts` passes on `event.key` and is the vacuous pass §10 forbids; and checking the declaration against `harness/samples.ts` proves only that two hand-written statements of one vocabulary agree, and covers nothing for a component nobody sampled — nothing requires a sample per component. **The fix is a type**, which is what §1 asks for wherever one can carry the guard: `ConfigFieldSpec` generic over the component's own config, so a column's `key` is `keyof` the list's element type and a typo does not compile. That is worth as much for `field.key` itself as for this member, so it is a change of its own rather than a patch here. **A sibling instance was closed since, and the shape it used is the evidence this row wants.** `GRID_POSITION_KEYS` is derived from a `satisfies Record<keyof GridPosition, number>` rather than declared as `readonly (keyof GridPosition)[]`, because the obvious spelling only rejects a typo: a four-element array satisfies it while the type holds five keys, so the fifth is skipped by the parser and absent from the form with nothing saying so. The `Record` does not compile until every key is named — measured, not assumed: adding an optional fifth key to `GridPosition` fails in `types.ts`. Read that as the warning for this row too, since `keyof` alone is what it currently asks for. **Waiting on:** `configFields` typed against `TConfig`, or a third member of this class arriving first. |
| The two-state ring's ARIA wiring is spelled in both components that draw one | `components/table.ts`, `components/track.ts` | Three lines apiece: `aria-pressed` carries the state, the accessible name is the field's own, and only a named level earns a `title`. The painter, the stored spellings and the "Yes"/"No" reading are all extracted, so what is left is each component's own naming — a cell names its column and row, a card names its label — and generalising it means a control module parameterised over both, which §1 refuses on two consumers. `contract.test.ts` holds the half that would actually cost something, that a second implementor draws through `paintLevelRing` rather than a lookalike. The row exists because that guard checks the *painter* and not the ARIA, so if the two ever disagree about what a two-state control announces, nothing says so. **Waiting on:** a third two-state control, which is where §1 extracts. |
| The reorder and remove controls of a list field are spelled twice in one file | `editor/list-fields.ts` | `addControls` draws them for a Table's rows and its columns; `renderEntriesEditor` draws its own, and the two are the same behaviour — a drop target, a mobile pair of arrows, a desktop drag handle with arrow keys, a remove. **The difference is what a screen reader says**, which is why the move that brought them into one file did not merge them: the entry list's buttons are named "Move up", "Move down", "Remove entry" and "Reorder: drag, or press the arrow keys", where a row's and a column's name the item they act on — "Move Strength up" — and `addControls` also asks before removing an entry carrying a hand-written formula, which the entry list never does. Sharing them would change three accessible names and add a confirmation, which is a decision about the interface rather than about where code lives, and the pass that made the duplication visible was a refactor forbidden from changing either. §1's ladder is what it fails: two consumers of one behaviour are allowed only under a test driving both copies over the same cases, and these are driven over different cases — and until `renderEntriesEditor` gained a direct driver in `list-fields.test.ts`, from different files as well: the shared pair from there and the entry list only through the pane. Both copies are now pressed side by side in one file, which is what a decision on the names would have to change, but the cases are still not the same ones and neither copy is held to the other. **Waiting on:** a decision on the accessible names. If an entry's controls should name the entry, the two collapse into `addControls` and the row goes; if they should not, the two are deliberately different and the row is replaced by a guard test over the names themselves. |
