# Placed scroll cue

Status: shipped

## Route

Standard, with the spec skipped: the named precedent files carried the design
(`docs/WORKFLOW.md` § Routes). The precedent was the Table's right-edge scroll
shadow, `.sheetsmith-table-wrapper` in `styles/sheet.css`. With no spec there
were no acceptance criteria and no `/spec-review` report to tick them from. This
file is written at the land, as the record a landed feature keeps. It holds
what was built and the limits the owner accepted.

## Model question

None. Nothing is stored or published and nothing a note holds changes, so the
file format, Constraint 3 and Constraint 4 are untouched.

## What it does

Closes `docs/BACKLOG.md`'s "A placed box that scrolls gives no sign that more is
below". When a Stat block or a Record set at its placed height cuts its
content, a cue lies along the scroller's foot while there is more below, and it
is gone once the reader reaches the end. Where the content fits, there is no cue.

- **Shared vocabulary**: a class pair, `.sheetsmith-placed-scroll` on the wrapper
  that never scrolls and `.sheetsmith-placed-scroller` on its child that does,
  stamped by both components and styled once (`docs/UI.md` §9).
- **Mechanism**: the layer is a `::after` drawn over the content. The scroller's
  scroll timeline drives its opacity, so there is no scroll listener. A
  background under the content, the Table's way, would lie beneath the briefs,
  the In play panel, zone tables and group headings, which all paint opaque
  surfaces at the foot. The keyframes are the one `@keyframes` on the sheet,
  the guarded exception `docs/UI.md` §8 records. The owner ruled on the
  mechanism and the exception at the land stop.
- **Normal contrast**: the Table's own shade, `--background-modifier-border`
  fading to transparent over 16px. It fades out over the last 24px of the
  scroll, or over the whole scroll where there is less to scroll than that.
- **More contrast and forced colors**: a 2px solid rule, `--text-muted` or
  `CanvasText`, on a 10px floor of the box's own fill. The floor ends the
  content early rather than fading it, and the rule stands on fill on every
  side, so it completes no edge in the content. The scrollport's end is padded
  by the floor and the focus ring's reach, so a control Tab brings to the foot
  stops above the floor.
- **No support**: a WebView without scroll timelines draws no cue, which is the
  sheet as it was. Everything is behind `@supports (animation-timeline: scroll())`.
- **Not Rich text**: its two layers sit in the box with no wrapper between.

The argument for each choice is in `styles/sheet.css` at "A placed box that
scrolls says more is below". `src/styles.test.ts` holds the declarations, the
pair-only selectors and the gate. The harness views are
`sheet-scroll-cue-*` (`placedScrollCueViews` in `harness/shot.mjs`), staged
through `&place=<id>:<col>,<width>,<height>` and `&scrolly=<selector>|<top|bottom>`.

## Accepted known limits

Ruled acceptable by the owner at the land stop. They are not backlog rows.

- **At normal contrast the cue is faint.** The shade's edge measures 1.22:1 light
  and 1.24:1 dark against the box's `--background-primary-alt`, the same as the
  Table's shadow, below the 3:1 a state mark owes. Where a cut falls in a gap,
  as it does under a row of Stat block briefs, the cue is the only sign that
  content continues.
- **Under more contrast and forced colors the floor shaves the last whole
  line.** While the cue shows, the 10px floor covers about 2px of the baseline
  of the last line that would otherwise be whole.
- **A focused body textarea can sit under the floor.** It scrolls only far
  enough to show its caret line, so its lower edge can stay under the floor in
  those two modes. The scroll padding moves every other control clear.

## Deliberately not doing

- What scrolls and at what height, the Table's horizontal shadow, and the
  placed box's border and fill are unchanged.
- Rich text takes no cue (`docs/UI.md` §9).
- The layout editor's capped Rows and Columns lists keep their own open row in
  `docs/BACKLOG.md`. The same mechanism could serve them, but that is a fix of
  its own.
