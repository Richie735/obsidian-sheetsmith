// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	groupReading,
	MAX_TABULATED_FIELDS,
	recordSet,
	RecordSetConfig,
	RecordSetData,
} from './record-set';
import { outcomeView } from '../test/modifier-views';
import { card, CardConfig } from './card';
import { buildSheet, ReadComponent } from '../formula/sheet';
import { evaluate } from '../formula/expression';
import {
	callsFrom,
	formulaContext,
	makeFormulaReaders,
	makeFieldExplainer,
	makeFieldResolver,
	NO_ENV,
} from '../formula/resolve';
import { FOCUSABLE } from '../view/cell-focus';
import { bindingContext } from '../view/reset-plan';
import { SAMPLES } from '../../harness/samples';
import { Layout, parseLayout, serialiseLayout } from '../parse/layout';
import { COLUMN_TYPES } from './column-types';
import { RenderContext, ResetBinding } from '../types';
import { sampleOf } from '../test/sample';
import { closeAnchoredPanel } from '../ui/anchored-panel';
import { closePopover, LONG_PRESS } from '../ui/popover';
import { parseModifierPart } from '../parse/modifier-cell';
import { hold } from '../test/pointer';
import { installExecCommand } from '../test/exec-command';
import { beforeinput } from '../test/beforeinput';

/*
 * Record set, and with it `parse/records.ts`.
 *
 * The splitter has no test file of its own, under `docs/PATTERNS.md` §10's third
 * exception: a note-format primitive is tested through the round trip it is part
 * of, because `bodyText` alone is `trim` and a splitter alone is a split. What is
 * worth asserting is Constraint 3 — parse then serialise returns the input byte
 * for byte — and that is a *component's* contract. So the ten whitespace
 * spellings below are the splitter's coverage as much as this component's.
 */

const config: RecordSetConfig = {
	id: 'features',
	type: 'record-set',
	label: 'Features',
	position: { col: 1, row: 1, width: 6, height: 3 },
	recordName: 'Feature',
	fields: [
		{ key: 'Uses', type: 'number', max: 3 },
		{ key: 'Attuned', type: 'toggle' },
		{ key: 'Modifiers', type: 'modifier' },
	],
};

const BODY = [
	'',
	'### Second Wind',
	'```sheet',
	'Uses: 1',
	'Attuned: no',
	'```',
	'Once per short rest, regain 1d10 hit points as a bonus action.',
	'',
	'### Blessed Armour',
	'```sheet',
	'Uses: 0',
	'Attuned: yes',
	'Modifiers: armour_class += 1 as item when Attuned',
	'```',
	'A gift from the temple at [[Neverwinter]].',
	'',
	'### Lucky',
	'```sheet',
	'Uses: 3',
	'```',
	'Three rerolls a day.',
	'',
].join('\n');

/**
 * One of the harness's own Record sets and its body, top level or inside a
 * container, so a case about "the lists the harness draws" reads the lists the
 * harness draws rather than a copy of them.
 */
function harnessRecordSet(id: string): { config: RecordSetConfig; body: string } {
	for (const sample of SAMPLES) {
		if (sample.config.id === id && sample.body !== null) {
			return { config: sample.config as RecordSetConfig, body: sample.body };
		}
		const children = (sample.config as { children?: RecordSetConfig[] }).children ?? [];
		const child = children.find((one) => one.id === id);
		const body = sample.children?.[id];
		if (child !== undefined && typeof body === 'string') {
			return { config: child, body };
		}
	}
	throw new Error(`no harness record set called "${id}"`);
}

const context: RenderContext<RecordSetData> = {
	resolved: {},
	resolveField: () => null,
	onChange: () => undefined,
};

function render(
	overrides: Partial<RecordSetConfig> = {},
	body: string | null = BODY,
	ctx: Partial<RenderContext<RecordSetData>> = {},
) {
	const merged = { ...config, ...overrides };
	const el = document.createElement('div');
	// Attached *before* the render, because two of the cases below are about
	// focus and a detached element cannot hold it.
	document.body.appendChild(el);
	// Rendered from a real `read`, so nothing here can draw a state no note could
	// be in — which is the same bargain `sample` takes one level up.
	const data = body === null ? null : readData(body, merged);
	recordSet.render(el, merged, data, { ...context, ...ctx });
	return el;
}

/** A `read` that must have succeeded with data, as every round trip needs. */
function readData(body: string, from: RecordSetConfig = config): RecordSetData {
	const result = recordSet.read(body, from);
	if (!result.ok || result.data === null) throw new Error('expected data');
	return result.data;
}

const records = (el: HTMLElement) =>
	Array.from(el.querySelectorAll<HTMLElement>('.sheetsmith-record'));
const chevrons = (el: HTMLElement) =>
	Array.from(
		el.querySelectorAll<HTMLButtonElement>('.sheetsmith-record-disclosure'),
	);
const bodies = (el: HTMLElement) =>
	Array.from(el.querySelectorAll<HTMLElement>('.sheetsmith-record-body'));
const nameFields = (el: HTMLElement) =>
	Array.from(
		el.querySelectorAll<HTMLInputElement>('.sheetsmith-record-name-input'),
	);
const bodyFields = (el: HTMLElement) =>
	Array.from(
		el.querySelectorAll<HTMLTextAreaElement>(
			'.sheetsmith-record-body-input',
		),
	);
const errors = (el: HTMLElement) =>
	Array.from(el.querySelectorAll<HTMLElement>('.sheetsmith-error'));
const addButton = (el: HTMLElement) =>
	el.querySelector<HTMLButtonElement>(
		'.sheetsmith-record-add',
	) as HTMLButtonElement;
const removeButtons = (el: HTMLElement) =>
	Array.from(
		el.querySelectorAll<HTMLButtonElement>('.sheetsmith-record-remove'),
	);

/** One labelled control inside the anchored form, by the word over it. */
function field(
	panel: HTMLElement,
	label: string,
): HTMLSelectElement | HTMLInputElement | null {
	for (const row of Array.from(
		panel.querySelectorAll('.sheetsmith-panel-field'),
	)) {
		if (
			row.querySelector('.sheetsmith-panel-field-label')?.textContent !==
			label
		) {
			continue;
		}
		return row.querySelector<HTMLSelectElement | HTMLInputElement>(
			'select, input',
		);
	}
	return null;
}

/** Type into one of the form's fields and leave it, which is what commits. */
function typeInto(
	input: HTMLSelectElement | HTMLInputElement | null,
	value: string,
): void {
	if (input === null) throw new Error('no such control');
	input.value = value;
	input.dispatchEvent(new Event('input'));
	input.dispatchEvent(new Event('change'));
	input.dispatchEvent(new Event('blur'));
}

/** A sheet whose only published name takes a modifier, which is all the form needs. */
function modifierContext(): NonNullable<
	RenderContext<RecordSetData>['modifiers']
> {
	const target = { name: 'armour_class', label: 'Armour class' };
	return {
		definitions: [],
		targets: [target],
		published: [target],
		bonusTypes: ['item'],
		// Parsed the way the sheet parses it, rather than handing the whole part
		// back as an amount: the form fills its fields from `typed`, so a stub that
		// lied about them would drive the form over values no sheet produces.
		outcomes: (part: string) => {
			const parsed = parseModifierPart(part);
			return [
				outcomeView({
					typed:
						parsed.kind === 'typed'
							? parsed.effect
							: {
									target: 'armour_class',
									operator: 'add' as const,
									amount: '',
								},
					target: 'armour_class',
					targetLabel: 'Armour class',
					applies: true,
					amount: 1,
				}),
			];
		},
		breakdown: () => ({ lines: [], override: null, total: 0 }),
		promote: () => Promise.resolve({ ok: true as const }),
	};
}

describe('recordSet.read', () => {
	it('reads a section of three records in file order', () => {
		const data = readData(BODY);
		const held = data.records;
		expect(Object.keys(held)).toEqual(['0', '1', '2']);
		expect(held[0]?.name).toBe('Second Wind');
		expect(held[1]?.name).toBe('Blessed Armour');
		expect(held[2]?.name).toBe('Lucky');
	});

	it("takes each record's fence as its fields and everything after it as its body", () => {
		const held = readData(BODY).records;
		expect(held[0]?.fields).toEqual({ Uses: '1', Attuned: 'no' });
		expect(held[0]?.body).toBe(
			'Once per short rest, regain 1d10 hit points as a bonus action.',
		);
		expect(held[1]?.fields?.Modifiers).toBe(
			'armour_class += 1 as item when Attuned',
		);
		expect(held[1]?.body).toBe(
			'A gift from the temple at [[Neverwinter]].',
		);
	});

	it('reads a record with no fence as a record with no fields', () => {
		// SPEC §10's "a section without a data block is empty, not malformed",
		// one level down.
		const data = readData('\n### Bare\n\nJust prose.\n');
		expect(data.records[0]?.fields).toEqual({});
		expect(data.records[0]?.body).toBe('Just prose.');
		expect(data.records[0]?.error).toBeNull();
	});

	it('reads a section holding no records as nothing stored yet', () => {
		// Not an error: a new character's list is its add control and nothing
		// else, which is what `data: null` already means everywhere.
		for (const body of [
			'',
			'\n',
			'   \n\t\n',
			'\nA preamble and no records.\n',
		]) {
			expect(recordSet.read(body, config)).toEqual({
				ok: true,
				data: null,
			});
		}
	});

	it('reports an unreadable fence on that record alone', () => {
		const body =
			'\n### Good\n```sheet\nUses: 1\n```\nFine.\n\n### Broken\n```sheet\nnot an entry\n```\nAlso fine.\n';
		const held = readData(body).records;
		expect(held[0]?.error).toBeNull();
		expect(held[1]?.error).toContain('not an entry');
		// And it names the action rather than only the fault (PATTERNS §4).
		expect(held[1]?.error).toContain(
			'every other one on this list still works',
		);
	});

	it('reports a fence that never closes, and keeps the record', () => {
		const held = readData('\n### Broken\n```sheet\nUses: 1\n').records;
		expect(held[0]?.name).toBe('Broken');
		expect(held[0]?.error).toContain('never closed');
	});

	it('does not treat "#### " as a record, which is what the refusal names', () => {
		const data = readData(
			'\n### One\n\n#### Not a record\n\nStill prose.\n',
		);
		expect(Object.keys(data.records)).toEqual(['0']);
		expect(data.records[0]?.body).toContain('#### Not a record');
	});
});

describe('recordSet round trip', () => {
	/*
	 * Constraint 3 over ten spellings of a section's whitespace, which is the
	 * acceptance criterion verbatim. It is also what holds `parse/records.ts`:
	 * every byte the splitter takes apart has to come back in the same order.
	 */
	const SPELLINGS: [string, string][] = [
		['no preamble', '### A\n```sheet\nUses: 1\n```\nProse.\n'],
		[
			'a preamble',
			'\nSome prose above the list.\n\n### A\n```sheet\nUses: 1\n```\nProse.\n',
		],
		[
			'blank lines between records',
			'\n### A\n\n```sheet\nUses: 1\n```\n\nProse.\n\n\n### B\n\nMore.\n',
		],
		['no blank line between records', '\n### A\nProse.\n### B\nMore.\n'],
		['CRLF', '\r\n### A\r\n```sheet\r\nUses: 1\r\n```\r\nProse.\r\n'],
		['a record with no fence', '\n### A\n\nJust prose.\n'],
		['a record with no body', '\n### A\n```sheet\nUses: 2\n```\n'],
		['a record with neither', '\n### A\n\n### B\n\n### C\n'],
		['a trailing newline', '\n### A\n```sheet\nUses: 1\n```\nProse.\n'],
		['no trailing newline', '\n### A\n```sheet\nUses: 1\n```\nProse.'],
	];

	it.each(SPELLINGS)('writes %s back byte for byte', (_name, body) => {
		expect(recordSet.write(readData(body), body, config)).toBe(body);
	});

	it('has ten spellings, so the list cannot quietly shrink', () => {
		// The criterion names ten; a case list that lost one would still pass
		// every case above by having fewer of them.
		expect(SPELLINGS).toHaveLength(10);
	});

	/*
	 * And ten spellings of a `number` entry carrying the ceiling it is read
	 * against, which is Constraint 3 over the shape this feature added.
	 *
	 * **What makes them all pass by construction is the thing worth naming, and
	 * it is also why they hold nothing about `parse/bounded-entry.ts`**:
	 * `RecordEntry.fields` holds the note's own bytes, composite or not, so the
	 * split happens *above* `read` and the identical string goes back in — this
	 * list never reaches that module at all. It has a test file of its own for
	 * that reason. What these assert is the component's half: that carrying a
	 * composite through read and write touches no byte. The spellings an *edit*
	 * preserves are the two cases below.
	 */
	const COMPOSITES: [string, string][] = [
		['spaced', 'Uses: 2 / 3'],
		['bare slash', 'Uses: 2/3'],
		['space before', 'Uses: 2 /3'],
		['space after', 'Uses: 2/ 3'],
		['tabs around the slash', 'Uses: 2\t/\t3'],
		['a blank value half', 'Uses:  / 3'],
		['a blank ceiling half', 'Uses: 2 /'],
		['a bare value', 'Uses: 2'],
		['a ceiling that is not a number', 'Uses: 2 / lots'],
		['a key the layout no longer declares', 'Retired: 4 / 8'],
	];

	it.each(COMPOSITES)('writes %s back byte for byte', (_name, entry) => {
		const body = `\n### A\n\`\`\`sheet\n${entry}\n\`\`\`\nProse.\n`;
		const owned: RecordSetConfig = {
			...config,
			fields: [{ key: 'Uses', type: 'number', maxSource: 'record' }],
		};
		// Both modes, because the split is applied to every `number` field's entry
		// whatever the mode: gating it on `maxSource` would turn every stored
		// composite into text the day a field was switched back.
		for (const from of [config, owned]) {
			expect(recordSet.write(readData(body, from), body, from)).toBe(
				body,
			);
		}
	});

	it('has ten composite spellings, so that list cannot shrink either', () => {
		expect(COMPOSITES).toHaveLength(10);
	});

	it("keeps the reader's own spelling of the slash when the value is edited", () => {
		const owned: RecordSetConfig = {
			...config,
			fields: [{ key: 'Uses', type: 'number', maxSource: 'record' }],
		};
		const odd = [
			'',
			'### A',
			'```sheet',
			'Uses: 2/3',
			'```',
			'Prose about A.',
			'',
			'### B',
			'```sheet',
			'Uses  :  1 /  4',
			'```',
			'Prose about B.',
			'',
		].join('\n');
		/*
		 * **Driven through the control, because the criterion is about an edit.**
		 * Handing `write` an already-joined `'1/3'` exercises `writeFenced`'s byte
		 * preservation and never reaches the join the criterion is about — the
		 * test would have supplied its own answer.
		 */
		const changes: RecordSetData[] = [];
		const el = render(owned, odd, {
			onChange: (data) => changes.push(data),
		});
		const value = records(el)[0]?.querySelector<HTMLInputElement>(
			'.sheetsmith-record-input',
		) as HTMLInputElement;
		value.value = '1';
		value.dispatchEvent(new Event('input'));
		value.dispatchEvent(new Event('blur'));
		// The join put the reader's own bare slash back rather than the canonical
		// form, which is the whole claim.
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '1/3' });
		const written = recordSet.write(
			changes[0] as RecordSetData,
			odd,
			owned,
		);
		// The reader's spelling of the slash *and* of the colon, and the
		// neighbour's odd spacing of both, all survive.
		expect(written).toBe(odd.replace('Uses: 2/3', 'Uses: 1/3'));
	});

	it("rewrites one record's fence line and leaves every other byte alone", () => {
		const odd = [
			'',
			'### A',
			'```sheet',
			'Uses:    1',
			'```',
			'Prose about A.',
			'',
			'',
			'### B',
			'```sheet',
			'Uses  :  2',
			'```',
			'Prose about B.',
			'',
		].join('\n');
		const written = recordSet.write(
			{ records: { 0: { fields: { Uses: '3' } } } },
			odd,
			config,
		);
		// The edited line takes the new value in the spacing it already had, and
		// the neighbour's odd spacing survives untouched.
		expect(written).toContain('Uses:    3');
		expect(written).toContain('Uses  :  2');
		expect(written).toBe(odd.replace('Uses:    1', 'Uses:    3'));
	});

	it('puts a fresh fence between the heading and the prose', () => {
		// Not after it: `writeFenced` appends, so writing into the whole body
		// would leave the fields under the words they belong to.
		const body = '\n### A\n\nJust prose.\n';
		const written = recordSet.write(
			{ records: { 0: { fields: { Uses: '2' } } } },
			body,
			config,
		);
		expect(written).toBe(
			'\n### A\n\n```sheet\nUses: 2\n```\n\nJust prose.\n',
		);
	});

	it('leaves an entry the layout no longer declares exactly where it is', () => {
		// SPEC §10, and Constraint 4: a layout change never deletes character
		// data, so a key nothing maps is read back and written back untouched.
		const body = '\n### A\n```sheet\nUses: 1\nRetired: 4\n```\nProse.\n';
		const data = readData(body);
		expect(data.records[0]?.fields?.Retired).toBe('4');
		expect(recordSet.write(data, body, config)).toBe(body);
		const edited = recordSet.write(
			{ records: { 0: { fields: { Uses: '2' } } } },
			body,
			config,
		);
		expect(edited).toContain('Retired: 4');
	});

	it('refuses every write into a record whose fence will not read', () => {
		// The addressing inside a block comes out of the read, so a block the
		// component cannot parse is one it must not write into.
		const body = '\n### Broken\n```sheet\nnot an entry\n```\nProse.\n';
		expect(
			recordSet.write(
				{
					records: {
						0: { fields: { Uses: '2' }, body: 'Replaced.' },
					},
				},
				body,
				config,
			),
		).toBe(body);
	});

	it('renames a record by rewriting its heading and nothing else', () => {
		const written = recordSet.write(
			{ records: { 1: { name: 'Blessed Plate' } } },
			BODY,
			config,
		);
		expect(written).toBe(
			BODY.replace('### Blessed Armour', '### Blessed Plate'),
		);
	});

	it('never writes a heading with no name after it', () => {
		// `### ` with nothing after it is not a heading, so a blank name would
		// drop the record on the next read and hand its body to the record above
		// it. Refused at the control and again here (Constraint 4).
		expect(
			recordSet.write({ records: { 0: { name: '   ' } } }, BODY, config),
		).toBe(BODY);
	});

	it('appends a record after a blank line, and removes one by position', () => {
		const added = recordSet.write(
			{ records: {}, added: [{ name: 'Feature' }] },
			BODY,
			config,
		);
		expect(added).toBe(`${BODY}\n### Feature\n`);
		expect(readData(added).records[3]?.name).toBe('Feature');

		const removed = recordSet.write(
			{ records: {}, removed: [1] },
			BODY,
			config,
		);
		const names = Object.values(readData(removed).records).map(
			(one) => one.name,
		);
		expect(names).toEqual(['Second Wind', 'Lucky']);
	});

	it('writes the first record into a section that has none', () => {
		expect(
			recordSet.write(
				{ records: {}, added: [{ name: 'Feature' }] },
				null,
				config,
			),
		).toBe('\n### Feature\n');
	});
});

describe('recordSet configuration', () => {
	function refuses(fields: RecordSetConfig['fields']): string {
		const el = render({ fields }, null);
		const message = errors(el)[0]?.textContent ?? '';
		expect(message, 'expected a configuration error').not.toBe('');
		return message;
	}

	it('refuses a text field that is not the group key and names the way out', () => {
		const message = refuses([{ key: 'Notes', type: 'text' }]);
		expect(message).toBe(
			`The field "Notes" holds text, which a list can hold only as the field it is grouped by. Set Group by to "Notes", or make it a number, level, toggle, computed or modifier field, or write the words in the feature's body instead.`,
		);
	});

	it('refuses every offered field type that cannot hold a value in a fence', () => {
		/*
		 * The scan the criterion asks for, over the *offered* types rather than a
		 * comment: the fields config reuses the shared columns editor, so whatever
		 * `COLUMN_TYPES` grows is what an author can pick here — and a type this
		 * component cannot store has to be refused rather than half-drawn.
		 *
		 * `text` is the one that is refused today, because nothing names it as the
		 * group key here. The floor is what stops this passing on an empty
		 * vocabulary.
		 */
		expect(COLUMN_TYPES.length).toBeGreaterThan(4);
		const refused = COLUMN_TYPES.filter((type) => {
			const el = render({ fields: [{ key: 'Field', type }] }, null);
			return errors(el).length > 0;
		});
		expect(refused).toEqual(['text']);
	});

	it('refuses a field with no type, which is what a fresh one is', () => {
		// The columns editor leaves `type` out for its own default, and that
		// default is `text` — so a hand-edited field with no type lands here
		// unless Group by names it. (The editor's Add handler writes a type out.)
		expect(refuses([{ key: 'Field' }])).toContain(
			'holds text, which a list can hold only as the field it is grouped by',
		);
	});

	it('refuses a key a fence could not hold, and a repeated one', () => {
		expect(refuses([{ key: 'Uses: left', type: 'number' }])).toContain(
			'cannot contain a colon',
		);
		expect(
			refuses([
				{ key: 'Uses', type: 'number' },
				{ key: 'uses', type: 'number' },
			]),
		).toContain('Two fields are both called');
		// Every configuration error names its fix (criterion 20), and this was the
		// one of nine that did not.
		const blank = refuses([{ key: '  ', type: 'number' }]);
		expect(blank).toContain('needs a key');
		expect(blank).toContain('"key: value"');
		expect(blank).toContain('Give it one, or remove it.');
	});

	it('refuses a total, a publish, a bad level list and an inverted bound', () => {
		expect(
			refuses([{ key: 'Uses', type: 'number', total: true }]),
		).toContain('sum(features, Uses)');
		expect(
			refuses([{ key: 'Uses', type: 'number', publish: true }]),
		).toContain('count(features, <expression>)');
		expect(
			refuses([{ key: 'Rank', type: 'level', levels: ['None'] }]),
		).toContain('at least two level names');
		expect(
			refuses([{ key: 'Rank', type: 'level', levels: ['None', ':*'] }]),
		).toContain('a mark but no name');
		expect(
			refuses([{ key: 'Uses', type: 'number', min: 4, max: 2 }]),
		).toContain('above its maximum');
	});

	it('fails read, publishes nothing and pushes nothing while it is refused', () => {
		const broken = {
			...config,
			fields: [{ key: 'Notes', type: 'text' as const }],
		};
		expect(recordSet.read(BODY, broken).ok).toBe(false);
		expect(recordSet.scopeRows?.(null, broken)).toBeUndefined();
		expect(recordSet.scopeModifiers?.(null, broken)).toBeUndefined();
	});

	it('draws its error into its own container and nothing else', () => {
		const el = render({ fields: [{ key: 'Notes', type: 'text' }] }, null);
		expect(errors(el)).toHaveLength(1);
		expect(el.querySelector('.sheetsmith-record-set')).toBeNull();
	});
});

describe('recordSet rendering', () => {
	it('is sized by its placement, and says so however much is in it', () => {
		/*
		 * The mechanism half of "the rendered height is identical with nothing
		 * open, one record open and every record open". happy-dom lays nothing
		 * out, so what a unit test can hold is that the box carries the placement
		 * floor and the list is the scrollport; the geometry is a look criterion.
		 */
		for (const openRecords of [[], [1], [0, 1, 2]]) {
			const el = render({}, BODY, { openRecords });
			const block = el.querySelector(
				'.sheetsmith-record-set',
			) as HTMLElement;
			expect(block.classList.contains('sheetsmith-placed')).toBe(true);
			expect(block.style.getPropertyValue('--sheetsmith-rows')).toBe('3');
			const box = el.querySelector(
				'.sheetsmith-record-set-box',
			) as HTMLElement;
			expect(box.classList.contains('sheetsmith-placed-box')).toBe(true);
			expect(
				box.querySelector('.sheetsmith-record-set-list'),
			).not.toBeNull();
			// And nothing anywhere sets a height per record, which is the other way
			// the box could come to be sized by what is open.
			for (const record of records(el)) {
				expect(record.style.height).toBe('');
			}
		}
	});

	it('draws one summary line per record, in file order', () => {
		const el = render();
		expect(nameFields(el).map((field) => field.value)).toEqual([
			'Second Wind',
			'Blessed Armour',
			'Lucky',
		]);
	});

	it('draws the add control as the box\'s foot, outside the scrolling list', () => {
		const el = render();
		const add = addButton(el);
		const box = el.querySelector('.sheetsmith-record-set-box') as Element;
		expect(add.parentElement).toBe(box);
		expect(box.lastElementChild).toBe(add);
		expect(
			el.querySelector('.sheetsmith-record-set-list')?.contains(add),
		).toBe(false);
		// Still after every record's controls, which the focus restore rests on.
		const names = nameFields(el);
		expect(
			(names[names.length - 1] as Element).compareDocumentPosition(add) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it('draws the empty state as a label and one add control', () => {
		const el = render({}, null);
		expect(records(el)).toHaveLength(0);
		expect(addButton(el).textContent).toBe('Add feature');
		expect(errors(el)).toHaveLength(0);
		expect(
			el.querySelector('.sheetsmith-component-label')?.textContent,
		).toBe('Features');
	});

	it("names the add control from the layout's own word", () => {
		expect(
			addButton(render({ recordName: 'Spell' }, null)).textContent,
		).toBe('Add spell');
		expect(
			addButton(render({ recordName: undefined }, null)).textContent,
		).toBe('Add record');
	});

	it('draws a record with a problem line and keeps every other one editable', () => {
		const body =
			'\n### Good\n```sheet\nUses: 1\n```\nFine.\n\n### Broken\n```sheet\nnot an entry\n```\nAlso here.\n\n### Also good\n\nProse.\n';
		const el = render({}, body);
		expect(records(el)).toHaveLength(3);
		// The broken one draws its name, its body and a problem line — and no
		// field controls, since every write into it would be refused.
		const broken = records(el)[1] as HTMLElement;
		expect(broken.textContent).toContain('Broken');
		expect(broken.textContent).toContain('Also here.');
		expect(broken.querySelector('.sheetsmith-error')).not.toBeNull();
		expect(
			broken.querySelector('.sheetsmith-record-name-input'),
		).toBeNull();
		expect(broken.querySelector('.sheetsmith-record-input')).toBeNull();
		// The neighbours keep everything.
		expect(nameFields(el).map((field) => field.value)).toEqual([
			'Good',
			'Also good',
		]);
		expect(bodyFields(el)).toHaveLength(2);
	});

	it('draws a number field with its name beside it, and a ring for a toggle', () => {
		const el = render();
		const first = records(el)[0] as HTMLElement;
		expect(
			first.querySelector('.sheetsmith-card-abbreviation')?.textContent,
		).toBe('Uses');
		const number = first.querySelector<HTMLInputElement>(
			'.sheetsmith-record-input',
		);
		expect(number?.value).toBe('1');
		expect(number?.getAttribute('aria-label')).toBe('Second Wind Uses');
		const ring = first.querySelector(
			'.sheetsmith-level-ring',
		) as HTMLElement;
		expect(ring.getAttribute('aria-pressed')).toBe('false');
		expect(
			(records(el)[1] as HTMLElement)
				.querySelector('.sheetsmith-level-ring')
				?.getAttribute('aria-pressed'),
		).toBe('true');
	});

	it('draws a declared ceiling beside a bounded number, and none without one', () => {
		/*
		 * `Uses 1` cannot say whether that is all of them or one of three, and a
		 * counter on a record the character added is the one thing a Track or a Pool
		 * beside the list could never provide — so the ceiling is part of the
		 * reading. Pool's own classes, because a lookalike beside them is what
		 * `docs/UI.md` §9 opens by forbidding, and Pool's *read-only* branch: a
		 * `max` here is a literal the layout declared, so there is nothing to type
		 * into.
		 */
		const el = render();
		const first = records(el)[0] as HTMLElement;
		const ceiling = first.querySelector(
			'.sheetsmith-pool-ceiling',
		) as HTMLElement;
		expect(ceiling.textContent).toBe('/3');
		expect(
			ceiling.querySelector('.sheetsmith-pool-separator')?.textContent,
		).toBe('/');
		expect(ceiling.querySelector('.sheetsmith-pool-max')?.textContent).toBe(
			'3',
		);
		// A read-only span and not a second field, so nothing invites a reader to
		// edit a number the layout owns.
		expect(ceiling.querySelector('input')).toBeNull();
		// Every record's ceiling is the field's, so all three carry it.
		expect(
			records(el).map(
				(record) =>
					record.querySelector('.sheetsmith-pool-max')?.textContent,
			),
		).toEqual(['3', '3', '3']);
		// And an unbounded number has no ceiling to draw, so it keeps its bare
		// value. A `min` alone changes nothing.
		const bare = render({
			fields: [{ key: 'Uses', type: 'number', min: 0 }],
		});
		expect(bare.querySelector('.sheetsmith-pool-ceiling')).toBeNull();
		expect(
			bare.querySelector<HTMLInputElement>('.sheetsmith-record-input')
				?.value,
		).toBe('1');
	});

	it("says the ceiling aloud where it draws one, on the pool's own spelling", () => {
		// The slash is read "of", and a bare span is `role=generic` — which
		// prohibits naming — so the live region is what carries the ceiling to a
		// reader who cannot see it.
		const el = render();
		const number = (records(el)[0] as HTMLElement).querySelector(
			'.sheetsmith-record-input',
		) as HTMLInputElement;
		number.value = '2';
		number.dispatchEvent(new Event('input'));
		number.dispatchEvent(new Event('blur'));
		expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toBe(
			'Second Wind Uses 2 of 3',
		);
		// Past the ceiling is held to it, and the message says what it was held to.
		number.value = '9';
		number.dispatchEvent(new Event('input'));
		number.dispatchEvent(new Event('blur'));
		expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toBe(
			'Second Wind Uses held to 3 of 3',
		);
	});

	it('names the field on every ring, and reaches the name without a hover', () => {
		/*
		 * **Not Table's named-level guard, and the heading strip is why.** A cell's
		 * field is named by its `<th>`, so only the level's word is missing there
		 * and a tooltip on a toggle would repeat legible text. A record has no
		 * `<th>`: a reader sees `Fireball · Level 3 · ●` and nothing on screen says
		 * the dot is "Prepared". So the `title` names the field on every ring, a
		 * named level adds its own word, and a long press is the route a finger has
		 * — UI §7 forbids a hover-only affordance, and every ring that ships on the
		 * sample sheet is a toggle.
		 */
		closePopover();
		const el = render();
		const toggle = records(el)[0]?.querySelector(
			'.sheetsmith-level-ring',
		) as HTMLElement;
		expect(toggle.getAttribute('title')).toBe('Second Wind Attuned');
		expect(toggle.getAttribute('aria-pressed')).toBe('false');
		// The touch route: a held press opens the same words, and the click it ends
		// in did not mean "cycle".
		const changes: RecordSetData[] = [];
		const touched = render({}, BODY, {
			onChange: (data) => changes.push(data),
		});
		const held = records(touched)[0]?.querySelector(
			'.sheetsmith-level-ring',
		) as HTMLElement;
		vi.useFakeTimers();
		try {
			hold(held, LONG_PRESS + 10, { pointerType: 'touch' });
			expect(
				document.querySelector('.sheetsmith-popover')?.textContent,
			).toBe('Second Wind Attuned');
			held.click();
			expect(changes).toEqual([]);
			closePopover();
		} finally {
			vi.useRealTimers();
		}

		// A named level adds its own word to the field's name.
		const named: RecordSetConfig = {
			...config,
			fields: [
				{
					key: 'Rank',
					type: 'level',
					levels: ['Untrained', 'Trained:', 'Expert:★'],
				},
			],
		};
		const graded = render(
			named,
			'\n### A\n```sheet\nRank: 2\n```\nProse.\n',
		);
		const ring = graded.querySelector(
			'.sheetsmith-level-ring',
		) as HTMLElement;
		expect(ring.getAttribute('title')).toBe('A Rank: Expert');
		expect(ring.getAttribute('aria-label')).toBe('A Rank: Expert');
		expect(ring.hasAttribute('aria-pressed')).toBe(false);
	});

	it("holds a typed number to the field's bounds", () => {
		const changes: RecordSetData[] = [];
		const el = render({}, BODY, { onChange: (data) => changes.push(data) });
		const number = records(el)[0]?.querySelector<HTMLInputElement>(
			'.sheetsmith-record-input',
		) as HTMLInputElement;
		number.value = '9';
		number.dispatchEvent(new Event('blur'));
		expect(number.value).toBe('3');
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '3' });
	});

	it('reports an edit as a delta naming only the field that changed', () => {
		const changes: RecordSetData[] = [];
		const el = render({}, BODY, { onChange: (data) => changes.push(data) });
		const ring = records(el)[0]?.querySelector(
			'.sheetsmith-level-ring',
		) as HTMLElement;
		ring.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(changes[0]).toEqual({
			records: { 0: { fields: { Attuned: 'yes' } } },
		});
		// And the write puts it in the note without touching anything else.
		expect(recordSet.write(changes[0] as RecordSetData, BODY, config)).toBe(
			BODY.replace('Attuned: no', 'Attuned: yes'),
		);
	});

	it('refuses a blank name and says what was kept', () => {
		const changes: RecordSetData[] = [];
		const el = render({}, BODY, { onChange: (data) => changes.push(data) });
		const field = nameFields(el)[0] as HTMLInputElement;
		field.value = '   ';
		field.dispatchEvent(new Event('blur'));
		expect(changes).toEqual([]);
		expect(field.value).toBe('Second Wind');
		expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toContain(
			'needs a name',
		);
	});
});

describe('a ceiling each record sets for itself', () => {
	/*
	 * `maxSource: 'record'`, which is Pool's `maxSource: 'character'` one level
	 * down: the ceiling lives inside the value's own entry, so a homebrew feature
	 * with three uses reads `2 / 3` on a layout that declares no maximum.
	 */
	const owned: RecordSetConfig = {
		...config,
		fields: [
			{ key: 'Uses', type: 'number', maxSource: 'record' },
			{ key: 'Attuned', type: 'toggle' },
		],
	};

	const OWN_BODY = [
		'',
		'### Second Wind',
		'```sheet',
		'Uses: 2 / 3',
		'Attuned: no',
		'```',
		'Prose.',
		'',
		'### Action Surge',
		'```sheet',
		'Uses: 1/1',
		'Attuned: no',
		'```',
		'Prose.',
		'',
		'### Keen Mind',
		'```sheet',
		'Uses:',
		'Attuned: yes',
		'```',
		'Prose.',
		'',
	].join('\n');

	/** The ceiling field on one record, where the reader owns it. */
	const ceilingField = (record: HTMLElement) =>
		record.querySelector<HTMLInputElement>(
			'.sheetsmith-pool-ceiling input',
		) as HTMLInputElement;
	/** The value field, which is the first record input on the line. */
	const valueField = (record: HTMLElement) =>
		record.querySelector<HTMLInputElement>(
			'.sheetsmith-record-input',
		) as HTMLInputElement;
	/** Type into a field and leave it, which is what commits. */
	const commit = (input: HTMLInputElement, value: string) => {
		input.value = value;
		input.dispatchEvent(new Event('input'));
		input.dispatchEvent(new Event('blur'));
	};

	it('reads a composite entry as a value and its ceiling', () => {
		const held = readData(OWN_BODY, owned).records;
		// **The bytes, unsplit.** `read` is unchanged: an entry's raw trimmed text
		// goes into `fields[key]` composite or not, which is what makes an
		// untouched write byte-identical.
		expect(held[0]?.fields?.Uses).toBe('2 / 3');
		expect(held[1]?.fields?.Uses).toBe('1/1');
		expect(held[2]?.fields?.Uses).toBe('');
	});

	it('draws an editable ceiling on every record, with a placeholder where none is set', () => {
		const el = render(owned, OWN_BODY);
		const shown = records(el);
		expect(shown).toHaveLength(3);
		for (const record of shown) {
			const ceiling = record.querySelector(
				'.sheetsmith-pool-ceiling',
			) as HTMLElement;
			// Pool's classes, borrowed rather than copied under a `record` name.
			expect(
				ceiling.querySelector('.sheetsmith-pool-separator')
					?.textContent,
			).toBe('/');
			const field = ceilingField(record);
			// The record's *own* field chrome plus the pool's reading, which is the
			// one place Pool's classes are deliberately not both taken: two fields
			// on one summary line must not answer a hover two different ways.
			expect(field.classList.contains('sheetsmith-record-input')).toBe(
				true,
			);
			expect(field.classList.contains('sheetsmith-pool-max')).toBe(true);
			expect(field.classList.contains('sheetsmith-pool-max-input')).toBe(
				false,
			);
			expect(field.placeholder).toBe('—');
		}
		expect(shown.map((record) => ceilingField(record).value)).toEqual([
			'3',
			'1',
			'',
		]);
		expect(shown.map((record) => valueField(record).value)).toEqual([
			'2',
			'1',
			'',
		]);
	});

	it('names the ceiling and names the record as its holder', () => {
		// A bare span is `role=generic`, which prohibits naming — so the read-only
		// ceiling reaches a screen reader only through the field's announcement.
		// An input is nameable, and both channels are kept rather than traded.
		const el = render(owned, OWN_BODY);
		const field = ceilingField(records(el)[0] as HTMLElement);
		expect(field.getAttribute('aria-label')).toBe(
			'Second Wind Uses maximum',
		);
		expect(field.getAttribute('title')).toBe(
			'Maximum Uses, held by this feature.',
		);
	});

	it('draws exactly what it draws today where maxSource is absent', () => {
		// A read-only span where the layout declares a `max`, nothing where it
		// does not, and a `min` alone changes neither.
		const declared = render({}, BODY);
		const first = records(declared)[0] as HTMLElement;
		expect(
			first.querySelector('.sheetsmith-pool-ceiling input'),
		).toBeNull();
		expect(first.querySelector('.sheetsmith-pool-max')?.textContent).toBe(
			'3',
		);
		const floored = render(
			{ fields: [{ key: 'Uses', type: 'number', min: 0 }] },
			BODY,
		);
		expect(floored.querySelector('.sheetsmith-pool-ceiling')).toBeNull();
	});

	it('writes a ceiling typed into a bare entry, and drops the separator when cleared', () => {
		const changes: RecordSetData[] = [];
		const el = render(owned, OWN_BODY, {
			onChange: (data) => changes.push(data),
		});
		// A record that had none: the canonical ` / ` is what this component
		// composes where no separator exists to preserve.
		commit(ceilingField(records(el)[2] as HTMLElement), '2');
		expect(changes[0]?.records[2]?.fields).toEqual({ Uses: ' / 2' });
		// And on a record whose value is already there.
		const bare = render(
			owned,
			'\n### A\n```sheet\nUses: 2\n```\nProse.\n',
			{ onChange: (data) => changes.push(data) },
		);
		commit(ceilingField(records(bare)[0] as HTMLElement), '3');
		expect(changes[1]?.records[0]?.fields).toEqual({ Uses: '2 / 3' });
		expect(
			recordSet.write(
				changes[1] as RecordSetData,
				'\n### A\n```sheet\nUses: 2\n```\nProse.\n',
				owned,
			),
		).toBe('\n### A\n```sheet\nUses: 2 / 3\n```\nProse.\n');
		// **Through a spelling that is not the canonical one**, which is the edit
		// the round-trip list above cannot reach: `1/1` keeps its bare slash.
		const spelled = render(owned, OWN_BODY, {
			onChange: (data) => changes.push(data),
		});
		commit(ceilingField(records(spelled)[1] as HTMLElement), '4');
		expect(changes[2]?.records[1]?.fields).toEqual({ Uses: '1/4' });
		expect(
			recordSet.write(changes[2] as RecordSetData, OWN_BODY, owned),
		).toBe(OWN_BODY.replace('Uses: 1/1', 'Uses: 1/4'));
		// Cleared, the entry goes back to a bare number rather than to `2 /`.
		const set = render(
			owned,
			'\n### A\n```sheet\nUses: 2 / 3\n```\nProse.\n',
			{ onChange: (data) => changes.push(data) },
		);
		commit(ceilingField(records(set)[0] as HTMLElement), '');
		expect(changes[3]?.records[0]?.fields).toEqual({ Uses: '2' });
		const written = recordSet.write(
			changes[3] as RecordSetData,
			'\n### A\n```sheet\nUses: 2 / 3\n```\nProse.\n',
			owned,
		);
		expect(written).toBe('\n### A\n```sheet\nUses: 2\n```\nProse.\n');
		// And each of those round-trips.
		expect(recordSet.write(readData(written, owned), written, owned)).toBe(
			written,
		);
	});

	it('composes each commit from what this field last wrote, not from the render', () => {
		/*
		 * **Two halves of one entry, edited before the rebuild lands.** A write is
		 * asynchronous — that is the whole reason `view/cell-focus.ts` exists — so
		 * both commits can leave one render, and each rebuilds the *whole* entry.
		 * Composed from the render's own snapshot, the second reverts the first's
		 * half: `docs/PATTERNS.md` §7's "report a delta, not a snapshot" one level
		 * down, where the delta is right at `fields[key]` and a snapshot inside it.
		 */
		const changes: RecordSetData[] = [];
		const el = render(owned, OWN_BODY, {
			onChange: (data) => changes.push(data),
		});
		const record = records(el)[0] as HTMLElement;
		commit(valueField(record), '1');
		commit(ceilingField(record), '5');
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '1 / 3' });
		// The value the reader just typed is still there.
		expect(changes[1]?.records[0]?.fields).toEqual({ Uses: '1 / 5' });
		// And the other order, since either field may be left first.
		const other = render(owned, OWN_BODY, {
			onChange: (data) => changes.push(data),
		});
		const second = records(other)[0] as HTMLElement;
		commit(ceilingField(second), '5');
		commit(valueField(second), '1');
		expect(changes[3]?.records[0]?.fields).toEqual({ Uses: '1 / 5' });
	});

	it("holds a value to the record's own ceiling and says what it was held to", () => {
		const changes: RecordSetData[] = [];
		const el = render(owned, OWN_BODY, {
			onChange: (data) => changes.push(data),
		});
		const value = valueField(records(el)[0] as HTMLElement);
		commit(value, '9');
		expect(value.value).toBe('3');
		expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toBe(
			'Second Wind Uses held to 3 of 3',
		);
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '3 / 3' });
	});

	it('clamps nothing and says no "of" on a record with no ceiling', () => {
		const changes: RecordSetData[] = [];
		const el = render(owned, OWN_BODY, {
			onChange: (data) => changes.push(data),
		});
		const value = valueField(records(el)[2] as HTMLElement);
		commit(value, '40');
		expect(value.value).toBe('40');
		expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toBe(
			'Keen Mind Uses 40',
		);
		expect(changes[0]?.records[2]?.fields).toEqual({ Uses: '40' });
	});

	it('writes only the ceiling when it is lowered under the value', () => {
		// Render, do not correct: `5 / 3` is drawn as it is stored, and no warning
		// treatment is added — the reading is what says it.
		const changes: RecordSetData[] = [];
		const body = '\n### A\n```sheet\nUses: 5 / 9\n```\nProse.\n';
		const el = render(owned, body, {
			onChange: (data) => changes.push(data),
		});
		commit(ceilingField(records(el)[0] as HTMLElement), '3');
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '5 / 3' });
		const written = recordSet.write(
			changes[0] as RecordSetData,
			body,
			owned,
		);
		const after = render(owned, written);
		const record = records(after)[0] as HTMLElement;
		expect(valueField(record).value).toBe('5');
		expect(ceilingField(record).value).toBe('3');
		expect(errors(after)).toEqual([]);
		expect(record.querySelector('.sheetsmith-modified')).toBeNull();
	});

	it("steps the ceiling with the arrows, holds it to the field's min, and settles no arithmetic", () => {
		const changes: RecordSetData[] = [];
		const bounded: RecordSetConfig = {
			...config,
			fields: [
				{ key: 'Uses', type: 'number', min: 2, maxSource: 'record' },
			],
		};
		const body = '\n### A\n```sheet\nUses: 2 / 3\n```\nProse.\n';
		const el = render(bounded, body, {
			onChange: (data) => changes.push(data),
		});
		const field = ceilingField(records(el)[0] as HTMLElement);
		field.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
		);
		expect(field.value).toBe('4');
		// A ceiling under the floor describes a range no value can occupy, and the
		// value beside it obeys that same floor. There is no upper bound to hold
		// a ceiling to.
		commit(field, '1');
		expect(field.value).toBe('2');
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '2 / 2' });
		// Pool settles `31+7`; a record's value field does not, so the ceiling
		// beside it must not either — two commit rules on one line is the defect
		// the whole design argues against.
		commit(field, '3+1');
		expect(changes[1]?.records[0]?.fields).toEqual({ Uses: '2 / 3+1' });
	});

	it('declines a note reference in either field and keeps the draft', () => {
		/*
		 * **Driven through both inputs**, because the pre-existing hole was
		 * invisible to a scan over the offered types: a `number` field is an
		 * `<input type="text">` and `boundedText` leaves text that is not a number
		 * exactly as typed, so a pasted `[[Ring]]` was written into the fence.
		 * Obsidian indexes no link inside one (Constraint 2).
		 */
		const body = '\n### A\n```sheet\nUses: 2 / 3\n```\nProse.\n';
		for (const which of ['value', 'ceiling'] as const) {
			const changes: RecordSetData[] = [];
			const el = render(owned, body, {
				onChange: (data) => changes.push(data),
			});
			const record = records(el)[0] as HTMLElement;
			const field =
				which === 'value' ? valueField(record) : ceilingField(record);
			commit(field, '[[Ring]]');
			expect(changes, which).toEqual([]);
			// The draft is kept, so what the reader typed is still on screen.
			expect(field.value, which).toBe('[[Ring]]');
			const said = errors(el)[0]?.textContent ?? '';
			expect(said, which).toContain('Not saved.');
			expect(said, which).toContain('code block');
			expect(said, which).toContain('[[Ring]]');
			// And Escape still puts the *stored* value back, which is what a
			// refusal inside `onCommit` could not have given.
			field.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
			);
			expect(field.value, which).toBe(which === 'value' ? '2' : '3');
			// The note is unchanged either way.
			expect(recordSet.write({ records: {} }, body, owned)).toBe(body);
		}
	});

	it('steps the value against the ceiling on screen, not the one at bind', () => {
		/*
		 * **The state the refusal above creates.** A ceiling draft holding a note
		 * reference is kept by design, so it is what the reader sees — and every
		 * other channel already follows it: nothing clamps, and the announcement
		 * carries no "of". A step bound captured at bind would go on holding the
		 * value to a number the line no longer says.
		 */
		const el = render(owned, OWN_BODY, {});
		const record = records(el)[0] as HTMLElement;
		const ceiling = ceilingField(record);
		const value = valueField(record);
		// Refused, so the draft stands and there is no ceiling any more.
		commit(ceiling, '[[Ring]]');
		expect(ceiling.value).toBe('[[Ring]]');
		value.focus();
		value.value = '8';
		value.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
		);
		expect(value.value).toBe('9');
		/*
		 * **And the second path, which is P2's window rather than a refusal.** A
		 * raised ceiling that has not been left cannot be reached — the value's
		 * arrows need focus in the value, and moving focus there blurs the ceiling
		 * and commits it. What *is* reachable is the moment after that: the commit
		 * is reported synchronously and the write is not, so until the rebuild
		 * lands the ceiling on screen is the new one and a bound captured at bind
		 * is the old one. Driven through real focus, so the state is one the app
		 * can actually produce.
		 */
		const changes: RecordSetData[] = [];
		const other = render(owned, OWN_BODY, {
			onChange: (data) => changes.push(data),
		});
		const second = records(other)[0] as HTMLElement;
		const raised = ceilingField(second);
		const beside = valueField(second);
		raised.focus();
		raised.value = '20';
		raised.dispatchEvent(new Event('input'));
		// Focus moves to the value, which blurs the ceiling and commits it. No
		// rebuild follows here, exactly as none has followed yet in the app.
		beside.focus();
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '2 / 20' });
		beside.value = '8';
		beside.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
		);
		expect(beside.value).toBe('9');
	});

	it('declines a slash in the value, so a ceiling cannot be typed away, and takes one in the ceiling', () => {
		/*
		 * The slash is syntax now. Committed into the value, `1/2` on an entry
		 * reading `2 / 3` would write `1/2 / 3`, which re-reads as a value of 1
		 * against a ceiling of `2 / 3` — so the ceiling the reader set goes
		 * silently. Nothing is deleted, so Constraint 4 holds.
		 */
		const body = '\n### A\n```sheet\nUses: 2 / 3\n```\nProse.\n';
		{
			const changes: RecordSetData[] = [];
			const el = render(owned, body, {
				onChange: (data) => changes.push(data),
			});
			const field = valueField(records(el)[0] as HTMLElement);
			commit(field, '1/2');
			expect(changes).toEqual([]);
			expect(field.value).toBe('1/2');
			expect(errors(el)[0]?.textContent).toContain('A slash separates');
			// Refused rather than repaired: nothing replaces what was typed.
			expect(recordSet.write({ records: {} }, body, owned)).toBe(body);
		}
		/*
		 * **A slash after the first is the ceiling's own, and it is division**
		 * (`docs/features/record-ceiling-formula.md`): the entry splits at its
		 * first slash, so `2 / 1/2` reads back as the value 2 against `1/2`.
		 */
		{
			const changes: RecordSetData[] = [];
			const el = render(owned, body, {
				onChange: (data) => changes.push(data),
			});
			commit(ceilingField(records(el)[0] as HTMLElement), '1/2');
			expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '2 / 1/2' });
		}
		// And a value that is merely not a number is still stored as typed, which
		// is `boundedText`'s standing rule and not what this refuses.
		const changes: RecordSetData[] = [];
		const fine = render(owned, body, {
			onChange: (data) => changes.push(data),
		});
		commit(valueField(records(fine)[0] as HTMLElement), 'frog');
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: 'frog / 3' });
	});

	it('goes on publishing the value to an aggregate in either mode', () => {
		/*
		 * **The sharp regression risk of the whole feature.** An aggregate reading
		 * `'2 / 3'` as text produces a name that is not a number and takes a card
		 * down with a `?`, which is why the split is applied to every `number`
		 * field's entry rather than only where the reader owns the ceiling.
		 */
		const body = [
			'',
			'### A',
			'```sheet',
			'Uses: 2 / 3',
			'```',
			'Prose.',
			'',
			'### B',
			'```sheet',
			'Uses: 1 / 1',
			'```',
			'Prose.',
			'',
		].join('\n');
		for (const from of [
			owned,
			{ ...config, fields: [{ key: 'Uses', type: 'number' }] },
			{
				...config,
				fields: [
					{
						key: 'Uses',
						type: 'number',
						maxSource: 'field' as const,
					},
				],
			},
		] as RecordSetConfig[]) {
			const rows = recordSet.scopeRows?.(readData(body, from), from);
			expect(rows, JSON.stringify(from.fields)).toBeDefined();
			const values = rows?.(() => null) ?? [];
			expect(values.map((one) => one.values['Uses'])).toEqual([2, 1]);
		}
	});

	it('reads a value half that is blank as zero, and keeps text as typed', () => {
		const body = [
			'',
			'### A',
			'```sheet',
			'Uses:  / 3',
			'```',
			'Prose.',
			'',
			'### B',
			'```sheet',
			'Uses: frog',
			'```',
			'Prose.',
			'',
			'### C',
			'```sheet',
			'Uses: 2 / lots',
			'```',
			'Prose.',
			'',
		].join('\n');
		const rows = recordSet.scopeRows?.(readData(body, owned), owned);
		const values = (rows?.(() => null) ?? []).map(
			(one) => one.values['Uses'],
		);
		// A blank value half is a blank value, which is zero to a formula; text
		// that is neither is kept exactly as it is; and a non-numeric ceiling
		// leaves the value beside it a number.
		expect(values).toEqual([0, 'frog', 2]);
		const el = render(owned, body);
		const shown = records(el);
		expect(shown.map((record) => valueField(record).value)).toEqual([
			'',
			'frog',
			'2',
		]);
		/*
		 * **A ceiling that is not a number is now a formula that will not work
		 * out**, and says so on its record (`docs/features/record-ceiling-formula.md`):
		 * `lots` is an unknown name, so the slot reads `?`, the line under the
		 * record names it, and nothing clamps to it. The stored text is in the field
		 * as typed, so the reader can see what to fix.
		 */
		expect(ceilingField(shown[2] as HTMLElement).value).toBe('lots');
		expect(
			shown[2]?.querySelector('.sheetsmith-record-worked-out-layer')
				?.textContent,
		).toBe('?');
		const lines = errors(shown[2] as HTMLElement).map((one) => one.textContent);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain('Uses maximum could not be worked out');
		expect(lines[0]).toContain('lots');
		const changes: RecordSetData[] = [];
		const live = render(owned, body, {
			onChange: (data) => changes.push(data),
		});
		commit(valueField(records(live)[2] as HTMLElement), '40');
		expect(changes[0]?.records[2]?.fields).toEqual({ Uses: '40 / lots' });
		/*
		 * **And the announcement agrees with the clamp**, which is the half that
		 * shipped wrong once: the live region took the ceiling's raw text while the
		 * clamp parsed it, so a record nothing clamped and `full` skipped still
		 * said "of lots" to the one reader who cannot see the field. A ceiling that
		 * will not work out holds nothing and is announced as nothing.
		 */
		expect(live.querySelector('.sheetsmith-sr-only')?.textContent).toBe(
			'C Uses 40',
		);
	});

	it('is not a configuration error beside a declared max, and reports no min above it', () => {
		// Where the ceiling is the record's, `config.max` is not read at all — so
		// reporting a relation between two numbers the component ignores would
		// send an author to fix a number nothing uses.
		const both: RecordSetConfig = {
			...config,
			fields: [
				{
					key: 'Uses',
					type: 'number',
					min: 5,
					max: 3,
					maxSource: 'record',
				},
			],
		};
		const el = render(both, OWN_BODY);
		expect(errors(el)).toEqual([]);
		// The declared `max` is ignored rather than drawn, and the reader's own
		// ceiling is what the value is read against.
		const record = records(el)[0] as HTMLElement;
		expect(ceilingField(record).value).toBe('3');
		// And the same field with the ceiling back on the field reports the
		// relation again, so the narrowing is not a licence.
		const back = recordSet.read(OWN_BODY, {
			...config,
			fields: [{ key: 'Uses', type: 'number', min: 5, max: 3 }],
		});
		expect(back.ok).toBe(false);
		if (back.ok) return;
		expect(back.error).toContain('minimum of 5');
		// And the record's own mode reads, which is the other half of the pair.
		expect(recordSet.read(OWN_BODY, both).ok).toBe(true);
	});

	it('ignores maxSource on every field that is not a number', () => {
		const others: RecordSetConfig = {
			...config,
			fields: [
				{ key: 'Attuned', type: 'toggle', maxSource: 'record' },
				{
					key: 'Rank',
					type: 'level',
					levels: ['None', 'Trained'],
					maxSource: 'record',
				},
				{
					key: 'Left',
					type: 'computed',
					formula: '1',
					maxSource: 'record',
				},
				{ key: 'Modifiers', type: 'modifier', maxSource: 'record' },
			],
		};
		const body = [
			'',
			'### A',
			'```sheet',
			'Attuned: yes',
			'Rank: 1',
			'```',
			'Prose.',
			'',
		].join('\n');
		const el = render(others, body);
		// Nothing is drawn for it — no ceiling anywhere on the line — and no
		// configuration error is reported, on `secondary` and `hideHeading`'s rule.
		expect(errors(el)).toEqual([]);
		expect(el.querySelector('.sheetsmith-pool-ceiling')).toBeNull();
		// And the key survives the round trip, because a hand-edited layout may
		// carry it.
		expect(recordSet.write(readData(body, others), body, others)).toBe(
			body,
		);
	});

	it('leaves every stored ceiling alone when the field is switched back', () => {
		// Pool's read-in-both-modes-used-in-one asymmetry: the layout's `max` is
		// drawn and clamped against, and the stored number is carried in the bytes
		// — including when the value beside it is edited.
		const body = [
			'',
			'### A',
			'```sheet',
			'Uses: 2 / 5',
			'```',
			'Prose.',
			'',
		].join('\n');
		const declared: RecordSetConfig = {
			...config,
			fields: [{ key: 'Uses', type: 'number', max: 3 }],
		};
		const el = render(declared, body);
		const record = records(el)[0] as HTMLElement;
		expect(
			record.querySelector('.sheetsmith-pool-ceiling input'),
		).toBeNull();
		expect(record.querySelector('.sheetsmith-pool-max')?.textContent).toBe(
			'3',
		);
		// The one honest cost: the note says `2 / 5` while the sheet draws `2 / 3`.
		const changes: RecordSetData[] = [];
		const live = render(declared, body, {
			onChange: (data) => changes.push(data),
		});
		commit(valueField(records(live)[0] as HTMLElement), '9');
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '3 / 5' });
		const written = recordSet.write(
			changes[0] as RecordSetData,
			body,
			declared,
		);
		expect(written).toContain('Uses: 3 / 5');
		// And switching back finds the ceiling still there.
		expect(
			ceilingField(records(render(owned, written))[0] as HTMLElement)
				.value,
		).toBe('5');
	});
});

describe('a ceiling that is a formula', () => {
	/*
	 * `docs/features/record-ceiling-formula.md`: the ceiling half of a
	 * record-owned entry may hold an expression, worked out in that record's
	 * stored scope against the sheet, and every channel reads the one answer.
	 */
	const FEATURES: RecordSetConfig = {
		...config,
		fields: [
			{ key: 'Uses', type: 'number', maxSource: 'record' },
			{ key: 'Bonus', type: 'number' },
			{ key: 'Twice', type: 'computed', formula: 'Bonus * 2' },
			{ key: 'Attuned', type: 'toggle' },
		],
	};

	/** The sheet's own names, mutable so a case can move `prof` under a record. */
	const sheetNames: Record<string, number> = {};
	const env = {
		...NO_ENV,
		sheet: (name: string) => sheetNames[name],
	};

	afterEach(() => {
		for (const key of Object.keys(sheetNames)) delete sheetNames[key];
	});

	const entry = (name: string, uses: string, extra: string[] = []) =>
		['', `### ${name}`, '```sheet', `Uses: ${uses}`, ...extra, '```', 'Prose.'].join(
			'\n',
		);

	/** A render whose context is the real one a sheet builds, through `formulaContext`. */
	function live(
		body: string,
		from: RecordSetConfig = FEATURES,
		ctx: Partial<RenderContext<RecordSetData>> = {},
	) {
		const data = readData(body, from);
		const el = document.createElement('div');
		document.body.appendChild(el);
		recordSet.render(el, from, data, {
			...context,
			...formulaContext(recordSet, from, data, env),
			...ctx,
		});
		return el;
	}

	const ceilingField = (record: HTMLElement) =>
		record.querySelector<HTMLInputElement>(
			'.sheetsmith-pool-ceiling input',
		) as HTMLInputElement;
	const valueField = (record: HTMLElement) =>
		record.querySelector<HTMLInputElement>(
			'.sheetsmith-record-input',
		) as HTMLInputElement;
	const layer = (record: HTMLElement) =>
		record.querySelector<HTMLElement>('.sheetsmith-record-worked-out-layer');
	const announced = (el: HTMLElement) =>
		el.querySelector('.sheetsmith-sr-only[aria-live]')?.textContent;
	const commit = (input: HTMLInputElement, value: string) => {
		input.value = value;
		input.dispatchEvent(new Event('input'));
		input.dispatchEvent(new Event('blur'));
	};

	it('draws what the formula came to, holds the value to it and announces it', () => {
		sheetNames.prof = 3;
		const changes: RecordSetData[] = [];
		const el = live(`${entry('Spellfire Flame', '1 / prof')}\n`, FEATURES, {
			onChange: (data) => changes.push(data),
		});
		const record = records(el)[0] as HTMLElement;
		expect(layer(record)?.textContent).toBe('3');
		expect(layer(record)?.classList.contains('sheetsmith-pool-max')).toBe(true);
		// The field holds the stored text, which is what focus shows.
		expect(ceilingField(record).value).toBe('prof');
		expect(errors(el)).toEqual([]);
		commit(valueField(record), '9');
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '3 / prof' });
		expect(announced(el)).toBe('Spellfire Flame Uses held to 3 of 3');
	});

	it('never evaluates a typed number, and draws exactly the DOM it drew before', () => {
		const resolveExpression = vi.fn(() => 99);
		const explainExpression = vi.fn(() => null);
		for (const uses of ['2 / 3', '2/3', '2 / 03', '2 / 1.5']) {
			const el = live(`${entry('A', uses)}\n`, FEATURES, {
				resolveExpression,
				explainExpression,
			});
			const record = records(el)[0] as HTMLElement;
			expect(record.querySelector('.sheetsmith-record-worked-out'), uses).toBeNull();
			const ceiling = record.querySelector('.sheetsmith-pool-ceiling') as HTMLElement;
			// The separator and the one field, children of the ceiling itself.
			expect(Array.from(ceiling.children).map((one) => one.tagName), uses).toEqual([
				'SPAN',
				'INPUT',
			]);
			expect(ceilingField(record).title).toBe('Maximum Uses, held by this feature.');
			// And the clamp still reads the typed number.
			commit(valueField(record), '50');
		}
		expect(resolveExpression).not.toHaveBeenCalled();
		expect(explainExpression).not.toHaveBeenCalled();
	});

	it("reads the record's own stored fields before the sheet, and no computed field", () => {
		sheetNames.Bonus = 10;
		sheetNames.Twice = 10;
		const body = [
			entry('Own', '1 / Bonus', ['Bonus: 4']),
			entry('Computed', '1 / Twice', ['Bonus: 4']),
			'',
		].join('\n');
		const el = live(body);
		const [own, computed] = records(el) as [HTMLElement, HTMLElement];
		expect(layer(own)?.textContent).toBe('4');
		// A computed field is not in a ceiling's scope, so `Twice` falls through to
		// the sheet's name of that spelling.
		expect(layer(computed)?.textContent).toBe('10');
	});

	it('draws ? and a line under the record on first render for every way a ceiling fails', () => {
		sheetNames.prof = 3;
		sheetNames.flag = 0;
		const body = [
			entry('Parse', '1 / prof +'),
			entry('Unknown', '1 / prfo'),
			entry('Boolean', '1 / prof > 2'),
			'',
		].join('\n');
		const el = live(body);
		const shown = records(el);
		for (const record of shown) {
			expect(layer(record)?.textContent).toBe('?');
			expect(layer(record)?.classList.contains('sheetsmith-pool-max-unresolved')).toBe(
				true,
			);
			const lines = errors(record);
			expect(lines).toHaveLength(1);
			expect(lines[0]?.textContent).toMatch(
				/^Uses maximum could not be worked out: .+ Change it after the slash, or clear it\.$/,
			);
		}
		expect(errors(shown[1] as HTMLElement)[0]?.textContent).toContain('prfo');
		expect(errors(shown[2] as HTMLElement)[0]?.textContent).toContain(
			'it came to "true", which is not a number.',
		);
		// Unclamped: a ceiling that cannot be worked out holds nothing.
		const changes: RecordSetData[] = [];
		const again = live(body, FEATURES, { onChange: (data) => changes.push(data) });
		commit(valueField(records(again)[1] as HTMLElement), '40');
		expect(changes[0]?.records[1]?.fields).toEqual({ Uses: '40 / prfo' });
	});

	it('draws the line where the field is hidden too, since a reset still counts it', () => {
		const hiding: RecordSetConfig = {
			...config,
			fields: [
				{ key: 'Shown', type: 'toggle' },
				{ key: 'Uses', type: 'number', maxSource: 'record', visibleWhen: 'Shown' },
			],
		};
		const el = live(`${entry('A', '1 / prfo', ['Shown: no'])}\n`, hiding);
		const record = records(el)[0] as HTMLElement;
		expect(record.querySelector('.sheetsmith-record-field-number')?.hasAttribute('hidden')).toBe(
			true,
		);
		expect(errors(record)).toHaveLength(1);
		expect(errors(record)[0]?.textContent).toContain('prfo');
	});

	it('evaluates nothing where the ceiling is not the record’s', () => {
		const resolveExpression = vi.fn(() => 3);
		for (const fields of [
			[{ key: 'Uses', type: 'number' as const }],
			[{ key: 'Uses', type: 'number' as const, maxSource: 'field' as const, max: 5 }],
		]) {
			const from = { ...config, fields };
			const el = live(`${entry('A', '1 / prfo')}\n`, from, { resolveExpression });
			expect(errors(el)).toEqual([]);
			expect(el.querySelector('.sheetsmith-record-worked-out')).toBeNull();
		}
		expect(resolveExpression).not.toHaveBeenCalled();
	});

	it('shows the text on focus and the number at rest, with the field in the tab order throughout', () => {
		sheetNames.prof = 2;
		const el = live(`${entry('A', '1 / prof')}\n`);
		const record = records(el)[0] as HTMLElement;
		const field = ceilingField(record);
		const stack = record.querySelector('.sheetsmith-record-worked-out') as HTMLElement;
		expect(field.tabIndex).toBe(0);
		expect(field.matches(FOCUSABLE)).toBe(true);
		expect(stack.classList.contains('sheetsmith-record-worked-out-focused')).toBe(false);
		field.focus();
		field.dispatchEvent(new FocusEvent('focus'));
		expect(stack.classList.contains('sheetsmith-record-worked-out-focused')).toBe(true);
		expect(field.value).toBe('prof');
		field.blur();
		field.dispatchEvent(new FocusEvent('blur'));
		expect(stack.classList.contains('sheetsmith-record-worked-out-focused')).toBe(false);
		expect(layer(record)?.textContent).toBe('2');
		// The layer takes no press, which is the stylesheet's to say.
		const css = readFileSync(
			join(dirname(fileURLToPath(import.meta.url)), '../styles/sheet.css'),
			'utf8',
		);
		const rule = /\.sheetsmith-record-worked-out-layer \{[^}]*\}/.exec(css)?.[0] ?? '';
		expect(rule).toContain('pointer-events: none');
	});

	it('takes `level / 2` and reads it back as the value and its ceiling, and still refuses a link in both', () => {
		sheetNames.level = 6;
		const changes: RecordSetData[] = [];
		const body = `${entry('A', '1')}\n`;
		const el = live(body, FEATURES, { onChange: (data) => changes.push(data) });
		commit(ceilingField(records(el)[0] as HTMLElement), 'level / 2');
		const written = recordSet.write(changes[0] as RecordSetData, body, FEATURES);
		expect(written).toContain('Uses: 1 / level / 2');
		const back = live(written);
		const record = records(back)[0] as HTMLElement;
		expect(valueField(record).value).toBe('1');
		expect(ceilingField(record).value).toBe('level / 2');
		expect(layer(record)?.textContent).toBe('3');
		for (const pick of [valueField, ceilingField]) {
			const refused: RecordSetData[] = [];
			const fresh = live(body, FEATURES, { onChange: (data) => refused.push(data) });
			commit(pick(records(fresh)[0] as HTMLElement), '[[Prof]]');
			expect(refused).toEqual([]);
		}
	});

	it('takes letters on a phone, and steps a typed number but not a formula', () => {
		sheetNames.prof = 2;
		const el = live([entry('Typed', '1 / 3'), entry('Formula', '1 / prof'), ''].join('\n'));
		const [typed, formula] = records(el) as [HTMLElement, HTMLElement];
		for (const record of [typed, formula]) {
			expect(ceilingField(record).inputMode).toBe('text');
		}
		// The value field keeps its keypad.
		expect(valueField(typed).inputMode).toBe('numeric');
		const step = (input: HTMLInputElement) => {
			input.focus();
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
		};
		step(ceilingField(typed));
		expect(ceilingField(typed).value).toBe('4');
		step(ceilingField(formula));
		expect(ceilingField(formula).value).toBe('prof');
	});

	it('stores a formula that will not parse as typed, and says what is wrong', () => {
		const changes: RecordSetData[] = [];
		const body = `${entry('A', '1 / 3')}\n`;
		const el = live(body, FEATURES, { onChange: (data) => changes.push(data) });
		const record = records(el)[0] as HTMLElement;
		commit(ceilingField(record), 'prof +');
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '1 / prof +' });
		expect(announced(el)).toBe('A Uses maximum prof +, which could not be worked out');
		// The rebuild draws the parser's sentence under the record.
		const back = live(recordSet.write(changes[0] as RecordSetData, body, FEATURES));
		const line = errors(records(back)[0] as HTMLElement)[0]?.textContent ?? '';
		expect(line).toContain('Uses maximum could not be worked out:');
		expect(line).toContain('formula');
		expect(ceilingField(records(back)[0] as HTMLElement).title).toBe(
			'Maximum Uses, held by this feature. Worked out from prof +.',
		);
	});

	it('draws a ceiling above its value as it is, and holds a step to it', () => {
		sheetNames.prof = 2;
		const changes: RecordSetData[] = [];
		const body = `${entry('A', '3 / prof')}\n`;
		const el = live(body, FEATURES, { onChange: (data) => changes.push(data) });
		const record = records(el)[0] as HTMLElement;
		expect(valueField(record).value).toBe('3');
		expect(layer(record)?.textContent).toBe('2');
		expect(changes).toEqual([]);
		const value = valueField(record);
		value.focus();
		value.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
		value.dispatchEvent(new Event('blur'));
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '2 / prof' });
	});

	it('leaves what a list adds up untouched by any ceiling', () => {
		const body = [entry('A', '2 / prof'), entry('B', '1 / prfo'), entry('C', '3 / 4'), ''].join(
			'\n',
		);
		const rows = recordSet.scopeRows?.(readData(body, FEATURES), FEATURES);
		expect((rows?.(() => null) ?? []).map((one) => one.values['Uses'])).toEqual([2, 1, 3]);
	});

	it('draws ? and its line where the host hands it no evaluator, never a number', () => {
		const el = render(FEATURES, `${entry('A', '1 / prof')}\n`);
		const record = records(el)[0] as HTMLElement;
		expect(layer(record)?.textContent).toBe('?');
		expect(errors(record)[0]?.textContent).toContain(
			'there is no sheet here to work "prof" out against.',
		);
	});

	it('round-trips every spelling of a formula ceiling byte for byte', () => {
		for (const uses of ['1 / prof', '1/prof', '0 / max(1, abilities.WIS)', '1 / level / 2']) {
			const body = `${entry('A', uses)}\n`;
			expect(recordSet.write(readData(body, FEATURES), body, FEATURES), uses).toBe(body);
		}
	});

	it('offers the formula suggester on the ceiling alone, with the list’s own id', () => {
		const suggestFormula = vi.fn<(input: HTMLInputElement, owner: string) => void>();
		const el = live(`${entry('A', '1 / prof')}\n${entry('B', '2')}\n`, FEATURES, {
			suggestFormula,
		});
		const shown = records(el);
		expect(suggestFormula).toHaveBeenCalledTimes(2);
		expect(suggestFormula.mock.calls.map(([input]) => input)).toEqual(
			shown.map((record) => ceilingField(record)),
		);
		for (const [, owner] of suggestFormula.mock.calls) expect(owner).toBe(FEATURES.id);
	});

	describe('at a reset', () => {
		const LIST = [
			entry('Spellfire', '0 / prof', ['Attuned: no']),
			entry('Broken', '0 / prfo', ['Attuned: no']),
			entry('Typed', '0 / 3', ['Attuned: no']),
			entry('Passive', '', ['Attuned: no']),
			'',
		].join('\n');

		/**
		 * Without `Bonus`, whose field-owned ceiling is missing and would fail
		 * `full` whole — the existing rule, which is not what these cases are about.
		 */
		const RESTING: RecordSetConfig = {
			...config,
			fields: [
				{ key: 'Uses', type: 'number', maxSource: 'record' },
				{ key: 'Attuned', type: 'toggle' },
			],
		};

		function press(
			reset: ResetBinding,
			{ from = RESTING, body = LIST }: { from?: RecordSetConfig; body?: string } = {},
		) {
			const cfg: RecordSetConfig = { ...from, reset: [reset] };
			const data = readData(body, cfg);
			const result = recordSet.applyReset?.(
				data,
				cfg,
				reset,
				bindingContext(
					makeFieldResolver(recordSet, cfg, data, env),
					makeFieldExplainer(recordSet, cfg, data, env),
					0,
					new Map(),
					makeFormulaReaders(recordSet, cfg, data, env).resolveExpression,
				),
			);
			if (result === undefined) throw new Error('expected a reset');
			const written = result.ok ? recordSet.write(result.data, body, cfg) : body;
			const fields: Record<string, Record<string, string> | undefined> = {};
			for (const one of Object.values(readData(written, cfg).records)) {
				fields[one.name ?? ''] = one.fields;
			}
			return { result, written, fields };
		}

		it('refills every other record to its own ceiling, skips the one that fails, and still sets its toggles', () => {
			sheetNames.prof = 2;
			const { result, fields } = press({ trigger: 'Long rest', action: 'full' });
			expect(result).toMatchObject({ ok: true });
			expect(fields.Spellfire?.Uses).toBe('2 / prof');
			expect(fields.Broken?.Uses).toBe('0 / prfo');
			expect(fields.Broken?.Attuned).toBe('yes');
			expect(fields.Typed?.Uses).toBe('3 / 3');
			expect(fields.Passive?.Uses).toBe('');
			// One record skipped for its ceiling; the passive one is not a counter.
			expect(result.ok && result.skipped).toBe(
				'1 feature skipped, its maximum could not be worked out',
			);
		});

		it('writes a lowered ceiling on a full rest', () => {
			sheetNames.prof = 2;
			const { fields } = press(
				{ trigger: 'Long rest', action: 'full' },
				{ body: `${entry('A', '3 / prof')}\n` },
			);
			expect(fields.A?.Uses).toBe('2 / prof');
		});

		it('skips the failing field under formula, and empties it under empty', () => {
			sheetNames.prof = 2;
			const formula = press({ trigger: 'Long rest', action: 'formula', to: '5' });
			expect(formula.fields.Spellfire?.Uses).toBe('2 / prof');
			expect(formula.fields.Broken?.Uses).toBe('0 / prfo');
			expect(formula.result.ok && formula.result.skipped).toBe(
				'1 feature skipped, its maximum could not be worked out',
			);
			const empty = press(
				{ trigger: 'Long rest', action: 'empty' },
				{ body: LIST.replace('0 / prfo', '2 / prfo') },
			);
			expect(empty.fields.Broken?.Uses).toBe('0 / prfo');
			expect(empty.result.ok && empty.result.skipped).toBeUndefined();
		});

		it('skips the same way under a named field and a condition, and still counts the record reached', () => {
			sheetNames.prof = 2;
			const named = press({ trigger: 'Long rest', action: 'full', column: 'Uses' });
			expect(named.fields.Broken?.Uses).toBe('0 / prfo');
			expect(named.fields.Spellfire?.Uses).toBe('2 / prof');
			expect(named.result.ok && named.result.skipped).toBe(
				'1 feature skipped, its maximum could not be worked out',
			);
			const scoped = press({
				trigger: 'Long rest',
				action: 'full',
				where: 'Attuned == false',
			});
			expect(scoped.result.ok && scoped.result.reach).toEqual({ reached: 4, of: 4 });
			expect(scoped.fields.Broken?.Uses).toBe('0 / prfo');
			expect(scoped.result.ok && scoped.result.skipped).toBe(
				'1 feature skipped, its maximum could not be worked out',
			);
		});

		it('counts several, and says nothing where nothing was skipped', () => {
			const several = press(
				{ trigger: 'Long rest', action: 'full' },
				{ body: LIST.replace('0 / prof', '0 / prof +') },
			);
			// No `prof` on this sheet, so both formulas fail.
			expect(several.result.ok && several.result.skipped).toBe(
				'2 features skipped, their maximums could not be worked out',
			);
			const clean = press(
				{ trigger: 'Long rest', action: 'full' },
				{ body: `${entry('A', '0 / 3')}\n${entry('B', '')}\n` },
			);
			expect(clean.result.ok).toBe(true);
			expect(clean.result.ok && 'skipped' in clean.result).toBe(false);
		});
	});
});

describe("a record's name and its links", () => {
	const linked =
		'\n### [[Sunblade|sword]]\n\nProse.\n\n### [[Nowhere]]\n\nMore.\n';

	function withVault(
		exists: readonly string[],
		extra: Partial<RenderContext<RecordSetData>> = {},
	) {
		return render({}, linked, {
			link: {
				resolves: (target) => exists.includes(target),
				open: () => undefined,
				preview: () => undefined,
			},
			...extra,
		});
	}

	it('renders a wikilink as a link, faint where the note does not exist', () => {
		const el = withVault(['Sunblade']);
		const anchors = Array.from(el.querySelectorAll<HTMLAnchorElement>('a'));
		expect(anchors.map((a) => a.textContent)).toEqual(['sword', 'Nowhere']);
		expect(anchors[0]?.classList.contains('is-unresolved')).toBe(false);
		expect(anchors[1]?.classList.contains('is-unresolved')).toBe(true);
		// The alias earns a `title` naming its target, never an `aria-label`.
		expect(anchors[0]?.getAttribute('title')).toBe('Sunblade');
		expect(anchors[0]?.getAttribute('aria-label')).toBeNull();
	});

	it('opens on a press and passes the event that says "new tab"', () => {
		const open = vi.fn();
		const el = render({}, linked, {
			link: { resolves: () => true, open, preview: () => undefined },
		});
		const anchor = el.querySelector('a') as HTMLAnchorElement;
		anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		anchor.dispatchEvent(
			new MouseEvent('click', { bubbles: true, metaKey: true }),
		);
		expect(open).toHaveBeenCalledTimes(2);
		expect((open.mock.calls[0]?.[1] as MouseEvent).metaKey).toBe(false);
		expect((open.mock.calls[1]?.[1] as MouseEvent).metaKey).toBe(true);
	});

	it('edits as the raw text the note holds', () => {
		const el = withVault(['Sunblade']);
		expect(nameFields(el)[0]?.value).toBe('[[Sunblade|sword]]');
	});

	it('names a record by what a reader sees, never by what the file spells', () => {
		const el = withVault(['Sunblade']);
		expect(removeButtons(el)[0]?.getAttribute('aria-label')).toBe(
			'Delete sword',
		);
	});
});

describe('the disclosure', () => {
	it('opens nothing on first render, and wires the chevron to its body', () => {
		const el = render();
		expect(
			chevrons(el).map((one) => one.getAttribute('aria-expanded')),
		).toEqual(['false', 'false', 'false']);
		for (const [at, body] of bodies(el).entries()) {
			expect(body.getAttribute('hidden')).toBe('until-found');
			expect(chevrons(el)[at]?.getAttribute('aria-controls')).toBe(
				body.id,
			);
			expect(body.id).not.toBe('');
		}
	});

	it('opens on a press, closes on a second, and reports each', () => {
		const toggles: [number, boolean][] = [];
		const el = render({}, BODY, {
			onToggleRecord: (index, open) => toggles.push([index, open]),
		});
		const chevron = chevrons(el)[1] as HTMLButtonElement;
		chevron.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(chevron.getAttribute('aria-expanded')).toBe('true');
		expect(bodies(el)[1]?.hasAttribute('hidden')).toBe(false);
		chevron.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(chevron.getAttribute('aria-expanded')).toBe('false');
		expect(bodies(el)[1]?.getAttribute('hidden')).toBe('until-found');
		expect(toggles).toEqual([
			[1, true],
			[1, false],
		]);
	});

	it('holds two records open at once', () => {
		const el = render({}, BODY, { openRecords: [0, 2] });
		expect(bodies(el).map((one) => one.hasAttribute('hidden'))).toEqual([
			false,
			true,
			false,
		]);
	});

	it('clamps an open set pointing past the end', () => {
		// The reader's posture outlives the note, exactly as a tab index does.
		const el = render({}, BODY, { openRecords: [7, -1, 1.5, 1] });
		expect(bodies(el).map((one) => one.hasAttribute('hidden'))).toEqual([
			true,
			false,
			true,
		]);
	});

	it('carries a beforematch listener, so find-in-page can open a closed body', () => {
		/*
		 * happy-dom implements neither `hidden="until-found"` nor `beforematch`,
		 * so what a test can hold is the wiring: the attribute is the value rather
		 * than the boolean, and the event the browser would fire is listened for.
		 * The same bargain `visibility`/`inert` took on Tab set.
		 */
		const toggles: [number, boolean][] = [];
		const el = render({}, BODY, {
			onToggleRecord: (index, open) => toggles.push([index, open]),
		});
		const body = bodies(el)[2] as HTMLElement;
		body.dispatchEvent(new Event('beforematch'));
		expect(body.hasAttribute('hidden')).toBe(false);
		expect(chevrons(el)[2]?.getAttribute('aria-expanded')).toBe('true');
		expect(toggles).toEqual([[2, true]]);
	});

	it('moves the open set up past a record that is deleted above it', () => {
		const toggles: [number, boolean][] = [];
		const el = render({}, BODY, {
			openRecords: [2],
			onToggleRecord: (index, open) => toggles.push([index, open]),
		});
		const remove = removeButtons(el)[0] as HTMLButtonElement;
		remove.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		remove.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		// Record 2 was open; record 0 is going, so what stays open is record 1.
		expect(toggles).toEqual([
			[2, false],
			[1, true],
		]);
	});
});

describe("a record's body", () => {
	it('draws the prose over a field holding the same text', () => {
		const el = render({}, BODY, { openRecords: [0] });
		expect(bodyFields(el)[0]?.value).toBe(
			'Once per short rest, regain 1d10 hit points as a bonus action.',
		);
		expect(
			bodies(el)[0]?.querySelector('.sheetsmith-record-body-rendered')
				?.textContent,
		).toContain('Once per short rest');
	});

	it('commits a body edit as a delta on that record', () => {
		const changes: RecordSetData[] = [];
		const el = render({}, BODY, { onChange: (data) => changes.push(data) });
		const field = bodyFields(el)[2] as HTMLTextAreaElement;
		field.value = 'Four rerolls a day.';
		field.dispatchEvent(new Event('blur'));
		expect(changes[0]).toEqual({
			records: { 2: { body: 'Four rerolls a day.' } },
		});
		expect(recordSet.write(changes[0] as RecordSetData, BODY, config)).toBe(
			BODY.replace('Three rerolls a day.', 'Four rerolls a day.'),
		);
	});

	it.each([
		['## ', '## A section', 'a new section in this note'],
		['### ', '### A record', 'a new feature in this list'],
	])(
		'declines a body holding %s at the start of a line',
		(_mark, line, said) => {
			const changes: RecordSetData[] = [];
			const el = render({}, BODY, {
				onChange: (data) => changes.push(data),
			});
			const field = bodyFields(el)[0] as HTMLTextAreaElement;
			const draft = `Some prose.\n\n${line}\n\nMore prose.`;
			field.value = draft;
			field.dispatchEvent(new Event('blur'));
			// Nothing reaches the note, the field keeps the draft, and the message
			// names the line and the fix.
			expect(changes).toEqual([]);
			expect(field.value).toBe(draft);
			const message = errors(el)[0]?.textContent ?? '';
			expect(message).toContain(line);
			expect(message).toContain(said);
			expect(message).toContain('#### ');
			// And the draft is what is on screen while it is refused.
			expect(
				bodies(el)[0]?.classList.contains(
					'sheetsmith-record-body-refused',
				),
			).toBe(true);
		},
	);

	/*
	 * The second consumer of `interaction/markdown-typing.ts`: the body is bound
	 * by the same `bindMultiline` as a Rich text block, so it closes brackets
	 * and continues lists with nothing in this component knowing. The full set
	 * of cases is `rich-text.test.ts`'s; these prove the body has it.
	 */
	/**
	 * Undone after each case, passed or not, so a failing assertion cannot
	 * leave the shim on the shared document or the list attached to it.
	 */
	const cleanups: (() => void)[] = [];
	afterEach(() => {
		for (const cleanup of cleanups.splice(0)) cleanup();
	});

	/** Attach the rendered list and install the shim, both undone after the case. */
	const attached = (el: HTMLElement) => {
		document.body.appendChild(el);
		const field = bodyFields(el)[0] as HTMLTextAreaElement;
		const shim = installExecCommand(field.ownerDocument);
		cleanups.push(() => {
			shim.restore();
			el.remove();
		});
		return { field, shim };
	};

	const typeInto = (field: HTMLTextAreaElement, inputType: string, data: string | null = null) => {
		const event = beforeinput(field, inputType, data);
		field.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
	};

	it('closes brackets as they are typed in the body', () => {
		const el = render({}, BODY, { openRecords: [0] });
		const { field, shim } = attached(el);
		field.value = 'See ';
		field.focus();
		field.setSelectionRange(4, 4);
		typeInto(field, 'insertText', '[');
		typeInto(field, 'insertText', '[');
		expect(field.value).toBe('See [[]]');
		typeInto(field, 'insertText', ']');
		typeInto(field, 'insertText', ']');
		expect([field.value, field.selectionStart]).toEqual(['See [[]]', 8]);
		expect(shim.calls.every((call) => call.doc === field.ownerDocument)).toBe(
			true,
		);
	});

	it('continues a list in the body, and a body holding ### still refuses on blur', () => {
		const changes: RecordSetData[] = [];
		const el = render({}, BODY, {
			openRecords: [0],
			onChange: (data) => changes.push(data),
		});
		const { field } = attached(el);
		field.value = '### A record\n\n- a';
		field.focus();
		field.setSelectionRange(field.value.length, field.value.length);
		typeInto(field, 'insertLineBreak');
		expect(field.value).toBe('### A record\n\n- a\n- ');
		// Continuation writes a marker, never a `#`, so the refusal is the one
		// the existing text earns and no new one: its message is unchanged.
		field.blur();
		expect(changes).toEqual([]);
		const message = errors(el)[0]?.textContent ?? '';
		expect(message).toContain('### A record');
		expect(message).toContain('a new feature in this list');
	});

	it("draws the app's markdown where there is a renderer, and paragraphs where there is not", () => {
		const renderMarkdown = vi.fn((markdown: string, into: HTMLElement) => {
			into.textContent = `rendered: ${markdown}`;
		});
		const el = render({}, BODY, { renderMarkdown });
		expect(renderMarkdown).toHaveBeenCalledTimes(3);
		expect(
			bodies(el)[0]?.querySelector('.sheetsmith-record-body-rendered')
				?.textContent,
		).toContain('rendered: Once per short rest');
		// And the fallback again where the renderer rejected.
		const failing = render({}, BODY, {
			renderMarkdown: (_markdown, _into, onFailure) => onFailure(),
		});
		expect(
			bodies(failing)[0]?.querySelector('.sheetsmith-record-body-plain'),
		).not.toBeNull();
	});
});

describe('adding and deleting a record', () => {
	it('writes a named record and lands focus in its name field', () => {
		const changes: RecordSetData[] = [];
		const el = render({}, BODY, { onChange: (data) => changes.push(data) });
		addButton(el).dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(changes[0]).toEqual({
			records: {},
			added: [{ name: 'Feature' }],
		});
		// The next render is the one that lands focus, because the record does not
		// exist until the note has it.
		const written = recordSet.write(
			changes[0] as RecordSetData,
			BODY,
			config,
		);
		const after = render({}, written);
		const fields = nameFields(after);
		expect(after.ownerDocument.activeElement).toBe(
			fields[fields.length - 1],
		);
		expect(fields[fields.length - 1]?.value).toBe('Feature');
	});

	it('lands focus in the list that was pressed, not the one that draws first', () => {
		/*
		 * **The defect a bare flag had.** The view draws every component in one
		 * pass, so a list drawing earlier in grid order used to consume the flag a
		 * later one had set — focus landed nowhere, silently, on a control that had
		 * blurred itself. The harness fixture holds two Record sets, so this was
		 * reachable today.
		 */
		const second = render({ id: 'spells', label: 'Spells' }, BODY, {
			onChange: () => undefined,
		});
		addButton(second).dispatchEvent(
			new MouseEvent('click', { bubbles: true }),
		);
		// The other list renders first, exactly as the grid would draw it.
		const first = render({ id: 'features' }, BODY);
		expect(first.ownerDocument.activeElement).not.toBe(
			nameFields(first)[nameFields(first).length - 1],
		);
		// And the list that was pressed still gets its landing.
		const grown = recordSet.write(
			{ records: {}, added: [{ name: 'Spell' }] },
			BODY,
			config,
		);
		const again = render({ id: 'spells', label: 'Spells' }, grown);
		const fields = nameFields(again);
		expect(again.ownerDocument.activeElement).toBe(
			fields[fields.length - 1],
		);
	});

	it('lands nothing where the write never grew the list', () => {
		// A failed write produces no re-render, so a standing flag would sit armed
		// until some later unrelated render of the same list stole focus.
		const el = render({}, BODY, { onChange: () => undefined });
		addButton(el).dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const again = render({}, BODY);
		const fields = nameFields(again);
		expect(again.ownerDocument.activeElement).not.toBe(
			fields[fields.length - 1],
		);
	});

	it('arms on the first press, commits on the second', () => {
		const changes: RecordSetData[] = [];
		const el = render({}, BODY, { onChange: (data) => changes.push(data) });
		const remove = removeButtons(el)[1] as HTMLButtonElement;
		remove.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(changes).toEqual([]);
		expect(
			remove.classList.contains('sheetsmith-record-remove-armed'),
		).toBe(true);
		expect(remove.getAttribute('aria-label')).toContain('Blessed Armour');
		expect(remove.getAttribute('aria-label')).toContain('Select again');
		remove.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(changes[0]).toEqual({ records: {}, removed: [1] });
	});

	it('stands down on Escape, on a press elsewhere, and on focus leaving', () => {
		const el = render();
		const remove = removeButtons(el)[0] as HTMLButtonElement;
		const arm = () =>
			remove.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const armed = () =>
			remove.classList.contains('sheetsmith-record-remove-armed');

		arm();
		remove.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(armed()).toBe(false);

		arm();
		document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(armed()).toBe(false);

		arm();
		remove.dispatchEvent(new Event('blur'));
		expect(armed()).toBe(false);
	});

	it('arms one control at a time', () => {
		const el = render();
		const [first, second] = removeButtons(el) as [
			HTMLButtonElement,
			HTMLButtonElement,
		];
		first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		second.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(first.classList.contains('sheetsmith-record-remove-armed')).toBe(
			false,
		);
		expect(
			second.classList.contains('sheetsmith-record-remove-armed'),
		).toBe(true);
	});
});

describe('what a record set publishes', () => {
	it('publishes no names at all', () => {
		// `<id>.<name>` is a fixed-row mechanism: every record here is the
		// character's, so there is nothing a formula could be written against.
		// `typeof` rather than the member itself: reading a method off a
		// definition to assert on it is an unbound method, which the lint rules
		// reject — and `contract.test.ts` already asks every such question this way.
		expect(typeof recordSet.scopeValues).toBe('undefined');
	});

	function envFor(body: string | null, from: RecordSetConfig = config) {
		const data = body === null ? null : readData(body, from);
		const source = recordSet.scopeRows?.(data, from);
		return { data, source };
	}

	it('walks every record as a row whose names are its fields', () => {
		const { data, source } = envFor(BODY);
		const rows =
			source?.(makeFieldResolver(recordSet, config, data, NO_ENV)) ?? [];
		expect(rows.map((row) => row.label)).toEqual([
			'Second Wind',
			'Blessed Armour',
			'Lucky',
		]);
		expect(rows[0]?.values).toEqual({
			Uses: 1,
			Attuned: false,
			Modifiers: '',
		});
		expect(rows[1]?.values.Attuned).toBe(true);
		// A blank numeric field is zero, not a missing name.
		expect(rows[2]?.values.Attuned).toBe(false);
		expect(rows[2]?.values.Uses).toBe(3);
	});

	it('resolves count and sum over the records a character added', () => {
		const { data, source } = envFor(BODY);
		const layout: Layout = { name: 'L', components: [config] };
		const prepared: ReadComponent[] = [
			{ config, component: recordSet, data, error: null },
		];
		expect(source).toBeDefined();
		const { env } = buildSheet(layout, prepared);
		expect(
			evaluate('count(features, Attuned)', env.sheet, callsFrom(env)),
		).toBe(1);
		expect(evaluate('sum(features, Uses)', env.sheet, callsFrom(env))).toBe(
			4,
		);
		expect(evaluate('count(features)', env.sheet, callsFrom(env))).toBe(3);
	});

	it('gives an empty list 0 rather than a failure', () => {
		const layout: Layout = { name: 'L', components: [config] };
		const { env } = buildSheet(layout, [
			{ config, component: recordSet, data: null, error: null },
		]);
		expect(
			evaluate('count(features, Attuned)', env.sheet, callsFrom(env)),
		).toBe(0);
		expect(evaluate('sum(features, Uses)', env.sheet, callsFrom(env))).toBe(
			0,
		);
	});

	it('fails a name reaching for one record, whatever its capitalisation', () => {
		const layout: Layout = { name: 'L', components: [config] };
		const { env } = buildSheet(layout, [
			{ config, component: recordSet, data: readData(BODY), error: null },
		]);
		for (const name of [
			'features.Lucky',
			'features.lucky',
			'features.LUCKY',
		]) {
			expect(() => evaluate(name, env.sheet, callsFrom(env))).toThrow();
		}
	});

	it("opens a computed field's formula on a press as well as a hover", () => {
		/*
		 * A `title` is a pointer's route and not a finger's, so without a press a
		 * record's computed formula — and its *failure explanation*, which is the
		 * half a reader can act on — was unreachable on a phone. §7 of
		 * `docs/UI.md` forbids a hover-only affordance; Table's computed cell
		 * already does this, through the same popover.
		 */
		closePopover();
		const computed: RecordSetConfig = {
			...config,
			fields: [
				{ key: 'Uses', type: 'number', max: 3 },
				{ key: 'Left', type: 'computed', formula: '3 - Uses' },
			],
		};
		const body = '\n### A\n```sheet\nUses: 1\n```\nProse.\n';
		const el = render(computed, body, {
			resolveField: () => 2,
		});
		const value = el.querySelector(
			'.sheetsmith-record-value',
		) as HTMLElement;
		expect(value.classList.contains('sheetsmith-record-askable')).toBe(
			true,
		);
		expect(value.getAttribute('title')).toBe('3 - Uses');
		value.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(document.querySelector('.sheetsmith-popover')?.textContent).toBe(
			'3 - Uses',
		);

		// And the failure explanation, which is the one a reader can act on.
		closePopover();
		const failing = render(computed, body, {
			resolveField: () => null,
			explainField: () => 'Uses is not defined on this sheet',
		});
		const unresolved = failing.querySelector(
			'.sheetsmith-record-value',
		) as HTMLElement;
		expect(unresolved.textContent).toBe('?');
		unresolved.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(document.querySelector('.sheetsmith-popover')?.textContent).toBe(
			'Uses is not defined on this sheet',
		);
	});

	it("reads a computed field in the record's own scope", () => {
		const computed: RecordSetConfig = {
			...config,
			fields: [
				{ key: 'Uses', type: 'number', max: 3 },
				{ key: 'Left', type: 'computed', formula: '3 - Uses' },
			],
		};
		const body = '\n### A\n```sheet\nUses: 1\n```\nProse.\n';
		const data = readData(body, computed);
		const rows =
			recordSet.scopeRows?.(
				data,
				computed,
			)?.(makeFieldResolver(recordSet, computed, data, NO_ENV)) ?? [];
		expect(rows[0]?.values.Left).toBe(2);
		// And a computed field stores nothing, so it never reaches the note.
		expect(recordSet.write(data, body, computed)).toBe(body);
	});
});

describe('the modifiers a record pushes', () => {
	const armourClass: CardConfig = {
		id: 'armour_class',
		type: 'card',
		label: 'Armour class',
		position: { col: 1, row: 4, width: 2, height: 1 },
		derived: '10 + mod.self',
	};

	function sheetFor(body: string) {
		const data = readData(body);
		const layout: Layout = { name: 'L', components: [armourClass, config] };
		const prepared: ReadComponent[] = [
			{ config: armourClass, component: card, data: null, error: null },
			{ config, component: recordSet, data, error: null },
		];
		return buildSheet(layout, prepared);
	}

	it('moves a card whose formula reads mod.self, only while the record says so', () => {
		// The `when` clause is evaluated in the record's own scope, before the
		// amount, which is what makes "while this feature is switched on" today's
		// spelling rather than a new mechanism.
		expect(sheetFor(BODY).env.sheet('armour_class')).toBe(11);
		expect(
			sheetFor(BODY.replace('Attuned: yes', 'Attuned: no')).env.sheet(
				'armour_class',
			),
		).toBe(10);
	});

	it("names the record and the component in the card's breakdown", () => {
		const { modifiers } = sheetFor(BODY);
		const breakdown = modifiers.breakdown('armour_class');
		expect(breakdown.total).toBe(1);
		expect(breakdown.lines).toHaveLength(1);
		expect(breakdown.lines[0]?.label).toBe('Blessed Armour');
		expect(breakdown.lines[0]?.source).toBe('Features');
		expect(breakdown.lines[0]?.type).toBe('item');
	});

	it('pushes one part per enrolment, and nothing from a blank field', () => {
		const data = readData(BODY);
		const pushes =
			recordSet.scopeModifiers?.(
				data,
				config,
			)?.(makeFieldResolver(recordSet, config, data, NO_ENV)) ?? [];
		expect(pushes).toHaveLength(1);
		expect(pushes[0]?.part).toBe('armour_class += 1 as item when Attuned');
		expect(pushes[0]?.source).toBe('Features');
		expect(pushes[0]?.row.label).toBe('Blessed Armour');
	});

	it('declares no source where no field is a modifier field', () => {
		const plain = {
			...config,
			fields: [{ key: 'Uses', type: 'number' as const }],
		};
		expect(
			recordSet.scopeModifiers?.(readData(BODY, plain), plain),
		).toBeUndefined();
	});

	it('refuses a note reference in a committed modifier part', () => {
		/*
		 * **The one route by which a `[[…]]` could reach this component's fence**,
		 * and the reason "no field type can hold one" was not the whole of
		 * Constraint 2: the shared form's **Amount** and **Only when** inputs and a
		 * promoted definition's name are all free text, and the name's only
		 * refusals are a semicolon and an assignment shape. Table has the same free
		 * text and stores it in a markdown table *cell*, where a link is indexed; a
		 * record's fields are a `sheet` fence, where none is — so backlinks, graph
		 * view, hover preview and rename propagation all break with no warning.
		 *
		 * Driven through the form's own controls rather than through the callback,
		 * because the callback is where the refusal sits and asserting it from
		 * there would be asserting the fix against itself.
		 */
		const changes: RecordSetData[] = [];
		closeAnchoredPanel();
		const el = render({}, BODY, {
			onChange: (data) => changes.push(data),
			modifiers: modifierContext(),
		});
		// The record with an empty modifier field, so the form opens straight into
		// a new typed effect with its four fields on screen.
		const glyph = records(el)[0]?.querySelector(
			'.sheetsmith-record-modifier',
		) as HTMLButtonElement;
		glyph.click();
		const panel = document.querySelector(
			'.sheetsmith-panel',
		) as HTMLElement;
		expect(panel).not.toBeNull();
		typeInto(field(panel, 'Value'), 'armour_class');
		expect(changes).toHaveLength(1);
		typeInto(field(panel, 'Amount'), '[[Ring of Protection]]');
		// Nothing new reached the note, and the record says why.
		expect(changes).toHaveLength(1);
		const said =
			records(el)[0]?.querySelector('.sheetsmith-error')?.textContent ??
			'';
		expect(said).toContain('code block');
		expect(said).toContain("feature's name or its body");
		expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toContain(
			'Not saved',
		);
	});

	it('refuses a note reference in a promoted name before the layout is written', async () => {
		/*
		 * **The ordering the first refusal got wrong.** The form checks
		 * `unspellableName`, which refuses only a semicolon and an assignment shape,
		 * then *awaits* the promote — so a `[[…]]` name reached the layout file, the
		 * reader was announced "Saved" and only then was the cell rewrite declined
		 * on the same name. The layout kept a definition it should never have gained.
		 */
		closeAnchoredPanel();
		const promoted: string[] = [];
		const el = render({}, BODY, {
			modifiers: {
				...modifierContext(),
				promote: (name) => {
					promoted.push(name);
					return Promise.resolve({ ok: true as const });
				},
			},
		});
		// The record whose field already holds a typed part, because **Reuse this
		// elsewhere** is offered on one of those and not on a part being invented.
		const glyph = records(el)[1]?.querySelector(
			'.sheetsmith-record-modifier',
		) as HTMLButtonElement;
		glyph.click();
		const panel = document.querySelector(
			'.sheetsmith-panel',
		) as HTMLElement;
		const line = panel.querySelector<HTMLButtonElement>(
			'.sheetsmith-panel-line',
		);
		expect(line, 'no part to open').not.toBeNull();
		line?.click();
		const name = panel.querySelector<HTMLInputElement>(
			'.sheetsmith-panel-promote-row input',
		);
		expect(name, 'no promote field').not.toBeNull();
		if (name === null) return;
		name.value = '[[Ring of Protection]]';
		name.dispatchEvent(new Event('input'));
		const save = Array.from(
			panel.querySelectorAll<HTMLButtonElement>('.sheetsmith-panel-save'),
		)[0];
		expect(save, 'no save control').not.toBeUndefined();
		save?.click();
		// Nothing reached the layout at all, which is the half the ordering broke.
		expect(promoted).toEqual([]);
		// The form reports through its own promise, so the problem line lands a
		// microtask later — which is also why the old ordering was invisible: the
		// announcement and the refusal were two turns apart.
		await Promise.resolve();
		// And the reader is told where they are typing rather than under the record,
		// because the form draws its own problem line beside the name field.
		expect(
			document.querySelector('.sheetsmith-panel-problem')?.textContent ??
				'',
		).toContain('code block');

		// Not vacuous: the same control with a spellable name does reach the layout,
		// so what is asserted above is the refusal rather than a dead button.
		const again = document.querySelector<HTMLInputElement>(
			'.sheetsmith-panel-promote-row input',
		);
		if (again === null) throw new Error('no promote field');
		again.value = 'Ring of Protection';
		again.dispatchEvent(new Event('input'));
		document
			.querySelector<HTMLButtonElement>('.sheetsmith-panel-save')
			?.click();
		expect(promoted).toEqual(['Ring of Protection']);
	});

	it('edits the other parts of a cell that already holds a link', () => {
		/*
		 * **The refusal tested over the joined cell locked the record.** A note
		 * hand-edited to `Modifiers: armour_class += 1; [[Ring]]` is a state §10
		 * requires be carried, and every commit from the form was refused on it —
		 * including edits to the *other* part, whose only way out was deleting the
		 * link, which is not what the message said. Tested per part, the untouched
		 * link is re-joined as its own stored text and the edit lands.
		 */
		closeAnchoredPanel();
		const changes: RecordSetData[] = [];
		const body = BODY.replace(
			'Modifiers: armour_class += 1 as item when Attuned',
			'Modifiers: armour_class += 1; [[Ring of Protection]]',
		);
		const el = render({}, body, {
			onChange: (data) => changes.push(data),
			modifiers: modifierContext(),
		});
		// The record renders, carries both parts, and reports nothing: rendered,
		// not corrected.
		expect(records(el)[1]?.querySelector('.sheetsmith-error')).toBeNull();
		expect(readData(body).records[1]?.fields?.Modifiers).toContain(
			'[[Ring',
		);

		const glyph = records(el)[1]?.querySelector(
			'.sheetsmith-record-modifier',
		) as HTMLButtonElement;
		glyph.click();
		const panel = document.querySelector(
			'.sheetsmith-panel',
		) as HTMLElement;
		const lines = Array.from(
			panel.querySelectorAll<HTMLButtonElement>('.sheetsmith-panel-line'),
		);
		expect(lines).toHaveLength(2);
		// The part that is *not* the link, which is the one the old refusal made
		// uneditable.
		lines[0]?.click();
		const amount = field(document.body, 'Amount');
		expect(amount, 'no amount field').not.toBeNull();
		expect((amount as HTMLInputElement).value).toBe('1');
		typeInto(amount, '2');
		expect(changes.length, 'nothing committed').toBeGreaterThan(0);
		expect(changes[0]).toEqual({
			records: {
				1: {
					fields: {
						Modifiers: 'armour_class += 2; [[Ring of Protection]]',
					},
				},
			},
		});
		expect(records(el)[1]?.querySelector('.sheetsmith-error')).toBeNull();
		// And the byte the reader did not touch comes back as its own text.
		expect(
			recordSet.write(changes[0] as RecordSetData, body, config),
		).toContain('armour_class += 2; [[Ring of Protection]]');
	});

	it('quotes the part it refused rather than the whole cell', () => {
		closeAnchoredPanel();
		const changes: RecordSetData[] = [];
		const body = BODY.replace(
			'Modifiers: armour_class += 1 as item when Attuned',
			'Modifiers: armour_class += 1; armour_class += 2',
		);
		const el = render({}, body, {
			onChange: (data) => changes.push(data),
			modifiers: modifierContext(),
		});
		const glyph = records(el)[1]?.querySelector(
			'.sheetsmith-record-modifier',
		) as HTMLButtonElement;
		glyph.click();
		const panel = document.querySelector(
			'.sheetsmith-panel',
		) as HTMLElement;
		panel
			.querySelector<HTMLButtonElement>('.sheetsmith-panel-line')
			?.click();
		typeInto(field(document.body, 'Amount'), '[[Ring]]');
		expect(changes).toEqual([]);
		const said =
			records(el)[1]?.querySelector('.sheetsmith-error')?.textContent ??
			'';
		// The offending part, not the joined cell: the other half is untouched and
		// naming it would send the reader to the wrong place.
		expect(said).toContain('armour_class += [[Ring]]');
		expect(said).not.toContain('armour_class += 2');
	});

	it('commits an amount with no link, and clears the refusal', () => {
		const changes: RecordSetData[] = [];
		closeAnchoredPanel();
		const el = render({}, BODY, {
			onChange: (data) => changes.push(data),
			modifiers: modifierContext(),
		});
		const glyph = records(el)[0]?.querySelector(
			'.sheetsmith-record-modifier',
		) as HTMLButtonElement;
		glyph.click();
		const panel = document.querySelector(
			'.sheetsmith-panel',
		) as HTMLElement;
		typeInto(field(panel, 'Value'), 'armour_class');
		typeInto(field(panel, 'Amount'), '[[Ring]]');
		expect(
			records(el)[0]?.querySelector('.sheetsmith-error'),
		).not.toBeNull();
		typeInto(field(panel, 'Amount'), '2');
		expect(records(el)[0]?.querySelector('.sheetsmith-error')).toBeNull();
		expect(changes[changes.length - 1]).toEqual({
			records: { 0: { fields: { Modifiers: 'armour_class += 2' } } },
		});
	});

	it('round-trips a modifier field holding a note byte for byte', () => {
		// The fence line splits on its first `: `, which sits before the part, so
		// the note's own `note:` is part of the value (`docs/features/modifier-notes.md`).
		const body = BODY.replace(
			'Modifiers: armour_class += 1 as item when Attuned',
			'Modifiers: armour_class += 1 as item when Attuned note: and resistance to cold',
		);
		expect(body).not.toBe(BODY);
		const data = readData(body);
		expect(Object.values(data.records ?? {}).length).toBeGreaterThan(0);
		expect(body).toContain('note: and resistance to cold');
		expect(recordSet.write({ records: {} }, body, config)).toBe(body);
		const held = recordSet.scopeModifiers?.(data, config)?.(() => null) ?? [];
		expect(held.map((push) => push.part)).toContain(
			'armour_class += 1 as item when Attuned note: and resistance to cold',
		);
	});

	it('refuses a note reference typed into a modifier note', () => {
		const changes: RecordSetData[] = [];
		closeAnchoredPanel();
		const el = render({}, BODY, {
			onChange: (data) => changes.push(data),
			modifiers: modifierContext(),
		});
		const glyph = records(el)[0]?.querySelector(
			'.sheetsmith-record-modifier',
		) as HTMLButtonElement;
		glyph.click();
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
		typeInto(field(panel, 'Value'), 'armour_class');
		expect(changes).toHaveLength(1);
		typeInto(field(panel, 'Note'), 'See [[Ring of Protection]]');
		expect(changes).toHaveLength(1);
		expect(records(el)[0]?.querySelector('.sheetsmith-error')?.textContent).toContain(
			'code block',
		);
	});

	it('opens the shared anchored form on the glyph', () => {
		const el = render({}, BODY, {
			modifiers: {
				definitions: [],
				targets: [{ name: 'armour_class', label: 'Armour class' }],
				published: [{ name: 'armour_class', label: 'Armour class' }],
				bonusTypes: ['item'],
				outcomes: () => [
					outcomeView({
						typed: {
							target: 'armour_class',
							operator: 'add' as const,
							amount: '1',
							bonusType: 'item',
						},
						target: 'armour_class',
						targetLabel: 'Armour class',
						applies: true,
						amount: 1,
					}),
				],
				breakdown: () => ({ lines: [], override: null, total: 0 }),
				promote: () => Promise.resolve({ ok: true as const }),
			},
		});
		const glyph = records(el)[1]?.querySelector(
			'.sheetsmith-record-modifier',
		) as HTMLButtonElement;
		expect(glyph.getAttribute('aria-haspopup')).toBe('dialog');
		expect(glyph.getAttribute('aria-expanded')).toBe('false');
		glyph.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const panel = document.querySelector(
			'.sheetsmith-panel',
		) as HTMLElement;
		expect(panel).not.toBeNull();
		expect(panel.getAttribute('aria-label')).toContain('Blessed Armour');
		expect(panel.querySelector('.sheetsmith-panel-line')).not.toBeNull();
		expect(glyph.getAttribute('aria-expanded')).toBe('true');
		glyph.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(document.querySelector('.sheetsmith-panel')).toBeNull();
	});
});

describe('recordSet.applyReset', () => {
	const context = { resolve: () => null, explain: () => null };

	it('restores every number field to its maximum and sets every toggle', () => {
		const data = readData(BODY);
		const result = recordSet.applyReset?.(
			data,
			config,
			{ trigger: 'Long rest', action: 'full' },
			context,
		);
		expect(result?.ok).toBe(true);
		if (!result?.ok) return;
		const written = recordSet.write(result.data, BODY, config);
		const after = readData(written);
		expect(
			Object.values(after.records).map((one) => one.fields?.Uses),
		).toEqual(['3', '3', '3']);
		expect(after.records[0]?.fields?.Attuned).toBe('yes');
	});

	it('empties every number field and clears every toggle', () => {
		const data = readData(BODY);
		const result = recordSet.applyReset?.(
			data,
			config,
			{ trigger: 'Long rest', action: 'empty' },
			context,
		);
		if (!result?.ok) throw new Error('expected a reset');
		const after = readData(recordSet.write(result.data, BODY, config));
		expect(
			Object.values(after.records).map((one) => one.fields?.Uses),
		).toEqual(['0', '0', '0']);
		expect(after.records[1]?.fields?.Attuned).toBe('no');
	});

	it('restores each record to its own ceiling and skips a record with none', () => {
		/*
		 * **A record with no ceiling is skipped, not failed, and the whole reset
		 * still applies.** A field with no `max` has nothing the button was for on
		 * any record; a *record* with no ceiling is a record that is not a
		 * counter — a passive trait whose `Uses` is blank on purpose — and failing
		 * the component would mean one of those refusing a Long rest for thirty
		 * spells.
		 */
		const owned: RecordSetConfig = {
			...config,
			fields: [
				{ key: 'Uses', type: 'number', maxSource: 'record' },
				{ key: 'Attuned', type: 'toggle' },
			],
		};
		const body = [
			'',
			'### A',
			'```sheet',
			'Uses: 1 / 3',
			'Attuned: no',
			'```',
			'Prose.',
			'',
			'### B',
			'```sheet',
			'Uses: 0/1',
			'Attuned: no',
			'```',
			'Prose.',
			'',
			'### C',
			'```sheet',
			'Uses: 2',
			'Attuned: no',
			'```',
			'Prose.',
			'',
		].join('\n');
		const result = recordSet.applyReset?.(
			readData(body, owned),
			owned,
			{ trigger: 'Long rest', action: 'full' },
			context,
		);
		// Success for the component, which is the half the skip has to keep.
		expect(result?.ok).toBe(true);
		if (!result?.ok) return;
		const written = recordSet.write(result.data, body, owned);
		const after = readData(written, owned);
		expect(
			Object.values(after.records).map((one) => one.fields?.Uses),
		).toEqual([
			'3 / 3',
			'1/1',
			// **Left exactly as it was, and never written as 0.** `full` means
			// restore to the ceiling; where there is none there is nothing to
			// restore to.
			'2',
		]);
		// And the toggles on the skipped record still reset: the skip is per
		// (record, field), like the storage.
		expect(
			Object.values(after.records).map((one) => one.fields?.Attuned),
		).toEqual(['yes', 'yes', 'yes']);
	});

	it('never deletes a ceiling when it empties a counter', () => {
		const owned: RecordSetConfig = {
			...config,
			fields: [{ key: 'Uses', type: 'number', maxSource: 'record' }],
		};
		const body = '\n### A\n```sheet\nUses: 2 / 3\n```\nProse.\n';
		const result = recordSet.applyReset?.(
			readData(body, owned),
			owned,
			{ trigger: 'Long rest', action: 'empty' },
			context,
		);
		if (!result?.ok) throw new Error('expected a reset');
		expect(recordSet.write(result.data, body, owned)).toBe(
			'\n### A\n```sheet\nUses: 0 / 3\n```\nProse.\n',
		);
	});

	it("holds a formula reset to each record's own ceiling", () => {
		const owned: RecordSetConfig = {
			...config,
			fields: [{ key: 'Uses', type: 'number', maxSource: 'record' }],
		};
		const body = [
			'',
			'### A',
			'```sheet',
			'Uses: 0 / 2',
			'```',
			'Prose.',
			'',
			'### B',
			'```sheet',
			'Uses: 0 / 9',
			'```',
			'Prose.',
			'',
		].join('\n');
		const result = recordSet.applyReset?.(
			readData(body, owned),
			owned,
			{ trigger: 'Long rest', action: 'formula', to: '3' },
			{ resolve: () => 3, explain: () => null },
		);
		if (!result?.ok) throw new Error('expected a reset');
		const after = readData(
			recordSet.write(result.data, body, owned),
			owned,
		);
		// `to: '3'` on a record whose ceiling is 2 writes 2.
		expect(
			Object.values(after.records).map((one) => one.fields?.Uses),
		).toEqual(['2 / 2', '3 / 9']);
	});

	it("still fails naming a field whose own ceiling is the layout's and missing", () => {
		// Unchanged where the ceiling is the field's, and the narrowing above must
		// not reach it: the layout stated one ceiling for every record, so a
		// missing one is a configuration nobody can act on from the sheet.
		const mixed: RecordSetConfig = {
			...config,
			fields: [
				{ key: 'Uses', type: 'number', maxSource: 'record' },
				{ key: 'Charges', type: 'number', name: 'Charges left' },
			],
		};
		const result = recordSet.applyReset?.(
			readData(BODY, mixed),
			mixed,
			{ trigger: 'Long rest', action: 'full' },
			context,
		);
		expect(result?.ok).toBe(false);
		if (result?.ok !== false) return;
		expect(result.error).toContain('"Charges left"');
	});

	it('fails naming the field where a number field has no maximum', () => {
		const uncapped: RecordSetConfig = {
			...config,
			fields: [{ key: 'Uses', type: 'number', name: 'Uses left' }],
		};
		const result = recordSet.applyReset?.(
			readData(BODY, uncapped),
			uncapped,
			{ trigger: 'Long rest', action: 'full' },
			context,
		);
		expect(result?.ok).toBe(false);
		if (result?.ok !== false) return;
		expect(result.error).toContain('"Uses left"');
		expect(result.error).toContain('no maximum to restore to');
	});

	it('leaves the component alone when it fails', () => {
		// SPEC §6: a trigger applies what it can and names what it could not, so a
		// refusal has to leave the note exactly as it was.
		const uncapped: RecordSetConfig = {
			...config,
			fields: [{ key: 'Uses', type: 'number' }],
		};
		const result = recordSet.applyReset?.(
			readData(BODY, uncapped),
			uncapped,
			{ trigger: 'Long rest', action: 'full' },
			context,
		);
		expect(result?.ok).toBe(false);
		expect(recordSet.write({ records: {} }, BODY, uncapped)).toBe(BODY);
	});

	it("writes a formula's number into every counter, and derives the flag", () => {
		/*
		 * **The flag is derived rather than set**, which is `track.ts`'s rule for
		 * a flag card. Set unconditionally, `to: '0'` wrote zero into every counter
		 * *and turned every toggle on* — a write the reader did not ask for, in the
		 * one action whose whole job is to say what the value should be.
		 */
		const data = readData(BODY);
		const empty = recordSet.applyReset?.(
			data,
			config,
			{ trigger: 'Long rest', action: 'formula', to: '0' },
			{ resolve: () => 0, explain: () => null },
		);
		if (!empty?.ok) throw new Error('expected a reset');
		const cleared = readData(recordSet.write(empty.data, BODY, config));
		expect(
			Object.values(cleared.records).map((one) => one.fields?.Uses),
		).toEqual(['0', '0', '0']);
		expect(cleared.records[1]?.fields?.Attuned).toBe('no');

		const two = recordSet.applyReset?.(
			data,
			config,
			{ trigger: 'Long rest', action: 'formula', to: '2' },
			{ resolve: () => 2, explain: () => null },
		);
		if (!two?.ok) throw new Error('expected a reset');
		const filled = readData(recordSet.write(two.data, BODY, config));
		expect(
			Object.values(filled.records).map((one) => one.fields?.Uses),
		).toEqual(['2', '2', '2']);
		expect(filled.records[0]?.fields?.Attuned).toBe('yes');
	});

	it("holds a formula's number to each field's own bounds", () => {
		// The ceiling is the field's, not the expression's: a trigger that wrote
		// past it would leave a counter the card immediately corrects.
		const result = recordSet.applyReset?.(
			readData(BODY),
			config,
			{ trigger: 'Long rest', action: 'formula', to: '99' },
			{ resolve: () => 99, explain: () => null },
		);
		if (!result?.ok) throw new Error('expected a reset');
		expect(result.data.records[0]?.fields?.Uses).toBe('3');
	});

	it('tells an empty formula from one that produced no number', () => {
		// Two failures with two fixes — define the name, or write an expression
		// that comes to a count — so reporting them alike sends the author looking
		// at a formula that is right there. Track's own shape.
		const nothing = recordSet.applyReset?.(
			readData(BODY),
			config,
			{ trigger: 'Long rest', action: 'formula' },
			{ resolve: () => null, explain: () => null },
		);
		expect(nothing?.ok).toBe(false);
		if (nothing?.ok === false) {
			expect(nothing.error).toContain('reset formula is empty');
		}
		const words = recordSet.applyReset?.(
			readData(BODY),
			config,
			{ trigger: 'Long rest', action: 'formula', to: 'maybe' },
			{ resolve: () => 'maybe', explain: () => null },
		);
		expect(words?.ok).toBe(false);
		if (words?.ok === false) {
			expect(words.error).toContain('"maybe"');
			expect(words.error).toContain('not a number');
		}
	});

	it('names what could not be resolved when a formula fails', () => {
		// `explain` over "could not resolve": the difference between a status and
		// a next action (PATTERNS §4).
		const result = recordSet.applyReset?.(
			readData(BODY),
			config,
			{ trigger: 'Long rest', action: 'formula', to: 'con' },
			{
				resolve: () => null,
				explain: () => 'con is not defined on this sheet',
			},
		);
		expect(result?.ok).toBe(false);
		if (result?.ok === false) {
			expect(result.error).toBe('con is not defined on this sheet');
		}
	});

	it('leaves a level field alone under every action', () => {
		/*
		 * SPEC §6 names `full` and `empty` for a number and a two-state flag, and
		 * a graded level's "full" is a ladder position rather than a ceiling the
		 * layout stated — so a reset writes neither end of it. Driven rather than
		 * argued: nothing else here configures one.
		 */
		const graded: RecordSetConfig = {
			...config,
			fields: [
				{ key: 'Uses', type: 'number', max: 3 },
				{
					key: 'Rank',
					type: 'level',
					levels: ['Untrained', 'Trained:', 'Expert:★'],
				},
			],
		};
		const body = '\n### A\n```sheet\nUses: 1\nRank: 2\n```\nProse.\n';
		for (const action of ['full', 'empty'] as const) {
			const result = recordSet.applyReset?.(
				readData(body, graded),
				graded,
				{ trigger: 'Long rest', action },
				{ resolve: () => null, explain: () => null },
			);
			if (!result?.ok) throw new Error(`expected a ${action} reset`);
			// Not in the delta at all, so the note's own entry is never rewritten.
			expect(result.data.records[0]?.fields).not.toHaveProperty('Rank');
			expect(recordSet.write(result.data, body, graded)).toContain(
				'Rank: 2',
			);
		}
	});

	it('declares reset.to as a formula field, so the trigger is not dead', () => {
		expect(recordSet.formulaFields).toContain('reset.*.to');
	});

	it('leaves a record whose fence will not read exactly as it is', () => {
		const body = '\n### Broken\n```sheet\nnot an entry\n```\nProse.\n';
		const result = recordSet.applyReset?.(
			readData(body),
			config,
			{ trigger: 'Long rest', action: 'empty' },
			context,
		);
		if (!result?.ok) throw new Error('expected a reset');
		expect(recordSet.write(result.data, body, config)).toBe(body);
	});
});

describe('recordSet.sample', () => {
	it("names its records from the layout's own word and says it is filler", () => {
		const body = sampleOf(recordSet, { ...config, recordName: 'Spell' });
		expect(body).toContain('### Spell 1');
		expect(body).toContain('### Spell 2');
		expect(body).toContain('Sample text');
		// Prose is the one sample a reader could mistake for their own data.
		expect(body).not.toContain('[[');
	});

	it('fills the fields it can and leaves a modifier field blank', () => {
		const data = readData(sampleOf(recordSet, config), config);
		// `samplePart(3)` — a counter sitting below its ceiling rather than at it.
		expect(data.records[0]?.fields?.Uses).toBe('2');
		expect(data.records[0]?.fields?.Attuned).toBe('yes');
		expect(data.records[1]?.fields?.Attuned).toBe('no');
		// A name here would enrol the record in a definition the layout may not
		// declare, which is a problem on screen the author did not cause.
		expect(data.records[0]?.fields?.Modifiers).toBeUndefined();
	});

	it('fills a bounded number below its ceiling, and differently per record', () => {
		/*
		 * `samplePart` reads the *ceiling*, which is the field's and not the
		 * record's, so one call gave both records the same number and an author
		 * could not see that a number field varies per record where the flag beside
		 * it correctly alternated. A partial of a partial.
		 */
		const capped: RecordSetConfig = {
			...config,
			fields: [{ key: 'Uses', type: 'number', max: 9 }],
		};
		const records = readData(sampleOf(recordSet, capped), capped).records;
		expect(records[0]?.fields?.Uses).toBe('5');
		expect(records[1]?.fields?.Uses).toBe('3');
		// Still inside the ceiling, and never at it.
		for (const one of Object.values(records)) {
			const value = Number(one.fields?.Uses);
			expect(value).toBeGreaterThan(0);
			expect(value).toBeLessThan(9);
		}
	});

	it('gives two sample records different ceilings where the ceiling is theirs', () => {
		/*
		 * The direct extension of the partial-of-a-partial rule above: the thing an
		 * author has just turned on is precisely that the ceiling is the record's,
		 * and `Uses 2 / 3` beside `Uses 1 / 2` says that where `Uses 2 / 3` beside
		 * `Uses 1 / 3` would say the opposite.
		 */
		const owned: RecordSetConfig = {
			...config,
			fields: [{ key: 'Uses', type: 'number', maxSource: 'record' }],
		};
		const body = sampleOf(recordSet, owned);
		const shown = readData(body, owned).records;
		const ceilings = Object.values(shown).map((one) =>
			(one.fields?.Uses ?? '').split('/')[1]?.trim(),
		);
		expect(ceilings[0]).not.toBe(ceilings[1]);
		for (const one of Object.values(shown)) {
			const [value, ceiling] = (one.fields?.Uses ?? '')
				.split('/')
				.map((part) => Number(part.trim()));
			// A partial of the ceiling rather than at it, so an author sees a
			// counter that has been used.
			expect(value).toBeGreaterThan(0);
			expect(value).toBeLessThan(ceiling as number);
			// The canonical ` / `, forced rather than chosen: the sample has to
			// round-trip byte-identically through this component's own read and
			// write, which `contract.test.ts` already asserts.
			expect(one.fields?.Uses).toMatch(/^\d+ \/ \d+$/);
		}
		expect(recordSet.write(readData(body, owned), body, owned)).toBe(body);
	});

	it('renders as a list of two records with bodies', () => {
		const el = render({}, sampleOf(recordSet, config));
		expect(records(el)).toHaveLength(2);
		expect(bodyFields(el)[0]?.value).toContain('Sample text');
	});
});

describe('a strip of field names over the list', () => {
	/*
	 * `fieldHeadings`, off by default (`docs/features/record-set-heading-strip.md`).
	 * happy-dom lays nothing out, so what is held here is the DOM the stylesheet
	 * is handed and the accessibility of it; whether a heading is centred over
	 * its control, whether the strip stays put under a scroll and where the
	 * threshold falls are look criteria, and the thresholds are `styles.test.ts`'s.
	 */
	const HEADED: RecordSetConfig = {
		...config,
		fieldHeadings: true,
		fields: [
			{ key: 'Uses', type: 'number', maxSource: 'record' },
			{ key: 'Attuned', type: 'toggle' },
			{
				key: 'Rank',
				name: 'Skill rank',
				type: 'level',
				levels: ['Untrained', 'Trained:', 'Expert:★'],
			},
			{ key: 'Left', type: 'computed', formula: '3 - Uses' },
			{ key: 'Modifiers', type: 'modifier' },
		],
	};

	const HEADED_BODY = [
		'',
		'### Second Wind',
		'```sheet',
		'Uses: 1 / 3',
		'Attuned: no',
		'Rank: 1',
		'```',
		'Prose.',
		'',
		'### Lucky',
		'```sheet',
		'Uses: 3',
		'Attuned: yes',
		'```',
		'Prose.',
		'',
	].join('\n');

	const list = (el: HTMLElement) =>
		el.querySelector('.sheetsmith-record-set-list') as HTMLElement;
	const strip = (el: HTMLElement) =>
		el.querySelector<HTMLElement>('.sheetsmith-record-strip');
	const block = (el: HTMLElement) =>
		el.querySelector('.sheetsmith-record-set') as HTMLElement;

	it('declares one boolean in Appearance, off by default', () => {
		const declared = recordSet.configFields.find(
			(one) => one.key === 'fieldHeadings',
		);
		expect(declared).toMatchObject({
			kind: 'boolean',
			group: 'Appearance',
			default: false,
		});
		expect(declared?.description.length).toBeGreaterThan(0);
	});

	it('draws the list it always drew where the key is absent or false', () => {
		const bare = render({ ...HEADED, fieldHeadings: undefined }, HEADED_BODY);
		const off = render({ ...HEADED, fieldHeadings: false }, HEADED_BODY);
		for (const el of [bare, off]) {
			expect(strip(el)).toBeNull();
			expect(el.querySelector('.sheetsmith-record-set-records')).toBeNull();
			expect(
				block(el).className.includes('sheetsmith-record-set-headed'),
			).toBe(false);
			expect(block(el).className).not.toContain('-fields-');
			expect(
				block(el).style.getPropertyValue('--sheetsmith-record-fields'),
			).toBe('');
		}
		// And the tree is the same one the key's absence draws, byte for byte.
		expect(bare.innerHTML).toBe(off.innerHTML);
	});

	it('draws one strip as the list\'s first child, one heading per field in declared order', () => {
		const el = render(HEADED, HEADED_BODY);
		const drawn = strip(el) as HTMLElement;
		expect(list(el).firstElementChild).toBe(drawn);
		expect(list(el).querySelectorAll('.sheetsmith-record-strip')).toHaveLength(
			1,
		);
		// The field's `name`, else its `key`: the word its own accessible name uses.
		expect(Array.from(drawn.children).map((one) => one.textContent)).toEqual([
			'Uses',
			'Attuned',
			'Skill rank',
			'Left',
			'Modifiers',
		]);
		// In the secondary type a Card set's abbreviation wears, borrowed rather
		// than written again.
		for (const heading of Array.from(drawn.children)) {
			expect(heading.classList.contains('sheetsmith-card-abbreviation')).toBe(
				true,
			);
		}
		// The records moved into the strip's second row; the add control is not
		// among them, it is the box's own last child, outside the scroller.
		const wrapper = list(el).children[1] as HTMLElement;
		expect(wrapper.classList.contains('sheetsmith-record-set-records')).toBe(
			true,
		);
		expect(list(el).children).toHaveLength(2);
		expect(wrapper.querySelectorAll('.sheetsmith-record')).toHaveLength(2);
		expect(list(el).contains(addButton(el))).toBe(false);
		expect(addButton(el).parentElement?.lastElementChild).toBe(addButton(el));
	});

	it('stamps the true count, and a class clamped to the table the stylesheet holds', () => {
		const few = render(HEADED, HEADED_BODY);
		expect(
			block(few).style.getPropertyValue('--sheetsmith-record-fields'),
		).toBe('5');
		expect(
			block(few).classList.contains('sheetsmith-record-set-headed'),
		).toBe(true);
		expect(
			block(few).classList.contains('sheetsmith-record-set-fields-5'),
		).toBe(true);

		const many: RecordSetConfig = {
			...HEADED,
			fields: Array.from({ length: 10 }, (_, at) => ({
				key: `N${at}`,
				type: 'number' as const,
			})),
		};
		const wide = render(many, HEADED_BODY);
		// Ten fields take the last threshold, and the property still says ten.
		expect(
			block(wide).style.getPropertyValue('--sheetsmith-record-fields'),
		).toBe('10');
		expect(
			block(wide).classList.contains(
				`sheetsmith-record-set-fields-${MAX_TABULATED_FIELDS}`,
			),
		).toBe(true);
		expect(block(wide).className).not.toContain('fields-10');

		const one = render({ ...HEADED, fields: [HEADED.fields![0]!] }, HEADED_BODY);
		expect(
			block(one).classList.contains('sheetsmith-record-set-fields-1'),
		).toBe(true);
	});

	it('is hidden from assistive tech and carries no table role', () => {
		const el = render(HEADED, HEADED_BODY);
		const drawn = strip(el) as HTMLElement;
		expect(drawn.getAttribute('aria-hidden')).toBe('true');
		// Not a control: nothing in it takes focus or a press.
		expect(
			drawn.querySelectorAll(
				'a, button, input, select, textarea, [tabindex]',
			),
		).toHaveLength(0);
		// And no tabular reading anywhere in the list, which is the reading this
		// component declines.
		for (const tag of ['th', 'table', 'tr', 'td']) {
			expect(el.querySelector(tag)).toBeNull();
		}
		expect(
			el.querySelector(
				'[role="table"], [role="row"], [role="columnheader"], [role="cell"], [role="grid"]',
			),
		).toBeNull();
	});

	it('names each control with the word over it, for every field type', () => {
		/*
		 * Label in Name (WCAG 2.5.3): voice control says the word on screen, so the
		 * word has to be in the accessible name of the control beneath it. The
		 * strip is aria-hidden, which is safe only while this holds.
		 */
		const el = render(HEADED, HEADED_BODY);
		const headings = Array.from(
			(strip(el) as HTMLElement).children,
		).map((one) => one.textContent ?? '');
		for (const record of records(el)) {
			const cells = Array.from(
				record.querySelectorAll<HTMLElement>(
					'.sheetsmith-record-fields > .sheetsmith-record-field',
				),
			);
			expect(cells).toHaveLength(headings.length);
			cells.forEach((cell, at) => {
				const control = cell.querySelector<HTMLElement>(
					'button, select, input:not(.sheetsmith-pool-max)',
				);
				const said =
					control?.getAttribute('aria-label') ??
					cell.querySelector('.sheetsmith-sr-only')?.textContent ??
					'';
				expect(said, `${headings[at]}`).toContain(headings[at]);
			});
		}
		// All five kinds were among them, so this is not a check over one.
		expect(
			new Set(
				Array.from(
					el.querySelectorAll('.sheetsmith-record:first-child .sheetsmith-record-field'),
				).map((cell) => cell.className.match(/field-(\w+)/)?.[1]),
			),
		).toEqual(new Set(['number', 'toggle', 'level', 'computed', 'modifier']));
	});

	it('draws no strip until there is a record that read, and drops it with the last', () => {
		// No records.
		const empty = render(HEADED, null);
		expect(strip(empty)).toBeNull();
		expect(
			block(empty).classList.contains('sheetsmith-record-set-headed'),
		).toBe(false);
		expect(empty.querySelector('.sheetsmith-record-set-records')).toBeNull();

		// Only records whose fence will not read.
		const broken = render(
			HEADED,
			'\n### Broken\n```sheet\nUses: 1\nUses: 2\n```\nProse.\n',
		);
		expect(errors(broken).length).toBeGreaterThan(0);
		expect(strip(broken)).toBeNull();

		// One that reads among one that does not still draws it.
		const mixed = render(
			HEADED,
			`${HEADED_BODY}\n### Broken\n\`\`\`sheet\nUses: 1\nUses: 2\n\`\`\`\nProse.\n`,
		);
		expect(strip(mixed)).not.toBeNull();

		// No fields to name.
		const bare = render({ ...HEADED, fields: [] }, HEADED_BODY);
		expect(strip(bare)).toBeNull();

		// A refused configuration draws its error and no list, so no strip.
		// Rendered without `read`, which would refuse it first.
		const refused = document.createElement('div');
		recordSet.render(
			refused,
			{ ...HEADED, fields: [{ key: 'Uses', type: 'text' }] },
			readData(HEADED_BODY, HEADED),
			context,
		);
		expect(errors(refused).length).toBeGreaterThan(0);
		expect(strip(refused)).toBeNull();
		expect(refused.querySelector('.sheetsmith-record-set-list')).toBeNull();

		// It appears with the first record and goes with the last: the same
		// component drawn from each note the write would leave behind.
		expect(strip(render(HEADED, HEADED_BODY))).not.toBeNull();
		expect(strip(render(HEADED, null))).toBeNull();
	});

	it('ignores a field\'s hideHeading and secondary, and keeps both in the layout', () => {
		const hand: RecordSetConfig = {
			...HEADED,
			fields: [
				{ key: 'Uses', type: 'number', hideHeading: true, secondary: true },
				{ key: 'Attuned', type: 'toggle', hideHeading: true },
			],
		};
		const el = render(hand, HEADED_BODY);
		expect(
			Array.from((strip(el) as HTMLElement).children).map(
				(one) => one.textContent,
			),
		).toEqual(['Uses', 'Attuned']);
		// The keys survive the round trip, as a hand-edited layout expects.
		const layout = JSON.parse(
			serialiseLayout({
				name: 'L',
				components: [hand],
				triggers: [],
			}),
		) as { components: RecordSetConfig[] };
		expect(layout.components[0]?.fields?.[0]).toMatchObject({
			hideHeading: true,
			secondary: true,
		});
		expect(layout.components[0]?.fields?.[1]).toMatchObject({
			hideHeading: true,
		});
	});

	it("keeps a ring's tooltip and long press, and a number's own name in the DOM", () => {
		/*
		 * The strip is width-dependent and only the stylesheet knows the width, so
		 * the same DOM serves the wide regime and the narrow one: the tooltip and
		 * the touch route to it stay (`nameOnScreen` is false, and this is why),
		 * and the number's name stays for the stylesheet to hide in the wide regime
		 * and to return in the narrow.
		 */
		closePopover();
		const held: RecordSetData[] = [];
		const el = render(HEADED, HEADED_BODY, {
			onChange: (data) => held.push(data),
		});
		const toggle = records(el)[0]?.querySelector(
			'.sheetsmith-record-field-toggle .sheetsmith-level-ring',
		) as HTMLElement;
		expect(toggle.getAttribute('title')).toBe('Second Wind Attuned');
		const graded = records(el)[0]?.querySelector(
			'.sheetsmith-record-field-level .sheetsmith-level-ring',
		) as HTMLElement;
		expect(graded.getAttribute('title')).toBe('Second Wind Skill rank: Trained');
		vi.useFakeTimers();
		try {
			hold(toggle, LONG_PRESS + 10, { pointerType: 'touch' });
			expect(
				document.querySelector('.sheetsmith-popover')?.textContent,
			).toBe('Second Wind Attuned');
			toggle.click();
			expect(held).toEqual([]);
			closePopover();
		} finally {
			vi.useRealTimers();
		}
		const inline = records(el)[0]?.querySelector(
			'.sheetsmith-record-field-number .sheetsmith-card-abbreviation',
		);
		expect(inline?.textContent).toBe('Uses');
		// Its ceiling is still drawn beside the value.
		expect(
			records(el)[0]?.querySelector('.sheetsmith-pool-max'),
		).not.toBeNull();
	});
});

describe('a field inside the opened record', () => {
	/*
	 * `placement: 'body'` (`docs/features/record-set-body-fields.md`). Display
	 * only: the same control, drawn by the same `drawField`, on the same commit
	 * path, attached to the body instead of the summary line. happy-dom lays
	 * nothing out, so what is held here is the tree, the commits and the
	 * accessibility; where a pair wraps and whether its name lines up under the
	 * record's is the harness's.
	 */
	const BODIED: RecordSetConfig = {
		...config,
		fieldHeadings: true,
		fields: [
			{ key: 'Uses', type: 'number', max: 3 },
			{
				key: 'Recharge',
				type: 'level',
				input: 'select',
				levels: ['None', 'Short rest', 'Long rest'],
				placement: 'body',
			},
			{ key: 'DC', name: 'Save DC', type: 'number', placement: 'body' },
			{ key: 'Attuned', type: 'toggle', placement: 'body' },
			{
				key: 'Rank',
				type: 'level',
				levels: ['Untrained', 'Trained:', 'Expert:★'],
				placement: 'body',
			},
			// Declared *before* the summary computed field below, so a partition
			// that renumbered its halves would resolve one against the other.
			{
				key: 'Bonus',
				type: 'computed',
				formula: 'Uses + 100',
				placement: 'body',
			},
			{ key: 'Left', type: 'computed', formula: 'Uses + 1' },
			{ key: 'Modifiers', type: 'modifier', placement: 'body' },
		],
	};

	const BODIED_BODY = [
		'',
		'### Second Wind',
		'```sheet',
		'Uses: 1',
		'Recharge: 1',
		'DC: 15',
		'Attuned: no',
		'Rank: 1',
		'Modifiers: armour_class += 1 when Attuned',
		'```',
		'Prose.',
		'',
		'### Lucky',
		'```sheet',
		'Uses: 3',
		'Attuned: yes',
		'```',
		'',
	].join('\n');

	/** The same configuration with every field on the summary line. */
	const summaryOnly = (from: RecordSetConfig): RecordSetConfig => ({
		...from,
		fields: (from.fields ?? []).map((one) => {
			const copy = { ...one };
			delete copy.placement;
			return copy;
		}),
	});

	const resolveWith = (from: RecordSetConfig, body: string) => {
		const data = readData(body, from);
		return makeFieldResolver(recordSet, from, data, NO_ENV);
	};

	const renderBodied = (
		from: RecordSetConfig = BODIED,
		body: string = BODIED_BODY,
		ctx: Partial<RenderContext<RecordSetData>> = {},
	) =>
		render(from, body, {
			resolveField: resolveWith(from, body),
			...ctx,
		});

	const blockOf = (record: HTMLElement) =>
		record.querySelector<HTMLElement>('.sheetsmith-record-body-fields');
	const summaryCells = (record: HTMLElement) =>
		Array.from(
			record.querySelectorAll<HTMLElement>(
				'.sheetsmith-record-summary .sheetsmith-record-field',
			),
		);
	const bodyCells = (record: HTMLElement) =>
		Array.from(
			record.querySelectorAll<HTMLElement>(
				'.sheetsmith-record-body-fields > .sheetsmith-record-field',
			),
		);

	it('declares the placement offer on its fields list, which Table does not', () => {
		const declared = recordSet.configFields.find((one) => one.key === 'fields');
		expect(declared?.columnOptions?.placement).toBe(true);
		expect(declared?.description).toContain('Inside the opened record');
	});

	it("draws no body block where no field carries a placement, and reads 'summary' as absence", () => {
		/*
		 * The harness's three lists as their configurations stand: a headed list of
		 * every field kind, the unheaded control with a select, and a narrow headed
		 * one. A placement of `'summary'` spelled out is the same list.
		 *
		 * **What this does not prove is "identical to the code before the
		 * feature"**, since nothing here holds that code's output. That was checked
		 * once, in the build, by rendering the harness's own three configs with the
		 * base commit's `recordSet` and with this one — byte-identical — and is
		 * recorded in the feature doc rather than stored as a snapshot, which this
		 * repository does not keep and which would fail on every later legitimate
		 * change to this component's markup.
		 */
		const TRAITS: RecordSetConfig = {
			...config,
			fieldHeadings: true,
			fields: [
				{ key: 'Uses', type: 'number', maxSource: 'record' },
				{ key: 'Attuned', type: 'toggle' },
				{ key: 'Rank', type: 'level', levels: ['Untrained', 'Trained:', 'Expert:★'] },
				{ key: 'Left', type: 'computed', formula: '3 - Uses' },
				{ key: 'Modifiers', type: 'modifier' },
			],
		};
		const SPELLS: RecordSetConfig = {
			...config,
			fields: [
				{ key: 'Level', type: 'number', max: 9 },
				{ key: 'Prepared', type: 'toggle' },
				{
					key: 'School',
					type: 'level',
					input: 'select',
					levels: ['None', 'Evocation', 'Abjuration'],
				},
			],
		};
		const KNOWN: RecordSetConfig = {
			...config,
			fieldHeadings: true,
			fields: [
				{ key: 'Level', type: 'number' },
				{ key: 'Prepared', type: 'toggle' },
			],
		};
		for (const each of [TRAITS, SPELLS, KNOWN]) {
			const bare = render(each, BODY);
			expect(bare.querySelector('.sheetsmith-record-body-fields')).toBeNull();
			expect(
				bare.querySelector('.sheetsmith-record-body-has-fields'),
			).toBeNull();
			// Every body is the two prose layers it always was.
			for (const body of bodies(bare)) {
				expect(body.className).toBe('sheetsmith-record-body');
			}
			const spelled = render(
				{
					...each,
					fields: (each.fields ?? []).map((one) => ({
						...one,
						placement: 'summary' as const,
					})),
				},
				BODY,
			);
			expect(spelled.innerHTML).toBe(bare.innerHTML);
		}
	});

	it("draws a body field in a block that is its body's first child, in declared order", () => {
		const el = renderBodied();
		const first = records(el)[0] as HTMLElement;
		const body = bodies(el)[0] as HTMLElement;
		const block = blockOf(first) as HTMLElement;
		expect(body.firstElementChild).toBe(block);
		expect(body.classList.contains('sheetsmith-record-body-has-fields')).toBe(
			true,
		);
		// The prose layers come after it, unchanged.
		expect(block.nextElementSibling?.classList.contains(
			'sheetsmith-record-body-input',
		)).toBe(true);
		expect(
			bodyCells(first).map(
				(cell) => cell.querySelector('.sheetsmith-card-abbreviation')?.textContent,
			),
		).toEqual(['Recharge', 'Save DC', 'Attuned', 'Rank', 'Bonus', 'Modifiers']);
		// And none of them on the summary line.
		expect(
			summaryCells(first).map((cell) => cell.className.match(/field-(\w+)/)?.[1]),
		).toEqual(['number', 'computed']);
	});

	it('keeps body fields in the DOM while their record is closed', () => {
		const el = renderBodied();
		for (const record of records(el)) {
			const body = record.querySelector('.sheetsmith-record-body') as HTMLElement;
			expect(body.getAttribute('hidden')).toBe('until-found');
			expect(body.contains(blockOf(record))).toBe(true);
			expect(bodyCells(record)).toHaveLength(6);
		}
	});

	/**
	 * One edit made through the control drawn in each placement: the classes and
	 * the accessible name it carries, the delta it reports, and the note the
	 * delta writes.
	 */
	function bothWays(
		fields: RecordSetConfig['fields'],
		body: string,
		pick: (record: HTMLElement) => HTMLElement,
		act: (control: HTMLElement) => void,
		ctx: Partial<RenderContext<RecordSetData>> = {},
	) {
		const out = (['summary', 'body'] as const).map((placement) => {
			const placed: RecordSetConfig = {
				...config,
				fields: (fields ?? []).map((one) => ({ ...one, placement })),
			};
			const changes: RecordSetData[] = [];
			closeAnchoredPanel();
			const el = render(placed, body, {
				...ctx,
				onChange: (data) => changes.push(data),
			});
			const control = pick(records(el)[0] as HTMLElement);
			const seen = {
				className: control.className,
				label: control.getAttribute('aria-label'),
			};
			act(control);
			const last = changes[changes.length - 1];
			return {
				seen,
				delta: last,
				note: last === undefined ? null : recordSet.write(last, body, placed),
			};
		});
		const [summary, inBody] = out as [(typeof out)[0], (typeof out)[0]];
		expect(inBody.seen).toEqual(summary.seen);
		expect(summary.delta).toBeDefined();
		expect(inBody.delta).toEqual(summary.delta);
		expect(inBody.note).toBe(summary.note);
		return summary;
	}

	const blur = (value: string) => (control: HTMLElement) => {
		const input = control as HTMLInputElement;
		input.value = value;
		input.dispatchEvent(new Event('input'));
		input.dispatchEvent(new Event('blur'));
	};

	it('commits a number through the same control with the same delta and bytes, in both ceiling modes', () => {
		const body = '\n### A\n```sheet\nUses: 1 / 4\n```\nProse.\n';
		const value = (record: HTMLElement) =>
			record.querySelector(
				'.sheetsmith-record-input:not(.sheetsmith-pool-max)',
			) as HTMLElement;
		const declared = bothWays(
			[{ key: 'Uses', type: 'number', max: 3 }],
			body,
			value,
			blur('2'),
		);
		expect(declared.delta).toEqual({
			records: { 0: { fields: { Uses: '2 / 4' } } },
		});
		const owned = bothWays(
			[{ key: 'Uses', type: 'number', maxSource: 'record' }],
			body,
			(record) =>
				record.querySelector('.sheetsmith-record-input.sheetsmith-pool-max') as HTMLElement,
			blur('6'),
		);
		expect(owned.note).toContain('Uses: 1 / 6');
	});

	it('commits a toggle, a cycled level and a selected level the same way', () => {
		const body = '\n### A\n```sheet\nAttuned: no\nRank: 1\nRecharge: 0\n```\nProse.\n';
		const click = (control: HTMLElement) =>
			control.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const toggle = bothWays(
			[{ key: 'Attuned', type: 'toggle' }],
			body,
			(record) => record.querySelector('.sheetsmith-level-ring') as HTMLElement,
			click,
		);
		expect(toggle.note).toContain('Attuned: yes');
		const cycled = bothWays(
			[{ key: 'Rank', type: 'level', levels: ['Untrained', 'Trained', 'Expert'] }],
			body,
			(record) => record.querySelector('.sheetsmith-level-ring') as HTMLElement,
			click,
		);
		expect(cycled.note).toContain('Rank: 2');
		const selected = bothWays(
			[
				{
					key: 'Recharge',
					type: 'level',
					input: 'select',
					levels: ['None', 'Short rest', 'Long rest'],
				},
			],
			body,
			(record) => record.querySelector('.sheetsmith-record-select') as HTMLElement,
			(control) => {
				const select = control as HTMLSelectElement;
				select.value = '2';
				select.dispatchEvent(new Event('change'));
			},
		);
		expect(selected.note).toContain('Recharge: 2');
	});

	it('commits a modifier through the same shared form the same way', () => {
		const body = '\n### A\n```sheet\nUses: 1\n```\nProse.\n';
		const committed = bothWays(
			[{ key: 'Modifiers', type: 'modifier' }],
			body,
			(record) => record.querySelector('.sheetsmith-record-modifier') as HTMLElement,
			(control) => {
				control.click();
				const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
				typeInto(field(panel, 'Value'), 'armour_class');
				typeInto(field(panel, 'Amount'), '2');
			},
			{ modifiers: modifierContext() },
		);
		expect(committed.note).toContain('Modifiers: armour_class += 2');
		closeAnchoredPanel();
	});

	it('names and counts only summary fields in the strip', () => {
		const el = renderBodied();
		const block = el.querySelector('.sheetsmith-record-set') as HTMLElement;
		expect(
			Array.from(
				el.querySelectorAll('.sheetsmith-record-strip > *'),
			).map((one) => one.textContent),
		).toEqual(['Uses', 'Left']);
		expect(block.classList.contains('sheetsmith-record-set-fields-2')).toBe(true);
		expect(block.style.getPropertyValue('--sheetsmith-record-fields')).toBe('2');

		// Every field in the body: a headed list with nothing to head.
		const allBody: RecordSetConfig = {
			...BODIED,
			fields: (BODIED.fields ?? []).map((one) => ({
				...one,
				placement: 'body' as const,
			})),
		};
		const none = renderBodied(allBody);
		const noneBlock = none.querySelector('.sheetsmith-record-set') as HTMLElement;
		expect(none.querySelector('.sheetsmith-record-strip')).toBeNull();
		expect(none.querySelector('.sheetsmith-record-set-records')).toBeNull();
		expect(noneBlock.className).toBe('sheetsmith-placed sheetsmith-record-set');
		expect(noneBlock.style.getPropertyValue('--sheetsmith-record-fields')).toBe('');
	});

	it('draws the summary line of an all-body list as a list with no fields draws it', () => {
		const allBody: RecordSetConfig = {
			...BODIED,
			fields: (BODIED.fields ?? []).map((one) => ({
				...one,
				placement: 'body' as const,
			})),
		};
		const moved = renderBodied(allBody);
		const empty = render({ ...BODIED, fields: [] }, BODIED_BODY);
		const summaries = (el: HTMLElement) =>
			Array.from(el.querySelectorAll('.sheetsmith-record-summary')).map(
				(one) => one.outerHTML,
			);
		expect(summaries(moved)).toEqual(summaries(empty));
		expect(summaries(moved)).toHaveLength(2);
	});

	it('resolves a computed field by its declared index, in either placement and while closed', () => {
		const paths: string[] = [];
		const real = resolveWith(BODIED, BODIED_BODY);
		const el = renderBodied(BODIED, BODIED_BODY, {
			resolveField: (path, scope) => {
				paths.push(path);
				return real(path, scope);
			},
		});
		const first = records(el)[0] as HTMLElement;
		// Closed, and still resolved.
		expect(
			first.querySelector('.sheetsmith-record-body')?.getAttribute('hidden'),
		).toBe('until-found');
		const bodyValue = first.querySelector(
			'.sheetsmith-record-body-fields .sheetsmith-record-value',
		);
		const summaryValue = first.querySelector(
			'.sheetsmith-record-summary .sheetsmith-record-value',
		);
		expect(bodyValue?.textContent).toBe('101');
		expect(summaryValue?.textContent).toBe('2');
		expect(paths).toContain('fields.5.formula');
		expect(paths).toContain('fields.6.formula');

		// And the same two answers with every field on the summary line.
		const flat = renderBodied(summaryOnly(BODIED));
		expect(
			Array.from(
				(records(flat)[0] as HTMLElement).querySelectorAll('.sheetsmith-record-value'),
			).map((one) => one.textContent),
		).toEqual(['101', '2']);
	});

	it('is counted, summed, reset and pushed exactly as a summary field is', () => {
		const data = readData(BODIED_BODY, BODIED);
		const armourClass: CardConfig = {
			id: 'armour_class',
			type: 'card',
			label: 'Armour class',
			position: { col: 1, row: 4, width: 2, height: 1 },
			derived: '10 + mod.self',
		};
		const sheet = (from: RecordSetConfig, body: string) =>
			buildSheet({ name: 'L', components: [armourClass, from] }, [
				{ config: armourClass, component: card, data: null, error: null },
				{ config: from, component: recordSet, data: readData(body, from), error: null },
			]).env;
		const env = sheet(BODIED, BODIED_BODY);
		expect(evaluate('count(features, Attuned)', env.sheet, callsFrom(env))).toBe(1);
		expect(evaluate('sum(features, DC)', env.sheet, callsFrom(env))).toBe(15);
		// The modifier sits in the body of a record nobody has opened, and its
		// `when` is false until Attuned is set: it pushes once it is.
		expect(env.sheet('armour_class')).toBe(10);
		const attuned = BODIED_BODY.replace('Attuned: no', 'Attuned: yes');
		expect(sheet(BODIED, attuned).sheet('armour_class')).toBe(11);
		expect(sheet(summaryOnly(BODIED), attuned).sheet('armour_class')).toBe(11);

		const reset = { resolve: () => 5, explain: () => null };
		for (const action of ['empty', 'formula'] as const) {
			const results = [BODIED, summaryOnly(BODIED)].map((from) => {
				const result = recordSet.applyReset?.(
					data,
					from,
					{ trigger: 'Long rest', action, to: '5' },
					reset,
				);
				if (!result?.ok) throw new Error('expected a reset');
				return recordSet.write(result.data, BODIED_BODY, from);
			});
			expect(results[0]).toBe(results[1]);
			expect(results[0]).toContain(action === 'empty' ? 'DC: 0' : 'DC: 5');
			expect(results[0]).toContain(
				action === 'empty' ? 'Attuned: no' : 'Attuned: yes',
			);
		}
		// `full` writes a body counter's ceiling as it writes a summary one's.
		const bounded: RecordSetConfig = {
			...BODIED,
			fields: [
				{ key: 'Uses', type: 'number', max: 3, placement: 'body' },
				{ key: 'Attuned', type: 'toggle', placement: 'body' },
			],
		};
		const full = recordSet.applyReset?.(
			readData(BODIED_BODY, bounded),
			bounded,
			{ trigger: 'Long rest', action: 'full' },
			reset,
		);
		if (!full?.ok) throw new Error('expected a reset');
		expect(recordSet.write(full.data, BODIED_BODY, bounded)).toContain(
			'Uses: 3\nRecharge',
		);
	});

	it('draws a visible name beside every body field, contained in its accessible name', () => {
		const el = renderBodied(BODIED, BODIED_BODY, {
			modifiers: modifierContext(),
		});
		const first = records(el)[0] as HTMLElement;
		const cells = bodyCells(first);
		const kinds = new Set<string>();
		for (const cell of cells) {
			const shown = cell.querySelector(
				':scope > .sheetsmith-card-abbreviation',
			)?.textContent;
			expect(shown, cell.className).toBeTruthy();
			const control = cell.querySelector<HTMLElement>(
				'button, select, input:not(.sheetsmith-pool-max)',
			);
			const said =
				control?.getAttribute('aria-label') ??
				cell.querySelector('.sheetsmith-sr-only')?.textContent ??
				'';
			expect(said, shown ?? '').toContain(shown);
			kinds.add(cell.className.match(/field-(\w+)/)?.[1] ?? '');
		}
		expect(kinds).toEqual(
			new Set(['number', 'toggle', 'level', 'computed', 'modifier']),
		);
		// Not hidden from a screen reader, which would skip a word a sighted reader sees.
		expect(
			first.querySelector(
				'.sheetsmith-record-body-fields [aria-hidden="true"].sheetsmith-card-abbreviation',
			),
		).toBeNull();
	});

	it('tells a body ring its name is on screen, and leaves a summary ring as it was', () => {
		const el = renderBodied();
		const first = records(el)[0] as HTMLElement;
		const rings = Array.from(
			first.querySelectorAll<HTMLElement>(
				'.sheetsmith-record-body-fields .sheetsmith-level-ring',
			),
		);
		const [toggle, graded] = rings as [HTMLElement, HTMLElement];
		expect(toggle.hasAttribute('title')).toBe(false);
		// A named level's word, which the glyph cannot draw — and nothing else.
		expect(graded.getAttribute('title')).toBe('Trained');

		const flat = renderBodied(summaryOnly(BODIED));
		const summaryRings = Array.from(
			(records(flat)[0] as HTMLElement).querySelectorAll<HTMLElement>(
				'.sheetsmith-level-ring',
			),
		);
		expect(summaryRings.map((ring) => ring.getAttribute('title'))).toEqual([
			'Second Wind Attuned',
			'Second Wind Rank: Trained',
		]);
	});

	it('draws no block for an unreadable fence, and the empty body field under one with no prose', () => {
		const broken = renderBodied(
			BODIED,
			'\n### Broken\n```sheet\nUses: 1\nUses: 2\n```\nProse.\n',
		);
		expect(broken.querySelector('.sheetsmith-record-body-fields')).toBeNull();
		expect(errors(broken).length).toBeGreaterThan(0);

		const el = renderBodied();
		const lucky = records(el)[1] as HTMLElement;
		const block = blockOf(lucky) as HTMLElement;
		expect(block).not.toBeNull();
		const prose = block.nextElementSibling as HTMLTextAreaElement;
		expect(prose.classList.contains('sheetsmith-record-body-input')).toBe(true);
		expect(prose.value).toBe('');
		expect(prose.placeholder).toBe('Write anything about this feature.');
		// An unstored body number says it is empty, where a summary one is blank:
		// a name followed by nothing reads as missing content in the body.
		const dc = bodyCells(lucky)[1]?.querySelector<HTMLInputElement>(
			'.sheetsmith-record-input',
		);
		expect(dc?.value).toBe('');
		expect(dc?.placeholder).toBe('—');
		const summaryUses = lucky.querySelector<HTMLInputElement>(
			'.sheetsmith-record-summary .sheetsmith-record-input',
		);
		expect(summaryUses?.placeholder).toBe('');
	});

	it('reads an unknown placement as the summary line, with no error, and keeps it in the layout', () => {
		const odd: RecordSetConfig = {
			...config,
			fields: [
				{ key: 'Uses', type: 'number', placement: 'Body' as never },
				{ key: 'Attuned', type: 'toggle', placement: 'header' as never },
				{ key: 'Rank', type: 'level', secondary: true, hideHeading: true },
			],
		};
		expect(recordSet.read(BODY, odd).ok).toBe(true);
		const el = render(odd, BODY);
		expect(el.querySelector('.sheetsmith-record-body-fields')).toBeNull();
		expect(summaryCells(records(el)[0] as HTMLElement)).toHaveLength(3);
		const layout = { name: 'L', components: [odd], triggers: [] };
		const text = serialiseLayout(layout);
		expect(text).toContain('"placement": "Body"');
		expect(text).toContain('"placement": "header"');
		expect(serialiseLayout(parseLayout(text))).toBe(text);
	});

	it('round-trips a layout carrying a body placement, and never writes the default', () => {
		const layout = { name: 'L', components: [BODIED], triggers: [] };
		const text = serialiseLayout(layout);
		expect(text).toContain('"placement": "body"');
		expect(text).not.toContain('"placement": "summary"');
		expect(serialiseLayout(parseLayout(text))).toBe(text);
	});

	it('gives the block no role, no aria-hidden and no control of its own', () => {
		const el = renderBodied(BODIED, BODIED_BODY, { modifiers: modifierContext() });
		const block = blockOf(records(el)[0] as HTMLElement) as HTMLElement;
		expect(block.hasAttribute('role')).toBe(false);
		expect(block.hasAttribute('aria-hidden')).toBe(false);
		// Every button in it belongs to a field.
		for (const button of Array.from(block.querySelectorAll('button'))) {
			expect(button.closest('.sheetsmith-record-field')).not.toBeNull();
		}
		expect(
			Array.from(block.children).every((one) =>
				one.classList.contains('sheetsmith-record-field'),
			),
		).toBe(true);
	});
});

describe('a field shown only where its condition holds', () => {
	/*
	 * `docs/features/conditional-field-visibility.md`. A field's `visibleWhen` is
	 * a boolean formula in the record's own scope; false hides the field in place,
	 * anything that cannot be worked out shows it and says so once above the
	 * records, and nothing but `render` ever evaluates one.
	 */
	const RECHARGING: RecordSetConfig = {
		id: 'recharging',
		type: 'record-set',
		label: 'Recharging features',
		position: { col: 1, row: 1, width: 7, height: 4 },
		recordName: 'Feature',
		fields: [
			{
				key: 'Recharges',
				type: 'level',
				input: 'select',
				levels: ['None', 'Short rest', 'Long rest', 'Always-on'],
			},
			{
				key: 'Uses',
				type: 'number',
				maxSource: 'record',
				visibleWhen: 'Recharges == 1 || Recharges == 2',
			},
			{ key: 'Active', type: 'toggle', visibleWhen: 'Recharges == 3' },
			{
				key: 'DC',
				name: 'Save DC',
				type: 'number',
				placement: 'body',
				visibleWhen: 'Recharges != 0',
			},
			{ key: 'Modifiers', type: 'modifier' },
		],
	};

	/** One record per stored level, 0 to 3, in order. */
	const LEVELS_BODY = [
		'',
		'### Darkvision',
		'```sheet',
		'Recharges: 0',
		'Uses: 2 / 2',
		'Active: yes',
		'DC: 12',
		'```',
		'Prose.',
		'',
		'### Second Wind',
		'```sheet',
		'Recharges: 1',
		'Uses: 1 / 1',
		'DC: 13',
		'```',
		'Prose.',
		'',
		'### Rage',
		'```sheet',
		'Recharges: 2',
		'Uses: 0 / 3',
		'Active: yes',
		'```',
		'Prose.',
		'',
		'### Aura of Protection',
		'```sheet',
		'Recharges: 3',
		'Active: yes',
		'Uses: 2 / 2',
		'Modifiers: armour_class += 1 when Active',
		'```',
		'Prose.',
		'',
	].join('\n');

	/** A render with the real resolver and explainer over the note's own data. */
	function renderWith(
		from: RecordSetConfig = RECHARGING,
		body: string = LEVELS_BODY,
		ctx: Partial<RenderContext<RecordSetData>> = {},
	) {
		const data = readData(body, from);
		return render(from, body, {
			resolveField: makeFieldResolver(recordSet, from, data, NO_ENV),
			explainField: makeFieldExplainer(recordSet, from, data, NO_ENV),
			...ctx,
		});
	}

	/** A record's cell for one field, by its name on the sheet. */
	const cellOf = (record: HTMLElement, name: string): HTMLElement | null => {
		for (const cell of Array.from(
			record.querySelectorAll<HTMLElement>('.sheetsmith-record-field'),
		)) {
			// A control's name, or a computed value's hidden twin, which is how a
			// read-only field names itself.
			const label =
				cell.querySelector('[aria-label]')?.getAttribute('aria-label') ??
				cell.querySelector('.sheetsmith-sr-only')?.textContent ??
				'';
			if (label.endsWith(` ${name}`) || label.startsWith(`${name}`)) {
				return cell;
			}
		}
		return null;
	};

	/** Which of the named fields each record shows, as `hidden` says. */
	const shownOn = (el: HTMLElement, names: string[]): string[][] =>
		records(el).map((record) =>
			names.filter((name) => {
				const cell = cellOf(record, name);
				if (cell === null) throw new Error(`no ${name} cell`);
				return !cell.hasAttribute('hidden');
			}),
		);

	const noConditions = (from: RecordSetConfig): RecordSetConfig => ({
		...from,
		fields: (from.fields ?? []).map((one) => {
			const copy = { ...one };
			delete copy.visibleWhen;
			return copy;
		}),
	});

	it("draws exactly the board card's case at every stored level", () => {
		const el = renderWith();
		expect(shownOn(el, ['Uses', 'Active'])).toEqual([
			[],
			['Uses'],
			['Uses'],
			['Active'],
		]);
		// The controlling field is never hidden.
		expect(shownOn(el, ['Recharges'])).toEqual([
			['Recharges'],
			['Recharges'],
			['Recharges'],
			['Recharges'],
		]);
	});

	it('keeps a hidden field in the DOM, on the summary line and in the body', () => {
		const el = renderWith();
		const darkvision = records(el)[0] as HTMLElement;
		const uses = cellOf(darkvision, 'Uses') as HTMLElement;
		const dc = cellOf(darkvision, 'Save DC') as HTMLElement;
		expect(uses.getAttribute('hidden')).toBe('');
		expect(uses.closest('.sheetsmith-record-summary')).not.toBeNull();
		expect(dc.getAttribute('hidden')).toBe('');
		expect(dc.closest('.sheetsmith-record-body-fields')).not.toBeNull();
		// Plain `hidden`, never `until-found`, and never `aria-hidden`.
		expect(el.querySelectorAll('.sheetsmith-record-field[hidden="until-found"]')).toHaveLength(0);
		expect(el.querySelectorAll('.sheetsmith-record-field[aria-hidden]')).toHaveLength(0);
		const secondWind = records(el)[1] as HTMLElement;
		expect(cellOf(secondWind, 'Uses')?.hasAttribute('hidden')).toBe(false);
		expect(cellOf(secondWind, 'Save DC')?.hasAttribute('hidden')).toBe(false);
	});

	it('keeps every control, so the view restores focus to the same index either way', () => {
		const body = LEVELS_BODY;
		const shown = renderWith(RECHARGING, body);
		const flipped = renderWith(
			{
				...RECHARGING,
				fields: (RECHARGING.fields ?? []).map((one) =>
					one.visibleWhen === undefined
						? one
						: { ...one, visibleWhen: `!(${String(one.visibleWhen)})` },
				),
			},
			body,
		);
		const count = (el: HTMLElement) =>
			records(el).map((record) => record.querySelectorAll(FOCUSABLE).length);
		expect(count(flipped)).toEqual(count(shown));
		expect(shownOn(flipped, ['Uses', 'Active'])).toEqual([
			['Uses', 'Active'],
			['Active'],
			['Active'],
			['Uses'],
		]);
	});

	it('draws no hidden field on the harness lists, which carry no condition', () => {
		for (const id of ['traits', 'spells', 'known_spells']) {
			const sample = harnessRecordSet(id);
			const el = render(
				sample.config,
				sample.body,
				{ resolveField: makeFieldResolver(recordSet, sample.config, readData(sample.body, sample.config), NO_ENV) },
			);
			expect(el.querySelectorAll('.sheetsmith-record-field').length, id).toBeGreaterThan(0);
			expect(el.querySelectorAll('.sheetsmith-record-field[hidden]'), id).toHaveLength(0);
			expect(el.querySelectorAll('.sheetsmith-record-body-fields[hidden]'), id).toHaveLength(0);
		}
	});

	it('draws a blank condition exactly as the key being absent', () => {
		const bare = noConditions(RECHARGING);
		const blank: RecordSetConfig = {
			...bare,
			fields: (bare.fields ?? []).map((one) => ({ ...one, visibleWhen: '  ' })),
		};
		expect(renderWith(blank).innerHTML).toBe(renderWith(bare).innerHTML);
	});

	it('takes a hand-written true or false as its own answer', () => {
		const literal = (value: boolean): RecordSetConfig => ({
			...RECHARGING,
			fields: (RECHARGING.fields ?? []).map((one) =>
				one.key === 'Uses' ? { ...one, visibleWhen: value } : one,
			),
		});
		expect(shownOn(renderWith(literal(false)), ['Uses'])).toEqual([[], [], [], []]);
		expect(shownOn(renderWith(literal(true)), ['Uses'])).toEqual([
			['Uses'],
			['Uses'],
			['Uses'],
			['Uses'],
		]);
	});

	it("reads its own condition by the field's declared index", () => {
		/*
		 * A conditioned field declared after a body field and after a computed
		 * one: a filtered half with its own indices would resolve its neighbour's
		 * condition. The last field reads a stored sibling and is shown only where
		 * it holds; the one before it reads a computed sibling, which is not in
		 * the stored layer, so it fails as unknown and is shown.
		 */
		const ordered: RecordSetConfig = {
			...RECHARGING,
			fields: [
				{ key: 'Uses', type: 'number', visibleWhen: 'Uses_max > 99' },
				{ key: 'DC', type: 'number', placement: 'body', visibleWhen: 'true' },
				{ key: 'Left', type: 'computed', formula: '3 - Uses', visibleWhen: 'false' },
				{ key: 'Uses_max', type: 'number', visibleWhen: 'Left > 0' },
				{ key: 'Active', type: 'toggle', visibleWhen: 'Uses_max == 2' },
			],
		};
		const body = [
			'',
			'### A',
			'```sheet',
			'Uses: 1',
			'Uses_max: 2',
			'```',
			'',
			'### B',
			'```sheet',
			'Uses: 1',
			'Uses_max: 3',
			'```',
			'',
		].join('\n');
		const el = renderWith(ordered, body);
		expect(shownOn(el, ['Uses', 'DC', 'Left', 'Uses_max', 'Active'])).toEqual([
			['DC', 'Uses_max', 'Active'],
			['DC', 'Uses_max'],
		]);
		// `Left` is computed, so `Uses_max`'s condition fails naming it.
		const line = el.querySelector('.sheetsmith-record-set-list > .sheetsmith-error');
		expect(line?.textContent).toContain('"Uses_max" is shown on every feature');
		expect(line?.textContent).toContain('Unknown name "Left".');
	});

	describe('a condition naming its own field', () => {
		const selfNamed = (condition: string): RecordSetConfig => ({
			...RECHARGING,
			fields: (RECHARGING.fields ?? []).map((one) =>
				one.key === 'Uses' ? { ...one, visibleWhen: condition } : one,
			),
		});
		const ZERO = LEVELS_BODY.replace('Uses: 1 / 1', 'Uses: 0 / 1');

		it.each(['Uses > 0', 'Uses == 0 || Recharges == 1'])(
			'is refused: %s shows the field on every record and is never evaluated',
			(condition) => {
				const from = selfNamed(condition);
				const data = readData(ZERO, from);
				const real = makeFieldResolver(recordSet, from, data, NO_ENV);
				const resolveField = vi.fn(real);
				const el = render(from, ZERO, { resolveField });
				expect(shownOn(el, ['Uses'])).toEqual([['Uses'], ['Uses'], ['Uses'], ['Uses']]);
				expect(
					resolveField.mock.calls.filter(([path]) => path === 'fields.1.visibleWhen'),
				).toHaveLength(0);
				// No problem line: it is a layout error, reported in the editor.
				expect(el.querySelectorAll('.sheetsmith-record-set-list > .sheetsmith-error')).toHaveLength(0);
				expect(recordSet.read(ZERO, from).ok).toBe(true);
			},
		);

		it('is not refused where the name is dotted, which is somebody else on the sheet', () => {
			const from = selfNamed('abilities.Uses > 0');
			const data = readData(ZERO, from);
			const resolveField = vi.fn(makeFieldResolver(recordSet, from, data, NO_ENV));
			render(from, ZERO, { resolveField });
			expect(
				resolveField.mock.calls.filter(([path]) => path === 'fields.1.visibleWhen').length,
			).toBeGreaterThan(0);
		});
	});

	describe('a hidden field still counts everywhere', () => {
		const armourClass: CardConfig = {
			id: 'armour_class',
			type: 'card',
			label: 'Armour class',
			position: { col: 1, row: 5, width: 2, height: 1 },
			derived: '10 + mod.self',
		};

		function sheetFor(from: RecordSetConfig, body: string) {
			const data = readData(body, from);
			const layout: Layout = { name: 'L', components: [armourClass, from] };
			return buildSheet(layout, [
				{ config: armourClass, component: card, data: null, error: null },
				{ config: from, component: recordSet, data, error: null },
			]);
		}

		it('is added up by an aggregate, and left out only by the aggregate saying so', () => {
			const { env } = sheetFor(RECHARGING, LEVELS_BODY);
			// Darkvision's hidden 2 and Aura's hidden 2 are counted.
			expect(evaluate('sum(recharging, Uses)', env.sheet, callsFrom(env))).toBe(5);
			expect(
				evaluate(
					'sum(recharging, Uses, Recharges == 1 || Recharges == 2)',
					env.sheet,
					callsFrom(env),
				),
			).toBe(1);
		});

		it('applies a when clause reading a hidden toggle', () => {
			// Aura of Protection's Active is shown; switch it to a short rest and
			// Active is hidden, still stored yes, and the push still applies.
			const switched = LEVELS_BODY.replace(
				'Recharges: 3\nActive: yes',
				'Recharges: 1\nActive: yes',
			);
			expect(sheetFor(RECHARGING, switched).env.sheet('armour_class')).toBe(11);
			const el = renderWith(RECHARGING, switched);
			expect(cellOf(records(el)[3] as HTMLElement, 'Active')?.hasAttribute('hidden')).toBe(true);
		});

		it('pushes from a modifier field hidden on a closed record', () => {
			const hiddenModifiers: RecordSetConfig = {
				...RECHARGING,
				fields: (RECHARGING.fields ?? []).map((one) =>
					one.key === 'Modifiers' ? { ...one, visibleWhen: 'false' } : one,
				),
			};
			expect(sheetFor(hiddenModifiers, LEVELS_BODY).env.sheet('armour_class')).toBe(11);
		});

		it.each(['empty', 'full', 'formula'] as const)(
			'is written by a %s reset exactly as a shown one is',
			(action) => {
				const reset = { trigger: 'Long rest', action, to: '1' };
				const resetContext = {
					resolve: () => 1,
					explain: () => null,
				};
				// A ceiling on the one field whose ceiling is the layout's, so `full`
				// has something to restore every number to.
				const from: RecordSetConfig = {
					...RECHARGING,
					fields: (RECHARGING.fields ?? []).map((one) =>
						one.key === 'DC' ? { ...one, max: 20 } : one,
					),
				};
				const withConditions = recordSet.applyReset?.(
					readData(LEVELS_BODY, from),
					from,
					reset,
					resetContext,
				);
				const without = recordSet.applyReset?.(
					readData(LEVELS_BODY, noConditions(from)),
					noConditions(from),
					reset,
					resetContext,
				);
				expect(withConditions?.ok).toBe(true);
				expect(withConditions).toEqual(without);
				if (!withConditions?.ok) return;
				// Darkvision's hidden Uses and hidden Active are both written.
				expect(withConditions.data.records[0]?.fields?.Uses).toBeDefined();
				expect(withConditions.data.records[0]?.fields?.Active).toBeDefined();
			},
		);

		it('is never evaluated by what the sheet reads', () => {
			const data = readData(LEVELS_BODY, RECHARGING);
			const resolve = vi.fn(makeFieldResolver(recordSet, RECHARGING, data, NO_ENV));
			recordSet.scopeRows?.(data, RECHARGING)?.(resolve);
			recordSet.scopeModifiers?.(data, RECHARGING)?.(resolve);
			for (const action of ['empty', 'full', 'formula'] as const) {
				recordSet.applyReset?.(
					data,
					RECHARGING,
					{ trigger: 'Long rest', action, to: '1' },
					{
						resolve: (field, extra) => resolve(field, extra),
						explain: () => null,
					},
				);
			}
			expect(resolve.mock.calls.length).toBeGreaterThan(0);
			expect(
				resolve.mock.calls.filter(([path]) => path.endsWith('.visibleWhen')),
			).toEqual([]);
		});
	});

	it('leaves a hidden value untouched when a sibling commit hides it', () => {
		const changes: RecordSetData[] = [];
		const el = renderWith(RECHARGING, LEVELS_BODY, {
			onChange: (data) => changes.push(data),
		});
		// Second Wind, from a short rest to always-on: Uses goes, Active comes.
		const select = records(el)[1]?.querySelector('select') as HTMLSelectElement;
		select.value = '3';
		select.dispatchEvent(new Event('change'));
		expect(changes).toEqual([{ records: { 1: { fields: { Recharges: '3' } } } }]);
		const written = recordSet.write(changes[0] as RecordSetData, LEVELS_BODY, RECHARGING);
		const before = LEVELS_BODY.split('\n');
		const after = written.split('\n');
		expect(after).toHaveLength(before.length);
		const changed = after.filter((line, at) => line !== before[at]);
		expect(changed).toEqual(['Recharges: 3']);
		expect(written).toContain('Uses: 1 / 1');
		// And on the rebuild, Uses is hidden with its value intact.
		const rebuilt = renderWith(RECHARGING, written);
		const uses = cellOf(records(rebuilt)[1] as HTMLElement, 'Uses') as HTMLElement;
		expect(uses.hasAttribute('hidden')).toBe(true);
		expect(uses.querySelector('input')?.value).toBe('1');
	});

	it('announces a commit that flips a sibling exactly as it would with no conditions', () => {
		// Active shown while Uses is above zero, so spending the last use hides it.
		const counted: RecordSetConfig = {
			...RECHARGING,
			fields: (RECHARGING.fields ?? []).map((one) =>
				one.key === 'Active'
					? { ...one, visibleWhen: 'Uses > 0' }
					: one.key === 'Uses'
						? { ...one, visibleWhen: undefined }
						: one,
			),
		};
		const said = (from: RecordSetConfig) => {
			const el = renderWith(from, LEVELS_BODY, { onChange: () => undefined });
			const input = cellOf(records(el)[1] as HTMLElement, 'Uses')?.querySelector(
				'input',
			) as HTMLInputElement;
			input.focus();
			input.value = '0';
			input.dispatchEvent(new Event('input'));
			input.dispatchEvent(new Event('blur'));
			return el.querySelector('[aria-live]')?.textContent;
		};
		const withConditions = said(counted);
		// It said something, so the comparison is about a sentence.
		expect(withConditions).toBeTruthy();
		expect(withConditions).toBe(said(noConditions(counted)));
	});

	describe('a condition that cannot be worked out', () => {
		const failing = (condition: string): RecordSetConfig => ({
			...RECHARGING,
			fields: (RECHARGING.fields ?? []).map((one) =>
				one.key === 'Uses' ? { ...one, visibleWhen: condition } : one,
			),
		});

		it.each([
			['names an unknown key', 'Recharge == 1', 'Unknown name "Recharge".'],
			['comes to a number', 'Recharges + 1', 'which is not true or false'],
			['will not parse', 'Recharges ==', ''],
		])('shows the field where it %s, and says so once above the records', (_, condition, why) => {
			const from = failing(condition);
			const el = renderWith(from);
			expect(shownOn(el, ['Uses'])).toEqual([['Uses'], ['Uses'], ['Uses'], ['Uses']]);
			const list = el.querySelector('.sheetsmith-record-set-list') as HTMLElement;
			const lines = Array.from(list.querySelectorAll(':scope > .sheetsmith-error'));
			expect(lines).toHaveLength(1);
			expect(list.firstElementChild).toBe(lines[0]);
			const text = lines[0]?.textContent ?? '';
			expect(text).toMatch(/^"Uses" is shown on every feature because its condition could not be worked out: /);
			expect(text).toContain(why);
			expect(text).toMatch(/Fix the condition under Shown when in the layout editor\.$/);
			const data = readData(LEVELS_BODY, from);
			const explained = makeFieldExplainer(recordSet, from, data, NO_ENV)(
				'fields.1.visibleWhen',
				{ Recharges: 0 },
			);
			if (explained !== null) expect(text).toContain(explained);
			expect(recordSet.read(LEVELS_BODY, from).ok).toBe(true);
			// Every other field still works: Active is still conditioned.
			expect(shownOn(el, ['Active'])).toEqual([[], [], [], ['Active']]);
		});

		it('counts the records it failed on where only some did', () => {
			const from: RecordSetConfig = {
				...RECHARGING,
				fields: [
					{ key: 'Uses', type: 'number' },
					{ key: 'Active', type: 'toggle', visibleWhen: 'Uses > 0' },
				],
			};
			const body = ['A', 'B', 'C', 'D', 'E']
				.map((name, at) =>
					[`### ${name}`, '```sheet', `Uses: ${at < 2 ? 'lots' : '1'}`, '```', ''].join('\n'),
				)
				.join('\n');
			const el = renderWith(from, `\n${body}`);
			const lines = el.querySelectorAll('.sheetsmith-record-set-list > .sheetsmith-error');
			expect(lines).toHaveLength(1);
			expect(lines[0]?.textContent).toMatch(/^"Active" is shown on 2 features because/);
			expect(shownOn(el, ['Active'])).toEqual([['Active'], ['Active'], ['Active'], ['Active'], ['Active']]);
		});

		it('puts the line in the records wrapper on a headed list, under the strip', () => {
			const el = renderWith({ ...failing('Recharge == 1'), fieldHeadings: true });
			const wrapper = el.querySelector('.sheetsmith-record-set-records') as HTMLElement;
			expect(wrapper.firstElementChild?.classList.contains('sheetsmith-error')).toBe(true);
			expect(el.querySelectorAll('.sheetsmith-record-set-list .sheetsmith-error:not(.sheetsmith-record > *)')).toHaveLength(1);
		});
	});

	describe('under the strip', () => {
		const tracksOf = (record: HTMLElement) =>
			Array.from(
				record.querySelectorAll<HTMLElement>(
					'.sheetsmith-record-summary .sheetsmith-record-field',
				),
			).map((cell) => cell.style.getPropertyValue('--sheetsmith-record-track'));

		it('puts each summary field of a headed list in its own track, in declared order', () => {
			const traits = harnessRecordSet('traits');
			const el = render(traits.config, traits.body, {
				resolveField: makeFieldResolver(recordSet, traits.config, readData(traits.body, traits.config), NO_ENV),
			});
			for (const record of records(el).filter((one) => one.querySelector('.sheetsmith-record-fields')?.children.length)) {
				expect(tracksOf(record)).toEqual(['1', '2', '3', '4', '5']);
			}
			const strip = el.querySelector('.sheetsmith-record-strip') as HTMLElement;
			expect(strip.children).toHaveLength(5);
			const block = el.querySelector('.sheetsmith-record-set') as HTMLElement;
			expect(block.classList.contains('sheetsmith-record-set-fields-5')).toBe(true);
			expect(block.style.getPropertyValue('--sheetsmith-record-fields')).toBe('5');
			for (const cell of Array.from(
				el.querySelectorAll<HTMLElement>('.sheetsmith-record-body-fields .sheetsmith-record-field'),
			)) {
				expect(cell.style.getPropertyValue('--sheetsmith-record-track')).toBe('');
			}
		});

		it('stamps no track on an unheaded list', () => {
			const el = renderWith();
			expect(
				Array.from(el.querySelectorAll<HTMLElement>('.sheetsmith-record-field')).filter(
					(cell) => cell.style.getPropertyValue('--sheetsmith-record-track') !== '',
				),
			).toEqual([]);
		});

		it('keeps every summary field in its own track whether hidden or not', () => {
			const headed = { ...RECHARGING, fieldHeadings: true };
			const el = renderWith(headed);
			for (const record of records(el)) {
				expect(tracksOf(record)).toEqual(['1', '2', '3', '4']);
			}
			const block = el.querySelector('.sheetsmith-record-set') as HTMLElement;
			const plain = renderWith(noConditions(headed)).querySelector('.sheetsmith-record-set') as HTMLElement;
			expect(block.className).toBe(plain.className);
			expect(block.className).toContain('sheetsmith-record-set-fields-4');
			expect(block.style.getPropertyValue('--sheetsmith-record-fields')).toBe('4');
		});
	});

	describe('the body block', () => {
		const blockOf = (record: HTMLElement) =>
			record.querySelector<HTMLElement>('.sheetsmith-record-body-fields');
		const bodyOf = (record: HTMLElement) =>
			record.querySelector<HTMLElement>('.sheetsmith-record-body');

		it('is hidden with the class taken away where every body field is hidden', () => {
			const el = renderWith();
			const darkvision = records(el)[0] as HTMLElement;
			expect(blockOf(darkvision)?.getAttribute('hidden')).toBe('');
			expect(bodyOf(darkvision)?.classList.contains('sheetsmith-record-body-has-fields')).toBe(false);
			const secondWind = records(el)[1] as HTMLElement;
			expect(blockOf(secondWind)?.hasAttribute('hidden')).toBe(false);
			expect(bodyOf(secondWind)?.classList.contains('sheetsmith-record-body-has-fields')).toBe(true);
		});

		it('comes back with one shown body field', () => {
			const two: RecordSetConfig = {
				...RECHARGING,
				fields: [
					...(RECHARGING.fields ?? []),
					{ key: 'Range', type: 'number', placement: 'body' },
				],
			};
			const darkvision = records(renderWith(two))[0] as HTMLElement;
			expect(blockOf(darkvision)?.hasAttribute('hidden')).toBe(false);
			expect(bodyOf(darkvision)?.classList.contains('sheetsmith-record-body-has-fields')).toBe(true);
			expect(cellOf(darkvision, 'Save DC')?.hasAttribute('hidden')).toBe(true);
		});
	});

	it('round-trips a layout carrying conditions on Record set fields and a Table column', () => {
		const table = {
			id: 'inventory',
			type: 'table',
			label: 'Inventory',
			position: { col: 1, row: 6, width: 6, height: 2 },
			columns: [
				{ key: 'Qty', type: 'number' },
				{ key: 'Weight', type: 'number', visibleWhen: 'Qty > 0' },
			],
		};
		const layout = {
			name: 'L',
			components: [
				{
					...RECHARGING,
					fields: [
						...(RECHARGING.fields ?? []),
						{ key: 'Spare', type: 'toggle' as const, visibleWhen: false },
					],
				},
				table,
			],
			triggers: [],
		} as unknown as Layout;
		const text = serialiseLayout(layout);
		expect(text).toContain('"visibleWhen": "Recharges == 1 || Recharges == 2"');
		expect(text).toContain('"visibleWhen": "Qty > 0"');
		expect(text).toContain('"visibleWhen": false');
		expect(serialiseLayout(parseLayout(text))).toBe(text);
	});
});

/*
 * A reset that reaches only the records its condition admits
 * (`docs/features/record-set-reset-scope.md`).
 *
 * **On a list with two `number` fields**, `Uses` and a `DC` with `max: 20`, so no
 * case passes because the list avoids the layout where every-field writing
 * shows: `where` narrows *which records* are written, and a binding naming no
 * field writes every number field of each reached record. The DC assertions
 * below pin that as the reading of **Every field**, which is what every Record
 * set binding meant before one could name a field — and a binding naming one is
 * held to writing that field alone, further down
 * (`docs/features/record-set-reset-field-targeting.md`).
 */
describe('a reset that reaches only the records its condition admits', () => {
	const SCOPED: RecordSetConfig = {
		id: 'rest_features',
		type: 'record-set',
		label: 'Rest features',
		position: { col: 1, row: 1, width: 6, height: 3 },
		recordName: 'Feature',
		fields: [
			{
				key: 'Recharges',
				type: 'level',
				input: 'select',
				levels: ['None', 'Short rest', 'Long rest', 'Always-on'],
			},
			{ key: 'Uses', type: 'number', maxSource: 'record' },
			{ key: 'DC', name: 'Save DC', type: 'number', max: 20, placement: 'body' },
		],
	};

	/** Five records; two recharge on a short rest, one of those holding no DC. */
	const SCOPED_BODY = [
		'',
		'### Second Wind',
		'```sheet',
		'Recharges: 1',
		'Uses: 0 / 1',
		'DC: 13',
		'```',
		'Regain hit points as a bonus action.',
		'',
		'### Action Surge',
		'```sheet',
		'Recharges: 1',
		'Uses: 0/1',
		'```',
		'Take one additional action.',
		'',
		'### Rage',
		'```sheet',
		'Recharges: 2',
		'Uses: 1 / 3',
		'DC: 15',
		'```',
		'Advantage on Strength checks.',
		'',
		'### Darkvision',
		'```sheet',
		'Recharges: 0',
		'```',
		'See in the dark.',
		'',
		'### Aura of Protection',
		'```sheet',
		'Recharges: 3',
		'DC: 15',
		'```',
		'Allies add your Charisma to saves.',
		'',
	].join('\n');

	/**
	 * `applyReset` the way the sheet's plan calls it: the binding at index 0 of
	 * the component's own list, `reset.to` and `reset.where` rewritten to it, and
	 * the real resolver over the real config — so a condition fails here exactly
	 * as it would at the press.
	 */
	function press(
		reset: ResetBinding,
		{ from = SCOPED, body = SCOPED_BODY }: { from?: RecordSetConfig; body?: string } = {},
	) {
		const cfg: RecordSetConfig = { ...from, reset: [reset] };
		const data = readData(body, cfg);
		const resolver = makeFieldResolver(recordSet, cfg, data, NO_ENV);
		const explainer = makeFieldExplainer(recordSet, cfg, data, NO_ENV);
		const calls: [string, Record<string, unknown>][] = [];
		const result = recordSet.applyReset?.(
			data,
			cfg,
			reset,
			// The plan's own rewrite, so these cases fail with it rather than
			// against a copy of it.
			bindingContext(
				(path, scope) => {
					calls.push([path, scope]);
					return resolver(path, scope);
				},
				explainer,
				0,
			),
		);
		if (result === undefined) throw new Error('expected a reset');
		const written = result.ok ? recordSet.write(result.data, body, cfg) : body;
		/** Each record's fence entries after the press, by name. */
		const fields: Record<string, Record<string, string> | undefined> = {};
		for (const one of Object.values(readData(written, cfg).records)) {
			fields[one.name ?? ''] = one.fields;
		}
		return { result, written, calls, fields };
	}

	/** The text of one record's block, so "byte-identical" can be asserted per record. */
	const block = (text: string, name: string): string => {
		const start = text.indexOf(`### ${name}\n`);
		const next = text.indexOf('\n### ', start + 1);
		return text.slice(start, next === -1 ? undefined : next);
	};

	const SHORT_REST = 'Recharges == 1';

	describe('with no condition', () => {
		it.each([
			['full', {}],
			['empty', {}],
			['formula', { to: '2' }],
		] as const)('%s reaches every record, as it always did, and reports no reach', (action, extra) => {
			const { result } = press({ trigger: 'Short rest', action, ...extra });
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.reach).toBeUndefined();
			// Every readable record that has something for this action to write.
			expect(Object.keys(result.data.records).length).toBeGreaterThanOrEqual(3);
		});

		it('is read as absent where the condition is blank', () => {
			const blank = press({ trigger: 'Short rest', action: 'empty', where: '  ' });
			const none = press({ trigger: 'Short rest', action: 'empty' });
			expect(blank.result).toEqual(none.result);
		});
	});

	describe('narrowing each action, and changing nothing within a record', () => {
		it('full refills each reached record to its own ceiling, and sets its DC to 20', () => {
			const { result, fields, written } = press({
				trigger: 'Short rest',
				action: 'full',
				where: SHORT_REST,
			});
			expect(result.ok).toBe(true);
			expect(fields['Second Wind']?.Uses).toBe('1 / 1');
			expect(fields['Action Surge']?.Uses).toBe('1/1');
			// The every-field reading of a binding naming no field, within the
			// records `where` reached: the DC is a number field with a ceiling, so
			// `full` writes it too.
			expect(fields['Second Wind']?.DC).toBe('20');
			expect(fields['Action Surge']?.DC).toBe('20');
			for (const other of ['Rage', 'Darkvision', 'Aura of Protection']) {
				expect(block(written, other)).toBe(block(SCOPED_BODY, other));
			}
		});

		it('empty under the short-rest condition writes each reached record to 0, ceiling kept', () => {
			// Criterion 2's own condition: Second Wind and Action Surge, and no other.
			const { fields, written } = press({
				trigger: 'Short rest',
				action: 'empty',
				where: SHORT_REST,
			});
			expect(fields['Second Wind']?.Uses).toBe('0 / 1');
			expect(fields['Second Wind']?.DC).toBe('0');
			expect(fields['Action Surge']?.Uses).toBe('0/1');
			// The every-field reading: a DC the record never held is written too.
			expect(fields['Action Surge']?.DC).toBe('0');
			for (const other of ['Rage', 'Darkvision', 'Aura of Protection']) {
				expect(block(written, other)).toBe(block(SCOPED_BODY, other));
			}
		});

		it('empty writes both to 0, and the ceiling survives', () => {
			const { fields, written } = press({
				trigger: 'Short rest',
				action: 'empty',
				where: 'Recharges == 2',
			});
			expect(fields.Rage?.Uses).toBe('0 / 3');
			expect(fields.Rage?.DC).toBe('0');
			for (const other of ['Second Wind', 'Action Surge', 'Darkvision', 'Aura of Protection']) {
				expect(block(written, other)).toBe(block(SCOPED_BODY, other));
			}
		});

		it('formula writes its one number into both, each held to its own bounds', () => {
			const { fields, written } = press({
				trigger: 'Short rest',
				action: 'formula',
				to: '2',
				where: SHORT_REST,
			});
			// Held to the record's own ceiling of 1, where the DC's 20 lets 2 stand.
			expect(fields['Second Wind']?.Uses).toBe('1 / 1');
			expect(fields['Second Wind']?.DC).toBe('2');
			expect(block(written, 'Rage')).toBe(block(SCOPED_BODY, 'Rage'));
		});

		it('leaves every excluded record out of the delta altogether', () => {
			const { result } = press({ trigger: 'Short rest', action: 'full', where: SHORT_REST });
			if (!result.ok) throw new Error('expected a reset');
			expect(Object.keys(result.data.records).map(Number)).toEqual([0, 1]);
		});

		it('writes no level field under any action, with or without a condition', () => {
			for (const action of ['full', 'empty', 'formula'] as const) {
				for (const where of [undefined, 'true']) {
					const { result } = press({
						trigger: 'Short rest',
						action,
						to: '1',
						...(where === undefined ? {} : { where }),
					});
					if (!result.ok) throw new Error('expected a reset');
					for (const record of Object.values(result.data.records)) {
						expect(record.fields?.Recharges).toBeUndefined();
					}
				}
			}
		});
	});

	it('still fails full on a field-owned ceiling that is missing, whether or not it is scoped', () => {
		const noMax: RecordSetConfig = {
			...SCOPED,
			fields: (SCOPED.fields ?? []).map((one) =>
				one.key === 'DC' ? { ...one, max: undefined } : one,
			),
		};
		for (const where of [undefined, SHORT_REST]) {
			const { result, written } = press(
				{ trigger: 'Short rest', action: 'full', ...(where ? { where } : {}) },
				{ from: noMax },
			);
			expect(result).toEqual({
				ok: false,
				error: 'the field "Save DC" has no maximum to restore to. Give it one, or set this trigger to empty.',
			});
			expect(written).toBe(SCOPED_BODY);
		}
	});

	it('resolves to once, in sheet scope, however many records it reaches', () => {
		const { calls } = press({
			trigger: 'Short rest',
			action: 'formula',
			to: '2',
			where: 'true',
		});
		const to = calls.filter(([path]) => path === 'reset.0.to');
		expect(to).toEqual([['reset.0.to', {}]]);
		// And the condition once per readable record, in that record's scope.
		const where = calls.filter(([path]) => path === 'reset.0.where');
		expect(where).toHaveLength(5);
		expect(where[0]?.[1]).toMatchObject({ Recharges: 1, Uses: 0, DC: 13 });
	});

	describe('the reach', () => {
		it('counts the records admitted against every record in the list', () => {
			const { result } = press({ trigger: 'Short rest', action: 'full', where: SHORT_REST });
			expect(result.ok && result.reach).toEqual({ reached: 2, of: 5 });
		});

		it('counts an unreadable record in of and never in reached', () => {
			const broken = SCOPED_BODY.replace('Recharges: 0\n', 'Recharges: 0\nnot an entry\n');
			// Vacuity guard: the record really does fail to read.
			expect(
				Object.values(readData(broken, SCOPED).records).filter(
					(one) => one.error !== null && one.error !== undefined,
				),
			).toHaveLength(1);
			const { result, written } = press(
				{ trigger: 'Short rest', action: 'full', where: 'true' },
				{ body: broken },
			);
			expect(result.ok && result.reach).toEqual({ reached: 4, of: 5 });
			expect(block(written, 'Darkvision')).toBe(block(broken, 'Darkvision'));
		});

		it('counts a record full then skips for holding no ceiling, and still writes its DC', () => {
			// The count is the binding's scope and not its writes, so it holds still
			// whether or not the records were already full.
			const bare = SCOPED_BODY.replace('Uses: 0/1\n', '');
			const { result, fields } = press(
				{ trigger: 'Short rest', action: 'full', where: SHORT_REST },
				{ body: bare },
			);
			expect(result.ok && result.reach).toEqual({ reached: 2, of: 5 });
			expect(fields['Action Surge']?.Uses).toBeUndefined();
			expect(fields['Action Surge']?.DC).toBe('20');
		});

		it('is 0 of 0 on a list with no records, and writes nothing', () => {
			// Nothing stored yet is `data: null`, which is what a new character's
			// empty list arrives as.
			const reset: ResetBinding = { trigger: 'Short rest', action: 'full', where: SHORT_REST };
			const result = recordSet.applyReset?.(null, { ...SCOPED, reset: [reset] }, reset, {
				resolve: () => true,
				explain: () => null,
			});
			expect(result).toEqual({
				ok: true,
				data: { records: {} },
				reach: { reached: 0, of: 0 },
			});
		});
	});

	describe('failing whole, and closed', () => {
		it('names every record and the unknown name, and writes nothing', () => {
			// The rename trap: a key renamed and every note migrated, while the
			// condition still reads the old one.
			const { result, written } = press({
				trigger: 'Short rest',
				action: 'full',
				where: 'Recharge == 1',
			});
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toMatch(
				/^its condition under Only where could not be worked out on every feature, so it resets none: .*Recharge.* Fix it under Only where in the layout editor\.$/,
			);
			expect(written).toBe(SCOPED_BODY);
		});

		it('names the one record whose condition came to a number, and writes nothing', () => {
			// `Recharges == 1` on four of five, and a bare `Recharges` on Rage,
			// which comes to 2 there: one record, one of five, named.
			const { result, written } = press({
				trigger: 'Short rest',
				action: 'full',
				where: 'if(Recharges == 2, Recharges, Recharges == 1)',
			});
			expect(result).toEqual({
				ok: false,
				error: 'its condition under Only where could not be worked out on "Rage", so it resets none: it came to "2", which is not true or false. Fix it under Only where in the layout editor.',
			});
			expect(written).toBe(SCOPED_BODY);
		});

		it('counts the records that failed where some did, naming the first', () => {
			const { result } = press({
				trigger: 'Short rest',
				action: 'full',
				where: 'if(Recharges >= 2, Recharges, false)',
			});
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toContain(
				'could not be worked out on 2 features, starting with "Rage", so it resets none: it came to "2"',
			);
		});

		it('fails on a condition that will not parse, and writes nothing', () => {
			const { result, written } = press({
				trigger: 'Short rest',
				action: 'full',
				where: 'Recharges ==',
			});
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toMatch(/^its condition under Only where could not be worked out on every feature/);
			expect(result.error).toMatch(/Fix it under Only where in the layout editor\.$/);
			expect(written).toBe(SCOPED_BODY);
		});

		it('reports a broken to exactly as before, and never evaluates the condition', () => {
			const { result, calls } = press({
				trigger: 'Short rest',
				action: 'formula',
				to: 'wisdom',
				where: SHORT_REST,
			});
			const unscoped = press({ trigger: 'Short rest', action: 'formula', to: 'wisdom' });
			expect(result).toEqual(unscoped.result);
			expect(calls.some(([path]) => path === 'reset.0.where')).toBe(false);
		});
	});

	/*
	 * **A binding that names a field**
	 * (`docs/features/record-set-reset-field-targeting.md`): that field, and only
	 * that field, of each record reached, with `to` worked out on each record. The
	 * list gains a `Used` toggle, so a case naming `Uses` has a flag beside it to
	 * leave alone as well as a DC.
	 */
	describe('naming the field it writes', () => {
		const FIELDED: RecordSetConfig = {
			...SCOPED,
			fields: [...(SCOPED.fields ?? []), { key: 'Used', type: 'toggle' }],
		};
		const FIELDED_BODY = SCOPED_BODY.replace('DC: 13\n', 'DC: 13\nUsed: yes\n').replace(
			'DC: 15\n```\nAdvantage',
			'DC: 15\nUsed: no\n```\nAdvantage',
		);

		/**
		 * Every line the press changed or added, which must all be the named
		 * field's. Where lines may be added, they are compared as a multiset.
		 */
		const changedLines = (before: string, after: string, grows = false): string[] => {
			const was = before.split('\n');
			const now = after.split('\n');
			if (!grows) {
				expect(now).toHaveLength(was.length);
				return now.filter((line, at) => line !== was[at]);
			}
			const left = [...was];
			return now.filter((line) => {
				const at = left.indexOf(line);
				if (at === -1) return true;
				left.splice(at, 1);
				return false;
			});
		};

		it('offers its number and toggle fields by label, and never a level, computed or modifier', () => {
			const config: RecordSetConfig = {
				...FIELDED,
				fields: [
					...(FIELDED.fields ?? []),
					{ key: 'Left', type: 'computed', formula: 'Uses' },
					{ key: 'Modifiers', type: 'modifier' },
				],
			};
			expect(recordSet.resetColumns?.(config)).toEqual([
				{ key: 'Uses' },
				{ key: 'DC', label: 'Save DC' },
				{ key: 'Used' },
			]);
			expect(recordSet.resetWhole).toBe('Every field');
		});

		it('refuses full on a field-owned number with no maximum, and nothing on a record-owned one', () => {
			const noMax: RecordSetConfig = {
				...FIELDED,
				fields: (FIELDED.fields ?? []).map((one) =>
					one.key === 'DC' ? { ...one, max: undefined } : one,
				),
			};
			const offered = recordSet.resetColumns?.(noMax) ?? [];
			expect(offered.find((one) => one.key === 'DC')?.refuses).toEqual({
				full: 'the field "Save DC" has no maximum to restore to. Give it one, or set this trigger to empty.',
			});
			expect(offered.find((one) => one.key === 'Uses')?.refuses).toBeUndefined();
		});

		it.each([
			['full', {}, { 'Second Wind': '1 / 1', 'Action Surge': '1/1', Rage: '3 / 3' }],
			['empty', {}, { 'Second Wind': '0 / 1', 'Action Surge': '0/1', Rage: '0 / 3' }],
			['formula', { to: '2' }, { 'Second Wind': '1 / 1', 'Action Surge': '1/1', Rage: '2 / 3' }],
		] as const)('%s on Uses writes Uses alone, held to each ceiling', (action, extra, uses) => {
			const { result, fields, written } = press(
				{ trigger: 'Short rest', column: 'Uses', action, ...extra },
				{ from: FIELDED, body: FIELDED_BODY },
			);
			expect(result.ok).toBe(true);
			for (const [name, value] of Object.entries(uses)) {
				expect(fields[name]?.Uses).toBe(value);
			}
			// Every other entry of every record — the DC, the flag, the level —
			// keeps its bytes; a record that held no Uses may gain one, as it does
			// under every field, since nothing here narrows which records.
			const before = Object.values(readData(FIELDED_BODY, FIELDED).records);
			const after = Object.values(readData(written, FIELDED).records);
			expect(after.map((one) => one.name)).toEqual(before.map((one) => one.name));
			after.forEach((one, at) => {
				const { Uses: _now, ...rest } = one.fields ?? {};
				const { Uses: _was, ...kept } = before[at]?.fields ?? {};
				expect(rest).toEqual(kept);
				expect(one.body).toBe(before[at]?.body);
			});
			for (const line of changedLines(FIELDED_BODY, written, true)) {
				expect(line).toMatch(/^Uses: /);
			}
		});

		it('leaves every record outside the reach byte-identical', () => {
			const { written } = press(
				{ trigger: 'Short rest', column: 'Uses', action: 'empty', where: SHORT_REST },
				{ from: FIELDED, body: FIELDED_BODY },
			);
			for (const line of changedLines(FIELDED_BODY, written)) {
				expect(line).toMatch(/^Uses: /);
			}
			for (const other of ['Rage', 'Darkvision', 'Aura of Protection']) {
				expect(block(written, other)).toBe(block(FIELDED_BODY, other));
			}
		});

		it.each([
			['full', {}, 'yes'],
			['empty', {}, 'no'],
			['formula', { to: '0' }, 'no'],
			['formula', { to: '2' }, 'yes'],
		] as const)('%s on Used writes the flag alone', (action, extra, flag) => {
			const { result, fields } = press(
				{ trigger: 'Short rest', column: 'Used', action, ...extra, where: SHORT_REST },
				{ from: FIELDED, body: FIELDED_BODY },
			);
			expect(result.ok).toBe(true);
			expect(fields['Second Wind']?.Used).toBe(flag);
			expect(fields['Action Surge']?.Used).toBe(flag);
			// The counters and the DC beside it are untouched.
			expect(fields['Second Wind']?.Uses).toBe('0 / 1');
			expect(fields['Second Wind']?.DC).toBe('13');
			expect(fields.Rage?.Used).toBe('no');
		});

		it('fails full only on the named field', () => {
			const noMax: RecordSetConfig = {
				...FIELDED,
				fields: (FIELDED.fields ?? []).map((one) =>
					one.key === 'DC' ? { ...one, max: undefined } : one,
				),
			};
			const uses = press(
				{ trigger: 'Short rest', column: 'Uses', action: 'full', where: SHORT_REST },
				{ from: noMax, body: FIELDED_BODY },
			);
			expect(uses.result.ok).toBe(true);
			expect(uses.fields['Second Wind']?.Uses).toBe('1 / 1');
			const dc = press(
				{ trigger: 'Short rest', column: 'DC', action: 'full' },
				{ from: noMax, body: FIELDED_BODY },
			);
			expect(dc.result).toEqual({
				ok: false,
				error: 'the field "Save DC" has no maximum to restore to. Give it one, or set this trigger to empty.',
			});
			expect(dc.written).toBe(FIELDED_BODY);
		});

		it('fails on a field it does not offer, telling one it holds from one it lacks', () => {
			const level = press(
				{ trigger: 'Short rest', column: 'Recharges', action: 'full' },
				{ from: FIELDED, body: FIELDED_BODY },
			);
			expect(level.result).toEqual({
				ok: false,
				error: 'the field "Recharges" holds no value a trigger can restore. Point this trigger at a number or toggle field instead.',
			});
			expect(level.written).toBe(FIELDED_BODY);
			// A key renamed since, or a stray `column` written by hand.
			const gone = press(
				{ trigger: 'Short rest', column: 'Gone', action: 'empty' },
				{ from: FIELDED, body: FIELDED_BODY },
			);
			expect(gone.result).toEqual({
				ok: false,
				error: 'this list has no field called "Gone". Point the trigger at one it has, or remove the binding.',
			});
			expect(gone.written).toBe(FIELDED_BODY);
		});

		it('reports how much of the list it reached, in the shape it always had', () => {
			const { result } = press(
				{ trigger: 'Short rest', column: 'Uses', action: 'full', where: SHORT_REST },
				{ from: FIELDED, body: FIELDED_BODY },
			);
			expect(result.ok && result.reach).toEqual({ reached: 2, of: 5 });
			const unscoped = press(
				{ trigger: 'Short rest', column: 'Uses', action: 'full' },
				{ from: FIELDED, body: FIELDED_BODY },
			);
			expect(unscoped.result.ok && unscoped.result.reach).toBeUndefined();
		});

		describe('working to out on each record', () => {
			/** Second Wind full at `1 / 1`, Action Surge spent at `0 / 2`. */
			const MIXED = FIELDED_BODY.replace('Uses: 0 / 1', 'Uses: 1 / 1').replace(
				'Uses: 0/1',
				'Uses: 0 / 2',
			);

			it("resolves to once per admitted record, in that record's stored layer", () => {
				const { result, calls, fields } = press(
					{
						trigger: 'Short rest',
						column: 'Uses',
						action: 'formula',
						to: 'Uses + 1',
						where: SHORT_REST,
					},
					{ from: FIELDED, body: MIXED },
				);
				expect(result.ok).toBe(true);
				const to = calls.filter(([path]) => path === 'reset.0.to');
				expect(to).toHaveLength(2);
				expect(to[0]?.[1]).toMatchObject({ Recharges: 1, Uses: 1, DC: 13, Used: true });
				expect(to[1]?.[1]).toMatchObject({ Recharges: 1, Uses: 0 });
				expect(to.some(([, scope]) => Object.keys(scope).length === 0)).toBe(false);
				// One back, held to each record's own ceiling.
				expect(fields['Action Surge']?.Uses).toBe('1 / 2');
				expect(fields['Second Wind']?.Uses).toBe('1 / 1');
			});

			it('still resolves a binding naming no field once, in sheet scope', () => {
				const { calls } = press(
					{ trigger: 'Short rest', action: 'formula', to: '1', where: SHORT_REST },
					{ from: FIELDED, body: MIXED },
				);
				expect(calls.filter(([path]) => path === 'reset.0.to')).toEqual([
					['reset.0.to', {}],
				]);
			});

			it('fails whole on a name no record holds, and writes nothing', () => {
				const { result, written } = press(
					{
						trigger: 'Short rest',
						column: 'Uses',
						action: 'formula',
						to: 'Charges + 1',
						where: 'true',
					},
					{ from: FIELDED, body: FIELDED_BODY },
				);
				expect(result.ok).toBe(false);
				if (result.ok) return;
				expect(result.error).toMatch(
					/^its reset formula could not be worked out on every feature, so it resets none: .*Charges.* Fix it under Resets to in the layout editor\.$/,
				);
				expect(written).toBe(FIELDED_BODY);
			});

			it('names the one record of five whose amount is not a number, and writes nothing', () => {
				const cfg: RecordSetConfig = {
					...FIELDED,
					reset: [{ trigger: 'Short rest', column: 'Uses', action: 'formula', to: 'x' }],
				};
				const data = readData(FIELDED_BODY, cfg);
				const result = recordSet.applyReset?.(
					data,
					cfg,
					{ trigger: 'Short rest', column: 'Uses', action: 'formula', to: 'x' },
					{
						// Stubbed, because the language has no value that is not a
						// number, a flag or nothing: this is the component's own
						// guard against a resolver that hands one back.
						resolve: (_path, scope) => (scope.Recharges === 2 ? 'lots' : 1),
						explain: () => null,
					},
				);
				expect(result).toEqual({
					ok: false,
					error: 'its reset formula could not be worked out on "Rage", so it resets none: it came to "lots", which is not a number. Fix it under Resets to in the layout editor.',
				});
			});

			it('reports a broken condition before a broken amount', () => {
				const { result, calls } = press(
					{
						trigger: 'Short rest',
						column: 'Uses',
						action: 'formula',
						to: 'Charges + 1',
						where: 'Recharge == 1',
					},
					{ from: FIELDED, body: FIELDED_BODY },
				);
				expect(result.ok).toBe(false);
				if (result.ok) return;
				expect(result.error).toMatch(/^its condition under Only where could not be worked out/);
				expect(calls.some(([path]) => path === 'reset.0.to')).toBe(false);
			});
		});
	});

	describe('visibility stays a sink', () => {
		const HIDDEN: RecordSetConfig = {
			...SCOPED,
			fields: (SCOPED.fields ?? []).map((one) =>
				one.key === 'Uses' ? { ...one, visibleWhen: 'Recharges == 2' } : one,
			),
		};

		it('never resolves a visibleWhen at the press', () => {
			const { calls } = press(
				{ trigger: 'Short rest', action: 'full', where: SHORT_REST },
				{ from: HIDDEN },
			);
			expect(calls.length).toBeGreaterThan(0);
			expect(calls.filter(([path]) => path.endsWith('.visibleWhen'))).toEqual([]);
		});

		it('admits and writes a record whose Uses is hidden', () => {
			// Second Wind's Uses is hidden here (it recharges on 1, not 2), and the
			// condition alone decides whether the reset reaches it.
			const { fields } = press(
				{ trigger: 'Short rest', action: 'full', where: SHORT_REST },
				{ from: HIDDEN },
			);
			expect(fields['Second Wind']?.Uses).toBe('1 / 1');
		});

		it('never resolves a reset condition at the render', () => {
			const cfg: RecordSetConfig = {
				...HIDDEN,
				reset: [{ trigger: 'Short rest', action: 'full', where: SHORT_REST }],
			};
			const resolveField = vi.fn(
				makeFieldResolver(recordSet, cfg, readData(SCOPED_BODY, cfg), NO_ENV),
			);
			render(cfg, SCOPED_BODY, { resolveField });
			expect(resolveField.mock.calls.length).toBeGreaterThan(0);
			expect(
				resolveField.mock.calls.filter(([path]) => path.startsWith('reset.')),
			).toEqual([]);
		});
	});
});

/*
 * Groups (`docs/features/record-set-groups.md`).
 *
 * Driven through a small stand-in for the view: it holds the note, the collapsed
 * keys and the open records, and rebuilds the list on every change exactly as a
 * committed edit does. The three held members are the view's, so a case about a
 * collapse surviving an edit is a case about what the component hands back.
 */
describe('groupReading', () => {
	const level = { key: 'Class', type: 'level' as const, levels: ['A', 'B', 'C'] };
	const number = { key: 'Level', type: 'number' as const };
	const read = (f: typeof level | typeof number, v: string | undefined) =>
		groupReading(f, v === undefined ? {} : { [f.key]: v }, null)?.key ?? null;

	it('reads a level as levelOf does, but files an index outside the list under nothing', () => {
		expect(['', undefined, 'x', '1', '1.4', '2', '3', '-1', '9'].map((v) => read(level, v))).toEqual(
			['0', '0', '0', '1', '1', '2', null, null, null],
		);
	});

	it('reads a number as typedValue does, so 3, 03 and " 3.0 " are one key', () => {
		expect(['3', '03', ' 3.0 ', ''].map((v) => read(number, v))).toEqual(['3', '3', '3', '0']);
		expect(read(number, 'two')).toBeNull();
		expect(groupReading(number, { Level: '3' }, 'unreadable')).toBeNull();
	});

	it('never gives a key that is empty, which is Other’s alone', () => {
		for (const v of ['', 'x', '0', '-2', '7', '1e1']) {
			expect(read(level, v) ?? 'none').not.toBe('');
			expect(read(number, v) ?? 'none').not.toBe('');
		}
	});
});

describe('groups', () => {
	// Ids are per list and every case draws one, so a stale host from an earlier
	// case would answer `getElementById` before the one under test does.
	afterEach(() => document.body.replaceChildren());

	const CLASS_FIELD = {
		key: 'Class',
		type: 'level' as const,
		levels: ['Unassigned', 'Fighter', 'Wizard', 'Cleric'],
		input: 'select' as const,
		placement: 'body' as const,
	};

	const GROUPED: RecordSetConfig = {
		...config,
		id: 'features',
		recordName: 'Feature',
		groupBy: 'Class',
		fields: [CLASS_FIELD, { key: 'Uses', type: 'number', max: 3 }],
	};

	/** Seven features: three Fighter, two Wizard, one with no entry, one past the list. */
	const FEATURES = [
		'',
		'### Second Wind',
		'```sheet',
		'Class: 1',
		'Uses: 2',
		'```',
		'A bonus action.',
		'',
		'### Fireball',
		'```sheet',
		'Class: 2',
		'```',
		'',
		'### Action Surge',
		'```sheet',
		'Class: 1',
		'```',
		'',
		'### Lucky',
		'```sheet',
		'Uses: 3',
		'```',
		'',
		'### Old homebrew',
		'```sheet',
		'Class: 9',
		'```',
		'',
		'### Shield',
		'```sheet',
		'Class: 2',
		'```',
		'',
		'### Fighting Style',
		'```sheet',
		'Class: 1',
		'```',
		'',
	].join('\n');

	interface Live {
		host: HTMLElement;
		state: {
			body: string;
			collapsed: Set<string>;
			open: Set<number>;
			toggled: [string, boolean][];
			changes: RecordSetData[];
		};
		draw: () => void;
	}

	/**
	 * A list that rebuilds on every committed edit, the way the sheet does.
	 * `rebuilds: false` reports a change and writes nothing, for the cases about
	 * what happens *before* a commit lands.
	 */
	function live(
		overrides: Partial<RecordSetConfig> = {},
		text: string = FEATURES,
		extra: Partial<RenderContext<RecordSetData>> = {},
		rebuilds = true,
	): Live {
		const cfg = { ...GROUPED, ...overrides };
		const host = document.createElement('div');
		document.body.appendChild(host);
		const state: Live['state'] = {
			body: text,
			collapsed: new Set(),
			open: new Set(),
			toggled: [],
			changes: [],
		};
		const draw = (): void => {
			recordSet.render(host, cfg, readData(state.body, cfg), {
				...context,
				collapsedGroups: [...state.collapsed],
				onToggleGroup: (key, collapsed) => {
					state.toggled.push([key, collapsed]);
					if (collapsed) state.collapsed.add(key);
					else state.collapsed.delete(key);
				},
				openRecords: [...state.open],
				onToggleRecord: (index, open) => {
					if (open) state.open.add(index);
					else state.open.delete(index);
				},
				onChange: (delta) => {
					state.changes.push(delta);
					if (!rebuilds) return;
					state.body = recordSet.write(delta, state.body, cfg);
					draw();
				},
				...extra,
			});
		};
		draw();
		return { host, state, draw };
	}

	const groupEls = (el: HTMLElement) =>
		Array.from(el.querySelectorAll<HTMLElement>('.sheetsmith-record-group'));
	const headings = (el: HTMLElement) =>
		Array.from(
			el.querySelectorAll<HTMLElement>('.sheetsmith-record-group-heading'),
		);
	const toggles = (el: HTMLElement) =>
		Array.from(
			el.querySelectorAll<HTMLButtonElement>(
				'.sheetsmith-record-group-toggle',
			),
		);
	const groupBodies = (el: HTMLElement) =>
		Array.from(
			el.querySelectorAll<HTMLElement>('.sheetsmith-record-group-body'),
		);
	const groupNames = (el: HTMLElement) =>
		toggles(el).map((one) => one.textContent);
	const names = (el: HTMLElement) => nameFields(el).map((one) => one.value);
	const press = (el: Element) =>
		el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

	describe('what a list with no groupBy is', () => {
		it('draws exactly the list it always drew, for an absent and a blank key', () => {
			const bare = render({ fields: GROUPED.fields }, FEATURES);
			for (const blank of ['', '   ']) {
				const el = render({ fields: GROUPED.fields, groupBy: blank }, FEATURES);
				expect(el.innerHTML).toBe(bare.innerHTML);
			}
			expect(bare.querySelector('.sheetsmith-record-group')).toBeNull();
			expect(bare.querySelector('h3')).toBeNull();
		});

		it('writes the same bytes whatever groupBy says', () => {
			const delta = { records: { 1: { fields: { Class: '3' } } } };
			expect(recordSet.write(delta, FEATURES, GROUPED)).toBe(
				recordSet.write(delta, FEATURES, { ...GROUPED, groupBy: undefined }),
			);
		});

		it('round-trips a layout with and without the key, byte for byte', () => {
			for (const component of [
				GROUPED,
				{ ...GROUPED, groupBy: undefined } as RecordSetConfig,
			]) {
				const text = serialiseLayout({
					name: 'L',
					components: [component],
					triggers: [],
				});
				expect(serialiseLayout(parseLayout(text))).toBe(text);
			}
			const withKey = serialiseLayout({
				name: 'L',
				components: [GROUPED],
				triggers: [],
			});
			expect(withKey).toContain('"groupBy": "Class"');
			const without = serialiseLayout({
				name: 'L',
				components: [{ ...GROUPED, groupBy: undefined } as RecordSetConfig],
				triggers: [],
			});
			expect(without).not.toContain('groupBy');
		});

		it('declares groupBy as a text field the layout editor draws from the config', () => {
			const entry = recordSet.configFields.find((one) => one.key === 'groupBy');
			expect(entry?.kind).toBe('text');
			expect(entry?.label).toBe('Group by');
		});
	});

	describe('which records sit where', () => {
		it('draws a header per non-empty group in the key’s declared order', () => {
			const { host } = live();
			expect(groupNames(host)).toEqual([
				'Unassigned',
				'Fighter',
				'Wizard',
				'Other',
			]);
			// Cleric has no record, so it is not drawn.
			expect(groupNames(host)).not.toContain('Cleric');
		});

		it('keeps the file’s order inside a group and draws the groups in order', () => {
			const { host } = live();
			expect(names(host)).toEqual([
				'Lucky',
				'Second Wind',
				'Action Surge',
				'Fighting Style',
				'Fireball',
				'Shield',
				'Old homebrew',
			]);
			expect(
				groupBodies(host).map(
					(one) => one.querySelectorAll('.sheetsmith-record').length,
				),
			).toEqual([1, 3, 2, 1]);
		});

		it('files a level past the last name under Other, not under the last name', () => {
			const { host } = live();
			const other = groupEls(host)[3] as HTMLElement;
			expect(
				(other.querySelector('.sheetsmith-record-name-input') as HTMLInputElement)
					.value,
			).toBe('Old homebrew');
			const cleric = (n: string) =>
				recordSet.write(
					{ records: { 4: { fields: { Class: n } } } },
					FEATURES,
					GROUPED,
				);
			// An index equal to the last name is a Cleric, and nothing else is clamped.
			const edge = live({}, cleric('3')).host;
			expect(groupNames(edge)).toEqual(['Unassigned', 'Fighter', 'Wizard', 'Cleric']);
			for (const stray of ['4', '-1', '3.6', '99']) {
				expect(groupNames(live({}, cleric(stray)).host).at(-1)).toBe('Other');
			}
			// And a rounding that lands inside the list stays inside it.
			expect(groupNames(live({}, cleric('3.4')).host)).toContain('Cleric');
		});

		it('reads a blank, a missing and a non-numeric level as the first group', () => {
			const odd = (entry: string) =>
				['', '### A', '```sheet', entry, '```', ''].join('\n');
			for (const entry of ['Class:', 'Uses: 1', 'Class: wizard-ish']) {
				expect(groupNames(live({}, odd(entry)).host)).toEqual(['Unassigned']);
			}
		});

		it('sends a record whose fence will not read to Other, still editable by name', () => {
			const broken = [
				'',
				'### Fine',
				'```sheet',
				'Class: 1',
				'```',
				'',
				'### Torn',
				'```sheet',
				'Class 1 with no colon',
				'```',
				'',
			].join('\n');
			const { host } = live({}, broken);
			expect(groupNames(host)).toEqual(['Fighter', 'Other']);
			expect(groupEls(host)[1]?.textContent).toContain('Torn');
		});

		it('heads a number key by its field name and the number, in numeric order', () => {
			const spells: RecordSetConfig = {
				...config,
				id: 'spells',
				recordName: 'Spell',
				groupBy: 'Level',
				fields: [
					{ key: 'Level', type: 'number' },
					{ key: 'Prepared', type: 'toggle' },
				],
			};
			const text = [10, '03', 0, '3.0', ' 1 ', '-1', 'two', ''].map(
				(level, at) =>
					['', `### S${at}`, '```sheet', `Level: ${level}`, '```', ''].join('\n'),
			);
			const { host } = live(spells, text.join(''));
			// `3`, `03` and `3.0` are one group; blank is 0, which is a real group;
			// `two` has no value and goes last.
			expect(groupNames(host)).toEqual([
				'Level -1',
				'Level 0',
				'Level 1',
				'Level 3',
				'Level 10',
				'Other',
			]);
			const counts = headings(host).map(
				(one) => one.querySelector('.sheetsmith-record-group-count')?.textContent,
			);
			expect(counts).toEqual(['1', '2', '1', '2', '1', '1']);
		});

		it('names an unnamed level by its field and number, like a number', () => {
			const plain: RecordSetConfig = {
				...GROUPED,
				fields: [{ key: 'Class', type: 'level', max: 3 }, { key: 'Uses', type: 'number' }],
			};
			expect(groupNames(live(plain).host)).toEqual([
				'Class 0',
				'Class 1',
				'Class 2',
				'Other',
			]);
		});

		it('matches the key trimmed and ignoring case', () => {
			expect(groupNames(live({ groupBy: '  class ' }).host)).toHaveLength(4);
		});

		it('groups a record the key’s own condition hides, since the note is what is read', () => {
			const hidden: RecordSetConfig = {
				...GROUPED,
				fields: [
					{ ...CLASS_FIELD, visibleWhen: 'Uses > 100' },
					{ key: 'Uses', type: 'number' },
				],
			};
			expect(groupNames(live(hidden).host)).toEqual([
				'Unassigned',
				'Fighter',
				'Wizard',
				'Other',
			]);
		});
	});

	describe('a key that cannot group', () => {
		const LINE = '.sheetsmith-record-set-list > .sheetsmith-error';

		it('draws the list ungrouped with a line, and does not fail read', () => {
			for (const [groupBy, said] of [
				['Nope', 'has no field with that key'],
				['Uses2', 'has no field with that key'],
			] as const) {
				const cfg = { ...GROUPED, groupBy };
				expect(recordSet.read(FEATURES, cfg).ok).toBe(true);
				const { host } = live({ groupBy });
				expect(host.querySelector('.sheetsmith-record-group')).toBeNull();
				expect(records(host)).toHaveLength(7);
				const line = host.querySelector(LINE);
				expect(line?.textContent).toContain(`Group by is "${groupBy}"`);
				expect(line?.textContent).toContain(said);
			}
		});

		it('names the wrong type of a toggle, a computed and a modifier field', () => {
			const mixed: RecordSetConfig = {
				...GROUPED,
				fields: [
					CLASS_FIELD,
					{ key: 'Prepared', type: 'toggle' },
					{ key: 'Double', type: 'computed', formula: 'Class * 2' },
					{ key: 'Mods', type: 'modifier' },
				],
			};
			for (const [key, type] of [
				['Prepared', 'toggle'],
				['Double', 'computed'],
				['Mods', 'modifier'],
			]) {
				const { host } = live({ ...mixed, groupBy: key });
				expect(host.querySelector('.sheetsmith-record-group')).toBeNull();
				expect(host.querySelector(LINE)?.textContent).toBe(
					`Group by is "${key}", which is a ${type} field. Records can be grouped by a level, number or text field only. The records are shown ungrouped. Name one in the layout editor, or clear Group by.`,
				);
			}
		});

		it('says nothing for a blank key', () => {
			const { host } = live({ groupBy: '' });
			expect(host.querySelector(LINE)).toBeNull();
		});

		it('leaves what the reader collapsed alone while it draws no groups', () => {
			const { host, state } = live();
			press(toggles(host)[1] as HTMLElement);
			state.toggled.length = 0;
			const cfg = { ...GROUPED, groupBy: 'Nope' };
			recordSet.render(host, cfg, readData(FEATURES, cfg), {
				...context,
				collapsedGroups: ['1'],
				onToggleGroup: (key, collapsed) => state.toggled.push([key, collapsed]),
			});
			expect(state.toggled).toEqual([]);
		});
	});

	describe('the header', () => {
		it('is an h3 holding one button whose name is the group’s name alone', () => {
			const { host } = live();
			for (const heading of headings(host)) {
				expect(heading.tagName).toBe('H3');
				const buttons = heading.querySelectorAll('button');
				expect(buttons).toHaveLength(1);
				const button = buttons[0] as HTMLButtonElement;
				expect(button.hasAttribute('aria-label')).toBe(false);
				expect(button.hasAttribute('title')).toBe(false);
				// The count is outside the button, so it is not in the name.
				expect(button.textContent).not.toMatch(/\d/);
			}
			expect(toggles(host)[1]?.textContent).toBe('Fighter');
		});

		it('describes the button with the count, in a sibling that resolves', () => {
			const { host } = live();
			const fighter = toggles(host)[1] as HTMLButtonElement;
			const said = host.ownerDocument.getElementById(
				fighter.getAttribute('aria-describedby') ?? '',
			);
			expect(said?.textContent).toBe('3 features');
			expect(said?.classList.contains('sheetsmith-sr-only')).toBe(true);
			const one = host.ownerDocument.getElementById(
				toggles(host)[0]?.getAttribute('aria-describedby') ?? '',
			);
			expect(one?.textContent).toBe('1 feature');
			// The visible figure is not announced a second time.
			expect(
				headings(host)[1]
					?.querySelector('.sheetsmith-record-group-count')
					?.getAttribute('aria-hidden'),
			).toBe('true');
		});

		it('counts a record whose fence will not read', () => {
			const torn = ['', '### Torn', '```sheet', 'no colon', '```', ''].join('\n');
			const { host } = live({}, torn);
			const said = host.ownerDocument.getElementById(
				toggles(host)[0]?.getAttribute('aria-describedby') ?? '',
			);
			expect(said?.textContent).toBe('1 feature');
		});

		it('keeps aria-expanded and aria-controls true in both states', () => {
			const { host } = live();
			const button = toggles(host)[1] as HTMLButtonElement;
			const resolves = () =>
				host.ownerDocument.getElementById(
					button.getAttribute('aria-controls') ?? '',
				);
			expect(button.getAttribute('aria-expanded')).toBe('true');
			expect(resolves()).toBe(groupBodies(host)[1]);
			press(button);
			expect(button.getAttribute('aria-expanded')).toBe('false');
			expect(resolves()).toBe(groupBodies(host)[1]);
		});

		it('answers a press anywhere on the row, once, through the same handler', () => {
			const { host, state } = live();
			const count = headings(host)[1]?.querySelector(
				'.sheetsmith-record-group-count',
			) as HTMLElement;
			press(count);
			expect(state.toggled).toEqual([['1', true]]);
			// A press on the button is the button's, not counted twice by the row.
			press(toggles(host)[2] as HTMLElement);
			expect(state.toggled).toEqual([
				['1', true],
				['2', true],
			]);
		});

		it('toggles exactly once whichever part of the header is pressed', () => {
			// The chevron is repainted by the very press that lands on it, so the
			// element the event targets is detached before the event reaches the
			// row: a handler that asks where the target sits then answers twice.
			const { host, state } = live();
			const parts: Array<(el: HTMLElement) => Element | null> = [
				(el) => el,
				(el) => el.querySelector('.sheetsmith-record-group-mark'),
				(el) => el.querySelector('.sheetsmith-record-group-mark svg'),
				(el) => el.querySelector('.sheetsmith-record-group-mark svg *'),
				(el) => el.querySelector('.sheetsmith-record-group-name'),
				(el) =>
					el
						.closest('.sheetsmith-record-group-heading')
						?.querySelector('.sheetsmith-record-group-count') ?? null,
				(el) => el.closest('.sheetsmith-record-group-heading'),
			];
			parts.forEach((part, at) => {
				const target = part(toggles(host)[1] as HTMLElement);
				expect(target, `part ${at}`).not.toBeNull();
				const before = state.toggled.length;
				press(target as Element);
				expect(state.toggled.length - before, `part ${at}`).toBe(1);
			});
			// Seven presses, one each: the group ends where an odd count leaves it.
			expect(toggles(host)[1]?.getAttribute('aria-expanded')).toBe('false');
		});
	});

	describe('collapsing', () => {
		it('hides the body until found, keeps every record in the DOM, and reports it', () => {
			const { host, state } = live();
			press(toggles(host)[1] as HTMLElement);
			const body = groupBodies(host)[1] as HTMLElement;
			expect(body.getAttribute('hidden')).toBe('until-found');
			expect(body.querySelectorAll('.sheetsmith-record')).toHaveLength(3);
			expect(state.toggled).toEqual([['1', true]]);
			// The records outside it are untouched.
			expect(groupBodies(host)[0]?.hasAttribute('hidden')).toBe(false);
			press(toggles(host)[1] as HTMLElement);
			expect(body.hasAttribute('hidden')).toBe(false);
			expect(state.toggled.at(-1)).toEqual(['1', false]);
		});

		it('keeps the focus on the header it pressed', () => {
			const { host } = live();
			const button = toggles(host)[1] as HTMLButtonElement;
			button.focus();
			press(button);
			expect(host.ownerDocument.activeElement).toBe(button);
			expect(host.contains(button)).toBe(true);
		});

		it('opens on a beforematch and reports it', () => {
			// happy-dom has neither the attribute nor the event, so this is the wiring.
			const { host, state } = live();
			press(toggles(host)[1] as HTMLElement);
			groupBodies(host)[1]?.dispatchEvent(new Event('beforematch'));
			expect(groupBodies(host)[1]?.hasAttribute('hidden')).toBe(false);
			expect(toggles(host)[1]?.getAttribute('aria-expanded')).toBe('true');
			expect(state.toggled.at(-1)).toEqual(['1', false]);
		});

		it('starts every group open', () => {
			const { host } = live();
			expect(groupBodies(host).some((one) => one.hasAttribute('hidden'))).toBe(false);
		});

		it('survives a rebuild caused by an edit in the same group, another group and the name', () => {
			const { host, state } = live();
			press(toggles(host)[1] as HTMLElement);
			// Another group: the Wizard's Uses is not drawn, so rename its first record.
			const fields = nameFields(host);
			fields[4]!.value = 'Fireball II';
			fields[4]!.dispatchEvent(new Event('blur'));
			expect(state.body).toContain('### Fireball II');
			expect(toggles(host)[1]?.getAttribute('aria-expanded')).toBe('false');
			// The collapsed group's own record.
			const inside = nameFields(host)[1]!;
			inside.value = 'Second Wind II';
			inside.dispatchEvent(new Event('blur'));
			expect(toggles(host)[1]?.getAttribute('aria-expanded')).toBe('false');
			expect(groupBodies(host)[1]?.getAttribute('hidden')).toBe('until-found');
		});

		it('still holds every collapsed record’s values, computed ones included', () => {
			const cfg: RecordSetConfig = {
				...GROUPED,
				fields: [
					...(GROUPED.fields ?? []),
					{ key: 'Left', type: 'computed', formula: '3 - Uses' },
				],
			};
			const data = readData(FEATURES, cfg);
			const layout: Layout = { name: 'L', components: [cfg] };
			const { env } = buildSheet(layout, [
				{ config: cfg, component: recordSet, data, error: null },
			]);
			const resolveField = makeFieldResolver(recordSet, cfg, data, env);
			const values = (collapse: boolean) => {
				const { host, state } = live(cfg, FEATURES, { resolveField });
				if (collapse) for (const one of toggles(host)) press(one);
				expect(state.changes).toEqual([]);
				return Array.from(
					host.querySelectorAll<HTMLElement>('.sheetsmith-record-value'),
				).map((one) => one.textContent);
			};
			const open = values(false);
			// Fighter's Second Wind has Uses 2, so its Left is 1: a real evaluation.
			expect(open).toContain('1');
			// Every group collapsed, every computed value is still drawn and the same.
			expect(values(true)).toEqual(open);
			// And the sum a formula reads is the file's, whatever the view collapsed.
			expect(evaluate('sum(features, Uses)', env.sheet, callsFrom(env))).toBe(
				2 + 3,
			);
		});

		it('reports a group that is gone as expanded, so it opens if it returns', () => {
			const { host, state } = live();
			press(toggles(host)[2] as HTMLElement);
			state.toggled.length = 0;
			// Both Wizard records move to Cleric, so group 2 is gone at this render.
			state.body = recordSet.write(
				{
					records: {
						1: { fields: { Class: '3' } },
						5: { fields: { Class: '3' } },
					},
				},
				state.body,
				GROUPED,
			);
			recordSet.render(host, GROUPED, readData(state.body, GROUPED), {
				...context,
				collapsedGroups: [...state.collapsed],
				onToggleGroup: (key, collapsed) => {
					state.toggled.push([key, collapsed]);
					if (collapsed) state.collapsed.add(key);
					else state.collapsed.delete(key);
				},
			});
			expect(state.toggled).toEqual([['2', false]]);
			expect(state.collapsed.has('2')).toBe(false);
		});

		it('reports nothing where every held key still has its group', () => {
			const { host, state, draw } = live();
			press(toggles(host)[1] as HTMLElement);
			state.toggled.length = 0;
			draw();
			expect(state.toggled).toEqual([]);
			expect(toggles(host)[1]?.getAttribute('aria-expanded')).toBe('false');
		});
	});

	describe('Add', () => {
		const added = (text: string) =>
			recordSet.write(
				{ records: {}, added: [{ name: 'Feature' }] },
				text,
				GROUPED,
			);

		it('draws one add control, outside the scrolling list', () => {
			const { host } = live();
			expect(host.querySelectorAll('.sheetsmith-record-add')).toHaveLength(1);
			expect(
				host.querySelector('.sheetsmith-record-set-list .sheetsmith-record-add'),
			).toBeNull();
		});

		it('lands the new record in the first group, opens it, and focuses it by position', () => {
			const { host, state } = live();
			press(toggles(host)[0] as HTMLElement);
			state.toggled.length = 0;
			expect(host.querySelector('.sheetsmith-record-group')).not.toBeNull();
			press(addButton(host));
			// The new record has no fence, so it is in the first group; that group
			// was collapsed and opens in the same step.
			expect(state.toggled).toEqual([['0', false]]);
			expect(state.collapsed.has('0')).toBe(false);
			const unassigned = groupBodies(host)[0] as HTMLElement;
			expect(
				Array.from(
					unassigned.querySelectorAll<HTMLInputElement>('.sheetsmith-record-name-input'),
				).map((one) => one.value),
			).toEqual(['Lucky', 'Feature']);
			// The new record is the last in the file and the *second* drawn: focus
			// goes to it, not to whichever name was drawn last.
			const fields = nameFields(host);
			const focused = host.ownerDocument.activeElement;
			expect(focused).toBe(fields[1]);
			expect(fields.at(-1)).not.toBe(focused);
			expect((focused as HTMLInputElement).value).toBe('Feature');
		});

		it('creates the first group when nothing was in it, and opens nothing it need not', () => {
			const noUnassigned = FEATURES.replace('Uses: 3', 'Class: 1\nUses: 3');
			const { host, state } = live({}, noUnassigned);
			expect(groupNames(host)).not.toContain('Unassigned');
			press(addButton(host));
			expect(groupNames(host)[0]).toBe('Unassigned');
			expect(state.toggled).toEqual([]);
			expect(host.ownerDocument.activeElement).toBe(
				groupBodies(host)[0]?.querySelector('.sheetsmith-record-name-input'),
			);
			expect(added(noUnassigned)).toContain('### Feature');
		});

		it('lands nothing where the write never grew the list', () => {
			const { host } = live({}, FEATURES, {}, false);
			press(addButton(host));
			const again = live({}, FEATURES).host;
			expect(again.ownerDocument.activeElement).not.toBe(nameFields(again)[0]);
		});
	});

	describe('editing the key in a record', () => {
		const select = (host: HTMLElement, at: number): HTMLSelectElement =>
			Array.from(
				host.querySelectorAll<HTMLSelectElement>('.sheetsmith-record-select'),
			)[at] as HTMLSelectElement;

		it('does not move the record until the commit', () => {
			// Reports a change and writes nothing: the state before a commit lands.
			const { host, state } = live({}, FEATURES, {}, false);
			const first = select(host, 1);
			first.focus();
			first.value = '2';
			first.dispatchEvent(new Event('change'));
			// The commit was reported, and with no write there is no rebuild, so the
			// record is exactly where it was.
			expect(state.changes).toHaveLength(1);
			expect(names(host)[1]).toBe('Second Wind');
			expect(groupBodies(host)[1]?.contains(first)).toBe(true);
		});

		it('moves it into the new group, opens that group and keeps focus on the same dropdown', () => {
			const { host, state } = live();
			press(toggles(host)[2] as HTMLElement);
			state.open.add(1);
			// Second Wind (position 0) is the first Fighter, drawn at index 1; its
			// Class dropdown is the record's first control after the chevron.
			const target = select(host, 1);
			target.focus();
			target.value = '2';
			target.dispatchEvent(new Event('change'));
			expect(state.collapsed.has('2')).toBe(false);
			const wizard = groupBodies(host)[2] as HTMLElement;
			expect(
				Array.from(
					wizard.querySelectorAll<HTMLInputElement>('.sheetsmith-record-name-input'),
				).map((one) => one.value),
			).toEqual(['Second Wind', 'Fireball', 'Shield']);
			// Same control, same record: the Class select of Second Wind.
			const landed = host.ownerDocument.activeElement as HTMLSelectElement;
			expect(landed.classList.contains('sheetsmith-record-select')).toBe(true);
			expect(landed.value).toBe('2');
			expect(landed.getAttribute('aria-label')).toBe(
				'Second Wind Class',
			);
			expect(wizard.contains(landed)).toBe(true);
			// The record's open state is its position's, and the position is unchanged.
			expect(state.open.has(1)).toBe(true);
		});

		it('moves a record typed into a number key to a new group, and back', () => {
			const spells: RecordSetConfig = {
				...config,
				id: 'spells',
				recordName: 'Spell',
				groupBy: 'Level',
				fields: [{ key: 'Level', type: 'number' }],
			};
			const text = [1, 2, 3].map((level, at) =>
				['', `### S${at}`, '```sheet', `Level: ${level}`, '```', ''].join('\n'),
			);
			const { host } = live(spells, text.join(''));
			const level = (at: number) =>
				Array.from(
					host.querySelectorAll<HTMLInputElement>('.sheetsmith-record-input'),
				)[at] as HTMLInputElement;
			const type = (from: string, value: string) => {
				const input = Array.from(
					host.querySelectorAll<HTMLInputElement>('.sheetsmith-record-input'),
				).find((one) => one.value === from) as HTMLInputElement;
				input.focus();
				input.value = value;
				input.dispatchEvent(
					new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }),
				);
			};
			// Before Enter the draft is only a draft.
			const first = level(0);
			first.focus();
			first.value = '12';
			first.dispatchEvent(new Event('input'));
			expect(groupNames(host)).toEqual(['Level 1', 'Level 2', 'Level 3']);
			first.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }),
			);
			expect(groupNames(host)).toEqual(['Level 2', 'Level 3', 'Level 12']);
			// Focus followed the record into its new group.
			const active = host.ownerDocument.activeElement as HTMLInputElement;
			expect(active.value).toBe('12');
			expect(groupBodies(host)[2]?.contains(active)).toBe(true);
			// Typing 2 moves it back into the existing group, and the empty one is gone.
			type('12', '2');
			expect(groupNames(host)).toEqual(['Level 2', 'Level 3']);
			// Text that is not a number goes to Other.
			type('2', 'two');
			expect(groupNames(host)).toEqual(['Level 2', 'Level 3', 'Other']);
			// Focus followed it into Other, which is drawn open.
			const inOther = host.ownerDocument.activeElement as HTMLInputElement;
			expect(inOther.value).toBe('two');
			expect(groupBodies(host)[2]?.contains(inOther)).toBe(true);
			expect(toggles(host)[2]?.getAttribute('aria-expanded')).toBe('true');
			// And back out of Other: a number puts it in a group again, focus with it.
			type('two', '3');
			expect(groupNames(host)).toEqual(['Level 2', 'Level 3']);
			const back = host.ownerDocument.activeElement as HTMLInputElement;
			expect(back.value).toBe('3');
			expect(groupBodies(host)[1]?.contains(back)).toBe(true);
		});

		it('does not pull focus back to a control the reader tabbed away from', () => {
			const spells: RecordSetConfig = {
				...config,
				id: 'spells',
				recordName: 'Spell',
				groupBy: 'Level',
				fields: [{ key: 'Level', type: 'number' }],
			};
			const text = [1, 2].map((level, at) =>
				['', `### S${at}`, '```sheet', `Level: ${level}`, '```', ''].join('\n'),
			);
			const { host } = live(spells, text.join(''));
			const input = host.querySelector<HTMLInputElement>(
				'.sheetsmith-record-input',
			) as HTMLInputElement;
			input.value = '9';
			// The commit a blur makes: focus is already on its way elsewhere.
			input.dispatchEvent(new Event('blur'));
			expect(groupNames(host)).toEqual(['Level 2', 'Level 9']);
			expect(host.ownerDocument.activeElement).not.toBe(
				host.querySelector('.sheetsmith-record-input'),
			);
		});

		it('leaves the record where it was after Escape', () => {
			const spells: RecordSetConfig = {
				...config,
				id: 'spells',
				recordName: 'Spell',
				groupBy: 'Level',
				fields: [{ key: 'Level', type: 'number' }],
			};
			const text = ['', '### S0', '```sheet', 'Level: 1', '```', ''].join('\n');
			const { host, state } = live(spells, text);
			const input = host.querySelector<HTMLInputElement>(
				'.sheetsmith-record-input',
			) as HTMLInputElement;
			input.focus();
			input.value = '5';
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
			expect(input.value).toBe('1');
			expect(groupNames(host)).toEqual(['Level 1']);
			expect(state.changes).toEqual([]);
		});
	});

	describe('what grouping leaves alone', () => {
		it('reaches a collapsed group’s record with a reset, and draws the result', () => {
			const cfg: RecordSetConfig = {
				...GROUPED,
				fields: [
					...(GROUPED.fields ?? []),
					{ key: 'Left', type: 'computed', formula: '3 - Uses' },
				],
			};
			const result = recordSet.applyReset?.(
				readData(FEATURES, cfg),
				cfg,
				{ trigger: 'Long rest', action: 'full' },
				{ resolve: () => null, explain: () => null },
			);
			if (!result?.ok) throw new Error('expected a reset');
			const after = recordSet.write(result.data, FEATURES, cfg);
			// The reset is the same whether or not the list is grouped.
			expect(after).toBe(
				recordSet.write(
					(() => {
						const plain = { ...cfg, groupBy: undefined };
						const r = recordSet.applyReset?.(
							readData(FEATURES, plain),
							plain,
							{ trigger: 'Long rest', action: 'full' },
							{ resolve: () => null, explain: () => null },
						);
						if (!r?.ok) throw new Error('expected a reset');
						return r.data;
					})(),
					FEATURES,
					{ ...cfg, groupBy: undefined },
				),
			);
			// Rendered after the reset with the Fighter group collapsed: its
			// record, restored to its maximum, is in the DOM and its computed field
			// follows.
			const data = readData(after, cfg);
			const { env } = buildSheet({ name: 'L', components: [cfg] }, [
				{ config: cfg, component: recordSet, data, error: null },
			]);
			const { host } = live(cfg, after, {
				resolveField: makeFieldResolver(recordSet, cfg, data, env),
			}, true);
			press(toggles(host)[1] as HTMLElement);
			const fighter = groupBodies(host)[1] as HTMLElement;
			expect(fighter.getAttribute('hidden')).toBe('until-found');
			const uses = fighter.querySelector<HTMLInputElement>(
				'.sheetsmith-record-input',
			);
			expect(uses?.value).toBe('3');
			expect(
				fighter.querySelector('.sheetsmith-record-value')?.textContent,
			).toBe('0');
		});

		it('adds up the same with a group collapsed, since collapsing writes nothing', () => {
			const { host, state } = live();
			const before = state.body;
			for (const one of toggles(host)) press(one);
			expect(state.body).toBe(before);
			expect(state.changes).toEqual([]);
		});

		it('publishes the same rows with and without a group', () => {
			const plain = recordSet.scopeRows?.(readData(FEATURES, GROUPED), {
				...GROUPED,
				groupBy: undefined,
			});
			const grouped = recordSet.scopeRows?.(readData(FEATURES, GROUPED), GROUPED);
			expect(grouped?.(() => null)).toEqual(plain?.(() => null));
			expect(grouped?.(() => null)).toHaveLength(7);
		});
	});
});

describe('a text field as the group key', () => {
	afterEach(() => document.body.replaceChildren());

	const TEXT_CONFIG: RecordSetConfig = {
		...config,
		id: 'homebrew',
		recordName: 'Feature',
		groupBy: 'Class',
		// No `type` on Class: that is how the editor stores a text field.
		fields: [{ key: 'Class' }, { key: 'Uses', type: 'number', max: 3 }],
	};

	const rec = (name: string, ...lines: string[]): string =>
		['', `### ${name}`, '```sheet', ...lines, '```', ''].join('\n');

	/** Eight records over five spellings of four classes and two with no class. */
	const FEATURES_TEXT =
		rec("Hunter's Bane", 'Class: Blood Hunter', 'Uses: 1') +
		rec('Second Wind', 'Class: Fighter') +
		rec('Crimson Rite', 'Class: blood hunter') +
		rec('Action Surge', 'Class:   FIGHTER  ') +
		rec('Arcane Recovery', 'Class: Wizard') +
		rec('Lucky', 'Uses: 3') +
		rec('Odd one', 'Class: Other') +
		rec('Another odd', 'Class: other');

	interface LiveText {
		host: HTMLElement;
		state: {
			body: string;
			collapsed: Set<string>;
			toggled: [string, boolean][];
			changes: RecordSetData[];
		};
	}

	function live(
		overrides: Partial<RecordSetConfig> = {},
		text: string = FEATURES_TEXT,
		extra: Partial<RenderContext<RecordSetData>> = {},
		rebuilds = true,
	): LiveText {
		const cfg = { ...TEXT_CONFIG, ...overrides };
		const host = document.createElement('div');
		document.body.appendChild(host);
		const state: LiveText['state'] = {
			body: text,
			collapsed: new Set(),
			toggled: [],
			changes: [],
		};
		const draw = (): void => {
			recordSet.render(host, cfg, readData(state.body, cfg), {
				...context,
				collapsedGroups: [...state.collapsed],
				onToggleGroup: (key, collapsed) => {
					state.toggled.push([key, collapsed]);
					if (collapsed) state.collapsed.add(key);
					else state.collapsed.delete(key);
				},
				onChange: (delta) => {
					state.changes.push(delta);
					if (!rebuilds) return;
					state.body = recordSet.write(delta, state.body, cfg);
					draw();
				},
				...extra,
			});
		};
		draw();
		return { host, state };
	}

	const toggles = (el: HTMLElement) =>
		Array.from(
			el.querySelectorAll<HTMLButtonElement>('.sheetsmith-record-group-toggle'),
		);
	const groupNames = (el: HTMLElement) =>
		toggles(el).map((one) => one.textContent);
	const groupBodies = (el: HTMLElement) =>
		Array.from(
			el.querySelectorAll<HTMLElement>('.sheetsmith-record-group-body'),
		);
	const textInputs = (el: HTMLElement) =>
		Array.from(
			el.querySelectorAll<HTMLInputElement>('.sheetsmith-record-input-text'),
		);
	const press = (el: Element) =>
		el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	const membersOf = (el: HTMLElement, group: number) =>
		Array.from(
			(groupBodies(el)[group] as HTMLElement).querySelectorAll<HTMLInputElement>(
				'.sheetsmith-record-name-input',
			),
		).map((one) => one.value);
	/** One record's class field, by the record's name: the draw order is grouped. */
	const classOf = (host: HTMLElement, record: string): HTMLInputElement =>
		textInputs(host).find(
			(one) => one.getAttribute('aria-label') === `${record} Class`,
		) as HTMLInputElement;
	/** Type into one record's class and commit it with Enter, focused as a reader is. */
	function typeClass(host: HTMLElement, record: string, value: string): void {
		const input = classOf(host, record);
		input.focus();
		input.value = value;
		input.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }),
		);
	}

	describe('where text is legal', () => {
		const refusal = (cfg: Partial<RecordSetConfig>): string => {
			const result = recordSet.read(null as unknown as string, {
				...TEXT_CONFIG,
				...cfg,
			});
			if (result.ok) throw new Error('expected a configuration error');
			return result.error;
		};

		it('accepts a text field Group by names, however the key is spelled', () => {
			for (const groupBy of ['Class', 'class', '  CLASS ']) {
				expect(recordSet.read(FEATURES_TEXT, { ...TEXT_CONFIG, groupBy }).ok).toBe(
					true,
				);
			}
			// Hand-written `type: "text"` is the same field as an absent one.
			const typed: RecordSetConfig = {
				...TEXT_CONFIG,
				fields: [{ key: 'Class', type: 'text' }],
			};
			expect(recordSet.read(FEATURES_TEXT, typed).ok).toBe(true);
		});

		it('decides "is the key" and "groups the list" with one rule, over the same spellings', () => {
			// A text field that groups must not also be refused, and one that does not
			// group must be: the two readings cannot disagree about any spelling.
			for (const groupBy of ['Class', 'class', '  CLASS ', 'Clas', ' ', '', undefined]) {
				const cfg: RecordSetConfig = { ...TEXT_CONFIG, groupBy };
				const accepted = recordSet.read(FEATURES_TEXT, cfg).ok;
				const el = document.createElement('div');
				recordSet.render(el, cfg, accepted ? readData(FEATURES_TEXT, cfg) : null, context);
				const grouped = el.querySelector('.sheetsmith-record-group') !== null;
				expect(accepted, String(groupBy)).toBe(grouped);
			}
		});

		it('refuses it otherwise, in a sentence that names Group by', () => {
			for (const groupBy of [undefined, '', 'Uses', 'Nope']) {
				const said = refusal({ groupBy });
				expect(said).toContain('holds text');
				expect(said).toContain('Set Group by to "Class"');
			}
		});

		it('refuses a second text field and a typeless field that is not the key', () => {
			const second = refusal({
				fields: [{ key: 'Class' }, { key: 'Notes', type: 'text' }],
			});
			expect(second).toContain('The field "Notes" holds text');
			const typeless = refusal({ fields: [{ key: 'Class' }, { key: 'Extra' }] });
			expect(typeless).toContain('The field "Extra" holds text');
		});

		it('publishes nothing from a list it refuses', () => {
			const bad: RecordSetConfig = { ...TEXT_CONFIG, groupBy: undefined };
			expect(recordSet.read(FEATURES_TEXT, bad).ok).toBe(false);
			expect(recordSet.scopeRows?.(null, bad)).toBeUndefined();
			expect(recordSet.scopeModifiers?.(null, bad)).toBeUndefined();
		});

		it('shows the configuration error in place on the sheet, with nothing drawn', () => {
			const el = render({ ...TEXT_CONFIG, groupBy: undefined }, null);
			expect(errors(el).map((one) => one.textContent)).toEqual([
				'The field "Class" holds text, which a list can hold only as the field it is grouped by. Set Group by to "Class", or make it a number, level, toggle, computed or modifier field, or write the words in the feature\'s body instead.',
			]);
			expect(el.querySelector('.sheetsmith-record-add')).toBeNull();
		});
	});

	describe('inert paths', () => {
		it('leaves the text key out of every scope a formula or condition reads', () => {
			const withComputed: RecordSetConfig = {
				...TEXT_CONFIG,
				fields: [
					{ key: 'Class' },
					{ key: 'Uses', type: 'number' },
					{ key: 'Left', type: 'computed', formula: '3 - Uses' },
				],
			};
			const rows = recordSet
				.scopeRows?.(readData(FEATURES_TEXT, withComputed), withComputed)?.(
					() => 2,
				);
			expect(rows).toHaveLength(8);
			for (const row of rows ?? []) {
				expect(Object.keys(row.values)).not.toContain('Class');
			}
			expect(Object.keys(rows?.[0]?.values ?? {}).sort()).toEqual(
				['Left', 'Uses'].sort(),
			);
		});

		it('reports the ordinary unknown name for a condition naming the text key', () => {
			const cfg: RecordSetConfig = {
				...TEXT_CONFIG,
				fields: [
					{ key: 'Class' },
					{ key: 'Uses', type: 'number', visibleWhen: 'Class == 1' },
				],
			};
			const data = readData(FEATURES_TEXT, cfg);
			const host = render(cfg, FEATURES_TEXT, {
				resolveField: makeFieldResolver(recordSet, cfg, data, NO_ENV),
				explainField: makeFieldExplainer(recordSet, cfg, data, NO_ENV),
			});
			expect(errors(host)[0]?.textContent).toContain('Unknown name "Class".');
		});

		it('offers it to no reset and writes nothing for a binding that names it by hand', () => {
			expect(
				recordSet.resetColumns?.(TEXT_CONFIG).map((one) => one.key),
			).toEqual(['Uses']);
			const named = recordSet.applyReset?.(
				readData(FEATURES_TEXT, TEXT_CONFIG),
				TEXT_CONFIG,
				{ trigger: 'Rest', action: 'empty', column: 'Class' },
				{ resolve: () => null, explain: () => null },
			);
			// Whatever it says, no text entry changed.
			if (named?.ok === true) {
				expect(recordSet.write(named.data, FEATURES_TEXT, TEXT_CONFIG)).toBe(
					FEATURES_TEXT,
				);
			}
			// Every other field still resets as before.
			const whole = recordSet.applyReset?.(
				readData(FEATURES_TEXT, TEXT_CONFIG),
				TEXT_CONFIG,
				{ trigger: 'Rest', action: 'empty' },
				{ resolve: () => null, explain: () => null },
			);
			if (!whole?.ok) throw new Error('expected a reset');
			const after = recordSet.write(whole.data, FEATURES_TEXT, TEXT_CONFIG);
			expect(after).toContain('Class: Wizard');
			expect(after).toContain('Uses: 0');
			expect(after).not.toContain('Uses: 1');
		});

		it('adds up a numeric field the same with a group collapsed', () => {
			const { host, state } = live();
			const before = state.body;
			for (const one of toggles(host)) press(one);
			expect(state.body).toBe(before);
			const scoped = recordSet.scopeRows?.(
				readData(state.body, TEXT_CONFIG),
				TEXT_CONFIG,
			);
			const total = (scoped?.(() => null) ?? []).reduce(
				(sum, row) => sum + Number(row.values.Uses ?? 0),
				0,
			);
			expect(total).toBe(4);
		});
	});

	describe('grouping', () => {
		it('merges case and padding variants and heads a group with the first spelling in the file', () => {
			const { host } = live();
			expect(groupNames(host)).toEqual(['Blood Hunter', 'Fighter', 'Wizard', 'Other']);
			expect(membersOf(host, 0)).toEqual(["Hunter's Bane", 'Crimson Rite']);
			// `FIGHTER` follows `Fighter` in the file, so the header is `Fighter`.
			expect(membersOf(host, 1)).toEqual(['Second Wind', 'Action Surge']);
		});

		it('changes the header only when the first record in the file is retyped', () => {
			const { host } = live();
			expect(groupNames(host)[0]).toBe('Blood Hunter');
			// The second record's capital is the one nothing visible follows.
			typeClass(host, 'Crimson Rite', 'BLOOD HUNTER');
			expect(groupNames(host)[0]).toBe('Blood Hunter');
			// The first one heads the group, so retyping it changes the header.
			typeClass(host, "Hunter's Bane", 'BLOOD HUNTER');
			expect(groupNames(host)[0]).toBe('BLOOD HUNTER');
		});

		it('keeps an accent a letter and an inner run of spaces a difference', () => {
			const text =
				rec('A', 'Class: Cleric') +
				rec('B', 'Class: Cléric') +
				rec('C', 'Class: Blood Hunter') +
				rec('D', 'Class: Blood  Hunter');
			// Four groups, none merged; their relative order is the collator's.
			expect(groupNames(live({}, text).host).sort()).toEqual(
				['Blood  Hunter', 'Blood Hunter', 'Cleric', 'Cléric'].sort(),
			);
		});

		it('matches a composed accent and a decomposed one as the same group', () => {
			const text =
				rec('A', 'Class: Cléric') + rec('B', 'Class: Cléric');
			const { host } = live({}, text);
			expect(groupNames(host)).toEqual(['Cléric']);
			expect(membersOf(host, 0)).toEqual(['A', 'B']);
		});

		it('orders alphabetically with numbers by value, and Other last whatever its spelling', () => {
			const text =
				rec('A', 'Class: Zealot') +
				rec('B', 'Class: Tier 10') +
				rec('C', 'Class: Tier 2') +
				rec('D', 'Class: Archer') +
				rec('E', 'Class: Other') +
				rec('F', 'Class: Alpha');
			expect(groupNames(live({}, text).host)).toEqual([
				'Alpha',
				'Archer',
				'Tier 2',
				'Tier 10',
				'Zealot',
				'Other',
			]);
		});

		it('puts a blank value, "Other" in any case and an unreadable record in one group', () => {
			const { host } = live();
			expect(groupNames(host).filter((one) => one === 'Other')).toHaveLength(1);
			// Lucky has no entry, and two records typed `Other` and `other`.
			expect(membersOf(host, 3)).toEqual(['Lucky', 'Odd one', 'Another odd']);
			const other = toggles(host)[3] as HTMLElement;
			expect(other.getAttribute('aria-expanded')).toBe('true');
			const said = host.ownerDocument.getElementById(
				other.getAttribute('aria-describedby') ?? '',
			);
			expect(said?.textContent).toBe('3 features');
			expect(other.textContent).toBe('Other');

			const broken = FEATURES_TEXT + '\n### Broken\n```sheet\nnot an entry\n```\n';
			const again = live({}, broken).host;
			expect(groupNames(again).filter((one) => one === 'Other')).toHaveLength(1);
			const last = groupBodies(again)[3] as HTMLElement;
			expect(last.querySelectorAll('.sheetsmith-record')).toHaveLength(4);
			expect(last.textContent).toContain('Broken');
		});

		it('draws one Other group when every value is blank', () => {
			const text = rec('A', 'Uses: 1') + rec('B');
			const { host } = live({}, text);
			expect(groupNames(host)).toEqual(['Other']);
		});

		it('puts every record in exactly one group', () => {
			const { host } = live();
			const all = [0, 1, 2, 3].flatMap((at) => membersOf(host, at));
			expect(all.sort()).toEqual(
				[
					"Hunter's Bane",
					'Second Wind',
					'Crimson Rite',
					'Action Surge',
					'Arcane Recovery',
					'Lucky',
					'Odd one',
					'Another odd',
				].sort(),
			);
		});

		it('draws a hand-edited link or a long value as typed and groups it by its own key', () => {
			const long = 'x'.repeat(90);
			const text =
				rec('A', 'Class: [[Wizard]]') + rec('B', `Class: ${long}`) + rec('C', 'Class: [[wizard]]');
			const { host } = live({}, text);
			// Two groups: `[[wizard]]` joins `[[Wizard]]`, and the header is raw text.
			expect(groupNames(host)).toEqual(['[[Wizard]]', long]);
			expect(textInputs(host).map((one) => one.value)).toEqual([
				'[[Wizard]]',
				'[[wizard]]',
				long,
			]);
			// Nothing was written for drawing them.
			expect(host.querySelector('.sheetsmith-record-group a')).toBeNull();
		});
	});

	describe('collapse is keyed by the match key', () => {
		it('keeps a group collapsed when a member is retyped in another case', () => {
			const { host, state } = live();
			press(toggles(host)[2] as HTMLElement);
			expect(state.collapsed.has('wizard')).toBe(true);
			typeClass(host, 'Arcane Recovery', 'WIZARD');
			// Its only member heads it, so the header follows the new spelling.
			expect(groupNames(host)).toContain('WIZARD');
			expect(state.collapsed.has('wizard')).toBe(true);
			expect(toggles(host)[2]?.getAttribute('aria-expanded')).toBe('false');
		});

		it('reports a group that has gone expanded, and opens the one that arrives', () => {
			const { host, state } = live();
			press(toggles(host)[2] as HTMLElement);
			state.toggled.length = 0;
			typeClass(host, 'Arcane Recovery', 'Mage');
			// `wizard` has no members now: reported expanded, and `mage` is open.
			expect(state.toggled).toEqual([['wizard', false]]);
			expect(state.collapsed.has('wizard')).toBe(false);
			const mage = toggles(host).find((one) => one.textContent === 'Mage');
			expect(mage?.getAttribute('aria-expanded')).toBe('true');
		});

		it('treats a typo as a new group that opens, and fixing it removes group and state', () => {
			const { host, state } = live();
			typeClass(host, 'Arcane Recovery', 'Wizrd');
			expect(groupNames(host)).toContain('Wizrd');
			press(toggles(host).find((one) => one.textContent === 'Wizrd') as HTMLElement);
			expect(state.collapsed.has('wizrd')).toBe(true);
			typeClass(host, 'Arcane Recovery', 'Wizard');
			expect(groupNames(host)).not.toContain('Wizrd');
			expect(state.collapsed.has('wizrd')).toBe(false);
		});

		it('keeps Other collapsed under the empty key and opens it on Add', () => {
			const { host, state } = live();
			press(toggles(host)[3] as HTMLElement);
			expect(state.collapsed.has('')).toBe(true);
			state.toggled.length = 0;
			press(addButton(host));
			expect(state.toggled).toEqual([['', false]]);
			expect(state.collapsed.has('')).toBe(false);
			// The new record is in Other, and focus is on its name.
			expect(membersOf(host, 3)).toContain('Feature');
			const focused = host.ownerDocument.activeElement as HTMLInputElement;
			expect(focused.value).toBe('Feature');
			expect(groupBodies(host)[3]?.contains(focused)).toBe(true);
		});
	});

	describe('editing the key', () => {
		it('does not move the record before the commit, and moves it after', () => {
			const { host, state } = live({}, FEATURES_TEXT, {}, false);
			const input = classOf(host, "Hunter's Bane");
			input.focus();
			input.value = 'Rogue';
			input.dispatchEvent(new Event('input'));
			expect(groupNames(host)).toContain('Blood Hunter');
			input.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }),
			);
			// Reported, and with no write there is no rebuild.
			expect(state.changes).toHaveLength(1);
			expect(membersOf(host, 0)).toContain("Hunter's Bane");

			const real = live();
			typeClass(real.host, "Hunter's Bane", 'Rogue');
			expect(groupNames(real.host)).toEqual([
				'blood hunter',
				'Fighter',
				'Rogue',
				'Wizard',
				'Other',
			]);
		});

		it('keeps focus on the same input of the same record after Enter', () => {
			const { host } = live();
			typeClass(host, "Hunter's Bane", 'Rogue');
			const active = host.ownerDocument.activeElement as HTMLInputElement;
			expect(active.classList.contains('sheetsmith-record-input-text')).toBe(true);
			expect(active.value).toBe('Rogue');
			expect(active.getAttribute('aria-label')).toBe("Hunter's Bane Class");
		});

		it('moves nothing when only the case is retyped', () => {
			const { host } = live();
			const order = groupNames(host);
			const input = classOf(host, 'Second Wind');
			input.focus();
			const blurred = vi.fn();
			input.addEventListener('blur', blurred);
			input.value = 'FIGHTER';
			input.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }),
			);
			// The same groups in the same places; only a header's spelling follows
			// the record that heads it.
			expect(groupNames(host).map((one) => one?.toLowerCase())).toEqual(
				order.map((one) => one?.toLowerCase()),
			);
			// And the field was never blurred: a regroup releases focus before it
			// reports, so none of that happened for a record that stayed put.
			expect(blurred).not.toHaveBeenCalled();
		});

		it('restores on Escape, and a tab away commits without pulling focus back', () => {
			const { host, state } = live();
			const input = classOf(host, "Hunter's Bane");
			input.focus();
			input.value = 'Rogue';
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
			expect(input.value).toBe('Blood Hunter');
			expect(state.changes).toEqual([]);

			const other = classOf(host, 'Second Wind');
			other.value = 'Rogue';
			other.dispatchEvent(new Event('blur'));
			expect(groupNames(host)).toContain('Rogue');
			expect(host.ownerDocument.activeElement).not.toBe(classOf(host, 'Second Wind'));
		});

		it('draws the field with its empty state, and no spellcheck', () => {
			const { host } = live();
			const blank = classOf(host, 'Lucky');
			expect(blank.value).toBe('');
			expect(blank.placeholder).toBe('—');
			expect(blank.spellcheck).toBe(false);
			expect(blank.getAttribute('aria-label')).toBe('Lucky Class');
			// The field's name is drawn beside it, as a number's is.
			expect(
				blank
					.closest('.sheetsmith-record-field')
					?.querySelector('.sheetsmith-card-abbreviation')?.textContent,
			).toBe('Class');
		});

		it('is the same control inside the opened record', () => {
			const { host } = live({
				fields: [
					{ key: 'Class', placement: 'body' },
					{ key: 'Uses', type: 'number', max: 3 },
				],
			});
			const input = textInputs(host)[0] as HTMLInputElement;
			expect(input.closest('.sheetsmith-record-body-fields')).not.toBeNull();
			expect(input.placeholder).toBe('—');
		});
	});

	describe('what it refuses at the commit', () => {
		const attempt = (value: string) => {
			const live1 = live({}, FEATURES_TEXT, {}, false);
			const input = classOf(live1.host, 'Second Wind');
			input.focus();
			if (value.includes('\n')) {
				// An `<input>` strips a line break on typing, so reaching the check
				// takes a value that arrives some other way: a paste into a field the
				// engine did not sanitise, or a programmatic set.
				Object.defineProperty(input, 'value', {
					get: () => value,
					set: () => undefined,
					configurable: true,
				});
			} else {
				input.value = value;
			}
			input.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }),
			);
			return { ...live1, input };
		};
		const noticeOf = (host: HTMLElement) =>
			host.querySelector('.sheetsmith-error')?.textContent ?? null;

		it('refuses a wikilink with the shared sentence and keeps the draft', () => {
			const { host, state, input } = attempt('[[Wizard]]');
			expect(state.changes).toEqual([]);
			expect(input.value).toBe('[[Wizard]]');
			expect(noticeOf(host)).toBe(
				'Not saved. A feature\'s fields are stored in a code block and Obsidian indexes no link inside one, so "[[Wizard]]" would stop being a link. Put it in the feature\'s name or its body instead.',
			);
		});

		it('refuses 41 characters with the count and saves 40', () => {
			const over = attempt('x'.repeat(41));
			expect(over.state.changes).toEqual([]);
			expect(noticeOf(over.host)).toBe(
				"Not saved. A group name is at most 40 characters, and this is 41. Shorten it, or put the detail in the feature's body.",
			);
			expect(attempt('x'.repeat(40)).state.changes).toHaveLength(1);
		});

		it('counts code points, so 40 emoji are 40', () => {
			expect(attempt('🙂'.repeat(40)).state.changes).toHaveLength(1);
			expect(noticeOf(attempt('🙂'.repeat(41)).host)).toContain('and this is 41');
		});

		it('refuses a line break', () => {
			const { host, state } = attempt('Blood\nHunter');
			expect(state.changes).toEqual([]);
			expect(noticeOf(host)).toBe(
				'Not saved. A group name is one line, because the sheet block holds one entry per line. Remove the line break.',
			);
		});

		it('clears the notice on Escape and keeps the stored value', () => {
			const { host, input } = attempt('[[Wizard]]');
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
			expect(input.value).toBe('Fighter');
			input.dispatchEvent(new Event('blur'));
			expect(noticeOf(host)).toBeNull();
		});

		it('stores a colon, a slash, a semicolon and inner spaces as typed, and trims the ends', () => {
			for (const value of ['Blood: Hunter', 'A/B', 'A;B', 'Two  words']) {
				const { state } = attempt(value);
				expect(state.changes).toHaveLength(1);
				const written = recordSet.write(
					state.changes[0] as RecordSetData,
					FEATURES_TEXT,
					TEXT_CONFIG,
				);
				const reread = readData(written, TEXT_CONFIG).records[1]?.fields?.Class;
				expect(reread).toBe(value);
			}
			const { state } = attempt('   Rogue   ');
			expect(state.changes[0]).toEqual({
				records: { 1: { fields: { Class: 'Rogue' } } },
			});
		});

		it('writes a cleared value as a blank entry', () => {
			const { state } = attempt('');
			expect(state.changes).toEqual([{ records: { 1: { fields: { Class: '' } } } }]);
			const written = recordSet.write(
				state.changes[0] as RecordSetData,
				FEATURES_TEXT,
				TEXT_CONFIG,
			);
			expect(written).toContain('Class: \n');
		});
	});

	describe('round trip', () => {
		const ODD =
			rec('A', 'Class: Wizard') +
			rec('B', 'Class:   a: b  ') +
			rec('C', 'Class: [[Wizard]]') +
			rec('D', `Class: ${'y'.repeat(90)}`, 'Uses: 1');

		it('parses and serialises byte-identically with nothing changed', () => {
			expect(recordSet.write({ records: {} }, ODD, TEXT_CONFIG)).toBe(ODD);
			expect(
				recordSet.write({ records: { 0: { fields: { Class: 'Wizard' } } } }, ODD, TEXT_CONFIG),
			).toBe(ODD);
		});

		it('leaves the odd lines’ bytes alone when a sibling field is written', () => {
			const written = recordSet.write(
				{ records: { 3: { fields: { Uses: '2' } } } },
				ODD,
				TEXT_CONFIG,
			);
			expect(written).toBe(ODD.replace('Uses: 1', 'Uses: 2'));
			expect(written).toContain('Class:   a: b  ');
			expect(written).toContain('Class: [[Wizard]]');
		});

		it('reads a colon in the value as the rest of the line', () => {
			expect(readData(ODD, TEXT_CONFIG).records[1]?.fields?.Class).toBe('a: b');
			const { host } = live({}, ODD);
			expect(textInputs(host).map((one) => one.value)[1]).toBe('a: b');
		});

		it('keeps every entry when the field is retyped or the key cleared (Constraint 4)', () => {
			for (const cfg of [
				{ ...TEXT_CONFIG, fields: [{ key: 'Class', type: 'number' as const }] },
				{ ...TEXT_CONFIG, groupBy: undefined, fields: [{ key: 'Other', type: 'number' as const }] },
			]) {
				const result = recordSet.write(
					{ records: { 0: { name: 'AA' } } },
					ODD,
					cfg,
				);
				expect(result).toBe(ODD.replace('### A\n', '### AA\n'));
			}
		});
	});

	describe('the classes the stylesheet’s design rules key on', () => {
		/*
		 * The stacking thresholds (480px, and 420px headed) and the left-aligned
		 * strip heading are CSS, held by `harness/measure-groups.mjs`; what they key
		 * on is these classes, and nothing else fails if the component stops
		 * stamping them.
		 */
		const classesOf = (cfg: Partial<RecordSetConfig>, text = FEATURES_TEXT) => {
			const el = live(cfg, text).host;
			const block = el.querySelector('.sheetsmith-record-set') as HTMLElement;
			return {
				text: block.classList.contains('sheetsmith-record-set-text'),
				headed: block.classList.contains('sheetsmith-record-set-text-headed'),
				strip: Array.from(
					el.querySelectorAll('.sheetsmith-record-strip > *'),
				).map((one) => [
					one.textContent,
					one.classList.contains('sheetsmith-record-strip-text'),
				]),
			};
		};

		it('stamps -text exactly when a text field is on the summary line', () => {
			expect(classesOf({}).text).toBe(true);
			expect(
				classesOf({
					fields: [{ key: 'Class', placement: 'body' }, { key: 'Uses', type: 'number' }],
				}).text,
			).toBe(false);
			expect(
				classesOf({
					groupBy: 'Uses',
					fields: [{ key: 'Uses', type: 'number' }, { key: 'Seen', type: 'toggle' }],
				}).text,
			).toBe(false);
		});

		it('stamps -text-headed exactly when the strip is drawn', () => {
			expect(classesOf({}).headed).toBe(false);
			expect(classesOf({ fieldHeadings: true })).toMatchObject({ text: true, headed: true });
			// Asked for and with nothing to name: no strip, so no headed class.
			const empty = document.createElement('div');
			recordSet.render(empty, { ...TEXT_CONFIG, fieldHeadings: true }, null, context);
			const emptyBlock = empty.querySelector('.sheetsmith-record-set') as HTMLElement;
			expect(emptyBlock.classList.contains('sheetsmith-record-set-text')).toBe(true);
			expect(emptyBlock.classList.contains('sheetsmith-record-set-text-headed')).toBe(false);
			expect(
				classesOf({
					fieldHeadings: true,
					groupBy: 'Uses',
					fields: [{ key: 'Uses', type: 'number' }],
				}),
			).toMatchObject({ text: false, headed: false });
		});

		it('marks the strip heading of a text column and no other', () => {
			expect(classesOf({ fieldHeadings: true }).strip).toEqual([
				['Class', true],
				['Uses', false],
			]);
		});
	});

	describe('a list with no text field', () => {
		const PLAIN: RecordSetConfig = {
			...config,
			id: 'plain',
			fields: [
				{ key: 'Uses', type: 'number', max: 3 },
				{ key: 'Attuned', type: 'toggle' },
				{ key: 'Rank', type: 'level', levels: ['None', 'Low', 'High'] },
				{ key: 'Left', type: 'computed', formula: '3 - Uses' },
				{ key: 'Mods', type: 'modifier' },
			],
		};

		/**
		 * A structural outline of the markup: tag, classes and the attributes a
		 * reader or a screen reader meets, one element a line. The snapshots below
		 * were taken from the component **before** the text type existed, so a drift
		 * in what an existing layout draws is a diff here and not a surprise in the
		 * harness (`docs/features/free-text-group-key.md`, "Nothing existing
		 * changes").
		 */
		const outline = (root: Element, depth = 0): string[] => {
			const attrs = ['type', 'aria-label', 'aria-expanded', 'placeholder', 'hidden']
				.filter((name) => root.hasAttribute(name))
				.map((name) => `${name}=${root.getAttribute(name)}`);
			const own = Array.from(root.children).every(
				(child) => child.nodeType === 1,
			)
				? root.children.length === 0
					? root.textContent
					: ''
				: root.textContent;
			const head = `${'  '.repeat(depth)}${root.tagName.toLowerCase()}${
				root.className === '' ? '' : `.${root.className.split(' ').join('.')}`
			}${attrs.length === 0 ? '' : ` [${attrs.join(' ')}]`}${own ? ` "${own}"` : ''}`;
			return [head, ...Array.from(root.children).flatMap((c) => outline(c, depth + 1))];
		};
		const EVERY_TYPE: RecordSetConfig = {
			...config,
			id: 'every_type',
			fields: [
				{ key: 'Uses', type: 'number', max: 3 },
				{ key: 'Attuned', type: 'toggle' },
				{ key: 'Rank', type: 'level', levels: ['None', 'Low', 'High'] },
				{ key: 'Left', type: 'computed', formula: '3 - Uses' },
				{ key: 'Mods', type: 'modifier' },
			],
		};
		const EVERY_BODY = [
			'',
			'### First',
			'```sheet',
			'Uses: 1',
			'Attuned: yes',
			'Rank: 2',
			'```',
			'Some prose.',
			'',
			'### Second',
			'```sheet',
			'Uses: 3',
			'Rank: 1',
			'```',
			'',
		].join('\n');
		const drawn = (overrides: Partial<RecordSetConfig>): string => {
			const cfg = { ...EVERY_TYPE, ...overrides };
			const el = document.createElement('div');
			recordSet.render(el, cfg, readData(EVERY_BODY, cfg), {
				...context,
				resolveField: makeFieldResolver(recordSet, cfg, readData(EVERY_BODY, cfg), NO_ENV),
			});
			return outline(el).join('\n');
		};

		it('draws the markup it drew before text was offered, plain', () => {
			expect(drawn({})).toMatchInlineSnapshot(`
				"div
				  div.sheetsmith-placed.sheetsmith-record-set
				    div.sheetsmith-component-label.sheetsmith-record-set-label "Features"
				    div.sheetsmith-placed-box.sheetsmith-record-set-box
				      div.sheetsmith-record-set-scroll
				        div.sheetsmith-record-set-list
				          div.sheetsmith-record
				            div.sheetsmith-record-summary
				              button.sheetsmith-record-disclosure [type=button aria-label=Open First aria-expanded=false]
				                svg.svg-icon.lucide-chevron-right
				                  path
				              div.sheetsmith-record-name
				                input.sheetsmith-record-name-input [type=text aria-label=Feature]
				              div.sheetsmith-record-fields
				                div.sheetsmith-record-field.sheetsmith-record-field-number
				                  span.sheetsmith-card-abbreviation "Uses"
				                  input.sheetsmith-record-input [type=text aria-label=First Uses]
				                  span.sheetsmith-pool-ceiling
				                    span.sheetsmith-pool-separator "/"
				                    span.sheetsmith-pool-max "3"
				                div.sheetsmith-record-field.sheetsmith-record-field-toggle
				                  button.sheetsmith-level-ring.sheetsmith-level-ring-on [type=button aria-label=First Attuned]
				                div.sheetsmith-record-field.sheetsmith-record-field-level
				                  button.sheetsmith-level-ring.sheetsmith-level-ring-on [type=button aria-label=First Rank: High] "H"
				                div.sheetsmith-record-field.sheetsmith-record-field-computed
				                  div.sheetsmith-record-value.sheetsmith-record-askable "2"
				                  span.sheetsmith-sr-only "First Left"
				                div.sheetsmith-record-field.sheetsmith-record-field-modifier.sheetsmith-record-modifier-empty
				                  button.sheetsmith-record-modifier [type=button aria-label=First Mods aria-expanded=false]
				                    span.sheetsmith-record-modifier-glyph
				                      svg.svg-icon.lucide-plus
				                        path
				                        path
				              button.sheetsmith-record-remove [type=button aria-label=Delete First]
				                svg.svg-icon.lucide-trash
				                  path
				                  path
				                  path
				            div.sheetsmith-record-body [hidden=until-found]
				              textarea.sheetsmith-record-body-input [aria-label=First body placeholder=Write anything about this feature.]
				              div.sheetsmith-record-body-rendered.sheetsmith-record-body-plain
				                p "Some prose."
				          div.sheetsmith-record
				            div.sheetsmith-record-summary
				              button.sheetsmith-record-disclosure [type=button aria-label=Open Second aria-expanded=false]
				                svg.svg-icon.lucide-chevron-right
				                  path
				              div.sheetsmith-record-name
				                input.sheetsmith-record-name-input [type=text aria-label=Feature]
				              div.sheetsmith-record-fields
				                div.sheetsmith-record-field.sheetsmith-record-field-number
				                  span.sheetsmith-card-abbreviation "Uses"
				                  input.sheetsmith-record-input [type=text aria-label=Second Uses]
				                  span.sheetsmith-pool-ceiling
				                    span.sheetsmith-pool-separator "/"
				                    span.sheetsmith-pool-max "3"
				                div.sheetsmith-record-field.sheetsmith-record-field-toggle
				                  button.sheetsmith-level-ring [type=button aria-label=Second Attuned]
				                div.sheetsmith-record-field.sheetsmith-record-field-level
				                  button.sheetsmith-level-ring.sheetsmith-level-ring-on.sheetsmith-level-ring-part [type=button aria-label=Second Rank: Low] "L"
				                div.sheetsmith-record-field.sheetsmith-record-field-computed
				                  div.sheetsmith-record-value.sheetsmith-record-askable "0"
				                  span.sheetsmith-sr-only "Second Left"
				                div.sheetsmith-record-field.sheetsmith-record-field-modifier.sheetsmith-record-modifier-empty
				                  button.sheetsmith-record-modifier [type=button aria-label=Second Mods aria-expanded=false]
				                    span.sheetsmith-record-modifier-glyph
				                      svg.svg-icon.lucide-plus
				                        path
				                        path
				              button.sheetsmith-record-remove [type=button aria-label=Delete Second]
				                svg.svg-icon.lucide-trash
				                  path
				                  path
				                  path
				            div.sheetsmith-record-body [hidden=until-found]
				              textarea.sheetsmith-record-body-input [aria-label=Second body placeholder=Write anything about this feature.]
				              div.sheetsmith-record-body-rendered
				      button.sheetsmith-record-add [type=button]
				        span.sheetsmith-record-add-label "Add feature"
				    div.sheetsmith-sr-only"
			`);
		});

		it('draws the markup it drew before, grouped by a level key', () => {
			expect(drawn({ groupBy: 'Rank' })).toMatchInlineSnapshot(`
				"div
				  div.sheetsmith-placed.sheetsmith-record-set
				    div.sheetsmith-component-label.sheetsmith-record-set-label "Features"
				    div.sheetsmith-placed-box.sheetsmith-record-set-box
				      div.sheetsmith-record-set-scroll
				        div.sheetsmith-record-set-list
				          div.sheetsmith-record-group
				            h3.sheetsmith-record-group-heading
				              button.sheetsmith-record-group-toggle [type=button aria-expanded=true]
				                span.sheetsmith-record-group-mark
				                  svg.svg-icon.lucide-chevron-down
				                    path
				                span.sheetsmith-record-group-name "Low"
				              span.sheetsmith-card-abbreviation.sheetsmith-record-group-count "1"
				            span.sheetsmith-sr-only "1 feature"
				            div.sheetsmith-record-group-body
				              div.sheetsmith-record
				                div.sheetsmith-record-summary
				                  button.sheetsmith-record-disclosure [type=button aria-label=Open Second aria-expanded=false]
				                    svg.svg-icon.lucide-chevron-right
				                      path
				                  div.sheetsmith-record-name
				                    input.sheetsmith-record-name-input [type=text aria-label=Feature]
				                  div.sheetsmith-record-fields
				                    div.sheetsmith-record-field.sheetsmith-record-field-number
				                      span.sheetsmith-card-abbreviation "Uses"
				                      input.sheetsmith-record-input [type=text aria-label=Second Uses]
				                      span.sheetsmith-pool-ceiling
				                        span.sheetsmith-pool-separator "/"
				                        span.sheetsmith-pool-max "3"
				                    div.sheetsmith-record-field.sheetsmith-record-field-toggle
				                      button.sheetsmith-level-ring [type=button aria-label=Second Attuned]
				                    div.sheetsmith-record-field.sheetsmith-record-field-level
				                      button.sheetsmith-level-ring.sheetsmith-level-ring-on.sheetsmith-level-ring-part [type=button aria-label=Second Rank: Low] "L"
				                    div.sheetsmith-record-field.sheetsmith-record-field-computed
				                      div.sheetsmith-record-value.sheetsmith-record-askable "0"
				                      span.sheetsmith-sr-only "Second Left"
				                    div.sheetsmith-record-field.sheetsmith-record-field-modifier.sheetsmith-record-modifier-empty
				                      button.sheetsmith-record-modifier [type=button aria-label=Second Mods aria-expanded=false]
				                        span.sheetsmith-record-modifier-glyph
				                          svg.svg-icon.lucide-plus
				                            path
				                            path
				                  button.sheetsmith-record-remove [type=button aria-label=Delete Second]
				                    svg.svg-icon.lucide-trash
				                      path
				                      path
				                      path
				                div.sheetsmith-record-body [hidden=until-found]
				                  textarea.sheetsmith-record-body-input [aria-label=Second body placeholder=Write anything about this feature.]
				                  div.sheetsmith-record-body-rendered
				          div.sheetsmith-record-group
				            h3.sheetsmith-record-group-heading
				              button.sheetsmith-record-group-toggle [type=button aria-expanded=true]
				                span.sheetsmith-record-group-mark
				                  svg.svg-icon.lucide-chevron-down
				                    path
				                span.sheetsmith-record-group-name "High"
				              span.sheetsmith-card-abbreviation.sheetsmith-record-group-count "1"
				            span.sheetsmith-sr-only "1 feature"
				            div.sheetsmith-record-group-body
				              div.sheetsmith-record
				                div.sheetsmith-record-summary
				                  button.sheetsmith-record-disclosure [type=button aria-label=Open First aria-expanded=false]
				                    svg.svg-icon.lucide-chevron-right
				                      path
				                  div.sheetsmith-record-name
				                    input.sheetsmith-record-name-input [type=text aria-label=Feature]
				                  div.sheetsmith-record-fields
				                    div.sheetsmith-record-field.sheetsmith-record-field-number
				                      span.sheetsmith-card-abbreviation "Uses"
				                      input.sheetsmith-record-input [type=text aria-label=First Uses]
				                      span.sheetsmith-pool-ceiling
				                        span.sheetsmith-pool-separator "/"
				                        span.sheetsmith-pool-max "3"
				                    div.sheetsmith-record-field.sheetsmith-record-field-toggle
				                      button.sheetsmith-level-ring.sheetsmith-level-ring-on [type=button aria-label=First Attuned]
				                    div.sheetsmith-record-field.sheetsmith-record-field-level
				                      button.sheetsmith-level-ring.sheetsmith-level-ring-on [type=button aria-label=First Rank: High] "H"
				                    div.sheetsmith-record-field.sheetsmith-record-field-computed
				                      div.sheetsmith-record-value.sheetsmith-record-askable "2"
				                      span.sheetsmith-sr-only "First Left"
				                    div.sheetsmith-record-field.sheetsmith-record-field-modifier.sheetsmith-record-modifier-empty
				                      button.sheetsmith-record-modifier [type=button aria-label=First Mods aria-expanded=false]
				                        span.sheetsmith-record-modifier-glyph
				                          svg.svg-icon.lucide-plus
				                            path
				                            path
				                  button.sheetsmith-record-remove [type=button aria-label=Delete First]
				                    svg.svg-icon.lucide-trash
				                      path
				                      path
				                      path
				                div.sheetsmith-record-body [hidden=until-found]
				                  textarea.sheetsmith-record-body-input [aria-label=First body placeholder=Write anything about this feature.]
				                  div.sheetsmith-record-body-rendered.sheetsmith-record-body-plain
				                    p "Some prose."
				      button.sheetsmith-record-add [type=button]
				        span.sheetsmith-record-add-label "Add feature"
				    div.sheetsmith-sr-only"
			`);
		});

		it('draws the markup it drew before, grouped by a number key', () => {
			expect(drawn({ groupBy: 'Uses' })).toMatchInlineSnapshot(`
				"div
				  div.sheetsmith-placed.sheetsmith-record-set
				    div.sheetsmith-component-label.sheetsmith-record-set-label "Features"
				    div.sheetsmith-placed-box.sheetsmith-record-set-box
				      div.sheetsmith-record-set-scroll
				        div.sheetsmith-record-set-list
				          div.sheetsmith-record-group
				            h3.sheetsmith-record-group-heading
				              button.sheetsmith-record-group-toggle [type=button aria-expanded=true]
				                span.sheetsmith-record-group-mark
				                  svg.svg-icon.lucide-chevron-down
				                    path
				                span.sheetsmith-record-group-name "Uses 1"
				              span.sheetsmith-card-abbreviation.sheetsmith-record-group-count "1"
				            span.sheetsmith-sr-only "1 feature"
				            div.sheetsmith-record-group-body
				              div.sheetsmith-record
				                div.sheetsmith-record-summary
				                  button.sheetsmith-record-disclosure [type=button aria-label=Open First aria-expanded=false]
				                    svg.svg-icon.lucide-chevron-right
				                      path
				                  div.sheetsmith-record-name
				                    input.sheetsmith-record-name-input [type=text aria-label=Feature]
				                  div.sheetsmith-record-fields
				                    div.sheetsmith-record-field.sheetsmith-record-field-number
				                      span.sheetsmith-card-abbreviation "Uses"
				                      input.sheetsmith-record-input [type=text aria-label=First Uses]
				                      span.sheetsmith-pool-ceiling
				                        span.sheetsmith-pool-separator "/"
				                        span.sheetsmith-pool-max "3"
				                    div.sheetsmith-record-field.sheetsmith-record-field-toggle
				                      button.sheetsmith-level-ring.sheetsmith-level-ring-on [type=button aria-label=First Attuned]
				                    div.sheetsmith-record-field.sheetsmith-record-field-level
				                      button.sheetsmith-level-ring.sheetsmith-level-ring-on [type=button aria-label=First Rank: High] "H"
				                    div.sheetsmith-record-field.sheetsmith-record-field-computed
				                      div.sheetsmith-record-value.sheetsmith-record-askable "2"
				                      span.sheetsmith-sr-only "First Left"
				                    div.sheetsmith-record-field.sheetsmith-record-field-modifier.sheetsmith-record-modifier-empty
				                      button.sheetsmith-record-modifier [type=button aria-label=First Mods aria-expanded=false]
				                        span.sheetsmith-record-modifier-glyph
				                          svg.svg-icon.lucide-plus
				                            path
				                            path
				                  button.sheetsmith-record-remove [type=button aria-label=Delete First]
				                    svg.svg-icon.lucide-trash
				                      path
				                      path
				                      path
				                div.sheetsmith-record-body [hidden=until-found]
				                  textarea.sheetsmith-record-body-input [aria-label=First body placeholder=Write anything about this feature.]
				                  div.sheetsmith-record-body-rendered.sheetsmith-record-body-plain
				                    p "Some prose."
				          div.sheetsmith-record-group
				            h3.sheetsmith-record-group-heading
				              button.sheetsmith-record-group-toggle [type=button aria-expanded=true]
				                span.sheetsmith-record-group-mark
				                  svg.svg-icon.lucide-chevron-down
				                    path
				                span.sheetsmith-record-group-name "Uses 3"
				              span.sheetsmith-card-abbreviation.sheetsmith-record-group-count "1"
				            span.sheetsmith-sr-only "1 feature"
				            div.sheetsmith-record-group-body
				              div.sheetsmith-record
				                div.sheetsmith-record-summary
				                  button.sheetsmith-record-disclosure [type=button aria-label=Open Second aria-expanded=false]
				                    svg.svg-icon.lucide-chevron-right
				                      path
				                  div.sheetsmith-record-name
				                    input.sheetsmith-record-name-input [type=text aria-label=Feature]
				                  div.sheetsmith-record-fields
				                    div.sheetsmith-record-field.sheetsmith-record-field-number
				                      span.sheetsmith-card-abbreviation "Uses"
				                      input.sheetsmith-record-input [type=text aria-label=Second Uses]
				                      span.sheetsmith-pool-ceiling
				                        span.sheetsmith-pool-separator "/"
				                        span.sheetsmith-pool-max "3"
				                    div.sheetsmith-record-field.sheetsmith-record-field-toggle
				                      button.sheetsmith-level-ring [type=button aria-label=Second Attuned]
				                    div.sheetsmith-record-field.sheetsmith-record-field-level
				                      button.sheetsmith-level-ring.sheetsmith-level-ring-on.sheetsmith-level-ring-part [type=button aria-label=Second Rank: Low] "L"
				                    div.sheetsmith-record-field.sheetsmith-record-field-computed
				                      div.sheetsmith-record-value.sheetsmith-record-askable "0"
				                      span.sheetsmith-sr-only "Second Left"
				                    div.sheetsmith-record-field.sheetsmith-record-field-modifier.sheetsmith-record-modifier-empty
				                      button.sheetsmith-record-modifier [type=button aria-label=Second Mods aria-expanded=false]
				                        span.sheetsmith-record-modifier-glyph
				                          svg.svg-icon.lucide-plus
				                            path
				                            path
				                  button.sheetsmith-record-remove [type=button aria-label=Delete Second]
				                    svg.svg-icon.lucide-trash
				                      path
				                      path
				                      path
				                div.sheetsmith-record-body [hidden=until-found]
				                  textarea.sheetsmith-record-body-input [aria-label=Second body placeholder=Write anything about this feature.]
				                  div.sheetsmith-record-body-rendered
				      button.sheetsmith-record-add [type=button]
				        span.sheetsmith-record-add-label "Add feature"
				    div.sheetsmith-sr-only"
			`);
		});

		it('draws no text control and writes the same bytes whatever groupBy says', () => {
			const el = render(PLAIN, BODY);
			expect(el.querySelector('.sheetsmith-record-input-text')).toBeNull();
			const delta = { records: { 1: { fields: { Uses: '2' } } } };
			expect(recordSet.write(delta, BODY, PLAIN)).toBe(
				BODY.replace('Uses: 0', 'Uses: 2'),
			);
			for (const blank of ['', '  ']) {
				expect(render({ ...PLAIN, groupBy: blank }, BODY).innerHTML).toBe(el.innerHTML);
			}
		});
	});

	describe('the type-ahead the view may attach', () => {
		interface Attached {
			input: HTMLInputElement;
			names: readonly string[];
			commit: (next: string) => void;
		}
		function attach(
			overrides: Partial<RecordSetConfig> = {},
			text: string = FEATURES_TEXT,
		) {
			const calls: Attached[] = [];
			const view = live(overrides, text, {
				suggestText: (input, names, commit) => {
					calls.push({ input, names, commit });
				},
			});
			return { ...view, calls };
		}

		it('is called once per text input, with this list’s group spellings in header order', () => {
			const { host, calls } = attach();
			expect(calls).toHaveLength(8);
			expect(calls.map((one) => one.input)).toEqual(textInputs(host));
			for (const call of calls) {
				// First-seen spelling, header order, no Other, collapsed or not.
				expect(call.names).toEqual(['Blood Hunter', 'Fighter', 'Wizard']);
			}
		});

		it('offers a collapsed group’s name and never a name from another list', () => {
			const { host, state, calls } = attach();
			press(toggles(host)[2] as HTMLElement);
			expect(state.collapsed.has('wizard')).toBe(true);
			// Redrawn by the collapse's own report: the latest render's calls.
			expect(calls.at(-1)?.names).toContain('Wizard');
			const other = attach({ id: 'other-list' }, rec('Z', 'Class: Rogue'));
			expect(other.calls.at(-1)?.names).toEqual(['Rogue']);
			expect(calls.at(-1)?.names).not.toContain('Rogue');
		});

		it('rebuilds the offer on a render, so a new name is on it', () => {
			const { host, calls } = attach();
			expect(calls.at(-1)?.names).not.toContain('Rogue');
			typeClass(host, 'Second Wind', 'Rogue');
			// Second Wind headed Fighter, so with it gone the next Fighter in the
			// file (`FIGHTER`) heads it: the first-seen spelling, as the header does.
			expect(calls.at(-1)?.names).toEqual([
				'Blood Hunter',
				'FIGHTER',
				'Rogue',
				'Wizard',
			]);
		});

		it('commits a pick through the field’s own gesture: same write, same regroup, same refusals', () => {
			const { host, state, calls } = attach();
			const call = calls.find(
				(one) => one.input.getAttribute('aria-label') === 'Second Wind Class',
			) as Attached;
			call.commit('Wizard');
			expect(state.changes).toEqual([
				{ records: { 1: { fields: { Class: 'Wizard' } } } },
			]);
			expect(membersOf(host, 2)).toContain('Second Wind');

			const refused = attach();
			const bad = refused.calls.find(
				(one) => one.input.getAttribute('aria-label') === 'Second Wind Class',
			) as Attached;
			bad.commit('[[Wizard]]');
			expect(refused.state.changes).toEqual([]);
			expect(refused.host.querySelector('.sheetsmith-error')?.textContent).toContain(
				'Not saved.',
			);
		});

		it('draws a plain input where the view attaches nothing', () => {
			const { host } = live();
			expect(textInputs(host)).toHaveLength(8);
			expect(textInputs(host)[0]?.hasAttribute('aria-autocomplete')).toBe(false);
		});

		it('is never called for a list keyed by something other than text', () => {
			let called = 0;
			const cfg: RecordSetConfig = {
				...TEXT_CONFIG,
				groupBy: 'Uses',
				fields: [{ key: 'Uses', type: 'number' }],
			};
			const host = document.createElement('div');
			document.body.appendChild(host);
			recordSet.render(host, cfg, readData(rec('A', 'Uses: 1'), cfg), {
				...context,
				suggestText: () => {
					called += 1;
				},
			});
			expect(called).toBe(0);
		});
	});

	describe('sample', () => {
		it('names two classes from the first two sample records, through read and write', () => {
			const sample = recordSet.sample?.(TEXT_CONFIG) ?? '';
			expect(sample).toContain('Class: Fighter');
			expect(sample).toContain('Class: Wizard');
			expect(recordSet.read(sample, TEXT_CONFIG).ok).toBe(true);
			const { host } = live({}, sample);
			expect(groupNames(host)).toEqual(['Fighter', 'Wizard']);
		});
	});
});
