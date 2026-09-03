/*
 * A class name a browser would refuse never reaches `classList.add`.
 *
 * `DOMTokenList.add` throws `InvalidCharacterError` on a token holding ASCII
 * whitespace. `src/test/obsidian-stub.ts` and happy-dom both accept one. That
 * pair once aborted a table's render mid-loop, so the sheet lost every row below
 * the first while 2139 tests stayed green, and the harness was the only
 * instrument that could have found it (`docs/UI.md` §12).
 *
 * A file of its own, not a second `describe` beside `ui/element.ts`, on the four
 * standing precedents — `pointer-gestures.test.ts`, `styles.test.ts`,
 * `components/isolation.test.ts`, `components/doc-comments.test.ts`, two of
 * which deliberately do not sit beside the module they came out of — and on one
 * argument the precedents do not make: this check reads files that will never
 * import `element.ts`, and it would still be the right check if that module were
 * deleted tomorrow. Kept there, deleting the module would silently take a
 * repository-wide guard with it.
 *
 * **`harness/` is in scope and that is the point of naming it.** The harness is
 * the only thing here that puts this plugin's DOM in front of a real browser, so
 * it is the one place where such a call would actually throw rather than being
 * waved through — and it builds elements of its own. It holds none today; the
 * check reaching it is what stops the next one being written unguarded.
 *
 * **What it will not do is fail the build on correct code**, which is the
 * property this reader is shaped around rather than a claim made for it. Three
 * spellings decide it. The source is walked rather than searched, so a comment
 * and a string are skipped whole and the call is recognised only where it is
 * one. The call's arguments are found by *counting* parentheses,
 * the way `pointer-gestures.test.ts` counts braces and for the same reason: a
 * `[^)]*` stops at the first `)` rather than the matching one, which makes
 * `classList.add(...cls.split(' '))` — the canonical spelling of the correct fix,
 * and what `ui/element.ts` is built out of — report the `' '` it splits on. And
 * an argument is read **only when it is entirely one literal**, so a spread, an
 * index, a nested call and a ternary are structurally excluded rather than
 * pattern-matched out.
 *
 * **What it therefore misses is stated rather than papered over**, because the
 * honest claim is narrower than "it catches the trap": an argument that
 * *computes* a bad token — `cond ? one() : 'a b'`, or a variable holding one —
 * is skipped, since what runs is not decidable from the source. It reports what
 * must throw when the line runs, never what might. Two other things it is not:
 * it does not catch a fourth hand-rolled copy of `element()`, whose
 * `classList.add(one)` carries a variable and no literal at all (`PATTERNS.md`
 * §11 holds that gap), and it covers this one DOM call rather than the class of
 * calls the two DOMs disagree about (`docs/UI.md` §12 holds that one).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Paths are joined rather than resolved through `new URL(..., import.meta.url)`,
 * which is the spelling `styles.test.ts` uses and which silently does not work
 * from a template literal: Vite rewrites that call when its first argument is
 * not a literal, and a walk built on it read `undefined` instead of the tree.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The set `DOMTokenList` refuses inside a token: the DOM spec's ASCII whitespace. */
const REFUSED = /[ \t\n\f\r]/;

/** Every `.ts` file under `dir`, as a repo-relative path. */
function sources(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
		const path = `${dir}/${entry.name}`;
		if (entry.isDirectory()) found.push(...sources(path));
		else if (entry.name.endsWith('.ts')) found.push(path);
	}
	return found;
}

/**
 * The literal starting at `text[at]`, as the pieces of it that are fixed text,
 * with the index just past its close. `null` where no literal starts there or
 * the literal never closes.
 *
 * A template's interpolations contribute nothing — `${x}` is skipped and its
 * neighbours are separate pieces — because a space in a *fixed* piece is in
 * every string the template can produce, and a space inside an interpolation is
 * not knowable at all.
 */
function readLiteral(
	text: string,
	at: number,
): { pieces: string[]; end: number } | null {
	const quote = text[at];
	if (quote !== '\'' && quote !== '"' && quote !== '`') return null;
	const pieces: string[] = [];
	let piece = '';
	let i = at + 1;
	while (i < text.length) {
		const ch = text[i] as string;
		if (ch === '\\') {
			// Only the escapes that can *produce* a refused character are decoded;
			// anything else keeps its second character, which is what `\'` means.
			const next = text[i + 1] ?? '';
			piece +=
				next === 't'
					? '\t'
					: next === 'n'
						? '\n'
						: next === 'r'
							? '\r'
							: next === 'f'
								? '\f'
								: next;
			i += 2;
			continue;
		}
		if (ch === quote) return { pieces: [...pieces, piece], end: i + 1 };
		// A quoted string cannot span a line in TypeScript, and saying so is what
		// bounds the damage when a regex literal's odd quote is mistaken for one:
		// the reader gives up at the newline instead of swallowing to the next
		// quote somewhere further down the file.
		if (ch === '\n' && quote !== '`') return null;
		if (quote === '`' && ch === '$' && text[i + 1] === '{') {
			pieces.push(piece);
			piece = '';
			let depth = 1;
			i += 2;
			while (i < text.length && depth > 0) {
				if (text[i] === '{') depth += 1;
				else if (text[i] === '}') depth -= 1;
				i += 1;
			}
			continue;
		}
		piece += ch;
		i += 1;
	}
	return null;
}

/**
 * The arguments of the call whose `(` is at `open`, as source text, or `null`
 * if the call never closes.
 *
 * Depth is counted over brackets and literals are skipped whole, so a nested
 * call and a comma inside a string both land where they belong.
 */
function argumentsOf(text: string, open: number): string[] | null {
	const found: string[] = [];
	let start = open + 1;
	let depth = 1;
	let i = start;
	while (i < text.length) {
		const literal = readLiteral(text, i);
		if (literal !== null) {
			i = literal.end;
			continue;
		}
		const ch = text[i] as string;
		if (ch === '(' || ch === '[' || ch === '{') depth += 1;
		else if (ch === ']' || ch === '}') depth -= 1;
		else if (ch === ')') {
			depth -= 1;
			if (depth === 0) {
				found.push(text.slice(start, i));
				return found;
			}
		} else if (ch === ',' && depth === 1) {
			found.push(text.slice(start, i));
			start = i + 1;
		}
		i += 1;
	}
	return null;
}

/**
 * The fixed pieces of `argument`, when the whole of it is one literal, and
 * `null` for every other shape — a variable, a spread, an index, a nested call,
 * a ternary, a concatenation.
 *
 * This is the line between what the check reports and what it declines to, and
 * it is drawn structurally: not "does this look safe" but "is this the whole
 * argument", which no expression can be mistaken for.
 */
function literalArgument(argument: string): string[] | null {
	const text = argument.trim();
	const literal = readLiteral(text, 0);
	return literal !== null && literal.end === text.length ? literal.pieces : null;
}

/** The call this file is about, matched only where it is actually a call. */
const CALL = 'classList.add(';

/**
 * Every fixed class name handed to `classList.add`, with the line it sits on.
 *
 * The source is walked rather than searched, and the difference is not
 * fastidiousness: a comment and a string are skipped *whole*, so the call is
 * recognised only in code position. That is what lets a file at this
 * repository's comment density write the offending line out in prose — and it
 * is what lets this file hold its own fixtures, which are strings that model
 * source and are not source. The alternative was an exemption for this file,
 * and an exemption is a hole in a check whose whole value is having none.
 */
function tokensAdded(source: string): { name: string; line: number }[] {
	const found: { name: string; line: number }[] = [];
	let i = 0;
	while (i < source.length) {
		if (source.startsWith('//', i)) {
			const line = source.indexOf('\n', i);
			i = line === -1 ? source.length : line;
			continue;
		}
		if (source.startsWith('/*', i)) {
			const end = source.indexOf('*/', i + 2);
			i = end === -1 ? source.length : end + 2;
			continue;
		}
		const literal = readLiteral(source, i);
		if (literal !== null) {
			i = literal.end;
			continue;
		}
		if (source.startsWith(CALL, i)) {
			const open = i + CALL.length - 1;
			const line = source.slice(0, open).split('\n').length;
			for (const argument of argumentsOf(source, open) ?? []) {
				for (const name of literalArgument(argument) ?? []) {
					if (name !== '') found.push({ name, line });
				}
			}
			i = open + 1;
			continue;
		}
		i += 1;
	}
	return found;
}

describe('a class name a browser would refuse never reaches classList.add', () => {
	const files = [...sources('src'), ...sources('harness')];
	const found = files.map((path) => ({
		path,
		tokens: tokensAdded(readFileSync(join(ROOT, path), 'utf8')),
	}));

	it('finds the calls it is meant to be checking', () => {
		const total = found.reduce((sum, file) => sum + file.tokens.length, 0);
		expect(total).toBeGreaterThan(100);
	});

	it('reads every file that builds DOM, src and harness alike', () => {
		// A floor per root rather than one over both: the harness holds no such
		// call today, so a total would stay green if the walk stopped at `src/`.
		expect(sources('src').length).toBeGreaterThan(60);
		expect(sources('harness').length).toBeGreaterThan(4);
	});

	it('holds every one of them to it', () => {
		const offenders = found.flatMap((file) =>
			file.tokens
				.filter((token) => REFUSED.test(token.name))
				.map((token) => `${file.path}:${token.line} adds '${token.name}'`),
		);
		expect(offenders).toEqual([]);
	});
});

describe('the reader reports only what it can prove', () => {
	/*
	 * The half a scan usually leaves out, and the half that would have caught the
	 * first draft of this one: three of these five safe spellings were reported by
	 * it, including the two that `ui/element.ts` and `src/test/obsidian-stub.ts`
	 * are themselves built out of. A check that fails the build on the correct fix
	 * teaches a reader to work around it.
	 */
	const refused = (source: string): string[] =>
		tokensAdded(source)
			.filter((token) => REFUSED.test(token.name))
			.map((token) => token.name);

	it('reports a literal token holding any refused character', () => {
		// Spelled as escapes because that is the only way four of the five can
		// appear inside a quoted string: a raw newline there is a syntax error, not
		// a class name, which is why the reader declines to read one.
		const gaps = [
			[' ', ' '],
			['\\t', '\t'],
			['\\n', '\n'],
			['\\f', '\f'],
			['\\r', '\r'],
		];
		for (const [written, meant] of gaps) {
			expect(
				refused(`el.classList.add('sheetsmith-a${written}sheetsmith-b');`),
				written,
			).toEqual([`sheetsmith-a${meant}sheetsmith-b`]);
		}
	});

	it('reports a template broken across lines, which a quoted string cannot be', () => {
		expect(refused('el.classList.add(`sheetsmith-a\nsheetsmith-b`);')).toEqual([
			'sheetsmith-a\nsheetsmith-b',
		]);
	});

	it('reports the offender among arguments it cannot read', () => {
		expect(refused("el.classList.add(fn(x), 'two words');")).toEqual([
			'two words',
		]);
	});

	it('reports a fixed piece of a template, which every string it makes holds', () => {
		expect(refused('el.classList.add(`sheetsmith-a ${side}`);')).toEqual([
			'sheetsmith-a ',
		]);
	});

	it('reports nothing for the spellings that are correct', () => {
		// Every one of these is safe, and the first two are how the fix to the
		// original incident is actually written.
		for (const safe of [
			"el.classList.add(...cls.split(' '));",
			"for (const one of cls.split(/[ \\t]+/)) el.classList.add(one);",
			"el.classList.add(cls.split(' ')[0]);",
			"el.classList.add(name.replace(' ', '-'));",
			"el.classList.add('sheetsmith-placed', 'sheetsmith-image');",
			'el.classList.add(`sheetsmith-align-${side}`);',
			"el.classList.add(wide ? 'sheetsmith-wide' : 'sheetsmith-narrow');",
			"el.classList.add('sheetsmith-a' + suffix);",
		]) {
			expect(refused(safe), safe).toEqual([]);
		}
	});

	it('reports nothing written in a comment, however dense the file', () => {
		// At 40-50% comment density the prose talks about this call constantly,
		// and an apostrophe inside a multi-line call once made the reader quote
		// half a sentence back as the offending class name.
		for (const prose of [
			"// never write classList.add('a b')\nel.classList.add('sheetsmith-a');",
			"/* classList.add('a b') aborts the render */\nel.classList.add('sheetsmith-a');",
			"el.classList.add(\n\t// it's the second one that matters\n\t'sheetsmith-a',\n);",
			"const url = 'https://example.com'; el.classList.add('sheetsmith-a');",
		]) {
			expect(refused(prose), prose).toEqual([]);
		}
	});

	it('declines an unterminated call rather than guessing where it ends', () => {
		expect(refused("el.classList.add('a b'")).toEqual([]);
	});
});
