import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getComponent, listComponentTypes } from './index';

/*
 * Interface doc comments that only repeat their own `configFields` description.
 *
 * A config field is described twice: once above the interface member, for the
 * reader of the code, and once in `configFields`, as the copy the layout editor
 * shows the author. The second one has to exist. The first one has to say
 * something the second does not, or it is a line paid for on every future read
 * (docs/PATTERNS.md §9).
 *
 * Prose caught this once and only half-fixed it. The backlog row that drove the
 * cleanup named two files, the fix followed the row rather than the rule, and
 * `track.ts`'s two instances survived — never in a diff, having predated the
 * branch, so no diff-scoped review could ever have surfaced them. That is what
 * a source check is for.
 *
 * Registry-wide and [checked], which §10 says is `contract.test.ts`'s job and
 * the first place to reach for. It is not this rule's place: everything there
 * asks its questions of an imported `ComponentDefinition`, and a doc comment is
 * not on one — it is gone by the time the module is a value, so this has to
 * read the source text instead. Putting a file reader in there would give that
 * file a second way of knowing things, which is the split §1 forbids, and the
 * repository already keeps source-text guards in files of their own:
 * `styles.test.ts` reads `styles.css`, `isolation.test.ts` drives eslint.
 *
 * The rule is verbatim sentences, all of them:
 *
 *   A comment duplicates its description when EVERY sentence in it is already
 *   a sentence of the description, compared after normalising case, quotes and
 *   whitespace.
 *
 * Both halves are measured against the corpus rather than chosen:
 *
 * - Verbatim, not similar. Anything fuzzier cannot separate this corpus in
 *   principle, never mind in practice. `track.ts`'s `count` comment — which
 *   earns its place — shares eight leading words and about three quarters of
 *   its first sentence with its description; the `hideLabel` comment that was
 *   dropped shared six words and three fifths. The keep scores HIGHER than the
 *   drop on every overlap metric there is, so no threshold flags one and
 *   spares the other.
 * - Every sentence, not any sentence. `signed` repeats its description's only
 *   sentence exactly and then adds "Defaults to true.", which the description
 *   does not say. One unmatched sentence keeps the whole comment, which is
 *   §9's "keep it only where it says something the description does not" taken
 *   literally.
 *
 * What it deliberately does not catch: anything a comment adds to a sentence it
 * repeats. Pool's `hasTemp` and Card set's `sizing` restate their
 * descriptions in different words and escape; so does a comment that repeats a
 * description sentence and then says more, whether the addition arrives after a
 * full stop or after a comma.
 *
 * That last one was a rule here for one revision, and it is worth recording why
 * it went. It compared a comment's first clause against a whole description
 * sentence, which reads as narrow and is not: the constraint sits entirely on
 * the description side, so the comment could append anything at all. "Leave the
 * heading off the sheet, as on a Card." and "Leave the heading off the sheet, so
 * the run has no visible name" were indistinguishable to it, and the second is a
 * comment §9 says to keep. It discriminated on punctuation rather than content —
 * the same words after a full stop passed — so there was nothing in it to tune.
 *
 * Which leaves one line, and the line is the point. Everything this check
 * reports, it can prove: the description already contains these exact sentences.
 * Judging whether an addition earns its line is review's job, and a guard that
 * tried would fail the build against comments §9 asks for — worse than missing a
 * duplicate, because §9 warns that stripping these paragraphs is how the bug
 * they record gets rebuilt.
 *
 * Scope follows from the rule rather than being drawn around it. A comment is
 * only compared where the same file describes the same key to the author, so
 * the arrow-keys comment on `editable.ts`'s `step` — §9's own example of one
 * that stays — is never a candidate: `src/interaction/` has no `configFields`
 * at all. Nothing here is tuned to protect it.
 */

const DIR = new URL('./', import.meta.url);

/** Normalised for comparison: case, the quote characters, and whitespace. */
function normalise(text: string): string {
	return text
		.toLowerCase()
		.replace(/[`"'‘’“”]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Split on a full stop that ends a sentence, meaning one followed by space.
 *
 * Scanned forwards rather than split on a lookbehind, which this repository
 * cannot use (`obsidianmd/regex-lookbehind`). Requiring the space is what keeps
 * "e.g. 10" from becoming two sentences, one of which is short enough to appear
 * inside an unrelated word and turn the comparison below into a coincidence.
 */
function sentences(text: string): string[] {
	const found: string[] = [];
	let start = 0;
	for (const boundary of text.matchAll(/[.!?]+\s+/g)) {
		const end = (boundary.index ?? 0) + boundary[0].length;
		found.push(text.slice(start, end).trim());
		start = end;
	}
	found.push(text.slice(start).trim());
	return found.filter((sentence) => sentence !== '');
}

/** The rule. Exported shape kept small: one comment, one description. */
function duplicates(comment: string, description: string): boolean {
	const described = normalise(description);
	const said = sentences(normalise(comment));
	if (said.length === 0) return false;
	return said.every((sentence) => described.includes(sentence));
}

/**
 * The body of the file's `interface X extends ComponentConfig`, or null.
 *
 * Crude by design, in the manner of `styles.test.ts`: a real parser would be a
 * dependency, and the shape being read here is only ever "the lines between
 * that declaration and the brace that closes it".
 */
function configInterface(source: string): string | null {
	const start = source.search(
		/^export interface \w+ extends ComponentConfig \{$/m,
	);
	if (start < 0) return null;
	const end = source.indexOf('\n}', start);
	return end < 0 ? null : source.slice(start, end);
}

/** The `type: 'pool'` literal a config interface declares, tying it to a key. */
function declaredType(body: string): string | null {
	return body.match(/^\ttype: '([^']+)';$/m)?.[1] ?? null;
}

interface Documented {
	key: string;
	comment: string;
}

/** Comment text with its stars, slashes and leading whitespace taken off. */
function commentText(raw: string): string {
	return raw
		.split('\n')
		.map((line) => line.replace(/^\s*(?:\*|\/\/)?\s?/, '').trim())
		.join(' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Every member of a config interface that carries a comment, in any spelling.
 *
 * `/**`, a plain `/*`, and a run of `//` lines all count. §9 is about what an
 * interface comment says, and says nothing about how it is punctuated — and a
 * matcher that only read `/**` could be stepped around by deleting one star.
 * Not a theoretical evasion: it silenced a whole file in one keystroke while
 * the aggregate floor below stayed satisfied, which is how the check came to
 * lose a file the same way §9 first lost one.
 */
function documentedFields(body: string): Documented[] {
	const found: Documented[] = [];
	for (const match of body.matchAll(/\/\*+([\s\S]*?)\*\/\s*\n\t(\w+)\??:/g)) {
		found.push({ key: match[2] as string, comment: commentText(match[1] ?? '') });
	}
	for (const match of body.matchAll(/((?:\t\/\/[^\n]*\n)+)\t(\w+)\??:/g)) {
		found.push({ key: match[2] as string, comment: commentText(match[1] ?? '') });
	}
	return found;
}

/**
 * Every comment in a config interface, attributed to a member or not.
 *
 * Counted separately from the matcher above so the two can be compared. This
 * is the per-component vacuity guard, and it is the only shape one can honestly
 * take: asserting that a component *has* commented config fields would forbid
 * the end state §9 actually wants, where a self-describing name carries no
 * comment at all. What can be asserted is that every comment which is there was
 * read — so a file whose comments stop being attributed fails on its own row
 * rather than hiding inside a corpus-wide total.
 */
function commentCount(body: string): number {
	const blocks = body.match(/\/\*/g)?.length ?? 0;
	const lineRuns =
		body.match(/(?:^|\n)\t\/\/[^\n]*(?:\n\t\/\/[^\n]*)*/g)?.length ?? 0;
	return blocks + lineRuns;
}

/**
 * The author-facing description per config key, taken from the registry.
 *
 * Read rather than parsed, unlike everything above it. The asymmetry is the
 * point: a doc comment exists nowhere but the source, so reading the interface
 * off disk is the only way to see one at all — while a description is a string
 * on a live object this file has already imported, and scraping it back out of
 * the source it came from buys nothing and loses the guarantee.
 *
 * It used to be scraped, and the hole was silent in the worst way. The regex
 * read a chain of `'…'` literals, so a description written any other way — a
 * template literal, a constant shared from `column-types.ts`, anything built by
 * a helper — matched nothing, its key never entered the map, and the field
 * simply stopped being compared with nothing said. Rewriting one description's
 * quotes was enough to take a duplicate comment from reported to unreported,
 * which is a guard whose reach depends on punctuation it has no opinion about.
 */
function descriptions(type: string): Map<string, string> {
	const found = new Map<string, string>();
	for (const field of getComponent(type)?.configFields ?? []) {
		found.set(field.key, field.description);
	}
	return found;
}

interface Component {
	file: string;
	type: string | null;
	/** Comments found in the interface, and comments the matcher attributed. */
	comments: number;
	attributed: number;
	pairs: { key: string; comment: string; description: string }[];
}

/**
 * Every component file in this folder, its interface read off disk and its
 * descriptions taken from the registry entry the file's own `type` names.
 *
 * A directory sweep is what makes this hold for a component added later: it
 * needs no filename convention and no list to be added to here. The two checks
 * below close both directions of the join, so neither a registered component
 * the sweep failed to read nor a swept file the registry does not know can pass
 * quietly — and the second matters here, because an unregistered file is one
 * this function can find no descriptions for.
 */
function components(): Component[] {
	const found: Component[] = [];
	for (const file of readdirSync(DIR)) {
		if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
		const source = readFileSync(new URL(file, DIR), 'utf8');
		const body = configInterface(source);
		if (body === null) continue;
		const type = declaredType(body);
		const described = descriptions(type ?? '');
		const documented = documentedFields(body);
		const pairs = documented.flatMap(({ key, comment }) => {
			const description = described.get(key);
			return description === undefined
				? []
				: [{ key, comment, description }];
		});
		found.push({
			file,
			type,
			comments: commentCount(body),
			attributed: documented.length,
			pairs,
		});
	}
	return found;
}

const COMPONENTS = components();

describe('the check reaches the components it is meant to check', () => {
	it('finds a config interface for every registered component', () => {
		// The sweep reads files, so nothing about it would notice a component
		// whose interface it failed to parse — it would simply report no pairs
		// and pass. Anchored to the registry, a component that stops being
		// read fails here instead of silently leaving the check.
		const swept = COMPONENTS.map((component) => component.type);
		for (const type of listComponentTypes()) expect(swept).toContain(type);
	});

	it('finds a registry entry for every component it swept', () => {
		// The other direction of the same join, and the one the descriptions
		// now depend on: a swept file whose `type` the registry does not know
		// yields no descriptions, so every field in it would pair with nothing
		// and the file would pass by being empty. Cheaper to say that a
		// component file is not registered than to leave it unchecked.
		const registered = listComponentTypes();
		for (const { file, type } of COMPONENTS) {
			expect(registered, `${file} declares type "${String(type)}"`).toContain(
				type,
			);
		}
	});

	it('pairs enough comments with descriptions to mean anything', () => {
		// A corpus-wide sanity check, and only that. It cannot speak for any
		// single component: the counts run 4, 7, 4, 3, 4, so four of the five
		// files could fall to nothing and still clear this number. The per
		// component guard in the block below is what holds each file, and this
		// is here for the case where the extraction stops working everywhere at
		// once.
		const pairs = COMPONENTS.flatMap((component) => component.pairs);
		expect(pairs.length).toBeGreaterThan(15);
	});

	it('flags a comment that only repeats its description', () => {
		// The three `hide*` flags §9 names as the clear cases, as they read
		// before the cleanup. They are gone from the source, so without them
		// here a rule nothing violates would be indistinguishable from a rule
		// that no longer fires at all.
		expect(
			duplicates(
				'Hide the label above the value.',
				'Hide the label above the value. The key is never shown either, so the card is left with no visible name — worth it only under a heading that already names it.',
			),
		).toBe(true);
		expect(
			duplicates('Show only the derived result.', 'Show only the derived result.'),
		).toBe(true);
		expect(
			duplicates(
				'Leave the note line off the card.',
				'Leave the note line off the card. Stored text is kept.',
			),
		).toBe(true);
	});

	it('leaves a comment that repeats a sentence and then adds to it', () => {
		// Track's `hideLabel` cross-reference, which §9 says to drop and this
		// check does not report. The clause it adds is worth nothing — it names
		// one of the three components declaring `hideLabel` — but no rule can
		// tell it from a clause that is worth something, so §9 keeps that
		// judgement and the check keeps its precision.
		//
		// Pinned rather than left implicit, because the obvious way to catch it
		// was a rule here for one revision: compare the comment's first clause
		// against a whole description sentence. It flagged "…off the sheet, so
		// the run has no visible name" identically, which is a comment §9 asks
		// an author to write — a [checked] rule failing the build against the
		// documentation it exists to enforce. This assertion is what fails if
		// anyone rebuilds it.
		expect(
			duplicates(
				'Leave the heading off the sheet, as on a Card.',
				'Leave the heading off the sheet. Worth it only under a heading that already names the run.',
			),
		).toBe(false);
		expect(
			duplicates(
				'Leave the heading off the sheet, so the run has no visible name.',
				'Leave the heading off the sheet. Worth it only under a heading that already names the run.',
			),
		).toBe(false);
	});

	it('leaves a comment that adds a sentence of its own', () => {
		// `signed`, which is why the rule is every sentence rather than any.
		expect(
			duplicates(
				'Prefix non-negative derived numbers with "+". Defaults to true.',
				'Prefix non-negative derived numbers with "+".',
			),
		).toBe(false);
	});

	it('leaves a comment the description carries on past', () => {
		// `count`, the closest thing in the corpus to a duplicate that is not
		// one: eight shared leading words before the two diverge mid-sentence.
		expect(
			duplicates(
				'How many segments a run holds, as a literal or an expression.',
				'How many segments a run holds, as a number or a formula, e.g. 10, or 2 + if(abilities.PHY >= 3, 2, 1).',
			),
		).toBe(false);
	});
});

describe.each(COMPONENTS)('$file', ({ comments, attributed, pairs }) => {
	it('attributes every comment in its config interface to a member', () => {
		// Claimed per component rather than in aggregate. Without this, a file
		// whose comments the matcher stops recognising reports an empty array
		// and reads exactly like a file with nothing to report — and the total
		// above is far too loose to notice one file going quiet.
		expect(attributed).toBe(comments);
	});

	it('documents no config field twice over', () => {
		const repeated = pairs
			.filter(({ comment, description }) => duplicates(comment, description))
			.map(({ key }) => key);
		expect(repeated).toEqual([]);
	});
});
