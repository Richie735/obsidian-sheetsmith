# Sheet and Markdown toggle

Status: shipped
Board card: GitHub issue #3, "Reading mode selection disappears". The two defects left open here are the `docs/BACKLOG.md` § UI row "Pressing the mode button on a note just given the key turns it into a sheet".

Standard route, with no spec written ahead: the commands, `auto-open.ts` and `sheetViewState` carried the design. This file exists for what a review needed afterwards: the fixture, and what stayed open.

## What it does

SPEC §8's toggle. A sheet's header has **Open as Markdown**, and a markdown view of a note carrying `sheet-layout` has **Open as sheet**. Each behaves as its command does, through one implementation. Where the code settled a question, the comment at the code says why: `src/view/open-as-sheet.ts`.

## The fixture

It lives outside the repository, so this is the recipe (`AGENTS.md` § Testing). Everything sits in a scratch folder, in a second Obsidian process that cannot touch a real vault. Measured on Obsidian 1.15.0.

**The vault** holds:

- `Sheetsmith layouts/`, copied from any vault with layouts. Only `Card variations.sheetsmith` is pressed.
- `.obsidian/plugins/sheetsmith/` with `main.js`, `manifest.json` and `styles.css`, copied and not symlinked, so a build elsewhere cannot change what is under test.
- `.obsidian/community-plugins.json` holding `["sheetsmith"]`.
- Plain notes `N1.md` and `N2.md`; `K1.md` and `K2.md` holding only the frontmatter `sheet-layout: Card variations`.

**The process.** Beside the vault, a profile folder holding `obsidian.json`:

```json
{"vaults":{"scratch1":{"path":"<absolute vault path>","ts":1793878717351,"open":true}}}
```

```bash
/Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir=<profile> --remote-debugging-port=9333
```

Quit that process alone, by the pid matching its `--user-data-dir`.

**Driving it.** `harness/inspect.mjs`'s CDP technique, attached to the `page` target whose URL holds `index.html`: a Settings window on `about:blank` opens beside it. Check `app.vault.adapter.basePath` before anything else. Enable the plugin once with `await app.plugins.setEnable(true)` and `await app.plugins.enablePlugin('sheetsmith')`. Press with `Input.dispatchMouseEvent`, since a DOM `click()` does not run the leaf's capture `pointerdown`, which the press below turns on.

**The phone.** `app.emulateMobile(true)`, then `Emulation.setDeviceMetricsOverride` at 390x800, which gives `is-phone`. Two traps:

- It persists in the profile, so the next launch starts as a phone until `emulateMobile(false)`.
- Reload the window after toggling it. Without the reload, `getLeaf` hands out leaves `iterateAllLeaves` does not list.

macOS draws **More options** as a native menu, so it is in the DOM only under emulation.

## OPEN: the swallowed press

Reproduces on the current build and on the build before this feature.

1. New note, opened in source mode, active.
2. Write `---\nsheet-layout: Card variations\n---\n` through the editor. Wait for the save and the index, about 2.5s. It is still markdown.
3. Click the file explorer's blank area. The active leaf is now `file-explorer`.
4. Press the note's mode button.

It lands on a sheet, not in Reading. With 80ms between press and release the view has already changed before the release, so the button is gone under the pointer; with 0ms it changes just after. The events are `active-leaf-change:markdown`, then the sheet's twice. The cause is the leaf's capture `pointerdown` calling `setActiveLeaf`, whose event reaches `maybeSwitch` (`src/view/auto-open.ts`).

The toggle is the way out, not a fix. On the current build **Reading mode takes 3 presses** from step 4: the mode button, **Open as Markdown** (lands in source, override set), the mode button. Reading then held across a tab away and back, returned to by `setActiveLeaf`.

The same flow with the leaf already active reaches Reading on the first press and stays markdown.

## OPEN: the unprompted flip

1. Steps 1 and 2 above, then press the mode button with the leaf active. Reading mode, still markdown.
2. Open another note in a new tab.
3. Return to the first tab.

It is now a sheet, nobody having asked at that moment: `maybeSwitch` runs on `active-leaf-change` and no override exists. SPEC §8's default says the note opens as a sheet, and what is open is when that default may act on a note the reader is already in.

## Not verified

- A real phone or tablet, and real touch. The phone runs were emulation, pressed with mouse events.
- The swallowed press under phone emulation.
- Applying the key through the Properties panel. Only typing it was run, and the panel should reach the same cache event.
- Mod-click on the mode button, which a code reading says flips a new leaf too.
