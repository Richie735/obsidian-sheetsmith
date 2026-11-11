/*
 * Decorations the sheet applies to placements after they are drawn, each driven
 * by a condition (`docs/features/character-forms.md`, "The tint").
 *
 * **Neither a contract member nor a component's job.** A component draws its
 * own number and marks it modified (`stampModifiedHost`); what it cannot know
 * is that the push came from a form the character is in, because the push is
 * another component's row. So the sheet asks the modifier resolution, once per
 * render, which published names a form changed, and paints them here — after
 * `renderGrid`, in the view and the harness alike, which is why this imports
 * nothing from `obsidian` (`grid-cells.ts`'s argument).
 *
 * **One kind today, `in-play`, and the list is built to take a second.** A
 * later `dimWhen` is a decoration whose condition is a sheet-scope boolean and
 * whose target is a placement: it joins the same list and the same pass rather
 * than becoming a second mechanism.
 *
 * **What it marks is what a form set, not everything that moved.** A form
 * pushing at Strength tints Strength; Athletics moves through its own formula
 * and stays untinted, because nothing was pushed at it. Tinting dependants
 * would need the dependency graph at render time, which a `compute` hides by
 * design, and would paint half a 5e sheet for one form.
 */

import { ModifierBreakdown, TINT_ATTRIBUTE, TintColour } from '../types';
import { contrast, over, readColour, Rgb } from '../ui/contrast';
// The attributes a stamped value and its box carry, declared once beside the stamp.
import { BOX_ATTRIBUTE, NAME_ATTRIBUTE, TAG_BOX_ATTRIBUTE } from '../components/modifier-breakdown';

/**
 * The class on the box a form changed — a card, a table row, a Roster card's
 * score pill, or the placement where the component names no box. The fill and the outline are drawn on it.
 */
export const IN_PLAY_BOX = 'sheetsmith-in-play';

/** The class on a placement a form changed where its component stamped no host. */
export const IN_PLAY_PLACEMENT = 'sheetsmith-in-play-placement';

/**
 * The class on what carries the pill: the first box tinted, or the element its
 * component named to carry the tag for it, which takes no fill or outline.
 */
export const IN_PLAY_MARKED = 'sheetsmith-in-play-marked';

/** The pill naming the form, and its spoken twin. */
export const IN_PLAY_MARK = 'sheetsmith-in-play-mark';

/**
 * The pill's class where it rides one line of a row — its name cell, or a
 * Roster band's name — rather than a box's corner.
 */
export const IN_PLAY_MARK_INLINE = 'sheetsmith-in-play-mark-inline';

/**
 * The pill's class where it names more than one form. Its words are the only
 * thing telling the forms apart where it is drawn in the accent
 * (`docs/features/form-tint-colour.md`), so on a box it takes the box's width
 * rather than the one form's 12ch.
 */
export const IN_PLAY_MARK_SEVERAL = 'sheetsmith-in-play-mark-several';

/**
 * The attribute on a drawn pill saying which text it is written in, `black` or
 * `white`; absent where nothing could be measured. The stylesheet maps the
 * word; `pickTagText` writes it.
 */
export const TAG_TEXT_ATTRIBUTE = 'data-sheetsmith-tag-text';

/** The attribute a cell carries naming the component drawn into it. */
export const COMPONENT_ATTRIBUTE = 'data-sheetsmith-component';

/** One decoration: what it is, what it says, and the published names it lands on. */
export interface PlacementDecoration {
	kind: 'in-play';
	/** What the mark says: the form's name, as its row reads. */
	label: string;
	/** The colour it paints in: the push's `tint`, the accent where it carried none. */
	tint: TintColour;
	names: readonly string[];
}

/**
 * The colour one box or one pill takes from the forms reaching it
 * (`docs/features/form-tint-colour.md`, "Two forms on by hand"): **a form's
 * colour where every form reaching it agrees, and the accent where they
 * disagree**, since no named colour can claim two forms. The words on the tag
 * say who did it.
 */
function agreed(tints: readonly TintColour[]): TintColour {
	const first = tints[0];
	return first !== undefined && tints.every((tint) => tint === first) ? first : 'accent';
}

/**
 * The in-play decorations a sheet owes: **a published name is in play where an
 * applied line at it came from a push flagged `inPlay`** — unsuppressed by the
 * stacking rule, and for an at least, only where it raised the number.
 *
 * Read off the breakdown rather than worked out beside it, so the tint and the
 * popover behind the number cannot disagree: the breakdown carries the floor's
 * verdict on its line (`withFloorVerdict`), which is the one fact both read.
 * One decoration per form, in the order the names first meet it: **a form is
 * its label and its tint together**, so two forms sharing a name and differing
 * in colour stay two decorations.
 */
export function inPlayDecorations(
	names: Iterable<string>,
	breakdown: (name: string) => ModifierBreakdown,
): PlacementDecoration[] {
	const byForm = new Map<string, { label: string; tint: TintColour; names: string[] }>();
	for (const name of names) {
		const seen = new Set<string>();
		for (const line of breakdown(name).lines) {
			if (line.inPlay !== true || line.suppressed !== null) continue;
			const tint = line.tint ?? 'accent';
			// A row's label is one line, so a newline keys the pair without a collision.
			const key = `${line.label}\n${tint}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const held = byForm.get(key);
			if (held === undefined) byForm.set(key, { label: line.label, tint, names: [name] });
			else held.names.push(name);
		}
	}
	return [...byForm.values()].map((form) => ({ kind: 'in-play', ...form }));
}

/** The cell a component was drawn into, by its id. */
function cellOf(root: HTMLElement, id: string): HTMLElement | null {
	for (const cell of Array.from(root.querySelectorAll<HTMLElement>(`[${COMPONENT_ATTRIBUTE}]`))) {
		if (cell.getAttribute(COMPONENT_ATTRIBUTE) === id) return cell;
	}
	return null;
}

/** The value hosts inside a cell stamped with one name. */
function hostsOf(cell: HTMLElement, name: string): HTMLElement[] {
	return Array.from(cell.querySelectorAll<HTMLElement>(`[${NAME_ATTRIBUTE}]`)).filter(
		(host) => host.getAttribute(NAME_ATTRIBUTE) === name,
	);
}

/** The box a stamped value belongs to: its card or its row, or itself. */
function boxOf(host: HTMLElement): HTMLElement {
	return host.closest<HTMLElement>(`[${BOX_ATTRIBUTE}]`) ?? host;
}

/**
 * Paint every decoration onto the sheet under `root`, clearing whatever the last
 * pass painted first.
 *
 * **Where it lands**: the owning component is the segment of the name before its
 * first `.`, which is SPEC §5's naming rule. Inside that component's cell, each
 * value stamped with the name leads to the **box it belongs to** — a Card's card,
 * each card of a Card set the form changed, a Roster card's score pill, a
 * Table's or a Roster's row — and the box takes the fill and the outline, so
 * the form reads as having changed that thing rather than one number in it. Where the component stamped
 * nothing — a Pool, a Track — the placement's own box does. The underline stays
 * on the number, which the component drew.
 *
 * **The pill is once per placement, on the first box tinted**, so it never sits
 * over a card the form left alone — or on what its component named to carry the
 * tag for that box (`TAG_BOX_ATTRIBUTE`), a Roster card for its score's pill,
 * which holds the box and takes no tint of its own. It is laid over the box and
 * takes no room: on a card-like box in its bottom inline-end corner, inside by
 * exactly the box's bottom padding so it can reach no content in any font,
 * where no note mark, door, score or value sits; on a table row over the name
 * cell's inline end, since a row's two ends hold its name and its value; on a
 * Roster's band head, a row with no name cell, at the inline start of the name
 * its component named to carry it (`carrierOf`). The CSS places it; this only
 * says which box and which cell carry it.
 */
export function applyDecorations(
	root: HTMLElement,
	decorations: readonly PlacementDecoration[],
	/** Where the pill may reveal a name it clips, as `ui/truncation.ts` does. */
	reveal?: (el: HTMLElement) => void,
): void {
	// The colour first, off the boxes the last pass tinted, which the class
	// still names: a Stat block's head, its name rows, its briefs and its Tint
	// swatch carry the attribute too, and are not this pass's to clear.
	for (const el of Array.from(root.querySelectorAll(`.${IN_PLAY_BOX}`))) el.removeAttribute(TINT_ATTRIBUTE);
	for (const cls of [IN_PLAY_BOX, IN_PLAY_PLACEMENT, IN_PLAY_MARKED]) {
		for (const el of Array.from(root.querySelectorAll(`.${cls}`))) el.classList.remove(cls);
	}
	for (const el of Array.from(root.querySelectorAll(`.${IN_PLAY_MARK}`))) el.remove();

	/** The boxes each cell's forms reached, in DOM order, and which forms. */
	const marked = new Map<HTMLElement, { boxes: HTMLElement[]; labels: string[]; tints: TintColour[] }>();
	/** The colours of the forms reaching each box. */
	const boxTints = new Map<HTMLElement, TintColour[]>();
	for (const decoration of decorations) {
		for (const name of decoration.names) {
			const owner = name.split('.')[0] ?? name;
			const cell = cellOf(root, owner);
			if (cell === null) continue;
			const hosts = hostsOf(cell, name);
			let boxes: HTMLElement[];
			if (hosts.length > 0) {
				boxes = hosts.map(boxOf);
			} else {
				cell.classList.add(IN_PLAY_PLACEMENT);
				const first = cell.firstElementChild;
				boxes = first instanceof HTMLElement ? [first] : [];
			}
			const held = marked.get(cell) ?? { boxes: [], labels: [], tints: [] };
			for (const box of boxes) {
				box.classList.add(IN_PLAY_BOX);
				if (!held.boxes.includes(box)) held.boxes.push(box);
				const tints = boxTints.get(box) ?? [];
				tints.push(decoration.tint);
				boxTints.set(box, tints);
			}
			if (!held.labels.includes(decoration.label)) held.labels.push(decoration.label);
			held.tints.push(decoration.tint);
			marked.set(cell, held);
		}
	}
	for (const [box, tints] of boxTints) box.setAttribute(TINT_ATTRIBUTE, agreed(tints));
	for (const [cell, { boxes, labels, tints }] of marked) {
		const said = labels.join(', ');
		// The first tinted box in reading order, which is where a reader meets it.
		const first = [...boxes].sort((left, right) =>
			left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
		)[0];
		if (first === undefined) continue;
		const row = first.tagName === 'TR';
		const rowName = row ? first.querySelector<HTMLElement>('th[scope="row"]') : null;
		// A row with a name cell takes the tag there. Otherwise the component
		// may name what carries it — the card holding a score pill, the name
		// inside a band's `tr` — which takes the tag and no fill or outline
		// (`carrierOf`).
		const carrier = rowName === null ? carrierOf(first, row) : null;
		const host = rowName ?? carrier;
		// A row with no cell has nowhere a tag may go; the spoken twin still does.
		if (host === null) {
			cell.createSpan({ cls: `sheetsmith-sr-only ${IN_PLAY_MARK}`, text: `Changed by ${said}` });
			continue;
		}
		carrier?.classList.add(IN_PLAY_MARKED);
		const pill = host.createSpan({
			cls: [
				IN_PLAY_MARK,
				// A row's tag rides one line, wherever in the row that line is.
				...(row ? [IN_PLAY_MARK_INLINE] : []),
				...(labels.length > 1 ? [IN_PLAY_MARK_SEVERAL] : []),
			].join(' '),
			text: said,
		});
		pill.setAttribute('aria-hidden', 'true');
		pill.setAttribute(TINT_ATTRIBUTE, agreed(tints));
		reveal?.(pill);
		cell.createSpan({ cls: `sheetsmith-sr-only ${IN_PLAY_MARK}`, text: `Changed by ${said}` });
	}
	pickTagText(root);
}

/**
 * What carries the tag for a first box that is not a row's name cell.
 *
 * **A card's carrier holds its box from outside, a row's sits inside it**: a
 * Roster card's pill names the card above it, and a Roster band's `tr`, which
 * has no name cell, holds the name its component stamped
 * (`docs/features/character-forms.md`, "A Roster's band head"). So a row looks
 * down, then falls back to its first cell, and **a tag is never a direct child
 * of a `tr`**: a span there is outside every cell, resolves its containing
 * block outside the row, and takes the `:last-child` the row's end edge is
 * drawn on.
 */
function carrierOf(first: HTMLElement, row: boolean): HTMLElement | null {
	if (!row) return first.closest<HTMLElement>(`[${TAG_BOX_ATTRIBUTE}]`) ?? first;
	const cell = first.firstElementChild;
	return first.querySelector<HTMLElement>(`[${TAG_BOX_ATTRIBUTE}]`) ?? (cell instanceof HTMLElement ? cell : null);
}

/** The two text colours a tag may be written in, as the stylesheet's words map them. */
const TAG_TEXTS = { black: [0, 0, 0], white: [1, 1, 1] } as const satisfies Record<string, Rgb>;

/**
 * **Write each drawn pill in black or white, whichever reads better on the fill
 * the theme actually drew**, and measure again whenever the theme or a snippet
 * changes, which is the view's `css-change` (`docs/features/form-tint-colour.md`,
 * "The tag's text, picked at runtime").
 *
 * The pill is the form's colour at 85%, so what a reader sees is that colour
 * laid over what is under it, and the pill straddles its box's edge: part of it
 * sits on the tinted box, part on the surface around the box. Both are read off
 * computed styles — the box's own surface and its tint layer, and the first
 * opaque surface outside it — and the pick takes the candidate whose worse
 * contrast of the two is higher. Black or white reaches at least 4.58:1 on any
 * opaque colour, which the theme's own text and page colours did not. Nothing
 * here assumes what a colour is, so a theme that redefines `--color-*` or the
 * accent is measured as it stands. A fill or a surface that does not read — no
 * layout engine — leaves the stylesheet's default.
 */
export function pickTagText(root: HTMLElement): void {
	const pills = Array.from(root.querySelectorAll<HTMLElement>(`.${IN_PLAY_MARK}[aria-hidden="true"]`));
	for (const pill of pills) {
		const box = pill.parentElement;
		const view = pill.ownerDocument.defaultView;
		const fill = view === null ? null : readColour(view.getComputedStyle(pill).backgroundColor);
		const surface = view === null || box === null ? null : surfaceOf(view, box);
		const around = view === null || box?.parentElement == null ? null : surfaceOf(view, box.parentElement);
		if (view === null || box === null || fill === null || surface === null || around === null) {
			pill.removeAttribute(TAG_TEXT_ATTRIBUTE);
			continue;
		}
		// The box's tint is a layer over its surface, not a colour of its own.
		const layer = layerOf(view, box);
		const tinted = layer === null ? surface : over(layer.rgb, layer.alpha, surface);
		const grounds = [over(fill.rgb, fill.alpha, tinted), over(fill.rgb, fill.alpha, around)];
		const worst = (text: Rgb) => Math.min(...grounds.map((ground) => contrast(text, ground)));
		pill.setAttribute(TAG_TEXT_ATTRIBUTE, worst(TAG_TEXTS.white) > worst(TAG_TEXTS.black) ? 'white' : 'black');
	}
}

/**
 * The tint layer nearest at or above the tag's carrier, **no further out than
 * the tinted box holding it**.
 *
 * A band's carrier is its name, which wears no layer, while the band's cell
 * around it is tinted, so the layer the tag sits on is read there
 * (`docs/features/character-forms.md`, "A Roster's band head"). A carrier no
 * tinted box holds — a Roster card — is read alone, and wears none, so its tag
 * is read on its plain surface. Bounded because a sheet has other gradients
 * that are not a tint: a table scroller's sideways shadow opens on an opaque
 * stop, which an unbounded walk would take for one.
 */
function layerOf(view: Window, el: HTMLElement): ReturnType<typeof readColour> {
	const bound = el.closest<HTMLElement>(`.${IN_PLAY_BOX}`) ?? el;
	for (let at: HTMLElement | null = el; at !== null; at = at.parentElement) {
		const layer = readColour(view.getComputedStyle(at).backgroundImage);
		if (layer !== null || at === bound) return layer;
	}
	return null;
}

/** The first opaque background at or above `el`: what a translucent layer on it is seen against. */
function surfaceOf(view: Window, el: HTMLElement): Rgb | null {
	for (let at: HTMLElement | null = el; at !== null; at = at.parentElement) {
		const paint = readColour(view.getComputedStyle(at).backgroundColor);
		if (paint !== null && paint.alpha >= 1) return paint.rgb;
	}
	return null;
}
