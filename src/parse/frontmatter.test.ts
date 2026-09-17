import { describe, expect, it } from 'vitest';
import {
	frontmatterBlockProblem,
	frontmatterKeyProblem,
	FrontmatterWrite,
	isPlainScalar,
	removeFrontmatterKey,
	setFrontmatterKey,
	yamlScalar,
} from './frontmatter';
import { parseCharacter, serialiseCharacter, withLayoutName } from './character';

/*
 * Contract for the frontmatter writer (SPEC §9).
 *
 * This is the module Constraint 3 is most exposed by: it is the only thing in
 * the plugin that edits a note's frontmatter, and the whole promise is that a
 * write touches one line and carries every other byte through. Nothing here
 * imports `obsidian`, so the byte-level claims are checked without launching the
 * app (Constraint 5).
 *
 * Every refusal is a named case rather than a table driven off an exported set:
 * a test that iterates the shapes the implementation knows about passes after
 * one of them is deleted, because the deletion takes the iteration with it.
 */

/** A block with every kind of byte this writer has to leave alone in it. */
const BLOCK = [
	'---',
	'aliases:',
	'  - Ara',
	'# who this is',
	"player: 'Ana'",
	'tags: [party, active]',
	'sheet-layout: DnD 5e Standard',
	'---',
	'',
].join('\n');

/** The frontmatter of a note, after a write, or the reason there was none. */
function written(result: FrontmatterWrite): string {
	if (result.kind !== 'written') {
		throw new Error(`expected a write, got ${JSON.stringify(result)}`);
	}
	return result.frontmatter;
}

/** How many lines differ between two blocks of the same shape. */
function changedLines(before: string, after: string): string[] {
	const was = before.split('\n');
	return after.split('\n').filter((line, index) => was[index] !== line);
}

describe('setFrontmatterKey on a key the block already holds', () => {
	it('changes that one line and no other byte', () => {
		const after = written(
			setFrontmatterKey(BLOCK, 'sheet-layout', 'Other sheet'),
		);
		expect(after).toBe(BLOCK.replace('DnD 5e Standard', 'Other sheet'));
		// Stated as a count as well, because the replace above would also pass
		// for a writer that happened to rebuild the block identically.
		expect(changedLines(BLOCK, after)).toEqual(['sheet-layout: Other sheet']);
	});

	it('leaves a comment, a single-quoted value and an inline array alone', () => {
		// The reason this module exists rather than `processFrontMatter`, which
		// re-emits all three through js-yaml.
		const after = written(setFrontmatterKey(BLOCK, 'player', '"Bo"'));
		expect(after).toContain('# who this is');
		expect(after).toContain('tags: [party, active]');
		expect(after).toContain('  - Ara');
		expect(changedLines(BLOCK, after)).toEqual(['player: "Bo"']);
	});

	it('keeps the line’s own ending, so a CRLF note stays CRLF', () => {
		const source = '---\r\nlevel: 2\r\nsheet-layout: Alpha\r\n---\r\n';
		expect(written(setFrontmatterKey(source, 'level', '3'))).toBe(
			source.replace('level: 2', 'level: 3'),
		);
	});

	it('rewrites the plugin’s own spelling over a hand-written one', () => {
		// `level:5` is the plugin's line to own, and its spacing is part of what
		// the plugin is asserting — the same rule `withLayoutName` applies to a
		// hand-written `sheet-layout:Old`.
		expect(written(setFrontmatterKey('---\nlevel:5\n---\n', 'level', '5'))).toBe(
			'---\nlevel: 5\n---\n',
		);
	});

	it('reports unchanged where the line it would emit is the line already there', () => {
		// The guard the whole cadence rests on: a render that changes nothing
		// must not touch the note's modified time.
		expect(setFrontmatterKey(BLOCK, 'sheet-layout', 'DnD 5e Standard')).toEqual(
			{ kind: 'unchanged' },
		);
	});

	it('rewrites a value that means the same thing spelled differently', () => {
		// The sheet owns the spelling, because the spelling is the type: a Base
		// cannot sort on `"5"`.
		expect(written(setFrontmatterKey('---\nlevel: "5"\n---\n', 'level', '5'))).toBe(
			'---\nlevel: 5\n---\n',
		);
	});
});

describe('setFrontmatterKey on a key the block does not hold', () => {
	it('appends it as the last line before the closing delimiter', () => {
		expect(written(setFrontmatterKey(BLOCK, 'level', '5'))).toBe(
			BLOCK.replace(
				'sheet-layout: DnD 5e Standard\n---',
				'sheet-layout: DnD 5e Standard\nlevel: 5\n---',
			),
		);
	});

	it('moves no existing key', () => {
		const after = written(setFrontmatterKey(BLOCK, 'level', '5'));
		const keys = after
			.split('\n')
			.filter((line) => /^[a-z-]+:/.test(line))
			.map((line) => line.split(':')[0]);
		expect(keys).toEqual(['aliases', 'player', 'tags', 'sheet-layout', 'level']);
	});

	it('arrives in the order it is asked for where several are appended in one pass', () => {
		let block = '---\nsheet-layout: Alpha\n---\n';
		for (const [key, scalar] of [
			['level', '5'],
			['hp', '12'],
			['ac', '16'],
		]) {
			block = written(setFrontmatterKey(block, key as string, scalar as string));
		}
		expect(block).toBe(
			'---\nsheet-layout: Alpha\nlevel: 5\nhp: 12\nac: 16\n---\n',
		);
	});

	it('takes the block’s own line ending for the appended line', () => {
		expect(
			written(setFrontmatterKey('---\r\nsheet-layout: Alpha\r\n---\r\n', 'level', '5')),
		).toBe('---\r\nsheet-layout: Alpha\r\nlevel: 5\r\n---\r\n');
	});

	it('does not read an indented key of the same name as the top-level one', () => {
		// The whole reason the scan is column-0 only: `  level: 3` belongs to
		// `stats`, and writing the top-level `level` must not reach it.
		const source = '---\nsheet-layout: Alpha\nstats:\n  level: 3\n---\n';
		expect(written(setFrontmatterKey(source, 'level', '5'))).toBe(
			'---\nsheet-layout: Alpha\nstats:\n  level: 3\nlevel: 5\n---\n',
		);
	});
});

describe('the scalar a value is written as', () => {
	it('writes a number unquoted, so a Base can sort on it', () => {
		expect(yamlScalar(5)).toBe('5');
		expect(yamlScalar(-2)).toBe('-2');
		expect(yamlScalar(13.5)).toBe('13.5');
	});

	it('writes a boolean unquoted', () => {
		expect(yamlScalar(true)).toBe('true');
		expect(yamlScalar(false)).toBe('false');
	});

	it('has no spelling for a number YAML cannot express', () => {
		// Not an error and not a removal: the caller reads `null` as "this did
		// not resolve" and leaves the property exactly as it is.
		expect(yamlScalar(Number.NaN)).toBeNull();
		expect(yamlScalar(Number.POSITIVE_INFINITY)).toBeNull();
		expect(yamlScalar(Number.NEGATIVE_INFINITY)).toBeNull();
	});

	it('writes an ordinary word plain', () => {
		expect(yamlScalar('Fighter')).toBe('Fighter');
		expect(yamlScalar('chain mail, shield')).toBe('chain mail, shield');
	});

	/*
	 * Each spelling written out literally rather than iterated from an exported
	 * set, on `docs/PATTERNS.md` §10's rule: a test walking the set passes after
	 * a member is deleted from it.
	 *
	 * The first three are `docs/BACKLOG.md` § Patterns' own row against the
	 * predicate that used to live in `character.ts` — it wrote `12`, `No` and
	 * `null` unquoted and real YAML gives those back as a number, a boolean and
	 * nothing at all. `yes` and `on` are the same fault taken wide, on YAML
	 * 1.1's boolean set rather than 1.2's, so which js-yaml version Obsidian
	 * ships is something this plugin does not have to know.
	 */
	it('quotes a string that would otherwise read as a number', () => {
		expect(yamlScalar('12')).toBe('"12"');
		expect(yamlScalar('13.5')).toBe('"13.5"');
		// Wide, on the asymmetry the predicate rests on: these are numbers to
		// some resolver and a needless quote costs nothing.
		expect(yamlScalar('1e3')).toBe('"1e3"');
		expect(yamlScalar('0x1f')).toBe('"0x1f"');
		expect(yamlScalar('1_000')).toBe('"1_000"');
		expect(yamlScalar('007')).toBe('"007"');
	});

	it('leaves a digit-led value that is not a number plain', () => {
		// The other end of the same rule, and the reason it is a grammar rather
		// than "starts with a digit": `5e Standard` is a string to every
		// resolver there is, and SPEC §3.1's own example of a character note is
		// a layout named like one.
		expect(yamlScalar('5e Standard')).toBe('5e Standard');
		expect(yamlScalar('3 arrows')).toBe('3 arrows');
	});

	it('quotes a string that would otherwise read as a boolean', () => {
		expect(yamlScalar('No')).toBe('"No"');
		expect(yamlScalar('yes')).toBe('"yes"');
		expect(yamlScalar('on')).toBe('"on"');
	});

	it('quotes a string that would otherwise read as nothing at all', () => {
		expect(yamlScalar('null')).toBe('"null"');
		expect(yamlScalar('~')).toBe('"~"');
	});

	it('quotes the empty string', () => {
		expect(yamlScalar('')).toBe('""');
	});

	it('quotes a string holding a colon or a hash', () => {
		expect(yamlScalar('a: b')).toBe('"a: b"');
		expect(yamlScalar('# x')).toBe('"# x"');
	});

	it('quotes a string whose padding a reader would trim away', () => {
		expect(yamlScalar(' pad')).toBe('" pad"');
		expect(yamlScalar('pad ')).toBe('"pad "');
	});

	it('escapes a quote and a backslash inside a quoted string', () => {
		expect(yamlScalar('quote"inside')).toBe('"quote\\"inside"');
		expect(yamlScalar('back\\slash')).toBe('"back\\\\slash"');
	});

	it('escapes a newline and a tab rather than writing a line this cannot read back', () => {
		expect(yamlScalar('two\nlines')).toBe('"two\\nlines"');
		expect(yamlScalar('a\tb')).toBe('"a\\tb"');
	});

	it('writes what it quotes onto one line, whatever the value held', () => {
		// The invariant the escaping is for: a written block still reads back.
		const after = written(
			setFrontmatterKey('---\nsheet-layout: Alpha\n---\n', 'note', yamlScalar('two\nlines') as string),
		);
		expect(after).toBe(
			'---\nsheet-layout: Alpha\nnote: "two\\nlines"\n---\n',
		);
		expect(frontmatterBlockProblem(after)).toBeNull();
	});
});

describe('a value this writer refuses to replace', () => {
	function refusal(source: string, key = 'level'): string {
		const result = setFrontmatterKey(source, key, '5');
		if (result.kind !== 'refused') {
			throw new Error(`expected a refusal, got ${JSON.stringify(result)}`);
		}
		return result.refusal.found;
	}

	/** Every refusal leaves the note exactly as it was, which is the point. */
	function leavesItAlone(source: string, key = 'level'): void {
		expect(setFrontmatterKey(source, key, '5')).toMatchObject({
			kind: 'refused',
		});
		expect(removeFrontmatterKey(source, key)).toMatchObject({
			kind: 'refused',
		});
	}

	it('refuses a block sequence', () => {
		const source = '---\nlevel:\n  - one\n  - two\n---\n';
		expect(refusal(source)).toBe('this note already has a "level" holding a list');
		leavesItAlone(source);
	});

	it('refuses a block mapping', () => {
		const source = '---\nlevel:\n  fighter: 3\n---\n';
		expect(refusal(source)).toBe(
			'this note already has a "level" holding properties of its own',
		);
		leavesItAlone(source);
	});

	it('refuses a flow sequence', () => {
		const source = '---\nlevel: [3, 2]\n---\n';
		expect(refusal(source)).toBe('this note already has a "level" holding a list');
		leavesItAlone(source);
	});

	it('refuses a flow mapping', () => {
		const source = '---\nlevel: { fighter: 3 }\n---\n';
		expect(refusal(source)).toBe(
			'this note already has a "level" holding properties of its own',
		);
		leavesItAlone(source);
	});

	it('refuses a literal block scalar', () => {
		const source = '---\nlevel: |\n  three\n---\n';
		expect(refusal(source)).toBe(
			'this note already has a "level" written across several lines',
		);
		leavesItAlone(source);
	});

	it('refuses a folded block scalar', () => {
		const source = '---\nlevel: >\n  three\n---\n';
		expect(refusal(source)).toBe(
			'this note already has a "level" written across several lines',
		);
		leavesItAlone(source);
	});

	it('refuses a folded plain scalar that runs onto a second line', () => {
		const source = '---\nlevel: three\n  and a bit\n---\n';
		expect(refusal(source)).toBe(
			'this note already has a "level" written across several lines',
		);
		leavesItAlone(source);
	});

	it('refuses an anchor', () => {
		const source = '---\nlevel: &base 3\n---\n';
		expect(refusal(source)).toBe(
			'this note already has a "level" carrying a YAML anchor, alias or tag',
		);
		leavesItAlone(source);
	});

	it('refuses an alias', () => {
		leavesItAlone('---\nlevel: *base\n---\n');
	});

	it('refuses an explicit tag', () => {
		leavesItAlone('---\nlevel: !!str 3\n---\n');
	});

	it('refuses a key the block holds twice', () => {
		const source = '---\nlevel: 3\nplayer: Ana\nlevel: 4\n---\n';
		expect(refusal(source)).toBe('this note has "level" twice in its frontmatter');
		leavesItAlone(source);
	});
});

describe('a frontmatter block this writer cannot account for', () => {
	it('refuses every key where a column-0 line is neither blank, a comment nor a key', () => {
		// A sequence item at column 0 is legal YAML and is exactly what this
		// scan cannot tell apart from a key, so the block is refused whole
		// rather than half-read.
		const source = '---\ntags:\n- party\n---\n';
		expect(frontmatterBlockProblem(source)).toBe(
			'this note\'s frontmatter has a line Sheetsmith cannot account for: "- party"',
		);
		expect(setFrontmatterKey(source, 'level', '5')).toMatchObject({
			kind: 'refused',
			refusal: { kind: 'block' },
		});
	});

	it('refuses a block whose first content line is indented', () => {
		expect(frontmatterBlockProblem('---\n  stray: 1\n---\n')).toContain(
			'belongs to no property',
		);
	});

	it('refuses a note with no frontmatter block at all', () => {
		expect(frontmatterBlockProblem('Just prose.\n')).toBe(
			'this note has no frontmatter block to write into',
		);
	});

	it('refuses a block that is never closed', () => {
		expect(frontmatterBlockProblem('---\nlevel: 3\n')).toBe(
			"this note's frontmatter block is not closed",
		);
	});

	it('accounts for a comment at any indentation', () => {
		// An indented comment inside a block mapping is routine, and one under a
		// scalar key must not be read as evidence the key holds a block.
		expect(
			frontmatterBlockProblem('---\nstats:\n  # strength\n  str: 8\n---\n'),
		).toBeNull();
		expect(
			written(setFrontmatterKey('---\nlevel: 3\n  # why\n---\n', 'level', '5')),
		).toBe('---\nlevel: 5\n  # why\n---\n');
	});

	it('accounts for a blank line between properties', () => {
		expect(
			frontmatterBlockProblem('---\nlevel: 3\n\nplayer: Ana\n---\n'),
		).toBeNull();
	});
});

describe('removeFrontmatterKey', () => {
	it('takes out that one line and no other byte', () => {
		expect(written(removeFrontmatterKey(BLOCK, 'player'))).toBe(
			BLOCK.replace("player: 'Ana'\n", ''),
		);
	});

	it('reports unchanged for a key the block does not hold', () => {
		expect(removeFrontmatterKey(BLOCK, 'level')).toEqual({ kind: 'unchanged' });
	});

	it('leaves the delimiters where a block empties out', () => {
		expect(written(removeFrontmatterKey('---\nlevel: 3\n---\n', 'level'))).toBe(
			'---\n---\n',
		);
	});
});

describe('what may name a property', () => {
	it('accepts an ordinary name', () => {
		expect(frontmatterKeyProblem('hp_max')).toBeNull();
		expect(frontmatterKeyProblem('armour class')).toBeNull();
		expect(frontmatterKeyProblem('2e-level')).toBeNull();
	});

	it('refuses an empty name', () => {
		expect(frontmatterKeyProblem('')).toBe('is empty');
	});

	it('refuses a colon, a hash and a line break', () => {
		expect(frontmatterKeyProblem('a:b')).toContain('colon');
		expect(frontmatterKeyProblem('a#b')).toContain('hash');
		expect(frontmatterKeyProblem('a\nb')).toContain('line break');
	});

	it('refuses padding a reader would trim away', () => {
		expect(frontmatterKeyProblem(' hp')).toContain('space');
		expect(frontmatterKeyProblem('hp ')).toContain('space');
	});

	it('refuses a name beginning with a YAML indicator', () => {
		// The invariant, not taste: a key this accepted and the scan then could
		// not read back would make the block undecidable on the plugin's own
		// line.
		expect(frontmatterKeyProblem('-hp')).toContain('must begin with');
		expect(frontmatterKeyProblem('[hp]')).toContain('must begin with');
	});

	it('accepts exactly the names a written block reads back', () => {
		for (const key of ['hp', 'hp_max', 'armour class', '2e-level']) {
			const after = written(
				setFrontmatterKey('---\nsheet-layout: Alpha\n---\n', key, '5'),
			);
			expect(frontmatterBlockProblem(after)).toBeNull();
			expect(setFrontmatterKey(after, key, '5')).toEqual({ kind: 'unchanged' });
		}
	});
});

describe('the layout key reads the shared plain-value rule', () => {
	/*
	 * `docs/BACKLOG.md` § Patterns' row against `isPlainLayoutValue`, closed in
	 * the direction the row itself names: the predicate quotes what a bool or a
	 * number resolver would take. The three names below are the three the row
	 * lists, and what makes the change safe in both directions is that
	 * `extractLayoutName` already strips one surrounding pair of quotes.
	 */
	for (const name of ['12', 'No', 'null']) {
		it(`writes a layout named ${name} quoted, and reads it back whole`, () => {
			const note = withLayoutName(
				parseCharacter('---\nsheet-layout: Alpha\n---\n'),
				name,
			);
			expect(serialiseCharacter(note)).toBe(
				`---\nsheet-layout: "${name}"\n---\n`,
			);
			expect(parseCharacter(serialiseCharacter(note)).layoutName).toBe(name);
		});
	}

	it('still writes an ordinary layout name plain', () => {
		expect(isPlainScalar('DnD 5e Standard')).toBe(true);
		expect(
			serialiseCharacter(
				withLayoutName(
					parseCharacter('---\nsheet-layout: Alpha\n---\n'),
					'DnD 5e Standard',
				),
			),
		).toBe('---\nsheet-layout: DnD 5e Standard\n---\n');
	});

	it('leaves a layout name that merely starts with a digit plain', () => {
		// The rule is YAML's number grammar rather than the first character, so
		// the names this plugin's own starters ship under are untouched.
		expect(isPlainScalar('5e Basic')).toBe(true);
		expect(
			serialiseCharacter(
				withLayoutName(
					parseCharacter('---\nsheet-layout: Alpha\n---\n'),
					'5e Basic',
				),
			),
		).toBe('---\nsheet-layout: 5e Basic\n---\n');
	});
});
