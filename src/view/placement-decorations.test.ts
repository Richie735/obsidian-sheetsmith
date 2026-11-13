// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
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
	IN_PLAY_MARKED,
	IN_PLAY_PLACEMENT,
	inPlayDecorations,
	TAG_TEXT_ATTRIBUTE,
	pickTagText,
	stateLinesIn,
	bufferLinesIn,
	choiceLinesIn,
} from './placement-decorations';
import { modifierBreakdown, stampStateHost } from '../components/modifier-breakdown';
import { contrast } from '../ui/contrast';

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

/*
 * The tag's text is measured, not assumed (`docs/features/form-tint-colour.md`,
 * "The tag's text, picked at runtime"). A stubbed computed style stands in for
 * the theme, and a test swaps what it says a colour is, as a community theme
 * would.
 */
describe('the tag text picked against the fill', () => {
	/** A theme in miniature: the pill's fill, the box's surface and tint layer, the page. */
	let theme = { fill: '', box: '', layer: 'none', page: '' };
	const pillIn = () => {
		const page = document.createElement('div');
		document.body.appendChild(page);
		const box = page.createDiv();
		const pill = box.createSpan({ cls: IN_PLAY_MARK, text: 'Brown Bear' });
		pill.setAttribute('aria-hidden', 'true');
		vi.spyOn(window, 'getComputedStyle').mockImplementation(
			(el) =>
				({
					backgroundColor:
						el === pill ? theme.fill : el === box ? theme.box : el === page ? theme.page : 'rgba(0, 0, 0, 0)',
					backgroundImage: el === box ? theme.layer : 'none',
				}) as CSSStyleDeclaration,
		);
		return { root: page, pill };
	};
	afterEach(() => {
		vi.restoreAllMocks();
		document.body.empty();
	});

	it('writes white where it reads better on the fill over both grounds', () => {
		// Dark accent at 75% over a dark card and page.
		theme = {
			fill: 'color(srgb 0.54 0.36 0.96 / 0.75)',
			box: 'rgb(40, 40, 40)',
			layer: 'linear-gradient(color(srgb 0.54 0.36 0.96 / 0.12), color(srgb 0.54 0.36 0.96 / 0.12))',
			page: 'rgb(28, 28, 28)',
		};
		const { root, pill } = pillIn();
		pickTagText(root);
		expect(pill.getAttribute(TAG_TEXT_ATTRIBUTE)).toBe('white');
	});

	it('writes black where that reads better', () => {
		// Light yellow at 75% over a light card and page.
		theme = { fill: 'color(srgb 0.88 0.67 0 / 0.75)', box: 'rgb(246, 246, 246)', layer: 'none', page: 'rgb(255, 255, 255)' };
		const { root, pill } = pillIn();
		pickTagText(root);
		expect(pill.getAttribute(TAG_TEXT_ATTRIBUTE)).toBe('black');
	});

	it('follows a theme that redefines the colour, measuring again', () => {
		theme = { fill: 'color(srgb 0.88 0.67 0 / 0.75)', box: 'rgb(246, 246, 246)', layer: 'none', page: 'rgb(255, 255, 255)' };
		const { root, pill } = pillIn();
		pickTagText(root);
		expect(pill.getAttribute(TAG_TEXT_ATTRIBUTE)).toBe('black');
		// The same word, a dark colour under another theme.
		theme = { ...theme, fill: 'color(srgb 0.15 0.08 0.35 / 0.75)' };
		pickTagText(root);
		expect(pill.getAttribute(TAG_TEXT_ATTRIBUTE)).toBe('white');
	});

	it('judges by the worse of the two grounds the tag straddles', () => {
		// A mid fill, translucent enough that the dark page under its hanging
		// half pulls that half down: black would read on the light box alone.
		theme = { fill: 'color(srgb 1 0.4 0.4 / 0.75)', box: 'rgb(255, 255, 255)', layer: 'none', page: 'rgb(0, 0, 0)' };
		const { root, pill } = pillIn();
		pickTagText(root);
		const onBox = [1 * 0.75 + 0.25, 0.4 * 0.75 + 0.25, 0.4 * 0.75 + 0.25] as const;
		const onPage = [0.75, 0.3, 0.3] as const;
		const worst = (text: readonly [number, number, number]) => Math.min(contrast(text, onBox), contrast(text, onPage));
		expect(pill.getAttribute(TAG_TEXT_ATTRIBUTE)).toBe(worst([1, 1, 1]) > worst([0, 0, 0]) ? 'white' : 'black');
	});

	it('leaves the default where nothing under the tag reads', () => {
		theme = { fill: 'color(srgb 1 0 0 / 0.75)', box: 'rgba(0, 0, 0, 0)', layer: 'none', page: 'rgba(0, 0, 0, 0)' };
		const { root, pill } = pillIn();
		pickTagText(root);
		expect(pill.hasAttribute(TAG_TEXT_ATTRIBUTE)).toBe(false);
	});
});

/*
 * A Roster drawn as stat cards, whose rows each move on their own: a form
 * tints a stat's score pill and each row it changed, never the card, and the
 * card carries the tag for its pill where a score comes first; where only a
 * row moved, the tag is in that row's name cell
 * (`docs/features/character-forms.md`, "Where a decoration lands" and "The
 * text mark", Roster). Cat adds to its scores, as the owner's
 * druid's Cat Form does, so `mod.self` moves the score where `effective` reads
 * it; an `=` sets the published reading and leaves the score alone.
 */
const ROSTER = (effective: boolean) => ({
	name: 'Forms fixture',
	columns: 12,
	functions: ['mod(score) = floor((score - 10) / 2)'],
	components: [
		{
			id: 'checks',
			type: 'roster',
			label: 'Checks',
			position: { col: 1, row: 1, width: 12, height: 3 },
			rowHeader: 'Check',
			hideColumnHeadings: true,
			cardLayout: true,
			stats: [
				{ key: 'STR', name: 'Strength' },
				{ key: 'DEX', name: 'Dexterity' },
				{ key: 'WIS', name: 'Wisdom' },
			],
			...(effective ? { effective: 'value + mod.self' } : {}),
			derived: 'mod(value + mod.self)',
			columns: [
				{ key: 'Prof', type: 'level', levels: ['Untrained', 'Proficient'], hideHeading: true },
				{
					key: 'Total',
					type: 'computed',
					formula: 'stat + Prof * 2 + mod.self',
					signed: true,
					publish: true,
				},
			],
			rows: [
				{ label: 'Athletics', stat: 'STR', key: 'athletics' },
				{ label: 'Acrobatics', stat: 'DEX', key: 'acrobatics' },
				{ label: 'Stealth', stat: 'DEX', key: 'stealth' },
				{ label: 'Insight', stat: 'WIS', key: 'insight' },
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
});

const ROSTER_NOTE = (cat: 'yes' | 'no', owl: 'yes' | 'no' = 'no', ox: 'yes' | 'no' = 'no') => `---
sheet-layout: Forms fixture
---

## Checks
\`\`\`sheet
STR: 10
DEX: 14
WIS: 16
\`\`\`

| Check | Prof |
| --- | --- |
| Athletics | 0 |
| Acrobatics | 0 |
| Stealth | 0 |
| Insight | 1 |

## Wild Shape

### Cat
\`\`\`sheet
Active: ${cat}
Modifiers: checks.STR += 6; checks.DEX += 4; checks.stealth >= 9
\`\`\`

### Owl
\`\`\`sheet
Active: ${owl}
Modifiers: checks.insight += 1
\`\`\`

### Ox
\`\`\`sheet
Active: ${ox}
Modifiers: checks.WIS += 2
\`\`\`
`;

describe('the in-play tint on a Roster card', () => {
	const cardsOf = (root: HTMLElement) =>
		Array.from(cellOf(root, 'checks').querySelectorAll<HTMLElement>('.sheetsmith-card'));
	const tagsIn = (el: HTMLElement) => el.querySelectorAll(`.${IN_PLAY_MARK}[aria-hidden="true"]`);

	it('tints the score pills and the row a form changed, never a card or a reading', () => {
		const { root } = draw(ROSTER_NOTE('yes'), ROSTER(true));
		const [strength, dexterity, wisdom] = cardsOf(root);
		const pill = (card: HTMLElement | undefined) => card?.querySelector<HTMLElement>('.sheetsmith-card-value');
		expect(pill(strength)?.classList.contains(IN_PLAY_BOX)).toBe(true);
		expect(pill(dexterity)?.classList.contains(IN_PLAY_BOX)).toBe(true);
		expect(pill(wisdom)?.classList.contains(IN_PLAY_BOX)).toBe(false);
		for (const box of [pill(strength), pill(dexterity)]) {
			expect(box?.getAttribute('data-sheetsmith-tint')).toBe('accent');
		}
		const rows = Array.from(cellOf(root, 'checks').querySelectorAll<HTMLElement>('tbody tr'));
		// Stealth's floor raised it; Athletics and Acrobatics move through their
		// scores, which nothing pushed at them, and Insight is untouched.
		expect(rows.map((row) => row.classList.contains(IN_PLAY_BOX))).toEqual([false, false, true, false]);
		expect(rows[2]?.getAttribute('data-sheetsmith-tint')).toBe('accent');
		for (const card of cardsOf(root)) {
			expect(card.classList.contains(IN_PLAY_BOX)).toBe(false);
			expect(card.hasAttribute('data-sheetsmith-tint')).toBe(false);
		}
		for (const reading of Array.from(root.querySelectorAll<HTMLElement>('.sheetsmith-card-derived'))) {
			expect(reading.classList.contains(IN_PLAY_BOX)).toBe(false);
			expect(reading.hasAttribute('data-sheetsmith-tint')).toBe(false);
		}
		// The readings keep their underline: they moved, through the score.
		expect(strength?.querySelector('.sheetsmith-card-derived.sheetsmith-modified')).not.toBeNull();
	});

	const pillOf = (card: HTMLElement | undefined) =>
		card?.querySelector<HTMLElement>('.sheetsmith-card-value') ?? null;

	it('puts the one tag on the first card in reading order, which takes no tint', () => {
		const { root } = draw(ROSTER_NOTE('yes'), ROSTER(true));
		const [strength, dexterity, wisdom] = cardsOf(root);
		expect(tagsIn(cellOf(root, 'checks'))).toHaveLength(1);
		expect(strength?.classList.contains(IN_PLAY_MARKED)).toBe(true);
		expect(strength?.classList.contains(IN_PLAY_BOX)).toBe(false);
		const tag = tagsIn(strength as HTMLElement)[0];
		expect(tag?.parentElement).toBe(strength);
		expect(tag?.textContent).toBe('Cat');
		for (const card of [dexterity, wisdom]) {
			expect(card?.classList.contains(IN_PLAY_MARKED)).toBe(false);
			expect(tagsIn(card as HTMLElement)).toHaveLength(0);
		}
		// The pill is the box, not the carrier.
		expect(pillOf(strength)?.classList.contains(IN_PLAY_MARKED)).toBe(false);
	});

	it('tags the card where a form pushed only at a score', () => {
		const { root } = draw(ROSTER_NOTE('no', 'no', 'yes'), ROSTER(true));
		const wisdom = cardsOf(root)[2];
		expect(pillOf(wisdom)?.classList.contains(IN_PLAY_BOX)).toBe(true);
		expect(wisdom?.classList.contains(IN_PLAY_MARKED)).toBe(true);
		expect(wisdom?.classList.contains(IN_PLAY_BOX)).toBe(false);
		expect(tagsIn(wisdom as HTMLElement)[0]?.parentElement).toBe(wisdom);
		expect(tagsIn(cellOf(root, 'checks'))).toHaveLength(1);
		const insight = wisdom?.querySelector<HTMLElement>('tbody tr');
		expect(insight?.classList.contains(IN_PLAY_BOX)).toBe(false);
		expect(insight?.querySelector(`.${IN_PLAY_MARK}`)).toBeNull();
	});

	it('tags a row\'s name cell where a form pushed only at that row', () => {
		const { root } = draw(ROSTER_NOTE('no', 'yes'), ROSTER(true));
		const insight = Array.from(cellOf(root, 'checks').querySelectorAll<HTMLElement>('tbody tr'))[3];
		expect(insight?.classList.contains(IN_PLAY_BOX)).toBe(true);
		const tag = insight?.querySelector(`th[scope="row"] .${IN_PLAY_MARK_INLINE}`);
		expect(tag?.textContent).toBe('Owl');
		expect(tagsIn(cellOf(root, 'checks'))).toHaveLength(1);
		for (const card of cardsOf(root)) expect(card.classList.contains(IN_PLAY_MARKED)).toBe(false);
	});

	it('tints the card whole where only the reading moved, with no effective', () => {
		// The case the smallest version leaves as it was: the score reads the
		// note, so the reading names the card.
		const { root } = draw(ROSTER_NOTE('yes'), ROSTER(false));
		const [strength, dexterity, wisdom] = cardsOf(root);
		expect(strength?.classList.contains(IN_PLAY_BOX)).toBe(true);
		expect(dexterity?.classList.contains(IN_PLAY_BOX)).toBe(true);
		expect(wisdom?.classList.contains(IN_PLAY_BOX)).toBe(false);
		expect(strength?.classList.contains(IN_PLAY_MARKED)).toBe(true);
		expect(tagsIn(cellOf(root, 'checks'))).toHaveLength(1);
	});

	it('clears the carrier on the next pass', () => {
		const { root } = draw(ROSTER_NOTE('yes'), ROSTER(true));
		expect(cardsOf(root)[0]?.classList.contains(IN_PLAY_MARKED)).toBe(true);
		expect(root.querySelector(`.${IN_PLAY_MARK}`)).not.toBeNull();
		applyDecorations(root, []);
		expect(root.querySelector(`.${IN_PLAY_MARKED}`)).toBeNull();
		expect(root.querySelector(`.${IN_PLAY_MARK}`)).toBeNull();
	});
});

/*
 * The same Roster drawn as one table, where a stat's band head is a `tr` with
 * one cell and no name cell: the tag rides the band's tag line, which the
 * component stamps as its carrier, and never a `tr` itself
 * (`docs/features/character-forms.md`, "A Roster's band head").
 */
const ROSTER_TABLE = {
	...ROSTER(true),
	components: ROSTER(true).components.map((component) =>
		component.id === 'checks' ? { ...component, cardLayout: false } : component,
	),
};

const BAND_NOTE = (form: 'Ox' | 'Bull' | 'Hawk') => `---
sheet-layout: Forms fixture
---

## Checks
\`\`\`sheet
STR: 10
DEX: 14
WIS: 16
\`\`\`

| Check | Prof |
| --- | --- |
| Athletics | 0 |
| Acrobatics | 0 |
| Stealth | 0 |
| Insight | 1 |

## Wild Shape

### Ox
\`\`\`sheet
Active: ${form === 'Ox' ? 'yes' : 'no'}
Modifiers: checks.STR += 2
\`\`\`

### Bull
\`\`\`sheet
Active: ${form === 'Bull' ? 'yes' : 'no'}
Modifiers: checks.STR += 2; checks.athletics >= 9
\`\`\`

### Hawk
\`\`\`sheet
Active: ${form === 'Hawk' ? 'yes' : 'no'}
Modifiers: checks.athletics >= 9; checks.DEX += 2
\`\`\`
`;

describe('the in-play tint on a Roster band head', () => {
	const bandsOf = (root: HTMLElement) =>
		Array.from(cellOf(root, 'checks').querySelectorAll<HTMLElement>('tr.sheetsmith-roster-band'));
	/** What carries a band's tag: its tag line, the band's first flex item. */
	const headingOf = (band: HTMLElement | undefined) =>
		band?.querySelector<HTMLElement>('.sheetsmith-roster-band-tag-line') ?? null;
	const tagsIn = (el: HTMLElement) => el.querySelectorAll(`.${IN_PLAY_MARK}[aria-hidden="true"]`);
	const rowNamed = (root: HTMLElement, name: string) =>
		Array.from(cellOf(root, 'checks').querySelectorAll<HTMLElement>('tbody tr')).find(
			(row) => row.querySelector('th[scope="row"]')?.textContent?.startsWith(name) === true,
		);
	/** Whether every `tr` in the placement holds cells and nothing else. */
	const rowsHoldCellsAlone = (root: HTMLElement) =>
		Array.from(cellOf(root, 'checks').querySelectorAll('tr')).every((tr) =>
			Array.from(tr.children).every((child) => child.tagName === 'TD' || child.tagName === 'TH'),
		);

	it('tags the band\'s tag line where a form pushed at its score, and leaves the band below alone', () => {
		const { root } = draw(BAND_NOTE('Ox'), ROSTER_TABLE);
		const [strength, dexterity] = bandsOf(root);
		expect(strength?.classList.contains(IN_PLAY_BOX)).toBe(true);
		const heading = headingOf(strength);
		expect(heading?.classList.contains(IN_PLAY_MARKED)).toBe(true);
		expect(heading?.classList.contains(IN_PLAY_BOX)).toBe(false);
		const tags = tagsIn(cellOf(root, 'checks'));
		expect(tags).toHaveLength(1);
		expect(tags[0]?.parentElement).toBe(heading);
		expect(tags[0]?.classList.contains(IN_PLAY_MARK_INLINE)).toBe(true);
		expect(tags[0]?.textContent).toBe('Ox');
		expect(rowsHoldCellsAlone(root)).toBe(true);
		expect(dexterity?.classList.contains(IN_PLAY_BOX)).toBe(false);
		expect(headingOf(dexterity)?.classList.contains(IN_PLAY_MARKED)).toBe(false);
	});

	it('draws one tag, on the band, where a form pushed at its score and one of its rows', () => {
		const { root } = draw(BAND_NOTE('Bull'), ROSTER_TABLE);
		const strength = bandsOf(root)[0];
		const athletics = rowNamed(root, 'Athletics');
		expect(strength?.classList.contains(IN_PLAY_BOX)).toBe(true);
		expect(athletics?.classList.contains(IN_PLAY_BOX)).toBe(true);
		const tags = tagsIn(cellOf(root, 'checks'));
		expect(tags).toHaveLength(1);
		expect(tags[0]?.parentElement).toBe(headingOf(strength));
		expect(athletics?.querySelector(`.${IN_PLAY_MARK}`)).toBeNull();
		expect(rowsHoldCellsAlone(root)).toBe(true);
	});

	it('keeps the tag in a row\'s name cell where that row comes before a tinted band', () => {
		const { root } = draw(BAND_NOTE('Hawk'), ROSTER_TABLE);
		const [strength, dexterity] = bandsOf(root);
		const athletics = rowNamed(root, 'Athletics');
		expect(strength?.classList.contains(IN_PLAY_BOX)).toBe(false);
		expect(dexterity?.classList.contains(IN_PLAY_BOX)).toBe(true);
		const tags = tagsIn(cellOf(root, 'checks'));
		expect(tags).toHaveLength(1);
		expect(tags[0]?.parentElement).toBe(athletics?.querySelector('th[scope="row"]'));
		expect(headingOf(dexterity)?.classList.contains(IN_PLAY_MARKED)).toBe(false);
		expect(rowsHoldCellsAlone(root)).toBe(true);
	});
});

/*
 * The tag on a band head is carried by the band's name, which wears no tint
 * layer: the band's cell around it does, and that is the layer it sits on.
 */
describe('the tag text on a band head', () => {
	afterEach(() => vi.restoreAllMocks());

	it('reads the tint layer off the nearest element wearing one', () => {
		const page = document.body.createDiv();
		// The band's `tr`, which bounds the walk; its cell wears the layer.
		const cell = page.createDiv().createDiv();
		cell.parentElement?.classList.add(IN_PLAY_BOX);
		const heading = cell.createDiv();
		const pill = heading.createSpan({ cls: IN_PLAY_MARK, text: 'Ox' });
		pill.setAttribute('aria-hidden', 'true');
		// A grey page where black just wins, so the pick turns on the layer: a
		// strong dark one under the tag's cell makes black the worse of the two
		// grounds it is judged on, where the plain page alone gives black.
		const style = (layer: string) =>
			vi.spyOn(window, 'getComputedStyle').mockImplementation(
				(el) =>
					({
						backgroundColor:
							el === pill ? 'color(srgb 0.5 0.5 0.5 / 0.5)' : el === page ? 'rgb(128, 128, 128)' : 'rgba(0, 0, 0, 0)',
						backgroundImage: el === cell ? layer : 'none',
					}) as CSSStyleDeclaration,
			);
		style('none');
		pickTagText(page);
		const plain = pill.getAttribute(TAG_TEXT_ATTRIBUTE);
		vi.restoreAllMocks();
		style('linear-gradient(color(srgb 0 0 0 / 0.95), color(srgb 0 0 0 / 0.95))');
		pickTagText(page);
		expect(plain).toBe('black');
		expect(pill.getAttribute(TAG_TEXT_ATTRIBUTE)).toBe('white');
	});
});

/*
 * A stamped row with no name cell and no carrier its component named, built by
 * hand since no registered component draws one: the pass's two fallbacks for a
 * row, which keep a tag out of the `tr` itself (`carrierOf`).
 */
describe('a row with no name cell and no carrier', () => {
	const ox = [{ kind: 'in-play' as const, label: 'Ox', tint: 'accent' as const, names: ['t.x'] }];
	const sheetWith = (fill: (tr: HTMLTableRowElement) => void) => {
		const root = document.body.createDiv({ cls: 'sheetsmith-view' });
		const cell = root.createDiv();
		cell.setAttribute('data-sheetsmith-component', 't');
		const tr = cell.createEl('table').createEl('tbody').createEl('tr');
		fill(tr);
		return { root, cell, tr };
	};

	it('puts the tag in the row\'s first cell', () => {
		const { root, tr } = sheetWith((tr) => {
			tr.setAttribute('data-sheetsmith-box', '');
			tr.createEl('td').createSpan({ attr: { 'data-sheetsmith-name': 't.x' }, text: '3' });
		});
		applyDecorations(root, ox);
		const td = tr.querySelector('td');
		const tags = root.querySelectorAll(`.${IN_PLAY_MARK}[aria-hidden="true"]`);
		expect(tags).toHaveLength(1);
		expect(tags[0]?.parentElement).toBe(td);
		expect(tags[0]?.classList.contains(IN_PLAY_MARK_INLINE)).toBe(true);
		expect(td?.classList.contains(IN_PLAY_MARKED)).toBe(true);
		expect(Array.from(tr.children).every((child) => child.tagName === 'TD')).toBe(true);
	});

	it('draws no tag in a row with no cell, and still says who changed it', () => {
		const { root, cell, tr } = sheetWith((tr) => tr.setAttribute('data-sheetsmith-name', 't.x'));
		applyDecorations(root, ox);
		expect(tr.classList.contains(IN_PLAY_BOX)).toBe(true);
		expect(tr.children).toHaveLength(0);
		expect(root.querySelector(`.${IN_PLAY_MARK}[aria-hidden="true"]`)).toBeNull();
		const twin = cell.querySelector(`.sheetsmith-sr-only.${IN_PLAY_MARK}`);
		expect(twin?.textContent).toBe('Changed by Ox');
	});
});

describe('the tag text on a carrier no tinted box holds', () => {
	afterEach(() => vi.restoreAllMocks());

	it('reads its own ground, not a gradient an ancestor wears', () => {
		// A Roster card inside something wearing a gradient that is not a tint,
		// on the grey page where black just wins: read as a layer, the
		// ancestor's dark stop would flip the tag to white.
		const page = document.body.createDiv();
		const shadowed = page.createDiv();
		const card = shadowed.createDiv();
		const pill = card.createSpan({ cls: IN_PLAY_MARK, text: 'Ox' });
		pill.setAttribute('aria-hidden', 'true');
		vi.spyOn(window, 'getComputedStyle').mockImplementation(
			(el) =>
				({
					backgroundColor:
						el === pill ? 'color(srgb 0.5 0.5 0.5 / 0.5)' : el === page ? 'rgb(128, 128, 128)' : 'rgba(0, 0, 0, 0)',
					backgroundImage:
						el === shadowed ? 'linear-gradient(color(srgb 0 0 0 / 0.95), color(srgb 0 0 0 / 0.95))' : 'none',
				}) as CSSStyleDeclaration,
		);
		pickTagText(page);
		expect(pill.getAttribute(TAG_TEXT_ATTRIBUTE)).toBe('black');
	});
});

describe('stateLinesIn: a ring a form in play set (docs/features/non-number-modifiers.md D11)', () => {
	const line = {
		label: 'Cat Form',
		source: 'Wild Shape',
		operator: 'upgrade' as const,
		type: null,
		amount: 1,
		suppressed: null,
		inPlay: true,
		tint: 'green' as const,
	};

	/** A sheet holding one stamped ring, and what the context folded for it. */
	function ringed() {
		const root = document.createElement('div');
		const cell = root.createDiv({ attr: { 'data-sheetsmith-component': 'checks' } });
		const row = cell.createEl('table').createEl('tbody').createEl('tr');
		row.createEl('th', { attr: { scope: 'row' }, text: 'Endurance' });
		const ring = row.createEl('td').createEl('button');
		stampStateHost(ring, 'checks.endurance', 'Prof', 0, row);
		const asked: [string, string | null, unknown][] = [];
		const modifiers = {
			state: (name: string, column: string | null, stored: unknown) => {
				asked.push([name, column, stored]);
				return {
					shape: { flag: false, positions: 2, words: ['Untrained', 'Proficient'], label: 'Prof' },
					stored: 0,
					drawn: 1,
					lines: [line],
					error: null,
				};
			},
		};
		return { root, row, asked, modifiers };
	}

	it('reads the stamped name, column and stored position, and hands back the folded lines', () => {
		const { root, asked, modifiers } = ringed();
		expect(stateLinesIn(root, modifiers)).toEqual([{ name: 'checks.endurance', lines: [line] }]);
		expect(asked).toEqual([['checks.endurance', 'Prof', 0]]);
	});

	it('tints the ring\'s row in the form\'s colour, as a number it changed would be', () => {
		const { root, row, modifiers } = ringed();
		const decorations = inPlayDecorations([], () => ({ lines: [], override: null, total: 0 }), stateLinesIn(root, modifiers));
		expect(decorations).toEqual([
			{ kind: 'in-play', label: 'Cat Form', tint: 'green', names: ['checks.endurance'] },
		]);
		applyDecorations(root, decorations);
		expect(row.classList.contains('sheetsmith-in-play')).toBe(true);
		expect(row.getAttribute('data-sheetsmith-tint')).toBe('green');
	});

	it('finds nothing where the context has no states, or nothing is stamped', () => {
		const { root } = ringed();
		expect(stateLinesIn(root, {})).toEqual([]);
		expect(stateLinesIn(document.createElement('div'), ringed().modifiers)).toEqual([]);
	});
});

describe('bufferLinesIn: a pool a form in play grants (docs/features/granted-temporary-points.md D12)', () => {
	const GRANTS = {
		name: 'Grants fixture',
		columns: 12,
		components: [
			{ id: 'hp', type: 'pool', label: 'HP', max: '30', hasTemp: true, position: { col: 1, row: 1, width: 3, height: 2 } },
			{
				id: 'wild_shape',
				type: 'stat-block',
				label: 'Wild Shape',
				recordName: 'Form',
				fields: [
					{ key: 'Active', type: 'toggle' },
					{ key: 'Modifiers', type: 'modifier' },
				],
				exclusive: 'Active',
				position: { col: 4, row: 1, width: 6, height: 4 },
			},
		],
	};
	const note = (temp: number) => `---
sheet-layout: Grants fixture
---

## HP
\`\`\`sheet
current: 22
temp: ${temp}
\`\`\`

## Wild Shape

### Brown Bear
\`\`\`sheet
Active: yes
Modifiers: hp.temp >= 10
\`\`\`
`;

	function drawn(source: string) {
		const layout = parseLayout(JSON.stringify(GRANTS));
		const parsed = parseCharacter(source);
		const walk = walkLayout(layout.components);
		const prepared = walk.map(({ config }) => {
			const component = getComponent(config.type);
			if (component === undefined) throw new Error(config.type);
			const section = getSection(parsed, config.label);
			const result = section ? component.read(section.body, config) : null;
			return { config, component, error: null, data: result?.ok === true ? result.data : null };
		});
		const { env, modifiers, marked } = buildSheet(layout, prepared);
		const root = document.createElement('div');
		root.className = 'sheetsmith-view';
		document.body.appendChild(root);
		renderGrid(root, walk, prepared, ({ config, component, data }) => ({
			...formulaContext(component, config, data, env),
			modifiers,
			onChange: () => undefined,
		}));
		applyDecorations(
			root,
			inPlayDecorations(marked, (name) => modifiers.breakdown(name), bufferLinesIn(prepared, modifiers)),
		);
		return { root, lines: bufferLinesIn(prepared, modifiers) };
	}

	it('tints the pool’s card where the form’s grant is the buffer it draws', () => {
		const { root, lines } = drawn(note(3));
		expect(lines.map((one) => [one.name, one.lines[0]?.label, one.lines[0]?.inPlay])).toEqual([
			['hp.temp', 'Brown Bear', true],
		]);
		expect(cellOf(root, 'hp').querySelector(`.${IN_PLAY_BOX}`)).not.toBeNull();
		expect(cellOf(root, 'hp').querySelector(`.${IN_PLAY_MARK}`)?.textContent).toBe('Brown Bear');
		// The form's change line names the pool it grants at, not only its key.
		expect(cellOf(root, 'wild_shape').textContent).toContain('HP · temp grants 10');
	});

	it('leaves the pool untinted where its own points beat the grant', () => {
		const { root, lines } = drawn(note(12));
		expect(lines).toEqual([]);
		expect(cellOf(root, 'hp').querySelector(`.${IN_PLAY_BOX}`)).toBeNull();
	});
});

describe('choiceLinesIn: a dropdown a form in play chose (docs/features/text-value-modifiers.md D12, D13)', () => {
	const CHOICES = {
		name: 'Choices fixture',
		columns: 12,
		components: [
			{
				id: 'size',
				type: 'card',
				label: 'Size',
				options: [{ value: 'Small' }, { value: 'Medium' }, { value: 'Large' }],
				hideNote: true,
				position: { col: 1, row: 1, width: 3, height: 1 },
			},
			{
				id: 'lifestyle',
				type: 'card',
				label: 'Lifestyle',
				options: [{ value: 'Modest' }, { value: 'Wealthy' }],
				hideNote: true,
				position: { col: 1, row: 2, width: 3, height: 1 },
			},
			{
				id: 'wild_shape',
				type: 'stat-block',
				label: 'Wild Shape',
				recordName: 'Form',
				fields: [
					{ key: 'Active', type: 'toggle' },
					{ key: 'Modifiers', type: 'modifier' },
				],
				exclusive: 'Active',
				position: { col: 4, row: 1, width: 6, height: 4 },
			},
		],
	};
	const note = (active: boolean) => `---
sheet-layout: Choices fixture
---

## Size
\`\`\`sheet
value: Medium
\`\`\`

## Lifestyle
\`\`\`sheet
value: Modest
\`\`\`

## Wild Shape

### Brown bear
\`\`\`sheet
Active: ${active ? 'yes' : 'no'}
Modifiers: size = option: Large
\`\`\`
`;

	function drawn(source: string) {
		const layout = parseLayout(JSON.stringify(CHOICES));
		const parsed = parseCharacter(source);
		const walk = walkLayout(layout.components);
		const prepared = walk.map(({ config }) => {
			const component = getComponent(config.type);
			if (component === undefined) throw new Error(config.type);
			const section = getSection(parsed, config.label);
			const result = section ? component.read(section.body, config) : null;
			return { config, component, error: null, data: result?.ok === true ? result.data : null };
		});
		const { env, modifiers, marked } = buildSheet(layout, prepared);
		const root = document.createElement('div');
		root.className = 'sheetsmith-view';
		document.body.appendChild(root);
		renderGrid(root, walk, prepared, ({ config, component, data }) => ({
			...formulaContext(component, config, data, env),
			modifiers,
			onChange: () => undefined,
		}));
		applyDecorations(
			root,
			inPlayDecorations(marked, (name) => modifiers.breakdown(name), choiceLinesIn(prepared, modifiers)),
		);
		return { root, lines: choiceLinesIn(prepared, modifiers) };
	}

	it('tints the card whose option the form in play chose, and no other', () => {
		const { root, lines } = drawn(note(true));
		expect(lines.map((one) => [one.name, one.lines[0]?.label, one.lines[0]?.inPlay])).toEqual([
			['size', 'Brown bear', true],
		]);
		expect(cellOf(root, 'size').querySelector(`.${IN_PLAY_BOX}`)).not.toBeNull();
		expect(cellOf(root, 'size').querySelector(`.${IN_PLAY_MARK}`)?.textContent).toBe('Brown bear');
		expect(cellOf(root, 'lifestyle').querySelector(`.${IN_PLAY_BOX}`)).toBeNull();
	});

	it('reads the option change as one of the form\'s vitals, in the option\'s label', () => {
		const { root } = drawn(note(true));
		const tiles = Array.from(cellOf(root, 'wild_shape').querySelectorAll('.sheetsmith-stat-block-vital')).map(
			(tile) => tile.textContent,
		);
		expect(tiles).toContain('SizeLarge');
		expect(cellOf(root, 'wild_shape').textContent).not.toContain('option:');
	});
});
