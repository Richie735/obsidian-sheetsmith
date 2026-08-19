# Sheetsmith agent context

A system-agnostic character sheet builder for Obsidian. The user designs a sheet by placing components on a grid and defining formulas; a character is an ordinary markdown note that names a layout and holds only values.

`docs/SPEC.md` is the source of truth for what the plugin does. Read it before proposing design changes. `AGENTS.md`, imported below, covers generic Obsidian plugin conventions: manifest rules, the release process, developer policy, and UI copy style.

Two more docs carry the conventions, loaded on demand rather than every session:

- **`docs/PATTERNS.md`** covers how code here is built. Read it before writing a component and when reviewing one. Every rule states whether it is enforced by a check, reported as a lint warning, or held by judgement.
- **`docs/UI.md`** covers how a sheet looks and behaves. Read it when designing or reviewing appearance, alongside the harness.

@AGENTS.md

## Hard constraints

These are non-negotiable, and each one is easy to violate by reaching for the obvious solution. Constraints 1 and 5 are enforced by eslint and 3 by tests, so violating them fails the build rather than review. The rest need judgement.

1. **Never `eval()` or `new Function()`.** The formula engine must use a real parser. Layouts are shareable files, so evaluating them as code is a live injection vector, and Obsidian's plugin review rejects both outright. Enforced by `no-eval`, `no-implied-eval`, and `no-new-func`.

2. **Wikilinks must never be written inside a code fence.** Obsidian does not index links in fenced blocks, so backlinks, graph view, hover preview, and rename propagation all break with no warning. This is why link-bearing components store as plain markdown and only scalar components use fences. It is the load-bearing decision in the file model.

3. **Parse then serialise is byte-identical when nothing changed.** Any drift means hand-edited notes get reformatted on every save, which breaks the promise that the user owns plain markdown.

4. **A layout change never deletes character data.** Sections whose component was removed or renamed are retained, not cleaned up. Losing a player's character is the worst failure this plugin can have.

5. **`src/parse/` and `src/formula/` import nothing from `obsidian`.** They stay pure so they can be tested without launching the app. Reach for `app.vault` or `app.metadataCache` in a view or service, never in the parser or the formula engine. Enforced by `no-restricted-imports` scoped to those paths.

6. **Test against a throwaway vault, never a real one.**

The registry contract in `src/components/contract.test.ts` runs the §4.1 checks against every registered component, so adding one that skips part of the contract fails there rather than at runtime in a view.

## Architecture

- **Character note.** One frontmatter key (`sheet-layout`), all values in the body, one `##` section per component. Scalar components store fenced YAML; link-bearing components store markdown tables or prose. See `SPEC` §3.
- **Layout file.** A separate vault file holding structure, formulas, function library, and reset triggers. No per-character data. Shared by many characters.
- **Sections key on the component's `label`**, which is also its heading. The `id` is stable identity for formula references, so renaming a label breaks no formulas but does require migrating existing notes.

## Component contract

The members and what each one owes are `docs/SPEC.md` §4.1. The order to declare
them in, and the shape of the file around them, are `docs/PATTERNS.md` §3. Both
are checked by `src/components/contract.test.ts`, so a component that departs
from either fails the build rather than review.

The rule worth repeating here, because everything else follows from it: **nothing
outside a component needs to know that component exists.** Adding one means
implementing the contract and registering it, one line in
`src/components/index.ts`, and touching neither the renderer, the parser, nor
the layout editor. A component never imports another component either, which
eslint now enforces.

## Working order

Build **component by component, not layer by layer.** Take one component all the way through read, write, render, and tests before starting the next. Order so far: Stat group, then Stat (dropped when Stat group first covered the card, rebuilt on top of it), Table, Pool, Track. The remaining six are variations. The layout schema assembles itself from component configs rather than being designed up front. See `SPEC` §12.

Resist building the layout editor and the formula engine early. Both assume a working renderer and a proven file format, and both are the interesting parts, which is exactly why they are the trap.

## When to commit

**Not while the work is in progress.** The working tree is what gets reviewed,
and it stays uncommitted until the change is settled.

The loop is: build the thing, the user looks at it, findings come back, address
them, repeat. Only when the user says the work is done does `/ship` split the
whole result into commits.

Do **not** commit after implementing a feature, after addressing a finding, after
a refactor, or at any other natural-feeling pause, unless asked to. That includes
the boundaries a feature spec names: those are a plan for the end, not a
schedule to follow as you go.

The reason is the review, not tidiness. Work that is already committed makes a
correction expensive: what should be an edit becomes an amend or a follow-up
commit, and the history ends up recording the back-and-forth instead of the
result the user actually approved. Reviewing an uncommitted tree keeps every
change cheap to undo right up until the moment it is not.

Verification is continuous and committing is not: run `npm test`, `npm run lint`
and `npm run build` as often as they are useful.

- `/ship` is the only thing that commits, and only when invoked.
- Subjects are Conventional Commits: `type: Subject`, standard types only, with
  the subject itself in the log's existing voice. `/ship` carries the mapping
  and the traps.
- Never push. That is always the user's call.
- Do not add `Co-Authored-By` trailers to commit messages.

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

The harness renders the plugin's two screens outside Obsidian against the real
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
- Sentence case for all user-facing UI text. `obsidianmd/ui/sentence-case` reports it
  as a warning, and `npm run lint` runs with `--max-warnings 0`, so a warning fails
  the build exactly like an error.
- Keep `main.ts` to plugin lifecycle only.
- Do not commit `main.js`. It is a build artifact attached to releases.
- Do not hand-edit `styles.css`. It is assembled from `src/styles/` by
  `styles.build.mjs` and a build overwrites it; edit the part the rule belongs
  to. It stays committed, unlike `main.js`, because the release workflow and the
  harness both read it directly. A test fails if the two disagree.
- Update `docs/SPEC.md` when a design decision changes, and move settled items out of §13 Open questions.
- Follow `docs/PATTERNS.md`. Where the code does not yet match it, the gap is recorded in its §11 backlog rather than copied into new code.
