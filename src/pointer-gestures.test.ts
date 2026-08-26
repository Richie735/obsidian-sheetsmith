/*
 * A test that presses a control spells the press once, in `src/test/pointer.ts`.
 *
 * PATTERNS §1 extracted that module after `press` had been redeclared four
 * times; the declarations were the symptom and the dispatch sites were the gap.
 * Removing the four left fifteen raw dispatches behind in `pool.test.ts` that
 * were byte-for-byte what the module does, and finding them took a grep across a
 * 2300-line file — which cost more than this check does, and would cost it again
 * every time somebody wonders.
 *
 * The bug class is the one §1 already names: findable only by reading two files
 * side by side, and therefore worth a scan rather than a habit. The precedents
 * are `view/grid-cells.test.ts`, which holds one derivation of a placement rule
 * by scanning for the flag's name, and `components/isolation.test.ts`, which
 * drives eslint rather than trusting a comment — a rule that stood
 * half-enforced for a while because it had been verified once, by hand.
 *
 * What counts as a violation, and why the predicate is this narrow:
 *
 * - **`pointerdown`, `pointerup` or `pointercancel`, spelled as a literal.** A
 *   `pointermove` is only ever part of a drag, and a drag is deliberately not in
 *   the module. An event whose type is a variable is a factory the test chose per
 *   call, and every such factory here carries coordinates.
 *
 *   `pointercancel` was added after the fact, and how it was missed is the
 *   lesson: the rule below is about the *shape* — pointer identity and no
 *   coordinates — while this list enumerates types, so the two can drift and did.
 *   Two byte-equal bare cancels sat in `pool.test.ts` and `layout-editor.test.ts`
 *   while this file reported nothing, because a check can only find what it
 *   enumerates. **A new bare type belongs here on the second call site**, not the
 *   third: §1 puts a shape in the same one-step tier as a timing or a set, where
 *   a guard over two copies could only assert they still agree.
 *
 *   Which is also why that sentence describes the construction instead of
 *   spelling it. The scan reads source text, comments included — the brace walk
 *   below is the only parsing it does — so a literal written out in prose here is
 *   a finding this file reports against itself.
 * - **Carrying `pointerId` or `button`.** That pair is the whole of the shape
 *   the module owns. A press with neither — `{ bubbles: true }` on a card's own
 *   surface — routes by hit-testing rather than by pointer identity, and
 *   `pressDown` would give it a `pointerId` it does not currently have. Those
 *   stay hand-written on purpose.
 * - **Carrying no `clientX` or `clientY`.** Coordinates mean the gesture is a
 *   scrub or a hit-test, which is the exclusion `pointer.ts`' own header
 *   records. Only a bare press is what `press`, `pressDown`, `hold` and
 *   `release` already say.
 *
 * `src/test/` needs no exemption, which is worth stating because writing one
 * was the first instinct: the scan reads `*.test.ts` and §2 keeps that folder to
 * scaffolding and never test cases, so nothing in it matches. An exemption there
 * would be a condition that reads as load-bearing and is not — removing it
 * changes no result, which is how it was found.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SRC = new URL('./', import.meta.url);

/** Every `*.test.ts` under `src/`, by path relative to it. */
function testFiles(dir = SRC, prefix = ''): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir)) {
		const url = new URL(entry, dir);
		if (statSync(url).isDirectory()) {
			found.push(...testFiles(new URL(`${entry}/`, dir), `${prefix}${entry}/`));
		} else if (entry.endsWith('.test.ts')) {
			found.push(`${prefix}${entry}`);
		}
	}
	return found;
}

/**
 * One `new PointerEvent('<type>', { … })`, with its init read as text.
 *
 * The init is taken by counting braces rather than by regex, because these are
 * routinely written across several lines and a non-greedy `\{.*?\}` stops at
 * the first `}` — which for a multi-line init is the wrong one, and quietly
 * reads half an object as the whole of it.
 */
interface Construction {
	file: string;
	line: number;
	type: string;
	init: string;
}

const OPEN = /new PointerEvent\(\s*'(pointerdown|pointerup|pointercancel)'\s*,\s*\{/g;

function constructions(file: string, source: string): Construction[] {
	const found: Construction[] = [];
	for (const match of source.matchAll(OPEN)) {
		let depth = 1;
		let at = match.index + match[0].length;
		while (at < source.length && depth > 0) {
			if (source[at] === '{') depth++;
			else if (source[at] === '}') depth--;
			at++;
		}
		found.push({
			file,
			line: source.slice(0, match.index).split('\n').length,
			type: match[1] ?? '',
			init: source.slice(match.index + match[0].length, at - 1),
		});
	}
	return found;
}

const ALL = testFiles().flatMap((file) =>
	constructions(file, readFileSync(new URL(file, SRC), 'utf8')),
);

describe('a bare pointer press is spelled once, in src/test/pointer.ts', () => {
	it('finds the dispatch sites it is scanning', () => {
		// Vacuity guard (§10). Every assertion below passes on an empty scan, and
		// a regex that matched nothing is exactly how this check would rot: the
		// files are found, and they do construct pointer events.
		expect(testFiles().length).toBeGreaterThan(20);
		expect(testFiles()).toContain('components/pool.test.ts');
		expect(ALL.length).toBeGreaterThan(15);
		// And the brace walk read whole inits, not the first line of one.
		expect(ALL.filter((one) => one.init.includes('clientX')).length)
			.toBeGreaterThan(5);
	});

	it('leaves no press outside the module that the module already says', () => {
		const bare = ALL.filter(
			(one) =>
				/\b(pointerId|button)\s*:/.test(one.init) &&
				!/\bclient[XY]\s*:/.test(one.init),
		);
		expect(
			bare.map((one) => `${one.file}:${one.line} ${one.type}`),
		).toEqual([]);
	});
});
