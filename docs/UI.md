# UI conventions

How a Sheetsmith sheet looks and behaves. Read this when designing a component
and when reviewing one; `docs/PATTERNS.md` covers the code side, `SPEC.md`
covers what the plugin does.

Markers match `PATTERNS.md`: **[checked]** fails the build, **[warned]** is a
lint warning that does not, **[judgement]** is a default with a reason.

The design reviewer should look at the **harness** (`npm run harness`) rather
than at CSS. Reviewing appearance by reading a stylesheet describes what the
code should look like, not what it does.

The harness renders **both** surfaces: the sheet, and the settings tab holding
the layout editor. The editor is where most of a sheet is actually configured,
so it gets the same scrutiny as the cards. The two are joined — saving in the
editor re-renders the sheet — so a config field can be judged by what it does to
the card rather than by its label alone.

---

## 1. The plugin has no colours of its own

**Never write a literal colour** [judgement, should be checked]. Not a hex, not
an `rgb()`, not a named colour. There are zero in 322 selectors today and that
number should stay zero.

Every colour comes from an Obsidian theme variable, so a sheet inherits whatever
theme the user runs:

- text: `--text-normal`, `--text-muted`, `--text-faint`, `--text-accent`,
  `--text-error`, `--text-on-accent`
- surface: `--background-primary`, `--background-primary-alt`,
  `--background-secondary`
- state: `--background-modifier-hover`, `--background-modifier-active-hover`,
  `--background-modifier-border`, `--background-modifier-error`
- accent: `--interactive-accent`, `--interactive-accent-hover`

Sizing, spacing, radii and fonts come from the same place: `--size-4-*`,
`--size-2-*`, `--radius-s|m|l`, `--font-ui-*`, `--font-smallest`,
`--font-monospace`, `--icon-s`, `--layer-popover`.

### Deriving a colour safely

Blend with `color-mix(in srgb, ...)` against `--background-primary`, never with
opacity on the element. The graded level fill is the model:

```css
background-color: color-mix(
	in srgb,
	var(--interactive-accent) calc(var(--sheetsmith-level, 1) * 100%),
	var(--background-primary)
);
```

Text placed on such a blend uses `--text-normal`, which is defined against
`--background-primary` — the same colour the blend is mixed with, so it holds in
a light theme and a dark one alike. That reasoning is the rule: **pick the text
variable defined against whatever you mixed into**.

---

## 2. The `.sheetsmith-view` scope rule

Every rule styling a form control on a sheet must be scoped under
`.sheetsmith-view` [checked: `styles.test.ts`].

Obsidian styles `input[type='text']` at specificity (0,1,1). A bare class is
(0,1,0) and loses, so every declaration taking chrome off an input is silently
discarded — the field keeps its form-control look and its small font. This is
invisible in review precisely when it matters most: a component that paints its
own border never reveals the loss. Pool shipped that way once.

`styles.test.ts` is the guard. If you add a field class, it is covered
automatically by the `-input` / `-current` naming; a control named outside that
pattern needs the test widened.

---

## 3. Sheetsmith's own knobs

The plugin's tunables are custom properties declared on `body`, prefixed
`--sheetsmith-`, each carrying the reason it holds that value. They exist to be
overridden from a user CSS snippet.

Publish one **when a second component has to line up with the first**. The
comment on `--sheetsmith-card-abbr-space` states the test: re-deriving
`1.2 × 0.85 × --font-ui-smaller` somewhere else would drift the moment either
constant moved.

A knob is public API once shipped. Renaming it breaks someone's snippet.

---

## 4. Space, and how the sheet reflows

- **A component fills its grid placement** (`SPEC` §8). A card placed two
  columns wide occupies two columns. Stat group's opt-in `fixed` sizing is the
  single exception.
- **The sheet fills the pane.** A sheet is a dashboard, not prose, so it is not
  held at reading width. `--sheetsmith-sheet-max-width` gives reading width back
  to anyone who wants it.
- **Reflow uses a container query, never a media query** [judgement]. A narrow
  split in a wide window must reflow too, and a media query cannot see that.
  `.sheetsmith-view` sets `container-type: inline-size`; the grid collapses to a
  column under 480px of *container* width.
- **Media queries are for user preference and device capability only**:
  `prefers-reduced-motion`, `forced-colors`, pointer coarseness. Never for space.
- **Cascade order is load-bearing.** `@container` adds no specificity, so an
  override must sit *below* the rule it overrides. An equal selector placed
  above it simply loses.

---

## 5. Type

- **Relative units for anything that should follow the vault's text-size
  setting** [judgement]. The card's headline number is `1.75em`, not a pixel
  size, so the card scales with the user's setting.
- `--font-ui-small` / `--font-ui-smaller` for secondary and tertiary text;
  `--font-smallest` below that.
- **`font-variant-numeric: tabular-nums` on every number that changes.** A value
  that reflows while stepping reads as movement the user did not ask for.
- Secondary text — an abbreviation under a stat name, a gloss beside a row — is
  one style: sized down, tracked, faint. Reuse it rather than inventing a
  second quiet style.

---

## 6. Accessibility is part of the control

Not a pass afterwards. Each of these is already load-bearing somewhere in the
sheet.

- **Forced-colors mode discards `box-shadow`.** A focus ring drawn as a
  box-shadow carries a transparent `outline` companion, invisible normally and
  repainted as a real ring where shadows are dropped:
  ```css
  box-shadow: 0 0 0 2px var(--interactive-accent);
  outline: 2px solid transparent;
  ```
  Prefer an outline outright where the offset allows it.
- **One focus treatment per component.** The same gesture in the same component
  must not produce two different rings.
- **`prefers-reduced-motion: reduce` removes transitions**, and every animated
  rule needs the companion block.
- **`.sheetsmith-sr-only`** carries text for assistive tech only.
- **State goes in ARIA, not only in paint.** `aria-pressed` on a two-state mark;
  `aria-label` composed from the label and the state name the layout author
  chose, since "Stowed" says more than "not pressed".
- **Announce what is not visible.** A commit or an Escape-restore that changes
  nothing on screen is announced.

---

## 7. Touch

- **A finger has no hover and no pixel to aim at.** Hit targets are the card,
  not the mark: a ring is 1.6em, and a card answering only on the ring reads as
  dead everywhere else.
- **Focus on `pointerdown`, commit on `click`.** A tap cannot preview what it is
  about to hit, so focus moves while the finger is down; committing on release
  is what lets a mis-aimed press slide off and be taken back.
- Never a hover-only affordance. Anything reachable by hover is reachable
  another way.

---

## 8. The shared vocabulary

New components reuse these rather than inventing a lookalike. A fourth kind of
surface beside a row of cards reads as loose chrome floating on the page.

| Thing | Where | Used by |
| --- | --- | --- |
| The card surface | `.sheetsmith-stat`, `.sheetsmith-stat-single` | Stat, Stat group, Pool |
| The level ring | `paintLevelRing`, `.sheetsmith-table-cycle` | Skill card columns, Track marks |
| The editing gesture | `editable.ts` | every stored value on a sheet |
| Secondary text | `.sheetsmith-stat-abbreviation` | Stat group |
| Inline error | `.sheetsmith-error` | every component's own failure |

**When a card and a cell do the same job, they share the painter** [judgement].
A single-level mark on a card and the same mark in a table cell must go through
`paintLevelRing` rather than a lookalike, precisely so one flag cannot measure
differently from the other under the same finger.

---

## 9. Failure appears in place

A misconfigured component renders `.sheetsmith-error` into its own container and
nothing else. The rest of the sheet stays live and editable (`SPEC` §10). There
is no global error state, and a broken component never blanks the page.

Error text names the fix: `"max: 'con' is not defined on this sheet"`, not
`"could not resolve"`.

---

## 10. Reviewing appearance

Run `npm run harness`. Check each of these, because none is visible in code.

**The sheet:**

- both themes, light and dark
- narrow container: does the grid actually collapse, and does anything overflow
- a component at 1, 2 and 3 grid columns wide: does it fill its placement
- numbers mid-step: do they jitter, or hold on tabular figures
- focus: visible on every interactive element, one treatment per component
- an error state and an empty state, not only the populated one

Run `npm run harness:calibrate` first. It reads the installed Obsidian's own
`app.css` out of its asar and generates the real theme palette and settings
chrome, so the harness borrows Obsidian's frame instead of approximating it.
Re-run it after an Obsidian update. Without it the harness falls back to the
hand-written approximation in `harness/theme.css` and is close but not exact.

`npm run harness:shot` renders every view to `harness/shots/` — both themes,
both surfaces, the narrow reflow, the empty and error states — so a review can
look at PNGs rather than clicking through.

**The settings tab** (`Surface → Settings`, or `Both` for the two side by side):

- does a new config field read as a setting, or as a form field dumped in a list
- is its description a consequence, or a restatement of its label (§8 of
  `PATTERNS.md`)
- do the list-shaped fields — rows, columns, attributes, triggers — stay legible
  once they hold ten entries rather than two
- does the grid preview agree with what the sheet actually renders
- what happens to the sheet when the field changes: `Both` shows it live

---

## 11. Backlog

| Gap | Fix |
| --- | --- |
| No check on literal colours | Extend `styles.test.ts`: assert no hex, `rgb()`, `hsl()` or named colour outside a comment. Currently zero, so the check lands green. |
| No check on the `--sheetsmith-` knob prefix | Same file: assert every custom property declared in the plugin's own blocks carries the prefix. |
| `styles.css` is one 118KB file | Its inline comments are excellent, but section boundaries exist only as comments. Split alongside the `src/editor/` extraction, so sheet styles and editor styles stop sharing a file. |
| Reduced-motion coverage unverified | 28 `transition` declarations against 5 `prefers-reduced-motion` blocks. One block can cover several selectors, so this is not necessarily a gap. Confirm coverage in the harness rather than by counting. |
| `styles.css` assumes a settings design Obsidian no longer has | `styles.css:83` says "Hairlines between fields carry the settings rhythm; keep them". Confirmed stale against Obsidian 1.13's own `app.css`: `.setting-item` now carries `--setting-items-background` and `--setting-items-radius` and draws each setting as a card with no hairline between. The rhythm that comment preserves is gone, and the rules tuned to sit with it are tuned against a frame that no longer exists. Re-tune against the calibrated harness, or state that the plugin deliberately keeps its own rhythm inside its accent-bordered form. |
