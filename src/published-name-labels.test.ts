import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	brokenSamples,
	companionSamples,
	effectiveSamples,
	formsSamples,
	groupTargetSamples,
	GROUP_TARGET_GROUPS,
	markdownSamples,
	modifierOptionsSamples,
	modifierStatesSamples,
	notesSamples,
	poolGrantSamples,
	recordGroupSamples,
	ringEndSamples,
	rosterCardStateSamples,
	Sample,
	SAMPLES,
} from '../harness/samples';
import { getComponent } from './components';
import {
	acceptingTargets,
	bufferTargets,
	choiceTargets,
	groupIndex,
	markedTargets,
	modifierTargetSource,
	ModifierTargetSource,
	noteTargets,
	publishedEntries,
	publishedTargets,
	stateTargets,
} from './formula/modifier-targets';
import { nameText } from './formula/name-label';
import { buildSheet } from './formula/sheet';
import { parseFunctions } from './formula/functions';
import { Layout, parseLayout, serialiseLayout } from './parse/layout';
import { parseModifierDefinitions } from './parse/modifier-definitions';
import { parseModifierGroups } from './parse/modifier-groups';
import { walkLayout } from './view/grid-cells';
import { ComponentConfig, isContainer } from './types';

/*
 * A label is display text and never identity
 * (`docs/features/published-name-labels.md`).
 *
 * The feature's one constraint that a type cannot carry: no name, target, group
 * or search resolves through a label. So every display text that is not storage
 * is rewritten — every `short` set, then made identical across components, then
 * cleared; a Card set entry's `name`, a Track row's, a Passport field's and a
 * Roster stat's — and every answer a name decides is asserted unchanged.
 *
 * **A Table's and a Roster's row `label` are left alone, and that is not a
 * gap.** A row label is also the claim on a note's row (`claimRows`), so
 * rewriting one moves which stored row a published name reads: storage, not
 * display text, whatever else it is.
 */

/** The display texts a rewrite may touch, by list, never a row label. */
const NAMED_LISTS: Readonly<Record<string, readonly string[]>> = {
	'card-set': ['entries'],
	track: ['rows'],
	passport: ['fields'],
	roster: ['stats'],
};

/** The lists whose items take a `short`, by component type. */
const SHORT_LISTS: Readonly<Record<string, readonly string[]>> = {
	'card-set': ['entries'],
	table: ['rows'],
	track: ['rows'],
	roster: ['stats', 'rows'],
	passport: ['fields'],
};

type Rewrite = 'none' | 'shorts' | 'same' | 'cleared' | 'names';

/** One config with its display text rewritten, its children with it. */
function rewritten(config: ComponentConfig, how: Rewrite): ComponentConfig {
	const copy = structuredClone(config) as ComponentConfig & Record<string, unknown>;
	const items = (keys: readonly string[] | undefined): Record<string, unknown>[] =>
		(keys ?? []).flatMap((key) => (Array.isArray(copy[key]) ? (copy[key] as Record<string, unknown>[]) : []));
	if (how === 'shorts' || how === 'same') {
		copy.short = how === 'same' ? 'X' : `${copy.id} short`;
		for (const [at, item] of items(SHORT_LISTS[copy.type]).entries()) {
			item.short = how === 'same' ? 'X' : `short ${at}`;
		}
	}
	if (how === 'cleared') {
		delete copy.short;
		for (const item of items(SHORT_LISTS[copy.type])) delete item.short;
	}
	if (how === 'names') {
		for (const item of items(NAMED_LISTS[copy.type])) item.name = 'Renamed';
	}
	if (copy.children !== undefined) copy.children = copy.children.map((child) => rewritten(child, how));
	return copy;
}

/** Every leaf a layout places, as the walk's sources read it. */
function sourcesOf(components: readonly ComponentConfig[]): ModifierTargetSource[] {
	return walkLayout([...components]).map(({ config }) => modifierTargetSource(config, getComponent(config.type)));
}

/** Everything a name decides on one layout, with the labels left out. */
function decided(layout: Layout, bodies: ReadonlyMap<string, string | null>) {
	const sources = sourcesOf(layout.components);
	const names = (targets: readonly { name: string }[]) => targets.map((target) => target.name);
	const groups = groupIndex(parseModifierGroups(layout).groups, sources);
	const prepared = walkLayout(layout.components).map(({ config }) => {
		const component = getComponent(config.type);
		if (component === undefined) throw new Error(`No component of type "${config.type}".`);
		const body = isContainer(component) ? null : (bodies.get(config.id) ?? null);
		const read = body === null ? null : component.read(body, config);
		return { config, component, error: null, data: read?.ok === true ? read.data : null };
	});
	const { env } = buildSheet(layout, prepared, parseFunctions(layout.functions).library);
	const published = names(publishedTargets(sources));
	return {
		published,
		accepting: names(acceptingTargets(sources)),
		marked: names(markedTargets(sources)),
		notes: names(noteTargets(sources)),
		groups: [...groups.members].map(([group, members]) => [group, members.map((member) => member.name)]),
		states: stateTargets(sources).map((target) => [target.name, target.column ?? null]),
		buffers: names(bufferTargets(sources)),
		choices: names(choiceTargets(sources)),
		// A problem's sentence quotes the target's label, so what must not move is
		// which definitions have one, and how many, rather than its words.
		problems: parseModifierDefinitions(layout, sources).problems.map((problem) => problem.definition ?? null),
		// What every published name resolves to, which is where a form in play
		// lands — the bear's changes included.
		values: published.map((name) => [name, env.sheet(name) ?? null]),
	};
}

/** The 5e starter, with no note: the static half and the definitions. */
const STARTER = parseLayout(readFileSync('src/starters/5e.json', 'utf8'));

/** A layout over harness samples, their bodies the note. */
function sampleLayout(samples: readonly Sample[], extra: Partial<Layout> = {}): { layout: Layout; bodies: Map<string, string | null> } {
	const bodies = new Map<string, string | null>();
	for (const sample of samples) {
		for (const { config } of walkLayout([sample.config])) {
			bodies.set(config.id, config === sample.config ? sample.body : (sample.children?.[config.id] ?? null));
		}
	}
	return {
		layout: {
			name: 'Sample',
			columns: 12,
			components: samples.map((sample) => sample.config),
			functions: ['mod(score) = floor((score - 10) / 2)'],
			modifierTypes: ['item', 'status', 'circumstance', 'morale'],
			...extra,
		},
		bodies,
	};
}

const CASES: readonly [string, { layout: Layout; bodies: Map<string, string | null> }][] = [
	['the 5e starter', { layout: STARTER, bodies: new Map() }],
	['the forms sample, the bear in play', sampleLayout(formsSamples('active'))],
	['the group-target sample', sampleLayout(groupTargetSamples('frightened'), { modifierGroups: [...GROUP_TARGET_GROUPS] })],
];

describe('a published name\'s label resolves nothing', () => {
	it.each(CASES)('decides the same on %s whatever its display text says', (_name, { layout, bodies }) => {
		const before = decided(layout, bodies);
		// The cases are about something: names, a resolved value, and on the
		// group sample members to keep in order.
		expect(before.published.length).toBeGreaterThan(5);
		for (const how of ['shorts', 'same', 'cleared', 'names'] as const) {
			const after = decided({ ...layout, components: layout.components.map((config) => rewritten(config, how)) }, bodies);
			expect(after, how).toEqual(before);
		}
	});

	it('holds a case each for the groups, the states and the definitions, so none of the above is vacuous', () => {
		const groups = decided(CASES[2]![1].layout, CASES[2]![1].bodies);
		expect(groups.groups.some(([, members]) => (members as string[]).length > 1)).toBe(true);
		const starter = decided(STARTER, new Map());
		expect(starter.states.length).toBeGreaterThan(0);
		expect(starter.accepting.length).toBeGreaterThan(0);
		const forms = decided(CASES[1]![1].layout, CASES[1]![1].bodies);
		expect(forms.values.some(([, value]) => value !== null)).toBe(true);
	});

	it('draws a name with no short at exactly its full width on every surface that asks for short', () => {
		/*
		 * No code path derives a short from a label or a key: with every `short`
		 * cleared, each name's short-width text is its full-width text, for the
		 * component part and the entry part alike.
		 */
		for (const [, { layout }] of CASES) {
			const cleared = layout.components.map((config) => rewritten(config, 'cleared'));
			for (const source of sourcesOf(cleared)) {
				for (const { parts } of publishedEntries(source)) {
					expect(nameText(parts, 'short')).toBe(nameText(parts, 'full'));
					expect(nameText(parts, 'short', { component: true })).toBe(nameText(parts, 'full', { component: true }));
				}
			}
		}
	});
});

describe('a layout\'s bytes, with and without short labels', () => {
	/** The starter as it read before short labels: every `short` line taken out. */
	const STARTER_TEXT = readFileSync('src/starters/5e.json', 'utf8');
	// A `short` mid-object ends its line with a comma; one last in its object
	// takes the comma off the line before it.
	const WITHOUT_SHORTS = STARTER_TEXT.replace(/^\t*"short": "[^"]*",\n/gm, '').replace(/,\n\t*"short": "[^"]*"(?=\n)/g, '');

	it('round-trips the starter byte for byte with its shorts and without them', () => {
		// The starter's own round trip is `starters/index.test.ts`'s; this holds
		// the file as it stood before, which no reader may now reformat.
		expect(WITHOUT_SHORTS).not.toContain('"short"');
		expect(WITHOUT_SHORTS).not.toBe(STARTER_TEXT);
		expect(serialiseLayout(parseLayout(WITHOUT_SHORTS))).toBe(WITHOUT_SHORTS);
		expect(serialiseLayout(parseLayout(STARTER_TEXT))).toBe(STARTER_TEXT);
	});

	it.each([
		['the default sheet', SAMPLES],
		['effective values', effectiveSamples()],
		['the broken sheet', brokenSamples()],
		['record groups', recordGroupSamples()],
		['modifier states', modifierStatesSamples()],
		['roster card states', rosterCardStateSamples()],
		['ring ends', ringEndSamples()],
		['notes', notesSamples()],
		['markdown', markdownSamples()],
		['a companion', companionSamples('familiar')],
		['forms', formsSamples('active')],
		['pool grants', poolGrantSamples('form-active')],
		['modifier options', modifierOptionsSamples()],
		['group targets', groupTargetSamples('frightened')],
	] as const)('round-trips the harness layout for %s byte for byte, shorts cleared or not', (_name, samples) => {
		for (const how of ['none', 'cleared'] as const) {
			// Written once as the editor writes a file, since a sample's object is
			// not in file order (the parser orders a reset binding's keys), and
			// then held to the round trip a file on disk gets.
			const built = sampleLayout(samples.map((one) => ({ ...one, config: rewritten(one.config, how) }))).layout;
			const text = serialiseLayout(parseLayout(serialiseLayout(built)));
			expect(serialiseLayout(parseLayout(text))).toBe(text);
			if (how === 'cleared') expect(text).not.toContain('"short"');
		}
	});
});
