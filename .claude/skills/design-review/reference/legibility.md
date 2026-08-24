# Legibility

Standards for judging what a sheet shows rather than how it moves: colour
carrying meaning, contrast, type size, target size, and reading order. Read when
a change touches a colour, a state mark, a control's size, or grid placement.

> Restated from Apple's **Human Interface Guidelines** (Accessibility, Color,
> Typography, Layout, VoiceOver, and the Toggles, Buttons, Segmented controls,
> Tab views and Lists and tables component pages), read December 2025. The rules
> and their numbers are written out here in our own words and pointed at this
> plugin's own controls rather than copied; the source pages are listed in
> `AGENTS.md` § References.
>
> Vendored into the repository for the reason `motion.md` gives (PATTERNS §1).
> The reviewer's `allowed-tools` carries no network, so it cannot read the HIG
> live; a clone on another machine has to review by the same standard; and a
> delegation to something machine-local fails with no sign rather than with an
> error.
>
> The HIG describes native apps on Apple hardware. Plenty of it does not
> transfer to a plugin drawing DOM inside someone else's app, and §7 records
> what was deliberately left out so the question is not reopened every pass.

---

## 1. Points, and which kind

Two different units share the word, and both appear in the HIG's tables.

- **Apple UI points** size controls and type. One is one logical pixel, so 28pt
  is 28 CSS px. Obsidian's `--font-ui-small: 13px` is macOS's own 13pt body
  size, which is the corroboration that the conversion is 1:1 and not 4/3.
- **Typographic points** set WCAG's large-text threshold, which the HIG's
  contrast table borrows. One is 4/3 CSS px, so 18pt is 24px and 14pt is
  18.66px.

Nothing this plugin draws reaches 24px regular or 18.66px bold. **Every piece of
text on a sheet is small text**, and takes the 4.5:1 bar in §3. Do not re-derive
that per control.

---

## 2. Is colour carrying this alone? Ask this first

The HIG's rule on toggles: the difference between two states has to be obvious,
and colour alone will not carry it, because not everyone can tell two fills
apart. The remedy it names is a second channel — a glyph, a shape, a border, the
presence or absence of a fill. Its accessibility page says the same thing about
information generally.

**A fill appearing or disappearing is a second channel.** Filled against empty
is a shape difference, not a colour difference, and the HIG names it explicitly
as an acceptable answer. A plain toggle ring passes on that alone.

**A fill changing strength is not.** Two marked levels that differ only by how
far the mix went are one channel, and the reader who cannot separate them has
nothing else to read.

So the finding is never "this uses colour". It is: *name the second channel, or
name what a reader sees without it.* Sheetsmith's ramp is designed around this
already — `paintLevelRing` puts a glyph in the circle and the fill on top of it,
and the CSS comment is explicit that the ramp "costs nothing, because the glyph
and the name were already carrying the exact answer." That is the model. Check
new marks against it, and check the places the glyph channel is not there:

- A level whose entry ends in a bare colon (`Proficient:`) asks for a fill with
  no glyph. Two such levels in one column differ by fill strength only.
- Two levels whose names share an initial (`Proficient` and `Practised`) draw
  the same letter, so the same thing happens without anyone asking for it.
- A ramp with no glyph channel at all, like Track's harm segments, carries its
  whole meaning in the mix.

None of those is automatically wrong. A supplementary tint over a control that
already says the thing in text is fine, and the armed table row is the worked
example: the row's 12% error tint is redundant beside a button that carries the
error colour, a tooltip, an accessible name and an announcement. Say which case
you are looking at.

---

## 3. Contrast

The bar, from the HIG's accessibility page, which cites WCAG Level AA:

| What | Ratio |
| --- | --- |
| Text and meaningful glyphs, at every size this plugin draws | 4.5:1 |
| Text at 24px, or 18.66px bold | 3:1 |
| A border or fill that is the only thing marking a state | 3:1 |

Check it in **both themes**. A pair that holds against `--background-primary` in
dark can fail in light, and the mixed fills are where it happens, because
`color-mix` moves the background and leaves the text variable where it was.

**UI.md §1 already states the rule that keeps this right**: text on a blend uses
the variable defined against whatever was mixed in. `--text-normal` over a fill
mixed with `--background-primary` holds in both themes; `--text-on-accent` over
the same fill does not, because it is defined against the accent and the fill is
not the accent any more. §1 is the rule, this is the number that shows whether a
given case obeys it.

**Measuring it.** The shots are PNGs, so the fill and the glyph can be sampled
directly, but the numbers are easier to get from the variables. Take the theme
values out of `harness/obsidian.generated.css`, run the mix the stylesheet
declares, and compute the ratio. A ten-line script beats reading a swatch, and
the result is a number a finding can quote.

**Where a failure is not the plugin's to fix.** The plugin writes no literal
colours (UI.md §1), so a pair inherited whole from the host — `--text-on-accent`
on `--interactive-accent` — fails or passes as the host and the user's chosen
accent decide. Record the measurement and say so. The finding worth writing is
about which variable the rule picked, not about inventing a colour to fix it.

---

## 4. Type size

macOS's floor, which is the platform a Mac Obsidian window is: **13pt default,
10pt minimum**, so 13px and 10px. Below the minimum the HIG says text stops
being reliably readable, and it adds that a thin weight needs to sit above the
number rather than at it.

Two things follow for a sheet:

- **Check the derived sizes, not the tokens.** Obsidian's own tokens are at or
  above the floor by construction. What lands under it is arithmetic on top of
  them: `calc(var(--font-ui-smaller) * 0.85)` is 10.2px at Obsidian's defaults,
  which clears 10px by a fifth of a pixel and goes under at any smaller vault
  text setting.
- **Check at a larger text size too**, which is the other half of the HIG's
  typography guidance: truncation must not grow, the hierarchy must not
  reorder, and a multi-column layout may need fewer columns. UI.md §5 commits
  the card's headline number to `1.75em` precisely so it follows the vault
  setting. `harness:shot` renders `sheet-large-text` for this; before it existed
  that commitment had never been looked at.

---

## 5. Target size, and the gap beside it

| Context | HIG default | HIG minimum |
| --- | --- | --- |
| Pointer (macOS) | 28x28pt | 20x20pt |
| Touch or any coarse pointer | 44x44pt | 28x28pt |

A button, the HIG says, "needs a hit region of at least 44x44 pt" to be reached
comfortably by a fingertip, a pointer, or an assistive device.

**And then the rule that is usually skipped**: spacing between controls matters
as much as size. The HIG's number is roughly 12pt of padding around an element
with a bezel and 24pt around one without, and its reason is the one that bites
here — a target big enough to hit is not big enough if the neighbouring target
starts before the gap does.

That is the trade `sheet.css` already names in the ring's hit-target comment:
the target cannot grow vertically without reaching into the rows above and
below, so it does not, and `.sheetsmith-track-flags` keeps its row-gap wider
than the target reaches instead. **When a target cannot grow, the gap has to.**
A new stacked control inherits that obligation, and a review that checks the
target without checking the gap has checked half of it.

---

## 6. Reading order

The HIG's VoiceOver page: look for the places where a relationship between
elements exists only visually, and say it in the markup as well.

A sheet is the standing case. Components are placed explicitly into a stamped
column grid, and CSS grid placement can put a card visually before one that
comes earlier in the DOM. Tab order and every screen reader follow the DOM. So:

- After a reflow, does tabbing still walk the sheet in the order the eye does?
  The narrow shot is one column, which is where a mismatch is most visible and
  least excusable.
- Does a heading actually contain the region it names, or only sit above it?
  UI.md §12 already records the case where an unlabelled group's cards read as
  the previous sibling's once the sheet stacks; that is this question with the
  heading missing entirely.
- Is a column's meaning in a `<th>`, or only in the position of the cell? The
  HIG's tables guidance wants descriptive column headings, nouns or short noun
  phrases, no ending punctuation.
- Focus should not move without the user moving it. The view restores focus
  across a rebuild, so a rebuild that lands focus somewhere else is this rule
  broken, not a cosmetic slip.

---

## 7. What was deliberately left out

So a later pass does not go looking for it. Liquid Glass, materials, vibrancy
and translucency; safe areas and device housings; haptics; Siri and Shortcuts;
tips and onboarding; loading and progress indicators, since a sheet renders from
a local file; modality, since `ConfirmModal` is unreachable from
`RenderContext` (UI.md §9); and most of the Color page, which assumes system
colour APIs where UI.md §1's ban on literal colours is the stronger rule.

---

## 8. Where this codebase already stands

Measured against Obsidian's defaults (`--font-ui-small: 13px`,
`--font-ui-smaller: 12px`, `--size-2-2: 4px`, `--size-4-2: 8px`, accent
`#8b6cef`), so a review does not re-litigate settled ground.

- **The partial-fill contrast case is already solved.** `level-ring-part`
  switches the glyph to `--text-normal` short of the top, which is UI.md §1's
  rule applied by hand, and the comment says why. At a third of the way up in a
  light theme that is 14.1:1 where `--text-on-accent` would have been 1.5:1.
  Do not report it again.
- **The top level is the residual.** White `--text-on-accent` on full
  `--interactive-accent` measures 3.83:1 in both themes against a 4.5:1 bar.
  Both variables are the host's, and the plugin cannot substitute a colour of
  its own, so this is the host's pair and a custom accent moves it either way.
- **The level ring is 20.8px** (`1.6em` at `--font-ui-small`), 28.6px under
  `pointer: coarse`. Its `::after` target insets 4px vertically and 8px
  horizontally, giving **28.8 x 36.8px**, and **36.6 x 44.6px** coarse. That
  clears macOS's 28pt default on a pointer and falls about 7px short of 44pt
  vertically under a finger, which is the vertical constraint §5 describes
  rather than an oversight.
- **Five `color-mix` sites**, all in `sheet.css`: the ring fill and its hover
  pair, the armed delete button, the arming row tint, and Track's harm ramp.
  Every one mixes towards a background variable, none towards a literal.
- **Zero literal colours in the stylesheets**, which is UI.md §1 holding.
- **`calc(var(--font-ui-smaller) * 0.85)` is 10.2px**, in three places: the
  card's abbreviation, the table's secondary text, and the cell gloss. That is
  the smallest type on a sheet and the first thing a smaller vault text setting
  pushes under the floor.
