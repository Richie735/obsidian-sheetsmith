# Declarative settings

Status: shipped
Board card: The settings tab describes itself to Obsidian as data, so its preferences appear in settings search on 1.13 and later.

## Model question

**None, and the check is short.** The settings tab is not a component: it has no
entry in the registry, no `configFields`, no `scopeValues`, and publishes no name
to the sheet-wide table. It reads and writes `data.json` through
`plugin.settings` and touches no character note, so Constraint 3 (byte-identical
round-trip) and Constraint 4 (a layout change never deletes data) have no
surface here. `SPEC` §13 has no open question about the settings tab; the closest
entries are about scope resolution and the catalog, and neither is reachable
from this diff. `SPEC` §7 owns the tab and says what it holds — three
preferences and a button — which this feature does not change.

The interesting questions were both **platform** questions, and both are now
answered out of Obsidian 1.13.7's own `app.js` rather than guessed at. They are
answered in § Design because the answers *are* the design.

## What it does

The tab returns its four rows from `getSettingDefinitions()` instead of drawing
them in `display()`, so Obsidian indexes each row's name and description and a
reader who types "character folder" into **Settings** search finds it. No
preference changes shape, default, or storage.

**It does look different on 1.13, and an earlier draft of this spec said it did
not.** Obsidian's definition renderer wraps the rows in one group, so four
separately-carded rows become a single card with hairline dividers, capped at
`--setting-group-max-width` and centred — the look every core settings tab has.
§ What a reader sees has the detail. The claim is corrected rather than deleted
because it was believed for a while and it is the reason the first acceptance
criterion here measured nothing.

It also closes the second review finding it was raised beside — the harness no
longer calls the deprecated `display()` — though the settings test still calls it
on purpose, to cover the fallback.

## Smallest version

Four definitions in the tab's current order, every one of them a `render` row,
returned from one private `rows()` that `display()` also walks so the pre-1.13
path draws the same tab. Plus enough of Obsidian's definition renderer in
`src/test/obsidian-stub.ts` that the existing settings test and the harness panel
keep rendering the same DOM. It gives up the folder autocomplete a `folder`
control would bring for free, and the declarative `control` the toggle wanted to
be — see § Deliberately not doing and § The floor.

## Design

### What the platform actually does

Four facts, read out of `obsidian-1.13.7.asar`'s `app.js`, because each one
decides part of the design and three of them contradict what this repository
believed.

**1. Search indexes the definition, never the control.** The tab search walks
every definition and scores `name`, `desc` (a fragment's `textContent`) and
`aliases`. It does not look at `control`. So **a `render` definition is fully
searchable**, and the choice between `render` and `control` is about who owns the
element, not about whether the row is findable. Obsidian's own core tabs prove
it: Appearance declares base theme, accent colour and themes as `render`, and
About declares version and auto-update as `render`, reserving `control` for plain
binds like `{ control: { type: 'slider', key: 'baseFontSize' } }`.

**2. A row's name is still not associated with its control.**
`Setting.prototype.setName` is `this.nameEl.setText(e)` — a sibling
`.setting-item-name` div, with no `for`, no `id` and no `aria-label`, in 1.13.7
exactly as before. And a `control` of type `text` renders through plain
`addText`, setting no accessible name either. So the `aria-label` at
`settings.ts:203` is still necessary, and **a `control` would lose it**, because
the plugin never sees the input.

**3. Persistence through a `control` is real, and this was the blocker that
expired.** `PluginSettingTab.setControlValue` is
`settings[key] = value, this.plugin.saveData(settings)` — which is the whole of
this plugin's `saveSettings()`. The comment at the top of `settings.ts` that said
a `control` write might silently stop saving was wrong, and has been corrected in
place.

**4. Nothing rewrites a control's displayed value after a write.** The framework
calls `refreshDomState()` after `setControlValue`, and that only toggles
`visible` and `disabled` — it never re-reads `getControlValue` into the input.
The full rebuild, `update()`, deliberately *skips* any setting whose control
contains the active element, so it cannot rewrite the box a reader is typing in
either. So **the layout folder's substitute-on-empty cannot be expressed as a
`control`**: `validate` rejects without replacing, `defaultValue` covers only
`undefined`/`null`, and even overriding `setControlValue` to substitute would
store the default while leaving the box reading empty — a control lying about its
value, which is the exact defect its `blur` listener exists to prevent.

Fact 4 is what dissolves the second open question. Nobody has to decide whether
an emptied layout folder becomes a rejection or stays a fallback, because the row
stays a `render` row and keeps the fallback it already has, argued in
`docs/features/character-folder.md`.

### The floor, and why both paths exist

**`manifest.json` declares `minAppVersion: 1.9.0`, and that is accurate for every
other line in this plugin** — `obsidianmd/no-unsupported-api` reports nothing
else above it. `getSettingDefinitions()` does not exist below 1.13, and on those
versions the base class's `display()` is the only thing that draws a tab at all,
so a definitions-only tab would be **blank** for anyone who has not updated.
The linter says so in as many words, and it was right: the first draft of this
feature deleted `display()` and would have shipped that.

Raising the floor to 1.13.0 was the alternative and was refused. It would trade
installability for a search index, on a plugin whose first directory submission
is still ahead of it, and it would raise a floor the rest of the code does not
need for one tab's benefit.

So the tab carries both paths, and the cost is paid in one place rather than
spread: **the rows are built once**, by a private `rows()`, and each path walks
that array.

- `getSettingDefinitions()` returns it, and Obsidian 1.13 paints it. This is what
  a reader on a current app gets, and the only path that reaches search.
- `display()` walks it and makes the same three calls the framework's renderer
  makes — `new Setting(containerEl)`, `setName`, `setDesc` — then hands the row
  to its own `render`. Dead code above 1.13, because `renderTab()` prefers the
  definitions whenever the array is non-empty.

### The definitions

Four rows, in the order the tab draws them now, and **all four are `render`
rows**:

| Row | Why it renders itself |
| --- | --- |
| Layout folder | Owns its `blur` rewrite, so the box agrees with what is in effect (fact 4) |
| Character folder | Owns its `aria-label` and its trim (fact 2) |
| Open sheets in sheet view | A plain bind, and still a `render` — see below |
| Layout editor | A CTA button; `action` makes the whole row clickable instead |

**The toggle is the row that changed, and it is worth saying why.**
`control: { type: 'toggle', key: 'openInSheetView' }` is what it wants to be: one
plain bind, declared as data, read and written by the framework. It cannot be,
because a `control` is bound by the *1.13 renderer*, so the row would be blank
on exactly the versions `display()` exists for. One mechanism that works on both
floors beats a better one that works on the higher. The `setControlValue`
override the first draft added went with it: with no control on the tab, there is
no framework write to route, and every preference reaches disk through
`saveSettings()` the way it always did.

Each row carries the `name` and `desc` it passes to `setName`/`setDesc` today,
unchanged — including the toggle's `createFragment` description, since `desc`
takes a `DocumentFragment` and search reads its `textContent`. The character
folder keeps its `\u00a0` escapes, written as escapes for the reason the comment
at that string gives: a pasted one is invisible to every reader of the file.

`SheetsmithRow` is declared narrower than `SettingDefinitionItem` on purpose.
`name` and `desc` are required, because a row missing either is a row missing
from search, and `render` takes only the `Setting` — which is what lets
`display()` call it without constructing a `SettingGroup`, itself a 1.11 API this
plugin's floor sits below.

### What a reader sees

**One card where there were four, on Obsidian 1.13.** This is the part the first
draft got wrong, and it is worth stating precisely because the instrument that
should have caught it did not.

Obsidian's renderer never puts a row straight into a tab. `e6` collects every
consecutive definition that is not itself a group or a list — `O2(e)` is
`"type" in e && ("group" === e.type || "list" === e.type)`, which all four rows
here fail — into one synthetic `{ type: 'group', items: [...] }`, and
`SettingGroup` draws it as `containerEl > .setting-group > .setting-items`, with
the rows inside `.setting-items`. `app.css` then restyles on exactly that
nesting:

- `.setting-group .setting-items` supplies one shared card — background, border,
  radius.
- `.setting-group .setting-item:not(.setting-item-heading)` takes each row's own
  card, border, radius and `margin-bottom` away, moves padding from `--size-4-4`
  to `--setting-items-padding-*`, and puts a `::before` hairline between rows,
  suppressed on the first.
- `.setting-group` caps the width at `--setting-group-max-width` — 700px — and
  centres it with `margin-inline: auto`.

So the tab gains the look of Obsidian's own settings tabs, and **this is not a
choice the plugin gets to make**: the app wraps the definitions whatever the
plugin does, so the change ships either way. What was in the plugin's hands was
only whether anyone could see it before a user did.

Below 1.13 the `display()` fallback draws the four separate cards it always drew,
because it builds rows straight into `containerEl` and no group exists. Both
looks are correct for their floor.

Everything else is unchanged: same four rows, same order, same copy, same
controls, same placeholder, same CTA.

Empty and error states are unchanged, because neither row grows one: the
character folder's empty state *is* its shipped value and stays visibly empty,
and no row gains a `validate`, so `Setting.setErrorMessage` — which the framework
would drive and the stub does not model — stays out of this diff.

### The stub

`src/test/obsidian-stub.ts` grows the definition renderer, transcribed from
`app.js` with the deminified source in the comment, the way `normalizePath`
already is. It needs:

- `getSettingDefinitions()` returning `[]`, and `settingItems` to hold what
  `update()` stored.
- `update()`, which stores `getSettingDefinitions()` and renders it into
  `containerEl`. **This is the one deliberate deviation and it must be commented
  as one**: the app's `update()` delegates the paint to the settings modal's
  `refreshCurrentPage`, and the stub has no modal, so it renders directly. What
  the stub models is the definition-to-DOM mapping, not the modal's scheduling.
  A second, narrower deviation goes with it — the stub rebuilds where the app
  diffs — so nothing may read focus across an `update()`. Note what that skip
  actually is: `"control" in def && !!def.control && …`, **gated on a `control`
  row**, which none of these are. A `render` row holding the active element is
  torn down and rebuilt in the app too, and re-focused afterwards.
- The group wrapper the app builds — `.setting-group`, its empty
  `.setting-group-search`, and `.setting-items` — with the rows inside the list.
  **This was the third deviation the first draft shipped without noticing**, and
  it is the one that decided what the shots showed. It is now modelled rather
  than deviated from, and `obsidian-stub.test.ts` asserts the nesting.
- A `DocumentFragment` `desc` **cloned**, mirroring the app's
  `sg(e) = typeof e === 'string' ? e : e.cloneNode(true)`. The clone is
  load-bearing: `renderTab()` paints the stored definitions on every tab
  activation while `update()` runs once, so an appended fragment empties the row
  the second time it is drawn.
- `name`, `desc` and `render`, and **nothing else** among the row members that
  draw. `control` is *refused* rather than modelled, along with `type`, `action`,
  `visible` and `disabled`: each throws, and the test asserts the refusal names
  the member. `validate` is deliberately **not** on that list — an earlier draft
  of this spec asked for it, wrongly: it is a member of `SettingControlBase`, so
  it can only arrive inside a `control`, and refusing `control` refuses it with
  no branch of its own. `aliases` and `searchable` are accepted and unread,
  because they feed search rather than the paint, which is what the app does with
  them at render time too. No row on this tab declares a control, and
  `getControlValue`/`setControlValue`/`getControlBinding`/`refreshDomState` are
  absent for the same reason — a binding half-built here, a write that lands in
  the object but never asks for a save, is precisely the silent divergence this
  file exists to prevent. The deminified source for all four stays in the
  comment so the next reader can see what they would do.

`Setting` needs nothing added — it already has `setName`, `setDesc`, `addText`,
`addToggle`, `addButton`, `controlEl` and `settingEl`, which is everything a
`render` callback here touches. `SettingGroup` is new and exported, because
`render`'s second parameter is one; it models `groupEl` and `listEl` and nothing
else, an `addSetting` that no caller reached having been dropped.

`harness/calibrate.mjs` gains `/^\.setting-group/` in `CHROME`. Every rule that
restyles a grouped row is anchored on the group, so `/^\.setting-item/` never
reached any of them and the harness could not have drawn the grouped look even
against a stub that built the wrapper.

`harness/settings-panel.ts` and `src/settings.test.ts` switch from
`tab.display()` to `tab.update()`, so what they render is the path a reader on a
current Obsidian gets. The settings test then renders a second time through
`display()`, because a fallback nothing exercises is a fallback nobody knows is
broken.

### The lint consequence nobody would notice

`obsidianmd/ui/sentence-case` reads UI copy only at the call sites it recognises,
and the argument of `setName`/`setDesc` is one of them. **A `name:` or `desc:`
property in a definition object is not**, so moving to definitions takes all
four rows out of that rule's reach, and the `ignoreRegex: ['→']` exemption for
`src/settings.ts` becomes vacuous — a passing check with nothing left to check,
which `PATTERNS.md` §10 names as its own defect. The exemption block goes, and
its argument about arrow notation colliding with sentence case moves to a comment
at the copy it governs, so the next author who adds a row here still meets it.

**Two exemptions go and two arrive, and the swap is the point.** What goes is the
pair that said the migration had not happened: `prefer-setting-definitions` for
`src/settings.ts`, and `no-deprecated` for `harness/**`. What arrives says
something true instead — that the harness and the settings test render a path
newer than the shipped floor on purpose:

- `harness/**` gains `no-unsupported-api: off`. It calls `update()` because that
  is the path worth looking at, and it is not shipped code.
- `src/settings.test.ts` gains `no-unsupported-api: off` and
  `no-deprecated: off`, because it drives *both* paths deliberately.
- The test-scaffolding block gains `settings-tab/require-display: off`, for a
  fixture: `obsidian-stub.test.ts` builds throwaway `PluginSettingTab` subclasses
  to hand the renderer a definition, and the rule has no opinion worth having
  about a class that exists for one assertion. The shipped tab does implement
  `display()`, which is what the rule is right about.

## Config fields

None. This feature adds no component and no layout key; the plugin's three
preferences keep the shape and defaults `SheetsmithSettings` already declares.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |
| — | — | — | — |

## Data and file model

Nothing changes. `data.json` keeps the same three keys with the same types and
the same defaults, written through `plugin.saveSettings()` as before. No
character note and no layout file is read or written, so there is no
round-trip to preserve and nothing to migrate. An install carrying settings from
0.1.1 reads back identically, because the storage seam is the same object.

## Acceptance criteria

- [x] Every one of the **nine** existing cases in `src/settings.test.ts` passes
      with its assertions unedited. They read the DOM, so they are the regression
      suite for the migration: same rows and same controls, or a red test. (The
      first draft of this line said eight; there were nine.)
- [x] A case asserts every definition carries a non-empty `name` and a `desc`, so
      the review finding is checkable as data without rendering anything.
- [x] A case asserts every row `name` is sentence case, because the declarative
      move took all four out of `obsidianmd/ui/sentence-case`'s reach. Names only
      — § The lint consequence says why descriptions are left to review.
- [x] The layout folder falls back to the default when emptied *and* shows what
      it fell back to. Met by the existing case, which now runs through
      `update()`; a second copy would be the duplication `PATTERNS.md` §10
      rejects.
- [x] The character folder's input still reports "Character folder" as its
      accessible name.
- [x] A case renders through `display()` and asserts the same four rows and **all
      four** of their controls, so the pre-1.13 fallback is not untested code.
- [x] `src/test/obsidian-stub.test.ts` asserts the double builds the app's own
      nesting — `containerEl > .setting-group > (.setting-group-search,
      .setting-items > .setting-item)`, with no heading row — and drives the rest
      of the renderer: `update()` paints where `display()` alone does not, a
      `render` definition receives the `Setting`, a fragment `desc` survives a
      second paint, a cleanup runs *before* the repaint that replaces it, and each
      refused member is refused **by name**.
- [x] The settings shots show the grouped card Obsidian 1.13 draws. **This
      replaces the first draft's "byte-identical to the ones before the change",
      which was met and meant nothing**: the double appended rows straight into
      `containerEl`, exactly as the old imperative `display()` did, so the
      criterion compared the new path against a faithful copy of the old one.
      Checked by looking at `settings-light.png` and `settings-dark.png` after
      `harness:calibrate`, not by comparing bytes.
- [x] The narrow regime has shots of its own, `settings-620-{light,dark}`, at
      `width=620` in a `1000,620` frame. Every wrapping question on this tab
      lives below the 700px cap, so the two Full-width shots could not answer
      one, and `UI.md` §11's claim to cover "the narrow reflow on each" screen
      was false for this one.
- [x] **Open layout editor** paints as a call to action. It did not: the
      harness's `mod-cta` fallback sat in `@layer harness-fallback` and lost to
      the calibrated unlayered bare-`button` rule, so the one row whose job is to
      be the CTA photographed white on white and was reviewed that way. The same
      fix corrects the layout editor's vacant-state CTA, visible in
      `editor-vacant.png`.
- [x] **The group rules reach the settings tab and nothing else**, by
      construction: `harness/settings-panel.ts` is the only surface that renders
      a `PluginSettingTab`, and `.vertical-tab-content` is set only by the stub's
      constructor, so no other surface has a `.setting-group` ancestor.
- [x] **The CTA fix moves editor shots too, and that is correct.** An earlier
      draft of this line claimed no other shot moved; it was false, and a review
      caught it. The `theme.css` rule is scoped
      `:is(.vertical-tab-content, .harness-editor) button.mod-cta`, and
      `editor/list-fields.ts` marks its **Add row** button `mod-cta` — so every
      editor shot carrying a list field repaints that button accent:
      `editor-row-error`, `editor-reset-column`, `editor-reset-formula-error`,
      `editor-reset-formula-error-large-text`, `editor-modifiers`,
      `editor-modifiers-narrow`, `editor-threshold`, and their dark variants.
      Accent is what Obsidian draws for a `mod-cta`, so these shots were wrong
      before and are right now. What the repaint made *visible* is a question
      about the editor rather than about this feature, and it has a
      `docs/BACKLOG.md` § UI row rather than a fix here.
- [x] `npm run lint` passes at `--max-warnings 0`.
- [x] `npm run build` and `npm test` pass.

## Commit boundaries

1. `test: Teach the obsidian stub to render setting definitions`. The stub's
   `getSettingDefinitions`, `settingItems`, `update()` and `SettingGroup`, with
   the deminified source, the one remaining deviation and the refusals
   commented, plus the `obsidian-stub.test.ts` cases that drive them — the
   nesting assertion among them.
2. `feat: Describe the settings tab as data`. `rows()`, `getSettingDefinitions()`
   and the `display()` fallback in `src/settings.ts`, the `SheetsmithRow` type,
   and the two call sites moved to `update()`.
3. `test: Cover both of the settings tab's render paths`. The `open(path)`
   parameter, the `buttonIn` locator, the fallback case, the definitions-as-data
   case and the sentence-case case.
4. `fix: Let the harness draw a grouped settings row`. `calibrate.mjs`'s
   `CHROME` gains the group wrappers, without which no stylesheet the harness
   loads could render the look Obsidian 1.13 gives this tab.
5. `fix: Make the harness paint a call-to-action button`. `theme.css`'s
   `mod-cta` rule moves out of the fallback layer, where an unlayered calibrated
   rule had been beating it silently, and gains the app's own `--text-color`
   mechanism plus a hover.
6. `test: Photograph the settings tab below its width cap`. The two
   `settings-620` entries in `shot.mjs`'s `DEFAULTS`.
7. `chore: Say what the settings-tab lint exemptions are for`. The two
   exemptions retired, the three added, and the arrow-notation argument moved to
   the copy it governs.
8. `docs: Record what the declarative settings move settled`. This file, and
   `SPEC` §7 where it names how the tab is built.

## Deliberately not doing

**Folder autocomplete.** A `folder` control attaches Obsidian's own folder
suggester to the input, which neither folder row has today and both would
benefit from. It is not taken here because it arrives only with `control`, and
`control` costs the `aria-label` (fact 2) and the layout folder's
display-agrees-with-effect rewrite (fact 4). The route that keeps all three is a
`render` row adding `AbstractInputSuggest` itself — that is public API, it is a
feature rather than a migration, and it should be specced as one.

**Grouping the rows.** `type: 'group'` with a heading, and `page` for a
sub-page, are how the API expresses more structure than four rows need. Four
rows are four rows.

**A `control` for the sheet-view toggle.** It is the one plain bind on the tab
and the one row that wants to be declared rather than drawn. A `control` is bound
by the 1.13 renderer, so the row would be blank below that floor, and § The floor
is why the floor stays. It becomes available the day `minAppVersion` reaches
1.13.0 for some other reason, and the `setControlValue` override it needs is
three lines this feature wrote and then removed — the history has it.

**Raising `minAppVersion` to 1.13.0.** Refused, with the argument in § The floor:
it trades installability for a search index, on a plugin that has never been
listed, and raises a floor the rest of the code does not need.

**A `validate` on either folder.** Adding one would be a behaviour change dressed
as a migration: today neither folder rejects anything, and whether an emptied
layout folder *should* be an error is a live design question that this feature
no longer has to answer.

**Anything about the other seven review findings.** They were judged and
rejected on their own merits; this feature closes exactly two of them, the
declarative-settings warning and the deprecated `display()` recommendation.
