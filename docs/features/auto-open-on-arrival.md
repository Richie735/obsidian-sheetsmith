# Auto-open on arrival

Status: shipped
Board card: GitHub issue #3, "Reading mode selection disappears". The two parts `docs/features/sheet-markdown-toggle.md` left over: the swallowed press and the unprompted flip (`docs/BACKLOG.md` § UI, "Pressing the mode button on a note just given the key turns it into a sheet"), and a sheet's **More options** menu.

## Model question

None. No §13 question, no contract member and no note bytes are involved: this decides when a leaf changes view type.

## What it does

A note becomes a sheet when it arrives in a leaf, and never because a view already showing it gained focus. Pressing the mode button in an inactive pane reaches Reading on the first press, and a note just given the key stays markdown, with **Open as sheet** on offer, until it is next opened. A sheet's **More options** menu gains **Open as Markdown**.

## Smallest version

This is the version being built: the `layout-change` walk and the one `WeakMap` below, plus the menu entry. An arrival whose cache is still `null` is recorded and stays markdown, and **Open as sheet** appears when the index answers. It gives up the automatic switch for such a note, which measured only behind a busy index queue, and it leaves no late flip to land on a reader.

## Design

### The moments

**May switch a view to a sheet**, each subject to the override and the setting:

1. A file arrives in a leaf that showed another file or none: explorer, link, quick switcher, history.
2. A leaf is new, whatever is open elsewhere: new tab, split, ⌘-click on the mode button, including a tab that opens unfocused.
3. During app startup, a restored leaf is first sighted: a loaded one when the layout is ready, a deferred one when it first loads.

**May not:**

4. Activating a tab or pane, by any press, including one meant for a control in that pane.
5. The key appearing under a view that stays on the file, or an arrival whose cache is `null` when the index later answers. Both keep **Open as sheet** on offer.
6. A rename, or a tab dragged to another group: same leaf, same `TFile`.
7. A press in the explorer on a note the active leaf already shows. The app raises nothing for it but focus moving to the explorer, so this is not "next opened".
8. History returning a leaf to the file it was just showing, sheet to markdown. See below.
9. Enabling the plugin mid-session, for any leaf already loaded. `markdownOverrides` is in memory, so a disable and enable empties it, and converting then would undo a reader's explicit markdown choice, possibly while they type. Those leaves are recorded, so a later arrival in them still counts.

### How arrival is detected

`layout-change` plus one memory: `WeakMap<WorkspaceLeaf, TFile>` of what each leaf last showed, private to `registerAutoOpen`, in the manner of `open-as-sheet.ts`'s `WeakMap`.

- **On `layout-change`**, walk `iterateAllLeaves`. A `MarkdownView` or `SheetView` holding a file: if it differs from memory, record it, and if it is a `MarkdownView`, it arrived. Any other view, a deferred one included: forget the leaf, so a tab closed to empty or sent to a graph and reopened on the same note counts.
- **Once at layout ready, the same walk with one difference.** `registerAutoOpen` reads the public `workspace.layoutReady` synchronously on entry, before its `onLayoutReady` call. `false` is app startup: the walk converts. `true` is mid-session: the walk only records. A deferred leaf has no file to record, so it still converts when it first loads, even after a mid-session enable: it cannot hold a choice made this session, and nobody is typing in it.
- **Identity, not path.** A rename keeps the `TFile` object and raises `layout-change` (measured), so a path compare would read it as an arrival.
- **`SheetView`s are recorded too**, or a sheet followed by a link and two Backs reintroduces the history trap.
- **`active-leaf-change` and `file-open` go.** Dropping only the first does not fix the bug: `file-open` fires on activation whenever the active file changes.
- **An unknown answer stays markdown.** `carriesLayoutKey` is false while `getFileCache` is `null`, so the arrival is recorded and does not switch. Nothing waits for the index. When `changed` answers, `open-as-sheet.ts` adds **Open as sheet**, and the note converts at its next arrival.

Interactions: `openAsSheet` and `openAsMarkdown` change the view on one file, so neither is an arrival, and `markdownOverrides` is read at arrivals exactly as now. `characters.ts` opens a sheet directly and only gets recorded. `layout-file-events.ts` redraws sheets and is untouched. `open-as-sheet.ts`'s action already follows `layout-change` and `changed`, which is what keeps the door on offer under moment 5.

### Measured

Obsidian 1.15.0, second process. Activation, opening and Back and Forward are real presses over CDP, Back and Forward on the header's own buttons; arranging leaves, the rename, opening the quick switcher, opening the Properties side panel, disabling and enabling the plugin, the split command and the new-note command are code, as setup. "Rule" is what the real build of this branch did, every row re-run on it. `alc` is `active-leaf-change`.

| Flow | Raw events | Clean build | Rule |
| --- | --- | --- | --- |
| Explorer, reading-mode link or quick switcher, active leaf | `alc`, `file-open`, `layout-change` | sheet | sheet |
| Link in a sheet, same leaf, then Back | same; Back: `alc`, `layout-change` | sheet; **Back trapped** | sheet; Back to markdown K1, then the sheet |
| ⌘-click explorer or link, new focused tab | same | sheet | sheet |
| ⌘-click link, `focusNewTab` off | `layout-change` only | markdown, sheet on tab press | sheet at once, drawn correctly on the press |
| Press a tab or split showing another note | `alc`, `file-open`, no `layout-change` | flips if keyed | nothing |
| Explorer blank, then the same pane | `alc`, no `file-open` | flips if keyed | nothing |
| Mode button, inactive split, just keyed | `alc`, `file-open` | **sheet** | Reading, first press |
| Mode button, explorer active, just keyed | `alc` | **sheet** (80ms and 0ms) | Reading, first press (80ms and 0ms) |
| Tab return after Reading, just keyed | `alc`, `file-open` | **sheet, unprompted** | stays Reading |
| Tab return to a just-keyed note, then N1 and the note again in that leaf by explorer press | tab return `alc`, `file-open`; then as first row, twice | **sheet, unprompted**, at the tab return | stays markdown with **Open as sheet** at the tab return; sheet at the reopen |
| Explorer press on the note the active leaf shows | `alc` for the explorer only | nothing | nothing |
| ⌘-click mode button, just keyed | `alc`, `layout-change` | new leaf sheet, original markdown | same |
| ⌘⌥-click explorer on a keyed note, plain note active: new split | `alc` for the explorer and the plain note; `alc`, `file-open`, `layout-change` | not run | sheet, 10 of 10 |
| Split command on a just-keyed note: new split | `alc` deferred; then `alc`, `layout-change`, or `layout-change`, `alc`, `layout-change` | new leaf sheet, 8 of 8 | **departs from moment 2**: new leaf sheet 5 of 12, markdown 7 of 12; original markdown in all. Decided below |
| ⌘-click explorer on a note open as markdown elsewhere | `alc`, `file-open`, `layout-change` | new leaf sheet, original markdown | same |
| N1 to K1, Back | `alc`, `layout-change` | **trapped**: three Backs never leave K1 | markdown K1, then N1 |
| Forward from N1 to K1 | `alc`, `file-open`, `layout-change` | not reachable | sheet, forward stack cleared |
| Close to empty, or graph, then reopen just-keyed note | `file-open` null, then as first row | sheet | sheet |
| Drag just-keyed tab to another group | `layout-change`, leaf id kept | markdown | markdown |
| Rename, markdown, active | `rename`, `layout-change`, same `TFile` | flips at next tab return | no flip |
| Rename while held by an override, tab return, then the next open by explorer press | `rename`, `layout-change`; tab return as row five; open as first row | flips at the tab return | tab return stays markdown; next open is a sheet |
| Override: away and back by explorer, by tab | as first row, as row five | markdown; **Open as sheet** clears it | same |
| Setting off: open, tab return, **Open as sheet** | as above | markdown; sheet on the press | same |
| Restart, keyed markdown active | events before layout ready, none after | sheet at layout ready | same |
| Restart, keyed background tab | deferred at ready; press: `alc`, `file-open`, `alc`, `layout-change` | sheet on press | same |
| Restart, keyed note in inactive split | loaded, key known at ready | markdown, then **press swallowed** | sheet at layout ready, focus unmoved |
| Restart after a real override | override empty, disk says markdown | sheet at layout ready | sheet at layout ready |
| Plugin disabled and enabled, keyed split | no `alc`, `file-open` or `layout-change` from it on the clean build | markdown | markdown on both, **Open as sheet** on both, a press into the split flips nothing; the split away to N1 and back by explorer press is a sheet, the other pane untouched, and the other pane away and back is a sheet |
| Enabled mid-session with a keyed tab still deferred, then a press on its tab | none from the enable; press: `alc`, `file-open`, `alc`, `layout-change` | not run | still deferred after the enable, sheet on the press |
| New note by command, key typed by real input | `changed` before `alc`, cache known; `changed` after typing | markdown throughout | markdown throughout |
| Reported flow: new note in source mode, key through the Properties side panel, mode button | **Add property** press: `alc` for the panel; `changed` twice; mode button: `alc` | **sheet**, press swallowed | Reading, first press |
| Same, Escape from the panel instead of the mode button | `alc` for the note | **sheet, unprompted** | stays markdown |
| New note in Live Preview, key through the in-document property, mode button | no `alc`, the note's leaf stays active; `changed` twice | Reading, first press | Reading, first press |
| Note created and opened at once, queue idle | `changed` before `alc` | sheet | sheet |
| Note created and opened, 3MB note indexing | cache `null` at arrival, `changed` 3s to 22s later, 119s on the real build's run | stays markdown, 14MB case | recorded, stays markdown, **Open as sheet** on `changed`, sheet at next arrival |

The reproduction agrees with the toggle doc on the cause and the events. The doc's 3-press count was not re-run. Every Rule cell is what the real build did, and none is a prediction. All but one read as this spec expects; the split command row is the exception, decided below.

### Decided: a switch the app drops

**Recorded, not fixed: ruling A.** The split command row is the one Rule cell that departs from moment 2, and the rule stands as written. SPEC §8 says what a reader then sees.

`WorkspaceLeaf.setViewState` opens with `if (!this.working)`, read from 1.15.0's own source, so a call made while the leaf is already inside one returns and does nothing. The split command's new leaf takes two such calls in the trace, the second loading the file. When a `layout-change` lands during that load, the leaf is a `MarkdownView` holding the file, so the walk records it and asks for the sheet. The trace shows that call entering with `working` true and returning with the view unchanged. Having recorded the leaf, the walk never asks again. In the 5 of 12 that convert, the `layout-change` lands after the load.

- **Who meets it.** Seen only on a markdown view of a keyed note being duplicated by the split command, so a note just given the key, or one still markdown after a mid-session enable or a `null` arrival. A sheet duplicates as a sheet, and an override stops the switch anyway.
- **What it costs.** The new leaf stays markdown with **Open as sheet** on offer, and converts at its next arrival. No press is taken and nothing is lost. It is a regression on this path: the clean build converted 8 of 8.
- **Ordinary opens were measured for it, and it was not there.** On the final build, 50 repeats each on `K500`, a keyed note of 604 lines: an explorer press in the same leaf, a link in a reading-mode note in the same leaf, and the quick switcher opened by ⌘O, its name typed and Enter, all by real input. Each repeat starts the leaf on a plain note, `P1`, which links `[[K500]]`, with no override and the setting on, and is excluded unless it starts there and ends on `K500`. `setViewState` was wrapped to log every sheet request with the leaf's `working` flag, so a dropped request reads apart from no request; the final view type was read after 1s and then every 200ms up to 5s. **Sheet 50, markdown 0, excluded 0 on each path**, one sheet request per open, none dropped, every one a sheet at the first read. Earlier, 10 repeats each: ⌘-click explorer (new tab), ⌘⌥-click explorer (new split) and ⌘-click on the mode button converted 10 of 10, and a restart then a press on a deferred tab 4 of 4. These are samples of a timing race, not proof that those paths cannot lose it.
- **Why not the retry.** Forgetting the leaf when the request leaves a `MarkdownView` behind, `leaf.setViewState(...).then(() => { if (leaf.view instanceof MarkdownView) lastShown.delete(leaf); })`, converted the split command 12 of 12, patched into the scratch vault's `main.js` only. It is not built: the retry waits on a `layout-change` nothing bounds, so it could flip a note someone is in, which is the late flip this work rules out. `docs/BACKLOG.md` § UI holds it, waiting on a dropped switch seen on an ordinary open.

### Whether `layoutReady` separates startup from mid-session

It does, on 1.15.0. `layoutReady` is public, `@since 0.9.7`. Each value was recorded by a scratch build of the plugin itself, at the top of `onload` and again after `await loadSettings()`, where `registerAutoOpen` runs. The two never differed.

| Path | `layoutReady` | Count |
| --- | --- | --- |
| Quit and relaunch, restored leaves in place | `false` | 12/12 |
| Same, an async plugin taking 5s listed before it | `false` | 5/5 |
| Same, a synchronous plugin blocking 2.5s before it | `false` | 3/3 |
| Same, a 30,000-note vault still indexing | `false` | 3/3 |
| **Reload app without saving**, which is startup's side of the line | `false` | 5/5 |
| `disablePlugin` then `enablePlugin` | `true` | 10/10 |
| `disablePluginAndSave` then `enablePluginAndSave` | `true` | 5/5 |
| The real Hot Reload plugin, on a rewritten `main.js` | `true` | 5/5 |
| The real settings toggle, pressed off and on twice | `true` | 2/2 |
| Restricted mode off and on, by `setEnable` | `true` | 1/1 |

The app's own startup agrees: it awaits each community plugin in turn, then loads the vault, the cache and the layout, so a slow plugin or vault delays the layout and cannot pass it.

**The one path on the wrong side is another plugin delaying this one.** A scratch loader that called `enablePlugin` after layout ready read `true` during a real start (1/1). Restored loaded leaves then stay markdown with **Open as sheet** on offer, which is the safe direction: nothing is lost and no press is taken. **Ruling: accepted as a known limit.** Another plugin delaying this one's load makes a real startup count as mid-session; it was seen once, with a scratch loader.

### Where this departs from the starting position

Agreed on the rule. Three refinements, all measured above, and four rulings, two of them in their own sections above:

- **Restored tabs do not wait to become active.** A loaded keyed note in an inactive split cannot both honour "a focus never flips" and "restored tabs convert when active": its first activation may be the press on its mode button. So during app startup first sighting is the arrival, and it converts at layout ready before anyone can press. Deferred tabs stay deferred and convert on load. The cost is a workspace rewrite at startup for visible leaves, which already happens for the active one. A restored markdown leaf that held an override converts too: the override is session-scoped and nothing on disk distinguishes it.
- **A background arrival converts at once**, in a hidden tab. Waiting for its activation would need a second rule for no gain.
- **Back from a flipped note stops on markdown for one step.** The flip leaves a markdown entry in the leaf's history, and there is no public way to flip without one. Today that entry traps Back, because it flips again. Under this rule it is the same file in the same leaf, so it stays markdown and the next Back leaves. One extra step, in exchange for Back working at all.
- **Ruling: yes at startup, no mid-session.** Enabling the plugin mid-session converts no leaf already loaded, because the enable has just emptied `markdownOverrides`. They are recorded, a later arrival still converts, and **Open as sheet** stays on offer.
- **Ruling: the icon row narrows.** No `file-menu` entry in this work.
- **Ruling: a deferred tab converts on first load after a mid-session enable.** It cannot hold a choice made this session, and nobody is typing in it (measured: still deferred after the enable, a sheet on the press).

### SPEC §8, proposed wording

Two bullets added after "A command and a toggle switch between sheet view and plain markdown view":

> - **A note switches to a sheet when it arrives in a leaf, and never because a view already showing it gained focus.** Arriving is a file opened into a leaf from anywhere, a new leaf on the note, and a restored leaf first loading during app startup, at once where visible and at its first showing where deferred. So a switch never consumes a press meant for a control in that view. The key appearing under a view that stays on the file does not switch it, and neither does the index answering late for a note just opened: **Open as sheet** is on offer until the note is next opened. Enabling the plugin mid-session switches no view already loaded, because that also forgets each **Open as Markdown**. A session's **Open as Markdown** and the setting being off stop a switch at any arrival. If the app drops the request while a new leaf is loading, the leaf stays markdown with **Open as sheet** on offer.
> - A sheet's **More options** menu offers **Open as Markdown**, beside where a markdown view lists its modes, because an action's title is a tooltip a finger cannot raise.

### The menu

`onPaneMenu(menu: Menu, source: 'more-options' | 'tab-header' | string)` on `SheetView`: call `super`, then one item titled **Open as Markdown**, icon `file-text`, section `pane`, pressing `this.openAsMarkdown()`.

- A markdown view lists **Reading view** and **Source mode** in `pane`, and offers the same items for both sources, so this does not branch on `source`.
- Under emulation at 390px it draws directly below **Close**, its press lands in markdown with the override set, and `eslint` passes the literal. `open-as-sheet.test.ts` holds it to the command's name.

**The icon row narrows, by ruling.** It names **Open as sheet** as well, and this adds no words for a markdown view. The landing narrows that row to **Open as sheet** rather than removing it.

No empty or error state: `openAsMarkdown` returns on a view with no file.

### The fixture

`docs/features/sheet-markdown-toggle.md`'s recipe, plus: `N1` to `N3` holding `[[K1]] [[K2]] [[N2]]`; `K1` to `K4`; `Rich text variations.sheetsmith` and a note on it whose `Backstory` links `[[K1]]`, for a link in a sheet. A scratch plugin listed before `sheetsmith` logs events from its `onload`, since a restart's come before CDP can attach. The Properties flow sets `livePreview` off for source mode, then presses **Add property** in the `file-properties` panel and types the key and value. To arrange a restart: setting off, build the leaves, `requestSaveLayout.run()`, setting on, quit by pid, relaunch. `Emulation.setFocusEmulationEnabled` keeps a background window focused. A 3MB note jams the index queue, and it stays jammed for runs after it.

## Config fields

None. `openInSheetView` keeps its meaning.

## Data and file model

Nothing stored. The memory lives and dies with the process. Constraints 3 and 4 are untouched, and a flip flushes an editor exactly as it does today.

## Acceptance criteria

Real app, real presses, each on the throwaway fixture:

- [x] Each row of the table reads as its Rule column, on the real build, except the split command row, the known exception decided in **Decided: a switch the app drops**.
- [x] Before the land stop, every Rule cell marked "not run" is run on the real build, and filled in. So is the Rule cell of each row whose Clean build cell was first filled from a baseline: link in a sheet, restart after a real override, and new note with the key typed.
- [x] Before the land stop, the reported flow with real presses from **Add property** onward: a new note in source mode, the key added through the Properties panel, then the mode button. Reading on the first press, still `markdown`.
- [x] Plugin disabled and enabled with a keyed markdown note in a split and one active: neither converts, **Open as sheet** is on both, and opening the note again in that leaf after visiting another converts it.
- [x] Mode button on a just-keyed note, inactive split and explorer active: Reading on the first press, `markdown` still.
- [x] Tab return to a just-keyed note: no change. Opening it again from N1 in the same leaf: sheet.
- [x] **Restored tabs, by quitting and relaunching:** active keyed tab is a sheet at ready; background keyed tab is deferred at ready and a sheet on its header press; keyed note in an inactive split is a sheet at ready with the plain pane still active.
- [x] Back from N1 to K1 reaches N1 in two presses.
- [x] Phone emulation: **Open as Markdown** in **More options** below **Close**, and its press leaves markdown with the override set.

`src/view/auto-open.test.ts`, new, driven through `onload`:

- [x] `switches a keyed note the first time a leaf shows it`
- [x] `switches when a leaf moves to a keyed note, and not when it moves to a plain one`
- [x] `does not switch on activation: neither active-leaf-change nor file-open reaches it`
- [x] `leaves a note just given the key alone until the leaf leaves and returns`
- [x] `does not read a rename as an arrival`
- [x] `does not read sheet to markdown on one file as an arrival`
- [x] `counts a second leaf on the same file as an arrival`
- [x] `forgets a leaf that showed a view with no file`
- [x] `restored: converts every loaded keyed leaf at layout ready`
- [x] `restored: leaves a deferred leaf alone, then converts it when it loads`
- [x] `holds the override and the setting at every arrival`
- [x] `enabling mid-session converts no open leaf, and a later arrival still does`
- [x] `records an arrival whose cache has no answer, and does not switch when the index answers`
- [x] `converts a leaf still deferred after a mid-session enable, when it first loads`
- [x] `stops answering on unload`

`src/view/open-as-sheet.test.ts`: the `describe('the toggle and auto-open')` cases fire `layout-change` instead of `active-leaf-change`. New: `offers Open as Markdown in the pane menu for either source, under the command's name`.

The stub cannot show any of the ordering above: it fires nothing itself, has no capture press, no history and no deferred load, and its cache is synchronous. So each test fires what the table records, and a `null` answer replaces `getFileCache` for that case. The stub gains `iterateAllLeaves`, a base `onPaneMenu`, `MenuItem.setSection` and a settable `workspace.layoutReady`. It defaults to `true`, as its `onLayoutReady` already says it is always ready, so a startup case sets it `false` before `onload`.

`npm run lint`, `npm test`, `npm run build` pass.

## Commit boundaries

No `Co-Authored-By` trailer on any of them.

1. `test: Give the stub a leaf walk, a pane menu and a ready flag`. `iterateAllLeaves`, `View.onPaneMenu`, `MenuItem.setSection`, `Workspace.layoutReady`.
2. `fix: Switch a note to a sheet when it arrives in a leaf, not when it gains focus`. `auto-open.ts`, `auto-open.test.ts`, the existing cases in `open-as-sheet.test.ts`.
3. `feat: Offer Open as Markdown in a sheet's More options menu`. `sheet-view.ts` and its test.
4. `docs: Record when a note may switch to a sheet`. SPEC §8 as quoted. The toggle doc: its two OPEN sections point here and read as past, and its mod-click and Properties panel lines move out of **Not verified**. BACKLOG § Patterns: restate the override row below; remove the row saying a wrong state key opens a sheet with no file, whose clause `sheet-view.ts` now rewords; correct the icon scan row to name `layout-grid` alone. BACKLOG § UI: remove the "Pressing the mode button" row; narrow the icon row to **Open as sheet**; add the dropped-switch row. The `sheetViewState` comment reword in `sheet-view.ts` goes here too, beside the row it retires, as a hunk split from boundary 3's.

## Deliberately not doing

- **The override keyed by path.** No fix is needed for this work. Its row is confirmed by running it: a rename loses the entry, and today the note flips at the next tab return. After this work a tab return is safe, and it flips at the next open instead (measured). The row stays, with that as its evidence.
- **A flip that leaves no history entry.** No public API, per the third refinement.
- **A menu entry for Open as sheet on a markdown view.** It would need `workspace.on('file-menu')`, on a view the plugin does not own, and the owner ruled it out of this work, so the icon row narrows.
- **Waiting for an unindexed note.** Dropped by decision; see **Smallest version**.
- Component id editing, and every other backlog row.

## Not verified

- A real phone or tablet, and real touch. The menu ran under emulation with mouse presses, and the swallowed press was not run under emulation at all.
- macOS's native **More options** and tab menus were not pressed, since they draw outside the DOM. On desktop only the items `onPaneMenu` adds were read, by calling it with a recording menu.
- The Properties side panel being opened by a press. On both builds it was opened by code as setup, and every press and key after that was real.
- A rename from the app's own UI. It went through `fileManager.renameFile`.
- The clean build on the rows for a tab still deferred after a mid-session enable and a new split by ⌘⌥-click. Both rows were added for the real build.
- Pop-out windows, the Workspaces core plugin, Sync, and a template inserting the key after the note opens. No run of any.
- A stale cache at arrival, where a known note gains the key externally behind a busy queue: it would stay markdown, since it reads as a note just given the key. Run only on an idle queue, where `changed` came first.
- `layoutReady` on a real phone or tablet, or on any app version but 1.15.0. A real lazy-loading plugin, as opposed to the scratch one. The **Restricted mode** toggle by press, which was run by `setEnable`.
- The clean build's next-activation flip after a `null` arrival. It was seen staying markdown for 6s, and not followed further.
