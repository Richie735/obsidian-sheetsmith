import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The sites that still build DOM by hand, enumerated so a tenth cannot arrive
 * unnoticed.
 *
 * `obsidianmd/prefer-create-el` is on for `components/`, `ui/`, `interaction/`
 * and `view/grid-cells.ts`, and off for four whole files, because
 * `eslint-comments/no-restricted-disable` forbids turning an `obsidianmd` rule
 * off at its own line (`eslint.config.mts`). A file-wide exemption is a hole the
 * width of the file: a new `createElement` anywhere in `pool.ts` is unreported,
 * and `pool.ts` is 1400 lines.
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
 * edit above it, but a count per file and a comment at the site saying which
 * kind of exemption it is (`PATTERNS.md` §5): out of the helper's reach, or
 * reachable at a price, or a design choice. A tenth site is a decision, and this
 * check is what makes it one instead of a habit.
 */

const SRC = new URL('./', import.meta.url);

/** The folders the rule is on for, where a hand-built element is a decision. */
const SCANNED = ['components/', 'ui/', 'interaction/', 'view/'];

/**
 * How many hand-built elements each file is allowed, and nothing else may have
 * any. Every one of these carries its argument in a comment at the site.
 */
const ALLOWED: Record<string, number> = {
	// Two spoken-only children appended after every visible one, a controls row
	// filled before it is placed, and a builder that returns a control.
	'components/pool.ts': 4,
	// A live region appended after the picture, and a notice placed after a
	// sibling rather than into a parent.
	'components/passport.ts': 2,
	// A live region appended at the end of the card.
	'components/card-face.ts': 1,
	// A live region handed to the function that fills its parent, so it must
	// exist before that call and be appended after it. This is the one that was
	// got wrong; see the header.
	'components/image.ts': 1,
	// A builder that returns a button for its caller to place.
	'interaction/hold-repeat.ts': 1,
};

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
		// Vacuity guard (§10): both assertions below pass on an empty scan.
		expect(sources().length).toBeGreaterThan(20);
		expect(sources()).toContain('components/pool.ts');
		expect(sources()).toContain('view/grid-cells.ts');
		expect([...counted.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(5);
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
