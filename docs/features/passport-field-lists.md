# Passport field lists

Status: shipped
Board card: A Passport field can hold several values, drawn as several chips, so
a multiclass character reads "Fighter 1" and "Bladesinger Wizard 4" as two tags
without forking the layout for the one character who needs two.

**Respec note.** This is the second pass. The owner reviewed the first full
build at the land stop — one field revealing its whole raw semicolon-joined text
for editing — and rejected it on two UX grounds: no visual cue that a closed
chip cluster was interactive at all, and editing raw `Fighter 1; Bladesinger
Wizard 4` as one string felt wrong once it was in front of them. That reopened
the settled model's third answer, below. Everything else the owner settled
stands: list-ness is still declared on the field, publishing is still the
stored raw text unchanged, and the storage shape (one fence entry, one line,
`;` the separator) is still Constraint 3's to hold.

**Refinement note.** After the per-part rebuild (both review waves closed) the
owner asked for two changes to the Design section at the land stop, neither
reopening the per-part answer above: the delete control shows only while its
own part has focus rather than always, and a light background tint now marks
each list field's own run of parts (and its add control) as one group, since
uniform spacing alone left nothing to tell two fields' chips apart. Both are
visual/interaction refinements to an already-agreed design, folded in below in
place rather than re-litigated as a new pass.

## Model question

**None of §13's open questions block this, and the reach into one of them is
worth naming so nobody reopens it by accident.**

The small line under a passport's name has already had this argument once: §13
line ~885 asks what a string type in the expression language would unlock, and
`passport.ts`'s own header answers it for the existing line of values — "no
expression is evaluated and nothing is published that a formula could not
already read." A list field changes nothing about that answer. Publishing stays
the stored raw text, unchanged for a list field and a scalar one alike (settled
answer 2, below), so nothing new is compared, concatenated, or handed to a
builtin. The aggregate entry's own resolution — line ~960, "the formula
language aggregates over a component's rows as one builtin call, and gains no
collection value for it" — stays exactly as resolved: a list field is one more
string, and the sheet-side editing mechanism below never turns it into
anything else.

**The three shape questions, settled by the owner across two passes:**

1. List-ness is a property of the field's declaration, not inferred from the
   stored value. Unchanged from the first pass. A field not marked as a list
   behaves exactly as it does today — nothing about parsing changes for it, and
   a value that happens to contain the separator is not auto-split (stated
   explicitly under **Design**, so no reviewer reads the absence of
   auto-split as a bug).
2. Publishing is unchanged: `<id>.<key>` is the stored text, list or not.
   Unchanged from the first pass, and unaffected by which editing mechanism
   produces that stored text.
3. **Replaced.** The first pass read this as "one field holding the whole
   list" — a single `<input>` whose raw, separator-joined text is the thing a
   reader edits, with no interaction at the level of one part. Built, shown to
   the owner, and rejected: a closed cluster gave no visual cue it was
   interactive, and editing the raw joined string, once it existed on screen,
   felt wrong to the person using it — they expected to add and remove one
   value at a time. **The new answer: editing is per part.** Each stored part
   is its own small editable control, always live (no closed/open state to
   discover), with its own delete affordance; a field-level control adds a new
   part. There is still exactly one component-level operation underneath —
   the fence entry is still one line of text — but the sheet-side editing
   surface is now N small controls per list field rather than one, where N is
   however many parts are currently stored plus the add control.

**What stays true regardless of which shape answer 3 takes**, because it is
about storage rather than about the editing surface: a list field's fence
entry is one line, the parts are separated by `;`, and Constraint 3 governs
whichever text ends up written. What changed with the rework is *how a write
gets produced* — see **Design** and **Data and file model**.

### The contract, checked again against the new answer

**`ComponentDefinition` still needs nothing.** The question was worth
re-asking, because per-chip commits are a real change to the render-time
interaction, and the answer is still no: `read`, `write`, and `scopeValues`
take and produce exactly what they did in the first pass — a `PassportData`
whose `values[key]` is one string. Per-chip editing is entirely inside
`render`, deciding what string to hand `context.onChange` on each of several
possible presses (edit one part, remove one part, add one part) rather than on
exactly one. Nothing about the shape of a commit changed; only how many
gestures on the sheet can produce one.

**`ConfigFieldSpec.entryFlag` and the editor's "Several values" checkbox are
unaffected**, exactly as flagged going into this rework: that lever is about
the *layout* declaring list-ness, and nothing about sheet-side editing touches
the config form.

### The separator module, and the second look it needed

The first pass extracted `LIST_SEPARATOR` and a split (`listParts`, generalised
from `modifier-cell.ts`'s `storedParts`) into `src/parse/list-value.ts`, on
the reasoning that the separator is a bound — like `interaction/commit-
window.ts`'s `GESTURE_COMMIT` — that two domains must not silently drift apart
on, and left the join (`spellParts`) behind in `modifier-cell.ts` on the
argument that Passport never reassembles parts: a commit wrote back exactly
the raw text a reader typed.

**That argument is gone with the answer it rested on.** Per-chip editing means
every commit — an edit, an add, or a remove — has to reassemble the surviving
parts into one stored string, which is exactly the job `modifier-cell.ts`'s
`spellParts` already does, on the same separator, for the same reason (join
with `'; '`). Leaving it behind in `modifier-cell.ts` and writing a second
copy in Passport would be the exact drift the first extraction was written to
prevent, one function later.

**Decision: `parse/list-value.ts` gains `joinParts`, moved from
`modifier-cell.ts`'s `spellParts` body, and `modifier-cell.ts`'s `spellParts`
becomes a re-export of it** — the same shape the split already took. Its six
existing importers and its own test suite are unaffected, since the exported
name and behaviour do not change, only where the implementation lives.

`list-value.ts` now holds exactly three things, each with a real caller on
both sides of the boundary:

- `LIST_SEPARATOR` — the character.
- `listParts(raw): readonly string[]` — split, trim, drop empty parts. Used by
  Passport to compute the parts to draw, and by `modifier-cell.ts` (as
  `storedParts`) for its own write list.
- `joinParts(parts): string` — join with `'; '`. Used by Passport on every
  per-chip commit, and by `modifier-cell.ts` (as `spellParts`) for a modifier
  cell's own commits.

What stays local to `modifier-cell.ts`, because Passport has no use for it:
`cellParts` (the read-side collapse of a repeated *named* part into one
enrolment — a modifier-specific concept with no analogue in a passport field,
where two identical parts are two chips, not one enrolment counted twice),
`withoutPart` (removal that is aware of that same collapse), `readsAsAssignment`,
`unspellableName`, `holdsSeparator`, and the typed-effect parse/spell pair.
Passport's own removal is a plain index-based filter at the call site — there
is no enrolment semantics to get wrong, so no shared helper is written for it
(`docs/PATTERNS.md` §1: one consumer earns no generalisation).

## What it does

A field on a Passport can say it holds several values rather than one. Where it
does, the sheet draws one small control per stored value plus one to add
another, and a reader adds, edits, or removes a value without touching any
other value in the field — so a multiclass character's class field reads
"Fighter 1" and "Bladesinger Wizard 4" as two independently editable tags, on
the same layout a single-class character's class field reads "Bard 5" as one.

## Smallest version

Land the declaration and the storage story only, exactly as the first pass's
smallest version did — `PassportField.list`, the **Several values** checkbox on
the `fields` editor, the separator module (split and, now, join), and the
confirmation that `read`/`write`/`scopeValues` need no change — and stop before
`render` does anything different for a field marked as a list. Until the
follow-up lands, `render` ignores `list` entirely: a list-marked field draws
exactly as it draws today, one chip holding its raw stored text.

That is a smaller cut than the first pass's own smallest version offered,
and deliberately so: the first pass's smallest version *was* "one field, raw
text" — the exact shape the owner went on to reject once it existed on
screen. Offering that shape again as a fallback would be offering back the
thing this rework exists to undo. So where the first pass's smallest version
deferred only the visual chip split, this one defers the whole editing
surface: nothing on the sheet looks or behaves differently for a list field
until the per-chip design (**Design**, below) lands in full.

## Design

### Each part is its own control, always live

**A field not marked as a list draws exactly as it does today**: one
`.sheetsmith-passport-input`, one `<input>`, unchanged in every particular.

**A field marked as a list draws one small pill per stored part, split by
`listParts`, plus one add control after the last of them.** Each pill holds:

- an `<input>` carrying that one part's text, on `editable.ts`'s existing
  rules — this is the same control a non-list field's single chip already is,
  reused once per part rather than once per field. It answers the first
  rejection directly: there is no closed state to fail to signal, because
  every part is, at all times, the same live editable-looking control every
  other value on the sheet already is. Nothing new has to be discovered.
- a small delete control beside it, glyph-only, Obsidian's own `trash` icon —
  the same mark Record set's and Table's own row-delete already use, so a
  fourth control on the sheet asks the reader to recognise one glyph rather
  than a second one. **Shown only while that part has focus, per the owner's
  second-look refinement below** — replacing this document's own first answer,
  which drew it always visible on the always-visible-delete-column precedent
  Table already sets. Read together with **Showing the delete control: focus,
  not hover, not always** below, which works out what "focus" has to mean for
  this to stay reachable by keyboard and touch and not merely by a mouse.

**The add control** is one more small, always-visible glyph-only button after
the last part (or, where a list field holds no parts, the whole of what is
drawn) — Obsidian's `plus` icon, `aria-label` and `title` both "Add
`${name}`" (`Add Class`), so it reads as this field's own invitation exactly
where an empty field's placeholder used to. It is a `<button>`, not an
`<input>`: pressing it (pointer, Enter, or Space) turns itself into a fresh,
empty, focused `<input>` in the same position, ready to type into, with a
fresh add button appearing after it.

**A field with zero stored parts draws only its add control, no chip.** This
replaces the first pass's "one placeholder chip"; the add control's own
`aria-label` now carries the invitation a placeholder used to.

### Commits, per part

Every commit is `editable.ts`'s existing gesture — blur commits, Escape
restores and announces, Enter commits — applied to one part's control rather
than to the whole field. What differs is what a commit computes to hand
`context.onChange`:

- **Editing an existing part** replaces that part's own text and rejoins every
  other stored part with it, via `joinParts`. The parts not being edited keep
  their own text; the *inter-part spacing* around the separator is not
  preserved for parts left untouched, because `listParts`/`joinParts`
  round-trip through a plain split-and-canonical-join exactly as
  `modifier-cell.ts`'s `storedParts`/`spellParts` already do for a modifier
  cell — an existing, already-shipped, already-accepted cost of the same
  shared primitive, not a new one this feature introduces. Stated so it is
  not read as a new Constraint 3 gap: an **untouched** entry (no part edited
  at all) is still byte-identical, because nothing calls the split or the
  join unless a commit actually happens.
- **Removing a part** takes it out of the stored list entirely (a plain
  filter by index — no enrolment logic, since two identical parts are two
  chips) and rejoins the rest via `joinParts`. Reached through the delete
  control's own gesture, below.
- **Adding a part** is transient until it is committed non-empty. Pressing
  **Add** does not write anything: it opens one new, empty, focused input in
  place. Committing it with text appends that text to the stored parts and
  writes the joined result. Committing it empty — blur with nothing typed, or
  Escape — removes the transient input and writes nothing at all; the note is
  untouched, and focus returns to the add control. This is the one place a
  "commit" does not necessarily produce a write, and it is deliberate: an
  empty part cannot be represented in storage at all (`listParts` drops it on
  the next read regardless), so writing one and having it silently vanish on
  the next render would be a stranger outcome than never writing it.

### Removing a part: arm, then confirm

**The delete control reuses `interaction/arm-to-confirm.ts` as a fourth
consumer**, on Record set's, Table's, and the modifier form's own precedent for
exactly this shape — a first press arms and tints the pill, names what it
would remove and says "select again to confirm"; a second press on the same
control fires it; a press elsewhere, or arming a different chip's delete
control, stands it down silently. One `armRegister()` per list field, so
arming one part's delete control disarms a sibling's in the same field, on the
same terms two rows in one Table disarm each other.

**This is a deliberate departure from Table's and Record set's own stakes, not
an oversight, and it is worth being explicit about why the same module is used
at a different stake.** A Table row or a record can carry several typed
fields and a body; losing one to a mis-press is a real loss the two-step
gesture exists to guard against. A passport part is a short phrase, cheaply
retyped, and the module's own two-step gesture costs nothing extra to reuse —
it is already built, already tested, and already the vocabulary a reader
meets everywhere else this plugin deletes something — so reusing it rather
than inventing a lighter one-press removal keeps one mental model for "this
plugin's delete controls arm, then confirm" rather than two. Nothing about the
module's own wording, icon, or timing changes; the verb stays "delete," on the
module's own "the verb is not a parameter" rule.

### Standing an armed delete down when its part loses focus

**One addition to the arming rules above, made necessary by the delete
control now being hidden except while its part has focus (below).** Moving
focus away from an armed part — to a sibling part, to the add control, or off
the fields line entirely — stands its arm down in the same motion that hides
the button, rather than leaving a part armed with nothing on screen to show
for it.

**That is a decision, not the only option, and it is worth saying why the
other one lost.** A part could in principle stay armed while its delete
control is invisible, to be picked back up if focus returns to it. Rejected:
the arm-to-confirm tint lands on the *part* (`.sheetsmith-passport-part-
arming`, reddening its input's border) independently of whether the delete
button itself is visible, so a part that stayed armed while hidden would show
a reddened input with no visible control explaining why — and a reader who
then Tabs back to it, or presses something nearby, could confirm a deletion
they had forgotten was pending, with nothing on screen in the meantime to
remind them. Scoping "armed" to "in focus" keeps the tint and the control
appearing and disappearing together, so there is never a state where one is
on screen without the other.

Reached with a `focusout` listener on the part's own row, checking that
`event.relatedTarget` has actually left the row (a `focusout` from the input
to its own delete button is progress within the same part, not a departure,
and must not disarm it) and calling the register's own stand-down — the same
`ArmRegister` the module already exposes for "arming a different part stands
this one down," reused for "focus leaving this part stands it down" rather
than a second module. This is additional to, not a replacement for,
`arm-to-confirm.ts`'s existing outside-press listener: an ordinary mouse click
elsewhere typically fires both (the click moves focus, and its `mousedown` is
also an outside press), and standing an already-disarmed control down a
second time is a no-op, so the two are never in tension.

### Showing the delete control: focus, not hover, not always

**The delete control is hidden at rest and appears only while its own part
has focus — not on hover, and the owner confirmed that distinction
directly.** So the trigger is CSS `:focus-within` on the part's own row
(`.sheetsmith-passport-part`), not `:hover`: `docs/UI.md` §7's "never a
hover-only affordance… a phone has no hover" is about *reachability*, not
about whether a control may be conditionally shown, and a focus-triggered
reveal is reachable exactly the way the always-visible design was — by
keyboard, by touch, and by a mouse — so this is not the thing §7 forbids.
Worth stating plainly so a reviewer does not pattern-match "conditionally
visible" onto "hover-only" without checking the trigger, since the two look
the same in a diff and are not the same rule.

**The delete control stays a real, separately focusable `<button>`, and Tab
order does not change.** This is the one place the refinement had to pick a
side rather than leave a gap: either the delete control is still a Tab stop
that a keyboard user reaches after its part's input, or it is reached some
other way (a shortcut while the input has focus) once it stops being a
permanent Tab stop. Making it a keyboard shortcut would be a new gesture with
its own discoverability problem — the exact complaint this refinement exists
to fix, moved rather than solved. So: **the trigger for visibility is
`:focus-within` on the whole part, not `:focus` on the input alone.** A part's
input gaining focus already satisfies `:focus-within` on its row, which reveals
the delete button *before* the next Tab press, so that press reaches a control
that is already visible rather than one popping into existence under the
reader's finger. Tab order is therefore exactly what it was in the always-
visible design: input, delete, next part's input, next part's delete, …, add.

**Third reversal: hidden via `display: none` after all, reserving no space —
superseding this document's own previous choice of `visibility: hidden`, and
the reasoning behind both is worth keeping rather than only the current
answer.**

**What was tried first, and why.** `visibility: hidden` was chosen so a
part's own width — the gap between its input and its delete button
(`gap: var(--size-2-1)` on `.sheetsmith-passport-part`) — stayed reserved at
rest, on the argument that a reader tabbing through several parts of one
field would otherwise see each part grow and shrink in turn as focus passed
through it, rippling whatever sat after it. That held, and it bought the
wrong thing: it made a list field's own resting width *wider* than a
non-list field's single chip, by exactly the reserved delete-button's box —
so two fields that should read at the same rhythm did not, and the field
this whole feature is meant to make ordinary-looking (a multiclass class
field beside a plain one) was the one drawing visibly wider at rest for a
reason nothing on screen explained.

**The owner chose the other trade explicitly, having had both named for
them: true uniform spacing at rest, in exchange for a part's own width
growing the instant it gains focus** (making room for the revealed delete
control) **and shrinking back the instant focus leaves** — a small, real
ripple while tabbing through several parts of one field, accepted rather
than solved. `display: none` is what delivers the first half: a
`display: none` child is not a flex item at all, so `.sheetsmith-passport-
part`'s own `gap` reserves nothing for it, and the row's rest-state width is
exactly its input's width — the same rhythm a non-list field's one chip
already has.

**Confirming, not merely repeating, the claim the previous pass made about
reachability.** That pass asserted `visibility: hidden` "removes the button
from hit-testing and from the tab order while hidden, exactly as
`display: none` would" — checked here because this swap depends on it being
true in the other direction too. It is: both properties remove an element
from the accessibility tree and the tab order while they apply, and
`display: none` additionally removes its box from layout, which is the one
property being traded on purpose. Nothing about *focusability* changes in
this swap — only reserved space does, which is the whole of what makes this
a contained Design-section change rather than a reopened question about
reachability.

**Why the next Tab press still lands correctly, worked through rather than
assumed.** `:focus-within` on `.sheetsmith-passport-part` becomes true the
moment a descendant gains focus — synchronously, as part of the same focus
change that fires the `focus`/`focusin` events — so by the time the reader's
*next* key press (Tab) is dispatched, the delete button already has a real
`display` value and a normal position in the tab order. There is no frame in
which a Tab press could be processed against a still-`display: none` button:
the CSS state and the DOM's notion of "what is focusable right now" are the
same state, updated before the next user input is possible. Tab order is
therefore unchanged from the always-visible design and from the
`visibility: hidden` one: input, delete, next part's input, next part's
delete, …, add.

**A focused or armed control cannot hide itself, by construction.** A
descendant with focus always satisfies its own ancestor's `:focus-within`,
so the element currently holding focus — including the delete button itself,
mid-arm — can never be the one `display: none` removes. The only element
`display: none` ever applies to is one that does *not* currently have focus,
which is exactly the state in which removing it from layout is safe.

**The `focusout`/`relatedTarget` stand-down logic (above) is unaffected, and
the reasoning is the same shape as the reachability check.** The disarm
listener reads `event.relatedTarget` at the moment focus *actually* leaves a
row — a moment that has already fully happened, with its `focusout` event
already dispatched and handled, *before* `:focus-within` changes and before
the delete button is removed from layout as a consequence. The removal is a
passive, browser-driven style consequence of a focus change the listener has
already reacted to; it is not a DOM mutation this feature's own code
performs inside the handler, so it cannot retrigger a second `focusout` or
leave the handler holding a stale reference. The one thing worth naming
because it is not obvious: the button is never removed from the DOM at all
in this design (`paint()`'s own rebuild is the only thing that ever does
that, on a commit, unrelated to focus) — only its `display` is toggled by a
CSS rule keyed on an ancestor's pseudo-class — so there is no element
destruction for a focus/blur handler to race against in the first place.

**The ripple is instant, not animated, and no mitigation is added for it.**
`display` cannot be transitioned in the way `background-color` and `color`
already are on this same pair of controls; softening the width change with a
different technique (a reserved-but-collapsing spacer, a width transition on
a wrapping element) was not asked for and is not built here, on the same
"don't over-build this" instruction the previous pass's grouping question
was given.

### Keyboard and focus

**Tab reaches every control on the fields line in order**: a non-list field's
one input, or a list field's parts (input, delete, input, delete, …) followed
by its add control, then the next declared field — unchanged in *sequence* by
the delete control's visibility now being focus-triggered and unreserved,
on the terms worked out above: a hidden delete control is still the next Tab
stop the moment its own part gains focus, even though (unlike the always-
visible design) it now also changes that part's own width at the same
moment. This is a real cost on a long multiclass or a long list generally —
more tab stops than a scalar field, and now a width that ripples as the
reader moves through them — and it is the same reachability cost Table's own
per-row delete buttons already impose, accepted there for the same reason: a
control that only hover or a mouse can reach is not reachable at all under
`docs/UI.md` §7.

**Enter's behaviour changes shape only on a list field, and is unchanged on
every other field.** A non-list field's Enter still commits and moves to the
next declared field, exactly as today. On a list field:

- Enter on a part's input commits that part and moves focus to the next
  part's input, or to the add control if it was the last part.
- Enter on the add control's transient input commits the new part (if
  non-empty) or cancels it (if empty, same as Escape) and returns focus to a
  fresh add control either way — so adding several values in a row is one
  Enter per value with no pointer needed.

This is a considered change from the first pass's single "Enter moves to the
next declared field" rule, not an oversight: a list field now has enough of
its own internal structure that jumping straight past it to the next field
would skip the exact workflow — add several values quickly — this feature
exists for. Tab remains the way to leave a list field for the next one at any
point.

### Wikilink refusal, now per commit rather than per field

**Refusal moves from the whole field to the one part actually being
committed.** Each part's own input carries `fenced-link.ts`'s existing check
independently: a `[[Bard]]` typed into any one part's edit or into the add
control's new-part input is refused with the same sentence this component
already gives every other fenced value, the draft is kept in that one input,
and every sibling part is untouched. This is a *narrowing* from the first
pass's "the whole committed string, not per part" — the first pass had exactly
one commit for the whole field, so there was exactly one string to check;
this pass has one commit per part, so there is exactly one string to check
each time, and checking anything wider would mean reading parts the reader
did not touch.

### Spacing is uniform

**One gap value for the whole fields line — between two parts of the same
field and between the last part of one field and the first of the next
alike.** Stated as a hard constraint because it reverses part of the first
build: that build used a smaller gap within one field's own chips and a
larger one between fields, specifically so a reader could tell where one
field ended and the next began by the width of the space alone. The owner
rejected differentiated spacing outright, and that rejection stands across
every pass since: the gap between two parts of one field and the gap between
the last part of one field and the next field's own chip are the same
number, with nothing else — no tint, no border, no differentiated gap —
added on top to mark where one field's own parts end. See **Grouping: tried,
and withdrawn** immediately below for why that is now a deliberate choice
rather than an unexamined one.

### Grouping: tried, and withdrawn

**Second reversal.** The previous pass of this document designed, and a build
shipped, a light `--background-primary` tint on `.sheetsmith-passport-list`,
cornered at `--radius-m`, to mark each list field's own run of parts as one
group — recorded in the paragraph above's own note that spacing alone leaves
nothing to tell one field's parts from the next field's chip. It went through
a design review, a contrast pass, and a forced-colors fix, and the owner then
reviewed the built result at the land stop and asked for it to be removed
outright: no background, no border, no radius, no padding on
`.sheetsmith-passport-list` beyond whatever the flex layout itself needs.
**`.sheetsmith-passport-list` goes back to exactly what "Spacing is uniform"
above describes on its own** — the flex row and its one uniform gap, nothing
painted around it.

**The cost this reopens is not resolved a second time; it is accepted.**
Nothing distinguishes one list field's run of parts from the next field's own
chip beyond the presence of a delete icon on a focused or armed part — the
same cost the previous pass flagged, then answered with a tint, and the owner
has now chosen to live with unanswered rather than solved visually. Recorded
under **Deliberately not doing** below, in the owner's own words as relayed,
so a future reviewer reads this as a decision made twice rather than a gap
nobody noticed.

### Empty and error states

No new error state. A list field's fence entry fails exactly like any other
entry's would — the fence-level failure is read before any field is drawn,
unchanged from the first pass. A list field with zero parts is the ordinary
empty state, drawn as the add control alone (above), not as an error.

### What it reuses, by name

The tag surface and its `--radius-s` corner for every part's pill (`docs/
UI.md`'s "A tag" row, unchanged); `editable.ts` for every part's own input,
unchanged in every rule it already carries; `interaction/arm-to-confirm.ts`,
as a fourth consumer, for a part's delete control, including its
`ArmRegister` reused to stand a part down when focus leaves it, not only when
a sibling arms; Obsidian's own `trash` and `plus` icons, matching the app's
existing delete vocabulary rather than a new glyph; the fields line's existing
nearest-press routing, for a field's own cluster of controls as a whole (a
press between two of a list field's own parts still resolves to whichever
control is nearest, on the same rule that already governs the whole line);
the whole-string wikilink sentence via `fenced-link.ts`, now applied per part
rather than per field but unchanged in wording. What is new: the add control
(a plain `<button>`, no shared module, since it has exactly one shape and one
consumer); the per-part delete pairing of an existing `<input>` with
`arm-to-confirm`'s existing button; and the `:focus-within` visibility rule
(`display: none` at rest) and its paired `focusout` disarm, neither of which
is a shared module, since each has one consumer. `.sheetsmith-passport-list`
carries no rule of its own beyond the flex row and its one uniform gap — the
tint tried between the last two passes and withdrawn (**Grouping: tried, and
withdrawn**, above) is not among what this feature reuses or adds.

## Config fields

Unaffected by this rework. `fields` (`entries`) keeps `entryFlag: { key:
'list', label: 'Several values' }`, exactly as the first pass declared it —
this lever is about the layout, not about sheet-side editing.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `fields` | `entries` | Fields | **Amended.** Adds: "A field may say it holds several values, drawn as one chip per part and stored as one line with the parts separated by semicolons — a multiclass character's class field reading 'Fighter 1; Bladesinger Wizard 4' where a single-class character's reads 'Bard 5', on the same layout." `entryFlag` is added: `{ key: 'list', label: 'Several values' }`. |

No other `configFields` entry changes. `formulaFields` stays empty: a list
field takes no more of an expression than a scalar one does.

Per-field key inside `fields[]` (the layout file, not a `configFields` row):

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `list` | boolean, on a field in `fields[]` | Several values | This field holds several values rather than one, drawn as one small control per value with its own delete control, plus a control to add another. Stored on one line separated by semicolons. Absent means one value, exactly as every field reads today. |

## Data and file model

````markdown
## Passport

![[Thora.png]]

```sheet
name: Thora Ironhelm of Mirabar
class: Fighter 1; Bladesinger Wizard 4
species: Half-elf
level: 5
```
````

- **Storage does not change from the first pass.** A list field's fence entry
  is one line of stored text, exactly like a scalar field's —
  `readFenced`/`writeFenced` already give it Constraint 3 for free.
- **The write path is no longer "the literal text a reader typed," and that is
  the one correction this rework makes here.** A commit to one part computes
  `joinParts` over the current parts with the edited/added/removed one
  applied, and hands that whole string to `context.onChange({ values: {
  [field.key]: joined } })` — still one delta for the one key, exactly the
  shape `write` has always taken, but the string itself is now assembled
  rather than typed as a whole.
- **An untouched entry still round-trips byte for byte**, because nothing
  computes a join unless some part's own control actually commits. Once any
  one part does, the *other* parts' own text survives in the join (their
  content is preserved), but the exact original spacing around the separator
  between them is not — the same behaviour `modifier-cell.ts`'s
  `storedParts`/`spellParts` already has for a modifier cell, inherited
  through the now-shared `list-value.ts`, not a new decision.
- **`read` and `scopeValues` are unchanged**, character for character, from
  the first pass: what a formula sees at `passport.class` is the stored text,
  list or not.
- **List-ness lives only in the layout's config**, `fields[].list`, read at
  `render` to decide how many controls a field's stored text draws. A
  character note carries no trace of whether the layout currently treats a
  field as a list.
- **Existing notes are unaffected.** A note with no field marked as a list
  behaves exactly as it does today; a note whose stored text already contains
  a `;` in a field the layout has not marked as a list goes on rendering as
  one chip holding that text, unchanged, until an author opts the field in.
  Marking a field as a list is a layout edit, not a note migration.

## Acceptance criteria

- [x] `src/parse/list-value.ts` exports `LIST_SEPARATOR`, `listParts`, and
      `joinParts`; `listParts` splits on the separator, trims each part, and
      drops empty ones; `joinParts` is its exact-enough inverse for the
      untouched case (`joinParts(listParts(x)) === x` wherever `x` has no
      irregular separator spacing to begin with).
- [x] `modifier-cell.ts`'s `MODIFIER_SEPARATOR`, `storedParts`, and
      `spellParts` are re-exports of `LIST_SEPARATOR`/`listParts`/`joinParts`;
      its own test suite and every existing importer (`layouts.ts`,
      `types.ts`, `record-set.ts`, `modifier-form.ts`, `table.ts`,
      `formula/modifier-definitions.ts`) pass unchanged.
- [x] `ConfigFieldSpec.entryFlag` exists with the shape `{ key: string; label:
      string }`; `renderEntriesEditor` draws it as a checkbox per entry via
      `checkField`, matching `renderRowsEditor`'s existing `rowFlag`
      rendering; `config-panel.ts` passes `field.entryFlag` through;
      `contract.test.ts` fails a field declaring `entryFlag` whose kind is not
      `'entries'`.
- [x] `PassportField` gains `list?: boolean`; Passport's `fields` configFields
      entry declares `entryFlag: { key: 'list', label: 'Several values' }` and
      its description gains the sentence above.
- [x] A field with `list` absent renders exactly as it does today: one
      `.sheetsmith-passport-input`, one chip, unchanged commit/Escape/clear
      behaviour, and its stored text is never split even where it contains the
      separator.
- [x] A field with `list: true` and stored text `Fighter 1; Bladesinger Wizard
      4` draws two parts, each its own input reading "Fighter 1" and
      "Bladesinger Wizard 4," each with its own delete control, plus one add
      control after the last part; a field with `list: true` and an empty
      stored value draws only its add control, no chip.
- [x] A part's delete control is not visible, takes no layout space, and is
      not reachable by Tab or by pointer while no control inside that part
      has focus; a list field's resting width (its input or inputs alone,
      with the uniform line gap between them) matches a non-list field's
      single chip at the same character length — no extra space is reserved
      for a hidden delete control.
- [x] Focusing a part's input (by Tab, Shift+Tab, or a press) makes its
      delete control visible, gives that part's own box the delete control's
      width immediately, and is reachable by a further Tab press the moment
      the input is focused, before that further press happens; every part
      and field after it on the line may shift position as a result — this
      is accepted, not a regression to fix.
- [x] Moving focus away from that part (to a sibling part, the add control,
      or the next declared field) hides the delete control and returns that
      part's box to its narrower resting width in the same step.
- [x] Moving focus from a part's input to that same part's own delete
      control keeps the delete control visible throughout — it does not
      hide and reappear between the two, and the part's box does not shrink
      while its own delete control still holds focus.
- [x] Editing one part's text and committing (blur or Enter) rewrites the
      fence entry with that part's new text joined with every other stored
      part; the other parts' own text is preserved; Escape restores that
      part's previous text and announces it without touching any other part.
- [x] Pressing a part's delete control once arms it (tinted, announced,
      `aria-label` naming what a second press removes); a second press on the
      same control removes that part and rewrites the fence entry with the
      remaining parts joined; a press on a different control, or arming a
      sibling part's delete control, stands the first one down with no write
      and announces `STOOD_DOWN`'s message.
- [x] Arming a part's delete control and then moving focus away from that
      part — to a sibling part's input, to the add control, or by Tab past
      the last add control to the next declared field — stands the armed
      control down (no write, `STOOD_DOWN` announced) and hides it again in
      the same step; there is no observable state in which a part's tint is
      showing but its delete control is not, or vice versa.
- [x] Moving focus from an armed part's input to that same part's own delete
      control does not stand the arm down: the two share one part, and
      progressing from one to the other within it is not a departure.
- [x] Removing every part of a list field down to zero leaves the field
      showing only its add control, and the fence entry for that key becomes
      an empty string (not a stray `;`).
- [x] Pressing a list field's add control opens one empty, focused input;
      committing it with text appends that text as a new stored part and
      rewrites the fence entry; committing it empty (blur or Escape) removes
      the transient input and writes nothing — the note is byte-identical to
      before the press.
- [x] Tab reaches every part's input and delete control in the same
      *sequence* regardless of which delete controls are currently visible
      when the Tab sequence begins: input, delete, next part's input, next
      part's delete, …, add, then the next declared field. Landing on a list
      field via Tab or via a completed Enter never skips a control, even
      though the *widths* along that sequence now change as focus moves
      through it (above).
- [x] Enter on a part's input commits and focuses the next part's input, or
      the add control where it was the last part; Enter on the add control's
      transient input commits (if non-empty) or cancels (if empty) and
      returns focus to a fresh add control either way. A non-list field's
      Enter is unchanged: commit and move to the next declared field.
- [x] A commit containing a wikilink is refused with `fenced-link.ts`'s
      existing sentence and the draft is kept in that one input, driven on:
      editing an existing first part, an existing last part, and the add
      control's transient input — in every case, every other part of the
      field is untouched and unwritten.
- [x] `write` of an unchanged list field's fence entry (no part's control
      ever committed) is byte-identical to the input, over ten spellings of
      separator spacing (`A;B`, `A; B`, `A ;B`, `A ; B`, a trailing `;`, a
      doubled `;;`, tabs around the separator, a single part with no
      separator, an entry the layout no longer declares as a field, and one
      whose `list` flag was toggled off since it was written).
- [x] Editing one part of a three-part entry whose original spelling has
      irregular separator spacing (`A;B ;C`) rewrites the whole entry with
      every part's own text preserved and the separator spacing canonicalised
      to `'; '` — documented as inherited from `modifier-cell.ts`'s existing
      behaviour, not asserted as a defect.
- [x] `scopeValues` publishes a list field's stored text unchanged after any
      number of part-level edits, and a card reading `passport.class` for
      comparison fails with the existing unknown-name message and no new one.
- [x] `isolation.test.ts` passes: `list-value.ts` is imported by
      `modifier-cell.ts` and by `passport.ts` and by nothing that makes
      either a component import.
- [x] `.sheetsmith-passport-list` carries no `background-color`, `border`,
      `border-radius`, or `padding` of its own: the flex row and its one
      uniform gap only, matching "Spacing is uniform" exactly, with nothing
      distinguishing one field's run of parts from another's beyond the
      controls themselves.
- [x] `docs/UI.md` §9's arm-to-confirm and tag rows gain a fourth/second
      consumer note naming Passport's part delete and part pill respectively;
      no new vocabulary row is added for either, since both reuse an existing
      one.
- [x] `styles.test.ts` passes: every new class is scoped under
      `.sheetsmith-view`, and `styles.css` is regenerated from `src/styles/`.
- [x] The harness sample sheet places a Passport with one field marked
      `list: true` holding two parts, and `npm run harness:shot` shows both
      parts with no tint or border around them, each part's delete control
      hidden and taking no space at rest, and the add control, in both
      themes at full width and at the width where the face stacks. A second
      shot with one of the two parts' inputs focused (or its delete armed)
      shows that part visibly wider, its delete control visible and, where
      armed, tinted, with the sibling part's delete still hidden and that
      sibling's own width unchanged.
- [x] `npm run lint`, `npm test`, and `npm run build` pass.
- [x] `docs/SPEC.md`'s Passport catalog entry gains the `list` field and the
      per-part interaction in its own shape; no change to §4.1's `render`
      bullet, since the contract gained nothing; no change to §13. Written by
      `/land-it`.
- [x] The vault gains a character whose Passport class field is marked
      `list: true` and stores two class levels, drawn as two parts — in a
      second fixture demonstrating the capability rather than by complicating
      the existing plain character sheet, per this project's standing
      practice for a capability variation. Checked by rendering, not claimed:
      the press list is focus a part to see its delete control appear, add a
      value, edit one, arm and then confirm removing one, arm and then move
      focus away to stand it down without removing one, and confirm the
      note's fence entry after each.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through
implementation and every round of findings.

1. `refactor: Share the modifier separator with a plain list of parts`.
   `src/parse/list-value.ts` extracted from `modifier-cell.ts`, split and
   join both; `MODIFIER_SEPARATOR`, `storedParts`, and `spellParts` become
   re-exports; existing tests pass unchanged; the new module gets its own
   test over the split, the join, and their agreement.
2. `feat: Let a Passport field say it holds several values`. `PassportField.
   list`, `ConfigFieldSpec.entryFlag`, `renderEntriesEditor`'s checkbox column,
   `config-panel.ts`'s pass-through, the `contract.test.ts` check, and
   Passport's own configFields entry. No render change: `render` ignores
   `list` for now. This is the smallest version, landable and reviewable on
   its own.
3. `feat: Draw a Passport list field as one control per value`. The part
   pills at rest, each carrying its own input; the add control and its
   transient-input lifecycle; `.sheetsmith-passport-list` as a plain flex row
   with the line's uniform gap and no surface of its own; the new stylesheet
   classes.
4. `feat: Add and remove one part of a Passport list field`. The per-part
   commit and join on edit; the delete control on `arm-to-confirm.ts` as a
   fourth consumer, hidden and reserving no space except while its part has
   focus (`:focus-within`, `display: none` at rest, so a part's own width
   changes as focus enters and leaves it — accepted) and stood down by a
   `focusout` listener when focus leaves its part; the keyboard model (Tab
   order, unchanged in sequence; Enter's per-list-field behaviour); the
   wikilink refusal driven per part.
5. `test: Show a Passport list field in the harness`. The harness sample and
   shots, including one with a part focused or armed so the focus-triggered
   delete control is visible in at least one shot, and one at rest showing a
   list field's parts at the same resting rhythm as a non-list field's chip.
6. `docs: Record a Passport field that holds several values`. SPEC §4.2's
   Passport entry, `docs/UI.md`'s arm-to-confirm and tag rows.

The vault fixture is not a commit: it lives outside the repository and its
recipe is the last acceptance criterion.

## Deliberately not doing

- **Character-declared fields.** The layout still owns which keys exist and
  what they are called; a character note holds only values, never structure.
  Out of scope per the card.
- **Arithmetic over a list.** A list field publishes its stored text exactly as
  a scalar field does; comparing or summing a multiclass string is not made
  possible by this feature.
- **Any other component.** No list lever on Card, Card set, Record set, or
  anywhere else `entries` or a fence entry is drawn. `entryFlag` exists on
  `ConfigFieldSpec` for any `'entries'` field to use later, on the same terms
  `holderMax` exists for any `'columns'` field, but nothing else declares it
  here.
- **Escaping the separator.** A part cannot contain a literal `;`. Accepted
  cost, on the same precedent that chose `;` over `,` in the first place.
- **Auto-splitting an unmarked field.** A scalar field's stored text is never
  inspected for the separator. Stated as a non-goal, not a missed case.
- **A lighter, one-press removal.** The delete control arms then confirms,
  reusing `interaction/arm-to-confirm.ts` at the same stakes as every other
  delete control in the plugin, even though a passport part is cheaper to
  lose than a Table row or a Record set record. Consistency of the gesture
  across the plugin is judged worth more here than shaving one press off a
  low-stakes deletion; revisit if it reads as friction once it is used. The
  owner reviewed this specific tradeoff at the land stop and confirmed it —
  no change asked for here, and it is not reopened by the two refinements
  this pass makes.
- **A new interaction module for the add control**, for the `:focus-within`
  visibility rule, or for the `focusout` disarm. Each has exactly one
  consumer; `docs/PATTERNS.md` §1 does not generalise ahead of a second one.
- **Reaching for a hover treatment anywhere in this refinement.** The delete
  control's visibility, once genuinely conditional, was a natural place to
  reach for `:hover` as a second trigger alongside focus — the owner was
  asked directly and confirmed focus alone, not focus-or-hover, which is also
  the only answer that stays reachable on a touch device with no hover to
  give.
- **A keyboard shortcut in place of a Tab stop for the delete control.**
  Considered as the alternative to keeping it a permanent, `:focus-within`-
  revealed Tab stop, and rejected: a shortcut a reader has to already know
  about is the same discoverability gap this whole refinement exists to
  close, moved from "which control" to "which keystroke."
- **A visual grouping treatment of any kind for a list field's own run of
  parts** — a tint, a border, a container, differentiated spacing, or
  anything else marking where one field's parts end and the next field's
  chip begins, beyond the presence of a delete icon on a focused or armed
  part. Built once, as a `--background-primary` tint at `--radius-m` on
  `.sheetsmith-passport-list` (**Grouping: tried, and withdrawn**, above),
  reviewed, and then withdrawn by the owner at the land stop. The cost this
  leaves — nothing on spacing alone tells the two apart — is the same cost
  the first version of this section flagged for a design review; the review
  confirmed it, a fix was built for it, and the owner chose to give the fix
  up rather than keep it. Stated so a future reviewer reads this as a
  decision reached twice, not as the original open question resurfacing
  unaddressed.
- **Reserving layout space for a hidden delete control.** Tried first as
  `visibility: hidden`, specifically to keep a part's own width — and
  everything after it on the line — from moving while a reader tabs through
  several parts of one field. Superseded: the owner chose true resting-state
  uniformity with a scalar field's own chip over that steadiness, so the
  delete control is now `display: none` at rest and reserves nothing,
  trading the previous version's "nothing moves while tabbing through one
  field" for "a list field's parts sit at the same rhythm as a non-list
  field's chip until a part is focused." Both properties were considered on
  their merits in their own pass; this is the second reversal, not a
  correction of an error in the first.
