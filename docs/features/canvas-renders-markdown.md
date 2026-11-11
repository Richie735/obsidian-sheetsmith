# Canvas renders markdown

Status: shipped
Board card: The layout canvas renders a sample's markdown as the sheet does.

## Model question

None. The contract does not grow: `RenderContext.renderMarkdown` already exists
(`src/types.ts`), and every prose surface already takes it. Nothing is stored or
published, so Constraints 3 and 4 are not touched.

The one open point was a product decision, not a model one: should an editing
surface render a character's prose? That is the blocker on the `docs/BACKLOG.md`
row *A Rich text sample draws as plain paragraphs, not markdown*. **The owner
ruled (2026-11-11) that the canvas renders it.** An author judges their layout
against the canvas, and a canvas that draws prose differently from the sheet
misleads them. The ruling is recorded in three places at land:

- the BACKLOG row is deleted;
- `docs/UI.md` §9 gains a row for the markdown pass, and the ruling sentence
  goes in it (Design, "The record");
- `docs/SPEC.md` §7's canvas paragraph gains one sentence, because that
  paragraph says what the canvas draws.

## What it does

On the layout canvas, and in the component picker's preview, every block of
prose a sample holds is drawn by Obsidian's own renderer, exactly as on a sheet.
That covers a Rich text block, a Record set record's body, and a Stat block's
features entries, lead and text zones. Bold reads as bold, a list as a list, and
a link in the theme's link color, faint where the note does not exist. A press
on any of it still selects the component, and never follows a link.

## Smallest version

The canvas and the picker preview each own one `MarkdownPasses` from
`view/markdown-pass.ts`, begun once per draw against the open layout file's
path. Each hands `renderMarkdown` into the context it builds. The Rich text and
Stat block samples gain the marks there is now something to draw. The harness
draws through the same pass. What it gives up: no `link` context on the canvas
(see Design, "Links"), and no change to the no-app fallback.

## Design

### One pass per surface, the sheet's own module

`MarkdownPasses` is the sheet view's lifecycle and is reused unchanged. It
already handles the three hard parts: one child `Component` per pass, the
previous one unloaded; a render that lands after its pass ended writes nothing
and is cleared; and a rejected render calls the component's `onFailure`.

- **Who owns it.** `LayoutEditorView` is a `FileView` and so a `Component`, like
  the sheet view. `LayoutEditorHost` gains one member, the `Component` that
  bounds every pass. The view returns itself; a test host passes
  `new Component()`. The section builds `new MarkdownPasses(owner, plugin.app)`
  and hands it to the canvas. The canvas gets the passes object through
  `CanvasHost`, not a `renderMarkdown` function, because the canvas decides
  when a pass starts.
- **When a pass begins.** At the top of `Canvas.draw`, before `renderGrid`. That
  includes every `redraw()` a drag or resize makes, so a render started for a
  layout that has since moved is cleared, never appended into a detached cell.
- **The picker preview is the second surface, and it is in scope.** It draws the
  same samples through `sample-read.ts`, whose header names the drift it exists
  to prevent: a preview and a canvas drawing one component two ways. A Rich text
  sample with marks, drawn through the renderer on the canvas and as source in
  the preview, is exactly that drift. `renderComponentPreview` takes a
  `renderMarkdown` parameter. `ComponentPicker`, which is built once and is
  long-lived, owns a second `MarkdownPasses` from the same host members, begun
  per preview draw. It is a second instance, not a share of the canvas's,
  because a canvas redraw must not end a preview render, nor the other way
  round.
- **What gets it.** Every component whose prose takes `context.renderMarkdown`
  today: `rich-text.ts`, `record-controls.ts`'s record body (Record set, and a
  Stat block's text zone through it), and `stat-block-zones.ts`'s `drawMarkdown`
  (features entries and lead). Nothing per component: one context member, one
  renderer for every prose surface the canvas draws. A Table cell still gets no
  renderer, on `types.ts`'s own ruling.

### Question 1: what it resolves against

**The open layout file's path** (`host.layoutFile.path`). The canvas draws
samples, not a character, so there is no note to resolve against. The layout
file is the only real vault path the drawing belongs to. Using it, a relative
link means what it would mean if written in a note beside the layout.

The pass's `resolves` answers against that same path, with the call the sheet
view's `linkContext` makes: `getFirstLinkpathDest(getLinkpath(target), path)
!== null`. The two callers share one function in `src/view/`, so "does this link
resolve" has one spelling. Moving `sheet-view.ts`'s `linkContext` onto that
function is in scope: "untouched" covers the sheet's markdown pass, not
`sheet-view.ts`. The build picks the module; it is not added to
`markdown-pass.ts`, whose job is the lifecycle.

- **A link to a missing note** draws `is-unresolved`, through
  `markRenderedResolution`. That is the theme's faint unresolved link, as on the
  sheet. The Rich text sample's link names a note no vault is expected to hold,
  so it normally draws this way. That is honest for filler.
- **An embed** draws whatever the app's renderer draws for it, missing or not,
  as on the sheet. No sample holds one, so on the canvas this is reachable only
  if a future sample adds one. It is not designed for here.
- **A pane with no file** draws no canvas, so the empty path is never used. It
  is passed as `''` for the type, as the sheet view does.

### Question 2: links on the canvas

**Drawn, not followed. No modifier follows them either, and they show no hover
preview.** This is what the canvas already does with wikilinks today, and it
needs no new code.

Today, Rich text's fallback `paintParagraphs` paints each wikilink as an
`a.internal-link`. With no `link` on the context, it paints as resolved and a
press on it does nothing. The canvas's `markInert` then marks every
live-rendered subtree `inert`, and `blockEvents` adds capture-phase stoppers for
`pointerdown`, `click` and `keydown`. A sibling `<button>` overlay sits over each
cell. So a real press lands on the overlay and selects. No pointer event, and so
no `mouseover`, reaches an anchor. "Live" today means the anchor is painted, not
that it answers.

The rendered path gets the same treatment, because its anchors are inside the
same inert subtree. Following on a modifier was considered and refused. On the
canvas a press, with or without Mod, is the select and drag gesture
(`UI.md` §6–§7), and leaving the editor is not what an author pressing a sample
asked for. So the canvas is handed **no `link` context**. `adoptRenderedLinks`
binds to an undefined `link` and calls nothing. External links (`https://`) are
inert under the same rule.

Cost, accepted: on a failed render the fallback paints links as resolved, while
the rendered path marks them. That is today's canvas exactly, and only on the
failure path.

### Question 3: redraws

The canvas redraws by emptying and rebuilding on every layout edit, and on every
step of a drag. Each draw begins a pass, which ends the last one. That much is
the sheet's behaviour, and the unit tests below pin it. The risk is a visible
frame with the box empty between the rebuild and the render landing.

**How it is measured.** It is measured in Obsidian, in the throwaway vault, with
a console probe. A `requestAnimationFrame` loop records, for each frame, whether
every `.sheetsmith-rich-text-rendered` and `.sheetsmith-stat-block-entry` on the
canvas has child nodes. It runs while the author commits ten `row` changes to an
**unrelated** component, then drags another block across the grid. The same
probe runs on the sheet across ten committed edits, as a baseline.

- **Criterion:** the canvas records no empty frame wherever the sheet records
  none. The probe's script is below.
- **If both flicker**, that is a finding about the shared pass, not this
  feature. It is recorded as a BACKLOG row and not fixed here. A cache of
  rendered prose across passes would be a second lifecycle beside
  `markdown-pass.ts`, which is what this feature must not write.
- **If only the canvas flickers**, the build stops and reports before inventing
  a fix.

**The probe.** Click into the pane to measure, so it is the active leaf, then
paste this into the developer console (View → Toggle Developer Tools). Make the
edits, then run `sheetsmithProbe.stop()`, which prints and returns the counts.
It counts a box only where it should hold prose: a features entry always, and a
Rich text layer only where its field holds text and is not focused, since a
focused block hides its layer on purpose and an empty block has nothing to draw.

```js
(() => {
	window.sheetsmithProbe?.stop?.();
	const root = app.workspace.activeLeaf?.view?.containerEl;
	if (!root) return console.warn('Click into the pane to measure first.');
	const canvas = () => root.querySelector('.sheetsmith-editor-canvas');
	const surface = canvas() ? 'canvas' : 'sheet';
	const boxes = () =>
		[...(canvas() ?? root).querySelectorAll('.sheetsmith-rich-text-rendered, .sheetsmith-stat-block-entry')].filter(
			(box) => {
				if (!box.classList.contains('sheetsmith-rich-text-rendered')) return true;
				const holder = box.parentElement;
				const field = holder?.querySelector('.sheetsmith-rich-text-input');
				return (
					field != null &&
					field.value.trim() !== '' &&
					!holder.classList.contains('sheetsmith-rich-text-field-focused')
				);
			},
		);
	let frames = 0;
	let emptyFrames = 0;
	let worst = 0;
	let running = true;
	const tick = () => {
		if (!running) return;
		const empty = boxes().filter((box) => !box.hasChildNodes()).length;
		frames += 1;
		if (empty > 0) {
			emptyFrames += 1;
			worst = Math.max(worst, empty);
		}
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	window.sheetsmithProbe = {
		stop() {
			running = false;
			const result = { surface, frames, emptyFrames, worstEmptyBoxes: worst };
			console.table(result);
			return result;
		},
	};
	console.log(`Probing the ${surface}. Make the edits, then run sheetsmithProbe.stop().`);
})();
```

**The counts**, from the owner's run at the land stop, with the script above as written:

| Surface | Edits | Frames | Empty frames | Most empty boxes in one frame |
| --- | --- | --- | --- | --- |
| Sheet, `Characters/Prose.md` | ten committed Level edits | 610 | 0 | 0 |
| Canvas, Rich text variations | ten `row` changes to Level | 618 | 0 | 0 |
| Canvas, Rich text variations | Level dragged from col 1 to col 5 | 362 | 0 | 0 |

No empty frame on either surface, so the criterion holds and nothing here asks
for a cache of rendered prose.

In the harness the stub's render lands after one microtask, so a harness shot
cannot show a flicker either way. That is why the measure is in the app.

### The samples gain marks

The canvas now has a renderer, so the reason the samples held no markdown is
gone. Rich text's own comment at ~215 ("No markdown, and no wikilink…") states
that reason.

- **Rich text** `sample` keeps its two filler paragraphs, still naming
  themselves. It gains one `**bold**` run, one two-item `- ` list after the
  second paragraph, and one wikilink to a note named so it reads as filler.
  **After, not between (owner's ruling at the land stop):** with the list
  between, a short box showed the first paragraph and the list and stopped
  there, so Creed ended cleanly on a list item and read as complete with its
  second paragraph out of sight. Still no
  heading, because `##` is the section boundary. The test *holds no markdown, no
  wikilink and no heading* turns into one that asserts the three marks are
  present and that there is no heading.
- **Stat block** `sampleZone`'s features entry keeps `**Sample.**` and gains one
  `*emphasis*` run in its body, so a features entry's own marks are visible.
  Text zones and Record set bodies stay plain prose: one component showing each
  mark is enough.

The samples still go through each component's own `read`, so the contract
test's sample round trip covers the new bodies.

### The harness

The editor surface runs the genuine `LayoutEditorView` over
`src/test/obsidian-stub.ts`. Once the canvas has a pass, it calls the stub's
`MarkdownRenderer.render`, which writes the raw source into one `<p>`. Without
the change below, that would draw the canvas worse than today's fallback.

The sheet surface (`harness.ts`) hands Rich text no renderer, deliberately
(`samples.ts` ~929), and hands a Stat block a private `standInMarkdown`.
`harness/stub-app.ts` stubs nothing for markdown.

**Approved by the owner (2026-11-11).** One stand-in for both surfaces, at the
renderer's own boundary:

- `standInMarkdown` moves out of `harness.ts` into its own harness module. It
  gains `[[target|alias]]` drawn as `a.internal-link` with `data-href`, so
  `markRenderedResolution` and the stylesheet see the app's markup.
- The harness boot installs it as the stub's `MarkdownRenderer.render`, for the
  harness bundle only. Vitest keeps the stub's own render, which its tests rely
  on.
- The sheet surface stops passing a stand-in function. It builds its
  `renderMarkdown` from a real `MarkdownPasses` over the stub, for every
  component, as `SheetView` does. **Both surfaces then go through
  `markdown-pass.ts`**, and the stand-in sits only where Obsidian's renderer
  sits.
- **This moves the sheet surface's Rich text and Record set shots**: the
  backstory's hyphens become a list. That reverses `samples.ts`'s "passes no
  `renderMarkdown`" ruling, whose own comment says widening is "a decision for
  those shots". The comment is rewritten to say what the harness now draws and
  that the stand-in is not Obsidian's renderer. The rendered look of headings,
  embeds and callouts is still reviewed in Obsidian only.
- **The fallback stays photographable.** A `renderer=none` query parameter skips
  installing the stand-in and passes no `renderMarkdown` on the sheet surface,
  so a shot of what a failed render draws still exists.

The alternative is to keep Rich text on the fallback in the harness on both
surfaces. Then the harness would show two fallbacks agreeing, and prove nothing
about the feature.

### The record

- `docs/UI.md` §9 gains a row: **Markdown drawn by the app's renderer** —
  `view/markdown-pass.ts`; consumers the sheet view, the layout editor's canvas
  and the picker preview, each with its own pass. On the canvas it resolves
  against the layout file and its links are drawn, not followed (inert under the
  overlay). The row carries the ruling sentence: *the canvas renders a sample's
  prose as the sheet does, because an author judges the layout against it.*
- `docs/SPEC.md` §7, the paragraph starting "The canvas renders the layout's own
  components, live": after "Every rendered component is `inert`", add that prose
  is drawn by the app's renderer against the layout file, and that its links are
  drawn but not followed.
- `docs/BACKLOG.md`: the row *A Rich text sample draws as plain paragraphs, not
  markdown* is deleted.

### Question 4: statements that become false

Each is updated in the commit that makes it false:

- `src/components/rich-text.ts` ~215–218, `sample`'s comment: "No markdown, and
  no wikilink… the layout editor's canvas hands over none (`docs/UI.md` §12)…".
  It is rewritten to give the reason the sample now carries marks.
- `src/components/rich-text.test.ts` ~212–215: the test and its comment "The
  canvas hands over no renderer…".
- `src/components/stat-block-zones.ts` ~758–762, `drawEntryPlain`'s header:
  "An entry where there is no app to render its markdown — the layout editor's
  canvas". The fallback stays, but the canvas is no longer its case: it is a
  host that hands over no renderer, which the harness's `renderer=none` stages.
  A failed render is not its case either: `drawMarkdown`'s `onFailure` paints
  the entry's source through `paintRecordProse`, marks and all.
- `src/components/stat-block.test.ts` ~1851: test name "…as the canvas shows it"
  becomes "…as a host with no renderer shows it".
- `src/components/contract.test.ts`, "puts no wikilink in a sample": its reason
  was that a link on a canvas with no vault draws unresolved and reads as a
  fault. It becomes "links a sample only to a note named as filler": a sample
  may link, and every target it links to starts with `Sample`, so an unresolved
  link on the canvas is honest filler rather than a plausible note.
- `harness/samples.ts` ~929–936 and `harness/harness.ts` ~376–386 and ~624–631:
  the "passes no `renderMarkdown`" and "Stat block only" comments (see The
  harness).
- `docs/UI.md` §12 has no line about it. It only points to BACKLOG, and the row
  there is deleted. `UI.md` §9's `linked-text.ts` row (~784) still holds as
  written.
- **Not rewritten:** `docs/features/preview-sample-values.md` ~440 and
  `docs/features/stat-block-companion-face.md`'s *Deliberately not doing* bullet.
  Shipped feature docs record what was true when they landed. The BACKLOG
  deletion is the live record.

The build greps `src/`, `harness/*.ts` and `docs/{UI,SPEC,PATTERNS,BACKLOG}.md`
for `renderMarkdown`, "no renderer", "hands over none" and "canvas" next to
"fallback". The grep is the closure check, not this list.

### Empty and error states

- **An empty sample** (Sample values off) draws no prose at all and begins a
  pass with nothing to render, which is harmless.
- **A rejected render** calls `onFailure`, and the component draws its no-app
  fallback, as on the sheet. A unit test drives this through
  `MarkdownRenderer.failNextRender` on the canvas.

## Config fields

None.

## Data and file model

Nothing stored, nothing read differently. A sample is filler that
`sample-read.ts` alone calls, and it never reaches a note. The new marks go
through each component's own `read`, and the contract test round-trips them.
Character notes and layout files are untouched.

## Acceptance criteria

- [x] `canvas.test.ts`: a Rich text sample on the canvas draws through
      `MarkdownRenderer.render` (the stub's `<p>` appears in
      `.sheetsmith-rich-text-rendered`), not through `paintParagraphs`.
- [x] `canvas.test.ts`: a Stat block features entry on the canvas draws its
      `entry.source` through the renderer, not `drawEntryPlain`. A Record set
      body does the same.
- [x] `canvas.test.ts`: two draws back to back. The first draw's rendered layer
      is empty once the renders settle, and the second's holds the render.
- [x] `canvas.test.ts`: the render is called with the open layout file's path
      as its source path.
- [x] `canvas.test.ts`: with `failNextRender`, the Rich text sample draws its
      fallback paragraphs.
- [x] `canvas.test.ts`: the pass's child is removed from the owner when the
      next draw begins (one child, never accumulating across ten redraws).
- [x] `canvas.test.ts`: no `link` context is in the canvas's render context;
      a Mod-click dispatched on a rendered link's anchor has its default
      prevented and selects nothing; a hover on it asks the app for no
      `hover-link`; and a click on the overlay over it selects the component.
      With no `link`, nothing on the canvas holds a route to `openLinkText`.
- [x] `component-preview` test: the picker preview of a Rich text line draws
      through the renderer, and a second preview draw clears the first's
      render.
- [x] `rich-text.test.ts`: the sample holds a bold run, a `- ` list and a
      wikilink, and no heading. `stat-block.test.ts`: the features sample's body
      holds an emphasis run. `contract.test.ts` passes on both.
- [x] Harness shots `editor-markdown-{light,dark,narrow,contrast,forced}` and
      `sheet-markdown-{…}` in the same five: on the canvas, the Rich text
      sample's bold is `strong`, its list a `ul`, and its link an anchor in the
      link color, faint as unresolved. The Stat block's features entry shows a
      bold name and an italic run. The sheet surface's Rich text and Stat block
      draw the same marks with the same elements. In forced colors, every link
      is `LinkText` and no prose is invisible. The unfocused field's source
      showing under the prose there is deferred (Deliberately not doing).
- [x] At the land stop, the report lists every existing harness shot that moved,
      in groups by cause: moved by the stand-in renderer, moved by the new waits
      in `applyQuery`, and any that cannot be attributed. Each entry says why it
      moved.
- [x] Harness `renderer=none` still draws the fallback on the sheet surface
      (hyphens visible), so the failure path keeps a shot.
- [x] **Owner-run, at the land stop.** Test vault, in Obsidian, using the fixture below. In the layout editor,
      the Rich text sample shows a bulleted list and bold, and the Stat block
      features entry a bold name and an italic run. A press on the sample's link selects
      **Backstory** and the pane stays on the layout. Mod-press does the same.
      Hovering the link opens no preview.
      **Passed.** The render matches; the paragraph gap is 13px, as in the
      harness, since Obsidian gives a paragraph a 13px bottom margin even
      outside `.markdown-rendered`, so no harness-fidelity row is needed. A
      plain click, a Mod-click, a hover and a Mod-hover each select
      **Backstory**, keep the layout open, open no tab and show no preview.
      Session notes ending after its first paragraph was accepted as honest.
- [x] **Owner-run, at the land stop.** Test vault: the Question 3 probe
      records no empty frame on the canvas wherever the sheet's baseline records
      none. The dev writes the probe's script into this doc, and the owner fills
      in both counts. **Passed**: 0 empty frames in all three runs (the counts
      table in Question 3).
- [x] Every statement in Question 4 is updated, and the closure grep finds no
      claim that the canvas has no renderer.
- [x] `npm test`, `npm run lint`, `npm run build` pass.

### Test vault fixture

In `~/Developer/sheetsmith-test-vault/`, with no new files:

- `Sheetsmith layouts/Rich text variations.sheetsmith`: thirteen components, ten
  of them Rich text (`backstory`, `appearance`, `creed`, `session_notes`,
  `hand_written`, `never_stored`, `tall_narrow`, `wide_short`, `embeds`, and one
  inside the `pages` tab set). Open it in the layout editor with **Sample
  values** on. Each Rich text block draws the new sample. Press the link in
  **Backstory**'s sample.
- `Sheetsmith layouts/Stat block variations.sheetsmith`: four groups (`druid`,
  `werewolf`, `daggerheart`, `fate`). Open it in the layout editor. Each Stat
  block with a features zone draws its sample entry's bold name and italic run.
  The Fate NPCs group is the companion reading face.
- Baseline sheet for the probe: `Characters/Prose.md`, on Rich text variations.

## Commit boundaries

A plan for `/land-it`, not a schedule. The tree stays uncommitted through the
build and every round of findings.

1. `feat: Render markdown on the layout canvas as the sheet does`. This covers
   the owning-`Component` member on `LayoutEditorHost` and its implementations
   (view and test hosts), the passes on `CanvasHost` and the picker, `canvas.ts`
   and `component-preview.ts` beginning a pass per draw, the shared `resolves`
   function in `src/view/` that the sheet view also calls, the
   `stat-block-zones.ts` header and the `stat-block.test.ts` rename, and the
   canvas and preview tests.
2. `feat: Give the Rich text and Stat block samples marks to render`. This
   covers both `sample` changes, the rich-text comment, and the flipped and new
   sample tests.
3. `test: Draw markdown in the harness through the real pass`. This covers the
   stand-in module, its install on the stub renderer in the harness bundle, the
   sheet surface's pass, `renderer=none`, the `samples.ts` and `harness.ts`
   comments, and the new shots in `shot.mjs`.
4. `docs: Record that the canvas renders a sample's markdown`. This covers the
   `UI.md` §9 row with the ruling, the `SPEC.md` §7 sentence, deleting the
   BACKLOG row, the new BACKLOG row for a Stat block features entry's rendered
   links on the sheet (see Deliberately not doing), the probe's script, and this
   doc to `built`. The owner fills in the counts.

## Deliberately not doing

- **The forced-colors overlap of a prose box's rendered text and its hidden
  field** (BACKLOG § UI), for a text zone and for Rich text's
  `.sheetsmith-rich-text-input` alike. The renderer made Rich text's visible:
  the fallback drew the source's own shape, so the field under it lined up
  exactly. Seen in `sheet-markdown-forced` and `editor-markdown-forced`, on the
  sheet as on the canvas, so the forced-colors criterion above holds for the
  links and not for this overlap. Deferred on the owner's ruling for text zones;
  the owner may order the fix at the land stop.
- **In play's face switch dropping focus.**
- **The more-contrast line under an open record's name.**
- **The layout editor list's missing scroll cue** (BACKLOG row 124).
- **Modifiers setting toggles, levels or text.**
- **Following a link from the canvas**, on any modifier, and a hover preview
  there (Question 2).
- **A `link` context on the canvas**, and so any change to how Table, Card set
  or Record set names paint resolution there.
- **A cache of rendered prose across passes**, if the probe finds a flicker on
  both surfaces (Question 3).
- **The sheet view's pass, the no-app fallback, and what a note stores.**
- **Samples with embeds, headings or callouts.**
- **Whether a Stat block features entry's rendered links answer presses on the
  sheet.** `stat-block-zones.ts`'s `drawMarkdown` calls no
  `adoptRenderedLinks`, unlike Rich text and the record body. This was noticed
  while specifying and not verified. This feature adds a BACKLOG row for it
  (commit 4), and the fix is not made here.
