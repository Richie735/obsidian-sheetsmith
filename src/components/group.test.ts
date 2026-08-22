// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { group, GroupConfig } from './group';
import { RenderContext } from '../types';

/*
 * Group, driven through its own DOM.
 *
 * What is asserted here is the chrome — the heading, the region, and the two
 * states of `hideLabel`. What it holds is not: the children come from the view
 * through `renderChildren`, so this file hands it a stand-in and checks only
 * that the group asked for them and put them somewhere.
 *
 * It is a short file on purpose. The group shipped with a collapsible heading
 * and lost it (SPEC §13), so a third of this file went with the control: the
 * chevron, the two `hidden="until-found"` assertions, the reported state across
 * a rebuild, and the one configuration a heading-as-control could refuse. What
 * is left is a container that draws a heading and asks for its children, and
 * there is not much more to say about it than that.
 */

function config(overrides: Partial<GroupConfig> = {}): GroupConfig {
	return {
		id: 'abilities',
		type: 'group',
		label: 'Abilities',
		position: { col: 1, row: 1, width: 4, height: 2 },
		...overrides,
	};
}

interface Rendered {
	el: HTMLElement;
	region: HTMLElement | null;
	heading: HTMLElement | null;
	body: HTMLElement | null;
	error: HTMLElement | null;
}

/**
 * Render into a fresh element, with a stand-in for the children the view draws.
 *
 * `children` false stands for a layout that gave the group none, which is what
 * the view says by leaving `renderChildren` off — the group has to be able to
 * tell an empty region from a region it was not asked to draw.
 */
function render(
	from: GroupConfig,
	options: { children?: boolean; parentShowsLabel?: boolean } = {},
): Rendered {
	const el = document.createElement('div');
	const context: RenderContext<null> = {
		resolved: {},
		resolveField: () => null,
		onChange: () => undefined,
		parentShowsLabel: options.parentShowsLabel,
		...(options.children === false
			? {}
			: {
					renderChildren: (into: HTMLElement) => {
						const card = document.createElement('input');
						card.className = 'child-control';
						into.appendChild(card);
					},
				}),
	};
	group.render(el, from, null, context);
	return {
		el,
		region: el.querySelector('.sheetsmith-group'),
		heading: el.querySelector('.sheetsmith-group-heading'),
		body: el.querySelector('.sheetsmith-group-body'),
		error: el.querySelector('.sheetsmith-error'),
	};
}

describe('a group that holds nothing of its own', () => {
	it('reads no section, whatever the note says', () => {
		// `storage: 'none'`, so the sheet never looks — and if it somehow did,
		// what comes back is an empty container rather than data.
		expect(group.storage).toBe('none');
		expect(group.read('```sheet\nvalue: 3\n```', config())).toEqual({
			ok: true,
			data: null,
		});
	});

	it('hands back the body it was given, byte for byte', () => {
		// Constraint 3, on a component that can never be the reason a note is
		// rewritten. Unreachable in the app — a container reports no edit — but
		// the promise is the file format's, not the call graph's.
		const body = '```sheet\nvalue: 3\n```';
		expect(group.write(null, body, config())).toBe(body);
		expect(group.write(null, null, config())).toBe('');
	});

	it('publishes no name and resets on no trigger', () => {
		// Containment is arrangement, never addressing. Registry-wide in
		// contract.test.ts as well, which is where the rule belongs; here
		// because it is the premise every other test in this file rests on.
		// `typeof` rather than the members themselves: reading a method off a
		// definition to assert on it is an unbound method, which the lint rules
		// reject.
		expect(typeof group.scopeValues).toBe('undefined');
		expect(typeof group.applyReset).toBe('undefined');
		expect(group.formulaFields).toEqual([]);
	});
});

describe('a group', () => {
	it('draws its heading over the children, and no box around them', () => {
		const { heading, body, el } = render(config());
		expect(heading?.textContent).toBe('Abilities');
		// A div, not a button: a group has nothing to press. The chevron this
		// asserts the absence of is the collapse that was dropped — kept as an
		// assertion because a heading that became a control again would be the
		// regression, not a refinement.
		expect(heading?.tagName).toBe('DIV');
		expect(el.querySelector('button')).toBeNull();
		expect(body?.querySelector('.child-control')).not.toBeNull();
	});

	it('draws the children with no heading where the layout asks for none', () => {
		const { heading, body } = render(config({ hideLabel: true }));
		expect(heading).toBeNull();
		expect(body?.querySelector('.child-control')).not.toBeNull();
	});

	it('draws a heading over a quiet empty region where it holds nothing', () => {
		// A layout part-way through being built, not an error — the reading SPEC
		// §6 already takes for a declared trigger nothing binds to.
		const { heading, body, error } = render(config(), { children: false });
		expect(error).toBeNull();
		expect(heading?.textContent).toBe('Abilities');
		expect(body?.classList.contains('sheetsmith-group-empty')).toBe(true);
	});

	it('never hides its region', () => {
		// The whole of what the collapse removal means at this layer, asserted
		// rather than left to the absence of a control: a group's children are
		// in the DOM, laid out, and reachable, in both of its two states. Hiding
		// is Tab set's and there is no path through this component to it.
		for (const from of [config(), config({ hideLabel: true })]) {
			const { body } = render(from);
			expect(body?.hasAttribute('hidden')).toBe(false);
		}
	});
});

describe('a group whose name is already on screen', () => {
	it('draws no heading of its own', () => {
		// A tab set's strip is built from its children's labels, so a Group that
		// is a tab would otherwise say "Abilities" in the strip and again above
		// the region. There is no configuration in which both are wanted, which
		// is why the context says so rather than the author.
		const { heading, body } = render(config(), { parentShowsLabel: true });
		expect(heading).toBeNull();
		// And still draws what it holds. The heading is the only thing dropped.
		expect(body?.querySelector('.child-control')).not.toBeNull();
	});

	it('still draws one when nothing above it has', () => {
		// The vacuity guard: if the heading had simply stopped rendering, the test
		// above would pass on a component that never draws one.
		expect(render(config()).heading?.textContent).toBe('Abilities');
	});
});
