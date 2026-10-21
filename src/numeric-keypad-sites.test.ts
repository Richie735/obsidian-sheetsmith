import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The fields that ask a phone for a digits-only keypad, enumerated so one cannot
 * arrive unnoticed (`docs/UI.md` §7).
 *
 * **The failure is invisible everywhere but one device.** On an iPhone
 * `inputMode = 'numeric'` draws the digits 0 to 9 and nothing else, so a field
 * that accepts a negative, a fraction, arithmetic or a word cannot be typed
 * into there. iPadOS draws a full keyboard for the same mode, and the desktop,
 * the harness and every test ignore the attribute, so review cannot see the
 * mistake and nothing else here would report it. That is `docs/PATTERNS.md`
 * §10's case for a guard: the population is held here, and each site's own
 * component test asserts its decision.
 *
 * **What a new entry owes** is the argument at its site that every valid value
 * of the field is a non-negative whole number (`docs/UI.md` §7). A count per file, not a line
 * number, which would go stale on any edit above it.
 */

const SRC = new URL('./', import.meta.url);

/**
 * How many fields in each file may ask for the keypad, and nothing else may.
 * Both are counts whose every valid value is a non-negative whole number:
 * Pool's temporary points and the length in Track's **Add** form.
 */
const ALLOWED: Record<string, number> = {
	'components/pool.ts': 1,
	'components/track.ts': 1,
};

/**
 * Every non-test `.ts` under `src/`, by path relative to it.
 *
 * `create-element-sites.test.ts` walks the tree the same way. The one shared
 * reader every scan should take is `docs/BACKLOG.md` § Patterns' row on scans
 * asserting their own narrowness, which names this file.
 */
function sources(dir = SRC, prefix = ''): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir)) {
		const url = new URL(entry, dir);
		if (statSync(url).isDirectory()) {
			found.push(...sources(new URL(`${entry}/`, dir), `${prefix}${entry}/`));
		} else if (entry.endsWith('.ts') && !entry.includes('.test.')) {
			found.push(`${prefix}${entry}`);
		}
	}
	return found;
}

/**
 * Every spelling that asks for a keypad: the property, the attribute, and an
 * `attr` entry handed to `createEl`. `decimal` counts with `numeric`, since on
 * an iPhone it is the same keypad with a decimal point and still no minus.
 */
const ASKS_FOR_KEYPAD = /inputmode['"]?\s*[:=,]\s*['"](?:numeric|decimal)['"]/gi;

/**
 * The source with its comments removed and its strings kept.
 *
 * A walk rather than a pair of regular expressions, because a comment marker
 * inside a string is not one: `'http://www.w3.org/2000/svg'` would cut the
 * rest of its line, and a glob such as `'src/**' + '/*.ts'` would swallow
 * everything up to the next `*\/` — an undercount nothing reports. Strings
 * are skipped *over* rather than dropped, unlike `create-element-sites.test.ts`'s
 * walk, because the thing looked for is itself a string literal; and the prose
 * around a site may quote the assignment it argues against, so comments go.
 */
function withoutComments(source: string): string {
	let code = '';
	let i = 0;
	while (i < source.length) {
		if (source.startsWith('//', i)) {
			const end = source.indexOf('\n', i);
			i = end === -1 ? source.length : end;
			continue;
		}
		if (source.startsWith('/*', i)) {
			const end = source.indexOf('*/', i + 2);
			i = end === -1 ? source.length : end + 2;
			continue;
		}
		const quote = source[i];
		if (quote === '\'' || quote === '"' || quote === '`') {
			let at = i + 1;
			while (at < source.length && source[at] !== quote) {
				at += source[at] === '\\' ? 2 : 1;
			}
			code += source.slice(i, at + 1);
			i = at + 1;
			continue;
		}
		code += source[i];
		i += 1;
	}
	return code;
}

function keypadSites(source: string): number {
	return withoutComments(source).match(ASKS_FOR_KEYPAD)?.length ?? 0;
}

const counted = new Map(
	sources().map((path) => [path, keypadSites(readFileSync(new URL(path, SRC), 'utf8'))]),
);

describe('every numeric keypad is one somebody decided on', () => {
	it('finds the files it is scanning', () => {
		// Vacuity guard (§10): an empty walk would pass the check below.
		expect(counted.size).toBeGreaterThan(50);
		expect(counted.has('components/pool.ts')).toBe(true);
	});

	it('tells a site from the prose around it', () => {
		expect(keypadSites("field.inputMode = 'numeric';")).toBe(1);
		expect(keypadSites("field.setAttribute('inputmode', 'numeric');")).toBe(1);
		expect(keypadSites("createEl('input', { attr: { inputmode: 'numeric' } });")).toBe(1);
		expect(keypadSites("// was `inputMode = 'numeric'`\nfield.inputMode = 'text';")).toBe(0);
		expect(keypadSites("/* inputMode = 'numeric' */ field.inputMode = 'text';")).toBe(0);
		expect(keypadSites("field.inputMode = 'decimal';")).toBe(1);
		// A comment marker inside a string hides nothing after it.
		expect(keypadSites("const ns = 'http://x'; field.inputMode = 'numeric';")).toBe(1);
		expect(keypadSites("const glob = 'a/*'; field.inputMode = 'numeric'; // */")).toBe(1);
	});

	it('asks for the keypad only where every valid value is a non-negative whole number', () => {
		const found = Object.fromEntries(
			[...counted].filter(([, count]) => count > 0),
		);
		expect(found).toEqual(ALLOWED);
	});
});
