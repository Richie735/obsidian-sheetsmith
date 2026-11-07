// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { getComponent } from '../components';
import { parseFunctions } from '../formula/functions';
import { formulaContext } from '../formula/resolve';
import { buildSheet } from '../formula/sheet';
import { applySectionWrites, getSection, parseCharacter } from '../parse/character';
import { parseLayout } from '../parse/layout';
import { isContainer } from '../types';
import { renderGrid, walkLayout } from './grid-cells';
import {
	applyDecorations,
	IN_PLAY_BOX,
	IN_PLAY_MARK_INLINE,
	IN_PLAY_MARK,
	IN_PLAY_MARK_SEVERAL,
	IN_PLAY_PLACEMENT,
	inPlayDecorations,
} from './placement-decorations';
import { modifierBreakdown } from '../components/modifier-breakdown';

/*
 * The form tint, through the view's own sheet assembly (`buildSheet`, `renderGrid`)
 * and the real parsers, so what is asserted is what a sheet draws
 * (`docs/features/character-forms.md`, "The tint").
 */

const LAYOUT = {
	name: 'Forms fixture',
	columns: 12,
	functions: ['mod(score) = floor((score - 10) / 2)'],
	components: [
		{
			id: 'abilities',
			type: 'card-set',
			label: 'Abilities',
			position: { col: 1, row: 1, width: 12, height: 1 },
			entries: [
				{ key: 'STR' },
				{ key: 'DEX' },
				{ key: 'CON' },
				{ key: 'INT' },
				{ key: 'WIS' },
				{ key: 'CHA' },
			],
			derived: 'mod(value + mod.self)',
		},
		{
			id: 'perception',
			type: 'card',
			label: 'Perception',
			position: { col: 1, row: 2, width: 3, height: 1 },
			derived: '6 + mod.self',
		},
		{
			id: 'initiative',
			type: 'card',
			label: 'Initiative',
			position: { col: 4, row: 2, width: 3, height: 1 },
			derived: 'abilities.DEX + mod.self',
		},
		{
			id: 'items',
			type: 'table',
			label: 'Items',
			position: { col: 7, row: 2, width: 6, height: 2 },
			rowHeader: 'Item',
			openRows: true,
			columns: [{ key: 'Modifiers', type: 'modifier' }],
		},
		{
			id: 'skills',
			type: 'table',
			label: 'Skills',
			position: { col: 1, row: 8, width: 6, height: 2 },
			rowHeader: 'Skill',
			columns: [{ key: 'Bonus', type: 'computed', formula: 'ability + mod.self', publish: true }],
			rows: [
				{ label: 'Athletics', key: 'athletics', values: { ability: 'abilities.STR' } },
				{ label: 'Stealth', key: 'stealth', values: { ability: 'abilities.DEX' } },
			],
		},
		{
			id: 'forms',
			type: 'stat-block',
			label: 'Wild Shape',
			position: { col: 1, row: 4, width: 12, height: 4 },
			recordName: 'Form',
			fields: [
				{ key: 'Active', type: 'toggle' },
				{ key: 'Modifiers', type: 'modifier' },
			],
			exclusive: 'Active',
		},
	],
};

const NOTE = (bear: 'yes' | 'no', wolf: 'yes' | 'no' = 'no') => `---
sheet-layout: Forms fixture
---

## Abilities
\`\`\`sheet
STR: 10
DEX: 14
CON: 13
INT: 12
WIS: 16
CHA: 8
\`\`\`

## Skills

| Skill | Bonus |
| --- | --- |
| Athletics | |
| Stealth | |

## Items

| Item | Modifiers |
| --- | --- |
| Ring | initiative += 1 |

## Wild Shape

### Brown Bear
\`\`\`sheet
Active: ${bear}
Modifiers: abilities.STR = 4; abilities.CON = 3; perception >= 3; skills.stealth >= 5
\`\`\`

### Wolf
\`\`\`sheet
Active: ${wolf}
Modifiers: abilities.DEX = 2
\`\`\`
`;

/** The fixture with Wild Shape tinting in `tint`, each form choosing its own. */
const TINTED = {
	...LAYOUT,
	components: LAYOUT.components.map((component) =>
		component.id === 'forms' ? { ...component, tint: 'green', tintPerRecord: true } : component,
	),
};

/** Draw the whole sheet, tint included, and keep the note the view would write. */
function draw(source: string, fixture: object = LAYOUT) {
	const layout = parseLayout(JSON.stringify(fixture));
	const note = parseCharacter(source);
	const walk = walkLayout(layout.components);
	const prepared = walk.map(({ config }) => {
		const component = getComponent(config.type);
		if (component === undefined) throw new Error(config.type);
		const section = isContainer(component) ? undefined : getSection(note, config.label);
		const result = section ? component.read(section.body, config) : null;
		return {
			config,
			component,
			error: result && !result.ok ? result.error : null,
			data: result?.ok === true ? result.data : null,
		};
	});
	const { env, modifiers, marked } = buildSheet(
		layout,
		prepared,
		parseFunctions(layout.functions).library,
	);
	const root = document.createElement('div');
	root.className = 'sheetsmith-view';
	document.body.appendChild(root);
	let written = source;
	renderGrid(root, walk, prepared, ({ config, component, data }) => ({
		...formulaContext(component, config, data, env),
		modifiers,
		onChange: (edited: unknown) => {
			written = applySectionWrites(written, [
				{
					label: config.label,
					write: (body: string | null) => component.write(edited, body, config),
				},
			]).text;
		},
	}));
	const decorations = inPlayDecorations(marked, (name) => modifiers.breakdown(name));
	applyDecorations(root, decorations);
	return { root, decorations, modifiers, written: () => written };
}

const cellOf = (root: HTMLElement, id: string) =>
	root.querySelector<HTMLElement>(`[data-sheetsmith-component="${id}"]`) as HTMLElement;

afterEach(() => document.body.replaceChildren());

describe('the in-play tint', () => {
	it('tints each card a form changed, and no other card in the set', () => {
		const { root } = draw(NOTE('yes'));
		const cards = Array.from(cellOf(root, 'abilities').querySelectorAll<HTMLElement>('.sheetsmith-card'));
		expect(cards).toHaveLength(6);
		// STR and CON changed; DEX, INT, WIS and CHA did not.
		expect(cards.map((card) => card.classList.contains(IN_PLAY_BOX))).toEqual([
			true,
			false,
			true,
			false,
			false,
			false,
		]);
		// The number itself is not the box: it keeps the underline alone.
		const strength = root.querySelector('[data-sheetsmith-name="abilities.STR"]');
		expect(strength?.classList.contains(IN_PLAY_BOX)).toBe(false);
		expect(cellOf(root, 'abilities').classList.contains(IN_PLAY_PLACEMENT)).toBe(false);
	});

	it('tints the table row a form changed, with the pill after its name', () => {
		const { root } = draw(NOTE('yes'));
		const rows = Array.from(cellOf(root, 'skills').querySelectorAll<HTMLElement>('tbody tr'));
		// Stealth's floor of 5 raises DEX's 2; Athletics moves through the new
		// Strength and was pushed at by nothing, so it stays untinted.
		expect(rows.map((row) => row.classList.contains(IN_PLAY_BOX))).toEqual([false, true]);
		const pill = rows[1]?.querySelector(`th[scope="row"] .${IN_PLAY_MARK_INLINE}`);
		expect(pill?.textContent).toBe('Brown Bear');
	});

	it('puts the pill on the first tinted card, never on one the form left alone', () => {
		const { root } = draw(NOTE('yes'));
		const cards = Array.from(cellOf(root, 'abilities').querySelectorAll<HTMLElement>('.sheetsmith-card'));
		expect(cards[0]?.querySelector(`.${IN_PLAY_MARK}[aria-hidden="true"]`)).not.toBeNull();
		for (const card of cards.slice(1)) {
			expect(card.querySelector(`.${IN_PLAY_MARK}[aria-hidden="true"]`)).toBeNull();
		}
	});

	it('draws the pill once per placement, naming the form', () => {
		const { root } = draw(NOTE('yes'));
		const pills = cellOf(root, 'abilities').querySelectorAll(`.${IN_PLAY_MARK}[aria-hidden="true"]`);
		expect(pills).toHaveLength(1);
		expect(pills[0]?.textContent).toBe('Brown Bear');
		expect(cellOf(root, 'abilities').textContent).toContain('Changed by Brown Bear');
	});

	it('names both forms where two are on', () => {
		const { root } = draw(NOTE('yes', 'yes'));
		const pill = cellOf(root, 'abilities').querySelector(`.${IN_PLAY_MARK}[aria-hidden="true"]`);
		expect(pill?.textContent).toBe('Brown Bear, Wolf');
	});

	it('tints nothing where an at least did not raise its number', () => {
		const { root, modifiers } = draw(NOTE('yes'));
		expect(cellOf(root, 'perception').querySelector(`.${IN_PLAY_BOX}`)).toBeNull();
		expect(cellOf(root, 'perception').querySelector(`.${IN_PLAY_MARK}`)).toBeNull();
		// Nor the modified mark: the number did not move.
		expect(cellOf(root, 'perception').querySelector('.sheetsmith-modified')).toBeNull();
		// And the breakdown says why, from the same fact.
		expect(modifierBreakdown(modifiers.breakdown('perception'), 6)).toContain(
			'Brown Bear — at least +3 (not applied: already higher)',
		);
	});

	it('leaves an ordinary modifier the underline alone', () => {
		const { root } = draw(NOTE('yes'));
		const initiative = cellOf(root, 'initiative');
		expect(initiative.querySelector('.sheetsmith-modified')).not.toBeNull();
		expect(initiative.querySelector(`.${IN_PLAY_BOX}`)).toBeNull();
		expect(initiative.querySelector(`.${IN_PLAY_MARK}`)).toBeNull();
		expect(initiative.classList.contains(IN_PLAY_PLACEMENT)).toBe(false);
	});

	it('draws the underline on the number and the fill and outline on its card', () => {
		const { root } = draw(NOTE('yes'));
		const strength = root.querySelector<HTMLElement>('[data-sheetsmith-name="abilities.STR"]');
		expect(strength?.classList.contains('sheetsmith-modified')).toBe(true);
		expect(strength?.closest('.sheetsmith-card')?.classList.contains(IN_PLAY_BOX)).toBe(true);
		expect(cellOf(root, 'abilities').querySelector(`.${IN_PLAY_MARK}`)).not.toBeNull();
	});

	it('tints nothing with no form on', () => {
		const { root, decorations } = draw(NOTE('no'));
		expect(decorations).toEqual([]);
		expect(root.querySelector(`.${IN_PLAY_BOX}`)).toBeNull();
	});

	it('agrees with the breakdown about whether an at least raised a number', () => {
		const { decorations, modifiers } = draw(NOTE('yes'));
		for (const name of ['perception', 'abilities.STR']) {
			const applying = modifiers
				.breakdown(name)
				.lines.some((line) => line.inPlay === true && line.suppressed === null);
			const tinted = decorations.some((one) => one.names.includes(name));
			expect(tinted, name).toBe(applying);
		}
	});
});

describe('where a decoration lands without a stamped host', () => {
	it('tints the placement where the component stamped nothing', () => {
		const root = document.createElement('div');
		const cell = root.createDiv('sheetsmith-cell');
		cell.setAttribute('data-sheetsmith-component', 'hp');
		cell.createDiv('sheetsmith-pool');
		applyDecorations(root, [{ kind: 'in-play', label: 'Brown Bear', tint: 'accent', names: ['hp.max'] }]);
		expect(cell.classList.contains(IN_PLAY_PLACEMENT)).toBe(true);
		expect(cell.firstElementChild?.classList.contains(IN_PLAY_BOX)).toBe(true);
		expect(cell.querySelector(`.${IN_PLAY_MARK}`)?.textContent).toBe('Brown Bear');
		// And a second pass clears the first.
		applyDecorations(root, []);
		expect(cell.classList.contains(IN_PLAY_PLACEMENT)).toBe(false);
		expect(cell.querySelector(`.${IN_PLAY_MARK}`)).toBeNull();
	});
});

describe('a value typed while in form', () => {
	it('lands on the base: the note holds 12 and the derived still reads the form', () => {
		const sheet = draw(NOTE('yes'));
		const pill = sheet.root.querySelector<HTMLInputElement>(
			'[data-sheetsmith-component="abilities"] input',
		) as HTMLInputElement;
		pill.focus();
		pill.value = '12';
		pill.dispatchEvent(new Event('input'));
		pill.blur();
		const after = sheet.written();
		expect(after).toContain('STR: 12');
		document.body.replaceChildren();
		const again = draw(after);
		const strength = again.root.querySelector('[data-sheetsmith-name="abilities.STR"]');
		expect(strength?.textContent).toContain('+4');
		const field = again.root.querySelector<HTMLInputElement>(
			'[data-sheetsmith-component="abilities"] input',
		);
		expect(field?.value).toBe('12');
		document.body.replaceChildren();
		const reverted = draw(after.replace('Active: yes', 'Active: no'));
		const card = reverted.root.querySelector('[data-sheetsmith-component="abilities"] .sheetsmith-card-derived');
		expect(card?.textContent).toContain('+1');
	});
});

describe('the colour a form tints in', () => {
	/** Brown Bear choosing orange in a green block; Wolf taking the block's green. */
	const tinted = (bear: 'yes' | 'no', wolf: 'yes' | 'no' = 'no') =>
		NOTE(bear, wolf).replace(
			'Modifiers: abilities.STR = 4; abilities.CON = 3; perception >= 3; skills.stealth >= 5\n',
			'Modifiers: abilities.STR = 4; abilities.CON = 3; perception >= 3; skills.stealth >= 5\nTint: orange\n',
		);
	const tintOf = (el: Element | null | undefined) => el?.getAttribute('data-sheetsmith-tint') ?? null;

	it('lands on every box it tints and on its pill, and a second pass takes it off', () => {
		const { root } = draw(tinted('yes'), TINTED);
		const cards = Array.from(cellOf(root, 'abilities').querySelectorAll<HTMLElement>('.sheetsmith-card'));
		expect(cards.map(tintOf)).toEqual(['orange', null, 'orange', null, null, null]);
		const rows = Array.from(cellOf(root, 'skills').querySelectorAll<HTMLElement>('tbody tr'));
		expect(rows.map(tintOf)).toEqual([null, 'orange']);
		const pills = Array.from(root.querySelectorAll(`.${IN_PLAY_MARK}[aria-hidden="true"]`));
		expect(pills.length).toBeGreaterThan(0);
		for (const pill of pills) expect(tintOf(pill)).toBe('orange');

		applyDecorations(root, []);
		expect(cards.map(tintOf)).toEqual([null, null, null, null, null, null]);
		expect(rows.map(tintOf)).toEqual([null, null]);
		expect(root.querySelector(`.${IN_PLAY_BOX}`)).toBeNull();
	});

	it('takes the block colour for a form choosing none', () => {
		const { root } = draw(NOTE('no', 'yes'), TINTED);
		const cards = Array.from(cellOf(root, 'abilities').querySelectorAll<HTMLElement>('.sheetsmith-card'));
		expect(tintOf(cards[1])).toBe('green');
	});

	it('keeps each box its own colour in one placement, and draws the one pill in the accent', () => {
		const { root } = draw(tinted('yes', 'yes'), TINTED);
		const cell = cellOf(root, 'abilities');
		const cards = Array.from(cell.querySelectorAll<HTMLElement>('.sheetsmith-card'));
		expect(cards.map(tintOf)).toEqual(['orange', 'green', 'orange', null, null, null]);
		const pill = cell.querySelector(`.${IN_PLAY_MARK}[aria-hidden="true"]`);
		expect(pill?.textContent).toBe('Brown Bear, Wolf');
		expect(tintOf(pill)).toBe('accent');
		// Marked as naming several, so it is not clipped at one name's width.
		expect(pill?.classList.contains(IN_PLAY_MARK_SEVERAL)).toBe(true);
		const single = draw(tinted('yes'), TINTED).root.querySelector(`.${IN_PLAY_MARK}[aria-hidden="true"]`);
		expect(single?.classList.contains(IN_PLAY_MARK_SEVERAL)).toBe(false);
	});

	/** One placement with no stamped host, which two decorations both reach. */
	const lone = () => {
		const root = document.createElement('div');
		const cell = root.createDiv('sheetsmith-cell');
		cell.setAttribute('data-sheetsmith-component', 'hp');
		cell.createDiv('sheetsmith-pool');
		return { root, cell };
	};

	it('draws a box two colours reach in the accent', () => {
		const { root, cell } = lone();
		applyDecorations(root, [
			{ kind: 'in-play', label: 'Brown Bear', tint: 'orange', names: ['hp.max'] },
			{ kind: 'in-play', label: 'Wolf', tint: 'green', names: ['hp.max'] },
		]);
		expect(tintOf(cell.firstElementChild)).toBe('accent');
		expect(tintOf(cell.querySelector(`.${IN_PLAY_MARK}[aria-hidden="true"]`))).toBe('accent');
	});

	it('keeps one colour two forms agree on', () => {
		const { root, cell } = lone();
		applyDecorations(root, [
			{ kind: 'in-play', label: 'Brown Bear', tint: 'green', names: ['hp.max'] },
			{ kind: 'in-play', label: 'Wolf', tint: 'green', names: ['hp.max'] },
		]);
		expect(tintOf(cell.firstElementChild)).toBe('green');
		expect(tintOf(cell.querySelector(`.${IN_PLAY_MARK}[aria-hidden="true"]`))).toBe('green');
	});

	it('leaves the attribute on anything that is not a box it tinted', () => {
		const { root, cell } = lone();
		const swatch = cell.createSpan('sheetsmith-stat-block-tint-swatch');
		swatch.setAttribute('data-sheetsmith-tint', 'pink');
		applyDecorations(root, [{ kind: 'in-play', label: 'Wolf', tint: 'green', names: ['hp.max'] }]);
		applyDecorations(root, []);
		expect(tintOf(swatch)).toBe('pink');
	});

	it('keeps two forms of one name and two colours as two decorations', () => {
		const line = (tint: 'orange' | 'green') => ({
			label: 'Bear',
			source: 'Forms',
			operator: 'add' as const,
			type: null,
			amount: 1,
			suppressed: null,
			inPlay: true,
			tint,
		});
		const decorations = inPlayDecorations(['a', 'b'], (name) => ({
			lines: [line(name === 'a' ? 'orange' : 'green')],
			notes: [],
		}) as unknown as ReturnType<Parameters<typeof inPlayDecorations>[1]>);
		expect(decorations.map(({ label, tint, names }) => ({ label, tint, names }))).toEqual([
			{ label: 'Bear', tint: 'orange', names: ['a'] },
			{ label: 'Bear', tint: 'green', names: ['b'] },
		]);
	});

	it('reads a line with no tint as the accent', () => {
		const decorations = draw(NOTE('yes')).decorations;
		expect(decorations.map((one) => one.tint)).toEqual(['accent']);
	});
});
