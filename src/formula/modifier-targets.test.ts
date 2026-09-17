import { describe, expect, it } from 'vitest';
import {
	acceptingTargets,
	modifierTargetSource,
	ModifierTargetSource,
	publishedSuffixes,
} from './modifier-targets';
import { buildSheetScope, publishedComponent } from './sheet';
import { table, TableConfig } from '../components/table';
import { ScopeEntry } from '../types';

/*
 * Which published names accept a modifier (SPEC §5, §7).
 *
 * A file of its own because the module is: the static half was split out of
 * `modifiers.ts` when a reader could no longer state that file's job without an
 * "and" (`PATTERNS.md` §1), and the cases came with it.
 */

/** A source as the check sees one, with what a case is not about left alone. */
function source(over: Partial<ModifierTargetSource>): ModifierTargetSource {
	return { id: 'x', label: 'X', values: {}, formulas: [], ...over };
}

describe('acceptingTargets', () => {
	const card = (
		id: string,
		formula: string,
		named?: readonly string[],
	): ModifierTargetSource =>
		source({
			id,
			label: id,
			values: named
				? { named: Object.fromEntries(named.map((key) => [key, { value: '1' }])) }
				: { self: { value: '1' } },
			formulas: [formula],
		});

	it('offers a name whose own component reads mod.self', () => {
		expect(acceptingTargets([card('armour_class', '10 + mod.self')])).toEqual([
			{ name: 'armour_class', label: 'armour_class' },
		]);
	});

	it('offers every name of a component that reads mod.self, one per entry', () => {
		expect(
			acceptingTargets([
				card('abilities', 'floor((value - 10) / 2) + mod.self', ['STR', 'DEX']),
			]),
		).toEqual([
			{ name: 'abilities.STR', label: 'abilities · STR' },
			{ name: 'abilities.DEX', label: 'abilities · DEX' },
		]);
	});

	it('offers a name some other component reads absolutely', () => {
		// `mod.armour_class` written anywhere on the layout makes it accepting,
		// which is why the absolute spelling costs nothing to allow.
		expect(
			acceptingTargets([
				card('armour_class', '10'),
				card('shield', 'mod.armour_class'),
			]),
		).toEqual([{ name: 'armour_class', label: 'armour_class' }]);
	});

	it('offers nothing where no formula reads a modifier', () => {
		// The empty set is the strongest false-positive-free statement the static
		// check supports, and it is what the layout editor turns into an error:
		// a layout with a modifier table and nothing reading a slot does nothing.
		expect(acceptingTargets([card('armour_class', '10 + abilities.DEX')])).toEqual(
			[],
		);
	});

	it('is not fooled by a mod.self inside an if', () => {
		// The language's `if` is lazy by design, so an *observed* set would report
		// this as accepting nothing on a character whose item is stowed. A text
		// scan cannot be fooled by a branch not taken.
		expect(
			acceptingTargets([card('armour_class', 'if(worn, 10 + mod.self, 10)')]),
		).toEqual([{ name: 'armour_class', label: 'armour_class' }]);
	});

	it('over-reports at the component, and in that direction only', () => {
		/*
		 * SPEC §5's aggregate edge in the same shape: the check is coarse at the
		 * component, so a Table where only one formula reads a slot reports every
		 * name it publishes as accepting — including a column total that has no
		 * formula of its own. The sheet's stray line at the row is the backstop,
		 * and making this exact needs the name-to-field pairing a `compute` is
		 * opaque to by design.
		 */
		expect(
			acceptingTargets([
				source({
					id: 'skills',
					label: 'Skills',
					values: {
						named: { perception: { value: 1 }, Bonus: { value: 0 } },
					},
					formulas: ['ability + mod.self'],
				}),
			]).map((target) => target.name),
		).toEqual(['skills.perception', 'skills.Bonus']);
	});
});

/*
 * That the accepting set is a property of the layout and not of a note.
 *
 * Three doc comments asserted this invariant while two independent assemblies
 * produced it from different inputs — the sheet from a note's data, the editor
 * from `null`. §10's rule is that a guard earns its place when a failure is
 * invisible in review, and this one was: both divergences over-reported in the
 * editor, so nothing wrong was ever on screen and only reading the two call
 * sites side by side would have shown it.
 *
 * **Asserted against the data-derived answer rather than against a second call
 * to the same function**, which would be the vacuous pass §10 forbids: the
 * claim is that this ignores the note, so the cases show what reading the note
 * would have said and that the answer differs. The other half — that every
 * caller goes through here — is a scan, in `sheet.test.ts`.
 */
describe('the accepting set belongs to the layout, not to a character', () => {
	/** A table publishing a column total and a keyed row, both modifiable. */
	const items: TableConfig = {
		id: 'items',
		type: 'table',
		label: 'Magic items',
		position: { col: 1, row: 1, width: 6, height: 2 },
		columns: [
			{ key: 'Weight', type: 'number', total: true },
			{ key: 'Bonus', type: 'computed', formula: 'mod.self', publish: true },
		],
		rows: [{ label: 'Rope', key: 'rope' }],
	};

	const names = (source: ModifierTargetSource) =>
		acceptingTargets([source]).map((target) => target.name);

	/** What the note publishes, which is what the sheet used to feed this. */
	const fromNote = (body: string) => {
		const read = table.read(body, items);
		const published = publishedComponent({
			config: items,
			component: table,
			data: read.ok ? read.data : null,
			error: read.ok ? null : read.error,
		});
		return names({
			id: items.id,
			label: items.label,
			values: published.values,
			formulas: modifierTargetSource(items, table).formulas,
		});
	};

	const STATIC = ['items.Weight', 'items.rope'];

	it('offers both published names, from the configuration alone', () => {
		expect(names(modifierTargetSource(items, table))).toEqual(STATIC);
	});

	it('is unmoved by a totalled column holding prose', () => {
		/*
		 * The first divergence, and it was reachable: `scopeValues` drops a total
		 * it could not read, so feeding the note dropped `items.Weight`. A prose
		 * cell in one row of one character's note deciding what a *layout* accepts
		 * is the wrong shape whichever answer it lands on.
		 */
		const body = '\n| Name | Weight |\n|---|---|\n| Rope | coil |\n';
		expect(fromNote(body)).toEqual(['items.rope']);
		expect(names(modifierTargetSource(items, table))).toEqual(STATIC);
	});

	it('is unmoved by a section that will not read at all', () => {
		/*
		 * The second: a failed read publishes `{}`, so the note-fed answer loses
		 * every name. Worse than merely inconsistent — a card already showing its
		 * own read error would have changed a target cell's message from "reads no
		 * modifier" to "this sheet publishes no such value", sending the author to
		 * fix a layout that was never wrong.
		 */
		const broken =
			'\n| Name | Weight |\n|---|---|\n\n| Second | Table |\n|---|---|\n';
		// The premise: this body really is one the component refuses.
		expect(table.read(broken, items).ok).toBe(false);
		expect(fromNote(broken)).toEqual([]);
		expect(names(modifierTargetSource(items, table))).toEqual(STATIC);
	});
});

/*
 * That the suffix set four surfaces now read is the set the sheet registers.
 *
 * `publishedSuffixes` is a *policy* extracted on `PATTERNS.md` §1's one-step
 * tier — the shared thing is a set, so the only thing a test over the old copies
 * could have asserted is that they still agreed. What is worth asserting instead
 * is the thing none of them could check: that the set matches what
 * `buildSheetScope` actually puts in the name table. A suffix offered by a picker
 * and registered by nothing is a promoted field that silently never writes; a
 * suffix registered and offered nowhere is a name no author can find.
 *
 * Driven over a synthetic `ScopeEntry` rather than a component, because the
 * claim is about the member and not about who sets it.
 */
describe('the suffixes an entry publishes', () => {
	/** The name table, over one component publishing `x` as this entry. */
	const scopeOf = (entry: ScopeEntry) =>
		buildSheetScope([
			publishedComponent({
				config: {
					id: 'x',
					type: 'card',
					label: 'X',
					position: { col: 1, row: 1, width: 1, height: 1 },
				},
				component: { scopeValues: () => ({ self: entry }) } as never,
				data: null,
				error: null,
			}),
		]);

	/** Every suffix the sheet actually answers to under `x`. */
	const registered = (entry: ScopeEntry): string[] => {
		const scope = scopeOf(entry);
		// A closed candidate list rather than the function's own answer, so this
		// cannot pass by agreeing with itself: `total` and `max` are plausible
		// suffixes nothing registers, and `.left` is the one that varies.
		return ['value', 'left', 'total', 'max'].filter(
			(suffix) => scope(`x.${suffix}`) !== undefined,
		);
	};

	it('is the stored value alone for an entry with no ceiling', () => {
		const entry: ScopeEntry = { value: 5 };
		expect(publishedSuffixes(entry)).toEqual(['value']);
		expect(registered(entry)).toEqual(['value']);
	});

	it('gains the remainder for an entry that sets one', () => {
		const entry: ScopeEntry = { value: 5, left: () => 3 };
		expect(publishedSuffixes(entry)).toEqual(['value', 'left']);
		expect(registered(entry)).toEqual(['value', 'left']);
	});

	it('offers no suffix the sheet does not register', () => {
		for (const entry of [{ value: 5 }, { value: 5, left: () => 3 }]) {
			expect(registered(entry as ScopeEntry)).toEqual([
				...publishedSuffixes(entry as ScopeEntry),
			]);
		}
	});
});
