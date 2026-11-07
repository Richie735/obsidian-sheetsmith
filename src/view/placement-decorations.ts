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

import { ModifierBreakdown } from '../types';
// The attributes a stamped value and its box carry, declared once beside the stamp.
import { BOX_ATTRIBUTE, NAME_ATTRIBUTE } from '../components/modifier-breakdown';

/**
 * The class on the box a form changed — a card, a table row, or the placement
 * where the component names no box. The fill and the outline are drawn on it.
 */
export const IN_PLAY_BOX = 'sheetsmith-in-play';

/** The class on a placement a form changed where its component stamped no host. */
export const IN_PLAY_PLACEMENT = 'sheetsmith-in-play-placement';

/** The class on the box that carries the pill: the first one tinted. */
export const IN_PLAY_MARKED = 'sheetsmith-in-play-marked';

/** The pill naming the form, and its spoken twin. */
export const IN_PLAY_MARK = 'sheetsmith-in-play-mark';

/** The pill's class where it rides in a row's name cell rather than over a box. */
export const IN_PLAY_MARK_INLINE = 'sheetsmith-in-play-mark-inline';

/** The attribute a cell carries naming the component drawn into it. */
export const COMPONENT_ATTRIBUTE = 'data-sheetsmith-component';

/** One decoration: what it is, what it says, and the published names it lands on. */
export interface PlacementDecoration {
	kind: 'in-play';
	/** What the mark says: the form's name, as its row reads. */
	label: string;
	names: readonly string[];
}

/**
 * The in-play decorations a sheet owes: **a published name is in play where an
 * applied line at it came from a push flagged `inPlay`** — unsuppressed by the
 * stacking rule, and for an at least, only where it raised the number.
 *
 * Read off the breakdown rather than worked out beside it, so the tint and the
 * popover behind the number cannot disagree: the breakdown carries the floor's
 * verdict on its line (`withFloorVerdict`), which is the one fact both read.
 * One decoration per form, in the order the names first meet it.
 */
export function inPlayDecorations(
	names: Iterable<string>,
	breakdown: (name: string) => ModifierBreakdown,
): PlacementDecoration[] {
	const byLabel = new Map<string, string[]>();
	for (const name of names) {
		const seen = new Set<string>();
		for (const line of breakdown(name).lines) {
			if (line.inPlay !== true || line.suppressed !== null) continue;
			if (seen.has(line.label)) continue;
			seen.add(line.label);
			const held = byLabel.get(line.label);
			if (held === undefined) byLabel.set(line.label, [name]);
			else held.push(name);
		}
	}
	return [...byLabel].map(([label, landsOn]) => ({ kind: 'in-play', label, names: landsOn }));
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
 * each card of a Card set or Roster the form changed, a Table's or a Roster's
 * row — and the box takes the fill and the outline, so the form reads as having
 * changed that thing rather than one number in it. Where the component stamped
 * nothing — a Pool, a Track — the placement's own box does. The underline stays
 * on the number, which the component drew.
 *
 * **The pill is once per placement, on the first box tinted**, so it never sits
 * over a card the form left alone. It is laid over the box and takes no room:
 * on a card-like box in its bottom inline-end corner, inside by exactly the
 * box's bottom padding so it can reach no content in any font, where no note
 * mark, door, score or value sits; on a table row over the name cell's inline end, since
 * a row's two ends hold its name and its value. The CSS places it; this only
 * says which box and which cell carry it.
 */
export function applyDecorations(
	root: HTMLElement,
	decorations: readonly PlacementDecoration[],
	/** Where the pill may reveal a name it clips, as `ui/truncation.ts` does. */
	reveal?: (el: HTMLElement) => void,
): void {
	for (const cls of [IN_PLAY_BOX, IN_PLAY_PLACEMENT, IN_PLAY_MARKED]) {
		for (const el of Array.from(root.querySelectorAll(`.${cls}`))) el.classList.remove(cls);
	}
	for (const el of Array.from(root.querySelectorAll(`.${IN_PLAY_MARK}`))) el.remove();

	/** The boxes each cell's forms reached, in DOM order, and which forms. */
	const marked = new Map<HTMLElement, { boxes: HTMLElement[]; labels: string[] }>();
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
			const held = marked.get(cell) ?? { boxes: [], labels: [] };
			for (const box of boxes) {
				box.classList.add(IN_PLAY_BOX);
				if (!held.boxes.includes(box)) held.boxes.push(box);
			}
			if (!held.labels.includes(decoration.label)) held.labels.push(decoration.label);
			marked.set(cell, held);
		}
	}
	for (const [cell, { boxes, labels }] of marked) {
		const said = labels.join(', ');
		// The first tinted box in reading order, which is where a reader meets it.
		const first = [...boxes].sort((left, right) =>
			left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
		)[0];
		if (first === undefined) continue;
		const rowName =
			first.tagName === 'TR' ? first.querySelector<HTMLElement>('th[scope="row"]') : null;
		const host = rowName ?? first;
		if (rowName === null) first.classList.add(IN_PLAY_MARKED);
		const pill = host.createSpan({
			cls: rowName === null ? IN_PLAY_MARK : `${IN_PLAY_MARK} ${IN_PLAY_MARK_INLINE}`,
			text: said,
		});
		pill.setAttribute('aria-hidden', 'true');
		reveal?.(pill);
		cell.createSpan({ cls: `sheetsmith-sr-only ${IN_PLAY_MARK}`, text: `Changed by ${said}` });
	}
}
