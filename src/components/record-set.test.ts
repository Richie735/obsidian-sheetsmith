// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { recordSet, RecordSetConfig, RecordSetData } from './record-set';
import { card, CardConfig } from './card';
import { buildSheet, ReadComponent } from '../formula/sheet';
import { evaluate } from '../formula/expression';
import { callsFrom, makeFieldResolver, NO_ENV } from '../formula/resolve';
import { Layout } from '../parse/layout';
import { COLUMN_TYPES } from './column-types';
import { RenderContext } from '../types';
import { sampleOf } from '../test/sample';
import { closeAnchoredPanel } from '../ui/anchored-panel';
import { closePopover, LONG_PRESS } from '../ui/popover';
import { parseModifierPart } from '../parse/modifier-cell';
import { hold } from '../test/pointer';

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
	Array.from(el.querySelectorAll<HTMLButtonElement>('.sheetsmith-record-disclosure'));
const bodies = (el: HTMLElement) =>
	Array.from(el.querySelectorAll<HTMLElement>('.sheetsmith-record-body'));
const nameFields = (el: HTMLElement) =>
	Array.from(el.querySelectorAll<HTMLInputElement>('.sheetsmith-record-name-input'));
const bodyFields = (el: HTMLElement) =>
	Array.from(el.querySelectorAll<HTMLTextAreaElement>('.sheetsmith-record-body-input'));
const errors = (el: HTMLElement) =>
	Array.from(el.querySelectorAll<HTMLElement>('.sheetsmith-error'));
const addButton = (el: HTMLElement) =>
	el.querySelector<HTMLButtonElement>('.sheetsmith-record-add') as HTMLButtonElement;
const removeButtons = (el: HTMLElement) =>
	Array.from(el.querySelectorAll<HTMLButtonElement>('.sheetsmith-record-remove'));

/** One labelled control inside the anchored form, by the word over it. */
function field(
	panel: HTMLElement,
	label: string,
): HTMLSelectElement | HTMLInputElement | null {
	for (const row of Array.from(panel.querySelectorAll('.sheetsmith-panel-field'))) {
		if (row.querySelector('.sheetsmith-panel-field-label')?.textContent !== label) {
			continue;
		}
		return row.querySelector<HTMLSelectElement | HTMLInputElement>('select, input');
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
function modifierContext(): NonNullable<RenderContext<RecordSetData>['modifiers']> {
	const target = { name: 'armour_class', label: 'Armour class' };
	return {
		definitions: [],
		targets: [target],
		published: [target],
		bonusTypes: ['item'],
		// Parsed the way the sheet parses it, rather than handing the whole part
		// back as an amount: the form fills its fields from `typed`, so a stub that
		// lied about them would drive the form over values no sheet produces.
		outcome: (part) => {
			const parsed = parseModifierPart(part);
			return {
				definition: null,
				typed:
					parsed.kind === 'typed'
						? parsed.effect
						: { target: 'armour_class', operator: 'add' as const, amount: '' },
				target: 'armour_class',
				targetLabel: 'Armour class',
				applies: true,
				amount: 1,
				condition: null,
				suppressed: null,
			};
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

	it('takes each record\'s fence as its fields and everything after it as its body', () => {
		const held = readData(BODY).records;
		expect(held[0]?.fields).toEqual({ Uses: '1', Attuned: 'no' });
		expect(held[0]?.body).toBe(
			'Once per short rest, regain 1d10 hit points as a bonus action.',
		);
		expect(held[1]?.fields?.Modifiers).toBe(
			'armour_class += 1 as item when Attuned',
		);
		expect(held[1]?.body).toBe('A gift from the temple at [[Neverwinter]].');
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
		for (const body of ['', '\n', '   \n\t\n', '\nA preamble and no records.\n']) {
			expect(recordSet.read(body, config)).toEqual({ ok: true, data: null });
		}
	});

	it('reports an unreadable fence on that record alone', () => {
		const body =
			'\n### Good\n```sheet\nUses: 1\n```\nFine.\n\n### Broken\n```sheet\nnot an entry\n```\nAlso fine.\n';
		const held = readData(body).records;
		expect(held[0]?.error).toBeNull();
		expect(held[1]?.error).toContain('not an entry');
		// And it names the action rather than only the fault (PATTERNS §4).
		expect(held[1]?.error).toContain('every other one on this list still works');
	});

	it('reports a fence that never closes, and keeps the record', () => {
		const held = readData('\n### Broken\n```sheet\nUses: 1\n').records;
		expect(held[0]?.name).toBe('Broken');
		expect(held[0]?.error).toContain('never closed');
	});

	it('does not treat "#### " as a record, which is what the refusal names', () => {
		const data = readData('\n### One\n\n#### Not a record\n\nStill prose.\n');
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
		['a preamble', '\nSome prose above the list.\n\n### A\n```sheet\nUses: 1\n```\nProse.\n'],
		['blank lines between records', '\n### A\n\n```sheet\nUses: 1\n```\n\nProse.\n\n\n### B\n\nMore.\n'],
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
			expect(recordSet.write(readData(body, from), body, from)).toBe(body);
		}
	});

	it('has ten composite spellings, so that list cannot shrink either', () => {
		expect(COMPOSITES).toHaveLength(10);
	});

	it('keeps the reader\'s own spelling of the slash when the value is edited', () => {
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
		const el = render(owned, odd, { onChange: (data) => changes.push(data) });
		const value = records(el)[0]?.querySelector<HTMLInputElement>(
			'.sheetsmith-record-input',
		) as HTMLInputElement;
		value.value = '1';
		value.dispatchEvent(new Event('input'));
		value.dispatchEvent(new Event('blur'));
		// The join put the reader's own bare slash back rather than the canonical
		// form, which is the whole claim.
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '1/3' });
		const written = recordSet.write(changes[0] as RecordSetData, odd, owned);
		// The reader's spelling of the slash *and* of the colon, and the
		// neighbour's odd spacing of both, all survive.
		expect(written).toBe(odd.replace('Uses: 2/3', 'Uses: 1/3'));
	});

	it('rewrites one record\'s fence line and leaves every other byte alone', () => {
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
		expect(written).toBe('\n### A\n\n```sheet\nUses: 2\n```\n\nJust prose.\n');
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
				{ records: { 0: { fields: { Uses: '2' }, body: 'Replaced.' } } },
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
		expect(written).toBe(BODY.replace('### Blessed Armour', '### Blessed Plate'));
	});

	it('never writes a heading with no name after it', () => {
		// `### ` with nothing after it is not a heading, so a blank name would
		// drop the record on the next read and hand its body to the record above
		// it. Refused at the control and again here (Constraint 4).
		expect(recordSet.write({ records: { 0: { name: '   ' } } }, BODY, config)).toBe(
			BODY,
		);
	});

	it('appends a record after a blank line, and removes one by position', () => {
		const added = recordSet.write(
			{ records: {}, added: [{ name: 'Feature' }] },
			BODY,
			config,
		);
		expect(added).toBe(`${BODY}\n### Feature\n`);
		expect(readData(added).records[3]?.name).toBe('Feature');

		const removed = recordSet.write({ records: {}, removed: [1] }, BODY, config);
		const names = Object.values(readData(removed).records).map((one) => one.name);
		expect(names).toEqual(['Second Wind', 'Lucky']);
	});

	it('writes the first record into a section that has none', () => {
		expect(
			recordSet.write({ records: {}, added: [{ name: 'Feature' }] }, null, config),
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

	it('refuses a text field and names the body as the place for words', () => {
		const message = refuses([{ key: 'Notes', type: 'text' }]);
		expect(message).toContain('prose belongs in the feature\'s body');
	});

	it('refuses every offered field type that cannot hold a value in a fence', () => {
		/*
		 * The scan the criterion asks for, over the *offered* types rather than a
		 * comment: the fields config reuses the shared columns editor, so whatever
		 * `COLUMN_TYPES` grows is what an author can pick here — and a type this
		 * component cannot store has to be refused rather than half-drawn.
		 *
		 * `text` is the one that is refused today. The floor is what stops this
		 * passing on an empty vocabulary.
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
		// default is `text` — so a field added and not yet typed lands here.
		expect(refuses([{ key: 'Field' }])).toContain('cannot hold text');
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
		expect(refuses([{ key: 'Uses', type: 'number', total: true }])).toContain(
			'sum(features, Uses)',
		);
		expect(refuses([{ key: 'Uses', type: 'number', publish: true }])).toContain(
			'count(features, <expression>)',
		);
		expect(refuses([{ key: 'Rank', type: 'level', levels: ['None'] }])).toContain(
			'at least two level names',
		);
		expect(
			refuses([{ key: 'Rank', type: 'level', levels: ['None', ':*'] }]),
		).toContain('a mark but no name');
		expect(
			refuses([{ key: 'Uses', type: 'number', min: 4, max: 2 }]),
		).toContain('above its maximum');
	});

	it('fails read, publishes nothing and pushes nothing while it is refused', () => {
		const broken = { ...config, fields: [{ key: 'Notes', type: 'text' as const }] };
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
			const block = el.querySelector('.sheetsmith-record-set') as HTMLElement;
			expect(block.classList.contains('sheetsmith-placed')).toBe(true);
			expect(block.style.getPropertyValue('--sheetsmith-rows')).toBe('3');
			const box = el.querySelector('.sheetsmith-record-set-box') as HTMLElement;
			expect(box.classList.contains('sheetsmith-placed-box')).toBe(true);
			expect(box.querySelector('.sheetsmith-record-set-list')).not.toBeNull();
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

	it('draws the empty state as a label and one add control', () => {
		const el = render({}, null);
		expect(records(el)).toHaveLength(0);
		expect(addButton(el).textContent).toBe('Add feature');
		expect(errors(el)).toHaveLength(0);
		expect(el.querySelector('.sheetsmith-component-label')?.textContent).toBe(
			'Features',
		);
	});

	it('names the add control from the layout\'s own word', () => {
		expect(addButton(render({ recordName: 'Spell' }, null)).textContent).toBe(
			'Add spell',
		);
		expect(addButton(render({ recordName: undefined }, null)).textContent).toBe(
			'Add record',
		);
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
		expect(broken.querySelector('.sheetsmith-record-name-input')).toBeNull();
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
		const number = first.querySelector<HTMLInputElement>('.sheetsmith-record-input');
		expect(number?.value).toBe('1');
		expect(number?.getAttribute('aria-label')).toBe('Second Wind Uses');
		const ring = first.querySelector('.sheetsmith-level-ring') as HTMLElement;
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
		const ceiling = first.querySelector('.sheetsmith-pool-ceiling') as HTMLElement;
		expect(ceiling.textContent).toBe('/3');
		expect(
			ceiling.querySelector('.sheetsmith-pool-separator')?.textContent,
		).toBe('/');
		expect(ceiling.querySelector('.sheetsmith-pool-max')?.textContent).toBe('3');
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
			bare.querySelector<HTMLInputElement>('.sheetsmith-record-input')?.value,
		).toBe('1');
	});

	it('says the ceiling aloud where it draws one, on the pool\'s own spelling', () => {
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
			expect(document.querySelector('.sheetsmith-popover')?.textContent).toBe(
				'Second Wind Attuned',
			);
			held.click();
			expect(changes).toEqual([]);
			closePopover();
		} finally {
			vi.useRealTimers();
		}

		// A named level adds its own word to the field's name.
		const named: RecordSetConfig = {
			...config,
			fields: [{ key: 'Rank', type: 'level', levels: ['Untrained', 'Trained:', 'Expert:★'] }],
		};
		const graded = render(
			named,
			'\n### A\n```sheet\nRank: 2\n```\nProse.\n',
		);
		const ring = graded.querySelector('.sheetsmith-level-ring') as HTMLElement;
		expect(ring.getAttribute('title')).toBe('A Rank: Expert');
		expect(ring.getAttribute('aria-label')).toBe('A Rank: Expert');
		expect(ring.hasAttribute('aria-pressed')).toBe(false);
	});

	it('holds a typed number to the field\'s bounds', () => {
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
		expect(changes[0]).toEqual({ records: { 0: { fields: { Attuned: 'yes' } } } });
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
				ceiling.querySelector('.sheetsmith-pool-separator')?.textContent,
			).toBe('/');
			const field = ceilingField(record);
			// The record's *own* field chrome plus the pool's reading, which is the
			// one place Pool's classes are deliberately not both taken: two fields
			// on one summary line must not answer a hover two different ways.
			expect(field.classList.contains('sheetsmith-record-input')).toBe(true);
			expect(field.classList.contains('sheetsmith-pool-max')).toBe(true);
			expect(field.classList.contains('sheetsmith-pool-max-input')).toBe(false);
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
		expect(field.getAttribute('aria-label')).toBe('Second Wind Uses maximum');
		expect(field.getAttribute('title')).toBe(
			'Maximum Uses, held by this feature.',
		);
	});

	it('draws exactly what it draws today where maxSource is absent', () => {
		// A read-only span where the layout declares a `max`, nothing where it
		// does not, and a `min` alone changes neither.
		const declared = render({}, BODY);
		const first = records(declared)[0] as HTMLElement;
		expect(first.querySelector('.sheetsmith-pool-ceiling input')).toBeNull();
		expect(
			first.querySelector('.sheetsmith-pool-max')?.textContent,
		).toBe('3');
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
		expect(recordSet.write(changes[2] as RecordSetData, OWN_BODY, owned)).toBe(
			OWN_BODY.replace('Uses: 1/1', 'Uses: 1/4'),
		);
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

	it('holds a value to the record\'s own ceiling and says what it was held to', () => {
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
		const el = render(owned, body, { onChange: (data) => changes.push(data) });
		commit(ceilingField(records(el)[0] as HTMLElement), '3');
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '5 / 3' });
		const written = recordSet.write(changes[0] as RecordSetData, body, owned);
		const after = render(owned, written);
		const record = records(after)[0] as HTMLElement;
		expect(valueField(record).value).toBe('5');
		expect(ceilingField(record).value).toBe('3');
		expect(errors(after)).toEqual([]);
		expect(
			record.querySelector('.sheetsmith-modified'),
		).toBeNull();
	});

	it('steps the ceiling with the arrows, holds it to the field\'s min, and settles no arithmetic', () => {
		const changes: RecordSetData[] = [];
		const bounded: RecordSetConfig = {
			...config,
			fields: [{ key: 'Uses', type: 'number', min: 2, maxSource: 'record' }],
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

	it('declines a slash in either field, so a ceiling cannot be typed away', () => {
		/*
		 * The slash is syntax now. Committed into the value, `1/2` on an entry
		 * reading `2 / 3` would write `1/2 / 3`, which re-reads as a value of 1
		 * against a ceiling of `2 / 3` — text, so nothing clamps to it and `full`
		 * skips the record. Nothing is deleted, so Constraint 4 holds; what goes
		 * silently is the reading the reader set.
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
			commit(field, '1/2');
			expect(changes, which).toEqual([]);
			expect(field.value, which).toBe('1/2');
			expect(errors(el)[0]?.textContent, which).toContain('A slash separates');
			// Refused rather than repaired: nothing replaces what was typed.
			expect(recordSet.write({ records: {} }, body, owned)).toBe(body);
		}
		// And a value that is merely not a number is still stored as typed, which
		// is `boundedText`'s standing rule and not what this refuses.
		const changes: RecordSetData[] = [];
		const fine = render(owned, body, { onChange: (data) => changes.push(data) });
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
				fields: [{ key: 'Uses', type: 'number', maxSource: 'field' as const }],
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
		const values = (rows?.(() => null) ?? []).map((one) => one.values['Uses']);
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
		// A ceiling that is not a number is drawn as typed and behaves as none:
		// nothing clamps to it.
		expect(ceilingField(shown[2] as HTMLElement).value).toBe('lots');
		const changes: RecordSetData[] = [];
		const live = render(owned, body, {
			onChange: (data) => changes.push(data),
		});
		commit(valueField(records(live)[2] as HTMLElement), '40');
		expect(changes[0]?.records[2]?.fields).toEqual({ Uses: '40 / lots' });
		/*
		 * **And the announcement agrees with the clamp**, which is the half that
		 * shipped wrong: the live region took the ceiling's raw text while the
		 * clamp parsed it, so a record nothing clamped and `full` skipped still
		 * said "of lots" to the one reader who cannot see the field.
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
				{ key: 'Uses', type: 'number', min: 5, max: 3, maxSource: 'record' },
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
				{ key: 'Left', type: 'computed', formula: '1', maxSource: 'record' },
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
		expect(recordSet.write(readData(body, others), body, others)).toBe(body);
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
		expect(record.querySelector('.sheetsmith-pool-ceiling input')).toBeNull();
		expect(
			record.querySelector('.sheetsmith-pool-max')?.textContent,
		).toBe('3');
		// The one honest cost: the note says `2 / 5` while the sheet draws `2 / 3`.
		const changes: RecordSetData[] = [];
		const live = render(declared, body, {
			onChange: (data) => changes.push(data),
		});
		commit(valueField(records(live)[0] as HTMLElement), '9');
		expect(changes[0]?.records[0]?.fields).toEqual({ Uses: '3 / 5' });
		const written = recordSet.write(changes[0] as RecordSetData, body, declared);
		expect(written).toContain('Uses: 3 / 5');
		// And switching back finds the ceiling still there.
		expect(
			ceilingField(records(render(owned, written))[0] as HTMLElement).value,
		).toBe('5');
	});
});

describe('a record\'s name and its links', () => {
	const linked = '\n### [[Sunblade|sword]]\n\nProse.\n\n### [[Nowhere]]\n\nMore.\n';

	function withVault(exists: readonly string[], extra: Partial<RenderContext<RecordSetData>> = {}) {
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
		expect(removeButtons(el)[0]?.getAttribute('aria-label')).toBe('Delete sword');
	});
});

describe('the disclosure', () => {
	it('opens nothing on first render, and wires the chevron to its body', () => {
		const el = render();
		expect(chevrons(el).map((one) => one.getAttribute('aria-expanded'))).toEqual([
			'false',
			'false',
			'false',
		]);
		for (const [at, body] of bodies(el).entries()) {
			expect(body.getAttribute('hidden')).toBe('until-found');
			expect(chevrons(el)[at]?.getAttribute('aria-controls')).toBe(body.id);
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

describe('a record\'s body', () => {
	it('draws the prose over a field holding the same text', () => {
		const el = render({}, BODY, { openRecords: [0] });
		expect(bodyFields(el)[0]?.value).toBe(
			'Once per short rest, regain 1d10 hit points as a bonus action.',
		);
		expect(
			bodies(el)[0]?.querySelector('.sheetsmith-record-body-rendered')?.textContent,
		).toContain('Once per short rest');
	});

	it('commits a body edit as a delta on that record', () => {
		const changes: RecordSetData[] = [];
		const el = render({}, BODY, { onChange: (data) => changes.push(data) });
		const field = bodyFields(el)[2] as HTMLTextAreaElement;
		field.value = 'Four rerolls a day.';
		field.dispatchEvent(new Event('blur'));
		expect(changes[0]).toEqual({ records: { 2: { body: 'Four rerolls a day.' } } });
		expect(recordSet.write(changes[0] as RecordSetData, BODY, config)).toBe(
			BODY.replace('Three rerolls a day.', 'Four rerolls a day.'),
		);
	});

	it.each([
		['## ', '## A section', 'a new section in this note'],
		['### ', '### A record', 'a new feature in this list'],
	])('declines a body holding %s at the start of a line', (_mark, line, said) => {
		const changes: RecordSetData[] = [];
		const el = render({}, BODY, { onChange: (data) => changes.push(data) });
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
			bodies(el)[0]?.classList.contains('sheetsmith-record-body-refused'),
		).toBe(true);
	});

	it('draws the app\'s markdown where there is a renderer, and paragraphs where there is not', () => {
		const renderMarkdown = vi.fn((markdown: string, into: HTMLElement) => {
			into.textContent = `rendered: ${markdown}`;
		});
		const el = render({}, BODY, { renderMarkdown });
		expect(renderMarkdown).toHaveBeenCalledTimes(3);
		expect(
			bodies(el)[0]?.querySelector('.sheetsmith-record-body-rendered')?.textContent,
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
		expect(changes[0]).toEqual({ records: {}, added: [{ name: 'Feature' }] });
		// The next render is the one that lands focus, because the record does not
		// exist until the note has it.
		const written = recordSet.write(changes[0] as RecordSetData, BODY, config);
		const after = render({}, written);
		const fields = nameFields(after);
		expect(after.ownerDocument.activeElement).toBe(fields[fields.length - 1]);
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
		addButton(second).dispatchEvent(new MouseEvent('click', { bubbles: true }));
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
		expect(again.ownerDocument.activeElement).toBe(fields[fields.length - 1]);
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
		expect(remove.classList.contains('sheetsmith-record-remove-armed')).toBe(true);
		expect(remove.getAttribute('aria-label')).toContain('Blessed Armour');
		expect(remove.getAttribute('aria-label')).toContain('Select again');
		remove.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(changes[0]).toEqual({ records: {}, removed: [1] });
	});

	it('stands down on Escape, on a press elsewhere, and on focus leaving', () => {
		const el = render();
		const remove = removeButtons(el)[0] as HTMLButtonElement;
		const arm = () => remove.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const armed = () => remove.classList.contains('sheetsmith-record-remove-armed');

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
		const [first, second] = removeButtons(el) as [HTMLButtonElement, HTMLButtonElement];
		first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		second.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(first.classList.contains('sheetsmith-record-remove-armed')).toBe(false);
		expect(second.classList.contains('sheetsmith-record-remove-armed')).toBe(true);
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
		const rows = source?.(makeFieldResolver(recordSet, config, data, NO_ENV)) ?? [];
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
		expect(evaluate('count(features, Attuned)', env.sheet, callsFrom(env))).toBe(1);
		expect(evaluate('sum(features, Uses)', env.sheet, callsFrom(env))).toBe(4);
		expect(evaluate('count(features)', env.sheet, callsFrom(env))).toBe(3);
	});

	it('gives an empty list 0 rather than a failure', () => {
		const layout: Layout = { name: 'L', components: [config] };
		const { env } = buildSheet(layout, [
			{ config, component: recordSet, data: null, error: null },
		]);
		expect(evaluate('count(features, Attuned)', env.sheet, callsFrom(env))).toBe(0);
		expect(evaluate('sum(features, Uses)', env.sheet, callsFrom(env))).toBe(0);
	});

	it('fails a name reaching for one record, whatever its capitalisation', () => {
		const layout: Layout = { name: 'L', components: [config] };
		const { env } = buildSheet(layout, [
			{ config, component: recordSet, data: readData(BODY), error: null },
		]);
		for (const name of ['features.Lucky', 'features.lucky', 'features.LUCKY']) {
			expect(() => evaluate(name, env.sheet, callsFrom(env))).toThrow();
		}
	});

	it('opens a computed field\'s formula on a press as well as a hover', () => {
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
		const value = el.querySelector('.sheetsmith-record-value') as HTMLElement;
		expect(value.classList.contains('sheetsmith-record-askable')).toBe(true);
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

	it('reads a computed field in the record\'s own scope', () => {
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
			recordSet.scopeRows?.(data, computed)?.(
				makeFieldResolver(recordSet, computed, data, NO_ENV),
			) ?? [];
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

	it('names the record and the component in the card\'s breakdown', () => {
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
			recordSet.scopeModifiers?.(data, config)?.(
				makeFieldResolver(recordSet, config, data, NO_ENV),
			) ?? [];
		expect(pushes).toHaveLength(1);
		expect(pushes[0]?.part).toBe('armour_class += 1 as item when Attuned');
		expect(pushes[0]?.source).toBe('Features');
		expect(pushes[0]?.row.label).toBe('Blessed Armour');
	});

	it('declares no source where no field is a modifier field', () => {
		const plain = { ...config, fields: [{ key: 'Uses', type: 'number' as const }] };
		expect(recordSet.scopeModifiers?.(readData(BODY, plain), plain)).toBeUndefined();
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
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
		expect(panel).not.toBeNull();
		typeInto(field(panel, 'Changes'), 'armour_class');
		expect(changes).toHaveLength(1);
		typeInto(field(panel, 'Amount'), '[[Ring of Protection]]');
		// Nothing new reached the note, and the record says why.
		expect(changes).toHaveLength(1);
		const said =
			records(el)[0]?.querySelector('.sheetsmith-error')?.textContent ?? '';
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
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
		const line = panel.querySelector<HTMLButtonElement>('.sheetsmith-panel-line');
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
			document.querySelector('.sheetsmith-panel-problem')?.textContent ?? '',
		).toContain('code block');

		// Not vacuous: the same control with a spellable name does reach the layout,
		// so what is asserted above is the refusal rather than a dead button.
		const again = document.querySelector<HTMLInputElement>(
			'.sheetsmith-panel-promote-row input',
		);
		if (again === null) throw new Error('no promote field');
		again.value = 'Ring of Protection';
		again.dispatchEvent(new Event('input'));
		document.querySelector<HTMLButtonElement>('.sheetsmith-panel-save')?.click();
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
		expect(readData(body).records[1]?.fields?.Modifiers).toContain('[[Ring');

		const glyph = records(el)[1]?.querySelector(
			'.sheetsmith-record-modifier',
		) as HTMLButtonElement;
		glyph.click();
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
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
				1: { fields: { Modifiers: 'armour_class += 2; [[Ring of Protection]]' } },
			},
		});
		expect(records(el)[1]?.querySelector('.sheetsmith-error')).toBeNull();
		// And the byte the reader did not touch comes back as its own text.
		expect(recordSet.write(changes[0] as RecordSetData, body, config)).toContain(
			'armour_class += 2; [[Ring of Protection]]',
		);
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
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
		panel.querySelector<HTMLButtonElement>('.sheetsmith-panel-line')?.click();
		typeInto(field(document.body, 'Amount'), '[[Ring]]');
		expect(changes).toEqual([]);
		const said =
			records(el)[1]?.querySelector('.sheetsmith-error')?.textContent ?? '';
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
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
		typeInto(field(panel, 'Changes'), 'armour_class');
		typeInto(field(panel, 'Amount'), '[[Ring]]');
		expect(records(el)[0]?.querySelector('.sheetsmith-error')).not.toBeNull();
		typeInto(field(panel, 'Amount'), '2');
		expect(records(el)[0]?.querySelector('.sheetsmith-error')).toBeNull();
		expect(changes[changes.length - 1]).toEqual({
			records: { 0: { fields: { Modifiers: 'armour_class += 2' } } },
		});
	});

	it('opens the shared anchored form on the glyph', () => {
		const el = render({}, BODY, {
			modifiers: {
				definitions: [],
				targets: [{ name: 'armour_class', label: 'Armour class' }],
				published: [{ name: 'armour_class', label: 'Armour class' }],
				bonusTypes: ['item'],
				outcome: () => ({
					definition: null,
					typed: {
						target: 'armour_class',
						operator: 'add',
						amount: '1',
						bonusType: 'item',
					},
					target: 'armour_class',
					targetLabel: 'Armour class',
					applies: true,
					amount: 1,
					condition: null,
					suppressed: null,
				}),
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
		const panel = document.querySelector('.sheetsmith-panel') as HTMLElement;
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
		expect(Object.values(after.records).map((one) => one.fields?.Uses)).toEqual([
			'3',
			'3',
			'3',
		]);
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
		expect(Object.values(after.records).map((one) => one.fields?.Uses)).toEqual([
			'0',
			'0',
			'0',
		]);
		expect(after.records[1]?.fields?.Attuned).toBe('no');
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

	it('writes a formula\'s number into every counter, and derives the flag', () => {
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
		expect(Object.values(filled.records).map((one) => one.fields?.Uses)).toEqual(
			['2', '2', '2'],
		);
		expect(filled.records[0]?.fields?.Attuned).toBe('yes');
	});

	it('holds a formula\'s number to each field\'s own bounds', () => {
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
			{ resolve: () => null, explain: () => "con is not defined on this sheet" },
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
				{ key: 'Rank', type: 'level', levels: ['Untrained', 'Trained:', 'Expert:★'] },
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
			expect(
				recordSet.write(result.data, body, graded),
			).toContain('Rank: 2');
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
	it('names its records from the layout\'s own word and says it is filler', () => {
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
		const ceilings = Object.values(shown).map(
			(one) => (one.fields?.Uses ?? '').split('/')[1]?.trim(),
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
