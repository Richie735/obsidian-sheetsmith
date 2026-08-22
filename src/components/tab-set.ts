/*
 * Tab set — a strip of names over one region at a time (SPEC §4.2). Covers the
 * multi-page sheet: a wide one at the top of a layout is what a "pages" feature
 * would have been, a **Combat** tab beside a **Spells** tab beside a **Notes**
 * tab nobody opens mid-fight.
 *
 * **Nothing moves when a tab changes, and that is the whole reason this
 * component exists rather than a `collapsible` flag on Group.** A tab has no
 * placement of its own: it fills the panel, and the panel is the tab set's own
 * `width × height`. So every tab is the same box, and a tab set three columns by
 * two rows holds a tab that is a Group of a 2×2 beside a 1×2 and a tab that is
 * one 3×2 Table, interchangeable without anything on the sheet shifting. The
 * guarantee is structural rather than measured — there is no "which tab decides
 * the height" question to answer.
 *
 * Group tried the other thing and it was withdrawn: a collapse is a component
 * ceasing to fill its placement, which SPEC §8 forbids, and on a grid it
 * produced a hole beside a taller neighbour and moved the whole sheet below the
 * tallest one. Hiding is a capability a container earns by going on filling its
 * placement while it hides (SPEC §13).
 *
 * **Every panel stays laid out**, hidden with `visibility` and `inert`, because
 * a panel removed from layout contributes no height and a container whose height
 * depends on which panel is showing is the collapse again. The price is stated
 * rather than hidden: **find-in-page does not reach an unopened tab.**
 * `hidden="until-found"` is the spelling that would have kept it and it runs on
 * `content-visibility: hidden`, which is exactly the removal from layout being
 * ruled out — so the two cannot both be had, and movement on every tab press is
 * the worse failure.
 *
 * **Hidden content is still rendered and its formulas still resolved.** Hiding
 * is never a way to make a formula not run: a Pool on a tab nobody has opened
 * publishes its name, resolves its `max`, resets on a long rest and appears by
 * name in that trigger's confirmation. A reset whose meaning depended on which
 * tab the reader had open would be SPEC §5's grid-order `?` in a new place.
 *
 * **Every tab is in the focus order**, rather than the ARIA pattern's single tab
 * stop with arrow keys inside it. Deque names that focus behaviour a defect, and
 * on a control whose whole job is hiding things the failure is concrete: a
 * keyboard user who cannot reach the fourth tab without knowing to press an
 * arrow key has lost the content behind it. The arrows work too, so the
 * pattern's own idiom is not taken away.
 *
 * **It is not a Group.** A group's children are shown together and a tab set's
 * are alternatives, which is why `children` could not mean both under one type
 * and tabs are their own catalog entry rather than a `display` value (SPEC §13).
 * It reaches its children through `context.childRegions` where a group reaches
 * them through `context.renderChildren`, and that pair of members is the same
 * distinction one level down.
 */

import {
	ComponentConfig,
	ComponentDefinition,
	ReadResult,
	showsOwnLabel,
} from '../types';

export interface TabSetConfig extends ComponentConfig {
	type: 'tab-set';
	hideLabel?: boolean;
}

/**
 * A container holds no data, so there is no shape for one. Declared rather than
 * left as `unknown` so `read` and `write` say in the type what they say in
 * words: this component never has anything to hand back.
 */
export type TabSetData = null;

/**
 * Which tab to open, given what the reader last chose.
 *
 * Clamped rather than trusted, because the reader's choice outlives the layout:
 * a tab set that loses its fourth tab while somebody has it open leaves an index
 * pointing past the end, and the view holds that index for as long as the note
 * is. Falling back to the first tab is the same answer as never having chosen.
 */
function activeIndex(chosen: number | undefined, count: number): number {
	if (chosen === undefined || !Number.isInteger(chosen)) return 0;
	// The first tab, not the nearest one. Written as a clamp first, which quietly
	// meant "the last tab" — and there is no reading under which losing the
	// fourth tab should open the third rather than starting over. This is the
	// answer the sentence above claims.
	if (chosen < 0 || chosen >= count) return 0;
	return chosen;
}

export const tabSet: ComponentDefinition<TabSetConfig, TabSetData> = {
	type: 'tab-set',
	storage: 'none',
	// A tab fills the panel, so a tab has no placement. Declared because nothing
	// outside a component can see which half of containment it reaches for, and
	// the editor has to offer an ordered list where a grid would draw every tab
	// on top of every other and call them all overlapping.
	showsOneChild: true,
	formulaFields: [],
	configFields: [
		{
			key: 'hideLabel',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide the heading',
			description:
				'Draws the tabs with no heading above them, for a tab set that is the whole region rather than a named section. The tabs keep their own names either way.',
			default: false,
		},
	],

	// Both exist because the contract's five are the five. Neither is reachable
	// in practice: `storage: 'none'` makes the sheet skip `getSection` and
	// `read`, and a container never reports an edit for `write` to serve.
	read(): ReadResult<TabSetData> {
		return { ok: true, data: null };
	},

	write(_data, body): string {
		return body ?? '';
	},

	// No config guard, on Group's terms: one setting cannot contradict another,
	// so there is nothing for one to refuse. A tab nested too deep is the
	// parser's refusal and a tab set inside a component that holds a value is the
	// registry's, and neither is this component's to report.
	render(container, config, _data, context): void {
		const doc = container.ownerDocument;
		container.replaceChildren();

		const root = doc.createElement('div');
		root.classList.add('sheetsmith-tabset');
		container.appendChild(root);

		// A tab set can never itself be a tab — its own tabs would be the third
		// container and the parser refuses that — so the second half of this is
		// unreachable today. Asked anyway, because a check with an exception list
		// is how the next container ends up on the exception list.
		if (showsOwnLabel(config, context)) {
			const heading = doc.createElement('div');
			// The group's own heading class: two containers with a heading of the
			// same rank must not measure differently, which is UI §9 read one
			// level up. A tab set's own name sits above the strip exactly as a
			// group's sits above its region.
			heading.classList.add('sheetsmith-group-heading');
			heading.textContent = config.label;
			root.appendChild(heading);
		}

		// The names come from the children's own labels rather than from a `tabs`
		// declaration beside `children`: the label is already there, already
		// unique, and already what the editor edits, and a second nesting shape
		// would be one more thing for the parser to walk (SPEC §13).
		const names = (config.children ?? []).map((child) => child.label);
		const regions = context.childRegions ?? [];
		if (regions.length === 0) {
			// A layout part-way through being built, not an error — the reading
			// SPEC §6 already takes for a declared trigger nothing binds to.
			root.classList.add('sheetsmith-tabset-empty');
			return;
		}

		const strip = doc.createElement('div');
		strip.classList.add('sheetsmith-tabset-strip');
		strip.setAttribute('role', 'tablist');
		root.appendChild(strip);

		const stage = doc.createElement('div');
		// One grid cell holding every panel, and it answers no container query:
		// overlapping elements on a grid that reflowed would stack vertically, and
		// the set would become as tall as every tab put together with one visible.
		// A container tab's own subgrid sits inside its panel and reflows
		// normally, which is what should happen.
		stage.classList.add('sheetsmith-tabset-stage');
		root.appendChild(stage);

		const tabs: HTMLButtonElement[] = [];
		const panels: HTMLElement[] = [];

		regions.forEach((draw, index) => {
			const tab = doc.createElement('button');
			tab.type = 'button';
			tab.classList.add('sheetsmith-tabset-tab');
			tab.setAttribute('role', 'tab');
			// Every tab in the focus order, not a roving one. The id pair is what
			// lets a screen reader move between a tab and its panel, and it is
			// keyed on the component id because two tab sets on one sheet would
			// otherwise share it.
			tab.id = `sheetsmith-tab-${config.id}-${index}`;
			tab.textContent = names[index] ?? `Tab ${index + 1}`;
			strip.appendChild(tab);
			tabs.push(tab);

			const panel = doc.createElement('div');
			panel.classList.add('sheetsmith-tabset-panel');
			panel.setAttribute('role', 'tabpanel');
			panel.setAttribute('aria-labelledby', tab.id);
			tab.setAttribute('aria-controls', `sheetsmith-panel-${config.id}-${index}`);
			panel.id = `sheetsmith-panel-${config.id}-${index}`;
			stage.appendChild(panel);
			panels.push(panel);
			// Every panel drawn, including the hidden ones: hiding changes what
			// the reader sees, never what the sheet computes.
			draw(panel);
		});

		let active = activeIndex(context.activeTab, regions.length);

		const paint = (): void => {
			tabs.forEach((tab, index) => {
				tab.setAttribute('aria-selected', String(index === active));
				tab.classList.toggle('is-active', index === active);
			});
			panels.forEach((panel, index) => {
				const hidden = index !== active;
				// `visibility` rather than `hidden` or `display`, so the panel goes
				// on contributing its height. `inert` is what takes it out of the
				// tab order and out of reach of a script that would focus into it;
				// the two together are what "hidden but still laid out" means.
				panel.classList.toggle('sheetsmith-tabset-panel-hidden', hidden);
				panel.toggleAttribute('inert', hidden);
			});
		};

		const open = (index: number, moveFocus: boolean): void => {
			active = activeIndex(index, regions.length);
			// Painted before reporting, because nothing here reaches the note: no
			// write means no rebuild, so a control waiting for one would never
			// answer the press at all (PATTERNS §5).
			paint();
			// A control inside the panel just hidden is unfocusable now, so focus
			// would fall to the body and the view would have nothing to restore.
			// Asked of the panels rather than of the root: the stranded control is
			// still *inside* this component, which is why "has focus left the
			// component" was the wrong question and answered no every time.
			const holder = doc.activeElement;
			const stranded =
				holder !== null &&
				panels.some((panel, at) => at !== active && panel.contains(holder));
			if (moveFocus || stranded) tabs[active]?.focus();
			context.onActivateTab?.(active);
		};

		tabs.forEach((tab, index) => {
			tab.addEventListener('click', () => open(index, false));
			// The arrows as well as Tab, so the pattern's own idiom still works for
			// a reader who expects it. One route in for the press itself: the
			// keyboard's Enter and Space arrive at `click` by bubbling, which is
			// why there is no key handler for them here (PATTERNS §6).
			tab.addEventListener('keydown', (event: KeyboardEvent) => {
				const step =
					event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
				if (step === 0) return;
				event.preventDefault();
				open((index + step + tabs.length) % tabs.length, true);
			});
		});

		paint();
	},
};
