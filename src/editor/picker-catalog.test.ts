import { describe, expect, it } from 'vitest';
import {
	filterCatalog,
	noMatchMessage,
	pickerCatalog,
	SHAPE_WORDS,
} from './picker-catalog';
import { getComponent, listComponentTypes, paletteEntries } from '../components';

/*
 * The component picker's catalog and its search
 * (`docs/features/component-picker.md` §4, §11), without a pane.
 *
 * Expected values come from the registry rather than from `pickerCatalog`,
 * which is the thing under test: derived from it, a case would only assert that
 * a function equals itself.
 */

const values = (query: string): string[] =>
	filterCatalog(pickerCatalog(), query).map((choice) => choice.value);

describe('the picker catalog', () => {
	it('runs each type, then every entry of it, then the next type', () => {
		expect(pickerCatalog().map((choice) => choice.value)).toEqual(
			listComponentTypes().flatMap((type) => [
				type,
				...paletteEntries(type).map((_entry, index) => `${type}:${index}`),
			]),
		);
	});

	it('names a type by its display name and an entry by its own, each with its sentence', () => {
		const catalog = pickerCatalog();
		const track = catalog.find((choice) => choice.value === 'track');
		expect(track).toMatchObject({
			name: 'Track',
			entry: false,
			description: getComponent('track')?.description,
		});
		const checkbox = catalog.find((choice) => choice.value === 'track:0');
		expect(checkbox).toMatchObject({
			name: paletteEntries('track')[0]?.name,
			entry: true,
			description: paletteEntries('track')[0]?.description,
		});
	});

	it('inserts nothing for a bare type, never its example', () => {
		// The example is drawn and never written, which is why the picker labels
		// it; the catalog is what an insert reads.
		for (const choice of pickerCatalog().filter((line) => !line.entry)) {
			expect(choice.config, choice.type).toEqual({});
		}
		expect(getComponent('track')?.example).toBeDefined();
	});
});

describe('searching the picker', () => {
	it('shows the whole catalog for an empty or blank query', () => {
		const all = pickerCatalog().map((choice) => choice.value);
		expect(values('')).toEqual(all);
		expect(values('   ')).toEqual(all);
	});

	it('matches without regard to case, over the name and the description', () => {
		expect(values('TRACK')).toEqual(values('track'));
		// "boxes" is in Track's description and in no name.
		expect(values('boxes')).toContain('track');
		expect(getComponent('track')?.description).toContain('boxes');
	});

	it('requires every term', () => {
		// Each term alone finds a line the pair does not.
		expect(values('picture')).toContain('image');
		expect(values('picture')).toContain('passport');
		expect(values('picture headline')).not.toContain('image');
		expect(values('picture headline')).toContain('passport');
	});

	it('shows a matching type with its whole block', () => {
		// "Table" matches the type, so Inventory and Conditions come with it
		// though neither says "table".
		const table = pickerCatalog()
			.filter((choice) => choice.type === 'table')
			.map((choice) => choice.value);
		expect(table.length).toBeGreaterThan(1);
		const shown = values('named rows under typed columns');
		expect(shown).toEqual(table);
	});

	it('shows a matching entry under its type, and only that entry', () => {
		// `inventory` names a job, which an entry may and a type may not.
		expect(values('inventory')).toEqual(['table', 'table:0']);
	});

	it('finds nothing for a job word no description says', () => {
		expect(values('stress')).toEqual([]);
	});

	it('finds at least one line for every shape word the empty state offers', () => {
		expect(SHAPE_WORDS.length).toBeGreaterThan(0);
		for (const word of SHAPE_WORDS) {
			expect(values(word), word).not.toEqual([]);
		}
	});

	it('names the query and the shape words when nothing matches', () => {
		const message = noMatchMessage(' stress ');
		expect(message).toBe(
			'Nothing matches "stress". Search by shape: number, boxes, list, table, picture, text.',
		);
	});
});
