# Sheetsmith — agent context

A system-agnostic character sheet builder for Obsidian. The user designs a sheet by placing components on a grid and defining formulas; a character is an ordinary markdown note that names a layout and holds only values.

`docs/SPEC.md` is the source of truth for what the plugin does. Read it before proposing design changes. `AGENTS.md`, imported below, covers generic Obsidian plugin conventions: manifest rules, the release process, developer policy, and UI copy style.

Two more docs carry the conventions, loaded on demand rather than every session:

- **`docs/PATTERNS.md`** — how code here is built. Read before writing a component and when reviewing one. Every rule states whether it is enforced by a check, reported as a lint warning, or held by judgement.
- **`docs/UI.md`** — how a sheet looks and behaves. Read when designing or reviewing appearance, alongside the harness.

@AGENTS.md

## Hard constraints

These are non-negotiable, and each one is easy to violate by reaching for the obvious solution. Constraints 1 and 5 are enforced by eslint and 3 by tests, so violating them fails the build rather than review. The rest need judgement.

1. **Never `eval()` or `new Function()`.** The formula engine must use a real parser. Layouts are shareable files, so evaluating them as code is a live injection vector, and Obsidian's plugin review rejects both outright. Enforced by `no-eval`, `no-implied-eval`, and `no-new-func`.

2. **Wikilinks must never be written inside a code fence.** Obsidian does not index links in fenced blocks, so backlinks, graph view, hover preview, and rename propagation all die silently. This is why link-bearing components store as plain markdown and only scalar components use fences. It is the load-bearing decision in the file model.

3. **Parse then serialise is byte-identical when nothing changed.** Any drift means hand-edited notes get reformatted on every save, which breaks the promise that the user owns plain markdown.

4. **A layout change never deletes character data.** Sections whose component was removed or renamed are retained, not cleaned up. Losing a player's character is the worst failure this plugin can have.

5. **`src/parse/` and `src/formula/` import nothing from `obsidian`.** They stay pure so they can be tested without launching the app. Reach for `app.vault` or `app.metadataCache` in a view or service, never in the parser or the formula engine. Enforced by `no-restricted-imports` scoped to those paths.

The registry contract in `src/components/contract.test.ts` runs the §4.1 checks against every registered component, so adding one that skips part of the contract fails there rather than at runtime in a view.

6. **Test against a throwaway vault, never a real one.**

## Architecture

- **Character note**: one frontmatter key (`sheet-layout`), all values in the body, one `##` section per component. Scalar components store fenced YAML; link-bearing components store markdown tables or prose. See `SPEC` §3.
- **Layout file**: separate vault file holding structure, formulas, function library, reset triggers. No per-character data. Shared by many characters.
- **Sections key on the component's `label`**, which is also its heading. The `id` is stable identity for formula references, so renaming a label breaks no formulas but does require migrating existing notes.

## Component contract

Every component implements five things, defined in `SPEC` §4.1:

`read` (section → data), `write` (data → section, byte-identical when unchanged), `render` (data + resolved values → DOM), `formulaFields` (which config fields accept an expression), and `configFields` (declared config fields the layout editor renders as a form).

Plus an optional sixth, `scopeValues`, for components holding values other components' formulas can read (`abilities.DEX`). Components with nothing referencable omit it.

Nothing outside a component should need to know that component exists. Adding one means implementing those five and registering it, not touching the renderer, the parser, or the layout editor.

## Working order

Build **component by component, not layer by layer.** Take one component all the way through read, write, render, and tests before starting the next. Order so far: Stat group, then Stat (dropped when Stat group first covered the card, rebuilt on top of it), Skill card, Pool, Track; the remaining six are variations. The layout schema assembles itself from component configs rather than being designed up front. See `SPEC` §12.

Resist building the layout editor and the formula engine early. Both assume a working renderer and a proven file format, and both are the interesting parts, which is exactly why they are the trap.

## Commands

```bash
npm run dev        # watch build
npm run build      # type-check and production build
npm run lint
npm test           # vitest, single run
npm run test:watch
npm run harness            # build the harness, then open harness/index.html
npm run harness:watch
npm run harness:calibrate  # extract Obsidian's real theme + settings chrome
npm run harness:shot       # render every view to harness/shots/*.png
```

The harness renders both surfaces outside Obsidian against the real
`styles.css`: the sheet, and the settings tab holding the layout editor. Both
themes, any width, and the two joined so an editor change re-renders the sheet.
Review appearance by looking at it, not by reading CSS.

It runs on `src/test/obsidian-stub.ts`, the same stub vitest uses. Anything the
stub gains for the harness a test can also use.

`harness:calibrate` reads the installed Obsidian's own `app.css` out of its asar
and generates `harness/obsidian.generated.css`, so the harness borrows the real
palette and the real settings chrome instead of approximating them. That file is
gitignored: it is Obsidian's CSS, and this repository is public.

## Conventions

- Tabs, single quotes, per `.editorconfig`.
- Sentence case for all user-facing UI text; `eslint-plugin-obsidianmd` enforces it.
- Keep `main.ts` to plugin lifecycle only.
- Do not commit `main.js`. It is a build artifact attached to releases.
- Update `docs/SPEC.md` when a design decision changes, and move settled items out of §13 Open questions.
- Follow `docs/PATTERNS.md`. Where the code does not yet match it, the gap is recorded in its §11 backlog rather than copied into new code.
- Do not add `Co-Authored-By` trailers to commit messages.
