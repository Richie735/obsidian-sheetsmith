// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Notice } from '../test/obsidian-stub';
import { CLIPBOARD_REFUSED, writeClipboard } from './clipboard';

/*
 * The write and its one sentence, driven against a clipboard the test owns.
 * The three callers' own success sentences are asserted beside each caller.
 */

let written: string[];
let refuse: boolean;

beforeEach(() => {
	written = [];
	refuse = false;
	Notice.messages = [];
	// happy-dom's `navigator.clipboard` is a prototype getter, so an own
	// property shadows it and `delete` puts it back.
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: {
			writeText: async (text: string): Promise<void> => {
				if (refuse) throw new Error('The user said no.');
				written.push(text);
			},
		},
	});
});

afterEach(() => {
	delete (navigator as unknown as { clipboard?: unknown }).clipboard;
});

describe('writeClipboard', () => {
	it('writes the text to the window it is given and says nothing', async () => {
		expect(await writeClipboard(window, 'hello')).toBe(true);
		expect(written).toEqual(['hello']);
		expect(Notice.messages).toEqual([]);
	});

	it('says the one refusal sentence when the write is refused', async () => {
		refuse = true;
		expect(await writeClipboard(window, 'hello')).toBe(false);
		expect(Notice.messages).toEqual([CLIPBOARD_REFUSED]);
		expect(CLIPBOARD_REFUSED).toBe('Could not copy to the clipboard.');
	});

	it('is the only clipboard write in src/', () => {
		const root = dirname(dirname(fileURLToPath(import.meta.url)));
		const files: string[] = [];
		const walk = (dir: string): void => {
			for (const name of readdirSync(dir)) {
				const path = join(dir, name);
				if (statSync(path).isDirectory()) walk(path);
				else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) files.push(path);
			}
		};
		walk(root);
		// A floor, so the scan cannot pass by reading nothing.
		expect(files.length).toBeGreaterThan(100);
		const writers = files.filter((path) =>
			readFileSync(path, 'utf8').includes('clipboard.writeText'),
		);
		expect(writers.map((path) => path.slice(root.length + 1))).toEqual([
			'ui/clipboard.ts',
		]);
	});
});
