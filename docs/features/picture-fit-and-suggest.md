# Picture: fit and file suggest

Status: shipped
Board card: two owner-requested enhancements to the Passport/Image picture —
let a layout choose how the picture fills its frame, and offer vault files
while typing the reference that fills it.

## Model question

Two independent features sharing one file — `components/picture-frame.ts`, the
painter Image and Passport both call — so two separate answers, plus a third
half that is scoped out rather than answered.

**Fit mode touches no §13 question and grows no contract.** Image's own header
states a design decision, not an open one: "the picture is scaled to fit inside
[the placement]... `object-fit: contain`, centred, never cropped and never
distorted." A chosen fit is a config field exactly like `hidePicture` — the
layout author's own choice, read once per render, never stored in a character
note — so it costs nothing §4.1 has to grow for, publishes nothing new, and
`ScopeValues` is untouched. §8's rule ("a component fills its placement") is not
in tension with it either: the *box* stays exactly what the placement says
either way, and `cover`/`stretch` only change what happens to the picture
*inside* that box, which is the same axis `contain` already sits on.

**What it does reverse is a stated invariant, and that has to be said plainly
rather than smoothed over.** "Never cropped and never distorted" was written as
a property of this component, not as a default with alternatives waiting beside
it. This feature turns it into the default: unchanged for every existing
layout, because a `select` field's first option is its default and is omitted
from the file (`card-set.ts`'s and `track.ts`'s own `sense` field is the
precedent), and every layout on disk today keeps drawing exactly as it does.
What changes is that the sentence in `docs/SPEC.md` §4.2's Image entry has to
gain a clause: "unless the layout asks for `cover` or `stretch`."

**Reframing — choosing *which part* of an image `cover` shows — is a real
open question, and it is scoped out rather than answered.** A layout-wide fit
mode is one decision an author makes once for every character using the
layout. A focal point is not: two players using the same "Portrait" placement
with `cover` on will each want a different part of their own picture visible,
which makes it *character* data, and nothing in Image's or Passport's file
model has anywhere to put it. Image's whole body is the bare embed line
(`storage: 'markdown'`, no fence); Passport's section holds the embed line plus
a `sheet` fence for unrelated fields. A focal point stored beside either would
be the first structured value that is *about* the picture rather than *being*
the picture — a new small piece of file format, not a config field — and
Image's own header already refuses the nearest-sounding version of this for a
specific reason: "a width on the component would be a second sizing control
disagreeing with the grid." A focal point is not a size, so that refusal does
not transfer verbatim, but the shape of the question is the same one: something
about *this character's* picture that the layout does not own and the grid does
not decide. Answering it properly wants its own spec — where it is stored (a
third value beside the embed and the fence, an offset suffix on the embed line
itself, or something else), whether Obsidian's own markdown view would still
render the note sensibly with that value present, and whether it is worth the
first departure from "the section is the embed the reader would have written
anyway." None of that is resolved here — but it is not left as a bare "deliberately not
doing" line either. `docs/features/picture-focal-point.md` is a companion
draft opened alongside this one, carrying the model question through to a
proposed answer (a per-character focus stored as an invisible marker line
beside the embed, shared by Image and Passport) rather than leaving it as an
unstaffed intention. It is a separate spec because it is a separate risk: it
changes Image's storage from one scalar to two things in a fixed relationship,
which is a bigger architectural move than anything in this document, and
bundling it here would put a config-only, byte-identical-by-default feature
behind a storage change to a shipped component. `cover` in this feature always
centres, exactly as `contain` already does — a real improvement over today
with a known, named limit, and the limit has a named heir rather than a
dropped thread.

**File suggest is adjacent to §13's open `editMarkdown` question and is not
blocked by it, because it is a narrower case that question does not cover.**
That entry is about Rich text's `<textarea>`, where a `[[` has to be resolved
against an arbitrary caret position inside flowing prose — which is why the
entry's own conclusion is that only a real editing surface (an owned CodeMirror
instance, or the app's unsupported internal one) can offer it, and why the
entry says plainly that both options are costly. The picture field is a
different shape entirely: its whole value *is* the reference, the way a folder
path or a component id already is elsewhere in this codebase, so there is no
fragment to resolve and no caret to track. That is exactly the case Obsidian's
own public `AbstractInputSuggest` is built for — "attach to an `<input>` element
... to add type-ahead support" — and this codebase already has a working
consumer of it: `src/editor/formula-suggest.ts`'s `FormulaSuggest`, bound to a
layout editor's formula fields. This feature is the same mechanism a second
time, over vault files instead of formula names, wired through the character
sheet's render seam instead of the layout editor's own host object.

**The contract does grow by one, on `resource`'s own terms, because the seam
has no member that can attach anything to a live DOM element.** A component may
import nothing from `obsidian` beyond `setIcon` (`isolation.test.ts`'s
`FROM_OBSIDIAN`, PATTERNS §2), and `AbstractInputSuggest` is squarely on the
far side of that line — so, exactly as §13's own note anticipates for a future
editing seam, "it would arrive as a fourth `RenderContext` member on `link`'s
terms." `RenderContext` gains one optional member, absent in every test and in
the harness precisely as `resource` is, so a component (by way of
`picture-frame.ts`) draws the same plain field it draws today wherever nothing
supplies it.

## What it does

A layout author picks how a picture fills its frame — fitted inside it as
today, cropped to fill it, or stretched to fill it exactly — on Image and on
Passport alike. And while typing or changing a picture's reference, the field
offers a list of the vault's image files that match what has been typed,
narrowing as more is typed, so pointing a picture at a file no longer means
knowing its exact name and spelling.

## Smallest version

`fit`, a three-way choice (`contain`, `cover`, `stretch`) defaulting to
`contain`, declared identically on Image's and Passport's `configFields`. A
type-ahead on the picture field's reference, over every vault file, replacing
the whole field on selection with the embed Obsidian's own file drag-and-drop
would produce. No reframing, no picker modal, no change to what the field
accepts by hand.

## Design

### Fit

`picture-frame.ts`'s `PictureFrameOptions` gains one optional member:

```ts
/** How the picture fills its frame. Defaults to 'contain'. */
fit?: 'contain' | 'cover' | 'stretch';
```

`renderPictureFrame` adds a second class to the `<img>` for the two non-default
values only — `sheetsmith-fit-cover` and `sheetsmith-fit-stretch` — leaving the
base `sheetsmith-image-picture`/`sheetsmith-passport-picture` classes and their
existing `object-fit: contain` untouched for the default case, exactly the
"value matching its default is left out" rule read one level down from the file
into the DOM. `src/styles/sheet.css` gains two rules beside the existing one at
`sheetsmith-image-picture` (around line 3877), each overriding `object-fit`
alone: `cover` and `stretch` (`object-fit: fill`). Both keep the frame's
existing centring — `cover`'s crop is centred by `object-position`'s own
default, which nothing here has ever overridden — so the empty state, the error
state, and every gesture on the field (press to change, select-all, the four
failure messages) are entirely unaffected; `fit` only reaches the `<img>` that a
successfully resolved picture already draws.

Each of Image and Passport declares its own `fit` config field, `kind:
'select'`, `options: ['contain', 'cover', 'stretch']` — `card-set.ts`'s and
`track.ts`'s `sense` field is the exact precedent for a select whose first
option is silently the default. Passport's own picture is already capped at
45% of the face and becomes a portrait rectangle at narrow widths
(`docs/features/passport.md`); `cover` there fills that rectangle rather than
letterboxing inside it, which reads closer to an ID-style portrait than
`contain` does — and it changes nothing for a layout that does not ask for it.

**The harness's own picture asset could not show `stretch`, and the fix belongs
to the fixture rather than to this component.** `harness/harness.ts`'s
synthetic pictures are inline SVG, chosen so a real image is on screen without
a binary in the repository, and `getComputedStyle` on the `<img>` correctly
reported `object-fit: fill` from the first build of this feature — but the
picture painted centred and undistorted regardless, indistinguishable from
`contain` in every shot. The SVG resource was still applying its own
`preserveAspectRatio` (`xMidYMid meet` by default) inside the box CSS had
already sized for a stretch, which a raster file has no equivalent of and so
could never do. Found by looking at a shot rather than by reading the computed
style, which is exactly the failure mode `docs/UI.md`'s harness exists to
catch — a case here could have asserted `objectFit === 'fill'` and stayed
green while the shot it was supposedly standing in for showed `contain`. Fixed
by adding `preserveAspectRatio="none"` to the generated SVG; verified neutral
for `contain` and `cover`, whose already-uniform concrete sizes give the
attribute nothing to change.

### File suggest

`RenderContext` gains:

```ts
/**
 * Attach a vault file suggester to a picture's reference field.
 *
 * Absent on `resource`'s own terms: without it the field is the plain text box
 * it is today. Called once, right after the field exists, with the field's own
 * commit as the second argument (below) — and owns nothing beyond those two:
 * the caller (the sheet view) is responsible for closing whatever this
 * attaches before the next render, exactly as the layout editor already
 * closes `FormulaSuggest` instances at the top of its own redraw.
 */
suggestFile?: (input: HTMLInputElement, commit: (next: string) => void) => void;
```

`PictureFrameOptions` gains the same member and `renderPictureFrame` calls
`options.suggestFile?.(field, handle.set)` once, immediately after creating the field —
the same pass-through shape `resource` already has, and `image.ts`/`passport.ts`
forward `context.suggestFile` exactly as they forward `context.resource` today.

A new module, `src/view/file-suggest.ts`, holds `FileSuggest` (`extends
AbstractInputSuggest<TFile>`) and `attachFileSuggest(app, input, commit):
FileSuggest`, mirroring `src/editor/formula-suggest.ts`'s shape only where the
two fields are actually alike. **Reversed during the build, and simpler than
first proposed rather than merely simpler than `FormulaSuggest`**: this
originally described the same arm-on-`input`/disarm-on-`focus` dance and the
same `ArrowLeft`/`ArrowRight`/`pointerdown`-closes handling `FormulaSuggest`
needs — copied across without asking whether the reason for either transferred.
Neither does. That dance exists so a formula field tabbed into for reading does
not pop a list over text the author was not asking to change; this field is
never tabbed into to be read, since `picture-frame.ts`'s own click handler is
the only way a reader focuses it and it already selects the whole value on the
way in — so a popup opening immediately on focus is exactly the right answer
here, and no arm/disarm state exists to produce anything else. The `ArrowLeft`
close exists so a caret move in the middle of an expression is not mistaken for
"keep typing this name"; there is no expression here to move a caret through,
and the platform's own `ArrowUp`/`ArrowDown`/`Enter`/`Escape` handling while the
popup is open is all this field needs. So neither exists in `file-suggest.ts`,
and the header there says as much rather than the omission being silent.

What is genuinely simpler here than `FormulaSuggest`, and the reason this
document had it right the first time: there is no fragment to resolve, because
the field's whole value is the reference rather than one name inside a larger
expression, so `getSuggestions` reads the query the platform already hands it
directly (stripped of a leading `![[` and a trailing `]]` or `|...`, so
suggestions still match while editing an existing reference) rather than
resolving a caret position.

Suggestions are `app.vault.getFiles()`, unfiltered by extension, matched
against the typed text by name. **Reversed during the build, from what this
document proposed and the owner agreed to**: the proposal was a fixed,
recognised image-extension list, reasoned to be a different claim from the one
Image's own header warns against ("it holds no extension list... a plugin
holding its own list of formats is how webp stopped rendering inside one while
working outside it") — that warning about *refusing* a file the browser might
still draw, this merely about which files a *convenience list* offers first.
`image.test.ts` carries that warning as a repository-wide guard rather than
only as prose, though, and the guard does not — cannot — see the distinction
this document drew: it refuses **any** two distinct image formats named close
together anywhere in `src/`, on the argument that the *reasoning* behind an
allowlist is exactly what drifts, and a mechanical check that trusted an
allowlist's stated purpose would be checking nothing. Building the proposed
list failed it immediately. The correction is not a workaround but the better
design on its own terms: Obsidian's own `![[` suggester does not filter by
type either, so listing every file is the more faithful behaviour as well as
the one the guard allows, and a reader who picks a non-picture meets the same
"is not a picture" refusal a mistyped one already would.

Selecting a suggestion replaces the whole field with
`app.fileManager.generateMarkdownLink(file, sourcePath)` — the call Obsidian's
own file-drop and paste gestures use, so the text a reader gets from picking a
suggestion is identical to the text they would get pasting the file in
directly, embed brackets included, and already resolves the reader's own
"shortest path when possible" and "use Wikilinks" settings rather than this
plugin inventing a second opinion about either.

**Reversed during the build: the selection commits through `EditableHandle.set`,
not a dispatched `input` event, and that is new wiring rather than none.** This
section originally proposed dispatching the field's own `input` event on the
claim that `editable.ts`'s existing commit path would then fire "exactly as it
would for anything typed and left." `interaction/editable.ts`'s own `input`
listener only calls `redraw()` — draft feedback, no write — and
`commitIfChanged` runs solely on `blur`, `Enter`, or a caller invoking
`EditableHandle.set` directly (`bindEditable`'s return value). A dispatched
`input` event would therefore have left the field showing the new reference
with nothing committed until the reader separately blurred or pressed Enter, a
silent extra step nobody asked for. So `RenderContext.suggestFile` and
`PictureFrameOptions.suggestFile` both carry a second parameter, `commit:
(next: string) => void`, and `renderPictureFrame` captures `bindEditable`'s
handle and passes `handle.set` through as that commit — one line of new wiring
in `renderPictureFrame`, not none. `FileSuggest.selectSuggestion` calls it
directly rather than touching the field's own events at all.

**Lifecycle is the one place this differs from the editor pane's copy, because
the sheet's render loop rebuilds far more often.** `layout-editor.ts` tracks
every `FormulaSuggest` it attaches and closes each one at the top of its own
redraw; `sheet-view.ts` has to take on the identical duty for `FileSuggest`,
since its `render()` rebuilds the whole grid on every commit
(`renderGrid`'s own callback in the `SPEC §5` render pass) and an input removed
mid-focus fires no `blur` to close a popup itself. Anywhere fewer than that
leaks a suggester (and the listeners it owns) on every edit to any picture on
the sheet.

## Config fields

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| `fit` | `select` | Fit | How the picture fills its frame: fitted inside it with nothing cropped, cropped to fill it, or stretched to fill it exactly. Defaults to fitted. Declared identically on Image and Passport. |

`suggestFile` is not a config field — it is a `RenderContext` member, supplied
by the host and invisible to the layout author.

## Data and file model

No change to either component's storage, `read`, `write`, or `scopeValues`.
`fit` is layout config, read once per render and never written to a character
note (Constraint 4 does not arise). The suggester only ever produces text
`embed-rule.ts` and `editable.ts` already accept or refuse exactly as if it had
been typed by hand — it is a faster way to write the same reference, not a new
kind of value, so Constraint 3 is untouched: an unedited section round-trips
exactly as it does today regardless of whether its embed was ever chosen from a
list.

## Acceptance criteria

- [x] `fit` is a `select` config field on both `image.ts` and `passport.ts`,
      `options: ['contain', 'cover', 'stretch']`, omitted from a layout file
      when left at `contain`; `contract.test.ts` passes for both with the field
      declared.
- [x] `renderPictureFrame` draws the base picture class alone for `fit` absent
      or `'contain'`, and adds `sheetsmith-fit-cover` / `sheetsmith-fit-stretch`
      for the other two; `styles.css` is regenerated from `src/styles/`.

      **Amended, and the correction is to this criterion rather than to the
      code.** It asked for the two new classes to carry `.sheetsmith-view`
      under `styles.test.ts`'s scoping check, on the same reasoning every
      `-input`/`-current`/`-select` class in that file needs it: Obsidian's own
      element rule beats an unscoped class of this plugin's at equal or lower
      specificity. `object-fit` is not that case — nothing in Obsidian's own
      CSS sets it on an `<img>`, so there is no competing rule to outweigh —
      and the base rule these two extend, `.sheetsmith-image-picture`, has
      never carried the scope either. Asking these two to carry it while their
      own base rule does not would be inconsistent rather than careful, so
      neither gains it; `styles.test.ts`'s `FIELD_CLASS` pattern correctly does
      not match `sheetsmith-fit-*`, and that is a match kept rather than a gap.
- [x] `npm run harness:shot` shows one placement each of `contain`, `cover` and
      `stretch` on Image and on Passport, in both themes, with an image whose
      aspect ratio does not match its frame.
- [x] Every existing Image and Passport test, fixture and harness shot is
      unchanged, since `contain` with no `fit` key set is byte- and
      pixel-identical to today.
- [x] `RenderContext.suggestFile` is optional; absent, `picture-frame.ts` draws
      exactly as it does today (asserted by the existing suite, which supplies
      no such member).
- [x] `src/view/file-suggest.ts`'s `FileSuggest` offers every vault file
      matching the typed text (stripped of `![[`, `]]` and a trailing `|`
      option), unfiltered by extension — `image.test.ts`'s repository-wide
      guard against an extension allowlist covers this file too, and passes;
      selecting one replaces the whole field with `generateMarkdownLink`'s
      result and fires the field's commit exactly as typing and blurring
      would.
- [x] `sheet-view.ts` tracks every `FileSuggest` it attaches during a render
      and closes each one before the next render begins, on
      `editor/layout-editor.ts`'s own precedent for `FormulaSuggest`. **Not
      independently driven by a test**: `SheetView` cannot be constructed
      without a workspace (`docs/PATTERNS.md` §11's standing row for this
      view, `sheet-view.test.ts`'s own header), which the identical pattern in
      `layout-editor.ts` is not tested directly either — verified by matching
      that precedent's shape rather than by a new automated case.
- [x] Both Image's and Passport's picture fields gain the suggester through
      the same `RenderContext` member with no change to either component
      beyond forwarding it, so `isolation.test.ts` continues to pass with
      neither importing anything from `obsidian`.
- [x] `npm run lint`, `npm test` and `npm run build` pass.
- [x] `docs/SPEC.md` §4.2's Image entry gains the `fit` clause quoted above,
      and its own catalog description for Passport's picture gains the same
      note; §13 gains one line recording the reframing question as named and
      deferred here. Written by `/land-it`.
- [x] The vault fixture places at least one picture with `cover` or `stretch`
      set, so the setting is demonstrated rather than only tested. Checked by
      rendering, not claimed.

## Commit boundaries

1. `feat: Let a picture's fit be chosen`. `picture-frame.ts`'s `fit` option,
   the two new `sheetsmith-fit-*` classes, `sheet.css`'s two new rules, the
   `fit` config field on `image.ts` and `passport.ts`, and their tests.
   `styles.css` regenerated.
2. `feat: Suggest vault files while writing a picture`. `src/view/file-suggest.ts`,
   `RenderContext.suggestFile`, `picture-frame.ts`'s pass-through,
   `sheet-view.ts`'s wiring and close-before-rebuild tracking, and their tests.
3. `test: Show a picture's fit modes in the harness`. The harness sample
   placements, the shots.
4. `docs: Record fit and file suggest in the catalog`. SPEC §4.2's Image and
   Passport entries, §13's new reframing line.

The vault fixture change is not a commit: it lives outside the repository.

## Deliberately not doing

- **Reframing.** The open model question above — where a per-character focal
  point would live — is not answered here. `cover` always centres.
  `docs/features/picture-focal-point.md` carries it forward as its own draft
  rather than as an unstaffed intention.
- **A file picker or modal.** `docs/features/rich-text-and-image.md` already
  refused one for Image, on the grounds that a picker needs a context member of
  its own and the vault is not a closed list — a `<select>`'s own job. The
  suggester is additive to the existing "the field is the picker" gesture, not
  a replacement of it: every keystroke that works today keeps working exactly
  as it does, with a list offered on top of it.
- **Filtering suggestions by extension.** Proposed in the original draft and
  reversed during the build, argued above: `image.test.ts`'s repository-wide
  guard against an image-extension allowlist covers this feature too, and it
  does not distinguish a resolution decision from a convenience one. Every
  vault file is offered, matching Obsidian's own `![[` suggester.
- **Rich text's own `[[` suggester.** SPEC §13's `editMarkdown` question is
  untouched by this feature and remains open for the harder case: an inline
  suggester inside flowing prose, which needs a real editing surface this
  feature's field-is-the-whole-value shape never required.
- **A stored size or crop hint of any kind beyond `fit` itself.** Image's own
  refusal of a per-character size stands exactly as written; `fit` is a layout
  decision about presentation, not a number a character's note could disagree
  with the grid about.
