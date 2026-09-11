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
`components/typed-value.ts` holds what a typed value stored as text means before any
formula runs, on the strength of Table and Record set, because the first of its three
rules decides what `sum(spells, Level)` and `sum(inventory, Weight)` are adding up —
two copies disagreeing means one component's blank numeric field counts as zero and
the other's does not, in arithmetic a reader cannot see;
`interaction/arm-to-confirm.ts` holds the arm-then-commit gesture on the strength of
the same two, and it is the one entry here extracted because the *two-consumer rung
was not available*: §1 allows duplication at two only under a test driving both
copies, and each component's suite drove its own copy over its own gesture. Every
line of it is a rule with a reason and three of those reasons are invisible in
review — the outside press is in capture so a swallowed press still counts, the
listener survives being orphaned by a rebuild, and the control stands itself down
before the write rather than leaving a listener alive on a row that is going. Its two
*sentences* have a third consumer, the modifier form's **Remove**, whose armed state
is the panel's and so cannot take the gesture;
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
  interaction/     gesture vocabulary shared by every control, and the words a
                   gesture says where the words are the only channel it has
  components/      one file per component, plus the painters they share. No
                   component imports a sibling component [checked]
  editor/          the layout editor and its field widgets. Knows nothing
                   about a leaf: it renders into an element it is handed
  styles/          the stylesheet, split by area; styles.css is assembled
                   from these at build time and is not edited directly
  view/            sheet view, layout editor pane, auto-open, reset flow
  ui/              generic building blocks that know nothing of components
  starters/        the layouts the plugin ships and the flow that installs one.
                   The sources are real layout files, inlined into main.js at
                   build time; the catalog beside them imports nothing from
                   obsidian, and only the picker does
  test/            scaffolding only: the stub, the fixtures, the gestures a
                   test presses a control with, and the assertions two of them
                   share. No test case *about another module* (one exception,
                   below)
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

The allowlist has since gained no name, and the sibling list has gained three:
`components/modifier-form.ts`, the markup of that form; `components/effective-value.ts`;
and `components/typed-value.ts`, which is what a typed value stored as text means
before any formula runs. The last two are on it for **reuse** rather than atomicity,
which is the distinction the entry below turns on — and `typed-value.ts` is the one
that shows the boundary working rather than merely permitting: extraction was refused
once in review on the grounds that §2 reserves the allowlist edit and that
`column-types.ts` holds a vocabulary and no behaviour, and both halves of that were
right about the *destination* and wrong about the conclusion. §2 says the edit **is**
the decision, and §1 says extraction goes to a module named for the behaviour — which
is a new file, not the vocabulary.

**`modifier-form.ts` is the one on the list for atomicity and not for reuse, and
the difference is the whole of why its entry is worth reading.** It arrived with
exactly one consumer — Table — where `card-face.ts`, `linked-text.ts` and
`level-ring.ts` had three each and `modifier-breakdown.ts` five. §1 is explicit
that one consumer earns no generalisation, so "shared" is not what admitted it:
`table.ts` was 2450 lines and drawing a six-field form is a second job in a file
whose job is a table, which is the Pool engine's precedent above — *atomicity is
what forced the split, not reuse*.

**And the second consumer has since arrived, which closes what that entry was
waiting for.** Record set's `modifier` field imports `renderModifierForm` and
opens the same panel, and the form's options did not change to admit it — its own
header's claim, that it knows the shape of a modifier and none of its meaning, is
what made a second consumer cost nothing. So the entry stands as the record of an
atomicity argument that was later vindicated by reuse, which is the order §1
prefers: the split was right before the evidence existed, and the evidence is not
what justified it.

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
and by the harness through one function rather than two; `spoken-order.ts` is
one assertion Pool and Image both make, which went there on §1's one-step tier
because it is a policy and two copies could only be tested for still agreeing.

**One test file lives here, and it is the only one that may.**
`obsidian-stub.test.ts` drives the double option by option. The rule above is
"never a test case", and what that rule protects is this folder not becoming a
home for *other* modules' tests — shared infrastructure staying infrastructure.
A test of the stub itself is the one thing that cannot pull another module's
tests in here, and §10 wants a module's test beside it, so the two rules point
the same way for this file and no other.

It earns the exception rather than merely fitting through it. A stub option that
is declared and not honoured fails silently in the one direction that matters:
the app honours the key, the double ignores it, and the tests and the harness
both go green on markup Obsidian would have built differently. That is §10's own
standard for when a guard earns its place, and there is nowhere else to put it —
the module is here by §2, and a test for it anywhere else would be the mirror
`tests/` tree this section rejects.

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
   `configName`, `sample`, `read`, `scopeValues`, `scopeRows`, `scopeModifiers`,
   `write`, `hasBuffer`, `resetColumns`, `applyReset`, `render`.
   Contract first, then the data path in the order it runs, then rendering last
   because it is the longest. `showsOneChild` sits beside `storage` because it is
   the same kind of fact: what this component is structurally, before anything
   about its data or its drawing. `palette` follows `configFields` because it
   reads in that order — here are the settings, and here is one of them filled in
   for a job; `configName` follows `palette` because it is the same job read the
   other way, one offering a configuration under a name and the other naming a
   configuration. `sample` sits directly before `read` because it is the
   body `read` is handed: the data path's own first step, in the one context
   where there is no note. `scopeRows` sits beside `scopeValues` because it
   is the same job read the other way: one publishes the component's names, the
   other the rows that have none. `scopeModifiers` sits beside both because it is
   the same job read a third way — the changes this component declares against
   names that are not its own (`SPEC` §5) — and it goes last of the three because
   the other two are about what this component holds and it is about what it does
   to somebody else's number. `resetColumns` sits beside `hasBuffer` for the reason
   `hasBuffer` sits where it does: both are declarations the layout editor reads to
   decide what a reset binding may say, and a declaration comes before the
   behaviour it conditions.

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
    container.replaceChildren();
    // config guard, then build
}
```

`const doc = container.ownerDocument` was part of this opening while every
element came from `doc.createElement`. It is not any more: code that builds
through `container.createDiv(...)` never names a document, and seven such
declarations went in the sweep below — three from `render` implementations and
four from the painters and helpers beside them. Take one only where something
still wants it.

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
- **Build with Obsidian's element helpers** [warned:
  `obsidianmd/prefer-create-el`]: `parent.createDiv('sheetsmith-x')`,
  `parent.createSpan(...)`, `parent.createEl('input', { cls, placeholder })`.
  Every class is prefixed `sheetsmith-` [judgement], and a name that is not is
  enumerated in `styles.test.ts`'s borrowed list rather than waved through.

  This bullet used to say the opposite — build with `doc.createElement` and
  `classList.add`, with the rule off across four folders so components stayed
  testable under happy-dom — and **the reason it gave had stopped being true
  long before it was rewritten**. The helpers are prototype methods the app
  installs, and `src/test/obsidian-stub.ts` installs the same ones, so vitest and
  the harness have had them for as long as the stub has. Ninety-four sites moved
  onto them with all 73 harness shots byte-identical. Worth keeping as the
  example of the failure this file is most prone to: an exemption whose
  justification expires silently, because nothing re-reads a comment in a config.

  **Where an element is attached later than it is created, use the global
  `createEl`, `createDiv` or `createSpan`** — the ones `obsidian.d.ts` declares
  beside the `Node` methods. They return an element with no parent, and the
  prototype helper is that same function with `parent` set to the receiver:
  the app's own `enhance.js` reads `Node.prototype.createEl = function (t, e, n)
  { (e ||= {}).parent = this; return createEl(t, e, n) }`. So the detached form
  is the primitive and attaching on creation is the special case.

  **This bullet used to say the opposite, twice over.** Before the sweep it said
  build with `doc.createElement`; after the sweep it said "`createEl` attaches
  on creation, and that is the whole of what it cannot do", and listed nine
  sites under three kinds of exemption — out of the helper's reach, reachable at
  a price, a design choice. All three kinds were one mistake: a property of the
  *prototype method* stated as a property of the API. Every one of the nine
  wanted exactly what the global form gives, and all nine are gone.

  It survived two rewrites of this bullet because nothing here could have caught
  it. `src/test/obsidian-stub.ts` had never installed the three globals, so no
  test and no harness render could call them, and the claim was true of
  everything any instrument in this repository could see. That is the failure
  the sweep note above is kept as an example of, one level deeper: not an
  exemption whose justification expired, but one whose justification was never
  checked against the API it was about. It took an external linter to ask.

  There are now **no hand-built elements** in `components/`, `ui/`,
  `interaction/` or `view/`, no per-file exemption in `eslint.config.mts`, and
  `src/create-element-sites.test.ts` holds that population at empty rather than
  at nine. A site that needs `createElement` again owes an argument none of the
  three retired kinds covers.

  **A hidden element's position is reading order**, so the harness cannot check
  it: a shot is byte-identical whether an `sr-only` region sits first or last.
  `src/test/spoken-order.ts` holds the rule; Pool and Image each assert it.

  **That guard exists because the rule was broken and shipped in the same diff
  that wrote it down.** The sweep made Image's live region the first child of its
  box instead of the last, so a reader met "Portrait saved" before the field it
  was about. Three instruments were watching and none could see it: the scan
  classifying the sweep looked for siblings reaching the parent *by name* and
  could not see through `renderPictureFrame(box, …)`, the component's tests
  asserted no order, and all 73 shots stayed byte-identical. Worth keeping as the
  example, because the lesson is not "be careful" — it is that a claim no
  instrument can falsify needs an instrument built for it before the claim is
  worth making.

  Note `obsidianmd/prefer-create-el` suggests `doc.win.createDiv()` rather than
  the parent form, and that suggestion does not compile: `Window` declares no
  such method in the current typings. Read the report as "stop calling
  `createElement` here", never as a fix to apply.
- **A style belongs in the stylesheet; an element's own `style` carries only what
  a class cannot** [judgement]. Two things qualify and nothing else does:
  **runtime geometry, through `setCssStyles()`**, and **a `--sheetsmith-*` value
  the stylesheet then reads, through `style.setProperty`**. Never a bare
  `.style.x =`. Obsidian's review guidelines ask for classes and name
  `setCssStyles`/`setCssProps` as the sanctioned exception.

  **Each route owns its own clear, and the two differ because they have to.** A
  custom property is cleared with `style.removeProperty`, which is the only route
  there: `setCssStyles` takes a `Partial<CSSStyleDeclaration>`, a `--sheetsmith-*`
  name is not a key of that type (TS2353), and it would not survive the helper's
  runtime `Object.assign` either, landing as a plain JS property with the
  declaration left empty. A standard property is cleared the way it was set, with
  an empty string. So `pool.ts` and `level-ring.ts` clearing a custom property
  through `removeProperty` and `track.ts` clearing `transform` through
  `setCssStyles({ transform: '' })` are not two spellings of one thing to be
  reconciled: there is one clearing spelling per axis and nothing to drift on.

  **Why `setProperty` rather than `setCssProps`** for the custom-property half:
  that is how the eighteen `--sheetsmith-*` writes already here are spelled, and
  one name beats a second name meaning the same thing. It is also why the stub
  installs `setCssStyles` and not `setCssProps`.

  **No guard test, deliberately.** A scan for the forbidden spelling matches
  nothing today, every site that had it having been converted, and a check that
  can only pass vacuously is what §10 forbids. This one is held in review, which
  is what [judgement] means.
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
- **Declaring `resetColumns` obliges `applyReset`** [checked]. The editor draws its
  picker from the first and the trigger writes through the second, so a component
  declaring only the first offers an author a column to bind and then passes over
  the binding when the button is pressed — the rule above one step over, and the
  same dead control with nothing to say so.
- **Declaring `applyReset` on a component whose parts have names obliges
  `resetColumns`** [judgement]. Not checked, and the reason is what the tier is for:
  nothing outside a component can tell whether its parts have names, which is the
  whole reason the member exists. A component that resets as one value — a Pool, a
  Track, a Record set — correctly declares neither, so the check would have to
  distinguish the two cases by knowing the thing it exists to avoid knowing. What
  goes wrong without it is quiet rather than loud: the binding acts on the whole
  component where the author meant one part of it.

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
  `src/interaction/` is the first: `scrub.ts`, `hold-repeat.ts`, `editable.ts` and
  `arm-to-confirm.ts` have none of their own and should not grow one. A gesture is only meaningfully
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
- **A module in `editor/` with its own entry point *and* its own reportable
  output earns a test file** [judgement]. That is the boundary of the exception
  above: the five modules reached only by pressing something the editor drew —
  `accepts-children.ts`, `component-name.ts`, `copyable-name.ts`,
  `field-commit.ts`, `form-group.ts` — stay under it.

  **The conjunction is what holds them there, and it is not "neither" any
  more.** This bullet said all five had neither half, and `copyable-name.ts`
  stopped being one of those the moment it grew a rule about *which string goes
  where*: the visible text, a `title` that adds to it, and an accessible name
  composed from what is shown rather than from what is copied, so that a
  control's own text is always contained in its name
  (`docs/UI.md` §6). That is a reportable output. What it still has no half of is
  an entry point: it is reached only by rendering something the editor drew, and
  `published-names.test.ts` asserts all three strings over the one case where
  shown and copied differ. Worth correcting rather than leaving, because "have
  neither" is the sentence a reader would check a sixth module against.
- **Duplication between components requires a test that drives both** (§1).

---

## 11. Conformance backlog

Where the code does not yet match this file. The rows moved to
`docs/BACKLOG.md` § Patterns; that file holds this backlog and `docs/UI.md`
§12's, a section each. This heading stays because dozens of source comments cite
it as an address. Read and write the rows there. They are findings, not licences:
new code follows the patterns above.

**One rule left this section upwards rather than sideways**, and five comments
still cite §11 for it: which module in `editor/` earns a test file was settled
here and now states itself in §10, at the exception it is the boundary of. A
comment saying "§11 settled" is a claim about where the argument happened, which
is still true; the rule itself is above.
