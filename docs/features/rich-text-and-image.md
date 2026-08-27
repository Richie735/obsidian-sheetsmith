# Rich text and Image

Status: draft
Board card: Build the last two catalog entries — Rich text, a free markdown block for
backstory and notes, and Image, a portrait or symbol. §12: "Rich text and Image barely
touch the formula system."

**One document, not two.** The two components share no configuration key and the
research says nobody folds them into one entry, so the *catalog* keeps two entries and
the code keeps two files. What they share is the thing this document exists to settle:
**how a component reaches the app for something it can only draw with the app's help,
and what stands in when the app is not there.** That is one answer applied twice, and
it follows `LinkContext`'s precedent both times. They are also coupled by one decision
neither could take alone — **Image refuses external URLs because Rich text carries
them** (question 5), which is only a good answer if both ship together. Two documents
would have had to make that argument twice and keep the two copies in step.

## Model question

**None of §13's live questions blocks either component.** The four that are open —
runs as a second component, local formula overrides, how deep a published name may go,
a party-scale tracker, the two cycle guards, the clock face, options from somewhere
other than a literal list, a `select` column, what an unnamed two-state control says —
are all about publication, nesting or controls. Neither of these components publishes,
nests, or holds a two-state control.

What is blocked is different and worse: **§4.2's Image entry, as written, violates
Constraint 2.** It gives Image `fenced` storage holding "a path or wikilink", and
CLAUDE.md says wikilinks must never be written inside a code fence, because Obsidian
does not index links in fenced blocks — so backlinks, graph view, hover preview and
**rename propagation** all break with no warning. §3 says the same thing from the other
side: "Components that can hold wikilinks store their data as plain markdown."

That is a genuine model question, it is this document's to settle, and the ten
questions below are settled in an order that starts with it.

### The contract does not have to grow (question 10)

Confirmed against `src/components/contract.test.ts`, which is what makes this a fact
rather than a hope:

- **`scopeValues` absent is legal.** `it('publishes scope values as a function, or not
  at all')` accepts `'undefined'`. The registry-wide sweep asserts only that *most* of
  the components that publish are reached, so two more that publish nothing change
  nothing. `ComponentDefinition.scopeValues`' own doc comment already names the case:
  "a heading, an image, a block of prose — simply leaves it off."
- **`scopeRows` absent is legal**, on the same test, and the registry-wide check names
  `['table']` as the only holder, which these two do not join.
- **`formulaFields: []` is legal.** Group and Tab set already declare it, and the
  container check asserts exactly that value for them.
- **`configFields` holding only `label` is legal, and is spelled `configFields: []`.**
  `label` is in `EDITOR_OWNED_KEYS` and a component that redeclares it fails
  `it('does not redeclare a config key the layout editor owns')`. The registry-wide
  count (`> 25` fields across every component) is an aggregate, so a component
  contributing none passes it, and every per-field loop iterates nothing without
  failing.

So no contract change. **What does change is `RenderContext`**, which is not the
component contract and not covered by `MEMBER_ORDER`: it gains two optional members
beside `link`, on exactly `link`'s terms. That is a decision rather than a side effect,
and §4.1's rule for optional members is the one it has to pass — *a member exists only
where the alternative is code outside the component knowing that component's data
shape* — read one level out: **the alternative is `obsidian` inside `src/components/`,
which is the boundary the whole component layer rests on.**

### What they publish (question 9)

**Neither publishes anything. `scopeValues` is absent on both.**

§4.2 already says so, but the prompt is right that the closest analogue disagrees:
Custom System Builder's Picture requires a key and can be used in formulas, and its
default may be a formula that must "resolve to a picture path in the end". The
disagreement is real and it resolves on a fact about *this* language rather than on
taste.

**§5's language has no strings at all.** The aggregate entry in §5 says the tokenizer
"has no quote handling at all", and names adding string literals as "a larger and more
permanent tax" it declined to pay. So a published image path could be compared to
nothing, concatenated with nothing, and handed to no builtin. It could be published and
never read.

It could, however, be **written**. §4.1's own warning against the collection type is the
argument, verbatim: "a value in this plugin is one typo from `applyReset` writing it
into a note, and a Pool whose `max` is a list clamps its bar against a list and restores
to one." A Pool's `max` naming `portrait` is exactly that with a file path in it. CSB's
version works because its language has strings and its Picture has a default value; here
it would publish a name whose only reachable use is a bug.

**What that costs, stated so it is not rediscovered as a gap.** A layout cannot say
"show the portrait the class card names", cannot compute a path, and cannot vary a
symbol by a stored value. If the language ever gains strings, this is the first entry to
revisit, and it belongs in §13 as a new question rather than as an omission here.

### What they store, and what happens to existing notes

Neither component has ever been built, so **no character note anywhere holds a section
for either of them** and Constraint 4 has nothing to protect. The rule still applies in
the ordinary direction: a section a layout stops mapping stays in the note (§10), and
neither `write` ever removes text it did not put there.

Both round-trip byte-identically by construction rather than by canonicalisation, which
is the only spelling of Constraint 3 that survives free-form prose:

- **Rich text stores `markdown`, and the section body is the text.** `read` takes the
  body, strips the whitespace run at each end, and hands back what is left; `write`
  returns **the body it was given, unchanged, when the text has not changed**, and
  otherwise puts the new text back inside the *same* leading and trailing whitespace
  runs the body already had. So a hand-written section keeps its own spacing, and an
  edit changes exactly the prose. That is `fenced.ts`'s rule — "touch only the lines
  whose value actually changed" — applied to a body that is all one value. A null body
  (no section yet) produces `\n${text}\n`, matching `freshBody`'s shape.
- **Image stores `markdown` too, and the section body is the embed.** This is the
  Constraint 2 fix above and it is settled in question 4.
- **Rich text's `read` can never fail.** Any body is legal text, so it returns
  `{ ok: true, data }` or `{ ok: true, data: null }` and never `{ ok: false }`. That is
  worth stating because it means Rich text has no read error state at all.

## What it does

**Rich text** is a free markdown block on the sheet: backstory, appearance, notes, a
Keeper's six short boxes. It fills its grid placement, renders its content as real
markdown with working links and embeds, scrolls inside its box when the content is
longer than the box, and is edited in place by clicking it.

**Image** is a portrait or a symbol. The character note holds an ordinary Obsidian
embed — `![[Portrait.png]]` — so the picture shows in markdown view too, backlinks
resolve, and **renaming the file updates the sheet**. On the sheet it fills its
placement, fits the picture inside without cropping or distorting it, and clicking it
opens a field holding the embed's own text.

Neither takes any configuration beyond its label and whether to show it, and neither
publishes a name to any formula.

## Design

### The seam: two optional `RenderContext` members (questions 1 and 3)

`LinkContext` is the precedent and it is followed exactly. Its doc comment states the
shape of the bargain: "a component paints its own anchors either way, so a unit test and
the harness both show a real link. What is absent without this is the vault."

```ts
/**
 * Draw markdown into an element, using the app's own renderer.
 *
 * Optional on the same terms as `link`: without it a component draws what it can
 * from the text alone, which is the truth where there is no app to ask.
 */
renderMarkdown?: (markdown: string, into: HTMLElement) => void;

/**
 * A URL an `<img>` can take for a file the vault holds, or null where the
 * target names no file.
 */
resource?: (target: string) => string | null;
```

The view fills both from what it already has. `linkContext()` computes
`this.file?.path ?? ''` for `sourcePath`, which is half of what
`MarkdownRenderer.render` needs; `resource` is the app's own two calls and nothing
else:

```ts
const file = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(target), source);
return file ? this.app.vault.getResourcePath(file) : null;
```

**Nothing here enumerates image extensions**, and that is deliberate: Fantasy Statblocks
455 is webp silently ceasing to render inside the plugin while "the same syntax" worked
one line outside it, which is what a resolution path diverging from the app's own looks
like. There is no list here to diverge, and the browser decides what it can draw
(question 7 covers what happens when it cannot).

**`MarkdownRenderer.render` wants a `Component` for the lifecycle of what it renders,
and the view owns it, not the component.** The view holds one child `Component` per
render pass, loaded when the pass begins and unloaded when the next pass replaces it or
the view unloads. Without that, every embed's listeners accumulate across every rebuild,
and a sheet rebuilds on every edit anywhere on it. A render that lands after its pass
was unloaded must not write into a detached box.

#### Why the renderer is legal here when `wikilink.ts` argues against it

`wikilink.ts`'s header is the standing objection and it stands. It gives four reasons,
and **three of them are about a table row**:

> `MarkdownRenderer` is asynchronous, emits block markup into a table row whose height
> is already agreed with its neighbours, wants a `Component` for a lifecycle the
> component contract does not offer, and would put `obsidian` into `src/components/`.

- *Asynchronous, into a height already agreed.* **A Rich text block's height is its
  placement**, declared by the grid and not derived from its content (§8, and question 2
  below). Markup arriving a frame later cannot move anything, because nothing about the
  box depends on what is in it. This is the fact the header did not have, and it is why
  the same renderer is right here and wrong in a cell.
- *Block markup.* A Rich text block **is** block markup. A paragraph, a list and a
  heading are what it is for.
- *A lifecycle the contract does not offer.* Still true, and answered rather than
  contradicted: the lifecycle stays in the view, which is an `ItemView` and therefore
  already a `Component`. The component contract gains nothing.
- *`obsidian` in `src/components/`.* Not paid. The renderer arrives as a
  `RenderContext` member, so `components/` still imports nothing from `obsidian` and
  every file stays testable under happy-dom.

**And it is not a config toggle.** The Fantasy Statblocks arc in the research is 27
months of an opt-in that had to be fixed twice — one block ignoring it, the layout
editor giving no sign which blocks had it — before being removed in favour of rendering
by default. Rich text renders markdown. There is no setting.

**What this does not do is hand the renderer to Table.** The member is on the context,
so Table *could* reach for it; it does not, for the three reasons above that are still
true of a cell, and `wikilink.ts`'s header is amended to say so — it changes from an
argument against the renderer to an argument about *where* the renderer belongs. Giving
a cell block markup is a separate decision and a much larger one, and this feature does
not take it.

#### What Rich text draws without a renderer

**Its text as paragraphs, split on blank lines, with its wikilinks live.** Nothing else:
`*italic*` shows its asterisks, exactly as a cell does today.

That is where `table.ts`'s private `paintText` goes. Its own header says so: "Rich text
is the obvious second consumer and is not built, and PATTERNS §1 says a painter moves
out on the second consumer rather than in anticipation of one." It moves to
`src/components/linked-text.ts`, a painter beside the components in the manner of
`card-face.ts` and `level-ring.ts`. §1's ladder agrees at two rather than three here,
because what is shared is a **policy** — `internal-link`, `is-unresolved`, both `href`
and `data-href`, `title` and never `aria-label`, and the rule that a link paints as
resolved where there is no vault. Drift between two copies of that set is the entire
risk, and a guard test could only assert they still spell the same thing.

**The branch is exclusive: with a renderer the fallback is not drawn at all.** Painting
the fallback first and letting the renderer replace it would give a synchronous first
frame, and it would also flash raw `# Heading` before every rendered heading on every
rebuild — and a sheet rebuilds on every edit anywhere on it. A momentarily empty box is
cheaper than that.

**What it costs, named rather than discovered in review.** The harness therefore shows
paragraphs and links and no other markdown, so *how a rendered heading, list or embed
sits inside the box* is the one part of Rich text's appearance the harness cannot
answer. That part is reviewed in Obsidian against the throwaway vault. Everything else —
the box, the label, the scroll, the empty state, the editing gesture, how the block sits
against its neighbours, prose rhythm and links in prose — is reviewable in the harness,
and prose with wikilinks is the majority of what a backstory block actually holds.

### Rich text: the box and the gesture (question 2)

**The placement is the box and the content scrolls inside it.** Stated outright, because
it is the answer to the longest-running complaint the research found: CSB 174, open
since 2022 — "the 'rich text area' object has no vertical size. It grows according to
its content which does not allow to control its position in the sheet in a stable way."
CSB has no grid, so a block that grows pushes everything below it. §8 already answers
this from the other side and this component is the first one that would have been
tempted to disagree: **a component fills its placement**, and a component that sized
itself to its content would be the same defect the collapse was (§13) — the sheet moving
because of something the author never placed.

So: the block is `width × height` grid units, `overflow-y: auto`, and a long backstory
scrolls. An author who wants a taller box places a taller component, which is §8's own
sentence — "the grid is the sizing control".

**The gesture is the sheet's own stacked edit, not a second editor.** UI §9 already
settles the shape: "Rendered text and the field that edits it are stacked, never
swapped… the field stays in the DOM and in the tab order in both states, which is what
keeps the view's focus restoration counting the same controls across a rebuild." Both
layers fill the box. Unfocused, the rendered layer is opaque over a field that is
invisible but present and tabbable, and only the links inside it take a press —
everything else falls through to the field. Focused, the rendered layer is hidden and
the field is the box.

Three departures from the cell's version of that pattern, each with its reason, because
a shared gesture is only shared if the differences are stated:

1. **The rendered layer is hidden on focus rather than left transparent.** In a cell the
   two layers hold the same one line of text in the same shape, so they can overlap. Here
   they hold the same text in two *different* shapes — a rendered heading is not the
   height of its source line — and two differently-shaped copies of one text overlaid
   would be unreadable.
2. **The caret lands where the browser puts it and is not moved.** For the same reason:
   a click at a given point in the rendered view is not the same character in the source,
   so there is no landing position to preserve and pretending otherwise would put the
   caret confidently in the wrong place. For a block of plain paragraphs the two
   geometries nearly agree, which is the common case.
3. **The box never changes size, but its scroll extent does.** UI §9's rule is that
   nothing reflows under a pointer resting on the cell, and it holds where it was
   written: the placement is fixed, so nothing on the sheet moves. Inside the box, a
   focused field scrolls to its caret, which is what the reader asked for by clicking.

**`editable.ts` gains a multi-line binding rather than Rich text writing its own.** The
policy is exactly what must not drift, and UI §9's vocabulary table already names
`editable.ts` as "the editing gesture… every stored value on a sheet". What differs is
mechanical: the element is a `<textarea>`, **Enter inserts a newline instead of
committing**, the arrows are caret movement rather than a step, and the value is not
flattened to one line. What is identical is the part that matters — typing changes only
the draft, blur commits, and **Escape abandons the draft, restores the stored value and
announces the restore**, which is SPEC §5's rule and applies here unchanged.

**A rendered embed inside a Rich text block is display, not a control.** Links own their
presses; everything else focuses the field. So a task checkbox inside an embedded note is
not tickable from the sheet. That is the price of the block being editable at all, and it
is stated here so a review does not report it as a bug.

### Rich text: what it looks like

A label, and a box under it. No border of its own, no second kind of panel: UI §9's
opening sentence — "a fourth kind of panel beside a row of cards reads as loose chrome" —
governs, and prose beside cards should read as prose, not as a card with a paragraph in
it. The box takes `--background-primary-alt` at the same radius the card uses so it reads
as an editable surface, and the rendered content takes the vault's own reading treatment
from the app's renderer (UI §1: the plugin has no colours of its own).

Meta Bind 671 is the caution to carry here and on Image: an image whose filename ended in
`-portrait` rendered cropped, and the cause was a filename-keyed rule in the reporter's
own theme. **Content the app renders into a sheet inherits the reader's theme and
snippets**, and that is correct rather than a defect — it is the same bargain UI §9
records for a borrowed class name. The plugin styles the box, not what the renderer puts
in it.

### Image: storage is markdown, and the value is an embed (question 4)

**No. `fenced` storage cannot carry a wikilink, and §4.2's Image entry is amended
here.** Constraint 2 is unconditional and its reason is exactly the one that matters for
a picture: Obsidian does not index links in fenced blocks, so **renaming the image file
would silently break the sheet** — which is the single most common way a vault reference
goes stale, and the failure class every image issue in the research belongs to. Fantasy
Statblocks 97 is the same shape failing two ways in one parser: `image: "[[image.jpg]]"`
rendering nothing and `image: [[image.jpg]]` crashing the render. A structured container
is the wrong place for a link.

So **Image stores `markdown`, and the section body is the embed the user would have
written anyway**:

```markdown
## Portrait

![[Sildar Hallwinter.png]]
```

Everything follows from that one change and every part of it is a gain:

- Rename propagates, backlinks resolve, and the graph sees the file.
- The note is readable and hand-editable as ordinary markdown, and **the portrait
  actually shows in markdown view**, where a fenced `path: Portrait.png` would have shown
  a code block.
- It matches Table's precedent exactly: the component that holds links stores markdown.
- The value is written in the vocabulary the reader already knows, which is the same
  argument that settles sizing below.

**Only the embed form is accepted.** Not a bare path (it would not propagate on rename,
which is the whole point), and not `![](…)` (see question 5). `parse/wikilink.ts` gains
`parseEmbed(text)`, returning the target and the raw text after the pipe, sharing that
file's existing bracket reading — one module knows this syntax, which is §1's policy
tier again. Its header already discusses the embed form; it grows a sentence rather than
a second job.

`ImageData` holds **the source line as written**, so the pipe options survive
byte-for-byte, and `write` returns the body unchanged when the source has not changed —
Rich text's rule, on a value that happens to be one line.

### Image: no external URLs (question 5)

**An external URL is not a legal Image value.**

Meta Bind 357 shows the demand is real, and the answer is a plugin-policy answer rather
than a taste one. `AGENTS.md` and Obsidian's Developer Policies both say default to
local and offline operation and make network requests only where essential. An
`<img src="https://…">` the plugin wrote is a request the plugin made on the reader's
behalf, on **every render of the sheet**, to a host named in someone else's note — which
leaks the reader's address and, through the URL, which sheet is open, and does it
silently. It is one notch down from evaluating a layout as code, and it is the kind of
thing Obsidian's plugin review asks about.

**And there is a positive answer available, which is why this is not a refusal.**
Obsidian renders `![](https://…)` in a note perfectly well, under the app's own settings
and the app's own disclosure. A reader who wants a remote picture writes it in a **Rich
text** block, where the app's renderer makes the request rather than this plugin. So the
demand is met by the component beside it. **This is the coupling that made this one
document**: the answer only works if both ship together.

### Image: sizing (question 8)

**Image fills its placement, and the picture fits inside it — `object-fit: contain`,
centred, aspect ratio preserved, never cropped and never distorted.** The size hint in a
stored embed is preserved in the file byte-for-byte and **ignored on the sheet**.

§8 is not bent by this, it is read correctly. The *component* fills its placement, which
is what §8 asks; a picture is what the component draws inside it, and a picture is not a
rectangle a plugin may stretch. Card set's `fixed` is the named exception to filling a
placement and this is not a second one — the box is the full placement in both
directions.

The convergent prior art is width-and-height with one dimension preserving the ratio
(CSB's Picture, Obsidian's own `|100` and `|640x480`), and the reason **not** to adopt it
as configuration is §8's own sentence: "The grid is the sizing control: an author who
wants a small card places a small component, and a component that second-guessed the
placement made the grid look broken wherever it disagreed." A width on the component
would be a second sizing control disagreeing with the first, and honouring a size hint
out of a *character's* note would let one character's portrait float centred in a box the
*layout author* sized — which is the exact thing §8's first bullet forbids. So the
plugin invents no config keys for this and overrides none of the reader's, and the file
keeps saying what markdown view will keep honouring.

Sandbox System Builder's crop-to-a-frame recipe is the lone counter and it is a CSS
snippet for a system with no image component and no grid — a workaround for the absence
of a placement, not an argument against having one. Cropping also destroys information
the author put in the file, silently, which is the wrong default for a portrait.

### Image: "click to change" is a field, not a picker (question 6)

**The field is the picker.** Clicking the picture — or the empty frame — focuses a
one-line field holding the embed's own text, `![[Portrait.png]]`. It is the same stacked
arrangement Rich text uses, the same `editable.ts` commit-and-Escape policy, and the same
gesture as every other stored value on the sheet. The field is one line tall, vertically
centred in the box, over the box's own background so the picture does not read through
the text, and invisible-but-tabbable when unfocused.

The alternative is a file suggester, and three things rule it out:

- **It is app-shaped in a way the seam cannot absorb cheaply.** It would be a third
  context member with its own keyboard model, and UI §9 already records the shape of that
  problem: "`ConfirmModal` takes an `App` and `RenderContext` carries no route to one, so
  a component's only confirmation surface is the card itself."
- **What it would list is every file in the vault**, which needs a scoping query — Meta
  Bind's `optionQuery` — and that is a config key §4.2 promised this component would not
  have. Meta Bind's own answer is to split picking from showing into two fields, which is
  two components' worth of surface for one portrait.
- **The plugin already has an answer for "a choice from a closed list"** and it is a
  native `<select>` (UI §9). A vault is not a closed list.

The field also gets the gesture for free: Obsidian's own paste-a-file-into-a-note
produces exactly `![[…]]`, so the text the reader is handed everywhere else is the text
this field takes.

**§4.2's "click to change" is honoured and narrowed here**: a click changes it, by
editing its text rather than by choosing from a list.

### Failure, and where the reader is looking (question 7)

Promoted, because every image failure in the research is silent: an empty div with the
diagnosis in the console (FS 300), a broken-image icon (FS 455), a value reverting with
no warning at all and "console is not outputing any warning nor error" (CSB 497).

**Every one of these puts UI §9's shared inline error where the component's name is
already on screen** — which is two different places, and an earlier draft of this
paragraph said only the first. A failure `render` raises draws `.sheetsmith-error`
inside the component's own frame, under the label the component has already drawn.
A failed **`read` never reaches `render` at all**: `view/grid-cells.ts` replaces the
whole cell and prefixes the message with the component's label, so there is no frame
and no label row, and the name arrives as `Portrait: …`. Both satisfy the clause that
is actually load-bearing, and it is how this feature avoids adding a new instance of
UI §12's "error card renders without its component name" row: the row's actual complaint is that
"the error replaces the whole card including its heading, so nothing on screen says which
component failed". Both components here **draw their heading first and put the error in
the frame below it**, so the name is on screen whichever path raised the failure — and
neither component prefixes itself, so the labelled `read` path the view already composes
does not say it twice. The row is untouched and no case is added to it.

| What happened | Where it is known | What the reader sees |
| --- | --- | --- |
| Image: the body is not an embed (`Portrait.png`, or prose) | `read` | `A picture is an embed: ![[Portrait.png]].` — and this path is the *labelled* one, since the view prefixes a failed `read` with the component's label |
| Image: the body is an embed naming a web address (`![[https://…]]`) | `read` | `"https://…" is a web address, and a picture has to be a file in this vault. Put a remote picture in a Rich text block instead, where Obsidian fetches it under your own settings.` — the labelled path again, and a *second* read message rather than a reuse of the one above, because the fix differs: that one is fixed by writing the bracket form and this one by using a different component. **Added after the build**: question 5 settles the refusal and §4.2 records it, but this table was written with four rows and the code shipped five. It is also the longest user-facing string either component has, at 200 characters with a real URL in it, and it was the only failure state with no sample — so nothing had drawn it until a review asked. Drawing it found the defect: an unbreakable URL painted through the error box's border, 211px of text in a 205px box, now fixed on `.sheetsmith-error` itself since any component's message can name a path or a formula with no space in it |
| Image: the target names no file in the vault | `render`, `resource()` returned null | `No file in this vault is called "Portrait.png".` in the frame, under the label |
| Image: the file is not something the browser can draw | `render`, the `<img>` fired `error` | `"Notes.md" is not a picture.` in the frame, under the label. The plugin holds no extension list, so it reports what happened rather than predicting it — which is the one shape of FS 455's bug that cannot be written here |
| Image: the section is empty or missing | `read` returns `data: null` | **Not an error.** An empty frame, the label above it, and a field whose placeholder is `![[Portrait.png]]` — the syntax, in the idiomatic place |
| Rich text: the section is empty or missing | `read` returns `data: null` | **Not an error.** The box, and a field whose placeholder is `Write anything.` One click from typing |
| Rich text: any body at all | — | **Never an error.** Every body is legal text |
| Rich text: no renderer (harness, unit tests) | — | **Not an error.** Paragraphs, with links live. The truth of what is available, which is `LinkContext`'s own bargain |

PATTERNS §4's rule holds on all of them: the text names the fix. `A picture is an embed:
![[Portrait.png]].` is the fix written out; `"Notes.md" is not a picture.` names the file
to change.

**A `data: null` empty state is not a failure**, per PATTERNS §4 — "a missing section, an
empty fence, and a fence without this component's key all mean the same thing: an
editable empty card." Both components render editable and empty, and the first commit
writes the section.

### What the harness substitutes

`harness/harness.ts` already builds a `linkContext()` whose comment states the standard:
"what this adds is the two things only a vault can answer… Everything resolves except one
target, so both link states are on screen at once."

- **`resource`**: the same shape. A small inline SVG data URI for the sample portrait, so
  a real picture is on screen and its fit inside the box is reviewable; `null` for one
  deliberately missing target, so the unresolvable error is on screen beside it; and a
  non-image data URI for a third, so the load failure is on screen too. Three samples,
  three states, no binary asset in the repository.
- **`renderMarkdown`**: **deliberately absent**, so the harness draws the fallback. The
  alternative is a second markdown implementation in the stub, in a repository whose whole
  point is not to have one, and it would drift from Obsidian's. The cost is stated above
  and is bounded.

Image's read error (a body that is not an embed) belongs in `brokenSamples()`, which UI
§12 explicitly invites: "Whoever adds the next one needs only an id and a body: the
mechanism is there."

## Config fields

Both components. `label` is shared config the editor owns and is never redeclared
(`EDITOR_OWNED_KEYS`), so `hideLabel` is the only declared field on each — which makes
these two the seventh and eighth components to carry it, and its wording follows the six
that already do.

**Rich text** — `src/components/rich-text.ts`

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `hideLabel` | `boolean` | Hide the label | Draws the block with no name over it, for prose that reads as prose rather than as a named section. The text is unaffected, and the note keeps its heading either way. |

**Image** — `src/components/image.ts`

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `hideLabel` | `boolean` | Hide the label | Draws the picture with no caption over it, which is usually right for a portrait. The picture still announces itself by the label to assistive tech, and the note keeps its heading either way. |

**No palette entry on either.** §4.2's rule is that "an entry earns its place where a job
an author would go looking for is one component's configuration away, and the name of the
component that does it would not lead them to it." Neither has any configuration for an
entry to prefill, and "Backstory" would be a Rich text with nothing filled in but a
label the author is about to change. §4.2 also warns that "a menu nobody can read is
worse than the type list it replaced."

**Nothing else.** In particular, no placeholder key on Rich text despite Card's
`notePlaceholder` precedent, and no width, height or fit key on Image. §4.2 promised both
components `label` and nothing else, and both refusals have arguments above; either is
one config field away if a real case turns up.

## Data and file model

### Rich text

Storage `markdown`. `RichTextData = { text: string }` — one field, held flat, since
PATTERNS §7's delta rule protects siblings and there is no sibling.

```markdown
## Backstory

Grew up in [[Neverwinter]] under [[Sildar Hallwinter]].

- Owes a debt to the [[Zhentarim]]
- Cannot swim
```

`read` returns the body with the whitespace run at each end removed, or `data: null`
where nothing but whitespace is left. `write` returns the body unchanged when the text
has not changed, and otherwise re-inserts the new text between the body's existing
leading and trailing whitespace runs. A missing section writes `\n${text}\n`.

There is no reserved syntax and nothing to escape: a body holding a fence, a heading or a
table is content, and Rich text renders it as such.

### Image

Storage `markdown`. `ImageData = { source: string }`, the embed exactly as written.

```markdown
## Portrait

![[Sildar Hallwinter.png]]
```

`read` accepts a body whose only non-whitespace content is one embed, returns
`{ ok: false }` naming the fix otherwise, and returns `data: null` for an empty body.
`write` follows Rich text's rule on a one-line value. The text after the pipe —
`![[Portrait.png|200x300]]` — is stored and preserved and not read by the sheet.

### Both

- Constraint 2 is satisfied by construction: neither component writes a fence at all.
- Constraint 3 is satisfied by construction: an unchanged value returns the body
  identically, since the body *is* the value plus its own framing.
- Constraint 4 has nothing to protect yet — no note holds either section — and neither
  `write` ever removes text it did not place.
- §10's "a section without a data block is empty, not malformed" reads cleanly: an empty
  section is an editable empty block in both.

## Acceptance criteria

**Ticked from `/spec-review`'s report, not from this session's own reading**, which
is why most boxes are still open after the work is committed. Five of Image's are
ticked: the ones that report named as met *and* whose wording it adjudicated. The
rest are open for three different reasons, and none of them is "probably fine":

- **Image, three boxes.** `object-fit`, the harness states, and the errors-under-a-
  label wording all changed *after* the report — the first because a design review
  found `object-fit` inert as written, the other two in response to spec findings 1
  and 3. The report judged the old text, so ticking them now would be this session
  grading its own corrections.
- **Image, two boxes.** Registration and the press gesture are met on this session's
  reading and were not named in the report either way.
- **The seam, Rich text, and Both — twenty boxes.** No `/spec-review` covers the
  Rich text half at all. It was built first, went through `/patterns-review` and a
  design pass, and then the session moved to Image; the spec axis was never run over
  it. That is the gap, and `Status:` stays `draft` until it is.


**The seam**

- [ ] `RenderContext` declares `renderMarkdown` and `resource`, both optional, both
      documented against `link`'s reason for being optional.
- [ ] `src/components/` still imports nothing from `obsidian` beyond `setIcon`;
      `components/isolation.test.ts` passes unchanged.
- [ ] The view holds one child `Component` per render pass and unloads the previous one,
      asserted by a test that renders twice and checks the first child was unloaded.
- [ ] A `renderMarkdown` result landing after its pass was unloaded writes nothing.
- [ ] `wikilink.ts`'s header states why the renderer is right for a block and still wrong
      for a cell, and Table does not take `renderMarkdown`.

**Rich text**

- [ ] Registered in `components/index.ts` with one line, and `contract.test.ts` passes
      with no change to the contract.
- [ ] `read` never returns `{ ok: false }`, over a body that is empty, whitespace-only,
      a fence, a table, and a heading.
- [ ] Round-trip: `write(read(body), body)` returns `body` byte-for-byte, over a table of
      bodies with unconventional spacing (no blank line after the heading, several
      trailing blank lines, CRLF).
- [ ] An edit changes only the prose: the leading and trailing whitespace runs of the
      body survive it.
- [ ] With `renderMarkdown` supplied, the box holds what the renderer produced and the
      fallback painter was not called.
- [ ] Without it, the box holds one `<p>` per blank-line-separated paragraph, and a
      wikilink inside prose is an `a.internal-link` carrying `href` and `data-href`, with
      `is-unresolved` where `link.resolves` says so.
- [ ] The block's height is its placement's, and content longer than the box scrolls
      inside it — checked in the harness at a placement smaller than its content, with
      nothing below it moved.
- [ ] The field is in the DOM and in the tab order whether or not it is focused.
- [ ] Enter inserts a newline and commits nothing; blur commits; Escape restores the
      stored value and announces the restore.
- [ ] A press on a rendered link does not focus the field; a press anywhere else does.
- [ ] An empty section renders the field with its placeholder and no error.

**Image**

- [ ] Registered in `components/index.ts` with one line, contract unchanged.
- [x] `parseEmbed` reads `![[Target]]`, `![[Target|200]]` and `![[Target|200x300]]`,
      and refuses `[[Target]]`, `![](path)`, `![](https://…)` and a bare path.
- [x] Round-trip: an unchanged embed returns the body byte-for-byte, pipe options
      included.
- [x] The `<img>` `src` is exactly what `resource()` returned; nothing in `src/` matches
      a search for an image file extension.
- [x] `alt` is the component's label where the visible heading is hidden and empty where
      it is drawn.
- [ ] The picture fills its placement with `object-fit: contain`; a tall picture in a wide
      box and a wide picture in a tall box are both whole and undistorted in the harness.
- [x] A stored `|200` changes nothing about how the sheet draws it, and survives the
      round-trip.
- [ ] Each of the four states in question 7's table is on screen in the harness: a
      drawn picture, an unresolvable target, a non-image file, and an empty frame.
- [ ] Every one of those errors reaches the reader with the component's name on
      screen, and none of them writes to the console. **Two paths, not one:** a
      failure `render` raises goes in the frame under the label the component drew,
      and a failed `read` never reaches `render` — the view replaces the cell and
      prefixes the label, so `Portrait: A picture is an embed: …` is the whole of
      what is drawn. An earlier wording of this line said "drawn under the
      component's own label" of both, which is true of the first and not the second.
- [ ] A press on the picture focuses the field; Escape restores and announces.

**Both**

- [ ] `npm test`, `npm run lint` and `npm run build` pass.
- [ ] Neither component declares `scopeValues`, `scopeRows`, `applyReset` or `hasBuffer`,
      and neither appears in any name a formula can resolve.
- [ ] Neither draws a border, panel or surface the sheet does not already have a name for
      (UI §9).
- [ ] Both are placed in the throwaway test vault in more than one shape — a wide
      backstory, a small captioned box, a portrait, a symbol — per the working note that a
      component is not done until its variations are in the vault. **Name the files
      here when they are written**, because nothing in the repository can evidence
      this and a reviewer would otherwise have to take it on trust: Rich text is
      `Sheetsmith layouts/Rich text variations.json` with `Characters/Prose.md`, and
      Image is `Sheetsmith layouts/Image variations.json` with
      `Characters/Pictures.md` plus three generated `.png` files at different aspect
      ratios, each holding a circle so a stretch shows as an ellipse.

      **What each holds, so a clone can rebuild it.** This is the half PATTERNS §2
      actually asks for and the half that was missing: the fixture lives outside the
      repository by Constraint 6, which is correct, but its *recipe* was nowhere, so
      a reviewer on another machine could neither check the claim nor recreate the
      thing. Rich text: thirteen placements across nine shapes from `1×4` to `6×3` —
      a wide backstory longer than its box, a short one beside it in the same box, an
      unlabelled creed, an empty notes block, a hand-written section with ragged
      spacing, a section absent from the note entirely, one inside a Group and one
      inside a Tab set, a one-column-by-four-rows column of prose, and a block of
      embeds including a remote picture. Image: fourteen placements across six
      shapes — the same file in a wide box and a tall one, a 24×24 sigil in a 2×3
      box, a stored `|200x120`, an unlabelled portrait, a missing file, a markdown
      note as the target, a one-row frame, one inside a Group and two as tabs. Both
      notes keep one `##` section the layout does not map, so §10's retention is on
      screen. The images are solid fills with a lighter disc in the middle, at
      300×420, 480×260 and 24×24 — any three files of those sizes will do, and the
      disc is the point: a circle drawn as an ellipse is the only thing that shows a
      stretch, and the harness learned that the hard way when its sizeless SVGs hid
      it.

      **And the one check that exists nowhere else and cannot**, which is why the
      criterion is not a formality: **rename the picture in Obsidian and confirm the
      embed rewrites, the sheet keeps drawing, and backlinks and graph view both see
      it.** That is the whole argument for markdown storage over `fenced`, and it is
      unreachable from a unit test, the harness, or a still — the fixture note says
      so in its own prose so whoever opens it knows what to press.

## Commit boundaries

Applied once, at the end, when the user says the change is settled. Not a schedule to
follow while building.

0. **Reconciled against the tree after three review passes.** Boundaries 1, 5, 7
   and 8 below were added *after* the build, each because a review found work in
   the tree that no boundary held. Recording that here rather than silently
   renumbering, because the pattern is the finding: **every one of them is a
   shared-vocabulary extraction or a shared-path fix that a new component
   provoked**, which is exactly the class this plan could not have listed in
   advance — you do not know what the second consumer will share until it exists.
   A plan written before the build is a plan that will need this pass.

1. `refactor: Give a component's own name one rank`. The uppercase, tracked,
   muted `--font-ui-smaller` rank was written out five times — the card face,
   Pool, Track, and then both new components — because the agreement lived in each
   file's comment rather than in a name, and `docs/UI.md` §9's vocabulary table had
   no row for it. `.sheetsmith-component-label` in `styles/sheet.css`, added
   *beside* each component's own class so nothing renames, with `card-face.ts`,
   `pool.ts` and `track.ts` asking for it. Each component keeps its own class for
   the narrow-card override, which three of the five have and two cannot — those
   three set `container-type` on their own card, so a container query has a card to
   ask about. **First, and it touches four components this feature otherwise never
   opens**: both new components stand on it, and the alternative was adding a sixth
   and seventh copy. `pool.test.ts` comes with it — one case asserted exact
   `className` strings while its claim was about child *order*, so it broke on any
   added class. Additive and behaviour-neutral: verified by re-shooting the sheet
   at 1400px and 380px, where the labels are identical and the narrow override
   still fires.
2. `refactor: Take the linked-text painter out of Table`. `paintText` moves to
   `src/components/linked-text.ts` with its header rewritten for two consumers and §1's
   policy argument in it; `table.ts` imports it; the existing tests move or stay put as
   they read best. No behaviour change, and it lands first because both halves of the
   feature stand on it.
3. `feat: Add a free markdown block to the catalog`. `.sheetsmith-placed` and
   `.sheetsmith-placed-box` land here rather than as a refactor of their own, and
   the distinction from boundary 1 is worth stating because a review asked: that
   rank was extracted *from committed code*, so it is a `refactor:`, while the
   placed box's only two consumers are both new in this feature — there is nothing
   to refactor against `HEAD`, so the shared class is simply how the first of them
   is written, and Image joins it at boundary 6. `rich-text.ts`, its multi-line
   binding in `editable.ts`, the stacked box and its styles, the fallback render, its
   registration, its tests and its harness sample. The block renders paragraphs and links
   at this commit and the app is not yet asked for more.
4. `feat: Draw a Rich text block with Obsidian's own renderer`. `RenderContext.renderMarkdown`,
   the view's per-render child `Component` and its unload, the component taking the member,
   and `wikilink.ts`'s amended header.
5. `refactor: Share the body framing between the two markdown components`.
   `parse/markdown-body.ts` takes the whitespace framing that was private to
   `rich-text.ts` — `bodyText` and `writeBodyText`, the rule that a body which *is*
   its value returns byte for byte when unchanged and keeps its own two whitespace
   runs when it does not — and `rich-text.ts` starts importing it. **Added after the
   build**: this boundary was missing, and it is the same shape as boundary 1 in
   every respect, which is what settles it. An extraction from an existing file,
   triggered by the second consumer arriving, landing as a `refactor:` immediately
   before the feature that needs it, with no behaviour change — `linked-text.ts` got
   exactly that treatment before boundary 2. It is §1's one-step policy tier for the
   same reason too: what is shared is *where the text starts*, and a guard test over
   two copies could only assert they still agree to the character.
6. `feat: Add a picture to the catalog`. `parseEmbed` in `parse/wikilink.ts`,
   `image.ts`, `RenderContext.resource` and the view's two-call implementation, the frame
   and its `object-fit`, the three failure paths, its registration, its tests, and the
   harness stand-in with its three states.
7. `fix: Put focus back inside the component that lost it`. `view/cell-focus.ts`
   resolves a saved control index past the end of a cell to the cell's last
   control instead of returning silently and dropping focus to the body — which is
   the outcome PATTERNS §5 records as the reason not to repaint a cell
   optimistically. Rich text's asynchronous render is what made it reachable: its
   layer is tabbable while the field is not focused, so Shift-Tab out of the next
   component lands on an anchor, that same press commits and rebuilds, and the
   anchor is not drawn again until a microtask later. Its own commit and after
   boundary 4, because it fixes the view's shared focus path for every component
   rather than anything about a prose block — a table row deleted under the caret
   was already reaching it silently.
8. `fix: Let an inline error wrap the thing it names`. `.sheetsmith-error` in
   `styles/shared.css` takes `overflow-wrap: anywhere`. The messages this plugin
   writes name file paths, formulas, column keys and web addresses — tokens with no
   space to break at — and one longer than its box painted straight through the
   border: measured at 211px of text in a 205px box on Image's remote-URL refusal,
   the only one of twelve errors on the harness's error view to overflow. Its own
   commit and after boundary 6, because it changes how *every* component's failure
   renders and it was Image that exposed it rather than Image that needs it.
9. `docs: Record what the last two entries settled`. §4.2's Image entry (markdown storage,
   the embed form, sizing, the click gesture, `hideLabel` on both), §3's format-follows-the-component
   bullet if it needs a word about a body that is one embed, §12's component order and
   count, §13's new question about what a string type would unlock, and `docs/UI.md` §9's
   vocabulary rows for the linked-text painter and the stacked prose box.

## Deliberately not doing

- **An image inside a table row.** `column-types.ts` has five types and a sixth is its own
  feature, in the same class as the `link` column §13 parked. It is also where the only
  sizing complaint in the research lands (CSB 295, thumbnails "horribly stretched"), which
  is a different question from a placed component's fit.
- **The renderer in a table cell.** The member exists on the context and Table declines
  it, for the three reasons in `wikilink.ts`'s header that are still true of a row. That is
  a separate and larger decision.
- **An external URL as an Image value** (question 5), and any network request of the
  plugin's own. Rich text carries the case, under the app's own rules.
- **A file suggester** (question 6), and with it any scoping config key.
- **Sizing configuration on Image**, in any spelling: no width, no height, no fit, no
  crop. The grid is the sizing control (question 8).
- **A markdown-rendering toggle**, on either component. 27 months of prior art says the
  toggle is what needs fixing.
- **A placeholder config key on Rich text**, despite Card's `notePlaceholder`. One fixed
  placeholder, and §4.2's promise of `label` and nothing else kept.
- **Publishing either component to the name table** (question 9), which is undecidable
  usefully until the formula language has strings.
- **A markdown implementation in `src/test/obsidian-stub.ts`**, and therefore full
  markdown in the harness. The cost is stated under the fallback.
- **Interactive content inside a rendered embed.** Links work; a task checkbox in an
  embedded note does not.
- **Pasting a file into a Rich text block or an Image field.** Obsidian's paste handler
  belongs to its editor, not to a `<textarea>` on a sheet; the reader pastes the embed
  text, which is what the app puts on the clipboard for a file anyway.
- **UI §12's error-card row**, the layout picker split, render-time validation, and the
  `isolation.test.ts` flake. All four have their own backlog rows, and question 7 is
  explicit about not adding an instance to the first.
