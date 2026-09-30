import { describe, expect, it } from 'vitest';
import {
	ComponentCopy,
	encodeComponentCopy,
	fnv1a32,
	layoutFingerprint,
	NEWER_COMPONENT,
	NO_COMPONENT,
	readComponentCopy,
} from './component-clipboard';

function copy(overrides: Partial<ComponentCopy> = {}): ComponentCopy {
	return {
		from: { layout: '5e 2014', fingerprint: layoutFingerprint('Campaigns', 'Layouts/5e 2014.sheetsmith') },
		component: {
			id: 'hit_dice',
			type: 'track',
			label: 'Hit dice',
			position: { col: 1, row: 1, width: 3, height: 1 },
			reset: [{ trigger: 'long rest', action: 'formula', to: 'floor(count / 2)' }],
		},
		context: {
			functions: { mod: 'mod(score) = floor((score - 10) / 2)' },
			definitions: [{ name: 'Ring of protection', targets: ['Armour class'] }],
		},
		...overrides,
	};
}

describe('layoutFingerprint', () => {
	it('is FNV-1a 32-bit, pinned to published vectors', () => {
		expect(fnv1a32('')).toBe('811c9dc5');
		expect(fnv1a32('a')).toBe('e40c292c');
		expect(fnv1a32('foobar')).toBe('bf9cf968');
	});

	it('hashes the vault name and the path with a separator between', () => {
		expect(layoutFingerprint('Campaigns', 'a.sheetsmith')).toBe(
			fnv1a32('Campaigns\u0000a.sheetsmith'),
		);
	});

	it('is eight lowercase hex digits, stable, and moves when either half does', () => {
		const one = layoutFingerprint('Campaigns', 'Layouts/5e.sheetsmith');
		expect(one).toMatch(/^[0-9a-f]{8}$/);
		expect(layoutFingerprint('Campaigns', 'Layouts/5e.sheetsmith')).toBe(one);
		expect(layoutFingerprint('Campaign', 'Layouts/5e.sheetsmith')).not.toBe(one);
		expect(layoutFingerprint('Campaigns', 'Layouts/5e 2.sheetsmith')).not.toBe(one);
		// The separator is what keeps the halves from running into each other.
		expect(layoutFingerprint('ab', 'c')).not.toBe(layoutFingerprint('a', 'bc'));
	});
});

describe('encodeComponentCopy and readComponentCopy', () => {
	it('writes a versioned, tab-indented wrapper that reads back as it was', () => {
		const text = encodeComponentCopy(copy());
		expect(text.startsWith('{\n\t"sheetsmith": "component",\n\t"version": 1,')).toBe(true);
		const read = readComponentCopy(text);
		expect(read).toEqual({ ok: true, copy: copy() });
	});

	it('refuses text that is not a wrapper, or is empty', () => {
		for (const text of ['', 'hello', '{"component": {}}', '[1]', '{"sheetsmith": "layout", "version": 1}']) {
			expect(readComponentCopy(text), text).toEqual({ error: NO_COMPONENT });
		}
	});

	it('refuses a newer version before reading anything it governs', () => {
		expect(
			readComponentCopy('{"sheetsmith": "component", "version": 2, "component": 7}'),
		).toEqual({ error: NEWER_COMPONENT });
	});

	it("refuses a component that will not parse, in the parser's own words", () => {
		const text = JSON.stringify({
			sheetsmith: 'component',
			version: 1,
			component: { id: 'x', type: 'card', label: 'X' },
		});
		expect(readComponentCopy(text)).toEqual({
			error: 'The copied component cannot be pasted: Component 1 ("X") needs a "position" object.',
		});
	});

	it('ignores an unknown key, and degrades a missing or malformed context and from', () => {
		const text = JSON.stringify({
			sheetsmith: 'component',
			version: 1,
			later: true,
			from: 'nowhere',
			component: copy().component,
			context: { functions: { mod: 3, prof: 'prof = 2' }, definitions: [{ name: 1 }, { name: 'Ring' }] },
		});
		const read = readComponentCopy(text);
		if (!('ok' in read)) throw new Error(read.error);
		expect(read.copy.from).toEqual({ layout: null, fingerprint: '' });
		expect(read.copy.context).toEqual({
			functions: { prof: 'prof = 2' },
			definitions: [{ name: 'Ring', targets: [] }],
		});
	});
});
