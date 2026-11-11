// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { RenameIntent } from '../component-rename-migration';
import { ListContext } from './list-fields';
import { renderZonesField } from './zones-field';

/*
 * A Stat block's Zones field (`docs/features/stat-block-zones.md`, The zone
 * editor), driven directly: its own entry point and its own reportable output,
 * so a file of its own under `docs/PATTERNS.md` §10's `editor/` rule.
 */

let persisted: (RenameIntent | undefined)[];
let list: ListContext;

beforeEach(() => {
	persisted = [];
	list = {
		persist: (rename) => {
			persisted.push(rename);
		},
		redraw: () => undefined,
		focusAfterRedraw: () => undefined,
		confirm: (_message, _cta, onConfirm) => onConfirm(),
		errors: new Map(),
		drag: { index: null },
	};
});

function draw(
	zones: unknown[] | undefined,
	more: Record<string, unknown> = {},
	references?: readonly string[],
): { el: HTMLElement; record: Record<string, unknown> } {
	const record: Record<string, unknown> = { id: 'forms', label: 'Wild Shape', ...(zones === undefined ? {} : { zones }), ...more };
	const el = document.createElement('div');
	document.body.replaceChildren(el);
	renderZonesField(el, record, 'zones', 'forms', list, 'record', references);
	return { el, record };
}

const ZONES = () => [
	{ key: 'vitals' },
	{ key: 'attacks', type: 'table', heading: 'Attacks', columns: [{ key: 'Attack' }, { key: 'Bonus', type: 'number' }] },
	{ key: 'actions', type: 'features', heading: 'Actions' },
	{ key: 'traits', type: 'text', heading: 'Traits', collapsed: true },
];

function commit(input: HTMLInputElement | HTMLSelectElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('change'));
}

describe('each zone as a stacked card', () => {
	it('draws key and type, heading, then what the type adds', () => {
		const { el } = draw(ZONES());
		const cards = Array.from(el.querySelectorAll('.sheetsmith-zone-card'));
		expect(cards).toHaveLength(4);
		const labels = (card: Element) =>
			Array.from(card.querySelectorAll('.sheetsmith-position-label')).map((one) => one.textContent);
		expect(labels(cards[1] as Element).slice(0, 3)).toEqual(['Key', 'Type', 'Heading']);
		expect(cards[1]?.querySelector('.sheetsmith-nested-label')?.textContent).toBe('Columns');
		expect(cards[2]?.querySelector('.sheetsmith-nested-list, input[type="checkbox"]')).toBeNull();
		expect(cards[3]?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
		expect(cards[3]?.querySelector('.sheetsmith-entry-check')?.textContent).toBe('Collapsed');
		// Line three by type: never on the heading's own line.
		const headingLine = cards[3]?.querySelector('[aria-label="traits heading"]')?.closest('.sheetsmith-zone-detail');
		expect(headingLine?.querySelector('input[type="checkbox"]')).toBeNull();
	});

	it('shows a built-in as Built in, with no type select and no remove', () => {
		const { el } = draw(ZONES());
		const vitals = el.querySelector('.sheetsmith-zone-card') as HTMLElement;
		expect(vitals.querySelector('select')).toBeNull();
		expect(vitals.querySelector('[aria-label^="Remove"]')).toBeNull();
		// Its key is drawn as text, as its type is: a built-in's key is not editable.
		expect(vitals.querySelector('input[aria-label="Zone 1 key"]')).toBeNull();
		expect(Array.from(vitals.querySelectorAll('.sheetsmith-zone-built-in')).map((one) => one.textContent)).toEqual([
			'vitals',
			'Built in',
		]);
		const attacks = el.querySelectorAll('.sheetsmith-zone-card')[1] as HTMLElement;
		expect(attacks.querySelector('[aria-label="Remove attacks"]')).not.toBeNull();
		expect(vitals.querySelector<HTMLInputElement>('[aria-label="vitals heading"]')?.placeholder).toBe('None');
		const { el: withChanges } = draw([{ key: 'changes' }]);
		expect(withChanges.querySelector<HTMLInputElement>('[aria-label="changes heading"]')?.placeholder).toBe(
			"Each modifier field's name",
		);
	});
});

describe('a commit', () => {
	it('carries a heading rename into the notes, and a key rename into none', () => {
		const { el, record } = draw(ZONES());
		const traits = el.querySelectorAll('.sheetsmith-zone-card')[3] as HTMLElement;
		commit(traits.querySelector<HTMLInputElement>('[aria-label="traits heading"]') as HTMLInputElement, 'Features');
		expect(persisted).toEqual([{ kind: 'heading', label: 'Wild Shape', from: 'Traits', to: 'Features' }]);
		commit(traits.querySelector<HTMLInputElement>('[aria-label="Zone 4 key"]') as HTMLInputElement, 'features');
		expect(persisted[1]).toBeUndefined();
		expect((record.zones as { key: string }[])[3]?.key).toBe('features');
	});

	it('refuses a heading another zone reads the same as, and keeps the stored one', () => {
		const { el, record } = draw(ZONES());
		const traits = el.querySelectorAll('.sheetsmith-zone-card')[3] as HTMLElement;
		const heading = traits.querySelector<HTMLInputElement>('[aria-label="traits heading"]') as HTMLInputElement;
		commit(heading, 'actions:');
		expect(persisted).toEqual([]);
		expect(heading.value).toBe('Traits');
		expect((record.zones as { heading: string }[])[3]?.heading).toBe('Traits');
	});

	it('reorders a table zone\'s columns with the nested arrows', () => {
		const { el, record } = draw(ZONES());
		const attacks = el.querySelectorAll('.sheetsmith-zone-card')[1] as HTMLElement;
		attacks.querySelector<HTMLButtonElement>('[aria-label="Move Bonus up"]')?.click();
		const columns = (record.zones as { columns?: { key: string }[] }[])[1]?.columns ?? [];
		expect(columns.map((column) => column.key)).toEqual(['Bonus', 'Attack']);
	});

	it('adds a text zone headed Notes after the blank list\'s own reading', () => {
		const { el, record } = draw(undefined);
		el.querySelector<HTMLButtonElement>('.sheetsmith-entry-footer button')?.click();
		expect(record.zones).toEqual([
			{ key: 'vitals' },
			{ key: 'changes' },
			{ key: 'details', type: 'text', heading: 'Details', collapsed: true },
			{ key: 'zone', type: 'text', heading: 'Notes' },
		]);
	});

	it('names a second added zone apart from the first', () => {
		const { record } = draw(ZONES());
		const add = () =>
			Array.from(document.querySelectorAll<HTMLButtonElement>('.sheetsmith-entry-footer button'))
				.find((button) => button.textContent === 'Add zone')
				?.click();
		add();
		draw(record.zones as unknown[]);
		add();
		const zones = record.zones as { key: string; heading?: string }[];
		expect(zones.slice(-2)).toEqual([
			{ key: 'zone', type: 'text', heading: 'Notes' },
			{ key: 'zone_2', type: 'text', heading: 'Notes 2' },
		]);
	});

	it('drops collapsed when a text zone becomes another type', () => {
		const { el, record } = draw(ZONES());
		const traits = el.querySelectorAll('.sheetsmith-zone-card')[3] as HTMLElement;
		commit(traits.querySelector('select') as HTMLSelectElement, 'features');
		expect((record.zones as { collapsed?: boolean }[])[3]?.collapsed).toBeUndefined();
	});

	it('gives a zone switched to a table a column naming its rows', () => {
		const { el, record } = draw(ZONES());
		const actions = el.querySelectorAll('.sheetsmith-zone-card')[2] as HTMLElement;
		commit(actions.querySelector('select') as HTMLSelectElement, 'table');
		expect((record.zones as { columns?: unknown[] }[])[2]?.columns).toEqual([{ key: 'Name' }]);
	});

	it('removes a body zone with a confirmation and carries no rename into the notes', () => {
		const { el, record } = draw(ZONES());
		el.querySelector<HTMLButtonElement>('[aria-label="Remove actions"]')?.click();
		expect((record.zones as { key: string }[]).map((zone) => zone.key)).toEqual(['vitals', 'attacks', 'traits']);
		expect(persisted).toEqual([undefined]);
	});
});

/*
 * `keyReferences` (`docs/features/stat-block-brief-zone.md`): a sibling key
 * holding a zone's key follows a re-key and goes with the zone, in the one
 * persist the commit makes, so the layout never names a zone it lost.
 */
describe('a sibling key naming a zone', () => {
	const card = (el: HTMLElement, at: number) => el.querySelectorAll('.sheetsmith-zone-card')[at] as HTMLElement;

	it('follows the zone\'s re-key, matched trimmed and without case, in the same persist', () => {
		const { el, record } = draw(ZONES(), { briefZone: ' Attacks ' }, ['briefZone']);
		commit(card(el, 1).querySelector<HTMLInputElement>('[aria-label="Zone 2 key"]') as HTMLInputElement, 'hits');
		expect(record.briefZone).toBe('hits');
		expect(persisted).toEqual([undefined]);
	});

	it('leaves a key naming another zone, and a refused re-key, as they were', () => {
		const { el, record } = draw(ZONES(), { briefZone: 'attacks' }, ['briefZone']);
		commit(card(el, 2).querySelector<HTMLInputElement>('[aria-label="Zone 3 key"]') as HTMLInputElement, 'deeds');
		expect(record.briefZone).toBe('attacks');
		commit(card(el, 1).querySelector<HTMLInputElement>('[aria-label="Zone 2 key"]') as HTMLInputElement, 'traits');
		expect(record.briefZone).toBe('attacks');
	});

	it('is cleared when the zone it names is removed, in the same persist', () => {
		const { el, record } = draw(ZONES(), { briefZone: 'attacks' }, ['briefZone']);
		el.querySelector<HTMLButtonElement>('[aria-label="Remove attacks"]')?.click();
		expect('briefZone' in record).toBe(false);
		expect((record.zones as { key: string }[]).map((zone) => zone.key)).toEqual(['vitals', 'actions', 'traits']);
		expect(persisted).toEqual([undefined]);
	});

	it('is kept when another zone is removed', () => {
		const { el, record } = draw(ZONES(), { briefZone: 'attacks' }, ['briefZone']);
		el.querySelector<HTMLButtonElement>('[aria-label="Remove actions"]')?.click();
		expect(record.briefZone).toBe('attacks');
	});

	it('touches nothing where the field declares no references', () => {
		const { el, record } = draw(ZONES(), { briefZone: 'attacks' });
		commit(card(el, 1).querySelector<HTMLInputElement>('[aria-label="Zone 2 key"]') as HTMLInputElement, 'hits');
		expect(record.briefZone).toBe('attacks');
	});
});
