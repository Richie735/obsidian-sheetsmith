# Sheetsmith

Design and use character sheets for any tabletop RPG in [Obsidian](https://obsidian.md). Build a layout on a grid, define your own formulas, and keep every character as a plain markdown note.

> **Status: in the Obsidian community plugin list.** See [Install](#install). This page describes the code in this repository, which can run ahead of the version the list serves. The file model, the sheet view and eleven components are in place: Card, Card set, Pool, Track, Table, Group, Tab set, Rich text, Image, Record set and Passport. So are the formula engine, a per-layout function library, row aggregates, typed modifiers with definitions and provenance, and reset triggers. The layout editor pane has its tree, configuration panel, undo, live grid canvas, sample-value preview, layout import and export, and three ways to start a new layout. A misconfigured field reports itself inline, both there and on the sheet; a broken formula does the same in the pane, and leaves the value it fed reading "?" with the reason on hover. The **Create a character** command offers the vault's layouts by name, as does a note whose layout is missing, so no character needs its frontmatter typed by hand. The character folder is configurable, and on Obsidian 1.13 and later the settings tab's preferences turn up in settings search. Still to come: mirroring values into frontmatter so Bases and Dataview can query them, and a phone layout — the editor pane does not fit a narrow screen.

## What it is

Sheetsmith is not a D&D character sheet. It is a character sheet **builder**.

You place components on a grid, define the formulas that connect them, and save the result as a reusable layout. A character is an ordinary markdown note that names a layout and holds only values. One layout serves many characters.

The plugin knows arithmetic and nothing about any game. Every rule specific to a system lives in the layout you build, so the same plugin serves D&D, Pathfinder, Call of Cthulhu, or something you wrote yourself.

## Why

Every existing option fails on one of three axes:

- **Static templates** look like a sheet but do nothing.
- **System-specific renderers** work well for one game and do not transfer.
- **Flexible tools** make you hand-author YAML to get anything on screen.

Nothing combines a layout builder with a formula engine, and nothing is system-agnostic by design.

## How it works

A character is a normal note. One property names its layout, and the values live in the body as readable markdown:

````markdown
---
sheet-layout: DnD 5e Caster
---

## Abilities
```sheet
STR: 8
DEX: 16
WIS: 12
```

## HP
```sheet
current: 22
temp: 0
```

## Inventory

| Item | Qty | Weight | Equipped |
|---|---|---|---|
| [[Bag of Holding]] | 1 | 15 | yes |
````

Two consequences worth stating:

- **Your frontmatter stays clean.** One property, not thirty. Character data does not leak into the vault's property namespace or turn up in autocomplete on unrelated notes.
- **Wikilinks work properly.** `[[Bag of Holding]]` is real markdown, so backlinks resolve, graph view sees it, hover preview works, and renaming the linked note updates the sheet. Clicking it in the rendered sheet navigates there.

Formulas are defined per layout, so nothing about any game system is built into the plugin:

```
mod(score) = floor((score - 10) / 2)
prof       = ceil(level / 4) + 1
```

A skill's computed total then reads:

```
ability + Training * prof + Bonus
```

One formula serves the whole skill list. `Training` is a graded column holding untrained, proficient or expertise, and each row says which ability it means, so the layout describes the system instead of repeating it eighteen times.

## Install

Sheetsmith is in the [Obsidian community plugin list](https://community.obsidian.md/plugins/sheetsmith), so it installs from inside Obsidian. It needs Obsidian 1.9.0 or newer.

1. In **Settings → Community plugins**, select **Browse**, search for **Sheetsmith**, and install it.
2. Select **Enable**.
3. Open the command palette and run **Sheetsmith: Add a starter layout**. It writes one of the bundled layouts into your layout folder; nothing renders yet.
4. To see it as a sheet, create a note whose `sheet-layout` property names the layout, as in [How it works](#how-it-works) above, or run **Sheetsmith: Open layout editor** to see the layout filled with sample values.

Do this in a new vault made for the purpose, not in one you care about. The plugin rewrites note bodies, and the parser has little mileage outside the author's own vaults.

## Development

```bash
npm install
npm run dev        # watch build
npm run build      # type-check and production build
npm run lint
npm test           # run the test suite once
npm run test:watch # re-run tests on change
npm run harness    # build the harness, then open harness/index.html
```

### Test vault

Develop against a throwaway vault, never a real one. Early builds rewrite note bodies, and the parser will get it wrong before it gets it right.

```bash
ln -s /path/to/obsidian-sheetsmith /path/to/test-vault/.obsidian/plugins/sheetsmith
touch /path/to/obsidian-sheetsmith/.hotreload
```

Install [Hot Reload](https://github.com/pjeby/hot-reload) in the test vault. Together with the `.hotreload` marker it reloads the plugin whenever `npm run dev` rewrites `main.js`, so there is no disable/enable cycle between builds.

### Testing

The note parser and the formula engine import nothing from the Obsidian API, so they run under vitest without launching the app. The parser is also the one place where a bug destroys user data, so it is the part that carries the most tests. Round-tripping is the rule that matters most: parse then serialise must return an unchanged file byte for byte, or hand-edited notes drift on every save.

`npm run harness` renders the sheet and the settings tab outside Obsidian against the real `styles.css`, in both themes and at any width. Appearance is reviewed by looking at it rather than by reading CSS.

`main.js` is the compiled bundle and is deliberately not committed. Releases attach it alongside `manifest.json` and `styles.css`.

## License

[MIT](LICENSE)
