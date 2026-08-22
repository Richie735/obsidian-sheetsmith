/*
 * Group — a heading over a region of other components (SPEC §4.2). Covers the
 * arrangement a grid alone cannot name: six ability cards each beside their own
 * skills table under one **Abilities** heading, and a name for a band of the
 * sheet at a rank above the labels the cards inside it carry.
 *
 * **It is not a fourth kind of card.** UI §9 names the failure — "a fourth kind
 * of panel beside a row of cards reads as loose chrome floating on the page" —
 * and a container is the one component where the temptation is structural rather
 * than incidental, because it genuinely does surround things. So: a heading, a
 * hairline rule under it, and no box around the children. Alignment is free
 * here — the inner grid is the group's `width` in columns by its `height` in
 * rows, so an inner column is a sheet column and an inner row is a sheet row,
 * and a card inside the group lines up with the identical card outside it in
 * both directions — and anything more would be a box drawn around boxes.
 *
 * What alignment does *not* do is make the region legible, which the spec said
 * first and the render disproved: two things lining up is the absence of a
 * signal. So the heading and its rule carry it, and the rule's strength is what
 * separates a region from a region inside it — at one strength for both, an
 * outer group and an inner one were two identical 1.27:1 lines.
 *
 * **It stores nothing and publishes nothing.** `storage` is `none`, so the sheet
 * never looks for a section under this label; there is no `scopeValues`, no
 * `scopeRows` and no `applyReset`, because containment is arrangement and never
 * addressing — a child publishes exactly the name it would publish at the top
 * level, at any depth (SPEC §13). The children themselves are shared config the
 * parser walks and the view draws, reached here only through
 * `context.renderChildren`.
 *
 * **It hides nothing, and that correction is what made it what it is.** It
 * shipped with a `collapsible` heading, and on a grid that control was
 * incoherent: a group's cell is sized by whatever else spans its rows, so
 * collapsing one beside a taller neighbour reclaimed nothing and left a hole
 * exactly the height it saved, while collapsing the tallest one moved the whole
 * sheet below it. One control, one layout, two unrelated outcomes, and which one
 * an author got was decided by a property of the layout nothing states and
 * nothing could show them (SPEC §13). Hiding is Tab set's, and for a structural
 * reason rather than a careful one: every tab is the whole panel and the panel
 * is the tab set's own declared placement, so a tab set goes on filling its
 * placement while it hides — which is what §8 asks of every component and the
 * one thing a collapse could not do. Nothing moves because every panel stays
 * laid out, not because anything is measured.
 *
 * **It is not a Tab set.** A group's children are shown together; a tab set's
 * are alternatives, exactly one visible. One `children` key saying both would be
 * the rule §4.1 already applies to `display` against `compute`, so tabs are
 * their own catalog entry rather than a `display` value here (SPEC §13).
 *
 * What is left is deliberately modest, and worth naming so the next reader does
 * not re-add a capability: a name for a region, an inner grid that reflows on
 * its own width, twelve cards that relocate by moving one block, and the panel a
 * tab will hold.
 */

import {
	ComponentConfig,
	ComponentDefinition,
	ReadResult,
	RenderContext,
	showsOwnLabel,
} from '../types';

export interface GroupConfig extends ComponentConfig {
	type: 'group';
	hideLabel?: boolean;
}

/**
 * A container holds no data, so there is no shape for one. Declared rather than
 * left as `unknown` so `read` and `write` say in the type what they say in
 * words: this component never has anything to hand back.
 */
export type GroupData = null;

/**
 * The children, wherever this group decided to put them.
 *
 * Absent where the layout gave it none, and an empty group is a layout part-way
 * through being built rather than an error — so it draws its heading over a
 * quiet empty region, which is the reading SPEC §6 already takes for a declared
 * trigger nothing binds to.
 */
function fill(into: HTMLElement, context: RenderContext<GroupData>): void {
	if (context.renderChildren === undefined) {
		into.classList.add('sheetsmith-group-empty');
		return;
	}
	context.renderChildren(into);
}

export const group: ComponentDefinition<GroupConfig, GroupData> = {
	type: 'group',
	storage: 'none',
	formulaFields: [],
	configFields: [
		{
			key: 'hideLabel',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide the heading',
			description:
				'Draws the components with no heading over them, for a group that is arrangement rather than a named section. The components inside keep their own labels either way.',
			default: false,
		},
	],

	// Both exist because the contract's five are the five. Neither is reachable
	// in practice: `storage: 'none'` makes the sheet skip `getSection` and
	// `read`, and a container never reports an edit for `write` to serve.
	read(): ReadResult<GroupData> {
		return { ok: true, data: null };
	},

	write(_data, body): string {
		return body ?? '';
	},

	// No config guard, and that is a statement rather than an omission: with the
	// collapse gone there is no combination of this component's two settings that
	// has no reading, so there is nothing for one to refuse. A group whose
	// children a hand-edited layout put too deep is the parser's refusal, and a
	// group inside a component that holds a value is the registry's
	// (`undrawableMessage`) — neither is this component's to report.
	render(container, config, _data, context): void {
		const doc = container.ownerDocument;
		container.replaceChildren();

		const region = doc.createElement('div');
		region.classList.add('sheetsmith-group');
		container.appendChild(region);

		// The strip of a container that shows one child at a time is drawn from
		// this label, so drawing it again here would name the region twice. The
		// context says so rather than the layout, because there is no reading under
		// which both are wanted (SPEC §4.2).
		if (showsOwnLabel(config, context)) {
			const heading = doc.createElement('div');
			heading.classList.add('sheetsmith-group-heading');
			heading.textContent = config.label;
			region.appendChild(heading);
		}

		const body = doc.createElement('div');
		body.classList.add('sheetsmith-group-body');
		region.appendChild(body);
		fill(body, context);
	},
};
