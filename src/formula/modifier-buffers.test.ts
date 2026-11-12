import { describe, expect, it } from 'vitest';
import {
	activeGrantKeys,
	BUFFER_TAKES_AT_LEAST,
	BufferResult,
	drainBuffer,
	drainedEffective,
	foldBuffer,
	FoundGrant,
	grantKeyProblem,
	wholePoints,
} from './modifier-buffers';
import {
	buildSheetEnv,
	PublishedComponent,
	sheetModifierInput,
	sheetModifiers,
} from './sheet';
import { ModifierTargetSource } from './modifier-targets';
import { definitionView } from '../test/modifier-views';
import { ModifierDefinitionView, ModifierPush, ScopeValues } from '../types';

/** One grant as the walk hands it over, before the note's records are known. */
function grant(amount: number, label = 'A row', source = 'Gear'): FoundGrant {
	return { key: `${source} · ${label}`, label, source, amount, refused: null };
}

function lines(...found: FoundGrant[]): BufferResult {
	return { lines: found };
}

describe('foldBuffer: the highest of the stored points and each remainder', () => {
	it('draws a grant above the stored points, naming it in effect', () => {
		const account = foldBuffer('HP', '5', {}, lines(grant(10)));
		expect(account.effective).toBe(10);
		expect(account.stored).toBe(5);
		expect(account.inEffect?.label).toBe('A row');
		expect(account.grants[0]?.suppressed).toBeNull();
	});

	it('draws the stored points above a grant, the grant already higher', () => {
		const account = foldBuffer('HP', '12', {}, lines(grant(10)));
		expect(account.effective).toBe(12);
		expect(account.inEffect).toBeNull();
		expect(account.grants[0]?.suppressed).toBe('already higher');
	});

	it('passes over the lower of two grants', () => {
		const account = foldBuffer('HP', '0', {}, lines(grant(10, 'A'), grant(8, 'B')));
		expect(account.effective).toBe(10);
		expect(account.grants.map((line) => line.suppressed)).toEqual([null, 'a higher grant applies']);
	});

	it('names a tie, the first in walk order in effect', () => {
		const account = foldBuffer('HP', '0', {}, lines(grant(10, 'A'), grant(10, 'B')));
		expect(account.inEffect?.label).toBe('A');
		expect(account.grants[1]?.suppressed).toBe('another grant of the same value applies');
	});

	it('gives the stored points a tie with a grant', () => {
		const account = foldBuffer('HP', '10', {}, lines(grant(10)));
		expect(account.inEffect).toBeNull();
	});

	it('does not depend on walk order for the value it draws', () => {
		const found = [grant(4, 'A'), grant(9, 'B'), grant(9, 'C'), grant(2, 'D')];
		const spent = { 'Gear · B': '3', 'Gear · C': '1' };
		const drawn = new Set<number>();
		for (const order of [[0, 1, 2, 3], [3, 2, 1, 0], [2, 0, 3, 1], [1, 3, 0, 2]]) {
			drawn.add(foldBuffer('HP', '5', spent, lines(...order.map((at) => found[at] as FoundGrant))).effective);
		}
		expect([...drawn]).toEqual([8]);
	});

	it('reads a grant less what its record says was spent', () => {
		const account = foldBuffer('HP', '3', { 'Gear · A row': '4' }, lines(grant(10)));
		expect(account.grants[0]).toMatchObject({ amount: 10, spent: 4, left: 6 });
		expect(account.effective).toBe(6);
	});

	it('lists a record no grant claims as a leftover, folding it into nothing', () => {
		const account = foldBuffer('HP', '3', { 'Gear · Old ring': '4' }, lines(grant(5)));
		expect(account.leftovers).toEqual([{ key: 'Gear · Old ring', spent: 4 }]);
		expect(account.effective).toBe(5);
	});

	it('counts a refused stored buffer and a refused record as none', () => {
		expect(foldBuffer('HP', '2.5', {}, lines(grant(1))).stored).toBe(0);
		const account = foldBuffer('HP', '0', { 'Gear · A row': 'x' }, lines(grant(6)));
		expect(account.grants[0]?.spent).toBe(0);
		expect(account.effective).toBe(6);
	});

	it('draws the stored points under a refused buffer', () => {
		const account = foldBuffer('HP', '4', {}, { error: 'Row "Ring": nope.' });
		expect(account).toMatchObject({ effective: 4, error: 'Row "Ring": nope.', grants: [] });
	});
});

describe('the owner’s case: max minus damage, across every buffer', () => {
	it('drains stored 5 and a grant of 10 by a spend of 7, then by 4', () => {
		const first = foldBuffer('HP', '5', {}, lines(grant(10)));
		const absorbed = Math.min(first.effective, 7);
		expect(absorbed).toBe(7);
		const drained = drainBuffer(first, absorbed);
		expect(drained.stored).toBe(0);
		expect(drained.spent.get('Gear · A row')).toBe(7);
		expect(drainedEffective(first, absorbed)).toBe(3);

		// The next sheet, as the note now holds it: the pool lost nothing so far.
		const second = foldBuffer('HP', '0', { 'Gear · A row': '7' }, lines(grant(10)));
		expect(second.effective).toBe(3);
		const next = Math.min(second.effective, 4);
		expect(next).toBe(3);
		// One point past the buffer reaches the pool.
		expect(4 - next).toBe(1);
		expect(drainBuffer(second, next).spent.get('Gear · A row')).toBe(10);
		expect(drainedEffective(second, next)).toBe(0);
	});

	it('drains a passed-over grant by the same amount, so it cannot come back larger', () => {
		const account = foldBuffer('HP', '0', {}, lines(grant(10, 'A'), grant(5, 'B')));
		const drained = drainBuffer(account, 6);
		expect([...drained.spent]).toEqual([
			['Gear · A', 6],
			['Gear · B', 5],
		]);
	});
});

describe('the refusals, each in its exact sentence', () => {
	it('D2: an Adds to or a Sets at a buffer', () => {
		expect(BUFFER_TAKES_AT_LEAST).toBe(
			'Temporary points do not add up, so only the highest grant applies. Choose At least.',
		);
	});

	it('D5: a row label holding a colon', () => {
		expect(grantKeyProblem('Gear', 'Ring: of Vitality')).toBe(
			'"Ring: of Vitality" cannot grant temporary points, because the pool keeps what is spent under the row\'s name and a sheet block cannot hold a colon or a line break. Rename the row without one.',
		);
		expect(grantKeyProblem('Gear', 'Ring of Vitality')).toBeNull();
	});

	it('reads a record by the buffer’s own rule', () => {
		expect(wholePoints('4')).toBe(4);
		expect(wholePoints('')).toBe(0);
		expect(wholePoints('2.5')).toBeNull();
		expect(wholePoints('-1')).toBeNull();
		expect(wholePoints('x')).toBeNull();
	});
});

/*
 * Through a real sheet: a Pool's buffer as a component publishes it, and a
 * Table's rows pushing at it.
 */
function hpValues(temp: string | undefined, spent: Record<string, string> = {}): ScopeValues {
	return {
		self: { value: '22' },
		named: { temp: { value: temp, buffer: { label: 'HP', spent } } },
	};
}

function pushesOf(parts: readonly (string | [string, string])[], source = 'Gear') {
	return (): readonly ModifierPush[] =>
		parts.map((entry, at) => {
			const [part, label] = typeof entry === 'string' ? [entry, `Row ${at + 1}`] : entry;
			return { part, source, row: { label, values: { Worn: true } } };
		});
}

function sheetOf(
	parts: readonly (string | [string, string])[],
	temp: string | undefined = '0',
	spent: Record<string, string> = {},
	definitions: readonly ModifierDefinitionView[] = [],
	hasTemp = true,
	source = 'Gear',
) {
	const hp: ScopeValues = hasTemp ? hpValues(temp, spent) : { self: { value: '22' } };
	const published: PublishedComponent[] = [
		{ id: 'hp', values: hp },
		{ id: 'gear', values: {}, modifiers: pushesOf(parts, source) },
	];
	const sources: ModifierTargetSource[] = [
		{ id: 'hp', label: 'HP', values: hp },
		{ id: 'gear', label: 'Gear', values: {} },
	];
	const input = sheetModifierInput(definitions, sources);
	const env = buildSheetEnv(published, undefined, input);
	return { env, modifiers: sheetModifiers(input, env) };
}

/** The sentence an amount naming nothing refuses the buffer with, row named. */
const D11_SENTENCE = 'Row "Row 1": unknown name "nowhere".';

describe('the walk: a grant is a fourth reduction', () => {
	it('reads the effective buffer at the bare name and the stored one at .value', () => {
		const { env } = sheetOf(['hp.temp >= 10'], '3');
		expect(env.sheet('hp.temp')).toBe(10);
		expect(env.sheet('hp.temp.value')).toBe(3);
	});

	it('folds the note’s records at the bare name', () => {
		const { env } = sheetOf([['hp.temp >= 10', 'Ring']], '3', { 'Gear · Ring': '4' });
		expect(env.sheet('hp.temp')).toBe(6);
	});

	it('reads a buffer nothing grants at exactly as it was stored', () => {
		const { env, modifiers } = sheetOf([], '3');
		expect(env.sheet('hp.temp')).toBe(3);
		expect(modifiers.buffer?.('hp.temp', '3', {})).toBeNull();
	});

	it('treats a grant where the pool has no temporary points as a stray', () => {
		const { env, modifiers } = sheetOf(['hp.temp >= 10'], undefined, {}, [], false);
		expect(env.sheet('hp.temp')).toBeUndefined();
		expect(modifiers.buffers).toEqual([]);
		expect(env.sheet('hp')).toBe(22);
	});

	it('leaves mod.hp.temp and every slot’s breakdown as they were without the grant', () => {
		const granted = sheetOf(['hp.temp >= 10']);
		const bare = sheetOf([]);
		expect(granted.env.modifiers('hp.temp')).toEqual(bare.env.modifiers('hp.temp'));
		expect(granted.env.modifiers('hp')).toEqual(bare.env.modifiers('hp'));
		expect(granted.modifiers.breakdown('hp.temp')).toEqual(bare.modifiers.breakdown('hp.temp'));
		expect(granted.modifiers.breakdown('hp')).toEqual(bare.modifiers.breakdown('hp'));
	});

	it('lists every grant in walk order, with the stored points and the records', () => {
		const { modifiers } = sheetOf(
			[['hp.temp >= 10', 'Brown Bear'], ['hp.temp >= 5', 'Ring']],
			'5',
			{ 'Gear · Brown Bear': '3', 'Gear · Old ring': '4' },
		);
		const account = modifiers.buffer?.('hp.temp', '5', {
			'Gear · Brown Bear': '3',
			'Gear · Old ring': '4',
		});
		expect(account?.effective).toBe(7);
		expect(account?.grants.map((line) => [line.label, line.amount, line.left, line.suppressed])).toEqual([
			['Brown Bear', 10, 7, null],
			['Ring', 5, 5, 'a higher grant applies'],
		]);
		expect(account?.leftovers).toEqual([{ key: 'Gear · Old ring', spent: 4 }]);
	});

	it('refuses an Adds to and a Sets for that change alone, granting nothing (D2)', () => {
		const { env, modifiers } = sheetOf(['hp.temp += 10', 'hp.temp = 10', 'hp.temp >= 4'], '0');
		const account = modifiers.buffer?.('hp.temp', '0', {});
		expect(account?.grants.map((line) => line.suppressed)).toEqual([
			BUFFER_TAKES_AT_LEAST,
			BUFFER_TAKES_AT_LEAST,
			null,
		]);
		expect(env.sheet('hp.temp')).toBe(4);
	});

	it('refuses an amount of 2.5 for that grant, and grants a negative nothing (D4)', () => {
		const { env, modifiers } = sheetOf(['hp.temp >= 2.5', 'hp.temp >= -3'], '0');
		const account = modifiers.buffer?.('hp.temp', '0', {});
		expect(account?.grants[0]?.suppressed).toBe(
			'"2.5" is not a whole number of points, so this row\'s own modifier grants nothing. Give it a whole number, for example with floor().',
		);
		expect(account?.grants[1]?.amount).toBe(0);
		expect(account?.grants[1]?.refused).toBeUndefined();
		expect(env.sheet('hp.temp')).toBe(0);
	});

	it('refuses a grant from a row whose label cannot key a record (D5)', () => {
		const { env, modifiers } = sheetOf([['hp.temp >= 5', 'Ring: Vitality']], '1');
		const account = modifiers.buffer?.('hp.temp', '1', {});
		expect(account?.grants[0]?.suppressed).toBe(grantKeyProblem('Gear', 'Ring: Vitality'));
		expect(account?.grants[0]?.key).toBeNull();
		expect(env.sheet('hp.temp')).toBe(1);
	});

	it('refuses the buffer where an amount will not resolve, and .value still reads (D11)', () => {
		const { env, modifiers } = sheetOf(['hp.temp >= nowhere'], '3');
		const account = modifiers.buffer?.('hp.temp', '3', {});
		expect(account?.error).toBe(D11_SENTENCE);
		expect(account?.effective).toBe(3);
		expect(() => env.sheet('hp.temp')).toThrow(D11_SENTENCE);
		expect(env.sheet('hp.temp.value')).toBe(3);
	});

	it('words a grant on the row’s own popup', () => {
		const { modifiers } = sheetOf(['hp.temp >= 10', 'hp.temp >= 4']);
		const row = { label: 'Row 2', values: { Worn: true } };
		const [outcome] = modifiers.outcomes('hp.temp >= 4', row, 'Gear');
		expect(outcome).toMatchObject({ grant: true, amount: 4, applies: false, suppressed: 'a higher grant applies' });
		// And where the pool's own points beat it, it says so, as the door does.
		const beaten = sheetOf(['hp.temp >= 5'], '6').modifiers.outcomes('hp.temp >= 5', { label: 'Row 1', values: { Worn: true } }, 'Gear');
		expect(beaten[0]).toMatchObject({ applies: false, suppressed: 'already higher' });
		const [refused] = modifiers.outcomes('hp.temp += 4', row, 'Gear');
		expect(refused).toMatchObject({ applies: false, suppressed: BUFFER_TAKES_AT_LEAST });
	});
});

describe('D13: a grant reading the buffer it grants at', () => {
	it('is refused cold through the walk’s guard, and does not recurse', () => {
		const { modifiers } = sheetOf(['hp.temp >= 5 when hp.temp < 3'], '0');
		// Cold: the walk is entered from the account, before any name was read.
		const account = modifiers.buffer?.('hp.temp', '0', {});
		expect(account?.error).toBe(
			'Row "Row 1": a modifier\'s own condition or amount reads "hp.temp", which a grant raises, and the modifiers on this sheet are still being worked out. Read the value as stored (hp.temp.value) instead.',
		);
	});

	it('is refused warm through the name table’s guard with the row named', () => {
		const { env } = sheetOf(['hp.temp >= 5 when hp.temp < 3'], '0');
		// Warm: the bare name is entered first, so its own guard is what stops it.
		expect(() => env.sheet('hp.temp')).toThrow(/^Row "Row 1"/);
	});
});

describe('activeGrantKeys: what the view asks of the next sheet', () => {
	it('lists every grant listed at the buffer, passed over or not', () => {
		const { modifiers } = sheetOf([['hp.temp >= 10', 'Bear'], ['hp.temp >= 5', 'Ring']]);
		expect([...(activeGrantKeys(modifiers, 'hp.temp') ?? [])]).toEqual(['Gear · Bear', 'Gear · Ring']);
	});

	it('answers none where nothing grants, and null where the buffer is refused', () => {
		expect(activeGrantKeys(sheetOf([]).modifiers, 'hp.temp')?.size).toBe(0);
		expect(activeGrantKeys(sheetOf(['hp.temp >= nowhere']).modifiers, 'hp.temp')).toBeNull();
	});

	it('reads a named definition’s grant through the same walk', () => {
		const { modifiers } = sheetOf(
			[['Vitality', 'Ring']],
			'0',
			{},
			[definitionView({ name: 'Vitality', target: 'hp.temp', operator: 'upgrade', amount: '5' })],
		);
		expect(modifiers.buffer?.('hp.temp', '0', {})?.grants[0]).toMatchObject({ definition: 'Vitality', amount: 5 });
	});
});

/*
 * **The row's popup and the walk read one verdict** (`grantVerdict`), so over the
 * same pushes each part's popup outcome agrees with its line in the account:
 * refused with the same sentence, or applying exactly where the fold puts it in
 * effect among the grants.
 */
describe('the row’s popup and the walk agree on every grant', () => {
	const cases: {
		name: string;
		parts: [string, string][];
		spent?: Record<string, string>;
		source?: string;
		stored?: string;
	}[] = [
		{ name: 'a plain grant', parts: [['hp.temp >= 5', 'Ring']] },
		{ name: 'an Adds to and a Sets', parts: [['hp.temp += 5', 'Ring'], ['hp.temp = 5', 'Amulet']] },
		{ name: 'a fraction', parts: [['hp.temp >= 2.5', 'Ring']] },
		{ name: 'a colon in the row’s label', parts: [['hp.temp >= 5', 'Ring: Vitality']] },
		{ name: 'a colon in the component’s label', parts: [['hp.temp >= 5', 'Ring']], source: 'Gear: worn' },
		{
			// The design review's pinned state: the bear spent down to 1 left, the
			// ring whole, so the ring is in effect though its amount is lower.
			name: 'a larger grant spent below a smaller one',
			parts: [['hp.temp >= 10', 'Brown Bear'], ['hp.temp >= 5', 'Ring']],
			spent: { 'Gear · Brown Bear': '9' },
		},
		{ name: 'two equal grants', parts: [['hp.temp >= 5', 'Ring'], ['hp.temp >= 5', 'Amulet']] },
		{
			// The pool's own points beat every grant: `already higher` on both.
			name: 'own points above every grant',
			parts: [['hp.temp >= 5', 'Ring'], ['hp.temp >= 4', 'Amulet']],
			stored: '6',
		},
	];
	for (const { name, parts, spent = {}, source = 'Gear', stored = '0' } of cases) {
		it(name, () => {
			const { modifiers } = sheetOf(parts, stored, spent, [], true, source);
			const account = modifiers.buffer?.('hp.temp', stored, spent);
			parts.forEach(([part, label], at) => {
				const [outcome] = modifiers.outcomes(part, { label, values: { Worn: true } }, source);
				const line = account?.grants[at];
				expect(outcome?.applies).toBe(line?.suppressed === null);
				expect(outcome?.suppressed ?? null).toBe(line?.suppressed ?? null);
			});
		});
	}

	it('names the component, not the row, where the colon is in the component’s label', () => {
		expect(grantKeyProblem('Gear: worn', 'Ring')).toBe(
			'"Ring" cannot grant temporary points, because the pool keeps what is spent under "Gear: worn", and a sheet block cannot hold a colon or a line break. Rename that component without one in the layout editor.',
		);
	});

	it('puts the ring in effect when the bear is spent below it, on the row and at the door', () => {
		const spent = { 'Gear · Brown Bear': '9' };
		const { modifiers } = sheetOf([['hp.temp >= 10', 'Brown Bear'], ['hp.temp >= 5', 'Ring']], '0', spent);
		const [ring] = modifiers.outcomes('hp.temp >= 5', { label: 'Ring', values: { Worn: true } }, 'Gear');
		expect(ring).toMatchObject({ applies: true, suppressed: null, amount: 5 });
		const [bear] = modifiers.outcomes('hp.temp >= 10', { label: 'Brown Bear', values: { Worn: true } }, 'Gear');
		expect(bear?.suppressed).toBe('a higher grant applies');
		expect(modifiers.buffer?.('hp.temp', '0', spent)?.inEffect?.label).toBe('Ring');
	});
});
