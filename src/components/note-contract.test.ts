// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getComponent, listComponentTypes } from './index';
import { modifierTargetSource, publishedTargets } from '../formula/modifier-targets';
import { Layout } from '../parse/layout';
import { parseModifierDefinitions } from '../parse/modifier-definitions';
import {
	ComponentConfig,
	ComponentDefinition,
	isContainer,
	ModifierContext,
	RenderContext,
} from '../types';

/*
 * **A component publishing a name either draws its notes or refuses them as a
 * target** (`docs/features/modifier-notes.md` A), the half of the rule a DOM is
 * needed for.
 *
 * The other half — a component that does not declare `drawsNotes` has none of
 * its names in `noteTargets` — is `contract.test.ts`'s, where the registry's
 * other rules are. This half cannot live there: that file deliberately runs
 * without a DOM (its own `showsOwnLabel` case says why), and the only honest
 * check of "draws the notes pushed at its names" is to render the component and
 * look. So it is the same registry-wide sweep, in a file of its own that has a
 * DOM, and it is named for the rule rather than for any component.
 *
 * Each component is drawn from its own sample where it declares one — the
 * configuration the layout editor's picker draws — with a note pushed at every
 * name that sample publishes, and its DOM must carry each note's words. Nothing
 * here holds a configuration per type, which is the one thing a registry-wide
 * file exists not to do.
 */

/** Only what the layout editor owns, so any component will take it. */
function bareConfig(type: string): ComponentConfig {
	return {
		id: 'sample',
		type,
		label: 'Sample',
		position: { col: 1, row: 1, width: 1, height: 1 },
	};
}

/** The words a note pushed at this name carries, unique per name. */
const words = (name: string) => `Noted at ${name}`;

/**
 * A sheet that has pushed one note at every name it is asked about, and nothing
 * else: no arithmetic, no definitions, no outcomes.
 */
const NOTING: ModifierContext = {
	definitions: [],
	targets: [],
	published: [],
	bonusTypes: [],
	outcomes: () => [],
	breakdown: (name) => ({
		lines: [],
		override: null,
		total: 0,
		resultTotal: 0,
		notes: [
			{ label: 'Boots', source: 'Items', text: words(name), suppressed: null },
		],
	}),
	notable: () => true,
	promote: () => Promise.resolve({ error: 'No layout here.' }),
};

/** Every name a component publishes under its sample, in declaration order. */
function sampled(component: ComponentDefinition, type: string) {
	const config = {
		...bareConfig(type),
		...(component.example ?? {}),
	};
	const body = component.sample?.(config) ?? null;
	const read = body === null ? null : component.read(body, config);
	const data = read !== null && read.ok ? read.data : null;
	const values = component.scopeValues?.(data, config) ?? {};
	const names = [
		...(values.self === undefined ? [] : [config.id]),
		...Object.keys(values.named ?? {}).map((key) => `${config.id}.${key}`),
	];
	return { config, data, names };
}

/**
 * The names whose note a component left out of its DOM. Empty is the rule held.
 *
 * The last case below drives it on a component that draws nothing, so the check
 * is proved able to fail rather than trusted to.
 */
function undrawn(component: ComponentDefinition, type: string): string[] {
	const { config, data, names } = sampled(component, type);
	const container = document.createElement('div');
	const context: RenderContext = {
		resolved: {},
		resolveField: () => null,
		onChange: () => {},
		modifiers: NOTING,
	};
	component.render(container, config, data, context);
	const text = container.textContent ?? '';
	return names.filter((name) => !text.includes(words(name)));
}

describe('a component publishing a name either draws its notes or refuses them', () => {
	const drawing = listComponentTypes().filter(
		(type) => getComponent(type)?.drawsNotes === true,
	);

	it('finds the components that declare it', () => {
		// The floor, because every assertion below is an absence: a registry that
		// lost the member would leave nothing to check and pass.
		expect(drawing).toEqual(['card', 'roster', 'table']);
	});

	it.each(drawing)('"%s" draws every note pushed at a name its sample publishes', (type) => {
		const component = getComponent(type) as ComponentDefinition;
		expect(isContainer(component)).toBe(false);
		expect(undrawn(component, type)).toEqual([]);
	});

	it('is testing something: a declaring sample publishes names to note', () => {
		const published = drawing.flatMap(
			(type) => sampled(getComponent(type) as ComponentDefinition, type).names,
		);
		expect(published.length).toBeGreaterThan(1);
	});

	it('fails a component that declares it and draws nothing', () => {
		// Pool publishes three names and has not learned to draw a note, so
		// forcing the declaration onto it is exactly the lie the rule exists for.
		const forced = {
			...getComponent('pool'),
			drawsNotes: true,
		} as ComponentDefinition;
		expect(undrawn(forced, 'pool')).not.toEqual([]);
	});
});

describe('a note aimed at a component that draws none is reported, never dropped', () => {
	/**
	 * Every registered type that draws no note and still publishes a name under
	 * its sample — derived from the registry, so a component gaining a published
	 * name joins this without anyone remembering to add it.
	 */
	const silent = listComponentTypes().filter((type) => {
		const component = getComponent(type) as ComponentDefinition;
		if (component.drawsNotes === true) return false;
		const { config } = sampled(component, type);
		return publishedTargets([modifierTargetSource(config, component)]).length > 0;
	});

	it('finds components to check', () => {
		expect(silent.length).toBeGreaterThan(0);
	});

	it.each(silent)(
		'reports a note at a name "%s" publishes as not a note target yet',
		(type) => {
			const component = getComponent(type) as ComponentDefinition;
			const { config } = sampled(component, type);
			const source = modifierTargetSource(config, component);
			const names = publishedTargets([source]).map((target) => target.name);
			const layout = {
				name: 'L',
				components: [config],
				modifiers: names.map((name, at) => ({
					name: `Note ${at}`,
					target: name,
					note: 'Advantage',
				})),
			} as unknown as Layout;
			const said = parseModifierDefinitions(layout, [source]).problems.map(
				(problem) => problem.message,
			);
			expect(said).toEqual(
				names.map(
					(name, at) =>
						`"Note ${at}" notes "${name}", which cannot show a note yet, because the component publishing it draws none. Choose a value on a component that does, or correct the spelling.`,
				),
			);
		},
	);
});
