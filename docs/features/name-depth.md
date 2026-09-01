# Name depth

Status: shipped
Board card: How deep a published name may go, and what a Track's rows publish
across themselves (SPEC §13).

## Model question

Yes — this is entirely a §13 question, and the entry is explicit about the
gap: a Track's row set publishes `slots.L1` (via `<id>.<key>`), and its
ceiling "would be `slots.L1.count`, one segment past what `<id>.<name>`
reaches." `isName` refuses a dot in a published key on purpose, "because a
third segment collides with the `.value` every entry already answers to," and
the entry says the aggregate work already shipped ("the resolved entry below
settles it") did *not* need this depth, leaving "how many slots are left"
unwritable and, in its own words, "the first formula a slot card invites."

The owner settled the shape of the answer before this spec was written,
narrowly and in one session: a second reserved suffix, `.left`, structurally
parallel to `.value`. That is the model decision this document records rather
than argues for. What follows is what had to be checked to confirm the
settled shape actually fits the code, and the four things left for this spec
to decide: which entries opt in, whether a flag opts in, what an unresolved
count publishes, and where the decision gets written down.

**Whether a component may grow a third segment, in general.** No — and this
is the distinction the whole feature rests on. §13 frames the danger as
opening a namespace any component could grow a third segment into, colliding
with `.value`. `.left` does not do that. It is not a general third-segment
mechanism; it is one more hardcoded suffix, exactly as `.value` itself is
hardcoded rather than declared. `mod.` is the existing precedent for this
shape at the *sheet* level — `modifierSlot(name)` in
`src/formula/modifiers.ts` is bare string concatenation, `` `${MODIFIER_NAMESPACE}.${name}` ``,
registered for every published name by `buildSheetScope`'s own loop in
`src/formula/sheet.ts` (around line 705) with zero involvement from `isName`,
because `isName` is never asked about a constructed key — only about the one
segment (a component id, a column key, a row key) a human typed into the
editor. `.left` is the same shape read one level down: not a namespace
covering the whole published-name set the way `mod.` does, but a suffix
`sheet.ts`'s `register()` closure adds beside `.value`, gated on whether the
one `ScopeEntry` being registered opted in. §13's own worry — "nothing yet
needs [partitioning that suffix namespace] badly enough to answer it" — is
answered by not partitioning anything: there is no namespace, there are two
hardcoded suffixes now instead of one, and a component that never sets `left`
on an entry costs nothing and changes nothing.

**Whether `isName` needs to change.** No, and this was asked to be verified
rather than assumed, so it was checked at every call site rather than taken
on the strength of the reasoning above. `isName` (`src/formula/expression.ts:134`)
is documented as validating "one segment, not a dotted path," and every
caller in the tree confirms it is asked about exactly that:

- `src/parse/layout.ts:459` and `:480` — `isName(c.id)` / `isName(component.id)`,
  validating a component's own `id` before it becomes usable as a formula
  name (and before the `mod` reservation check runs beside it).
- `src/components/table.ts:709` — `isName(key)` on a column's own `key`,
  gating whether `total` may publish it as `<id>.<key>`.
- `src/components/table.ts:776` — `isName(key)` on a declared row's own
  `key`, gating whether `publish` may publish it as `<id>.<key>`.
- `src/editor/list-fields.ts:301`, `:448` and `:483` — `isName(next)` /
  `isName(row.key)` on a row value's name and a row's key, as the layout
  editor's own list-field widgets validate what a user just typed.

Every one of the seven call sites hands `isName` a single segment of text
that a human is naming — never a constructed, already-dotted key like
`slots.L1` or `slots.L1.left`. That is exactly the shape `mod.armour_class`
already has today: nothing calls `isName('mod.armour_class')`, because the
`mod.` slot is assembled and registered by `sheet.ts` after every name that
composes it has already been validated on its own. `.left` composes the same
way — `` `${name}.left` `` is built inside `register()`, from a `name` that
was itself built from an already-validated `id` and an already-validated row
`key` — so it never reaches `isName` either. **This claim held under
inspection and needed no correction**; there is no call site that would choke
on a `.left`-suffixed name reaching it, so the "small mechanism change" scope
stands as stated: `types.ts` and `sheet.ts` change, `expression.ts` does not.

**What it publishes, and what it does not.** `.left` publishes a number —
`count - filled`, unclamped — never a value a formula could store back. It
adds no new stored data: nothing about the character note changes, so
Constraint 3 (byte-identical round trip) is untouched by construction, and
Constraint 4 (a layout change never deletes character data) does not engage
because no data path changes at all. This is a read-only formula-surface
addition exactly as `mod.` was: a slot, or here a suffix, computed from
things the sheet already holds.

## Where `.left` lands, and where it does not

The mechanism (`ScopeEntry` gaining an optional field) is generic — nothing
stops any component's `scopeValues` from setting it on any entry it returns.
What decides where it actually appears is argued per case below, from the
existing code and the existing published-name surface, not from a general
preference.

**Track's row-set entries opt in. Track's single-run (non-row-set) entries do
not, and neither does a flag.** The tempting argument for symmetry is that
`track.ts`'s `scopeValues` already builds both the row-set and the single-run
`ScopeEntry` through one `run(key)` closure — `{ value: data?.values[key],
compute: () => filled(key) }` — so treating them alike looks like the
uniform choice. It is not, and the reason is what each case can already say
without `.left`.

A row's ceiling has nowhere to publish today. `runsOf` and `scopeValues`
publish a row-set entry under `<id>.<key>` — `slots.L1` — which is already
the second dot-segment `<id>.<name>` reaches. A third segment is the only way
to reach further, and that is precisely the gap §13 names. A bare, non-row-set
run is a different shape: its *own* id is the first segment (`exhaustion`,
not `exhaustion.something`), so its ceiling fits at the second segment with
room to spare — and it is already there. `scopeValues`'s non-row-set branch
sets `named.count`, published as `<id>.count` (`exhaustion.count`), either as
a literal (`config.levels !== undefined`) or as a lazily-evaluated `display`
naming the `count` formula field. So "how many segments are left on this
plain track" is already expressible today, with no new mechanism at all:
`exhaustion.count - exhaustion`. Reaching for `.left` there would be a second
spelling of an equation a formula can already write, bought at the cost of a
second thing to keep in step with the first — the exact "authored fact
disagreeing with a number" shape §13's own Resolved entry on flag cards
refuses for a different reason (`count: 1` beside a `levels` flag). Giving
`.left` to the row-set branch and not the self branch is therefore not an
arbitrary carve-out papered over the `run()` closure's symmetry; it is the
direct, code-shape consequence of which case already has a two-segment
address for its ceiling and which does not. It also costs nothing extra in
the implementation: `scopeValues`'s row-set and non-row-set branches already
diverge on whether `named.count` is set at all (only the non-row-set branch
sets it), so adding `left` only where the row-set branch already diverges is
continuing an existing split rather than opening a new one.

A flag card does not opt in, and the one-sentence reason the task asked for:
a flag has exactly two states and no run of marks to be behind them, so
`1 - filled` on a flag is not "how many segments are left" but "is this still
unchecked," which is already spelled `!value` — publishing a second name for
the negation of the one already published would be the same "authored fact
disagreeing with an authored fact" shape SPEC's flag-card entry already
refuses for `count: 1` beside `levels`, applied to a formula-surface name
instead of a config key. `isFlagCard` already governs an early return in
`scopeValues` with a different `ScopeEntry` shape (`{ value: boolean }`, no
`compute`); `.left` follows that branch's existing exclusion rather than
adding a second condition beside it.

**The arithmetic, restated precisely, and where it fails.** For a row-set
entry that is not a flag, `.left` is `count - filled`, where `filled` is the
same `Math.floor(held / marks)` the bare `<id>.<key>` entry already computes,
and `count` is the row's own resolved ceiling — `row.count` if the row
declares one, falling back to the component's `count`, exactly the
`countFor` helper `render` and `applyReset` already share (`track.ts`
`countFor`, called from `render` with `context.resolveField` /
`context.resolved['count']` and from `applyReset` with a resolver closed over
`context.resolve`). `.left`'s own resolver is the one `scopeValues`'s
`compute` member already receives lazily from `register()` — `resolve ??
(() => null)` — so no new resolver plumbing is needed; `countFor` is called
with that same resolver and `resolve('count', {})` as the shared fallback,
identically in shape to how `render` and `applyReset` already call it.

Two ways this can fail to resolve, both already named by SPEC §5's blanket
rule ("a name that will not resolve publishes nothing"), and both already
have a concrete failure path in `track.ts` to point at:

- **The count does not resolve.** `segmentCount` already returns `null` for
  an unresolved or non-positive formula — the same `null` `render` turns into
  a `?` on the card. `.left` treats that `null` the same way `render` does:
  it cannot say how many are left of an unknown number, so it publishes
  nothing.
- **The stored value does not resolve.** `filled(key)` already returns
  `undefined` for a blank or unreadable entry — a declared row a character
  has not touched yet, on a fresh sheet. `.left` cannot say how many are left
  of an unknown fill either, so it publishes nothing there too, on exactly
  the same rule.

**Unclamped, deliberately.** `count - filled` is not floored at zero. The
task's brief states the arithmetic as fixed ("The arithmetic is always
`count - filled`, regardless of `sense`"), and there is a second reason to
take that literally rather than adding a floor of taste: the bare
`<id>.<key>` entry Track already publishes is itself unclamped — a run marked
past its own ceiling (SPEC §7's "a stored value outside the run is rendered,
not corrected") still publishes its true filled-segment count above `count`,
and a formula reading `slots.L1` on an overfull row already sees a number
larger than `slots.L1.count`. A floor on `.left` alone would make the two
suffixes disagree about the same overfull row — `.left` reporting zero while
`slots.L1` and `slots.L1.count` together imply a negative one — which is
exactly the kind of two-spellings-of-one-fact drift PATTERNS §1 warns about
one level up, applied here to two suffixes of one entry rather than two
copies of one module.

**`sense` is inert on `.left`, as settled and for the reason already on
record.** SPEC's flag-card entry already states `sense` is "inert on a flag"
because a run of one is its own last segment; the parallel statement for
`.left` is that harm-graded colour is a rendering concern Track's `render`
function alone owns (`cardHarm`, the `sheetsmith-track-harm` class, the
per-segment `--sheetsmith-track-grade` custom property), and none of that
reaches `scopeValues` at all today — `scopeValues` does not read `config.sense`
anywhere in the current source, for any branch. `.left` continues not
reading it, which costs nothing to state as a rule because there was never
anything wired up to accidentally read.

## What it does not do

No card renders `.left`. No component's `render` function changes — Track's
included; the settled scope explicitly rules out any Spellbook card, palette
entry, or other consumer, and this feature stops at making the name
resolvable. No config field is added anywhere; a layout author does nothing
differently to get `.left` published for their row-set Track — it appears
the moment the row exists, the same way `.value` appears the moment any
`ScopeEntry` exists. No new failure text is added to any component's error
surface, since `.left` fails the same way every other unresolved name in the
formula language already fails: the *reading* component's own formula shows
its usual unresolved state, on whatever card is reading `slots.L1.left`
rather than on Track's own card, which never mentions the name it publishes.

## Design

There is no interface to design. This feature has no render path, no
interaction, no empty state and no error state of its own — those all belong
to whatever component later writes a formula reading `slots.L1.left`, which
is out of scope here by the brief's own instruction. What exists instead is
a name in the formula language, and its behaviour is fully specified by the
arithmetic and the two resolution failures above, both already governed by
existing SPEC §5 rules rather than by anything this feature invents.

## Config fields

None. No `ComponentConfig` gains a field, and no `configFields` entry is
added to Track or to any other component. The only surface this feature adds
is an optional member on the internal `ScopeEntry` type
(`src/types.ts`), which a layout author never sees or configures — it is
set by `track.ts`'s own `scopeValues`, unconditionally for a numeric row-set
entry, the same way `compute` already is.

## Data and file model

Nothing is stored. `.left` is derived entirely from data Track already reads
(`TrackData.values`) and configuration Track already resolves (`count`,
`rows[].count`) — no new fenced key, no new column, no new note vocabulary.
Constraint 3 (byte-identical round trip) is not reachable by this feature,
since `read` and `write` are untouched. Constraint 4 (a layout change never
deletes character data) is likewise not reachable, since no write path
changes. Existing character notes are unaffected in every sense: opening one
on a layout that now happens to compute `.left` for some row changes nothing
about what that note contains or how it reads.

## The mechanism, precisely

**`src/types.ts`.** `ScopeEntry` (declared beside `ScopeEntrySource`, around
line 378) gains one new optional member, sitting outside the existing
`display`/`compute` exclusive union rather than inside it — `.left` is not a
third alternative source for what a name is worth; it can coexist with either
`display` or `compute` on the same entry, or with neither, the way `value`
already can. Its shape mirrors `compute`'s: a function of the same
lazily-supplied `FieldResolver`, because a row's ceiling is exactly the same
kind of thing `compute`'s own doc comment already names as a `compute`'s
reason to exist — arithmetic over a config field no formula on the sheet can
see (there, "dividing the marks by the marks a segment holds"; here,
subtracting one resolved formula field from a computed value). It returns
`number | undefined` rather than the general `FieldValue`, because "how many
are left" is definitionally a count, never a string or boolean — a narrower
return type than `compute`'s own, stating a fact about `.left` specifically
rather than following `compute`'s shape out of laziness.

**`src/formula/sheet.ts`.** `buildSheetScope`'s `register()` closure (around
line 642) already registers `` `${name}.value` `` unconditionally, ahead of
the `display`/`compute` branch. Immediately after that branch runs — so both
the `<name>` thunk and the `<name>.value` thunk exist regardless — `register()`
checks whether the entry it was just handed carries a `left`, and if it does,
registers `` `${name}.left` `` as a third thunk, calling `entry.left(resolve ??
(() => null))` exactly as the `compute` branch already calls `compute` with
that same expression, and publishing nothing (no value, so the name resolves
to `undefined`) wherever `left()` itself returns `undefined` — the same
`worth()` helper already guarding `compute`'s and `display`'s results guards
this one. No other part of `buildSheetScope` changes: the `mod.` slot pass
below `register()`'s loop (around line 705) walks `published`, the list of
bare and `<id>.<name>` names `register()` pushed onto — `.left`-suffixed
names are never pushed there, so `mod.slots.L1.left` is never a thing and was
never asked to be.

**`src/components/track.ts`.** `scopeValues`'s row-set branch (the `if
(isRowSet(config))` block inside the non-flag path, around line 693) gains a
`left` function per row, alongside the existing `value` and `compute` the
shared `run(key)` closure already builds — in practice this likely means the
row-set branch stops reusing the bare `run(key)` helper for its `left`-carrying
entries and instead builds each row's entry with the row and its index in
hand (`countFor` needs both), while the non-row-set branch below keeps using
`run(key)` exactly as it does today, undisturbed. The flag branch (the `if
(flag)` block above it) is untouched.

## Where SPEC.md changes at land time

Not performed here — `/land-it`'s `Resolved:` paragraph is the only thing
that edits `docs/SPEC.md`, and this section states what that edit will need
to cover rather than writing it.

**§5 gains a bullet.** `.value` is documented there as the one universal
reserved suffix, in the paragraph beginning "A bare name gives what the card
shows, not what the note stores." `.left` needs a short bullet of its own,
immediately after or beside it, stating: a second reserved suffix exists,
`<name>.left`, published only where the entry publishing `<name>` opts in
(unlike `.value`, which every entry gets unconditionally); what it means —
"how many of a ceiling remain," `count - filled`, unclamped; and that it
currently has exactly one publisher (Track's row sets) without being
Track-specific machinery, the same way `mod.` is documented at the general
level in §5 despite (at the time it shipped) having a small set of concrete
producers and readers.

**§4.2's Track entry gains a sentence.** The row-set paragraph currently
reads "A row set publishes per row (`slots.L1`) on §5's rule for a component
holding several values; a row's own ceiling is a third level of name and is
§13's question rather than a claim made here." That sentence is what this
feature resolves, and the resolution belongs right there: a row-set entry
also publishes `slots.L1.left`, `count - filled` for that row, publishing
nothing where either half fails to resolve — and a plain (non-row-set) run
does not, because its ceiling is already reachable at `<id>.count`.

**§13 loses this entry, replaced by a `Resolved:` paragraph** carrying the
argument this document makes: the second-reserved-suffix shape, why it is
row-set-only, why a flag is excluded, and the unclamped arithmetic — in the
prose style every other `Resolved:` entry in §13 already uses, including
naming what stays closed (a general third-segment mechanism; a Spellbook
card or any other consumer of `.left`, which remain unbuilt and unblocked
work rather than something this entry claims to deliver).

## Acceptance criteria

- [x] `ScopeEntry` in `src/types.ts` declares an optional `left?: (resolve: FieldResolver) => number | undefined`, doc-commented in the file's existing voice (why it exists, why it is optional, how it differs from `compute`'s return type and from `.value`'s unconditional registration).
- [x] `src/formula/sheet.ts`'s `register()` closure registers `` `${name}.left` `` whenever the `ScopeEntry` it is handling carries a `left`, calling it with the same resolver `compute` receives, and the thunk publishes nothing where `left()` returns `undefined` — mirrored by a new `describe` block in `sheet.test.ts`, parallel to the existing "a value only the component can produce" block, using a synthetic `PublishedComponent` fixture (no Track involved) that asserts: the suffixed name resolves when `left()` returns a number; it is absent (`undefined`) when `left()` returns `undefined`, while `.value` on the same entry stays reachable; and `left()` is handed a resolver bound to the finished sheet, by a fixture reading a second, later-registered component through it (the same proof `sheet.test.ts:126`'s existing `compute` test already gives for `compute`).
- [x] No change lands in `src/formula/expression.ts`. `isName`'s seven call sites (`src/parse/layout.ts:459,480`; `src/components/table.ts:709,776`; `src/editor/list-fields.ts:301,448,483`) are unmodified, and none of them is ever handed a `.left`-suffixed key.
- [x] `track.ts`'s `scopeValues`, for a row-set (`isRowSet(config)`), non-flag entry, publishes `<id>.<row-key>.left` equal to that row's resolved `count` minus its filled segments — verified against the existing `slots` fixture in `track.test.ts` (`L1` with its own `count: 5`, `L2` with `count: 3`, `L3` falling back to the component's `count: 1`): with `SLOT_BODY` (`L1: 2, L2: 1, L3: 0`) resolved through `buildSheetScope`, `scope('slots.L1.left')` is `3`, `scope('slots.L2.left')` is `2`, `scope('slots.L3.left')` is `1`.
- [x] A row falling back to the component's own `count` (no `row.count` of its own) resolves `.left` against that fallback, exactly as `countFor` already resolves the bare ceiling for `render` and `applyReset` — covering the `L3` case above deliberately, since it is the one row in the fixture with no `count` of its own.
- [x] A row whose own count formula does not resolve (`segmentCount` returns `null`) publishes nothing under `.left` for that row, while every other row's `.left` on the same card keeps resolving — one failing row does not take the others down, per SPEC §5's per-name failure rule.
- [x] A declared row with no stored entry yet (blank or unreadable, `filled` undefined) publishes nothing under `.left` for that row.
- [x] A single (non-row-set) numeric Track's `self` entry carries no `left` member at all — asserted directly against the `ScopeEntry` `scopeValues` returns, not merely indirectly through an unresolvable name, so the test documents that this is a declared exclusion rather than an incidental gap.
- [x] A flag card's entries (row-set or not) carry no `left` member at all, asserted the same direct way.
- [x] `left` is unaffected by `sense`: a `harm`-graded row-set row's `.left` and an otherwise-identical `progress`-graded row's `.left` compute identically for the same stored value and count.
- [x] `src/components/contract.test.ts` passes unmodified — in particular `saysTwoThings` (display-and-compute exclusivity) is unaffected by an entry additionally carrying `left`, confirming the task's own suspicion that the registry contract needs no change for an optional field other components simply do not set.
- [x] `npm test`, `npm run lint` and `npm run build` all pass.
- [x] No edit lands in `docs/SPEC.md` as part of building this feature — the §5, §4.2 and §13 edits described above are `/land-it`'s to make, once this spec's `Status` is `agreed` and the work is judged done.

## Commit boundaries

1. `feat: Publish a second reserved suffix beside .value`. `src/types.ts` (`ScopeEntry` gains `left`) and `src/formula/sheet.ts` (`register()` registers `` `${name}.left` `` where an entry carries one), plus the new `sheet.test.ts` describe block proving the mechanism against a synthetic component — no production component sets `left` yet, exactly as the `mod.` slot's own sheet-level plumbing could in principle have shipped ahead of its first pushing component. This is the commit that answers "does the general mechanism work" independent of Track.
2. `feat: Publish how many of a slot's row are left`. `src/components/track.ts`'s `scopeValues` grows `left` on row-set, non-flag entries, and `track.test.ts` gains the coverage in the acceptance criteria above — the fixture-level proof that `slots.L1.left` now means what SPEC §13 asked for.

## Deliberately not doing

- **No consumer of `.left`.** No Spellbook card, no new palette entry, no
  change to any card's rendering. That is separate, unblocked backlog work
  this feature exists to unblock, not to include.
- **No general "any component may grow a third segment" capability.** `.left`
  is one more hardcoded suffix beside `.value`, not a declared or extensible
  namespace. A future component wanting a name of its own past the second
  segment is a new question, not something this feature's mechanism happens
  to already answer.
- **No change to `mod.` or to `.value`.** Both are read here as precedent
  only. Neither's registration, arithmetic, or documentation changes.
- **No `.left` on a single (non-row-set) Track**, and **none on a flag card**
  of either shape, for the reasons argued above — recorded here too so a
  reviewer does not read either absence as an oversight.
- **No floor at zero on the arithmetic.** `count - filled` may be negative on
  an overfull run, matching the existing unclamped `<id>.<key>` entry it sits
  beside.
- **No SPEC.md edit as part of this feature's own commits.** What the edit
  will say is specified above; writing it is `/land-it`'s job.
