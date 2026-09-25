// @vitest-environment happy-dom
/*
 * What a component does with a section another component left behind
 * (`docs/features/new-component-adopts-retained-section.md`, Design §3).
 *
 * SPEC §10 keeps a removed component's `##` section in every note, and the sheet
 * finds a component's section by label alone (`getSection(note, config.label)`
 * in `sheet-view.ts`). So a component inserted, pasted or relabelled onto a kept
 * label reads that old body as its own. These cases pin what each pairing then
 * does, and they started as the probe that settled the model question: a
 * component of a different storage kind never loses a byte, and data is lost
 * only where the old body reads successfully as the new component's own.
 *
 * Three outcomes, and each case says which it pins:
 *
 * - **Kept.** A fenced write into a body with no fence appends one; a table
 *   write into a body with no table appends one. Every other byte stays.
 * - **Refused.** Rich text and Image own their whole body and replace it on a
 *   write, so each refuses to read a body its own gesture could never have
 *   written: the cell draws an error, no control, and nothing reaches the file.
 * - **Residue.** Two fenced components storing the same key, and a whole-body
 *   component reading text its own gesture could have written. No guard can see
 *   either, and the layout editor's adoption notice is what covers them
 *   (`section-adoption.ts`). The case pins that the edit rewrites the one line
 *   and nothing else.
 *
 * Driven through a real `SheetView` rather than a mirror of `renderSheet`
 * (BACKLOG § Patterns, the five-mirror row): the note is parsed, the section is
 * found and read, the component renders into the grid, a real control on it is
 * pressed, and the edit goes through `applyEdits` → `applySectionWrites` →
 * `component.write` → `serialiseCharacter` into the view's data. What is
 * asserted is the view's text afterwards, which is what the next save writes.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { SheetView } from './sheet-view';
import { App, TextFileView } from '../test/obsidian-stub';
import { fakePlugin, LAYOUT_FOLDER } from '../test/plugin';
import { openView } from '../test/workspace';

/** One turn of the loop, which a render started and not awaited needs. */
const settle = () => new Promise((resolve) => window.setTimeout(resolve, 0));

/** Longer than `GESTURE_COMMIT`, which a Track step waits out before writing. */
const gestureCommit = () => new Promise((resolve) => window.setTimeout(resolve, 900));

/** A note on layout `L` holding each `## label` section with its body, in order. */
function note(...sections: readonly [label: string, body: string][]): string {
	return [
		'---',
		'sheet-layout: L',
		'---',
		'',
		...sections.map(([label, body]) => `## ${label}\n${body}`),
	].join('\n');
}

/**
 * Open a sheet on `text`, whose layout holds the components given, one above
 * the next. `layout` carries anything else the layout declares.
 */
async function sheetOn(
	components: Record<string, unknown> | readonly Record<string, unknown>[],
	text: string,
	layout: Record<string, unknown> = {},
): Promise<{ view: SheetView; cell: HTMLElement }> {
	const list: readonly Record<string, unknown>[] = Array.isArray(components)
		? (components as readonly Record<string, unknown>[])
		: [components as Record<string, unknown>];
	const app = new App();
	await app.vault.createFolder(LAYOUT_FOLDER);
	await app.vault.create(
		`${LAYOUT_FOLDER}/L.json`,
		JSON.stringify({
			name: 'L',
			components: list.map((component, index) => ({
				position: { col: 1, row: 1 + index * 3, width: 6, height: 3 },
				...component,
			})),
			...layout,
		}),
	);
	const file = await app.vault.create('Character.md', text);
	const view = await openView(app, document.body, SheetView, fakePlugin(app));
	await (view as unknown as TextFileView).onLoadFile(file);
	await settle();
	return { view, cell: view.containerEl };
}

/** The error a cell drew in place of its component, or null. */
const errorOf = (cell: HTMLElement): string | null =>
	cell.querySelector('.sheetsmith-cell-error .sheetsmith-error')?.textContent ??
	null;

/** Type into a field and commit it by blur, the editing gesture. */
function commitField(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
	input.focus();
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	input.dispatchEvent(new Event('blur'));
}

/** Press **Long rest**, confirm it, and let the render settle. */
async function longRest(view: SheetView): Promise<void> {
	const root = (view as unknown as { contentEl: HTMLElement }).contentEl;
	const button = Array.from(root.querySelectorAll('button.sheetsmith-trigger')).find(
		(one) => one.textContent === 'Long rest',
	) as HTMLButtonElement;
	button.click();
	(document.body.querySelector('.modal-container .mod-warning') as HTMLButtonElement).click();
	await settle();
}

/** Everything after the kept heading, up to the next one. */
function bodyAfter(text: string, label: string): string {
	const start = text.indexOf(`## ${label}\n`) + `## ${label}\n`.length;
	const next = text.indexOf('\n## ', start);
	return next === -1 ? text.slice(start) : text.slice(start, next + 1);
}

afterEach(() => {
	document.body.replaceChildren();
});

// ---------------------------------------------------------------------------
// Old bodies, each as the removed component wrote it.

/** A removed Card set's section: fenced YAML, one entry per ability. */
const CARD_SET_BODY = '```sheet\nSTR: 10\nDEX: 14\n```\n';

/** A removed Track's section: one run at 5. */
const TRACK_BODY = '```sheet\nvalue: 5\n```\n';

/** A removed Table's section: a markdown table carrying a wikilink. */
const TABLE_BODY =
	'\n| Name | Qty |\n|---|---|\n| [[Rope]] | 1 |\n| Torch | 3 |\n';

/** A removed Rich text's section: prose with a wikilink. */
const PROSE_BODY = '\nRaised in [[Waterdeep]] by the harbourmaster.\n';

/** Two paragraphs, which only a Rich text writes. */
const TWO_PARAGRAPHS = '\nRaised in [[Waterdeep]].\n\nBy the harbourmaster.\n';

/** Prose carrying `### ` headings, which Rich text's own refusal recommends. */
const HEADED_PROSE = '\n### Childhood\nBy the sea.\n\n### Exile\nInland.\n';

/** A removed Card's section: a fenced scalar with its note. */
const CARD_BODY = '```sheet\nvalue: 15\nnote: chain mail\n```\n';

const RICH_TEXT_REFUSAL =
	"Armour class: This section holds a sheet block, which is a component's data rather than text. Move it out of this section in the note, or rename this component in the layout.";

const IMAGE_REFUSAL =
	'Portrait: This section holds more than one line, and a picture is one embed. Move the rest out of this section in the note, or rename this component in the layout.';

// ---------------------------------------------------------------------------

describe('kept: a Table adopting a removed Card set’s fenced section', () => {
	const TABLE = {
		id: 'gear',
		type: 'table',
		label: 'Abilities',
		columns: [{ key: 'Weight', type: 'number' }],
		rows: [{ label: 'Rope' }],
	};

	it('reads the fence as no table: an editable empty table, no error', async () => {
		const { cell } = await sheetOn(TABLE, note(['Abilities', CARD_SET_BODY]));
		expect(errorOf(cell)).toBeNull();
		expect(
			cell.querySelector<HTMLInputElement>('input[aria-label="Rope Weight"]')?.value,
		).toBe('');
	});

	it('keeps the old fence byte for byte through the first edit', async () => {
		const { view, cell } = await sheetOn(TABLE, note(['Abilities', CARD_SET_BODY]));
		const input = cell.querySelector<HTMLInputElement>(
			'input[aria-label="Rope Weight"]',
		);
		expect(input).not.toBeNull();
		commitField(input!, '2');
		const after = view.getViewData();
		expect(after).not.toBe(note(['Abilities', CARD_SET_BODY]));
		expect(bodyAfter(after, 'Abilities')).toContain(CARD_SET_BODY);
	});
});

describe('residue: a Card adopting a removed Track’s section, both storing `value`', () => {
	const CARD = { id: 'ac', type: 'card', label: 'Hit dice' };

	it('reads the Track’s value as its own, which is the case the adoption notice covers', async () => {
		const { cell } = await sheetOn(CARD, note(['Hit dice', TRACK_BODY]));
		expect(errorOf(cell)).toBeNull();
		expect(cell.querySelector<HTMLInputElement>('.sheetsmith-card-input')?.value).toBe(
			'5',
		);
	});

	it('rewrites the `value` line on the first edit and nothing else', async () => {
		const { view, cell } = await sheetOn(CARD, note(['Hit dice', TRACK_BODY]));
		const input = cell.querySelector<HTMLInputElement>('.sheetsmith-card-input');
		expect(input).not.toBeNull();
		commitField(input!, '17');
		// Nothing in the note says the 5 was a Track's, so no guard could keep
		// it: the edit is an ordinary edit of an ordinary value.
		expect(view.getViewData()).toBe(
			note(['Hit dice', TRACK_BODY.replace('value: 5', 'value: 17')]),
		);
	});
});

describe('kept: a fenced scalar adopting a link-bearing section', () => {
	const CARD = { id: 'ac', type: 'card', label: 'Inventory' };

	it('a Card reads a Table body as no fence: an editable empty card', async () => {
		const { cell } = await sheetOn(CARD, note(['Inventory', TABLE_BODY]));
		expect(errorOf(cell)).toBeNull();
		expect(cell.querySelector<HTMLInputElement>('.sheetsmith-card-input')?.value).toBe(
			'',
		);
	});

	it('a Card keeps a Table body byte for byte through the first edit', async () => {
		const { view, cell } = await sheetOn(CARD, note(['Inventory', TABLE_BODY]));
		commitField(cell.querySelector<HTMLInputElement>('.sheetsmith-card-input')!, '17');
		const after = view.getViewData();
		expect(after).not.toBe(note(['Inventory', TABLE_BODY]));
		expect(bodyAfter(after, 'Inventory')).toContain(TABLE_BODY.trim());
		// Constraint 2 by the by: the wikilink must not have ended up in a fence.
		expect(after).not.toMatch(/```sheet[^`]*\[\[Rope\]\]/);
	});

	it('a Card keeps Rich text prose byte for byte through the first edit', async () => {
		const CARD_ON_PROSE = { ...CARD, label: 'Backstory' };
		const { view, cell } = await sheetOn(CARD_ON_PROSE, note(['Backstory', PROSE_BODY]));
		expect(errorOf(cell)).toBeNull();
		commitField(cell.querySelector<HTMLInputElement>('.sheetsmith-card-input')!, '17');
		const after = view.getViewData();
		expect(after).not.toBe(note(['Backstory', PROSE_BODY]));
		expect(bodyAfter(after, 'Backstory')).toContain(PROSE_BODY.trim());
	});
});

describe('refused: Rich text adopting a removed Card’s fenced section', () => {
	const STORY = { id: 'story', type: 'rich-text', label: 'Armour class' };
	const CARD = { id: 'hp', type: 'card', label: 'Hit points' };

	it('reads the fence as malformed, and says what to do', async () => {
		const { cell } = await sheetOn(STORY, note(['Armour class', CARD_BODY]));
		expect(errorOf(cell)).toBe(RICH_TEXT_REFUSAL);
	});

	it('draws no field to edit', async () => {
		const { cell } = await sheetOn(STORY, note(['Armour class', CARD_BODY]));
		expect(cell.querySelector('.sheetsmith-rich-text-input')).toBeNull();
	});

	it('leaves the section byte-identical through an edit elsewhere on the sheet', async () => {
		const source = note(['Armour class', CARD_BODY], ['Hit points', '```sheet\nvalue: 8\n```\n']);
		const { view, cell } = await sheetOn([STORY, CARD], source);
		commitField(cell.querySelector<HTMLInputElement>('.sheetsmith-card-input')!, '9');
		expect(view.getViewData()).toBe(source.replace('value: 8', 'value: 9'));
	});

	it('leaves the section byte-identical through a reset trigger', async () => {
		// Triggers already pass over a failed read (`renderTriggers`); pinned here
		// for the guard's own case, beside a pool the rest does reset.
		const source = note(['Armour class', CARD_BODY], ['Hit points', '```sheet\ncurrent: 4\n```\n']);
		const { view } = await sheetOn(
			[
				STORY,
				{
					id: 'hp',
					type: 'pool',
					label: 'Hit points',
					max: '10',
					reset: [{ trigger: 'Long rest', action: 'full' }],
				},
			],
			source,
			{ triggers: ['Long rest'] },
		);
		await longRest(view);
		const after = view.getViewData();
		expect(after).not.toBe(source);
		expect(bodyAfter(after, 'Armour class')).toBe(bodyAfter(source, 'Armour class'));
		expect(bodyAfter(source, 'Armour class')).toContain(CARD_BODY);
	});
});

describe('refused: Rich text’s own box, typed a sheet block', () => {
	it('answers "Not saved", keeps the draft, and leaves the note unchanged', async () => {
		const source = note(['Backstory', PROSE_BODY]);
		const { view, cell } = await sheetOn(
			{ id: 'story', type: 'rich-text', label: 'Backstory' },
			source,
		);
		const field = cell.querySelector<HTMLTextAreaElement>('.sheetsmith-rich-text-input')!;
		commitField(field, `${field.value}\n\n\`\`\`sheet\nvalue: 3\n\`\`\``);
		expect(cell.querySelector('.sheetsmith-rich-text .sheetsmith-error')?.textContent).toBe(
			'Not saved. "```sheet" would start a block of sheet data in this note — name the code block something else.',
		);
		expect(field.value).toContain('```sheet');
		expect(view.getViewData()).toBe(source);
	});
});

describe('kept: a Table adopting a fenced scalar or another Table', () => {
	const TABLE = {
		id: 'gear',
		type: 'table',
		label: 'Armour class',
		columns: [{ key: 'Weight', type: 'number' }],
		rows: [{ label: 'Rope' }],
	};

	it('reads a fenced scalar body as no table, with no error', async () => {
		const { cell } = await sheetOn(TABLE, note(['Armour class', CARD_BODY]));
		expect(errorOf(cell)).toBeNull();
	});

	it('keeps a fenced scalar body through the first edit', async () => {
		const { view, cell } = await sheetOn(TABLE, note(['Armour class', CARD_BODY]));
		commitField(
			cell.querySelector<HTMLInputElement>('input[aria-label="Rope Weight"]')!,
			'2',
		);
		const after = view.getViewData();
		expect(after).not.toBe(note(['Armour class', CARD_BODY]));
		expect(bodyAfter(after, 'Armour class')).toContain(CARD_BODY);
	});

	it('keeps another Table’s rows and columns through the first edit', async () => {
		// Link-bearing onto link-bearing, of a different shape: the old table's
		// `Qty` column and its two rows are nothing this Table declares.
		const { view, cell } = await sheetOn(
			{ ...TABLE, label: 'Inventory', rows: [{ label: 'Lantern' }] },
			note(['Inventory', TABLE_BODY]),
		);
		expect(errorOf(cell)).toBeNull();
		// A fixed-row Table draws only its declared row. The old rows match no
		// declaration, so they neither draw nor are addressable.
		const shown = Array.from(cell.querySelectorAll<HTMLInputElement>('input')).map(
			(input) => input.getAttribute('aria-label'),
		);
		expect(shown).toEqual(['Lantern Weight']);
		commitField(
			cell.querySelector<HTMLInputElement>('input[aria-label="Lantern Weight"]')!,
			'2',
		);
		const after = bodyAfter(view.getViewData(), 'Inventory');
		expect(after).toMatch(/\|\s*Qty\s*\|/);
		expect(after).toMatch(/\[\[Rope\]\]\s*\|\s*1\s*\|/);
		expect(after).toMatch(/Torch\s*\|\s*3\s*\|/);
	});
});

describe('Image adopting another component’s section', () => {
	const PORTRAIT = { id: 'portrait', type: 'image', label: 'Portrait' };

	it.each([
		['a Card’s fence', CARD_BODY],
		['a Table', TABLE_BODY],
		['two paragraphs of prose', TWO_PARAGRAPHS],
	])('refused: reads %s as malformed and draws no field', async (_name, body) => {
		const { cell } = await sheetOn(PORTRAIT, note(['Portrait', body]));
		expect(errorOf(cell)).toBe(IMAGE_REFUSAL);
		expect(cell.querySelector('.sheetsmith-image-input')).toBeNull();
	});

	it('refused: leaves the section byte-identical through a reset trigger', async () => {
		// Rich text's case above, for the other guard.
		const source = note(['Portrait', CARD_BODY], ['Hit points', '```sheet\ncurrent: 4\n```\n']);
		const { view } = await sheetOn(
			[
				PORTRAIT,
				{
					id: 'hp',
					type: 'pool',
					label: 'Hit points',
					max: '10',
					reset: [{ trigger: 'Long rest', action: 'full' }],
				},
			],
			source,
			{ triggers: ['Long rest'] },
		);
		await longRest(view);
		const after = view.getViewData();
		expect(after).not.toBe(source);
		expect(bodyAfter(after, 'Portrait')).toBe(bodyAfter(source, 'Portrait'));
		expect(bodyAfter(source, 'Portrait')).toContain(CARD_BODY);
	});

	it('residue: reads one line of prose, and draws its reason in the frame', async () => {
		// The state the reader's own typing reaches, so it cannot be refused: the
		// next commit replaces the line, and the adoption notice is what covers it.
		const { cell } = await sheetOn(PORTRAIT, note(['Portrait', PROSE_BODY]));
		expect(errorOf(cell)).toBeNull();
		expect(cell.querySelector<HTMLInputElement>('.sheetsmith-image-input')?.value).toBe(
			PROSE_BODY.trim(),
		);
		expect(cell.querySelector('.sheetsmith-image-frame .sheetsmith-error')).not.toBeNull();
	});

	it('reads an empty section as an editable empty frame', async () => {
		const { cell } = await sheetOn(PORTRAIT, note(['Portrait', '\n']));
		expect(errorOf(cell)).toBeNull();
		expect(cell.querySelector<HTMLInputElement>('.sheetsmith-image-input')?.value).toBe('');
	});
});

describe('Record set adopting another component’s section', () => {
	const FEATURES = {
		id: 'features',
		type: 'record-set',
		label: 'Features',
		recordName: 'Feature',
		fields: [{ key: 'Uses', type: 'number' }],
	};

	/** Press **Add feature**, the one ordinary edit a set with no records offers. */
	function addRecord(cell: HTMLElement): void {
		cell
			.querySelector<HTMLButtonElement>('.sheetsmith-record-add')!
			.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	}

	it.each([
		['a Card’s fence', CARD_BODY],
		['prose with no `### ` heading', TWO_PARAGRAPHS],
	])('kept: holds %s as its preamble through adding a record', async (_name, body) => {
		const { view, cell } = await sheetOn(FEATURES, note(['Features', body]));
		expect(errorOf(cell)).toBeNull();
		addRecord(cell);
		const after = bodyAfter(view.getViewData(), 'Features');
		expect(after).not.toBe(body);
		expect(after.startsWith(body.trimEnd())).toBe(true);
		expect(after).toContain('### Feature');
	});

	it('residue: reads prose with `### ` headings as records', async () => {
		// The whole-body problem inside one record: removing such a record removes
		// its prose, and nothing can tell a heading the reader wrote as prose from
		// a record this set wrote.
		const { cell } = await sheetOn(FEATURES, note(['Features', HEADED_PROSE]));
		expect(errorOf(cell)).toBeNull();
		expect(
			Array.from(cell.querySelectorAll<HTMLInputElement>('.sheetsmith-record-name-input')).map(
				(input) => input.value,
			),
		).toEqual(['Childhood', 'Exile']);
	});
});

describe('residue: a Track adopting another Track’s section, with a different count', () => {
	// The removed Track ran to 6 and stood at 5; the new one runs to 3.
	const TRACK = { id: 'stress', type: 'track', label: 'Hit dice', count: 3 };

	it('shows the old value as its own, clamped to its own count, with nothing said', async () => {
		// The stored 5 draws as a full run of 3, which is the Track's ordinary
		// rule for a value above its run.
		const { cell } = await sheetOn(TRACK, note(['Hit dice', TRACK_BODY]));
		expect(errorOf(cell)).toBeNull();
		const run = cell.querySelector<HTMLElement>('.sheetsmith-track-run');
		expect(run?.getAttribute('aria-valuenow')).toBe('3');
		expect(run?.getAttribute('aria-valuemax')).toBe('3');
	});

	it('rewrites the `value` line on the first step and nothing else', async () => {
		// Losing the 5 here is also a Track lowered below its stored value with
		// no adoption at all, which the feature doc defers as its own defect.
		const { view, cell } = await sheetOn(TRACK, note(['Hit dice', TRACK_BODY]));
		const run = cell.querySelector<HTMLElement>('.sheetsmith-track-run')!;
		run.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }),
		);
		await gestureCommit();
		const after = view.getViewData();
		expect(after).not.toBe(note(['Hit dice', TRACK_BODY]));
		expect(after).toMatch(
			new RegExp(`^${escape(note(['Hit dice', '```sheet\nvalue: ']))}\\d\n\`\`\`\n$`),
		);
	});
});

/** A string as a literal pattern. */
function escape(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
