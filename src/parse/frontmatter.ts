/*
 * One top-level key of a frontmatter block, read and written (SPEC §9).
 *
 * One job: set or remove a single top-level key without touching another byte
 * of the block. Imports nothing from `obsidian` (Constraint 5).
 *
 * **Why this exists rather than `app.fileManager.processFrontMatter`.** That
 * helper re-emits the whole block through js-yaml, which has no round-trip
 * mode: comments go, quotes normalise, explicit tags are stripped, inline
 * arrays become block style and `2022-01-25` comes back a timestamp — to *every
 * key in the block*, including the ones this plugin does not own. Constraint 3
 * holds every other write here to byte-faithfulness, and `withLayoutName`
 * already declined it in the same words: "repointing one key is not licence to
 * reformat the properties around it". A user's `aliases`, `tags`, `cssclasses`
 * and their comments are theirs by any reading of SPEC §10, so normalising them
 * as a side effect of writing `level` is not a cost this feature gets to accept
 * on their behalf.
 *
 * **It scans column-0 lines only, and refuses a block it cannot fully account
 * for.** A line with leading whitespace belongs to the key above it, which is
 * what stops a nested `  level: 3` under `stats:` being taken for a top-level
 * `level`. A column-0 line is blank, a comment, or a key line; anything else
 * makes the whole block undecidable and every write into it is refused. That is
 * the safe direction twice over: such a block is usually not a YAML mapping at
 * all — `- party` at column 0 under no key, a bare line of prose — so Obsidian
 * shows no properties for it either, and a plugin that guessed would be editing
 * a file it had misread.
 *
 * **It writes a single-line scalar and refuses anything else**, in one
 * sentence: the plugin owns one line. A key holding a block sequence, a block
 * mapping, a flow sequence, a flow mapping, a multi-line scalar, an anchor, an
 * alias or a tag is refused and never merged — the rename migration's own rule
 * read onto a shape instead of a name, and for its reason: a list the user built
 * under the property they chose cannot be told from a scalar afterwards.
 *
 * **The change guard is a text comparison**, `setFrontmatterKey` comparing the
 * line it would emit against the line the note holds. That is what makes the
 * write idempotent by construction, needs no YAML reader, and keeps this feature
 * off `metadataCache` entirely — so there is no cache lag to wait on and no
 * second reader to be stale.
 */

import { FieldValue } from '../types';
import { isFrontmatterDelimiter, lineText, splitLines } from './lines';

const BLANK = /^[ \t]*$/;
/** A comment at any indentation: inside a block mapping they are routine. */
const COMMENT = /^[ \t]*#/;
/**
 * A key line, and the leading character class is the load-bearing part.
 *
 * A key has to begin with a letter, a digit or an underscore, which rules out
 * every YAML indicator in one condition rather than a list — so `- party`,
 * `[a, b]` and `"a: b": 1` are not key lines and the block holding one is
 * refused rather than misread. `frontmatterKeyProblem` below holds a property
 * name to the same rule, which is what makes a line this module *writes* a line
 * this module can read back.
 *
 * The space after the colon is optional, so a hand-written `level:3` is
 * recognised and rewritten in this plugin's own spelling — `withLayoutName`'s
 * rule for `sheet-layout:Old`, one key over. That block was not a mapping
 * before the rewrite and is one after it, which is the direction to be wrong in.
 */
const KEY_LINE = /^([\p{L}\p{N}_][^:]*?)[ \t]*:[ \t]*(.*?)[ \t]*$/u;

/**
 * Words YAML reads as something other than a string, taken **wide**: YAML 1.1's
 * set rather than 1.2's, case-insensitively.
 *
 * The asymmetry is deliberate and is the whole argument. A needless quote costs
 * nothing, because a quoted string is still Text; a missing one changes the
 * property's type across the whole vault, since Obsidian gives every property of
 * one name the same type everywhere. So which js-yaml version Obsidian ships,
 * and therefore whether `yes` and `on` coerce, is something this plugin does not
 * need to know.
 *
 * `~`, `.inf` and `.nan` are absent because they cannot reach here: the plain
 * rule below requires a letter or a digit first.
 */
const RESERVED_WORDS: ReadonlySet<string> = new Set([
	'y',
	'n',
	'yes',
	'no',
	'on',
	'off',
	'true',
	'false',
	'null',
]);

/**
 * Every spelling YAML reads as a number, where the value starts with a digit.
 *
 * The `+`/`-` and `.5` forms are absent because they cannot reach here: the
 * plain rule below requires a letter or a digit first. `1:30` is YAML 1.1's
 * sexagesimal and is absent for the same reason — it holds a colon.
 *
 * **Wider than one resolver and narrower than "starts with a digit".** Hex,
 * `0o` octal and the underscore separator are YAML 1.1's, kept on
 * `RESERVED_WORDS`' asymmetry; a bare leading zero is here too, since 1.1 reads
 * `007` as octal and 1.2 as seven, and either way it is a number. But a layout
 * called `5e Standard` is a *string* to every resolver there is, and quoting it
 * would change what SPEC §3.1's own example of a character note looks like, so
 * the rule is the grammar rather than the first character.
 */
const NUMBER =
	/^(?:\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F_]+|0[oO][0-7_]+)$/;

/**
 * Whether `value` can be written as a plain scalar — unquoted — and mean the
 * same thing to every reader.
 *
 * **Two readers have to agree about the line this produces**, which is why the
 * predicate is narrow. `parse/character.ts`'s `extractLayoutName` takes the rest
 * of a line, trims it and strips one surrounding pair of quotes, while
 * `view/auto-open.ts` and the **Open as sheet** command read the same key
 * through Obsidian's own YAML in `metadataCache`. A value the two read
 * differently is a note that opens as a sheet and then cannot find its layout.
 * A promoted property has the same requirement from the other end: a Base sorts
 * on a Number and cannot sort on a string that merely looks like one.
 *
 * Three conditions:
 *
 * - **A letter or a digit first**, which rules out every YAML indicator
 *   (`- ? : , [ ] { } # & * ! | > ' " % @` and a backtick) in one condition
 *   rather than a list, and **no `:` or `#` anywhere**, which are the two
 *   characters that turn the rest of a plain scalar into a mapping or a comment.
 * - **No trailing space**: a plain value is trimmed by both readers, so a name
 *   ending in one would come back a different name, where a quoted one comes
 *   back whole. And **no quote, backslash or control character anywhere**,
 *   which is wider than YAML needs — `a"b` is a perfectly legal plain scalar —
 *   and is the invariant this module rests on rather than a reading of the
 *   grammar: a line break inside a plain value would put a second line into a
 *   block whose every other line this scan has to account for, and a value
 *   carrying a quote is one whose spelling the two readers have to agree about
 *   character by character.
 * - **Not a number spelling, not one of YAML's boolean words, not one of its
 *   null words.** This is the half `docs/BACKLOG.md` § Patterns recorded against
 *   the old predicate: it wrote `12`, `No` and `null` unquoted and real YAML
 *   gives those back as a number, a boolean and nothing at all. Both sets are
 *   taken wide — `NUMBER` and `RESERVED_WORDS` above each say why.
 */
export function isPlainScalar(value: string): boolean {
	if (!/^[\p{L}\p{N}][^:#]*$/u.test(value)) return false;
	// `\p{Cc}` rather than the `\u0000-\u001f` range, which is the same set for
	// this purpose and the spelling `no-control-regex` accepts.
	if (/["'\\]|\p{Cc}/u.test(value)) return false;
	if (/[ \t]$/.test(value)) return false;
	if (NUMBER.test(value)) return false;
	return !RESERVED_WORDS.has(value.toLowerCase());
}

/**
 * A value as the YAML scalar that reads back as that exact type, or `null`
 * where it has no spelling at all.
 *
 * `null` is **not** an error and not a refusal: a non-finite number
 * (`NaN`, `±Infinity`) has no scalar Obsidian's property UI has a type for, so
 * the caller treats it as a value that did not resolve and leaves the property
 * exactly as it is. A sheet holding a number it cannot express is in the same
 * position as a sheet holding no number yet.
 *
 * A finite number is `String(value)`. Recorded edge: a magnitude large enough to
 * print in exponent form is written in exponent form, which YAML reads as a
 * float, and no value on a character sheet reaches it.
 */
export function yamlScalar(value: FieldValue): string | null {
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number') {
		return Number.isFinite(value) ? String(value) : null;
	}
	if (isPlainScalar(value)) return value;
	return `"${value
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n')
		.replace(/\t/g, '\\t')}"`;
}

/**
 * Why `key` cannot name a top-level property, as a reason clause a caller
 * finishes its own sentence with — or null where it can.
 *
 * `parse/fenced.ts`'s `fencedKeyProblem` one file over, and for its reason: the
 * *subject* stays the caller's, because only the caller knows whether it is
 * refusing a promoted field's property or something else, while the rule does
 * not vary.
 *
 * **The last condition is an invariant rather than taste.** `KEY_LINE` above
 * requires a letter, a digit or an underscore first, so a key this refuses is
 * one `setFrontmatterKey` could write and then fail to read back — the block
 * would go undecidable on the plugin's own line. An empty key is refused here
 * too, so a caller that only asks this question still cannot write a broken
 * line.
 */
export function frontmatterKeyProblem(key: string): string | null {
	if (key === '') return 'is empty';
	if (/[:#\r\n]/.test(key)) {
		return 'cannot contain a colon, a hash or a line break, because a frontmatter line separates the property from its value with a colon and a hash begins a comment';
	}
	if (/^[ \t]|[ \t]$/.test(key)) {
		return 'cannot begin or end with a space, because a frontmatter reader trims one and the property would come back under a different name';
	}
	if (!/^[\p{L}\p{N}_]/u.test(key)) {
		return 'must begin with a letter, a digit or an underscore, because every other character begins something else in YAML';
	}
	return null;
}

/** Why a write was refused, and which of the three obstacles it hit. */
export type FrontmatterRefusalKind =
	/** The key's own value is not a single line this may replace. */
	| 'value'
	/** The key appears at column 0 twice, so there is no one line to own. */
	| 'repeated'
	/** The block holds something this cannot account for, so no key is safe. */
	| 'block';

export interface FrontmatterRefusal {
	kind: FrontmatterRefusalKind;
	/**
	 * What was found, as a clause a caller finishes its own sentence with:
	 * `this note already has a "level" holding a list`. The fix is the caller's,
	 * because only the caller knows what else the value could have been written
	 * under.
	 */
	found: string;
}

/**
 * What a write did. `'unchanged'` is the ordinary outcome on a sheet whose
 * values have not moved, and is what keeps a render off the note's modified
 * time.
 */
export type FrontmatterWrite =
	| { kind: 'written'; frontmatter: string }
	| { kind: 'unchanged' }
	| { kind: 'refused'; refusal: FrontmatterRefusal };

/** One top-level key line, as the scan found it. */
interface Entry {
	key: string;
	/** Index into the block's lines of the key's own line. */
	index: number;
	/** The value on the key's own line, trimmed. Empty where there is none. */
	value: string;
	/** The first indented line beneath it, where any belongs to this key. */
	lead?: string;
}

type Block =
	| { ok: true; lines: string[]; entries: Entry[]; close: number; ending: string }
	| { ok: false; found: string };

function readBlock(frontmatter: string): Block {
	const lines = splitLines(frontmatter);
	const first = lines[0];
	if (first === undefined || !isFrontmatterDelimiter(first)) {
		return { ok: false, found: 'this note has no frontmatter block to write into' };
	}
	// The block's own line ending, taken from the opening delimiter because that
	// is the one line `splitFrontmatter` guarantees has one. An appended key
	// takes it, so a note written with CRLF stays CRLF.
	const ending = first.slice(lineText(first).length);

	let close = -1;
	for (let i = 1; i < lines.length; i++) {
		if (isFrontmatterDelimiter(lines[i] as string)) {
			close = i;
			break;
		}
	}
	if (close === -1) {
		return { ok: false, found: "this note's frontmatter block is not closed" };
	}

	const entries: Entry[] = [];
	for (let i = 1; i < close; i++) {
		const text = lineText(lines[i] as string);
		if (BLANK.test(text)) continue;
		// Comments before indentation, so an indented `# strength` inside a block
		// mapping is a comment rather than evidence of one.
		if (COMMENT.test(text)) continue;
		if (/^[ \t]/.test(text)) {
			const owner = entries[entries.length - 1];
			if (owner === undefined) {
				return {
					ok: false,
					found: `this note's frontmatter opens with an indented line, which belongs to no property: "${text}"`,
				};
			}
			// Whatever this is — a block sequence, a block mapping, the rest of a
			// folded scalar — it makes the key above it more than one line.
			owner.lead ??= text.trim();
			continue;
		}
		const match = KEY_LINE.exec(text);
		if (!match) {
			return {
				ok: false,
				found: `this note's frontmatter has a line Sheetsmith cannot account for: "${text}"`,
			};
		}
		entries.push({
			key: match[1] as string,
			index: i,
			value: match[2] ?? '',
		});
	}

	return { ok: true, lines, entries, close, ending };
}

/**
 * Why this key's value is not one line the plugin may replace, or null.
 *
 * Every branch is the same rule — the plugin owns one line — and they are told
 * apart only so the sentence a reader gets names what is actually in their note.
 */
function valueProblem(entry: Entry, key: string): string | null {
	const has = (what: string): string =>
		`this note already has a "${key}" ${what}`;
	if (entry.lead !== undefined) {
		if (entry.value !== '') return has('written across several lines');
		return entry.lead.startsWith('-')
			? has('holding a list')
			: has('holding properties of its own');
	}
	const first = entry.value.charAt(0);
	if (first === '[') return has('holding a list');
	if (first === '{') return has('holding properties of its own');
	if (first === '|' || first === '>') {
		return has('written across several lines');
	}
	if (first === '&' || first === '*' || first === '!') {
		return has('carrying a YAML anchor, alias or tag');
	}
	return null;
}

function refused(kind: FrontmatterRefusalKind, found: string): FrontmatterWrite {
	return { kind: 'refused', refusal: { kind, found } };
}

/**
 * The one key of the block this call is allowed to touch, or the reason it may
 * not be touched.
 *
 * Shared by the two writers because the refusals are the same three and have to
 * read the same way whichever direction the write goes.
 */
function locate(
	frontmatter: string,
	key: string,
):
	| { ok: true; block: Extract<Block, { ok: true }>; entry: Entry | undefined }
	| { ok: false; write: FrontmatterWrite } {
	const block = readBlock(frontmatter);
	if (!block.ok) return { ok: false, write: refused('block', block.found) };
	const found = block.entries.filter((entry) => entry.key === key);
	if (found.length > 1) {
		return {
			ok: false,
			write: refused(
				'repeated',
				`this note has "${key}" twice in its frontmatter`,
			),
		};
	}
	const entry = found[0];
	if (entry !== undefined) {
		const problem = valueProblem(entry, key);
		if (problem !== null) {
			return { ok: false, write: refused('value', problem) };
		}
	}
	return { ok: true, block, entry };
}

/**
 * Write `key: <scalar>` into the block, changing nothing else.
 *
 * An absent key is appended as a new column-0 line immediately before the
 * closing `---`; existing keys stay exactly where they are and nothing is
 * reordered, so several keys added in one pass arrive in the order the caller
 * asks for them.
 *
 * A rewrite keeps the line's own ending, so a CRLF note stays CRLF. It does
 * **not** keep the line's own spacing after the colon: `level:5` becomes
 * `level: 5` once and then stays, because the line is the plugin's and its
 * spelling is part of what the plugin is asserting.
 *
 * `scalar` is already a YAML scalar — `yamlScalar` above is what produces one.
 * This function does no quoting of its own, so there is exactly one place that
 * decides what a value's type will be when it is read back.
 */
export function setFrontmatterKey(
	frontmatter: string,
	key: string,
	scalar: string,
): FrontmatterWrite {
	const located = locate(frontmatter, key);
	if (!located.ok) return located.write;
	const { block, entry } = located;
	const line = `${key}: ${scalar}`;

	if (entry === undefined) {
		const lines = block.lines.slice();
		lines.splice(block.close, 0, line + block.ending);
		return { kind: 'written', frontmatter: lines.join('') };
	}

	const existing = block.lines[entry.index] as string;
	const text = lineText(existing);
	// The change guard, and it is a comparison of *lines* rather than of values:
	// no YAML is read back, so a second render writes nothing by construction.
	if (text === line) return { kind: 'unchanged' };
	const lines = block.lines.slice();
	lines[entry.index] = line + existing.slice(text.length);
	return { kind: 'written', frontmatter: lines.join('') };
}

/**
 * Take `key` out of the block, changing nothing else.
 *
 * A key the block does not hold is `'unchanged'` rather than an error: the
 * caller's claim on that property is already satisfied. A key holding a
 * structure is refused on exactly the argument `setFrontmatterKey` refuses one
 * — a list the user built under that property cannot be told from a scalar
 * afterwards, and deleting it would be the one loss this design must not risk.
 */
export function removeFrontmatterKey(
	frontmatter: string,
	key: string,
): FrontmatterWrite {
	const located = locate(frontmatter, key);
	if (!located.ok) return located.write;
	const { block, entry } = located;
	if (entry === undefined) return { kind: 'unchanged' };
	const lines = block.lines.slice();
	lines.splice(entry.index, 1);
	return { kind: 'written', frontmatter: lines.join('') };
}

/**
 * Why no key of this block may be written at all, or null where any may.
 *
 * Exported so a caller writing several keys reports the block once rather than
 * once per key: a block this cannot account for refuses every property for one
 * reason, and repeating that reason per property would be a notice that grows
 * with the layout while saying one thing.
 */
export function frontmatterBlockProblem(frontmatter: string): string | null {
	const block = readBlock(frontmatter);
	return block.ok ? null : block.found;
}
