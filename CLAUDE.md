# Sheetsmith — agent context

A system-agnostic character sheet builder for Obsidian. The user designs a sheet by placing components on a grid and defining formulas; a character is an ordinary markdown note that names a layout and holds only values.

`SPEC.md` is the source of truth for what the plugin does. Read it before proposing design changes. `AGENTS.md`, imported below, covers generic Obsidian plugin conventions: manifest rules, the release process, developer policy, and UI copy style.

@AGENTS.md

## Hard constraints

These are non-negotiable, and each one is easy to violate by reaching for the obvious solution.

1. **Never `eval()` or `new Function()`.** The formula engine must use a real parser. Layouts are shareable files, so evaluating them as code is a live injection vector, and Obsidian's plugin review rejects both outright.

2. **Wikilinks must never be written inside a code fence.** Obsidian does not index links in fenced blocks, so backlinks, graph view, hover preview, and rename propagation all die silently. This is why link-bearing components store as plain markdown and only scalar components use fences. It is the load-bearing decision in the file model.

3. **Parse then serialise is byte-identical when nothing changed.** Any drift means hand-edited notes get reformatted on every save, which breaks the promise that the user owns plain markdown.

4. **A layout change never deletes character data.** Sections whose component was removed or renamed are retained, not cleaned up. Losing a player's character is the worst failure this plugin can have.

5. **`src/parse/` imports nothing from `obsidian`.** Parsing stays pure so it can be tested without launching the app. Reach for `app.vault` or `app.metadataCache` in a view or service, never in the parser.

6. **Test against a throwaway vault, never a real one.**

## Architecture

- **Character note**: one frontmatter key (`sheet-layout`), all values in the body, one `##` section per component. Scalar components store fenced YAML; link-bearing components store markdown tables or prose. See `SPEC.md` §3.
- **Layout file**: separate vault file holding structure, formulas, function library, reset triggers. No per-character data. Shared by many characters.
- **Sections key on the component's `label`**, which is also its heading. The `id` is stable identity for formula references, so renaming a label breaks no formulas but does require migrating existing notes.

## Component contract

Every component implements exactly four things, defined in `SPEC.md` §4.1:

`read` (section → data), `write` (data → section, byte-identical when unchanged), `render` (data + resolved values → DOM), and `formulaFields` (which config fields accept an expression).

Nothing outside a component should need to know that component exists. Adding one means implementing those four and registering it, not touching the renderer or the parser.

## Working order

Build **component by component, not layer by layer.** Take one component all the way through read, write, render, and tests before starting the next. Order is Stat, then Pool, then Table; the remaining seven are variations. The layout schema assembles itself from component configs rather than being designed up front. See `SPEC.md` §12.

Resist building the layout editor and the formula engine early. Both assume a working renderer and a proven file format, and both are the interesting parts, which is exactly why they are the trap.

## Commands

```bash
npm run dev        # watch build
npm run build      # type-check and production build
npm run lint
npm test           # vitest, single run
npm run test:watch
```

## Conventions

- Tabs, single quotes, per `.editorconfig`.
- Sentence case for all user-facing UI text; `eslint-plugin-obsidianmd` enforces it.
- Keep `main.ts` to plugin lifecycle only.
- Do not commit `main.js`. It is a build artifact attached to releases.
- Update `SPEC.md` when a design decision changes, and move settled items out of §13 Open questions.
- Do not add `Co-Authored-By` trailers to commit messages.
