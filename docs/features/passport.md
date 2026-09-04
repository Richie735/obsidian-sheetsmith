# Passport

Status: shipped
Board card: a profile card for the character — photo, name, species, class,
level and the like — as one compact passport rather than a row of labelled boxes

One new catalog entry, **Passport**: the character's name, an optional picture,
and a short line of identity values drawn as one face. It is what a sheet's
header is on every system — a Blades playbook, heritage and background; a
Keeper's occupation, age and residence; a 5e class, species and level — and it is
the one block on a sheet that says *who* rather than *how much*. D&D Beyond's
header is the reference shape: avatar left, name large, "Mountain Dwarf Rogue 1"
small beneath it.

The throwaway vault's `DnD 5e Standard.json` currently builds this from an Image
and six Cards in a header row, and the result is six labelled boxes reading
"CLASS Bard", "SPECIES Half-elf". That is a form, not a passport, and it is also
missing the one thing a passport is for, because no component on the sheet can
draw the character's name.

**Amended: the second half of that was true of the sheet and not of the note.**
The name was not missing because nothing could draw it; it was missing because
nothing *stored* it — the sheet was using the note's filename, and `Thora.md`
holds a character called *Thora Ironhelm of Mirabar*. A filename and a character's
name are two different things, which is the owner's reading and the reason the
name is a value in the passport's own fence. What stands unchanged is the first
half: six labelled boxes is a form.

## Model question

**One §13 question is adjacent and does not block; one thing the contract does
not carry today has to be added, and it is `RenderContext`'s to add, on the
precedent `resource` set.** Argued in the order that decides it.

### The string question is adjacent, not blocking

§13 holds **"what a string type in the expression language would unlock"**, and
a passport's small line — "Half-elf Bard 5" — looks like the concatenation that
question is about. It is not. The line is *rendering*: a component drawing three
stored values side by side with a separator between them, in the order the layout
declared them. No expression is evaluated, nothing is compared, and nothing is
published that a formula could not already read. §5's language stays exactly as
it is, the tokenizer still has no quote handling, and Rich text and Image stay
the first entries to revisit if that ever changes. Stated so nobody reopens the
string question to build this.

### Why an arrangement cannot do it, and why that is not a palette entry

The natural first answer is the one the vault fixture already has: a Group
holding an Image and a Card per field. It fails on three counts, and the first
is fatal.

1. **No component can draw the character's name.** A character note "holds
   values only, never structure" (§2), and the name is neither: it is the file's
   basename, which lives outside the body, outside the frontmatter, and outside
   anything `read` is handed. Every component draws from its section and from the
   sheet's name table, and the name is in neither.

   **Superseded, and this count is gone rather than weakened.** The owner's
   reading is that a note's filename and a character's name are different things,
   and the case is on their own sheet: the note is `Thora.md` and the character is
   *Thora Ironhelm of Mirabar*, and no amount of renaming the file should be
   required to say so. The name is an ordinary entry in the passport's own fence
   now — so the premise above is simply false, and an arrangement of a Group, an
   Image and some Cards *can* reach every value a passport holds.

   The count's own facts still stand: a filename is outside the body and no
   component can draw one. What changed is that the name was never the filename's
   to be.
2. **Every Card wears a label above its value.** That is Card's contract and the
   right one for "Armour class 18". It is the wrong one for a face whose whole
   point is that the values are read as a sentence about a person, not as fields
   in a form. `hideLabel` on six cards leaves six unlabelled boxes, which is worse.
3. **It is six components, and §4.2 rules it out of the palette in so many
   words.** *"A job needing two components has nothing for one entry to be"*, and
   the card-beside-its-skills pattern was disqualified from the palette on
   exactly that sentence. So the arrangement is not offered as an entry and cannot
   be; it stays what it is today, the thing an author can already build.

### Why not a Card variant or a Card set option

Card set is a strip of equal tiles under one heading sharing one `derived`, with
each entry's `key` as the tile's abbreviation. A passport's values are unequal in
weight, carry no arithmetic, and are read as a line rather than a strip; its
picture has no `key`; and its name is not stored at all. Giving Card set a photo
slot, a name slot, unlabelled rendering and a line layout is a different
component wearing Card set's name, which is the drift §2's naming rule exists to
stop: a component is named for what it is on the page, and this is not a strip of
cards.

### Why it is a component, by §12's own test

§12's bar for growing the catalog, applied when Record set became the first
addition in five asks: *name in one sentence what this has that the nearest
existing thing does not.* Against a Group of an Image and Cards:

> It draws the note's own name, which no stored value is, beside a picture and a
> line of the character's identity values composed as one face rather than as
> labelled boxes.

Three things, one sentence, and the first cannot be reached by any arrangement of
what exists.

**Rewritten, because the name becoming a stored value took the first thing away
and the sentence above no longer holds.** The honest replacement:

> It composes three *ranks* on one card surface — one value at headline size, a
> picture beside it, and the rest as a line of tags — which no arrangement of
> existing components produces, and which no single component's configuration
> could, so there is nothing for a palette entry to be.

**The argument is weaker than it was and it still holds.** It used to have a
knockout: nothing else could draw the name at all. Now it is cumulative, and it
is worth saying which counts carry it:

- **§4.2's own words are the decisive half**, and they are unchanged: *"A job
  needing two components has nothing for one entry to be."* The arrangement needs
  at least an Image and a Card, so it cannot be a palette entry on anything —
  which is the same sentence that disqualified the card-beside-its-skills pattern.
  A component or nothing.
- **A Card cannot be one of these, and not for want of a setting.** A Card wears
  its label above its value, and `hideLabel` does not turn a card into a tag: it
  leaves an unlabelled box with the card's own surface, padding and border. Six of
  them is six surfaces. A passport is *one* surface holding three ranks, and there
  is no configuration of a Card that is a chip.
- **A Card set cannot either**, for the reason it never could: equal tiles under
  one heading sharing one `derived`, each key drawn as its tile's abbreviation.
  Unequal weights, no arithmetic, no picture and no headline.
- **What is genuinely lost is that this is now a claim about composition rather
  than about capability.** Record set earned its entry on something a Table cannot
  *do* — a list whose items open to show their own prose. This earns its entry on
  something a Card cannot *be*. That is a real difference in kind and the weaker
  of the two, and a reader of §12 should know it before the next component is
  argued in on the same grounds.

**Stated plainly, because it was asked for plainly: the conclusion holds.** Not
because composition is as strong a ground as capability, but because the
alternative is not a palette entry at all — it is an arrangement of two or more
components, which §4.2 rules out of the palette in so many words and which the
vault fixture already demonstrated as six labelled boxes reading "CLASS Bard".
That is the thing this feature exists to replace, and it is still there to replace.

It is generic in capability on §2's terms — every system has a name, most have a
portrait, all have a handful of words that say who the character is — and it is
named for what it is on the page. **Passport** is a real object with exactly this
shape: a photo, a name, a few lines of facts, and nothing to fill in. *Profile* is
the software word for the same thing and is the fallback if "Passport" reads as
whimsy; *Header* names a position rather than a shape and is refused on §2.

### What the contract has to carry: nothing

**The component contract does not grow, and neither does `RenderContext`.** This
section held the opposite — that `RenderContext` would gain `noteName`, the
character note's basename, on `resource`'s terms, and later a `renameNote` beside
it — and the owner's reversal takes both out entirely. Recorded rather than
deleted, because the record is the interesting part.

**Why they went, in §4.1's own terms.** The rule for an optional member is that
it exists *only where the alternative is code outside the component knowing
something it should not.* With the name stored in the fence there is no
alternative to weigh: the component reads its own section and finds the name
there. A member with no consumer has no argument, and leaving one in because it
was expensive to build is the worst reason to keep anything. So out went the
context members, the `RenameResult` type, the vault write in `SheetView`, its
collision check, its `refresh()`, the three refusal branches the filesystem
needed, and the three-branch render that existed to cope with a host that might
not supply either.

**What the name is instead**, and every one of these is inherited rather than
designed: one entry in the `sheet` fence under a key the layout may name,
committed through `context.onChange` like every other value, round-tripped
byte-for-byte by `writeFenced` (Constraint 3, free), refused only where a
*wikilink* is typed into it — Constraint 2, the same sentence the values take —
and published as `<id>.<key>` beside them.

**What the reversal cost, and it was not nothing.** A character's name no longer
follows the file, so a note renamed in the file explorer leaves the sheet's name
untouched and vice versa. That is the owner's point rather than a defect: they are
two different names, and a sheet that kept them in step was the thing conflating
them. The one place it shows is that a sheet cannot be used to rename its own
file, which the file explorer already does better.

### What it publishes

`scopeValues.named`, one entry per declared field **and one for the name**, under
`<id>.<key>` — so a 5e
layout that keeps its level in the passport writes `prof = ceil(passport.level /
4) + 1`. Each entry's `.value` is the stored text, and the bare name is that text
read as a value, so a numeric field publishes a number and a word publishes a
name no formula can compare — which is Card's own rule for a dropdown's value and
is accepted there for the reason §4.2 gives. **No bare `<id>`**: a passport is not
one value, and `ScopeValues.self` is optional for exactly this case. Nothing new
reaches the name table's shape.

**Amended: the reading is `formula/sheet.ts`'s `coerceValue`, not
`typed-value.ts`.** This document named the latter, and following it literally
would not have delivered its own promise: `typedValue` reads a value *by its
declared type*, and a passport field declares none — so it falls to the default,
which is text, and `5` would come back the string `"5"`. What actually makes it
the number 5 is `coerceValue`, one layer further out, which every published entry
already passes through. So the component publishes the stored text exactly as
Card does and imports nothing, which is also why the promise holds: the number
and the name are the name table's reading rather than this component's.

**The name publishes on exactly the fields' terms**, and withholding it would be
the special case: it is one entry in the same fence under a key the layout named,
so `passport.name` is a word no formula can compare in precisely the way
`passport.class` is. Nothing in the name table has to know which of them the face
draws large.

**One entry per *storable* declared field, which is the clause this section did
not carry.** A key the fence cannot hold — blank, or holding a colon or a line
break, since a colon is what separates key from value — is skipped rather than
drawn and lost, and so is a key the layout declared twice, since two fields on
one key are one entry in the note and the second would overwrite the first on
commit. Skipped rather than reported as a config error, on Card set's precedent
for a list of keys: one unusable key must not take the name, the picture and
every other field off the sheet with it. So the published set is the drawn set,
which is the rule that matters — a field the sheet cannot show must not publish a
name the rest of the sheet is then built on.

### What it stores, and the two constraints

**`storage: 'markdown'`, and the section body is two things in a fixed
relationship**: at most one embed line, which is the picture, and one `sheet`
fence, which holds the fields. Each half follows the rule of the component that
owns that kind of value.

- The fields are scalars the way a Card's value is a scalar, so they live in a
  fence, one entry per declared `key` **plus one for the name**, and `readFenced`
  / `writeFenced` give them
  Constraint 3 for free: an untouched fence is returned byte for byte, an
  undeclared entry is preserved on write, and renaming a key does not move the
  stored value (Card set's rule, §4.2).
- The picture is an embed, and **Constraint 2 forbids it from the fence**: a
  `![[Portrait.png]]` inside `sheet` would break rename propagation, backlinks
  and graph view silently, which is the whole of why Image moved to markdown
  storage. So it is a line of plain markdown in the section, exactly as Image
  stores it, and it shares Image's acceptance rule through
  `components/embed-rule.ts` — one embed, `![](…)` refused, a remote address
  refused as policy — with the message drawn **in `render` and never raised in
  `read`**, for Image's own reason: the field that fixes a refused value has to
  still be there.

  **Amended, because "verbatim" was wrong in two ways and both are consequences
  of the file model rather than choices.**

  *A bare path is prose here, not a refused picture.* Image's whole body is its
  value, so `Portrait.png` there is a value it holds and refuses in the frame.
  A passport's picture is one *line* beside a fence, and a line that does not
  look like an embed is found by nothing — so a hand-written bare path is
  preserved, never drawn, and gets no message at all, which is exactly what §10
  says happens to prose in a section. The frame draws empty with its placeholder,
  which is the invitation to write the bracket form.

  *And the field refuses at the commit what the frame cannot hold.* The reader's
  own gesture must not be able to produce the state above — typing `Portrait.png`
  and blurring would put their text in the note as prose with the field empty
  beside it, which is the lockout Image's own correction exists to prevent,
  reached from the other side. So a draft that is not embed-like is declined by
  `editable.ts`'s `refuse`, which keeps it on screen with the reason under it, and
  everything embed-like is stored and explained in the frame on Image's terms.
  The consequence, stated rather than left to be discovered: **Image and Passport
  answer the same typed text differently** — Image stores a bare path and refuses
  it, Passport declines to store one — and the sentence the reader meets is the
  same either way, because it comes from one module.
- Everything else in the section — prose before, between or after — is preserved
  untouched and never drawn (§10). The two lines are found, not positioned: the
  embed is the first **embed-like** line and the fence is the first
  `sheet` fence, in whichever order the hand that wrote the note put them, and a
  write puts each back exactly where it found it.

A section combining a markdown line and a fence has a precedent: §12 records
Record set as "the first to combine three storage rules — a heading, a fence and
a body — in one section". This is two of those three.

**Constraint 4** does not arise for existing notes, which carry no `## Passport`
section and are not read or written by anything here. For the vault fixture,
which will replace six Cards with one Passport, the six old sections stay in
`Thora.md` under §10's rule until they are removed by hand — the fixture is the
one place that is done, and the spec says so rather than leaving a reviewer to
report the orphaned sections as a bug.

### Image's picture has a second drawer, so it moves

`image.ts` holds its acceptance policy as two private functions, `addressed` and
`refusal`. The Passport reads the same policy, and PATTERNS §1 is explicit that a
*policy* — a set, a predicate — extracts on the second consumer rather than the
third, because a guard test over two copies could only assert they still agree.
So the rule moves to `components/embed-rule.ts`, which both import, and Image's
own tests keep driving it. A refusal message stays one string in one place, which
is what a shared rule owes its two readers (UI §9's argument for
`linked-text.ts`).

**Amended: the predicate alone was not enough, and stopping there is the mistake
§1 records by name.** Sharing the rule and copying its *application* left 33
byte-identical lines in the two components — the frame, the field and its four
attributes, the `<img>` with its error listener, and the click handler word for
word including both of its comments. That is "a policy shared and its application
duplicated", `roundSum`'s entry verbatim, and the two-consumer rung was not
available either: `image.test.ts` drives five gesture rules the second copy had
no equivalent for — a caret left alone where the field is already focused, no
focus stolen from a press that ended a selection, a press on an error, a press on
an empty frame, and no spellcheck while the picture is showing — which is
`arm-to-confirm.ts`'s entry exactly.

So there are **two** shared modules, not one. `embed-rule.ts` answers "can this
text be a picture, and if not what is the fix"; `components/picture-frame.ts` is
the painter that draws the frame, the field, the press and every failure, on
`card-face.ts`'s and `linked-text.ts`'s precedent. What each component keeps is
the box the frame goes in and the chrome around it, which is the one thing the two
do not share — Image's is a placed box under its own label, a passport's a square
beside a name inside a card. The **class names are passed in**, `linked-text.ts`'s
own arrangement, so the painter knows that neither an image nor a passport exists
and the stylesheet does not have to be renamed to match a module.

And a **third**, from the same tier and a different subject:
`components/fenced-link.ts` holds the one sentence a fenced component says about a
wikilink typed into it, shared with Record set — whose own comment already stated
the rule this file makes true across two files. The two words that differ are
arguments, because a record has a name and a body to move a link into and a
passport has neither.

## What it does

A layout places one Passport where a sheet's header goes. It draws the
character's name large, a picture beside it if the note holds one, and the
identity values the layout asked for as one small line under the name, with each
value editable in place and the layout's word for it shown only while it is
empty. A 5e sheet gets "Thora — Half-elf · Bard · College of Lore · 5"; a Blades
sheet gets a playbook, a heritage and a background on the same component with
nothing changed but the field list.

## Design

**One card-shaped surface, borrowed the way Pool borrows it.** The Passport is
`.sheetsmith-card` in surface and rank (UI §9: "The card … Card, Card set,
Pool") and adds no chrome of its own. It is `.sheetsmith-placed`, so its height is
the placement and nothing inside it changes the sheet's size (§8). Inside, two
regions side by side: the picture, a square as tall as the face, on the start
side; and the text, filling the rest.

**Amended: the square is capped at 45% of the face**, because a square sized from
the face's own height is *wider than the face* wherever the placement is narrower
than it is tall — a design review found a one-column, two-row passport drawing the
picture across the whole card with the name and the field squeezed to nothing,
neither of them on screen at all. Capped, the text always has more than half the
face, and at those widths the frame becomes a portrait rectangle rather than a
square, which `object-fit: contain` handles by construction.

**The picture is Image's frame, at Image's rules.** `object-fit: contain`,
centred, never cropped or distorted, the slack the frame's own surface; a press
on the picture, on an empty frame or on an error focuses a one-line field holding
the embed's own text, selected, so the reader pastes a new reference over it —
Image's "the field is the picker", with the same `editable.ts` gesture and the
same four failure states drawn *in the frame*, in Image's own words. A passport
with no embed line draws the empty frame, which is also the only invitation to
add one. A layout may leave the picture off with `hidePicture`, for a system whose
sheets carry none, and the text then takes the whole face.

**The name is the headline, and it is a stored value.** The card's own headline
size, `1.75em` (UI §5), `tabular-nums` irrelevant since it is text, one line,
truncated with the shared ellipsis and the shared reveal-on-hover rule on it
(UI §9, `ui/truncation.ts`). Where nothing is stored it reads *Character name* at
the **headline size**, faint.

**Amended twice, and the second time by the owner.** It first said *the secondary
style*, and a design review measured what that cost: the nameless face came out at
12px, 10.2px and 13px down the stack, so the smallest and faintest string on it
held the *headline* slot while the values under it became the headline — the
labelled-box reading this component exists to escape — with contrast
non-monotonic the same way, 6.7:1 against 2.1:1 against 14.7:1. A Card's empty
value is an em dash at the card's own size, faint, and UI §9 cites that dash as
the model.

The second amendment is what the reversal simplified. "Absent" used to be a fact
about the *host* — no `noteName`, so no note — and it needed a class of its own on
a `<div>`. It is a fact about the *note* now, so it is a `::placeholder` on the one
field, which is the same mechanism the chips already use and one element instead of
two. The rank is unchanged.

**It is a control, and it is the note's own value.** An `editable.ts` field with
the gestures every other value has — Enter commits, Escape restores the stored
name and says so, blur commits — chromeless at rest so it still reads as the
headline, taking the shared hover and focus treatments every other chromeless
field on the sheet takes. One refusal: a wikilink, on the values' own sentence,
because it is an entry in the same fence (Constraint 2). No blank-name refusal —
an empty name is an empty card — and no illegal-character refusal, which went with
the rename because those characters were forbidden by *paths*.

**The fields are one line of tags.** Each declared field is an inline
`editable.ts` field holding its stored text, drawn as a discrete chip in
Obsidian's own tag clothes.

**Amended by the owner: a row of tags rather than a sentence, and the middle dots
go with it.** This section described the values as a sentence with a dot between
each pair — and a later amendment argued that dot down to an `aria-hidden` span,
since `::before` does not render on an `<input>` and generated content cannot
carry `aria-hidden` at all. Both are moot: a chip separates itself, and a dot
between two padded pills reads as a third thing. Four consequences worth recording
rather than rediscovering.

**The trade is deliberate and it is against an earlier decision of ours.** The
design wave dropped the field's horizontal padding on UI §9's ruling — where a
control borrows a reading, the padding is what gives it away first — because what
the line borrowed was a *sentence*, so the values had to share the name's left
edge. A chip is padded by definition, so the sentence reading and the 9px of
left-edge alignment it bought are both given up on purpose. The old argument was
right for the old goal; `sheet.css` records it as superseded rather than as wrong.

**The dots took a real defect with them.** At six fields the line wrapped after a
dot and stranded it at the end of a row — found on the vault fixture, and by no
harness view, which is why the harness now has a six-field sample.

**The vocabulary is Obsidian's own, and two members of it are swapped.** UI §1
gives the plugin no colours of its own and the host has a full set for exactly
this object, so the surface, the border, the pill radius, the corner shape, the
padding, the weight, the decoration and the `-hover` variants are all `--tag-*`.
`--tag-size` is not taken: it is `0.875em`, which inside a card resolves against
the card's 16px rather than the sheet's field rank, so it would draw these values
at 14px where a table's cell and a record's field draw at 13px. And `--tag-color`
is not taken, for two measured reasons — the tag colour on the tag surface over a
card is **3.56:1** in light against §3's 4.5:1, and accent text on a sheet already
means *link*, since every anchor a cell or a prose block holds takes the bare `a`
colour. The text is `--text-normal`, a different host variable rather than an
invented colour, and measures 13.3:1 and 9.65:1.

**What the pill's own separation rests on is hue and shape rather than
luminance**, and the number is stated because it looks alarming alone: the chip
surface is 1.11:1 against the card and its border 1.17:1. That is the same
figure/ground arithmetic the picture frame already has — Obsidian's subtle
surfaces are calibrated against the page and a card is already a tinted surface —
and the ruling there was that shape carries it. Here the shape is a pill with
8.45px of horizontal padding, rather more than an 8px inset. Photographed in both
themes rather than argued.

Wrapping is allowed and expected: a two-row placement gives the line room
to become two. While a field is empty it shows the field's `name` as its
placeholder in the secondary style (`.sheetsmith-card-abbreviation`, UI §9
"Secondary text"), so an empty passport reads *Species*, *Class*, *Level* and says
what goes where without a label over anything. A populated field shows only its
value, at the *cell's* rank — `--font-ui-small`, the size a table's field and a
record's field take — and an **empty** field shows its placeholder at that same
size, faint, taking only the colour from the quiet treatment. A half-filled line
carrying two type sizes on one baseline was measured, and that is the defect the
correction closes. **Amended: this said "the card's ordinary value size", which
is `--sheetsmith-card-value-size`, 1.75em and bold.** That is the card's
*headline*, and it would have put the values at the same size as the name
directly above them — against this document's own "one small line under the
name" and against the reference shape it cites, whose identity line is "small
beneath it". A card's headline is what a card has instead of a name; a passport
has a name. A numeric field steps under the arrow
keys and text keeps them as caret movement, which is `editable.ts`'s existing rule
and costs nothing. Enter commits and moves to the next field on the face, Escape
restores, blur commits — the card interaction rules in §4.2, unchanged.

**Each field is named for assistive tech even though nothing is drawn.** The
field's `aria-label` is its `name`, which is UI §6's rule for a control whose
visible mark is not words: a value of "5" with nothing over it is exactly that.

**Amended: there are no middle dots to hide.** This said they carry `aria-hidden`,
which was the whole reason each was a real span rather than a pseudo-element. With
the values drawn as chips there is nothing on the line but the fields, so nothing
a screen reader has to be told to skip.

**Reflow.** Narrow, the face stacks: picture above, text below, the name still
the first thing in the text. A one-row passport in a narrow pane is therefore
taller than one row, which is the same rule every stacked card follows.

**Amended: the trigger is the component's own width, not the sheet's collapse**,
and it is *one* condition where UI §4 gives an inner grid two. §4's two exist
because neither can be derived from the other — once the sheet is one column a
two-column container is wider than it was, so no threshold on its own width
separates the cases. A leaf's own width does separate them, because what decides
whether a picture can sit beside a name is exactly how much room the face has, and
the face has less of it in both situations: about 348px in the one-column reflow at
380px, and about 100px at one grid column on a 1400px sheet. Keyed on the sheet
alone, a one-column passport on a wide sheet never reflowed at all — which is the
placement that was found broken. 400px, measured against a face of about 679px at
six columns, 430 at four, 320 at three and 100 at one.

The `container-type` for it goes on the component's **block** rather than its face,
because a container query cannot restyle the element that is itself the container,
and it is **named** for `.sheetsmith-view`'s reason one level down: the card inside
already establishes a container, so an unnamed query would resolve against
whichever container happened to be nearest each selector's subject.

**The component label.** `.sheetsmith-component-label` above the face, off with
`hideLabel`, and suppressed by `parentShowsLabel` where the passport is a tab. A
header will usually hide it: "Passport" over a passport is the duplicate §9 of
UI.md warns about, and the palette entry below leaves it visible so the author
sees where the setting is.

**Empty state.** No section at all: the name from the file, an empty frame, the
field names as placeholders. This is what a new character looks like and it has
to be legible as an invitation, which the placeholders are.

**Error state.** Two halves, two rules, each the owning component's. A fence that
will not read is the Passport's `read` failing: `.sheetsmith-error` in the cell
naming the line, per §10 and UI §10, and nothing else drawn — Card's rule, since
the fields are Card's kind of data. An embed line that is not one embed is
refused in `render`: the message in the picture frame, the field kept so it can
be fixed, and the name and every field live — Image's rule, since the picture is
Image's kind of data. Never both at once: a body whose fence fails never reaches
`render`.

**What it reuses, by name.** The card surface and rank; the component label;
`editable.ts` for every field; the secondary text style for placeholders; the
placed box; Image's frame classes and its click-to-change gesture; the inline
error. It draws one new *thing*, the dotted line of fields.

**Amended: that is one new thing and ten new classes**, and the original sentence
— "the only new class this feature adds to `sheet.css`" — was never achievable.

**Nine carry rules**, and every one of them borrows a rank, a surface or a box
rather than drawing a second version of one, which is what §9 actually asks:
`sheetsmith-passport` is the block's own reflow context, `-face` turns the
borrowed card from a column into a row, `-picture` makes the borrowed box a capped
square from the face's own height, `-text` takes the rest, `-name` is the
headline, `-name-empty` is the one declaration that differs with no note behind
it, `-name-input` is the name as the note's rename, `-fields` is the row of chips,
and `-input` is the chip. `-separator` was one of them and went with the dots.

**And `-name` is view-scoped, which is a bug this catalog caught rather than a
precaution.** The class lands on a `<div>` in one branch and an `<input>` in the
other, and Obsidian styles `input[type='text']` at (0,1,1) with a `font-size` on
it — so unscoped, at (0,1,0), the headline drew at **13px** in the editable branch
and 28px beside it. Found by looking at a shot; `styles.test.ts`'s
`NAMED_FIELD_CLASSES` carries the class now, so the scope is checked rather than
remembered, and it immediately reported `-name-empty` needing the same scope to
outweigh the rank at all.

**`-input` is on the shared *focus* list and has left the shared *hover* one**,
which is that roster's own definition rather than an exception to it: the hover
treatment is what a field with no chrome at rest does when asked for, and a chip
has a surface at rest with nothing to reveal. Its hover is the tag's own `-hover`
pair. Focus is a different question and the answer there is unchanged — the accent
border every chromeless field on the sheet takes — which is also what keeps the
box the same size in both states, verified pixel-identical. **`-name-input` made
the opposite move and joined both lists**, since a 28px headline with no chrome at
all is exactly the control that treatment exists for.

**One carries no rule at all, and it is a name rather than a treatment.**
`-passport-label` names this component's own label beside the shared class that
styles it — `.sheetsmith-image-label`'s shape — and it earns its place for §9's
recorded reason: every consumer of the component-label rank keeps its own narrow
override while sharing the rank, so a rule reaching one component's label needs a
name to reach it by. `sheetsmith-passport` and `-name-empty` were on this list too
and both since grew the rule they were holding a place for, which is the shape
working rather than a coincidence.

**The count is read off the source rather than remembered**, because it has been
wrong twice: the sentence this replaced said one, and the first amendment said
seven while listing eight and emitting ten. `grep -o
"'sheetsmith-passport[a-z-]*'" src/components/passport.ts | sort -u` is the whole
of it, and the rule-carrying half is the same grep against `src/styles/sheet.css`.
A count that undercounts is the same defect as the sentence it replaced.
`ui/truncation.ts` leaves the reuse list for the reason given above.

**Palette.** One entry, **Header**, prefilling three fields — `class`, `species`,
`level` — with their names, and nothing else. It passes §4.2's test on both
halves: an author looking for a sheet header does not look for a component called
Passport, and the job is one component's configuration away. The entry's
description says what the fields are and that they are edited below.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `fields` | `entries` | Fields | The values shown under the name, in this order. Each key is the entry's name in the note; its name is what the field shows while it is empty and what a screen reader calls it. Renaming a key does not move a stored value: the old entry stays in the note under the old key. |
| `hidePicture` | `boolean` | Hide picture | Leaves the picture off and gives the text the whole face. The note keeps any embed it already holds. |
| `hideLabel` | `boolean` | Hide label | Leaves the component's name off the sheet. A header usually does, since the face names itself. |

`fields` reuses the `entries` kind Card set's `entries` and Card's `options`
already use, with the columns `key` and `name`, so the layout editor changes
nothing. `formulaFields` is empty: no field on this component takes an
expression.

## Data and file model

````markdown
## Passport

![[Thora.png]]

```sheet
class: Bard
subclass: College of Lore
species: Half-elf
level: 5
```
````

- `read`: the first **embed-like** line — one starting `![` — is the picture's source, kept as
  written; the first `sheet` fence is the fields, through `readFenced`. Either may
  be absent. A fence that will not parse fails `read` with the line named; an
  embed line that is not one embed does **not** fail `read`, for Image's reason.
- `write`: `writeFenced` puts the fields back into the fence it read, byte for
  byte where nothing changed, preserving entries the layout does not declare and
  the fence's own spelling. The embed line is replaced in place where it was
  found, or added on its own line above the fence where there was none, with one
  blank line between. Nothing else in the section moves.
- Constraint 3: an untouched section round-trips byte-identically in either
  order of the two lines, with prose around them, and with a hand-spaced fence —
  each asserted by a test.
- Constraint 4: a `## Passport` section is only ever written where one is edited.
  The vault fixture's six retired Card sections stay under §10 until removed by
  hand; nothing here removes them.
- Publishes `<id>.<key>` per field, no `self`, no rows, no modifiers, no reset.

## Acceptance criteria

**Every box below is deliberately unticked, and the reason is the record rather
than an oversight.** Ticking comes from a `/spec-review` report and never from the
session that built the work — that separation is the whole point of reviewing the
spec axis apart from the build — and the report on file predates five changes:

1. the **design wave's fixes** (the field-width floor, the name/field padding, the
   placeholder rank, the nameless face's hierarchy, the `hidePicture` row-count
   copy, the one- and two-column placements, and the picture cap and leaf
   container query that the one-column placement being *broken* produced);
2. the **tag treatment**, which replaced the sentence reading of the values with
   Obsidian's tag surface and removed the separator dots;
3. the **pill radius**, moving the chip from the host's full pill to the plugin's
   own `--radius-s`;
4. the **rename seam** — `RenderContext.noteName` and `renameNote`, a vault
   rename, three refusal branches;
5. the **reversal that removed it**, storing the character's name in the fence
   instead.

The criteria were rewritten across that window: there are **nineteen** here where
the report graded sixteen. So the next reader should treat the whole list as
ungraded rather than assume the unamended ones still hold.

**Two open items belong with it rather than being lost:**

- **The design axis's narrow-reflow finding is unclosed.** The picture measured
  71% of the face at a 520px pane — and it measured that on the *pre-tag* face,
  before the 45% cap and the 400px stack threshold existed, so the number needs
  re-measuring either way before anything is concluded from it.
- **Neither structural axis has seen the last four changes.** The tag vocabulary,
  the leaf container query, the `.sheetsmith-passport-name` specificity fix and
  the `nameKey` config have had no patterns review and no spec review.

- [ ] `src/components/passport.ts` follows PATTERNS §3's member order and
      `contract.test.ts` passes with `passport` registered in `index.ts` and no
      contract rule relaxed; `isolation.test.ts` passes, so it imports no other
      component.
- [ ] **`RenderContext` gains nothing**, and neither `noteName` nor `renameNote`
      appears anywhere in `src/`. The character's name is an entry in the
      passport's own fence under `nameKey`, defaulting to `name`; it commits
      through `onChange`, round-trips byte for byte with every other entry, and
      publishes as `<id>.<key>` beside the fields.

      **Amended by the owner, and it replaced two criteria rather than one.** The
      first asked for `noteName` with `resource`'s argument in this document's
      words; a later one asked for `renameNote` and `SheetView`'s
      `fileManager.renameFile`. Both are gone. §4.1's rule for an optional member
      is that it exists only where the alternative is code outside the component
      knowing something it should not — and with the name stored there is no
      alternative to weigh, so a member kept would have had no argument at all.
- [ ] Image's `addressed` and `refusal` move to `components/embed-rule.ts`, which
      Image and Passport both import; Image's existing tests pass unchanged; a
      test drives the module directly over the four refusal cases named in SPEC
      §4.2's Image entry, and over the empty source, which is not a refusal.
- [ ] **`components/picture-frame.ts` holds the frame, the field, the press and
      every failure state**, imported by Image and Passport, with the three
      `sheetsmith-image-*` class names passed in so the module names no component
      (`linked-text.ts`'s arrangement). Image's own suite drives it and passes
      unchanged, which is what makes the move a move; the five gesture rules it
      had one driver for — a caret left alone where the field is already focused,
      no focus stolen from a press that ended a selection, a press on an error, a
      press on an empty frame, and no spellcheck while the picture is showing —
      now have two. Its header carries the two-consumer argument and says why
      `embed-rule.ts` alone was not enough.
- [ ] **`components/fenced-link.ts` holds the one sentence a fenced component
      says about a wikilink typed into it**, imported by Record set and Passport,
      with the two words that differ passed in. Record set's produced string is
      byte-identical and its own suite passes unchanged; Passport refuses at the
      commit and keeps the draft, with three cases driving it; and the shared
      clause is registered in `isolation.test.ts`'s roster, at the whole verb
      phrase rather than the fragment, since the fragment appears in three
      comments arguing Constraint 2.

      **Neither of those two earns a test file, and that is not a gap.** A
      painter has no entry point and a sentence has no behaviour past its
      substitution, so both are held by the consumers that speak them — which is
      `card-face.ts`'s and `level-ring.ts`'s settled practice, stated in each
      header. What earns a direct driver is the *predicate*, and
      `embed-rule.test.ts` is it.
- [ ] `read` over the fixture body above yields four fields and the embed
      source; over a body with only a fence, four fields and no picture; over a
      body with only an embed, the picture and no fields; over a body with
      neither, an empty result rather than an error.
- [ ] `write` of unchanged data over each of: the fixture body, the same with
      fence-before-embed, the same with prose before and after, and a fence
      spelled `class:Bard` with no space — returns the input byte for byte.
- [ ] `write` of one changed field preserves an entry the layout does not
      declare and does not move the embed line.
- [ ] A fence whose line is not an entry fails `read` with a message naming the
      line; a body whose only embed-like line is `![](https://x/y.png)` passes
      `read` and `render` draws Image's refusal text in the picture frame with
      the field present.
- [ ] `scopeValues` publishes `passport.level` reading `5` as a number and
      `passport.class` as a name; a card with `derived: ceil(passport.level / 4)
      + 1` resolves to `3`; a card comparing `passport.class` fails with the
      existing unknown-name message and no new message.
- [ ] The face draws the stored name once, in the card's headline size, as an
      `editable.ts` field named "Name" with no `title` on it; a commit reports
      `{ values: { <nameKey>: next } }` through `onChange` and the fence gains
      that one entry; Escape restores the stored name and announces it; a wikilink
      is refused on the values' own sentence with the draft kept; a blank name and
      a name holding `/` are *accepted*, being values rather than paths; where
      nothing is stored the field shows "Character name" as its placeholder at the
      headline size, faint; a field declaring the name's own key is left off the
      face; and a `nameKey` the fence cannot hold falls back to `name` rather than
      failing the component.

      **Amended twice, the second time by the owner.** It asked first for a
      read-only name with a `title` reading "Rename the note to change this", then
      for a rename with three refusal branches and a host outcome. The name is a
      stored value now, so the refusals the *filesystem* imposed are gone and the
      one the *fence* imposes is inherited from the values.
- [ ] Each declared field is an `editable.ts` field whose `aria-label` is the
      field's `name`; an empty field shows its `name` as placeholder; Enter
      commits and focuses the next field; Escape restores the stored text; the
      separators are `aria-hidden` and not part of any field's value.
- [ ] `hidePicture: true` draws no frame and no picture field, and `write` still
      preserves an embed line the note holds.
- [ ] `sample` returns a body holding a fence with each declared key set to its
      own `name` and no embed line; the canvas draws it through `read`.
- [ ] `styles.test.ts` passes: every new field class is scoped under
      `.sheetsmith-view`, and `styles.css` is regenerated from `src/styles/`.
- [ ] The harness sample sheet places a Passport with a picture, three fields
      and a hidden label, and `npm run harness:shot` shows it in both themes at
      full width and at 380px, where the face stacks with the name first.
- [ ] `npm run lint`, `npm test` and `npm run build` pass.
- [ ] `docs/SPEC.md` §4.2 gains the Passport entry in the catalog's own shape,
      §4.1's `render` bullet is untouched, since the contract gained nothing, §2
      gains
      **Passport** as a term, and `docs/UI.md` §9 gains a row for the line of
      fields. Written by `/land-it`.
- [ ] The vault's `DnD 5e Standard.json` header row becomes one Passport with
      `hideLabel` on and the fields `class`, `subclass`, `species`, `background`,
      `alignment`, `level` — and **no `nameKey`**, since `name` is the default and
      PATTERNS §8 leaves a value matching its default out of the config.
      `Thora.md` gains the section above, whose fence leads with
      `name: Thora Ironhelm of Mirabar`; the six retired sections are removed by
      hand and the layout's `prof` reads `passport.level`. Checked by rendering,
      not claimed.

      **Amended: the fence gains the name entry**, which is the owner's reversal
      reaching the fixture. It is the case that produced the reversal — the note
      is `Thora.md` and the character is Thora Ironhelm of Mirabar — so this is
      the fixture that has to show the two being different.

## Commit boundaries

1. `refactor: Share Image's picture with its next drawer`. `addressed` and
   `refusal` move from `image.ts` to `components/embed-rule.ts`, and the frame,
   the field, the press and every failure state move to
   `components/picture-frame.ts`; Image imports both and its own tests drive them
   unchanged; a test drives the predicate directly. Each module's header says why
   it exists at two consumers. `components/fenced-link.ts` goes with it, taking
   Record set's wikilink sentence one call site over. No behaviour change.
2. `feat: Store who the character is beside what they have`. The `nameKey`
   config and the name as an entry in the passport's own fence, taking the values'
   own Constraint 2 refusal. **The seam this document originally specified is
   absent from the history rather than added and removed**, which is the honest
   shape for a decision reversed before anything shipped: `RenderContext` never
   gains `noteName` or `renameNote`, `SheetView` never gains a rename, and there
   is no commit taking them back out. The Model question above records what was
   built and why it went; the tree records what is there.

   The one line `ui/truncation.ts` needed to read an `<input>`'s `value` goes
   here, since it is the name that made a field of the headline — with the
   cross-window `instanceOf` beside it, both of them correctness fixes to a shared
   module its three existing consumers benefit from.
3. `feat: Add a Passport for who the character is`. The component, its
   registration, its tests, its sample, its palette entry, and its part in
   `src/styles/`. `styles.css` regenerated.
4. `test: Show a passport in the harness`. The harness sample, the shots.
5. `docs: Record the Passport in the catalog`. SPEC §2, §4.1, §4.2; UI §9.

The vault fixture is not a commit: it lives outside the repository and its recipe
is the last acceptance criterion.

## Deliberately not doing

- **Editing the name.** Renaming a file is the vault's, with its own modal and
  its own propagation. The name is drawn and not touched.

  **Reversed twice by the owner, and it ends somewhere neither position expected.**
  First the name became editable *by renaming the note*, which is exactly what
  this entry had ruled out; then the name stopped being the note's filename at
  all. So the entry is true again for a different reason than it was written for:
  nothing here renames a file, because the name on a passport is not a filename.
  What was wrong all along is the premise both positions shared — that a
  character's name and a note's filename are one thing.

- **Renaming the note from the sheet.** Built and removed with the seam, and worth
  stating as a deliberate absence rather than a gap: a sheet cannot rename its own
  file, and the file explorer already does that better. What a passport edits is a
  value the note holds.

- **A standalone Name component.** The name is a stored value under a key the
  layout names, so a Card with `hideLabel` already draws one, and a layout wanting
  a character's name somewhere other than a passport can point a formula at
  `passport.name`. This used to be argued from `noteName` having one consumer;
  that member no longer exists, and the entry is stronger for it.
- **Options on a field.** A dropdown in a nameplate is a form control in a
  sentence, and the closed-list job already has a component: an author who wants
  alignment as a choice keeps a Dropdown Card beside the passport. Adding
  `options` per field would also need a richer list kind than `entries`, which is
  an editor change this feature does not make. First thing to revisit if the
  free-text line proves too loose.
- **A field holding a wikilink.** `[[Entertainer]]` as a background is a real
  want and it cannot go in the fence (Constraint 2). Granting it means the fields
  leave the fence for markdown storage of their own, which is a Record set with
  one record and a different component. Refused at the commit, as Record set
  refuses a link in a number field.
- **A compound formula.** "Half-elf Bard 5" is composition, not concatenation;
  §5 gains no strings for this.
- **Publishing a bare `passport`.** A face is not one value.
- **A reset.** Identity does not recover on a rest.
- **Mirroring fields into frontmatter.** That is §9, promoted fields, and it is
  its own feature over every component's values, not this one's.
- **D&D Beyond's look.** The reference is the arrangement. The surface, type and
  colour are `docs/UI.md`'s, and a layout cannot reach them.
