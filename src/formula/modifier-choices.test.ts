import { describe, expect, it } from 'vitest';
import {
	CHOICE_REFUSES_ADD,
	CHOICE_REFUSES_AT_LEAST,
	ChoiceResult,
	foldChoice,
	storedChoiceFaults,
	choiceShapesOf,
} from './modifier-choices';
import {
	buildSheetEnv,
	publishedComponent,
	PublishedComponent,
	sheetModifierInput,
	sheetModifiers,
} from './sheet';
import { modifierTargetSource } from './modifier-targets';
import { card, CardConfig, CardData } from '../components/card';
import { cardSet } from '../components/card-set';
import { definitionView } from '../test/modifier-views';
import {
	ChoiceLine,
	ChoiceShape,
	ComponentConfig,
	ComponentDefinition,
	ModifierDefinitionView,
	ModifierPush,
} from '../types';

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

const SIZE: CardConfig = {
	id: 'size',
	type: 'card',
	label: 'Size',
	position: { col: 1, row: 1, width: 2, height: 1 },
	options: SIZES.map((value) => ({ value })),
	hideNote: true,
};

const ALIGNMENT: CardConfig = {
	id: 'alignment',
	type: 'card',
	label: 'Alignment',
	position: { col: 3, row: 1, width: 2, height: 1 },
	options: [
		'Lawful good',
		'Neutral good',
		'Chaotic good',
		'Lawful neutral',
		'Neutral',
		'Chaotic neutral',
		'Lawful evil',
		'Neutral evil',
		'Chaotic evil',
	].map((value) => ({ value })),
	hideNote: true,
};

/** A card with no options: a free-text card, which shows none to choose. */
const SPEED: CardConfig = {
	id: 'speed',
	type: 'card',
	label: 'Speed',
	position: { col: 5, row: 1, width: 2, height: 1 },
};

/** A Training dropdown valued with numbers, whose derived reads its slot (D1). */
const TRAINING: CardConfig = {
	id: 'training',
	type: 'card',
	label: 'Training',
	position: { col: 7, row: 1, width: 2, height: 1 },
	options: [
		{ value: '0', label: 'Untrained' },
		{ value: '1', label: 'Proficient' },
		{ value: '2', label: 'Expertise' },
	],
	derived: 'value * 2 + mod.self',
};

interface Placed {
	config: ComponentConfig;
	component: ComponentDefinition;
	data: unknown;
}

function pushesOf(parts: readonly string[]) {
	return (): readonly ModifierPush[] =>
		parts.map((part, at) => ({
			part,
			source: at === 1 ? 'Spells' : 'Wild Shape',
			row: { label: at === 1 ? 'Giant form' : 'Brown bear', values: {} },
		}));
}

/** A sheet of the placed components, with a row pushing each part. */
function sheetOf(
	parts: readonly string[],
	placed: readonly Placed[] = [
		{ config: SIZE, component: card, data: { value: 'Medium' } satisfies CardData },
		{ config: ALIGNMENT, component: card, data: { value: 'Neutral good' } },
		{ config: SPEED, component: card, data: { value: '30' } },
	],
	definitions: readonly ModifierDefinitionView[] = [],
) {
	const published: PublishedComponent[] = [
		...placed.map((one) => publishedComponent({ ...one, error: null })),
		{ id: 'forms', values: {}, modifiers: pushesOf(parts) },
	];
	const sources = [
		...placed.map((one) => modifierTargetSource(one.config, one.component)),
		{ id: 'forms', label: 'Forms', values: {} },
	];
	const input = sheetModifierInput(definitions, sources);
	const env = buildSheetEnv(published, undefined, input);
	return { env, modifiers: sheetModifiers(input, env), input };
}

const SHAPE: ChoiceShape = { label: 'Size', options: SIZES.map((value) => ({ value, label: value })) };

function lineOf(option: string, label: string, source = 'Forms'): ChoiceLine {
	return { label, source, option, suppressed: null };
}

describe('choiceTargets: what declares a choice (D2)', () => {
	it('declares a dropdown whose value is shown, and nothing else', () => {
		const { input } = sheetOf([]);
		expect(input.choices?.map((target) => [target.name, target.label])).toEqual([
			['size', 'Size'],
			['alignment', 'Alignment'],
		]);
		expect(input.choices?.[0]?.shape.options.map((option) => option.value)).toEqual(SIZES);
	});

	it('declares nothing for a hidden-value dropdown or a Card set', () => {
		const hidden: CardConfig = { ...SIZE, id: 'hidden', derived: '1', hideValue: true };
		const values = card.scopeValues?.({ value: 'Medium' }, hidden);
		expect(values?.self?.choice).toBeUndefined();
		const set = cardSet.scopeValues?.(null, {
			id: 'speedset',
			type: 'card-set',
			label: 'Speed',
			position: { col: 1, row: 1, width: 4, height: 1 },
			entries: [{ key: 'walk' }],
		} as never);
		expect(Object.values(set?.named ?? {}).every((entry) => entry.choice === undefined)).toBe(true);
	});
});

describe('the walk: a dropdown\'s option is a fifth reduction', () => {
	it('chooses an option: the bare name reads it and .value the stored one (D6)', () => {
		const { env, modifiers } = sheetOf(['size = option: Large']);
		expect(env.sheet('size')).toBe('Large');
		expect(env.sheet('size.value')).toBe('Medium');
		const account = modifiers.choice?.('size', 'Medium');
		expect(account?.drawn).toBe('Large');
		expect(account?.stored).toBe('Medium');
		expect(account?.lines.map((line) => [line.source, line.label, line.option, line.suppressed])).toEqual([
			['Wild Shape', 'Brown bear', 'Large', null],
		]);
	});

	it('answers null where nothing chooses, so no door is drawn', () => {
		const { env, modifiers } = sheetOf([]);
		expect(modifiers.choice?.('size', 'Medium')).toBeNull();
		expect(env.sheet('size')).toBe('Medium');
	});

	it('applies a Sets choosing what the note already holds', () => {
		const { modifiers } = sheetOf(['size = option: Medium']);
		const account = modifiers.choice?.('size', 'Medium');
		expect(account?.drawn).toBe('Medium');
		expect(account?.lines[0]?.suppressed).toBeNull();
	});

	it('reaches a choice through a layout definition carrying option', () => {
		const definitions = [definitionView({ name: 'Beast shape', target: 'size', operator: 'override', option: 'Huge' })];
		const { env } = sheetOf(['Beast shape'], undefined, definitions);
		expect(env.sheet('size')).toBe('Huge');
	});
});

describe('foldChoice: two Sets on one dropdown (D5)', () => {
	it('ties two Sets naming the same option, in the shipped tie wording', () => {
		const result: ChoiceResult = { shape: SHAPE, lines: [lineOf('Large', 'A'), lineOf('Large', 'B')] };
		const folded = foldChoice(result, 'Medium');
		expect(folded.drawn).toBe('Large');
		expect(folded.lines.map((line) => line.suppressed)).toEqual([
			null,
			'another override of the same value applies',
		]);
	});

	it('refuses two Sets naming different options, naming both sources', () => {
		const { env, modifiers } = sheetOf(['size = option: Large', 'size = option: Huge']);
		const account = modifiers.choice?.('size', 'Medium');
		expect(account?.error).toBe(
			'Size is set to Large by Wild Shape · Brown bear and to Huge by Spells · Giant form, so neither applies. Turn one of them off.',
		);
		expect(account?.drawn).toBe('Medium');
		expect(() => env.sheet('size')).toThrow(/neither applies/);
		expect(env.sheet('size.value')).toBe('Medium');
	});

	it('does not depend on walk order: only the sentence\'s order moves', () => {
		const lines = [lineOf('Large', 'A'), lineOf('Huge', 'B'), lineOf('Large', 'C')];
		const orders = [
			[0, 1, 2],
			[2, 1, 0],
			[1, 0, 2],
		];
		const outcomes = new Set<string>();
		for (const order of orders) {
			const folded = foldChoice({ shape: SHAPE, lines: order.map((at) => lines[at] as ChoiceLine) }, 'Small');
			outcomes.add(JSON.stringify([folded.drawn, folded.error !== null]));
		}
		expect([...outcomes]).toEqual([JSON.stringify(['Small', true])]);
		// And with every line agreeing, the drawn option is the same in any order.
		const agree = [lineOf('Large', 'A'), lineOf('Large', 'B')];
		expect(foldChoice({ shape: SHAPE, lines: agree }, 'Small').drawn).toBe(
			foldChoice({ shape: SHAPE, lines: [...agree].reverse() }, 'Small').drawn,
		);
	});
});

describe('the refusals', () => {
	it('refuses Adds to (D3), drawing the stored choice', () => {
		const { env, modifiers } = sheetOf(['size += option: Large']);
		expect(CHOICE_REFUSES_ADD).toBe('Adds to cannot choose an option. Choose Sets.');
		const account = modifiers.choice?.('size', 'Medium');
		expect(account?.error).toBe('Row "Brown bear": adds to cannot choose an option. Choose Sets.');
		expect(account?.drawn).toBe('Medium');
		expect(() => env.sheet('size')).toThrow(/adds to cannot choose an option/);
		expect(env.sheet('size.value')).toBe('Medium');
	});

	it('refuses At least (D3)', () => {
		const { modifiers } = sheetOf(['size >= option: Large']);
		expect(CHOICE_REFUSES_AT_LEAST).toBe('At least cannot choose an option. Choose Sets.');
		expect(modifiers.choice?.('size', 'Medium')?.error).toBe(
			'Row "Brown bear": at least cannot choose an option. Choose Sets.',
		);
	});

	it('refuses a literal that matches no option, on case alone (D4)', () => {
		const { env, modifiers } = sheetOf(['alignment = option: Chaotic Evil']);
		const account = modifiers.choice?.('alignment', 'Neutral good');
		expect(account?.error).toBe(
			'Row "Brown bear": "Chaotic Evil" is not an option of Alignment, so this row\'s own modifier chooses nothing. Choose Lawful good, Neutral good, Chaotic good, Lawful neutral, Neutral, Chaotic neutral, Lawful evil, Neutral evil or Chaotic evil.',
		);
		expect(account?.drawn).toBe('Neutral good');
		expect(() => env.sheet('alignment')).toThrow(/is not an option of Alignment/);
		expect(env.sheet('alignment.value')).toBe('Neutral good');
	});

	it('names a definition in the no-match sentence, and the row popup says the same', () => {
		const definitions = [definitionView({ name: 'Brown bear', target: 'size', operator: 'override', option: 'large' })];
		const { modifiers } = sheetOf(['Brown bear'], undefined, definitions);
		const sentence =
			'"large" is not an option of Size, so the modifier "Brown bear" chooses nothing. Choose Tiny, Small, Medium, Large, Huge or Gargantuan.';
		expect(modifiers.choice?.('size', 'Medium')?.error).toBe(`Row "Brown bear": ${sentence}`);
		const outcome = modifiers.outcomes('Brown bear', { label: 'Brown bear', values: {} }, 'Wild Shape')[0];
		expect(outcome?.applies).toBe(false);
		expect(outcome?.suppressed).toBe(sentence);
	});

	it('strays at a name that shows no options, and changes nothing there (D7)', () => {
		const { env, modifiers } = sheetOf(['speed = option: Fast']);
		expect(env.sheet('speed')).toBe(30);
		const outcome = modifiers.outcomes('speed = option: Fast', { label: 'Row', values: {} }, '')[0];
		expect(outcome?.applies).toBe(false);
		expect(outcome?.suppressed).toBe(
			'Speed shows no options, so this change has none to choose. Give it an amount instead.',
		);
	});

	it('strays at a hidden-value dropdown and at a Card set entry (D2, D7)', () => {
		const hidden: CardConfig = { ...SIZE, id: 'hidden', label: 'Hidden', derived: '1', hideValue: true };
		const placed: Placed[] = [
			{ config: hidden, component: card, data: { value: 'Medium' } },
			{
				config: {
					id: 'move',
					type: 'card-set',
					label: 'Speed',
					position: { col: 1, row: 2, width: 4, height: 1 },
					entries: [{ key: 'walk' }],
				} as ComponentConfig,
				component: cardSet,
				data: { values: { walk: '30' } },
			},
		];
		const { modifiers } = sheetOf(['hidden = option: Large', 'move.walk = option: Large'], placed);
		const at = (part: string) => modifiers.outcomes(part, { label: 'Row', values: {} }, '')[0]?.suppressed;
		expect(at('hidden = option: Large')).toBe(
			'Hidden shows no options, so this change has none to choose. Give it an amount instead.',
		);
		expect(at('move.walk = option: Large')).toMatch(/shows no options, so this change has none to choose/);
	});

	it('strays for a column on a dropdown (D7)', () => {
		const { modifiers } = sheetOf(['size = option: Large in Training']);
		expect(modifiers.choice?.('size', 'Medium')).toBeNull();
		expect(
			modifiers.outcomes('size = option: Large in Training', { label: 'Row', values: {} }, '')[0]?.suppressed,
		).toBe('Size is a dropdown, so this change needs no column. Clear it.');
	});

	it('reports the stored faults in the sheet\'s order, and an amount beside an option (D7)', () => {
		const { input } = sheetOf([]);
		const shapes = choiceShapesOf(input.choices ?? []);
		const label = (name: string) => (name === 'size' ? 'Size' : name === 'speed' ? 'Speed' : name);
		expect(storedChoiceFaults(shapes, { target: 'size', operator: 'override', option: 'Large', amount: '3' }, 'it', label)).toEqual([
			'This change has both an amount and an option, so the amount is ignored. Clear one.',
		]);
		expect(storedChoiceFaults(shapes, { target: 'speed', operator: 'override', option: 'Fast' }, 'it', label)).toEqual([
			'Speed shows no options, so this change has none to choose. Give it an amount instead.',
		]);
		expect(storedChoiceFaults(shapes, { target: 'size', operator: 'add', option: 'nope' }, 'it', label)).toEqual([
			CHOICE_REFUSES_ADD,
		]);
		expect(storedChoiceFaults(shapes, { target: 'size', operator: 'override', option: 'Large' }, 'it', label)).toEqual([]);
		expect(storedChoiceFaults(shapes, { target: 'size', amount: '1' }, 'it', label)).toBeNull();
	});
});

describe('D1: a change without option keeps its meaning on a dropdown', () => {
	const placed = (stored: string): Placed[] => [
		{ config: TRAINING, component: card, data: { value: stored } },
	];

	it('keeps the numeric account of an amount aimed at the card', () => {
		const { env, modifiers } = sheetOf(['training += 1'], placed('1'));
		expect(env.sheet('training')).toBe(3);
		expect(modifiers.breakdown('training').total).toBe(1);
		expect(modifiers.choice?.('training', '1')).toBeNull();
	});

	it('reads the chosen option in the derived, beside the slot', () => {
		const { env, modifiers } = sheetOf(['training += 1', 'training = option: 2'], placed('1'));
		expect(env.sheet('training')).toBe(5);
		expect(env.sheet('training.value')).toBe(1);
		expect(modifiers.breakdown('training').total).toBe(1);
	});

	it('leaves accepting, marked and the slot as the display route had them', () => {
		const viaCompute = sheetOf(['training += 1'], placed('1'));
		const hidden: CardConfig = { ...TRAINING, id: 'training', hideValue: true };
		const viaDisplay = sheetOf(
			['training += 1'],
			[{ config: hidden, component: card, data: { value: '1' } }],
		);
		expect(card.scopeValues?.({ value: '1' }, TRAINING)?.self?.compute).toBeDefined();
		expect(card.scopeValues?.({ value: '1' }, hidden)?.self?.display).toBeDefined();
		expect([...viaCompute.input.accepting]).toEqual([...viaDisplay.input.accepting]);
		expect([...viaCompute.input.marked]).toEqual([...viaDisplay.input.marked]);
		expect(viaCompute.env.modifiers('training')).toEqual(viaDisplay.env.modifiers('training'));
		expect(viaCompute.env.sheet('training')).toBe(viaDisplay.env.sheet('training'));
	});
});

describe('D14: the cycle case', () => {
	const NUMBERED: CardConfig = {
		...SIZE,
		options: SIZES.map((label, at) => ({ value: String(at), label })),
	};
	const placed: Placed[] = [{ config: NUMBERED, component: card, data: { value: '2' } }];
	const part = 'size = option: 3 when size >= 3';

	it('refuses a change whose condition reads the name it chooses, reached cold', () => {
		const { modifiers } = sheetOf([part], placed);
		expect(modifiers.choice?.('size', '2')?.error).toBe(
			'Row "Brown bear": a modifier\'s own condition or amount reads "size", which a modifier sets, and the modifiers on this sheet are still being worked out. Read the value as stored (size.value) instead.',
		);
	});

	it('refuses it reached warm, through the name table\'s guard, without recursing', () => {
		const { env, modifiers } = sheetOf([part], placed);
		expect(() => env.sheet('size')).toThrow(/^Row "Brown bear": /);
		const account = modifiers.choice?.('size', '2');
		expect(account?.error).toMatch(/^Row "Brown bear": /);
		expect(account?.drawn).toBe('2');
		expect(env.sheet('size.value')).toBe(2);
	});

	it('follows the fix: reading size.value chooses without a loop', () => {
		const { env } = sheetOf(['size = option: 3 when size.value >= 2'], placed);
		expect(env.sheet('size')).toBe(3);
	});
});
