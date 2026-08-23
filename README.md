# Sheetsmith

Design and use character sheets for any tabletop RPG in [Obsidian](https://obsidian.md). Build your own layout from drag-and-drop components, define your own formulas, and keep every character as a plain markdown note.

> **Status: early development.** No release yet. The file model, sheet view, formula engine and five components are in place. The grid canvas editor and the rest of the component catalog are not. See the roadmap below.

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

## Roadmap

| Milestone | Delivers | Status |
|---|---|---|
| **M1 Render** | Read a hand-written layout and character note, render a read-only sheet | Done |
| **M2 Edit** | Edit values in sheet view, write back to the body, round-trip safely | Done |
| **M3 Formulas** | Expression evaluation, layout function library, computed values | Done |
| **M4 Editor** | Grid canvas, component palette, configuration panel | Interim form editor in settings; grid canvas outstanding |
| **M5 Finish** | Reset triggers, promoted fields, layout export and import, mobile reflow | Reset triggers done; the rest outstanding |

Five of the eleven components ship: Card, Card set, Pool, Track, and Table. The remaining six are variations on what those solve.

The file model was proven first with hand-written files, because it is the hardest thing to change once characters exist. The layout editor is the largest interface investment and comes only once the thing it edits is known to work.

See [docs/SPEC.md](docs/SPEC.md) for the full specification: component catalog, formula model, layout schema, and data safety rules.

## Not in scope

Dice rolling, bundled rules content, level-up automation, layout inheritance, and importing from D&D Beyond. Recorded in the spec so they do not creep back in.

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
