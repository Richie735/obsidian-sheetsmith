import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The sites that build DOM by hand, enumerated so one cannot arrive unnoticed.
 *
 * **There are none, and that is a recent thing.** This file used to list nine,
 * each with an argument at the site, under an exemption per file in
 * `eslint.config.mts` — `eslint-comments/no-restricted-disable` forbids turning
 * an `obsidianmd` rule off at its own line, so a file was the narrowest scope
 * available and a file-wide exemption is a hole the width of the file.
 *
 * What retired all nine was not a sweep but a missing API member.
 * `obsidian.d.ts` declares `createEl`, `createDiv` and `createSpan` as *globals*
 * beside the `Node` methods, and the global form returns an element with no
 * parent — the app's own `enhance.js` implements the method as the global with
 * `parent` set to the receiver. So "`createEl` attaches on creation, and that is
 * the whole of what it cannot do" was a claim about the prototype helper being
 * read as a claim about the API. Every one of the nine wanted exactly the
 * detached form: appended after a later call, placed after a sibling, or
 * returned unplaced. `src/test/obsidian-stub.ts` had never installed the
 * globals, which is why nothing under vitest or the harness could have noticed.
 *
 * The check stays, and is now stronger than the list it replaced: the allowed
 * population is empty, so any `createElement` in these folders is reported
 * rather than any tenth one.
 *
 * **The hole is not theoretical, and neither is what falls through it.** The
 * sweep that moved 94 sites onto the helpers turned Image's live region from the
 * last child of its box into the first, so a screen reader met "Portrait saved"
 * before the field it described. Three instruments were watching: the scan that
 * classified the sweep looked for siblings reaching the parent *by name* and
 * could not see through `renderPictureFrame(box, …)`; the component's tests
 * asserted no order; and all 73 harness shots were byte-identical, because the
 * element is invisible. `src/test/spoken-order.ts` now holds the ordering claim
 * for the components that make it, and this holds the population those claims
 * are about.
 *
 * `pointer-gestures.test.ts`'s shape, for its reason: a declaration removed
 * leaves call sites behind, and the call sites are the half nothing watches. It
 * is the same bug class §1 names — findable only by reading two files side by
 * side.
 *
 * **What a new entry here owes.** Not a line number, which goes stale on any
 * edit above it, but a count per file and a comment at the site saying why the
 * global `createEl` will not do. That bar is much higher than the old one: the
 * three kinds `PATTERNS.md` §5 used to enumerate — out of the helper's reach,
 * reachable at a price, a design choice — were all answered by the detached
 * form, so an entry here now has to be something none of them were.
 */

const SRC = new URL('./', import.meta.url);

/** The folders the rule is on for, where a hand-built element is a decision. */
const SCANNED = ['components/', 'ui/', 'interaction/', 'view/'];

/**
 * How many hand-built elements each file is allowed, and nothing else may have
 * any. Empty: every site that had one now takes the detached global `createEl`
 * instead, and a new entry owes the argument the header describes.
 */
const ALLOWED: Record<string, number> = {};

/** Every non-test `.ts` under the scanned folders, by path relative to `src/`. */
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
	return found.filter((path) => SCANNED.some((one) => path.startsWith(one)));
}

/**
 * `createElement(` in code position.
 *
 * Comments and string literals are skipped whole, for the reason
 * `class-tokens.test.ts` walks rather than searches: at this repository's
 * comment density the prose around each of these sites names the call
 * repeatedly, and a scan that read those would report this file's own header.
 * `createElementNS` is excluded by requiring the open paren.
 */
function handBuilt(source: string): number {
	let count = 0;
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
			while (at < source.length) {
				if (source[at] === '\\') at += 2;
				else if (source[at] === quote) break;
				else at += 1;
			}
			i = at + 1;
			continue;
		}
		if (source.startsWith('createElement(', i)) {
			count += 1;
			i += 'createElement('.length;
			continue;
		}
		i += 1;
	}
	return count;
}

const counted = new Map(
	sources().map((path) => [
		path,
		handBuilt(readFileSync(new URL(path, SRC), 'utf8')),
	]),
);

describe('every hand-built element is one somebody decided on', () => {
	it('finds the files it is scanning', () => {
		// Vacuity guard (§10): the assertion below passes on an empty scan, and
		// now passes on a *correct* scan too, since the allowed population is
		// empty. So the whole of this check's weight is here and in the scanner
		// test below — that the walk reaches the folders, and that `handBuilt`
		// can tell a call from the prose around it.
		//
		// The old fourth line asserted the scan found more than five hand-built
		// sites, which was the honest guard while nine existed and would now be
		// asserting the bug it exists to prevent.
		expect(sources().length).toBeGreaterThan(20);
		expect(sources()).toContain('components/pool.ts');
		expect(sources()).toContain('view/grid-cells.ts');
	});

	it('reads a call and not a mention of one', () => {
		// The skip is what lets every file above write `createElement` in prose,
		// which they all do at length, and what stops this file reporting itself.
		expect(handBuilt("// createElement('div')")).toBe(0);
		expect(handBuilt("/* createElement('div') */")).toBe(0);
		expect(handBuilt("const s = \"createElement(\";")).toBe(0);
		expect(handBuilt("doc.createElement('div');")).toBe(1);
		// `createElementNS` is a different call and is not in scope.
		expect(handBuilt('doc.createElementNS(NS, tag);')).toBe(0);
	});

	it('holds every file to the sites it is allowed', () => {
		const actual = Object.fromEntries(
			[...counted].filter(([, n]) => n > 0).sort(),
		);
		expect(actual).toEqual(ALLOWED);
	});
});
