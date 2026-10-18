# Disabled controls

Status: shipped
Board card: the `docs/BACKLOG.md` § UI row "A disabled control looks exactly like an enabled one". The row leaves `docs/BACKLOG.md` in the commit that closes it.

Standard route (`docs/WORKFLOW.md` § Routes). Approved by the owner with four amendments: the stub correction lands first as its own commit; `role="button"` goes on every `div` arrow that carries `aria-disabled`; the list-field arrows refuse at their ends in the handler itself, a guard later withdrawn at the land stop because `moveItem` already refuses an end press and no test could see it; and `docs/UI.md` §6 records how a glyph-only control shows a disabled state. The rule is already settled: `docs/UI.md` §6, "A reorder control with ends disables at them". The mechanism is already in the pane too: focus follows an item through a move by its token (`layout-editor.ts`'s `redraw` wrapper, `ListContext.focusAfterRedraw`, `docs/features/layout-editor-tree.md` §5). Stops: spec approval, the land stop.

## Model question

None. This is editor chrome: nothing is stored, nothing is published, the §4.1 contract does not grow, and no §13 question touches it.

## What it does

The first item's up arrow and the last item's down arrow in a reorder list are disabled, look disabled and are announced as disabled. A move that lands an item at an end puts focus on the opposite arrow. Without that, focus would drop to the document, because the arrow it would have returned to can no longer take it. This covers both reorder lists that have arrows: a Tab set's tab order, and every list field on a mobile device.

## Smallest version

The focus handoff and `aria-disabled` at both sites, plus the end-disabling the list fields' arrows lack today. That closes the row on behaviour and on announcement, because Obsidian's own `.clickable-icon[aria-disabled='true']` rule paints the resting state once the attribute is there. Could be dropped: the plugin's paint rule (cursor and forced colors) and `role="button"` on the tab-order arrows. The owner approved the full design, so nothing is dropped. The stub and harness correction is a precondition that lands first, not part of this feature (Design, "Staging").

## Design

### What the code does today (verified)

- **Tab-order arrows**, `editor/config-panel.ts` `renderChildOrder` (~601–622). Each one is an `ExtraButtonComponent`, created with `setDisabled(index === 0)` and `setDisabled(index === tabs.length - 1)`, so the disabling itself is already right. In Obsidian 1.14.4 (`app.js`, read from the installed asar) the element is a `div.clickable-icon.extra-setting-button` with `tabindex="0"` and no `role`. `setDisabled(true)` adds `is-disabled`, **removes `tabindex`**, and makes a click or Enter do nothing. It sets no `aria-disabled`. `app.css` has no rule for `.clickable-icon.is-disabled`, so the arrow looks enabled, and nothing tells a screen reader it is disabled.
- **List-field arrows**, `editor/list-fields.ts` `addControls` (~197–213). They are drawn only when `Platform.isMobile`. On desktop the row gets a drag handle with arrow keys instead, and a handle has no ends (UI.md §6). Each arrow is a `<button class="clickable-icon">` that is never disabled. At an end, `moveItem` returns before it does anything, so pressing the arrow silently does nothing. `addControls` serves all five list fields: rows, columns, entries, promoted fields and modifier definitions. A change made there reaches all five at once.
- **What focus does at an end today.** `redraw` restores the focused element's token with `pendingFocus ??= focusedToken()`. When a move lands an item at an end, that token names the arrow that is now disabled. That arrow cannot take focus, so `focusToken` focuses nothing and focus falls to the document body. This is already true for the tab-order arrows. It becomes true for the list arrows as soon as they disable, which is why the rule makes the handoff part of the disabling.

### The handoff

**When.** A press of an arrow, **while that arrow holds focus**, that moves its item **to an end**:

- up, landing at index 0 → focus goes to the same item's **down** arrow;
- down, landing at the last index → focus goes to the same item's **up** arrow.

Pressing up can never land an item last, and pressing down can never land it first, so these two cases are the whole rule. The opposite arrow is always enabled, because a move needs at least two items and an item at one end of a list of two or more is not at the other end. A move that does not land at an end changes nothing: focus follows the item to the same arrow, as it does today.

**Only when the pressed arrow holds focus.** A touch tap does not always focus a button (WebKit does not). Where focus was somewhere else, the handoff would *take* focus somewhere the reader did not put it, and moving focus only as the outcome of where the reader already was is `docs/UI.md` §7's line. So the check is `arrow.ownerDocument.activeElement === arrow` at the press. Where it fails, nothing changes: the redraw restores whatever was focused, as it does today.

**How.** Through the mechanism that already exists. The press calls `context.focusAfterRedraw(<opposite token>)` **before** `moveItem`. The `redraw` wrapper only fills `pendingFocus` when nothing has already asked (`??=`), so the explicit request wins over the token it would otherwise have captured. The tokens are the ones each site already stamps:

| Site | Up token | Down token |
| --- | --- | --- |
| `addControls` | `${token}-up` | `${token}-down` |
| `renderChildOrder` | `tab-up-${tab.id}` | `tab-down-${tab.id}` |

Each token carries the item's identity, so after the move it still names the same item's arrows. No new `ListContext` member, and no change to `moveItem`'s signature.

**Spelled at each site, not extracted.** There are two consumers and a test drives each one, which is PATTERNS §1's two-consumer rung. The tree menu's **Move up** and **Move down** are not a third consumer, because the menu closes and focus goes to the row's name (`layout-editor-tree.md` §5). A third arrowed reorder list extracts the handoff.

**What a screen reader hears.** The reader presses **Move STR up**, STR becomes first, and focus lands on **Move STR down**, which the reader hears as "Move STR down, button". That landing *is* the announcement. The control they pressed is gone from the tab order, and the one they now stand on names the only direction left. Nothing says "now first" in words. No position is announced after a move anywhere in the pane today, mid-list included, and a live region would be a new mechanism in a pane that has none (Deliberately not doing). The arrow just disabled carries `aria-disabled="true"`. A reader who reaches it in browse mode hears it as dimmed or unavailable, which is what UI.md §6's "disabled is announced" asks for.

**Every `div` arrow that carries `aria-disabled` gains `role="button"`.** In practice that means the tab-order arrows alone. The list-field arrows are already `<button>` elements (`row.createEl('button', …)` in `addControls`), so they have a native role and need none. The app's `div` has no role, and `aria-disabled` on an element with no role is not reliably exposed: ARIA 1.3 no longer treats it as global. Without a role, the arrow focus lands on is heard as its label alone. `editor/copyable-name.ts` is the precedent for a role on a non-button control. This follows from HTML-AAM and the ARIA spec, not from testing with a screen reader, and the land stop says so.

### Disabled state, per site

- **List-field arrows:** `disabled` (the button leaves the tab order and ignores a press) and `aria-disabled="true"` (so the arrow matches the paint below). **An end press that reaches the handler anyway changes nothing** (a synthetic click, or a handler bound before the state is set): `moveItem`'s range check refuses an index off either end, and the handoff's condition cannot hold at an end, so nothing moves and no focus is requested. A test holds that with `disabled` taken off.
- **Tab-order arrows:** `setDisabled` as today (removes `tabindex`, ignores a press), and also `aria-disabled` toggled to match.

Both sites end in the same state: out of the tab order, a press does nothing, announced, and one attribute for the paint to key on.

### Paint, as given

**Not generalised from the Modifiers list, and no new resting colour.** The Modifiers precedent (`modifier-notes.md`, `editor.css` ~1268) uses two channels: a label that goes faint, and a select that loses its surface. A bare icon button has neither a label nor a resting surface, so that rule has nothing to act on here. The resting paint is the app's own: `.clickable-icon[aria-disabled='true']` (muted, `opacity: 0.4`, no hover surface), reached by the attribute both sites now carry. At (0,2,0) it outranks `button[disabled]`'s `opacity: 0.7`, so both sites paint identically. None of the editor's `.clickable-icon` resets set `color` or `opacity`.

**A sibling rule, scoped to the layout editor pane, adds what the app's rule lacks:**

- `cursor: not-allowed`, the precedent's pointer channel;
- under `forced-colors: active`, `color: GrayText` at `opacity: 1`. The system paints a disabled `<button>` in GrayText itself, but it does not know the tab-order `div` is disabled. This gives the two sites one forced-colors reading, and it is the system's own.

That is the backlog row's "four lines". **Its limit, stated rather than designed around:** a glyph has no shape to change, so the precedent's "neither colour alone" holds only through the non-visual channels: out of the tab order, announced, and no pointer answer. The visible channel is the fade.

**Recorded as a rule.** The dev adds a `[judgement]` amendment to `docs/UI.md` §6: a glyph-only control shows a disabled state as muted paint plus `aria-disabled`, and as GrayText in forced colors, because it has no surface to drop. That sits beside the Modifiers precedent, which drops a surface because it has one.

### Other `setDisabled` sites (case 3 audit)

Left alone, because each one is already painted:

| Site | Control | Painted by |
| --- | --- | --- |
| `editor/component-picker.ts:420` | `ButtonComponent` | `button[disabled]` |
| `editor/paste-box.ts:63`, `:74` | `ButtonComponent` | `button[disabled]` |
| `editor/new-layout.ts:422` | `ButtonComponent` | `button[disabled]` (its own comment already says so) |
| `editor/reset-field.ts:833` | `ButtonComponent` | `button[disabled]` |
| `editor/tree-moves.ts:333` | `MenuItem` | `.menu-item.is-disabled` |

`view/sheet-view.ts:883` (a trigger with nothing bound) is a native `<button disabled>` with its own `.sheetsmith-trigger:disabled` rule. It is on the sheet, not in the pane, and already has its own disabled paint.

`editor/layout-file-row.ts:230` **guards rather than disabling**, and that stays. "No layout selected" is not the end of a list, so the end-disabling rule does not apply to it. Only the comment's last clause changes: it calls this the fifth member of the backlog row, and that row leaves with this work. The reason in the comment (`setDisabled` reaches no paint for a `.clickable-icon`) is still true of `setDisabled` alone.

### Staging

**This lands first, as its own `test:` commit, before the feature is built.** It corrects the test double rather than changing behaviour. Every before-shot is retaken on the corrected harness after that commit, so the before and after PNGs differ only by this feature. It is not one of the feature's land-time commits.

The harness draws neither set of arrows truthfully today:

1. **The stub's `ExtraButtonComponent` is a `<button>`** (`src/test/obsidian-stub.ts` ~886), and the base `setDisabled` sets `disabled` on it. The calibrated `button[disabled]` rule then paints it at `opacity: 0.7`, so **the harness shows the tab-order arrows as painted, while the app does not**. The stub should model the element as the app builds it: a `div.clickable-icon.extra-setting-button` with `tabindex="0"`, where `setDisabled` toggles `is-disabled` and removes or restores `tabindex`, and a disabled one ignores a click, Enter and Space. The comment should cite 1.14.4's `app.js`, and a case in `obsidian-stub.test.ts` should hold it. Five sites use extra buttons (two here, `reset-field.ts:699`, `layout-file-row.ts:163` and `:172`). Any test selecting them as `button` is fixed in the same commit.
2. **`Platform.isMobile` is never true in the harness.** `platform=phone` and `platform=tablet` add body classes and nothing else, so every phone shot draws desktop drag handles. The harness should set the stub's `Platform.isMobile` from `document.body.classList.contains('is-mobile')` at startup. `stagePlatform` adds that class before the harness script runs. This **changes the existing `editor-phone`, `editor-phone-skills` and `editor-tablet` shots** (arrows where handles were) and anything else that reads `isMobile`, such as the paste box. Each of those changes is a correction, not a regression, and the land stop says which shots changed.

New default views in `harness/shot.mjs`:

| View | Query and fields | Shows |
| --- | --- | --- |
| `editor-reorder-arrows-phone` | `surface=editor&theme=light&open=abilities`, `size: '380,…'` measured, `platform: 'phone'`, `frame: '.sheetsmith-editor-panel'` | Abilities' entry list, STR's up arrow disabled and CHA's down arrow disabled. An entry list has no scroll cap, so both ends are inside the frame. |
| `editor-tab-order` | `surface=editor&theme=light&open=pages`, `EDITOR_FRAME` or a frame on the form | The Pages tab set: Combat, Spell list, Rest. Combat's up arrow disabled, Rest's down arrow disabled, Spell list with both enabled. |
| `editor-tab-order-forced-colors` | the same, `flags: ['--force-high-contrast']` | The GrayText reading of the tab-order arrows |
| `editor-reorder-arrows-phone-forced-colors` | the phone view, `flags: ['--force-high-contrast']` | The same on the list arrows |

The handoff itself is held by tests, not by a shot. A `press=` is a pointer press, and a programmatic focus after a pointer press draws no `:focus-visible` ring, so a PNG of it would show nothing.

### Empty and error states

A list of one item has both arrows disabled and offers no move, so no handoff can happen. An empty list draws no rows. The tab order's empty sentence is unchanged. There is no error state: `moveItem` refuses nothing except an out-of-range index, which a disabled arrow can no longer send.

## Config fields

None.

## Data and file model

Nothing stored. A move persists exactly as it does today, so no existing note or layout changes.

## Acceptance criteria

- [x] On mobile, `addControls` draws the first item's up arrow and the last item's down arrow with `disabled` and `aria-disabled="true"`. A middle item's arrows carry neither. A single item's two arrows carry both. Held in `list-fields.test.ts` under `Platform.isMobile = true`.
- [x] A focused up arrow that moves its item to index 0 leaves focus on that item's down arrow. A focused down arrow that moves its item last leaves focus on that item's up arrow. A mid-list move leaves focus on the arrow pressed, as before. Held in `list-fields.test.ts` through a context whose `focusAfterRedraw` and `redraw` behave as the pane's do, or through the pane.
- [x] A press on an arrow that does **not** hold focus does not request focus. Held by a test.
- [x] An end press changes nothing, because `moveItem` refuses it. A click dispatched on the first item's up arrow, or the last item's down arrow, with `disabled` removed for the test, leaves the list unchanged, calls neither `persist` nor `redraw`, and requests no focus. Held in `list-fields.test.ts`.
- [x] Every `div` arrow carrying `aria-disabled` has `role="button"`. The tab-order arrows carry `role="button"`, and `aria-disabled="true"` exactly where they are disabled. The list-field arrows are `<button>` elements and get no explicit role. Moving a tab to either end through a focused arrow leaves focus on the opposite arrow. Held in a test that drives the real pane (`layout-editor.test.ts` or `config-panel`'s own).
- [x] Precondition, landed before the build: the stub's `ExtraButtonComponent` is a `div.clickable-icon.extra-setting-button` with `tabindex="0"`, and `setDisabled` toggles `is-disabled` and `tabindex` as 1.14.4's does. The harness sets `Platform.isMobile` from `is-mobile`. Held in `obsidian-stub.test.ts`, with every existing test green.
- [x] A rule in `src/styles/editor.css` scoped to the pane gives `.clickable-icon[aria-disabled='true']` `cursor: not-allowed`, and under `forced-colors: active` `color: GrayText; opacity: 1`. `styles.css` is regenerated and the sync test passes.
- [x] `editor-reorder-arrows-phone` and `editor-tab-order` show the end arrows faded and the others at full strength, in the light theme. The two forced-colors views show the end arrows in GrayText. The owner looks at all four PNGs at the land stop, against before-shots retaken on the precondition commit.
- [x] `docs/UI.md` §6 carries a `[judgement]` amendment: a glyph-only control's disabled state is muted paint plus `aria-disabled`, and GrayText in forced colors, because it has no surface to drop.
- [x] `docs/BACKLOG.md` § UI gains a row recording that the pane's other three extra buttons (`reset-field.ts:699`, `layout-file-row.ts:163`, `:172`) lack a role. `backlog.test.ts` passes.
- [x] `docs/UI.md` §6's end-disabling bullet no longer says that no control does the handoff or that the list fields' arrows do not disable. It says both do, and names `addControls` and `renderChildOrder`.
- [x] The `docs/BACKLOG.md` § UI row "A disabled control looks exactly like an enabled one" is gone, and `src/backlog.test.ts` passes.
- [x] `editor/layout-file-row.ts`'s guard comment no longer calls itself the fifth member of a backlog row.
- [x] `npm run lint`, `npm test`, `npm run build` pass.

## Commit boundaries

**Precondition, landed before the build and not part of this feature's land:** `test: Model Obsidian's extra button and platform as the app does`. The stub's `ExtraButtonComponent` as the real `div`, the harness's `Platform.isMobile` following `is-mobile`, the `obsidian-stub.test.ts` case, and any test that selected an extra button as `button`.

The feature's own commits, applied by `/land-it`:

1. `fix: Disable a list field's reorder arrows at its ends`. `addControls`: `disabled` and `aria-disabled` at the ends, the focus handoff, and the `list-fields.test.ts` cases.
2. `fix: Hand focus to the other arrow at the ends of a tab order`. `renderChildOrder`: `aria-disabled`, `role="button"`, the handoff, and its test.
3. `fix: Paint a disabled icon button in the layout editor`. The `editor.css` sibling rule and the regenerated `styles.css`.
4. `test: Shoot the reorder arrows at their ends`. The four new default views in `harness/shot.mjs`.
5. `docs: Retire the disabled-control backlog row`. The `UI.md` §6 end-disabling sentence and the glyph-only `[judgement]` amendment, the `BACKLOG.md` row removed, the four new rows (extra buttons lacking a role, tab-order arrows not naming their tab, and the two the owner ordered at the land stop: Skills' list fields collapsing on a phone, and the Abilities entry fields drawing no surface on a phone in the light theme) added, the `layout-file-row.ts` comment, and this spec's status.

## Deliberately not doing

- **A live region announcing a move or a position.** No move in the pane announces one today. A region that survives the pane's rebuild is a new mechanism, and the `docs/BACKLOG.md` row "A field that appears or disappears on a sheet is not announced" already records the same need on the sheet.
- **Naming the tab in the tab-order arrows' labels.** They read "Move earlier" and "Move later", and UI.md §6's naming rule would have them name the tab, as the list fields' arrows do. The handoff makes that easier to hear, but it is not this row. Noticed, not fixed: a `docs/BACKLOG.md` § UI row is added in commit 5.
- **The drag handle.** It has no ends (UI.md §6). The "Dragging a grip handle drags only its icon" row stays.
- **"One of the editor's five add controls is a call to action"**, which waits on a primary-action decision.
- **"Obsidian's dropdown chevron is invisible in forced colors"** and **"Three hand-rolled `<select>`s in the editor reserve 2.4em for a chevron nothing draws"**.
- **"A list entry labels its first line once in a header and its second line on every entry"**.
- **Generalising the Modifiers list's disabled rule pane-wide.** It stays scoped to `.sheetsmith-list-modifiers` (Design, "Paint, as given").
- **The case-3 `ButtonComponent` and `MenuItem` sites**, which Obsidian already paints.
