import { describe, expect, it } from 'vitest';
import { completionAt } from './completion';
import { RESERVED_NAMES } from './expression';
import { parseFunctions } from './functions';
import { publishedTargets } from './modifier-targets';
import {
	candidatesAt,
	matchCandidates,
	Vocabulary,
	vocabularySource,
} from './vocabulary';
import { getComponent } from '../components';
import { ComponentConfig } from '../types';

/*
 * What a layout offers a formula (SPEC §5, §7).
 *
 * Driven over *real* registered components rather than hand-written scope
 * values, because the claim the module makes is about the contract: what a
 * component publishes is `scopeValues`, whether an aggregate may walk it is
 * `scopeRows`, and which of its config fields hold row names is the `columns`
 * and `rows` field kinds. A fake source would assert the tree walk and nothing
 * about the three declarations the tree is derived from.
 */

/** A component config, with what a case is not about left alone. */
function component(over: Record<string, unknown>): ComponentConfig {
	return {
		position: { col: 1, row: 1, width: 1, height: 1 },
		...over,
	} as unknown as ComponentConfig;
}

/**
 * The layout the acceptance criteria are written against: a card, a card set, a
 * track with a row set, a table with columns and a row value, a record set that
 * publishes rows and no names, and a library function.
 */
const COMPONENTS: ComponentConfig[] = [
	component({
		id: 'armour_class',
		type: 'card',
		label: 'Armour class',
		derived: '10 + mod.self',
	}),
	component({
		id: 'abilities',
		type: 'card-set',
		label: 'Abilities',
		entries: [
			{ key: 'STR', name: 'Strength' },
			{ key: 'DEX', name: 'Dexterity' },
		],
	}),
	component({
		id: 'slots',
		type: 'track',
		label: 'Spell slots',
		rows: [
			{ key: 'L1', name: '1st', count: 4 },
			{ key: 'L2', name: '2nd', count: 2 },
		],
	}),
	component({
		id: 'inventory',
		type: 'table',
		label: 'Inventory',
		rows: [{ label: 'Sword', values: { ability: 'abilities.STR' } }],
		columns: [
			{ key: 'Qty', type: 'number' },
			{ key: 'Weight', type: 'number', total: true },
			{ key: 'Total', type: 'computed', formula: 'Qty * Weight' },
		],
	}),
	component({
		id: 'traits',
		type: 'record-set',
		label: 'Traits',
		fields: [{ key: 'uses', type: 'number' }],
	}),
];

const SOURCES = COMPONENTS.map((config) =>
	vocabularySource(config, getComponent(config.type)),
);

const VOCABULARY: Vocabulary = {
	components: SOURCES,
	functions: parseFunctions(['mod(score) = floor((score - 10) / 2)']).library,
};

/** The candidates at the end of a piece of typed text. */
function at(text: string, owner?: string) {
	const completion = completionAt(text, text.length);
	if (completion === null) throw new Error(`no completion at "${text}"`);
	return candidatesAt(VOCABULARY, completion, owner).map((one) => one.name);
}

/** The same, as name-and-note pairs, where the note is what the case is about. */
function notesAt(text: string) {
	const completion = completionAt(text, text.length);
	if (completion === null) throw new Error(`no completion at "${text}"`);
	return candidatesAt(VOCABULARY, completion).map(
		(one) => `${one.name} — ${one.note}`,
	);
}

describe('the top level', () => {
	it('is the publishing ids, then mod, the library and the built-ins', () => {
		// `traits` publishes no name, so it is not here — it is reachable only
		// as an aggregate's first argument, which is the case below.
		expect(at('a')).toEqual([
			'armour_class',
			'abilities',
			'slots',
			'inventory',
			'mod',
			...RESERVED_NAMES,
		]);
	});

	it('offers exactly eleven built-ins, which is what the language has', () => {
		expect(RESERVED_NAMES).toHaveLength(11);
	});

	it('names a component by its label', () => {
		expect(notesAt('a')).toContain('abilities — Abilities');
	});
});

describe('after a dot', () => {
	it('offers a card set its entries and no bare value', () => {
		// A card set publishes no name of its own, so there is nothing for
		// `abilities.value` to be worth.
		expect(at('abilities.')).toEqual(['STR', 'DEX']);
	});

	it('offers a card the stored value behind its derived one', () => {
		expect(at('armour_class.')).toEqual(['value']);
	});

	it('names the owner and not the key the item already shows', () => {
		// `docs/UI.md` §9's drop rule, the same one a breakdown's contributor
		// lines follow: the key is the visible name of the row, so a note
		// spelling it again would repeat half of itself six times over.
		expect(notesAt('abilities.')).toEqual([
			'STR — Abilities',
			'DEX — Abilities',
		]);
	});

	it('offers left only where the entry has a ceiling', () => {
		expect(at('slots.L1.')).toEqual(['value', 'left']);
		expect(at('abilities.STR.')).toEqual(['value']);
	});

	it('offers nothing under a name no component publishes', () => {
		expect(at('nonsense.')).toEqual([]);
		expect(at('abilities.STR.value.')).toEqual([]);
	});
});

describe('the mod namespace', () => {
	it('offers self and then the same ids', () => {
		expect(at('mod.')).toEqual([
			'self',
			'armour_class',
			'abilities',
			'slots',
			'inventory',
		]);
	});

	it('offers a component its members and never a value or a ceiling', () => {
		// The slot table registers neither, so `mod.slots.L1.left` reads nothing.
		expect(at('mod.slots.')).toEqual(['L1', 'L2']);
		expect(at('mod.armour_class.')).toEqual([]);
		expect(at('mod.slots.L1.')).toEqual([]);
	});
});

describe('inside an aggregate', () => {
	it('offers only components an aggregate may walk as the first argument', () => {
		expect(at('sum(i')).toEqual(['inventory', 'traits']);
	});

	it('offers nothing dotted as the first argument', () => {
		// SPEC §5: the first argument is a component reference and nothing else.
		expect(at('sum(inventory.')).toEqual([]);
	});

	it('puts the named table row vocabulary before the sheet', () => {
		const offered = at('sum(inventory, W');
		expect(offered.slice(0, 4)).toEqual(['Qty', 'Weight', 'Total', 'ability']);
		expect(offered).toContain('armour_class');
	});

	it('labels a row name by the list the layout typed it into', () => {
		expect(notesAt('sum(inventory, W').slice(0, 4)).toEqual([
			'Qty — Inventory · column',
			'Weight — Inventory · column',
			'Total — Inventory · column',
			'ability — Inventory · row value',
		]);
	});

	it('falls back to the sheet where the table names no component', () => {
		expect(at('sum(nothing, W')).toEqual(at('W'));
	});
});

describe('a formula written inside a component', () => {
	it('puts that component row vocabulary first', () => {
		// `Total` is absent: it is the entry whose value this cell computes.
		expect(at('W', 'inventory').slice(0, 3)).toEqual(['Qty', 'Weight', 'ability']);
	});

	it('withholds a computed entry from the cell it is the value of', () => {
		/*
		 * A self-reference: `table.ts`'s `rowScope` and `record-set.ts`'s
		 * `recordValues` both resolve a computed entry against the stored layer
		 * alone, so `Total` is not a name its own Formula cell can read.
		 */
		expect(at('T', 'inventory')).not.toContain('Total');
		expect(at('T', 'inventory')).toContain('Qty');
	});

	it('offers the same entry inside an aggregate, where it resolves', () => {
		// An aggregate walks finished rows, which carry computed over stored.
		expect(at('sum(inventory, T')).toContain('Total');
	});

	it('offers no other component row vocabulary', () => {
		expect(at('W')).not.toContain('Qty');
	});

	it('is overruled by the aggregate the caret is standing in', () => {
		// An aggregate walks the table it names, so a computed column's own
		// cells are not what `sum(traits, …)` is adding up.
		expect(at('sum(traits, W', 'inventory')).toEqual(at('sum(traits, W'));
		expect(at('sum(traits, W', 'inventory')[0]).toBe('uses');
	});
});

describe('matching', () => {
	/** The candidates at the end of a piece of typed text, and its prefix. */
	function typed(text: string) {
		const completion = completionAt(text, text.length);
		if (completion === null) throw new Error(`no completion at "${text}"`);
		return {
			offered: candidatesAt(VOCABULARY, completion),
			prefix: completion.prefix,
		};
	}

	it('matches a prefix without its casing', () => {
		const { offered, prefix } = typed('abilities.st');
		expect(matchCandidates(offered, prefix).map((one) => one.name)).toEqual(['STR']);
	});

	it('composes the whole path as the insertion', () => {
		const { offered, prefix } = typed('abilities.st');
		expect(matchCandidates(offered, prefix)[0]?.insert).toBe('abilities.STR');
	});

	it('puts an exact match first, so Enter re-inserts what is typed', () => {
		const { offered, prefix } = typed('abilities');
		expect(matchCandidates(offered, prefix)[0]?.name).toBe('abilities');
	});

	it('never matches a substring', () => {
		const { offered, prefix } = typed('class');
		expect(matchCandidates(offered, prefix)).toEqual([]);
	});

	it('offers armour_class on its own prefix and never the mod form', () => {
		const { offered, prefix } = typed('armour');
		expect(matchCandidates(offered, prefix).map((one) => one.insert)).toEqual([
			'armour_class',
		]);
	});
});

describe('the published names are the picker\'s own', () => {
	it('offers the set modifierTargetSource publishes and nothing else', () => {
		/*
		 * `docs/features/formula-name-suggestions.md`: a component whose
		 * `scopeValues` the picker does not see, the suggester does not see
		 * either. Composed by walking the tree — a bare id is published where
		 * the component answers `.value`, and every other published name is an
		 * `<id>.<member>` — and compared against the one assembly both surfaces
		 * read.
		 */
		const functions = new Set(VOCABULARY.functions.keys());
		const built = new Set<string>(RESERVED_NAMES);
		const composed = new Set<string>();
		for (const candidate of candidatesAt(VOCABULARY, {
			start: 0,
			end: 1,
			path: [],
			prefix: '',
		})) {
			const id = candidate.name;
			if (id === 'mod' || built.has(id) || functions.has(id)) continue;
			for (const member of candidatesAt(VOCABULARY, {
				start: 0,
				end: 1,
				path: [id],
				prefix: '',
			})) {
				if (member.name === 'left') continue;
				composed.add(member.name === 'value' ? id : member.insert);
			}
		}
		const published = publishedTargets(SOURCES).map((target) => target.name);
		expect([...composed].sort()).toEqual([...published].sort());

		/*
		 * And the label half, which the popup spells *shorter* than the picker on
		 * purpose (`docs/UI.md` §9's drop rule). So what is asserted is the
		 * relationship rather than equality: every member's note is the component
		 * half of the picker's own label, which is the half the reader does not
		 * already have on the line.
		 */
		const notes = candidatesAt(VOCABULARY, {
			start: 0,
			end: 1,
			path: ['abilities'],
			prefix: '',
		}).map((one) => one.note);
		const picker = publishedTargets(SOURCES)
			.filter((target) => target.name.startsWith('abilities.'))
			.map((target) => target.label);
		expect(notes).toEqual(picker.map((label) => label.split(' · ')[0]));
		expect(picker.every((label) => label.includes(' · '))).toBe(true);
		// Not a vacuous pass: an empty tree would satisfy an empty comparison.
		expect(published.length).toBeGreaterThan(4);
	});
});
