/*
 * A Stat block's briefs: one pressable card per form, drawn on **In play** while
 * no form is on, so the face that used to sit empty offers the choice itself
 * (`docs/features/stat-block-in-play-polish.md` §4).
 *
 * **Beside `stat-block.ts` for atomicity at one consumer**, on
 * `stat-block-zones.ts`'s and `modifier-form.ts`'s terms (PATTERNS §2): drawing
 * the brief list, its names and its colour rules is a second job in a file whose
 * job is a list of records under a picker. In no registry, declaring no
 * `ComponentDefinition`, importing nothing from `obsidian` and touching no file;
 * the picture arrives through the host's own thumbnail painter.
 *
 * **It knows nothing about a form's fields or the note.** Each brief arrives
 * already worked out — the name the picker shows, the changes line in In
 * play's wording, the colour, the picture line — and the fields and the
 * picture are drawn by the host's own painters (`tiles`, `thumb`), so each is
 * spelled once, at In play's site, and a brief reads exactly what In play reads. A press leaves as one call to the host's `choose`, which is the
 * picker's own write, so a brief cannot write anything the picker would not.
 *
 * **What it is: what In play draws above the zones, in small and read-only.**
 * The picture, the name at the head's title size, the record's fields and any
 * number a form's `=` sets as label-over-value pairs (In play's fields, read,
 * without the tile's box), and the changes as one line clamped to two.
 * **What it is not**: no zones (Every form is where they
 * are read), no steppers, no field and no other control — the brief is one
 * button, and everything in it is phrasing content, so in spans — and no
 * picture failure sentence, which is said where the picture is set and under
 * the head once the form is on. A picture that does not draw just leaves its
 * brief without one.
 *
 * **The colour is a rule, never a fill or an outline.** Those are the sheet's
 * vocabulary for a box a form *changed*; a brief is a choice, and its bottom
 * rule previews the rule the In play head draws once that form is on.
 */

import { TINT_ATTRIBUTE, TintColour } from '../types';
import { element } from '../ui/element';

/** One form as its brief draws it. */
export interface FormBrief {
	/** The record's position, which is what the host's `choose` and `tiles` take. */
	at: number;
	/** The form's name as the picker lists it. */
	named: string;
	/** Every change the form makes that is not a set number, in In play's wording, ` · ` between, or ''. */
	changes: string;
	tint: TintColour;
	/** The picture line where the layout draws pictures and the form holds one. */
	picture?: string;
}

export interface BriefsHost {
	/** The component's id, which keeps each brief's element ids unique on a sheet. */
	id: string;
	/** The list's accessible name, `Wild Shape: choose a form`. */
	listName: string;
	/**
	 * Paint a form's picture, read-only, into the thumbnail box this module
	 * draws: the host's own thumbnail painter, so the picture's classes and
	 * options are spelled once, at the head's site, and arrive here rather than
	 * being known here. `onError` is called where the picture will not draw.
	 */
	thumb: (into: HTMLElement, source: string, named: string, onError: (message: string) => void) => void;
	/**
	 * Draw the form's fields as pairs, read-only and in spans, into the row this
	 * module draws: In play's own tile painter on its brief face. Returns what
	 * they say as words, `HP 22/34 · Speed 40 ft.`, or '' where it drew none.
	 */
	tiles: (into: HTMLElement, at: number) => string;
	/** The picker's write: the chosen form on, and a use spent where the layout asks. */
	choose: (at: number) => void;
}

/**
 * Draw one brief per form into `into`, in the order given, as a named list of
 * buttons. **Each button is named by the form's name alone**, through
 * `aria-labelledby`, and **described by what its fields and its changes say**:
 * the fields as one sentence of label and reading (a hidden twin, since a row
 * of pairs read as text runs its labels into its numbers) and the changes line as it
 * is drawn. So a screen reader hears "Brown Bear, button", then the figures.
 */
export function drawBriefs(into: HTMLElement, briefs: readonly FormBrief[], host: BriefsHost): void {
	const list = element('ul', 'sheetsmith-stat-block-briefs', into);
	list.setAttribute('aria-label', host.listName);
	for (const brief of briefs) {
		const ids = (part: string) => `sheetsmith-stat-block-${host.id}-${brief.at}-brief-${part}`;
		const item = element('li', 'sheetsmith-stat-block-brief-item', list);
		const button = element('button', 'sheetsmith-stat-block-brief', item);
		button.type = 'button';
		button.setAttribute(TINT_ATTRIBUTE, brief.tint);
		const head = element('span', 'sheetsmith-stat-block-brief-head', button);
		if (brief.picture !== undefined) {
			const thumb = element('span', 'sheetsmith-stat-block-thumb sheetsmith-stat-block-brief-thumb', head);
			// A failure removes the thumbnail and says nothing here (the header's reason).
			host.thumb(thumb, brief.picture, brief.named, () => thumb.remove());
		}
		const name = element('span', 'sheetsmith-stat-block-brief-name', head, brief.named);
		name.id = ids('name');
		button.setAttribute('aria-labelledby', name.id);
		const described: string[] = [];
		const tiles = element('span', 'sheetsmith-stat-block-brief-stats', button);
		const said = host.tiles(tiles, brief.at);
		if (said === '') {
			tiles.remove();
		} else {
			const twin = element('span', 'sheetsmith-sr-only', button, said);
			twin.id = ids('tiles');
			described.push(twin.id);
		}
		if (brief.changes !== '') {
			const changes = element('span', 'sheetsmith-stat-block-brief-changes', button, brief.changes);
			changes.id = ids('changes');
			described.push(changes.id);
		}
		if (described.length > 0) button.setAttribute('aria-describedby', described.join(' '));
		button.addEventListener('click', () => host.choose(brief.at));
	}
}
