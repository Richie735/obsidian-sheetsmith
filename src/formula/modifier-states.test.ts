import { describe, expect, it } from 'vitest';
import {
	addressOf,
	foldState,
	positionValue,
	refold,
	STATE_REFUSES_ADD,
	stateKey,
	statePosition,
	StateResult,
	stateReaderOf,
} from './modifier-states';
import { buildModifierTables } from './modifiers';
import {
	buildSheetEnv,
	PublishedComponent,
	sheetModifierInput,
	sheetModifiers,
} from './sheet';
import { ModifierTargetSource } from './modifier-targets';
import { definitionView } from '../test/modifier-views';
import {
	ModifierLine,
	ModifierOperator,
	ModifierPush,
	ScopeValues,
	StateShape,
} from '../types';

/** The 5e Training column: three named grades, from none upwards. */
const TRAINING: StateShape = {
	flag: false,
	positions: 3,
	words: ['Untrained', 'Proficient', 'Expertise'],
	label: 'Training',
};

/** A flag with no names of its own. */
const FLAG: StateShape = { flag: true, positions: 2, words: ['off', 'on'], label: 'Inspiration' };

/** One line as the walk hands it over, before the note is known. */
function line(operator: ModifierOperator, amount: number, label = 'A row'): ModifierLine {
	return { label, source: 'Forms', operator, type: null, amount, applies: 'result', suppressed: null };
}

function result(shape: StateShape, ...lines: ModifierLine[]): StateResult {
	return { shape, lines };
}

describe('foldState: Sets and At least on a three-level column', () => {
	it('raises a stored level below the push', () => {
		const folded = foldState(result(TRAINING, line('upgrade', 1)), 0);
		expect(folded.drawn).toBe(1);
		expect(folded.stored).toBe(0);
		expect(folded.lines[0]?.suppressed).toBeNull();
	});

	it('leaves a stored level above the push, naming the level it already is', () => {
		const folded = foldState(result(TRAINING, line('upgrade', 1)), 2);
		expect(folded.drawn).toBe(2);
		expect(folded.lines[0]?.suppressed).toBe('already Expertise');
	});

	it('leaves a stored level equal to the push, naming the level it already is', () => {
		const folded = foldState(result(TRAINING, line('upgrade', 1)), 1);
		expect(folded.drawn).toBe(1);
		expect(folded.lines[0]?.suppressed).toBe('already Proficient');
	});

	it('sets a level whatever the note stores, the highest Sets winning', () => {
		const folded = foldState(result(TRAINING, line('override', 0), line('override', 2)), 1);
		expect(folded.drawn).toBe(2);
		expect(folded.lines.map((one) => one.suppressed)).toEqual(['a higher override applies', null]);
	});

	it('gives on for two Sets of opposite values on a flag, because on beats off', () => {
		const folded = foldState(result(FLAG, line('override', 1), line('override', 0)), false);
		expect(folded.drawn).toBe(1);
		expect(positionValue(FLAG, folded.drawn)).toBe(true);
	});

	it('floors what the Sets came to, in §5\'s order', () => {
		const lowered = foldState(result(TRAINING, line('override', 0), line('upgrade', 1)), 2);
		expect(lowered.drawn).toBe(1);
		const floored = foldState(result(TRAINING, line('override', 2), line('upgrade', 1)), 0);
		expect(floored.drawn).toBe(2);
		expect(floored.lines[1]?.suppressed).toBe('already Expertise');
	});

	it('does not depend on the order the walk found the lines in', () => {
		const lines = [line('override', 1, 'A'), line('upgrade', 2, 'B'), line('override', 0, 'C'), line('upgrade', 1, 'D')];
		const drawn = new Set<number>();
		const verdicts = new Set<string>();
		const orders = [
			[0, 1, 2, 3],
			[3, 2, 1, 0],
			[1, 3, 0, 2],
			[2, 0, 3, 1],
		];
		for (const order of orders) {
			const folded = foldState(result(TRAINING, ...order.map((at) => lines[at] as ModifierLine)), 0);
			drawn.add(folded.drawn);
			verdicts.add(
				JSON.stringify(
					[...folded.lines].sort((a, b) => a.label.localeCompare(b.label)).map((one) => one.suppressed),
				),
			);
		}
		expect([...drawn]).toEqual([2]);
		expect(verdicts.size).toBe(1);
	});

	it('refolds against a new stored level, as a press moves the note', () => {
		const account = foldState(result(TRAINING, line('upgrade', 1)), 0);
		expect(refold(account, 2).drawn).toBe(2);
		expect(refold(account, 2).lines[0]?.suppressed).toBe('already Expertise');
		expect(refold(account, 0).drawn).toBe(1);
	});
});

describe('statePosition: the refusals (D6)', () => {
	const called = 'the modifier "Cat Form"';

	it('refuses Adds to on a column', () => {
		expect(statePosition(TRAINING, 'add', 1, called)).toEqual({ reason: STATE_REFUSES_ADD });
		expect(STATE_REFUSES_ADD).toBe(
			'Adds to cannot change a level or a flag. Choose Sets or At least.',
		);
	});

	it('refuses a level amount of 3 off a three-level list', () => {
		expect(statePosition(TRAINING, 'upgrade', 3, called)).toEqual({
			reason:
				'"3" is not a level of Training, so the modifier "Cat Form" has no amount. Give it a level from 0 (Untrained) to 2 (Expertise).',
		});
	});

	it('refuses a level amount of 1.5, which is off the list', () => {
		expect(statePosition(TRAINING, 'upgrade', 1.5, called)).toEqual({
			reason:
				'"1.5" is not a level of Training, so the modifier "Cat Form" has no amount. Give it a level from 0 (Untrained) to 2 (Expertise).',
		});
	});

	it('refuses a level amount of true, which is off the list', () => {
		expect(statePosition(TRAINING, 'override', true, called)).toEqual({
			reason:
				'"true" is not a level of Training, so the modifier "Cat Form" has no amount. Give it a level from 0 (Untrained) to 2 (Expertise).',
		});
	});

	it('names an unnamed level by its numbers', () => {
		const rating: StateShape = { flag: false, positions: 5, words: [], label: 'Rating' };
		expect(statePosition(rating, 'override', 7, "this row's own modifier")).toEqual({
			reason: `"7" is not a level of Rating, so this row's own modifier has no amount. Give it a level from 0 to 4.`,
		});
	});

	it('refuses a flag amount of 2', () => {
		expect(statePosition(FLAG, 'override', 2, called)).toEqual({
			reason: '"2" is not true or false, so the modifier "Cat Form" has no amount. Give it true or false.',
		});
	});

	it('reads a flag amount of 1 as on and 0 as off, the same as true and false', () => {
		expect(statePosition(FLAG, 'override', 1, called)).toEqual({ position: 1 });
		expect(statePosition(FLAG, 'override', 0, called)).toEqual({ position: 0 });
		expect(statePosition(FLAG, 'override', true, called)).toEqual({ position: 1 });
		expect(statePosition(FLAG, 'override', false, called)).toEqual({ position: 0 });
	});
});

describe('addressOf: a stray column (D5)', () => {
	const shapes = new Map([
		[stateKey('abilities.stealth', 'Training'), TRAINING],
		[stateKey('skills.stealth', null), { ...TRAINING, column: 'Training' }],
	]);
	const label = (name: string) => (name === 'abilities.stealth' ? 'Abilities · stealth' : 'Skills · stealth');

	it('says a target holds no such column, as written', () => {
		expect(addressOf(shapes, 'abilities.stealth', 'Trainig', label)).toEqual({
			kind: 'stray',
			reason: 'Abilities · stealth has no level or flag called "Trainig".',
		});
	});

	it('says a column naming the state the target already is needs none', () => {
		expect(addressOf(shapes, 'skills.stealth', 'Training', label)).toEqual({
			kind: 'stray',
			reason: 'Skills · stealth already is "Training", so this change needs no column. Clear it.',
		});
		expect(addressOf(shapes, 'skills.stealth', null, label).kind).toBe('state');
	});
});

/*
 * The walk, through the sheet's own environment: a row whose level is a state,
 * a flag whose own value is one, and a gear table pushing at both.
 */
const SKILLS: ScopeValues = {
	named: {
		stealth: {
			compute: (resolve, state) => {
				const training = state?.('skills.stealth', 'Training', 0) ?? 0;
				return 3 + Number(training) * 2;
			},
			states: { Training: TRAINING },
		},
	},
};

/** A component publishing one flag, stored off. */
const INSPIRATION: ScopeValues = { self: { value: false, state: FLAG } };

function pushesOf(parts: readonly string[], values: Record<string, string | number | boolean> = {}) {
	return (): readonly ModifierPush[] =>
		parts.map((part, at) => ({ part, source: 'Gear', row: { label: `Row ${at + 1}`, values } }));
}

function sheetOf(parts: readonly string[], definitions = [definitionView({ name: 'Cat Form', target: 'skills.stealth', column: 'Training', operator: 'upgrade', amount: '1' })]) {
	const published: PublishedComponent[] = [
		{ id: 'skills', values: SKILLS },
		{ id: 'inspiration', values: INSPIRATION },
		{ id: 'gear', values: {}, modifiers: pushesOf(parts) },
	];
	const sources: ModifierTargetSource[] = [
		{ id: 'skills', label: 'Skills', values: SKILLS },
		{ id: 'inspiration', label: 'Inspiration', values: INSPIRATION },
		{ id: 'gear', label: 'Gear', values: {} },
	];
	const input = sheetModifierInput(definitions, sources);
	const env = buildSheetEnv(published, undefined, input);
	return { env, modifiers: sheetModifiers(input, env) };
}

describe('the walk: a state push is a third reduction', () => {
	it('reads the modified level on the row and the modified flag at its bare name (D4)', () => {
		const { env } = sheetOf(['Cat Form', 'inspiration = true']);
		expect(env.sheet('skills.stealth')).toBe(5);
		expect(env.sheet('inspiration')).toBe(true);
		expect(env.sheet('inspiration.value')).toBe(false);
	});

	it('leaves mod.<target> and the number\'s breakdown as they were without the push', () => {
		const pushed = sheetOf(['Cat Form']);
		const bare = sheetOf([]);
		expect(pushed.env.modifiers('skills.stealth')).toEqual(bare.env.modifiers('skills.stealth'));
		expect(pushed.modifiers.breakdown('skills.stealth')).toEqual(
			bare.modifiers.breakdown('skills.stealth'),
		);
	});

	it('lists the line at the address, with its verdict against the note', () => {
		const { modifiers } = sheetOf(['Cat Form']);
		const account = modifiers.state?.('skills.stealth', 'Training', 0);
		expect(account?.drawn).toBe(1);
		expect(account?.lines.map((one) => [one.label, one.definition, one.operator, one.amount])).toEqual([
			['Row 1', 'Cat Form', 'upgrade', 1],
		]);
		expect(modifiers.state?.('skills.stealth', 'Training', 2)?.lines[0]?.suppressed).toBe(
			'already Expertise',
		);
	});

	it('answers null where nothing addresses a declared state, so no door is drawn', () => {
		const { modifiers } = sheetOf([]);
		expect(modifiers.state?.('skills.stealth', 'Training', 0)).toBeNull();
		expect(modifiers.state?.('inspiration', null, false)).toBeNull();
	});

	it('refuses an Adds to at a column, and draws the stored state with the sentence (D7)', () => {
		const { env, modifiers } = sheetOf(['skills.stealth += 1 in Training']);
		const account = modifiers.state?.('skills.stealth', 'Training', 0);
		expect(account?.error).toBe(
			'Row "Row 1": adds to cannot change a level or a flag. Choose Sets or At least.',
		);
		expect(account?.drawn).toBe(0);
		// A formula reading the modified state fails with the same sentence.
		expect(() => env.sheet('skills.stealth')).toThrow(/adds to cannot change a level or a flag/);
	});

	it('keeps "is not a number" byte for byte for a boolean at a number', () => {
		const published: PublishedComponent[] = [
			{ id: 'ac', values: { self: { display: { field: 'derived', scope: {} } } } },
			{ id: 'gear', values: {}, modifiers: pushesOf(['Plate']) },
		];
		const definitions = [definitionView({ name: 'Plate', target: 'ac', operator: 'override', amount: 'true' })];
		const { slots } = buildModifierTables(
			published.map((one) => ({ id: one.id, pushes: one.modifiers === undefined ? undefined : () => one.modifiers?.(() => null) ?? [] })),
			definitions,
		);
		expect(slots('ac')).toEqual({
			error: 'Row "Row 1": "true" is not a number, so the modifier "Plate" has no amount.',
		});
	});

	it('refuses a flag amount that is not a boolean, at the row', () => {
		const { modifiers } = sheetOf(['inspiration = 2']);
		expect(modifiers.state?.('inspiration', null, false)?.error).toBe(
			'Row "Row 1": "2" is not true or false, so this row\'s own modifier has no amount. Give it true or false.',
		);
	});

	it('changes nothing for a column the target does not hold, and says so at the row', () => {
		const { modifiers } = sheetOf(['skills.stealth >= 1 in Trainig']);
		expect(modifiers.state?.('skills.stealth', 'Training', 0)).toBeNull();
		const outcome = modifiers.outcomes('skills.stealth >= 1 in Trainig', { label: 'Row 1', values: {} }, '')[0];
		expect(outcome?.applies).toBe(false);
		expect(outcome?.suppressed).toBe('Skills · stealth has no level or flag called "Trainig".');
	});

	it('says what a state change does in its position words', () => {
		const { modifiers } = sheetOf(['Cat Form']);
		const outcome = modifiers.outcomes('Cat Form', { label: 'Row 1', values: {} }, '')[0];
		expect(outcome?.applies).toBe(true);
		expect(outcome?.targetLabel).toBe('Skills · stealth · Training');
		expect(outcome?.state).toEqual(TRAINING);
	});

	it('names a flag already on as on', () => {
		const folded = foldState(result(FLAG, line('upgrade', 1)), true);
		expect(folded.lines[0]?.suppressed).toBe('already on');
	});

	it('reads the state through a reader that returns the stored value where nothing addresses it', () => {
		const reader = stateReaderOf(() => ({ shape: TRAINING, lines: [] }));
		expect(reader('skills.stealth', 'Training', 2)).toBe(2);
		expect(stateReaderOf(() => null)('x', null, 'kept')).toBe('kept');
	});
});

describe('the cycle case', () => {
	it('refuses a flag whose condition reads it, reached cold through the walk\'s guard', () => {
		const { modifiers } = sheetOf(['inspiration = true when !inspiration']);
		const account = modifiers.state?.('inspiration', null, false);
		expect(account?.error).toBe(
			'Row "Row 1": a modifier\'s own condition or amount reads "inspiration", which a modifier sets, and the modifiers on this sheet are still being worked out. Read the value as stored (inspiration.value) instead.',
		);
	});

	it('refuses a column whose change reads its own row, reached cold, in the column\'s words', () => {
		const part = 'skills.stealth = 1 in Training when skills.stealth > 0';
		const { modifiers } = sheetOf([part]);
		expect(modifiers.state?.('skills.stealth', 'Training', 0)?.error).toBe(
			'Row "Row 1": a modifier\'s own condition or amount reads Training on "skills.stealth", which a modifier sets, and the modifiers on this sheet are still being worked out. Read a value no modifier sets instead.',
		);
	});

	it('refuses the same flag reached warm, through the name table\'s guard, without recursing', () => {
		const { env, modifiers } = sheetOf(['inspiration = true when !inspiration']);
		// The name first: its thunk is in flight when the walk reads it back, so
		// the name table's guard answers and the enrolment is unreadable.
		expect(() => env.sheet('inspiration')).toThrow('Row "Row 1": unknown name "inspiration".');
		const account = modifiers.state?.('inspiration', null, false);
		expect(account?.error).toMatch(/^Row "Row 1": /);
		expect(account?.drawn).toBe(0);
		expect(env.sheet('inspiration.value')).toBe(false);
	});

	it('refuses the aggregate version through the row table\'s guard', () => {
		const rows: PublishedComponent = {
			id: 'skills',
			values: SKILLS,
			rows: (_resolve, state) => [
				{ label: 'Stealth', values: { Training: state?.('skills.stealth', 'Training', 0) ?? 0 } },
			],
		};
		const sources: ModifierTargetSource[] = [{ id: 'skills', label: 'Skills', values: SKILLS }];
		const definitions = [
			definitionView({
				name: 'Echo',
				target: 'skills.stealth',
				column: 'Training',
				operator: 'override',
				amount: 'count(skills, Training > 0)',
			}),
		];
		const input = sheetModifierInput(definitions, sources);
		const env = buildSheetEnv([rows, { id: 'gear', values: {}, modifiers: pushesOf(['Echo']) }], undefined, input);
		const modifiers = sheetModifiers(input, env);
		const account = modifiers.state?.('skills.stealth', 'Training', 0);
		// The row table's own cycle sentence, in the column's words: the walk
		// reached the column back through the rows it was still building.
		expect(account?.error).toBe(
			'Row "Row 1": a modifier\'s own condition or amount reads Training on "skills.stealth", which a modifier sets, and the modifiers on this sheet are still being worked out. Read a value no modifier sets instead.',
		);
	});
});

describe('one verdict for the walk and the row (stateVerdict)', () => {
	it('gives the row\'s popup the sentence the walk refuses the state with, case by case', () => {
		const parts = [
			'skills.stealth += 1 in Training',
			'skills.stealth = 3 in Training',
			'skills.stealth = true in Training',
			'inspiration = 2',
		];
		for (const part of parts) {
			const { modifiers } = sheetOf([part]);
			const outcome = modifiers.outcomes(part, { label: 'Row 1', values: {} }, '')[0];
			const name = part.startsWith('inspiration') ? 'inspiration' : 'skills.stealth';
			const column = name === 'inspiration' ? null : 'Training';
			const account = modifiers.state?.(name, column, 0);
			expect(outcome?.applies, part).toBe(false);
			expect(account?.error, part).toBe(`Row "Row 1": ${(outcome?.suppressed ?? '').charAt(0).toLowerCase()}${(outcome?.suppressed ?? '').slice(1)}`);
		}
	});

	it('changes nothing and refuses nothing for a stray, in both readers', () => {
		const { modifiers } = sheetOf(['skills.stealth = 1 in Rank']);
		expect(modifiers.state?.('skills.stealth', 'Training', 0)).toBeNull();
		expect(modifiers.outcomes('skills.stealth = 1 in Rank', { label: 'Row 1', values: {} }, '')[0]?.suppressed).toBe(
			'Skills · stealth has no level or flag called "Rank".',
		);
	});
});

describe('the row popup judges a state change against its own kind only', () => {
	it('calls an At least applying whatever the note stores, and a lower Sets beaten by a higher one', () => {
		const { modifiers } = sheetOf(['skills.stealth >= 1 in Training', 'skills.stealth = 0 in Training', 'skills.stealth = 2 in Training']);
		const at = (part: string) => modifiers.outcomes(part, { label: 'Row', values: {} }, '')[0];
		// The row is not the state's, so the note is unknown here: no "already".
		expect(at('skills.stealth >= 1 in Training')?.applies).toBe(true);
		expect(at('skills.stealth = 0 in Training')?.suppressed).toBe('a higher override applies');
		expect(at('skills.stealth = 2 in Training')?.applies).toBe(true);
	});
});
