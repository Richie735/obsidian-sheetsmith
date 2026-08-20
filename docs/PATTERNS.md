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
`editable.ts` owns the editing gesture. `stat-card.ts` draws the stat card.

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

**That ladder is written for behaviour. A policy number climbs it in one step.**
Where the duplicated thing is a timing, a bound, or a row count, drift *is* the
entire risk, so the two-consumer guard test costs more than the module and
proves less. It can only assert that two constants are still equal, which is
what one constant says for free. Extract on the second consumer there.
`interaction/commit-window.ts` holds a single `GESTURE_COMMIT` because Pool and
Track had both settled on 700ms in two places nothing kept in step;
`editor/list-field-height.ts` holds the row bounds because the two list fields
had already drifted apart twice, once on `rows` and once on their width; and
`components/column-types.ts` holds the typed-column vocabulary because a
component and the editor field that configures it were each carrying their own
copy of which types exist, which one is the default, and which can be totalled.
All three say so in their headers, which is what a deliberate departure owes.

That last one also shows how to tell the tiers apart. Two copies of a *set* is
the same case as two copies of a number: a guard test could only assert they are
still equal. Where the shared thing can be expressed as a type instead, prefer
that — the editor's labels are a `Record<ColumnType, string>`, so a new column
type does not compile until it has a word, which is a guard nobody has to
remember to run.

Extraction goes to a module named for the behaviour, never to a component. **A
component must never import from another component** [checked], because that
breaks the isolation the whole contract rests on: nothing outside a component
may know that component exists. Shared behaviour lives in a painter beside them
(`stat-card.ts`, `level-ring.ts`), in `interaction/` (`editable.ts`), or in
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
  parse/           note and layout parsing. Imports nothing from obsidian [checked]
  formula/         expression parsing and evaluation. Same rule [checked]
  interaction/     gesture vocabulary shared by every control
  components/      one file per component, plus the painters they share. No
                   component imports a sibling component [checked]
  editor/          the layout editor and its field widgets
  styles/          the stylesheet, split by area; styles.css is assembled
                   from these at build time and is not edited directly
  view/            sheet view, auto-open, reset flow
  ui/              generic building blocks that know nothing of components
  test/            scaffolding only: stubs and fixtures, never test cases
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
crowded because `pool.test.ts` is 2176 lines, and the answer to that is smaller
modules, not a different folder to keep them in.

`src/test/` is the exception and is not a contradiction: it holds scaffolding,
`obsidian-stub.ts`, which is shared infrastructure rather than a test case.

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
   literal. Every optional key carries a doc comment saying what it does *to the
   note or the card*, not what it is.
5. **`XData`**, exported, doc-commented.
6. **Private helpers**: validation, formatting, storage spelling.
7. **`export const x: ComponentDefinition<XConfig, XData>`**, members in this
   order [judgement]:
   `type`, `storage`, `formulaFields`, `configFields`, `read`, `scopeValues`,
   `write`, `hasBuffer`, `applyReset`, `render`.
   Contract first, then the data path in the order it runs, then rendering last
   because it is the longest.

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
  `valueKey()` in `stat.ts`, checked with `'error' in entry`.

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

- `container.ownerDocument`, never the global `document` [judgement]. The view
  may render into a detached or popout window. Held today, with no source file
  outside a comment reaching for the global, but nothing enforces it.
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
- Never redeclare `id`, `type`, `label`, `position`, `reset` [checked]. The
  editor owns those.
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
  name" exactly as readily as "off the sheet, as on a Stat", which would fail
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
- **Duplication between components requires a test that drives both** (§1).

---

## 11. Conformance backlog

Where the code does not yet match this file. These are findings, not licences:
new code follows the patterns above. A row leaves when it is fixed. A backlog
that keeps solved rows stops being read.

| Gap | Where | Fix |
| --- | --- | --- |
| Two responsibilities in one file | `layout-editor.ts` | Deliberately deferred, not overlooked. The split waits for the M4 workspace view, which rewrites this module anyway; splitting it twice would be the waste. It has tests now, so the move will be guarded when it comes. |
| Gesture modules have no test file beside them | `src/interaction/` | `scrub.ts`, `hold-repeat.ts` and `editable.ts` are covered thoroughly, but through `pool.test.ts`, `track.test.ts` and the component tests rather than their own files, against §10's one-test-file-per-module. It may be that §10 is what should change here: a gesture is only meaningfully driven through a control that uses it, and a test file of its own would have to build a fake card first, which is what those component tests already are. Settle it rather than leaving it implicit. |
