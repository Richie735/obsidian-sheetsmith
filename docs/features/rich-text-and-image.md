# Rich text and Image

Status: shipped
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
 *
 * `onFailure` is a required third argument, not an optional one — see below.
 */
renderMarkdown?: (
	markdown: string,
	into: HTMLElement,
	onFailure: () => void,
) => void;

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

**And the same module wires the anchors the *renderer* drew**, which is not a symmetry
but a repair. `paintLinkedText` attaches the press and the hover to each anchor as it
paints it, and it runs only on the fallback path — so in Obsidian, where the app's
renderer draws its own anchors instead, nothing was listening: a wikilink in a backstory
worked in a unit test and in the harness and did nothing in the app. External links went
on working throughout, because those are Electron's to open and never this plugin's, which
is what made it look like a wikilink problem rather than a wiring one. `adoptRenderedLinks`
delegates one listener on the layer — delegated because the renderer is asynchronous and
may replace what it drew, so there is no moment at which the anchors are all present to
walk. It adopts rather than repaints, since the renderer writes `internal-link` and
`data-href` itself.

**It does not write the resolution state, and that was a second report.** With the
presses working, every link in a backstory still painted as live whether or not the
note existed — `is-unresolved` comes from the app's own preview machinery and not from
a detached `render()` call, so nothing applied it. `markRenderedResolution` is the other
half, and it is called from `view/markdown-pass.ts` rather than from the component: a
class has to go on anchors that already exist, and the only place that knows the render
landed is the pass that started it. The rule itself stays in `linked-text.ts` so the two
paths cannot disagree about what an unresolved link looks like. It clears as well as
sets, because a note created since the last render has to stop being dimmed.

That is where `table.ts`'s private `paintText` goes. Its own header says so: "Rich text
is the obvious second consumer and is not built, and PATTERNS §1 says a painter moves
out on the second consumer rather than in anticipation of one." It moves to
`src/components/linked-text.ts`, a painter beside the components in the manner of
`card-face.ts` and `level-ring.ts`. §1's ladder agrees at two rather than three here,
because what is shared is a **policy** — `internal-link`, `is-unresolved`, both `href`
and `data-href`, `title` and never `aria-label`, and the rule that a link paints as
resolved where there is no vault. Drift between two copies of that set is the entire
risk, and a guard test could only assert they still spell the same thing.

**The branch is exclusive up front: with a renderer the fallback is not drawn first.**
Painting the fallback and letting the renderer replace it would give a synchronous first
frame, and it would also flash raw `# Heading` before every rendered heading on every
rebuild — and a sheet rebuilds on every edit anywhere on it. A momentarily empty box is
cheaper than that.

**The one case where both run is a renderer that rejects, and it is why `onFailure` is a
required third argument rather than an optional one.** `MarkdownRenderer.render` returns
a promise, and a post-processor from a theme or another plugin can throw inside it. The
render is asynchronous, so the component has already returned by the time that happens
and has no other route to hear about it — and the box it left empty on the strength of
the exclusive branch above would simply stay empty, under a filled-in label, with the
prose still in the note and nothing on screen saying so. That is the one way this
component can look like it lost somebody's words, which is a worse failure than any it
was built to report.

So the rejection falls back to the fallback: the component draws exactly what it draws
with no renderer at all, because that is the case it already handles. **Not an error
message**, per PATTERNS §4 — a theme's post-processor throwing is not something the
reader caused or can fix, so there is no fix for the text to name, and the reader would
rather have their prose than be told it exists somewhere else. Required rather than
optional because a renderer that can fail and a consumer that ignores it is the defect;
making it optional makes the empty box the default. Not called once the pass has ended,
since the element is detached by then and what it drew would belong to nothing.

**Added during the build and recorded here afterwards.** The snippet above shipped with
two arguments and this paragraph did not exist; the behaviour is argued in `types.ts`,
`view/markdown-pass.ts` and `components/rich-text.ts`, and a review found the doc had
none of it.

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

So: the block is `width × height` grid units and a long backstory scrolls. **The
`overflow-y: auto` is on the two layers rather than on the block** — they are what hold
the text, and they are out of flow inside the box precisely so nothing inside can decide
its height. Same outcome; worth stating exactly, because it is also why each layer
scrolls on its own (departure 3). An author who wants a taller box places a taller component, which is §8's own
sentence — "the grid is the sizing control".

**The gesture is the sheet's own stacked edit, not a second editor.** UI §9 already
settles the shape: "Rendered text and the field that edits it are stacked, never
swapped… the field stays in the DOM and in the tab order in both states, which is what
keeps the view's focus restoration counting the same controls across a rebuild." Both
layers fill the box. Unfocused, the rendered layer is opaque over a field that is
invisible but present and tabbable. Focused, the rendered layer is hidden and the field
is the box.

**"Invisible" is `color: transparent`, and it does not take the spelling marks with
it — which is a consequence of this decision, not a separate feature, and it was
found by a review of the shipped code rather than written here first.** The
suppression is of the glyph fill alone; the marker is decoration the engine paints
independently, so an unfocused field's squiggles come through the layer above it,
positioned by the *source* line rather than by where the rendered word ended up, and
left behind entirely once the two layers scroll apart. Both harder ways to hide the
field are ruled out by rules the stacking exists for: `visibility: hidden` takes it
out of the tab order, and `opacity: 0` takes the placeholder, which is the empty
state's only affordance. So the field is marked only while it is the visible layer —
`src/ui/spellcheck.ts`, a toggle rather than "off", since spellcheck while writing a
backstory is worth having.

**It changes a third component, and that is the part worth recording rather than
tidying away.** `table.ts` stacks a link layer over a transparent-text field in
exactly this pattern, so it already had this defect in shipped code — `[[Sunblade|sword]]`
is not two words, and the marks landed on the rendered link. This feature did not
introduce it there; it produced the second and third instances of it, which is what
made the rule shared (PATTERNS §1's policy tier: what is duplicated is the
invariant "what is not visible is not marked"). A feature whose plan touches Table
only to take a painter *out* of it therefore also changes Table's behaviour, which
nothing here agreed in advance. The record is the point: it shipped unasked-for, a
`/spec-review` found it, and it is kept rather than reverted because the alternative
is the defect in three places or the rule spelled three times.

**The rendered layer answers the press itself, and that is the fourth departure — found
by measurement, not by design.** This paragraph first said what the cell does: only the
links take a press, everything else falls through to the field. That spelling is
`pointer-events: none` on the layer, and it shipped. A cell is one line with nothing to
scroll; **this layer is a scrollport**, and a scrollport that is not a hit target never
receives a wheel — so the gesture went to the *invisible* field behind it, which scrolled
150px in a real browser while the visible prose stayed at 0. The layer is now the pointer
target and routes the press in `rich-text.ts`: a link owns its own, a drag that selected
text is left alone so a backstory can be copied without entering edit mode, and
everything else focuses the field. `styles.test.ts` forbids the declaration by name, as a
scan rather than a look, because this is the class PATTERNS §10 names — a still cannot
show a scroll and happy-dom has no hit testing, so the harness and every unit test signed
the regression off.

Three departures from the cell's version of that pattern, each with its reason, because
a shared gesture is only shared if the differences are stated:

1. **The rendered layer is hidden on focus rather than left transparent.** In a cell the
   two layers hold the same one line of text in the same shape, so they can overlap. Here
   they hold the same text in two *different* shapes — a rendered heading is not the
   height of its source line — and two differently-shaped copies of one text overlaid
   would be unreadable.
2. **The caret is not placed from the click.** A click at a given point in the rendered
   view is not the same character in the source, so there is no landing position to
   preserve and pretending otherwise would put the caret confidently in the wrong place.
   This first read "the caret lands where the browser puts it and is not moved", which
   stopped being true with the departure above: the layer answers the press and calls
   `preventDefault`, so the browser never reaches the field and places nothing. The
   *reason* is unchanged, which is why the departure stands — the position given up was
   never meaningful. It lands at the start of the text, chosen rather than inherited:
   assigning `value` moves the cursor to the end of the control and focusing scrolls it
   into view, so a long backstory opened at its last line, measured in Chrome at
   `scrollTop` 2062 of a possible 2062.
3. **The box never changes size, but its scroll extent does.** UI §9's rule is that
   nothing reflows under a pointer resting on the cell, and it holds where it was
   written: the placement is fixed, so nothing on the sheet moves. Each layer scrolls on
   its own, because they hold the same text in two different shapes and one shared
   offset would put them out of step. This first added that a focused field "scrolls to
   its caret, which is what the reader asked for by clicking", and departure 2 is
   precisely that there is no such caret. **The reader's place is not carried across**,
   and that is an accepted cost with a row in UI §12: scroll to paragraph twelve, click,
   and the field opens at paragraph one.

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
and no label row, and the name arrives as `Portrait: …`. **This paragraph records the
mechanism and never asked what happens next, which is the defect a user report found:
a replaced cell has no field in it.** Image is the first component whose own editing
gesture can produce a body its `read` refuses — type `![](https://…)`, blur, and the
sheet rebuilds into a cell with nothing to edit, so the only way back is markdown view.
Rich text cannot reach it because its `read` never fails, which is why nobody hit it
before. **So Image's `read` no longer fails either**: all four of its failures are
raised in `render`, in the frame, with the field still there to fix them, and the
component names itself in the message where it drew no heading. The rows below are
marked accordingly. Both satisfy the clause that
is actually load-bearing, and it is how this feature avoids adding a new instance of
UI §12's "error card renders without its component name" row: the row's actual complaint is that
"the error replaces the whole card including its heading, so nothing on screen says which
component failed". Both components here **draw their heading first and put the error in
the frame below it**, so the name is on screen whichever path raised the failure — and
neither component prefixes itself, so the labelled `read` path the view already composes
does not say it twice. The row is untouched and no case is added to it.

| What happened | Where it is known | What the reader sees |
| --- | --- | --- |
| Image: the body is not an embed (`Portrait.png`, or prose) | `render` | `A picture is an embed: ![[Portrait.png]].` in the frame, under the label — and prefixed with the label by the *component* where it drew no heading, which is the only way this message is ever prefixed |
| Image: the body names a web address, in any of its three spellings — `![[https://…]]`, `![](https://…)`, or a bare paste | `render` | `"https://…" is a web address, and a picture has to be a file in this vault. Put a remote picture in a Rich text block instead, where Obsidian fetches it under your own settings.` — in the frame under the label again, and a *second* message rather than a reuse of the one above, because the fix differs: that one is fixed by writing the bracket form and this one by using a different component. **Added after the build**: question 5 settles the refusal and §4.2 records it, but this table was written with four rows and the code shipped five. It is also the longest user-facing string either component has, at 200 characters with a real URL in it, and it was the only failure state with no sample — so nothing had drawn it until a review asked. Drawing it found the defect: an unbreakable URL painted through the error box's border, 211px of text in a 205px box, now fixed on `.sheetsmith-error` itself since any component's message can name a path or a formula with no space in it. **The spelling was wrong too, and a later review caught it**: this row was keyed on the embed form, the code tested `parseEmbed` first, and so `![](https://…)` — the spelling question 5 names as the demand that exists, because it is the one Obsidian renders — got the *syntax* message instead. Following that advice produces `![[https://…]]` and lands on this message one step later, which is PATTERNS §4 failing on the one body readers actually arrive with. `addressed()` in `image.ts` now finds the target ahead of the syntax refusal, so all three spellings get this message first time |
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

- **`resource`**: the same shape. Inline SVG data URIs for the pictures that resolve, so
  real pictures are on screen and their fit inside the box is reviewable; `null` for one
  deliberately missing target, so the unresolvable error is on screen beside it; and a
  non-image data URI, so the load failure is on screen too — genuine rather than
  simulated, since the browser really does refuse it. No binary asset in the repository.

  **Four targets feeding six placements, plus two `brokenSamples` overrides**, and this
  bullet said "three samples, three states" until a review counted them. What the extra
  ones buy is the sizing cases, which are not states of the *vault* and so were missed by
  a sentence organised around what only a vault can answer: one wide file placed in both a
  wide box and a tall one, which is the pair a stretch shows up in; a size hint in the
  embed, which the sheet ignores; and **a 48px file in a three-row frame, which exists
  because of a defect this document never absorbed** — with `max-width`/`max-height` and
  no size the element's box *is* the intrinsic ratio shrunk to fit, so `object-fit` never
  applied and the sigil drew at 48×48 in a 205×194 frame, a speck the author could not
  make bigger. `SPEC` §4.2 records the fix and its cost. The sample is what says so if it
  ever regresses, and the sizeless SVGs it replaced are what hid it. **It still cannot
  show what the upscale looks like**, though, which is the sample's own limit: every
  picture here is an SVG, so it scales losslessly and draws clean at any size, while a
  real 48px raster in a three-row box is visibly blocky — found in Obsidian, and not
  reportable by any shot taken here. §4.2's word for it was "soft" until then.
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

**A body that is only whitespace takes that same fresh shape rather than keeping its
runs**, which is the clause this paragraph was missing: preserving them literally would
give `body + text` with no trailing newline, and there is nothing there worth preserving
— `read` already calls such a body `data: null`, so the two agree that an all-whitespace
section is an empty one. `writeBodyText` tests `body === null || body.trim() === ''`
together for that reason.

Nothing is escaped, and a body holding a fence, a table or a heading is content — with
**one reserved line, which this paragraph used to deny outright**. `## ` at the start of
a line is the character note's own section delimiter (§3.1), so a body holding one splits
the note there: everything below the heading becomes a section the layout does not map,
and the block re-renders showing only what was above it. Put the heading first and the
block comes back empty. `#`, `###` and `##` with no space after it are all content and
must stay content; only `## ` at line start is reserved.

**The commit is declined, and that is a reversal.** The spec weighed two answers and
rejected both on principle — escaping would put a plugin's syntax into a file the user
owns, and failing `read` would make this the one body that is not legal text — and
settled on neither, guaranteeing instead that "nothing is lost from the file, and the
note still round-trips". **A user report showed that was the wrong criterion**: "Every
time I write an `##` and leave edit mode, the text is not saved… I tried to add a `##`
before them and all the block was gone." The bytes were in the file the whole time, in a
section nothing draws — so from the reader's seat it is silent destruction of everything
they typed, with no warning and nothing saying where it went, which is the exact failure
class this document was written against. It was worse than silent: `announceCommit` fired
"Backstory saved" at the moment the box emptied.

The third answer the original argument never considered is to **decline the write and
say why**, and neither original objection reaches it: nothing is escaped, and `read` is
untouched — every body that reaches it is still legal text, which is what that argument
actually cared about. So `bindMultiline` gains `refuse`, the field keeps the draft rather
than discarding it, and the message names the offending line and the fix: `Not saved.
"## After the fire" would start a new section in this note — use "### " instead.` The
draft is *shown* while refused, which needs a rule of its own: this field's text is
transparent unfocused, so a refusal left alone would put the stored prose back on screen
with an error under it and the reader's actual words invisible.

`parse/character.ts` exports `startsSection` for it, rather than the component holding a
second copy of the pattern — PATTERNS §1's policy tier, the same argument that puts
`parseEmbed` in `wikilink.ts`. It is scanned line by line with no fence awareness because
`parseCharacter` has none either: a `## ` inside a fenced block in a prose body splits the
note just the same, so the predicate gives the parser's real answer rather than a politer
one.

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

**Every box here is ticked from a `/spec-review` report, never from this session's
own reading of the code.** That rule is what the ticks are worth, so the trace is
written down rather than assumed: the first report covered the Image half and its
verdicts ticked six boxes; the second covered the whole feature over
`0197bbf^..c0e003e` and returned Met on every criterion it reached — two of them
with a qualifier, which the boxes concerned carry beside themselves — and that is
what ticked the rest. Where a box was rewritten between the two reports, the report that
ticked it is the one that judged the *current* wording — and where that is not true,
the box says so beside itself rather than in this paragraph.

**No count is written here on purpose.** This preamble used to name how many boxes
were ticked and how many were open, in two figures that were both off by one by the
time a reviewer read them, on the paragraph whose whole job is telling the next
reviewer what to cover. The list below is the count.

**One box is open, and it is not a gap in the work**: the throwaway-vault fixture.
Constraint 6 puts the vault outside this repository, so nothing here can evidence
what it holds, and the check it exists for — rename an image in Obsidian and watch
the embed rewrite while backlinks and graph view keep up — is unreachable from a
unit test, from the harness and from a still. It stays unticked until somebody opens
the fixture, and the checks that share that property are routed to the fixture's own
notes, listed under that box.

**The seam**

- [x] `RenderContext` declares `renderMarkdown` and `resource`, both optional, both
      documented against `link`'s reason for being optional.
- [x] `src/components/` still imports nothing from `obsidian` beyond `setIcon` — the
      `FROM_OBSIDIAN` half of `components/isolation.test.ts` is unchanged. **Its sibling
      allowlist necessarily grows**, and this box said "passes unchanged" until a review
      pointed out that commit boundary 2 cannot be met while that is true: extracting
      `linked-text.ts` adds two entries there and two in `eslint.config.mts`, one per
      import path. The isolation that matters is from the app, not from a sibling
      painter, and the sibling list is a declaration rather than a bound.
- [x] The view holds one child `Component` per render pass and unloads the previous one,
      asserted by a test that renders twice and checks the first child was unloaded.
- [x] A `renderMarkdown` result landing after its pass was unloaded writes nothing.
- [x] `wikilink.ts`'s header states why the renderer is right for a block and still wrong
      for a cell, and Table does not take `renderMarkdown`.

**Rich text**

- [x] Registered in `components/index.ts` with one line, and `contract.test.ts` passes
      with no change to the contract.
- [x] `read` never returns `{ ok: false }`, over a body that is empty, whitespace-only,
      a fence, a table, and a heading.
- [x] Round-trip: `write(read(body), body)` returns `body` byte-for-byte, over a table of
      bodies with unconventional spacing (no blank line after the heading, several
      trailing blank lines, CRLF).
- [x] An edit changes only the prose: the leading and trailing whitespace runs of the
      body survive it.
- [x] A draft holding `## ` at the start of a line is **not committed**: `onChange` never
      fires, the block draws `.sheetsmith-error` naming the offending line and `###`, the
      announcement is that message and never "saved", and the field still holds what was
      typed with the box in the state that shows it. `#`, `###` and `##NoSpace` all
      commit normally, and Escape leaves a refused draft and clears the message.
- [x] With `renderMarkdown` supplied and succeeding, the box holds what the renderer
      produced and the fallback painter was not called.
- [x] **A wikilink the *renderer* drew opens, previews and honours a modifier.** A press
      on `a.internal-link[data-href]` inside the rendered layer calls `link.open` with
      the `data-href` target and the original event, refuses the browser's default, and
      does not focus the field; a hover calls `link.preview`; an `a.external-link` is
      left entirely untouched. **This box is the one that was missing**, and its absence
      is why links shipped working in the fallback and dead in the app — every criterion
      here was written against the path no reader uses.
- [x] **A wikilink the renderer drew is dimmed when the vault holds no such note**, and
      undimmed once it does: `is-unresolved` is applied after each render lands, from the
      same `link.resolves` the fallback painter uses. The renderer does not apply it, so
      without this every link in a block paints as live — which is the same shape of gap
      as the presses and was found the same way, in the app rather than here.
- [x] With `renderMarkdown` supplied and rejecting, `onFailure` runs and the box holds
      what the fallback painter draws — never an empty box under a filled-in label, and
      never an error message.
- [x] Without it, the box holds one `<p>` per blank-line-separated paragraph, and a
      wikilink inside prose is an `a.internal-link` carrying `href` and `data-href`, with
      `is-unresolved` where `link.resolves` says so.
- [x] The block's height is its placement's, and content longer than the box scrolls
      inside it — checked in the harness at a placement smaller than its content, with
      nothing below it moved.
- [x] The field is in the DOM and in the tab order whether or not it is focused.
- [x] Enter inserts a newline and commits nothing; blur commits; Escape restores the
      stored value and announces the restore.
- [x] A press on a rendered link does not focus the field; a press anywhere else does.
- [x] An empty section renders the field with its placeholder and no error.

**Image**

- [x] Registered in `components/index.ts` with one line, contract unchanged.
- [x] `parseEmbed` reads `![[Target]]`, `![[Target|200]]` and `![[Target|200x300]]`,
      and refuses `[[Target]]`, `![](path)`, `![](https://…)` and a bare path.
- [x] Round-trip: an unchanged embed returns the body byte-for-byte, pipe options
      included.
- [x] **`image.read` never returns `{ ok: false }`.** A body it cannot use — prose, a
      bare path, two embeds, a web address in any spelling — reads back as a value, and
      the refusal is raised in `render`: the message is in the frame, the label is above
      it, and the field is present, editable and holding exactly what the note holds.
      Driven for every refusal, because the failure it protects against is a reader
      locked out of a value their own edit produced.
- [x] An Image that drew no heading — `hideLabel`, or inside a container that named it —
      prefixes its own error with the component's label, and never does so when the
      heading is drawn.
- [x] The `<img>` `src` is exactly what `resource()` returned; no file in `src/` holds a
      *list* of image formats — two distinct ones close enough together to be one
      construct, in any spelling: an array, a regex alternation, a switch, a set. **A
      list, not a mention**, which is what the shipped guard scans for and what this box
      should always have said: it read "nothing matches a search for an image file
      extension", which is literally false — `PLACEHOLDER` is `![[Portrait.png]]` — and
      the first spelling of the check made exactly that mistake, firing on the component's
      own placeholder and on the comments explaining the rule.
- [x] `alt` is empty where this component draws its own heading, and the component's
      label wherever it does not — **which is two cases and this box named one**:
      `showsOwnLabel` is false either because `hideLabel` is set or because a container
      already named it, and a Tab set is the second. The behaviour is right in both and
      the wording was narrow: `alt=""` means decorative, so a screen reader skips the
      element, and a tab panel whose only content is a skipped picture announces nothing.
      A heading can afford that silence because it is adjacent and says the same word; a
      tab strip is not.
- [x] The picture fills its placement with `object-fit: contain`; a tall picture in a wide
      box and a wide picture in a tall box are both whole and undistorted in the harness.
      **Met with a coverage gap when the report ran, and the gap is now closed**: the
      wide file was in both shapes of box and the tall file only ever in a tall one, so
      the first half rested on a 0.71 file in a 1.04 box and disappeared entirely at
      `text=24`. The `wide_portrait` sample is the missing mirror, and the tick is the
      report's verdict plus that sample rather than the verdict alone.
- [x] A stored `|200` changes nothing about how the sheet draws it, and survives the
      round-trip.
- [x] Each of the four states in question 7's table is on screen in the harness: a
      drawn picture, an unresolvable target, a non-image file, and an empty frame.
      **Met across two views, which is what the criterion asks**: it says "in the
      harness", not "in one view", and the empty frame is the `Empty` view's by the
      same design that puts every other component's empty state there.
- [x] Every one of these errors is drawn inside the frame, under the component's
      own label, with the field still in the box; where no heading was drawn the
      component prefixes the message with its label itself; none of them writes to
      the console. **One path, not two**, and this box said the opposite until a
      review read it against the code: it described a failed `read` being replaced
      by the view and prefixed there, which stopped being reachable when `read`
      stopped failing — `Portrait: A picture is an embed: …` names a path that no
      longer exists and a prefix that would now be a bug, since the heading is
      drawn. **Ticked as rewritten**: the report judged both substantive halves —
      every error under the name, nothing on the console — Met, and the only part it
      did not accept was the wording above, for which it prescribed the replacement
      this box now carries.
- [x] A press on the picture focuses the field; Escape restores and announces.

**Both**

- [x] `npm test`, `npm run lint` and `npm run build` pass.
- [x] Neither component declares `scopeValues`, `scopeRows`, `applyReset` or `hasBuffer`,
      and neither appears in any name a formula can resolve.
- [x] The shared box is `--background-primary-alt` at `--radius-m` — the card's own
      surface tokens — with no border of its own; `pointer: coarse` adds a
      `border-bottom` and `prefers-contrast: more` a full border, both the table input's
      existing idiom. **The narrow claim, because the wide one cannot be decided**: this
      box read "neither draws a border, panel or surface the sheet does not already have
      a name for", and the same commits invent `.sheetsmith-placed-box` and give it a UI
      §9 row, so it is satisfied by its own definition. What is checkable is which tokens
      it takes and whose idiom the two media rules follow.
- [x] **A stacked field is marked for spelling only while it is the visible layer, on
      all three components that stack one** — Rich text, Image and Table — and an
      unstacked field is left an ordinary text field with no attribute at all.
      Driven per component rather than only through `src/ui/spellcheck.ts`'s own
      tests: `rich-text.test.ts` and `image.test.ts` each assert `false` unfocused
      and `true` on focus, and `table.test.ts` asserts both of those on a linked
      cell **and** the negative case on an unlinked one, which is the boundary of
      the rule and the only place it is pinned. The attribute, never the IDL
      property: it is what Blink reads to clear marks it has already placed, and
      happy-dom does not reflect the property to it, so a test written against the
      property would assert something no browser sees. **Added after the fact**, with
      the rest of this scope expansion — see the gesture section and boundary 9.
      **Its tick traces to the report's finding 4 rather than to a row in its criteria
      table**, which is within the rule only because the trace is written down: that
      finding is what named the pinning tests. It named two, in the new components;
      a third exists in `table.test.ts`, and it is the one that pins the negative
      case, so this box is ticked on the report's verdict over evidence the report
      undercounted rather than over evidence it lacked.
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

      **The only box left open, and the reason is Constraint 6 rather than unfinished
      work**: the vault is outside this repository by design, so nothing here can
      evidence what it holds. That is also why it is the right home for every other
      check with the same property, and those were routed to the two fixture notes —
      `Characters/Prose.md` and `Characters/Pictures.md` — which already carry what to
      press in their own prose. Written out here as well, so the routing can be
      checked against the notes rather than taken on trust:

      - The rename above, which is this box's own reason to exist.
      - **That Obsidian's real `MarkdownRenderer` produces `a.internal-link[data-href]`
        and applies no `is-unresolved`.** Every link criterion above is driven against
        a hand-built renderer; that premise is the app's, and it is the premise that
        shipped wrong twice.
      - **Hover preview actually opening one.** The plugin only fires `hover-link`; the
        Page preview plugin owns whether anything happens.
      - **That the per-pass child `Component` really does stop embed listeners
        accumulating.** The unload is asserted against the stub; the leak it exists to
        prevent is only observable in the app.
      - **`resource()` returning a usable `app://` URL**, and a real vault file the
        browser refuses, so the `<img>` `error` path fires on something real.
      - **What an upscaled raster looks like.** Every harness picture is an SVG and
        scales losslessly; a 48px file in a three-row box is visibly blocky, and no
        still taken here can report it.
      - **Theme and snippet inheritance** into the box and the frame, which is the
        caution behind a picture cropped by a rule keyed on its filename.
      - **`alt` as a screen reader actually announces it**, particularly the Tab set
        case the `alt` box above was widened for.
      - **A wheel and a touch drag over the rendered layer.** happy-dom has no hit
        testing and a still has no scroll position, which is exactly how the
        `pointer-events: none` regression got signed off by every check in the repo.
      - **How a rendered heading, list or embed sits inside the box**, which the
        harness cannot draw at all: it supplies no `renderMarkdown`, deliberately.

## Commit boundaries

Applied once, at the end, when the user says the change is settled. Not a schedule to
follow while building.

0. **Reconciled against the tree twice, and the second pass is larger than the
   first.** Rows 1 to 14 name every commit in `5f88d07^..c0e003e`, in the order they
   were applied, so a row added later slots in at its own position and shifts the
   numbers after it. **Rows 15 to 17 are this session's own**, written at the land
   stop for the commits that carry it — which is the same append this paragraph
   promised would be cheap, done once. Boundaries 1, 4, 6 and 7 were added after the *first* pass,
   each because a review found work in the tree that no boundary held. The second
   pass came from counting the rows against the commits, and found the mismatch
   running both ways: **boundary 4 as it then stood — the renderer — held no commit
   at all**, because every part of it but one had landed inside boundary 3 and the
   last landed at 5 (row 3 has which piece, and why), and **six commits held no
   row**. Rows 9 to 14 and the fold at 3 are that pass.

   **The pattern the first pass found still covers most of them, and no longer covers
   all**, which is worth more than the pattern was. A shared-vocabulary extraction or
   a shared-path fix that a new component provoked is a class a plan cannot list in
   advance — you do not know what the second consumer will share until it exists —
   and it holds for 1, 4, 6, 7, 9 and 13, and half of 11. What it does not cover is the
   class the second pass turned up: **a defect inside the new component itself, found
   by using the thing rather than by building the next one.** The caret landing at the
   end of a backstory (10) and Image refusing a body in the one place that took the
   field away (12) are neither extractions nor provoked by a sibling; they came out of
   a review opening the component in Chrome and in Obsidian. A plan cannot list those
   in advance either, for the opposite reason.

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
   is written, and Image joins it at boundary 5. `rich-text.ts`, its multi-line
   binding in `editable.ts`, the stacked box and its styles, the fallback render, its
   registration, its tests and its harness sample.

   **The renderer is here too, and that is a correction rather than a plan.** This
   was two boundaries: the block, and then `feat: Draw a Rich text block with
   Obsidian's own renderer` holding `RenderContext.renderMarkdown`, the view's
   per-render child `Component` and its unload, and the component taking the member.
   A review counted the rows against the tree and found that second row naming no
   commit — all of it is in `0197bbf`, `view/markdown-pass.ts` and its test included.
   Folded rather than left standing, because a plan naming a commit that does not
   exist is worse than one row naming what happened. The sentence this row used to
   carry — that the block "renders paragraphs and links at this commit and the app is
   not yet asked for more" — went with it, and it is the part that was actually
   wrong. **The one piece of that boundary that did land apart is `wikilink.ts`'s
   amended header**, which arrived with `parseEmbed` at boundary 5: the same file, so
   the two edits to it came together rather than the header following the renderer.
4. `refactor: Share the body framing between the two markdown components`.
   `parse/markdown-body.ts` takes the whitespace framing that was private to
   `rich-text.ts` — `bodyText` and `writeBodyText`, the rule that a body which *is*
   its value returns byte for byte when unchanged and keeps its own two whitespace
   runs when it does not — and `rich-text.ts` starts importing it. **Added after the
   build**: this boundary was missing, and it is the same shape as boundary 1 in
   every respect, which is what settles it. An extraction from an existing file,
   triggered by the second consumer arriving, landing as a `refactor:` immediately
   before the feature that needs it, with no behaviour change — `linked-text.ts` got
   exactly that treatment at boundary 2. It is §1's one-step policy tier for the
   same reason too: what is shared is *where the text starts*, and a guard test over
   two copies could only assert they still agree to the character.
5. `feat: Add a picture to the catalog`. `parseEmbed` in `parse/wikilink.ts` and the
   amended header above it, `image.ts`, `RenderContext.resource` and the view's
   two-call implementation, the frame and its `object-fit`, the failure paths, its
   registration, its tests, and the harness stand-in with its states.
6. `fix: Put focus back inside the component that lost it`. `view/cell-focus.ts`
   resolves a saved control index past the end of a cell to the cell's last
   control instead of returning silently and dropping focus to the body — which is
   the outcome PATTERNS §5 records as the reason not to repaint a cell
   optimistically. Rich text's asynchronous render is what made it reachable: its
   layer is tabbable while the field is not focused, so Shift-Tab out of the next
   component lands on an anchor, that same press commits and rebuilds, and the
   anchor is not drawn again until a microtask later. Its own commit and after the
   renderer landed at boundary 3, because it fixes the view's shared focus path for
   every component rather than anything about a prose block — a table row deleted
   under the caret was already reaching it silently.
7. `fix: Let an inline error wrap the thing it names`. `.sheetsmith-error` in
   `styles/shared.css` takes `overflow-wrap: anywhere`. The messages this plugin
   writes name file paths, formulas, column keys and web addresses — tokens with no
   space to break at — and one longer than its box painted straight through the
   border: measured at 211px of text in a 205px box on Image's remote-URL refusal,
   the only one of twelve errors on the harness's error view to overflow. Its own
   commit and after boundary 5, because it changes how *every* component's failure
   renders and it was Image that exposed it rather than Image that needs it.
8. `docs: Record what the last two entries settled`. §4.2's Image entry (markdown storage,
   the embed form, sizing, the click gesture, `hideLabel` on both), §3's format-follows-the-component
   bullet if it needs a word about a body that is one embed, §12's component order and
   count, §13's new question about what a string type would unlock, and `docs/UI.md` §9's
   vocabulary rows for the linked-text painter and the stacked prose box.
9. `fix: Stop a hidden field marking spelling through the layer above it`.
   `src/ui/spellcheck.ts` with its own test, and `rich-text.ts`, `image.ts` and
   `table.ts` asking for it. **§0's pattern, and its strongest instance**: three
   consumers of one stacking rule, two of them new, so the invariant — what is not
   visible is not marked — is a name rather than three spellings. `color:
   transparent` suppresses the glyph fill and not the spelling marker, so an
   unfocused field's squiggles come through the layer over it, positioned by the
   source line and left behind when the layers scroll apart; `visibility: hidden`
   and `opacity: 0` are both ruled out by rules the stacking exists for.

   **Its own commit because it changes a component this feature otherwise only takes
   code *out* of.** Table already had the defect in shipped code — `[[Sunblade|sword]]`
   squiggling under a rendered link — so this is a fix to `HEAD` rather than to
   anything Rich text or Image introduced, and it belongs beside the other `fix:`
   commits rather than inside either `feat:`. **Unasked-for, and recorded rather than
   tidied away**: nothing in this document proposed it, a `/spec-review` found it in
   the tree after the fact, and the argument for keeping it is that the alternative is
   the same defect in three components or the same rule written three times.
10. `fix: Open a prose block at the start of its text`. `rich-text.ts` calls
    `setSelectionRange(0, 0)` after assigning the field's `value`. **Outside §0's
   pattern, and listed for that as much as for the fix**: nothing is extracted, no
   sibling provoked it, and no shared path changes — it is a defect inside the new
   component, found by opening a forty-paragraph block in Chrome and measuring where
   it landed, at `scrollTop` 2062 of a possible 2062. Assigning `value` moves the text
   entry cursor to the end of the control and focusing scrolls that cursor into view,
   so the one position nobody chose is the one the reader got. Departure 2 in this
   document is amended by it rather than reversed: the caret was never going to be
   placed from the click, and where it lands instead is a choice.
11. `fix: Refuse a heading that would split the note`. `bindMultiline` gains `refuse`
    and `onRefusal`, `parse/character.ts` exports `startsSection`, `rich-text.ts`
    draws the standing refusal and keeps the refused draft on screen, and
    `styles/sheet.css` carries the rule that makes a refused draft visible through a
    layer that is normally over it. **Half in §0's pattern.** Two shared modules grew,
    and both are §1's one-step policy tier rather than a second copy of `## ` in a
    component — but no second consumer provoked either. A user report did: a block
    holding `## ` emptied itself on every commit while the plugin announced "saved",
    with the bytes intact in a section nothing maps. The reversal is recorded in §4.2
    and in this document's data section.
12. `fix: Refuse an Image's body where the reader can still fix it`. `image.read`
    stops failing; all four refusals are raised in `render`, inside the frame, with
    the field still there; the component prefixes its own label where it drew no
    heading; and `addressed()` finds a web address ahead of the syntax refusal, so all
    three spellings of a remote picture get the message naming the right fix first
    time. **Outside §0's pattern, and the sharper instance of row 10's class**: Image is
    the first component whose own editing gesture can produce a body its `read`
    refused, and a failed `read` never reaches `render`, so the reader was locked out
    of a value they had typed one second earlier. Its own commit rather than an
    amendment to boundary 5, because it is a reversal of a decision that shipped and
    not a correction to how it was written.
13. `fix: Give the links the app rendered this plugin's behaviour`. `linked-text.ts`
    gains `adoptRenderedLinks` and `markRenderedResolution`, `rich-text.ts` binds the
    first to the rendered layer, `view/markdown-pass.ts` calls the second once a render
    lands, and `sheet-view.ts` passes `link.resolves` into `begin`. **§0's pattern
    exactly**: the painter boundary 2 extracted grows the two halves the app's *own*
    anchors need, because every criterion covering links had been written against the
    fallback path — so a wikilink in a backstory worked in a unit test and in the
    harness and did nothing in Obsidian. Two reports arriving one after the other, the
    presses and then the resolution state, which is why one commit holds both.
14. `docs: Record what three review passes found`. The second `docs:` commit, and it
    exists because the reviews kept arriving after boundary 8: §4.2's two entries,
    `docs/UI.md`'s rows, this document's own corrections, and the one code comment that
    belongs with them — the harness's note that an SVG sigil cannot show what an
    upscaled raster looks like. **Not a class §0 could have predicted, and not one
    worth trying to**: a `docs:` boundary written into a plan is always followed by the
    review that changes what it recorded.
15. `docs: Record both refusals where the reader can still fix them`. §4.2's Image
    entry and `rich-text.ts`'s own file header, both still describing a refusal that
    had moved. Image's said a body that is not an embed "fails `read` and takes the
    view's labelled prefix", which stopped being true at boundary 12; Rich text's
    still guaranteed that "nothing is lost from the file" — the sentence §4.2 itself
    quotes as *the wrong criterion* — and never mentioned the declined write at all.
    **No behaviour changes**: the comment and the spec were the only things wrong.
    Both are boundary 12's own shape one level up, an update that reached the detail
    and stopped a paragraph short of the summary over it. A grep for the reverted
    phrasing across `src/`, `harness/` and `docs/` found no third instance, recorded
    here because a negative result nobody writes down gets re-run.
16. `test: Show a tall picture in a wide box and an unresolved link`. Two harness
    samples that claimed a state and did not show it. The tall file was only ever in
    a tall frame, so half of "a tall picture in a wide box and a wide picture in a
    tall box" rested on a 0.71 file in a 1.04 box, and vanished at `text=24` where
    the taller rows make a 2×3 frame taller than it is wide; `wide_portrait` is the
    mirror of `symbol`, placed on the second Image row where nothing else moves. And
    the one target the harness refuses to resolve sat in the twelfth paragraph of a
    body deliberately longer than its box, so every link a reviewer could see
    resolved — moved to the second paragraph rather than shortened, because the scroll
    is judged from that same sample. `shot.mjs` comes with them: its measured narrow
    height said 6280 against a sheet that is now about 6500, which leaves that frame
    the tightest of the three. `test:`, on the log's own precedent for a sample that
    puts a state on screen.
17. `docs: Close Rich text and Image against the spec axis`. The feature document
    itself: the corrections seven spec findings produced, §0's reconciliation of this
    list against the tree, the rows for the fixes that had none, the paragraph and
    criterion recording the spellcheck scope expansion, and the acceptance list ticked
    from the two reports rather than from any session's own reading. **Thirty-six of
    thirty-seven boxes**, with the throwaway-vault fixture left open because
    Constraint 6 puts it outside this repository — the app-only checks that share that
    property are routed to the fixture's own notes and listed under it. `Status:` goes
    to `shipped` here. Last, because it is the record of everything above it.

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
- **Obsidian's editing affordances inside the field:** no bracket auto-close, no list
  continuation on Enter, and no `[[` suggester. The field is a plain `<textarea>`, which
  follows from "the gesture is the sheet's own stacked edit, not a second editor" — so
  the element is a decision and not an oversight, and this bullet is the price of it,
  which the decision never wrote down. Typing `[[Neverwinter]]` by hand works, renders
  and resolves; what is absent is everything around it.

  **The three are not one problem, which an attempt established before being reverted.**
  Bracket closing and list continuation need nothing from the app — they are keystrokes
  over a string, and `bindMultiline` lives in `interaction/`, so the component boundary
  the first analysis leaned on never applied to them. The `[[` suggester does need the
  vault's filenames, and so does need the seam (§13). What the attempt also established
  is that `keydown` is the wrong event to build them on: it keys on physical keys and
  modifiers, so a layout that composes `[` with Option never reaches the handler, and
  every unit test passes while the app does nothing. `beforeinput` keys on the character
  actually being inserted. Tracked outside this document as its own piece of work.
- **Interactive content inside a rendered embed.** Links work; a task checkbox in an
  embedded note does not.
- **Pasting a file into a Rich text block or an Image field.** Obsidian's paste handler
  belongs to its editor, not to a `<textarea>` on a sheet; the reader pastes the embed
  text, which is what the app puts on the clipboard for a file anyway.
- **UI §12's error-card row**, the layout picker split, render-time validation, and the
  `isolation.test.ts` flake. All four have their own backlog rows, and question 7 is
  explicit about not adding an instance to the first.
