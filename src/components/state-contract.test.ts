// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getComponent, listComponentTypes } from './index';
import { publishedEntries } from '../formula/modifier-targets';
import {
	ChoiceAccount,
	ComponentConfig,
	ComponentDefinition,
	ModifierContext,
	RenderContext,
	ScopeValues,
	StateAccount,
	StateShape,
} from '../types';

/*
 * **A component that declares a level or a flag a modifier may set draws the
 * door onto it** (`docs/features/non-number-modifiers.md`), registry-wide.
 *
 * The rule's DOM half, in a file of its own for `note-contract.test.ts`'s
 * reason: `contract.test.ts` runs without a DOM on purpose, and the only honest
 * check of "draws the door" is to render the component and look. Each
 * component is drawn from its example and from every palette entry it offers —
 * configurations the component itself states, so nothing here holds one per
 * type — with an account pushed at every address the configuration declares,
 * and its DOM must carry each account's words.
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

/** The words a line pushed at this address carries, unique per address. */
const words = (name: string, column: string | null) =>
	`Pushed at ${name}${column === null ? '' : ` in ${column}`}`;

/** A sheet that has set every state it is asked about, and done nothing else. */
const SETTING: ModifierContext = {
	definitions: [],
	targets: [],
	published: [],
	bonusTypes: [],
	outcomes: () => [],
	breakdown: () => ({ lines: [], override: null, total: 0, resultTotal: 0 }),
	state: (name, column): StateAccount => ({
		shape: { flag: true, positions: 2, words: ['off', 'on'], label: name },
		stored: 0,
		drawn: 1,
		lines: [
			{
				label: words(name, column),
				source: 'Items',
				operator: 'override',
				type: null,
				amount: 1,
				suppressed: null,
			},
		],
		error: null,
	}),
	promote: () => Promise.resolve({ error: 'No layout here.' }),
};

/** Every published name and its entry, through the one walk over `ScopeValues`. */
function entriesOf(id: string, values: ScopeValues) {
	return publishedEntries({ id, values });
}

/** Every address a published name declares: its own state, and its columns'. */
function addresses(id: string, values: ScopeValues): { name: string; column: string | null }[] {
	const found: { name: string; column: string | null }[] = [];
	for (const { name, entry } of entriesOf(id, values)) {
		if (entry.state !== undefined) found.push({ name, column: null });
		for (const column of Object.keys(entry.states ?? {})) found.push({ name, column });
	}
	return found;
}

/**
 * Configurations that declare a state where no example or palette entry does.
 *
 * **The one departure from this file's rule that it holds no configuration per
 * type**, and it is stated rather than taken quietly: Table's and Roster's
 * examples and palette entries publish no row with a key, so the sweep would
 * check Track's checkbox alone and say nothing about the two components whose
 * cells draw a ring a modifier set. A named row over a level, a toggle and a
 * published computed column is the least each needs.
 */
const STATE_FIXTURES: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
	table: [
		{
			rows: [{ label: 'Stealth', key: 'stealth' }],
			columns: [
				{ key: 'Training', type: 'level', levels: ['Untrained', 'Proficient', 'Expertise'] },
				{ key: 'Worn', type: 'toggle' },
				{ key: 'Total', type: 'computed', formula: 'Training', publish: true },
			],
		},
	],
	roster: [
		{
			stats: [{ key: 'DEX' }],
			rows: [{ label: 'Stealth', stat: 'DEX', key: 'stealth' }],
			columns: [
				{ key: 'Training', type: 'level', levels: ['Untrained', 'Proficient', 'Expertise'] },
				{ key: 'Total', type: 'computed', formula: 'Training', publish: true },
			],
		},
	],
};

/**
 * Every configuration a component states for itself — its example and its
 * palette — and the fixtures above where it offers none declaring a state.
 */
function configurations(component: ComponentDefinition, type: string): ComponentConfig[] {
	return [
		component.example ?? {},
		...(component.palette ?? []).map((entry) => entry.config),
		...(STATE_FIXTURES[type] ?? []),
	].map((over) => ({ ...bareConfig(type), ...over }));
}

/** The addresses whose door a component left out of its DOM. Empty is the rule held. */
function undrawn(component: ComponentDefinition, config: ComponentConfig): string[] {
	const body = component.sample?.(config) ?? null;
	const read = body === null ? null : component.read(body, config);
	const data = read !== null && read.ok ? read.data : null;
	const declared = addresses(config.id, component.scopeValues?.(data, config) ?? {});
	const container = document.createElement('div');
	const context: RenderContext = {
		resolved: {},
		resolveField: () => null,
		onChange: () => {},
		modifiers: SETTING,
	};
	component.render(container, config, data, context);
	const text = container.textContent ?? '';
	return declared
		.map(({ name, column }) => words(name, column))
		.filter((said) => !text.includes(said));
}

/** Every configuration on the registry that declares a state, by type. */
const declaring = listComponentTypes().flatMap((type) => {
	const component = getComponent(type) as ComponentDefinition;
	return configurations(component, type)
		.filter((config) => {
			const body = component.sample?.(config) ?? null;
			const read = body === null ? null : component.read(body, config);
			const data = read !== null && read.ok ? read.data : null;
			return addresses(config.id, component.scopeValues?.(data, config) ?? {}).length > 0;
		})
		.map((config) => [type, config] as const);
});

describe('a component declaring a level or a flag draws the door onto it', () => {
	it('finds configurations that declare one, on each component drawing a ring a modifier sets', () => {
		// The floor, because every assertion below is an absence.
		expect([...new Set(declaring.map(([type]) => type))].sort()).toEqual(['roster', 'table', 'track']);
	});

	it.each(declaring)('"%s" draws a door at every state it declares', (type, config) => {
		const component = getComponent(type) as ComponentDefinition;
		expect(undrawn(component, config)).toEqual([]);
	});

	it('fails a component that declares a state and draws no door', () => {
		// Pool publishes names and draws no ring at all, so declaring a state on
		// its own value is exactly the lie the rule exists for.
		const pool = getComponent('pool') as ComponentDefinition;
		const shape: StateShape = { flag: true, positions: 2, words: ['off', 'on'], label: 'Pool' };
		const forced = {
			...pool,
			scopeValues: (data: unknown, config: ComponentConfig) => {
				const values = pool.scopeValues?.(data, config) ?? {};
				return { ...values, self: { ...(values.self ?? {}), state: shape } };
			},
		} as ComponentDefinition;
		expect(undrawn(forced, { ...bareConfig('pool'), ...(pool.example ?? {}) })).not.toEqual([]);
	});
});

/*
 * **A component that declares a dropdown a modifier may choose for draws the
 * door onto it** (`docs/features/text-value-modifiers.md`), the same rule read
 * for `ScopeEntry.choice`: every registered configuration declaring one is
 * drawn with an account pushed at it, and its DOM must carry the account.
 */
const CHOOSING: ModifierContext = {
	...SETTING,
	state: undefined,
	choice: (name, stored): ChoiceAccount => ({
		shape: { label: name, options: [{ value: 'A', label: 'A' }] },
		stored: stored ?? '',
		drawn: 'A',
		lines: [{ label: `Chosen at ${name}`, source: 'Items', option: 'A', suppressed: null }],
		error: null,
	}),
};

/** The names a configuration declares a choice on. */
function choices(id: string, values: ScopeValues): string[] {
	return entriesOf(id, values)
		.filter(({ entry }) => entry.choice !== undefined)
		.map(({ name }) => name);
}

function dataOf(component: ComponentDefinition, config: ComponentConfig): unknown {
	const body = component.sample?.(config) ?? null;
	const read = body === null ? null : component.read(body, config);
	return read !== null && read.ok ? read.data : null;
}

const choosing = listComponentTypes().flatMap((type) => {
	const component = getComponent(type) as ComponentDefinition;
	return configurations(component, type)
		.filter((config) => choices(config.id, component.scopeValues?.(dataOf(component, config), config) ?? {}).length > 0)
		.map((config) => [type, config] as const);
});

describe('a component declaring a dropdown a modifier may choose for draws the door onto it', () => {
	it('finds configurations that declare one', () => {
		expect([...new Set(choosing.map(([type]) => type))]).toEqual(['card']);
	});

	it.each(choosing)('"%s" draws a door wherever a change reaches a choice', (type, config) => {
		const component = getComponent(type) as ComponentDefinition;
		const data = dataOf(component, config);
		const container = document.createElement('div');
		component.render(container, config, data, {
			resolved: {},
			resolveField: () => null,
			onChange: () => {},
			modifiers: CHOOSING,
		});
		const text = container.textContent ?? '';
		for (const name of choices(config.id, component.scopeValues?.(data, config) ?? {})) {
			expect(text).toContain(`Chosen at ${name}`);
		}
	});
});
