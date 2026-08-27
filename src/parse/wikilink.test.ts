import { describe, expect, it } from 'vitest';
import {
	displayText,
	hasLink,
	parseEmbed,
	parseLinks,
	segmentSource,
	TextSegment,
} from './wikilink';
import { readFenced } from './fenced';

/*
 * The syntax half of a rendered link. Nothing here touches a file, so the
 * byte-identical promise is not in play — but the invariant that stands in for
 * it is, because a scanner over bracket pairs is exactly the kind of code that
 * drops a character on the way to the screen.
 */

/** Every shape worth scanning, and the input each one is cut from. */
const INPUTS = [
	'',
	'plain text',
	'[[Sunblade]]',
	'[[Sunblade|sword]]',
	'[[Note#Heading]]',
	'[[Note#Heading|the bit that matters]]',
	'carried in [[Bag of Holding]] today',
	'[[Dagger]] and [[Dagger]]',
	'[[a]][[b]]',
	'[[unclosed',
	'unopened]]',
	'[[]]',
	'[[ | ]]',
	'[[Note|]]',
	'![[Portrait.png]]',
	'[[[[Note]]',
	'a | b',
	'[[Bread | Cheese|snacks]]',
	'trailing [[',
];

describe('parseLinks', () => {
	it('returns the input byte for byte when the segments are rejoined', () => {
		// The module's one invariant. Asserted over the whole table rather than
		// per case, because the failure it guards is a character lost in a shape
		// nobody thought to write a case for.
		for (const input of INPUTS) {
			expect(parseLinks(input).map(segmentSource).join('')).toBe(input);
		}
	});

	it('reads a bare link', () => {
		expect(parseLinks('[[Sunblade]]')).toEqual([
			{ kind: 'link', raw: '[[Sunblade]]', target: 'Sunblade', display: 'Sunblade' },
		]);
	});

	it('reads an aliased link, showing the alias', () => {
		expect(parseLinks('[[Sunblade|sword]]')).toEqual([
			{ kind: 'link', raw: '[[Sunblade|sword]]', target: 'Sunblade', display: 'sword' },
		]);
	});

	it('keeps a subpath in the target, since that is what resolves', () => {
		expect(parseLinks('[[Note#Heading]]')).toEqual([
			{
				kind: 'link',
				raw: '[[Note#Heading]]',
				target: 'Note#Heading',
				display: 'Note#Heading',
			},
		]);
	});

	it('keeps the prose around a link', () => {
		expect(parseLinks('carried in [[Bag of Holding]] today')).toEqual([
			{ kind: 'text', text: 'carried in ' },
			{
				kind: 'link',
				raw: '[[Bag of Holding]]',
				target: 'Bag of Holding',
				display: 'Bag of Holding',
			},
			{ kind: 'text', text: ' today' },
		]);
	});

	it('reads two links in one cell', () => {
		const kinds = parseLinks('[[a]] then [[b]]').map((segment) => segment.kind);
		expect(kinds).toEqual(['link', 'text', 'link']);
	});

	it('leaves syntax that is not a link as text', () => {
		const asText = (input: string): TextSegment[] => [{ kind: 'text', text: input }];
		expect(parseLinks('[[unclosed')).toEqual(asText('[[unclosed'));
		expect(parseLinks('[[]]')).toEqual(asText('[[]]'));
		expect(parseLinks('[[ | ]]')).toEqual(asText('[[ | ]]'));
		// A pipe on its own is ordinary text in a cell, since `readTable`
		// unescapes the note's `\|` before any of this sees it.
		expect(parseLinks('a | b')).toEqual(asText('a | b'));
	});

	it('leaves an embed as text', () => {
		// A row cannot hold an embedded image without breaking its own height,
		// and drawing it as a link would say something false about the note.
		expect(parseLinks('![[Portrait.png]]')).toEqual([
			{ kind: 'text', text: '![[Portrait.png]]' },
		]);
	});

	it('takes the inner pair where brackets nest', () => {
		// What Obsidian shows for the same text: two characters, then a link.
		expect(parseLinks('[[[[Note]]')).toEqual([
			{ kind: 'text', text: '[[' },
			{ kind: 'link', raw: '[[Note]]', target: 'Note', display: 'Note' },
		]);
	});

	it('falls back to the target where the alias is empty', () => {
		// A typo on the way to an alias. An empty alias would draw a link with
		// nothing in it: unreadable and unclickable at once.
		expect(parseLinks('[[Note|]]')).toEqual([
			{ kind: 'link', raw: '[[Note|]]', target: 'Note', display: 'Note' },
		]);
	});

	it('takes the first pipe as the separator', () => {
		expect(parseLinks('[[Bread | Cheese|snacks]]')).toEqual([
			{
				kind: 'link',
				raw: '[[Bread | Cheese|snacks]]',
				target: 'Bread',
				display: 'Cheese|snacks',
			},
		]);
	});
});

describe('displayText', () => {
	it('reduces every link to what it reads as', () => {
		// The counterpart to the rejoin invariant: source for the file, display for
		// anything that has to say the text rather than draw it.
		expect(displayText('[[Sunblade|sword]]')).toBe('sword');
		expect(displayText('[[Sunblade]]')).toBe('Sunblade');
		expect(displayText('carried in [[Bag of Holding]] today')).toBe(
			'carried in Bag of Holding today',
		);
		expect(displayText('plain text')).toBe('plain text');
		// Not a link, so not reduced: what is shown is what is written.
		expect(displayText('![[Portrait.png]]')).toBe('![[Portrait.png]]');
		expect(displayText('[[unclosed')).toBe('[[unclosed');
	});
});

describe('hasLink', () => {
	it('answers what the caller needs to know before it builds anything', () => {
		// A cell with no link renders exactly as it does today, so this is the
		// question that decides whether any of the display machinery exists.
		expect(hasLink('[[Sunblade|sword]]')).toBe(true);
		expect(hasLink('plain text')).toBe(false);
		expect(hasLink('')).toBe(false);
		expect(hasLink('![[Portrait.png]]')).toBe(false);
	});
});


describe('parseEmbed', () => {
	/*
	 * The form `parseLinks` refuses, read the other way round: a body whose whole
	 * value is one embed.
	 */
	it('reads a plain embed', () => {
		expect(parseEmbed('![[Portrait.png]]')).toBe('Portrait.png');
	});

	it('reads past the size hints Obsidian\'s own syntax allows', () => {
		// `|100` and `|640x480` are the convergent vocabulary — Obsidian's own, and
		// what every analogue arrived at. The component preserves them in the file
		// and ignores them on the sheet, so what this has to do is not choke.
		expect(parseEmbed('![[Portrait.png|200]]')).toBe('Portrait.png');
		expect(parseEmbed('![[Portrait.png|200x300]]')).toBe('Portrait.png');
		// And a caption-shaped one, which is the third thing a pipe carries.
		expect(parseEmbed('![[Portrait.png|Sildar, in better days]]')).toBe(
			'Portrait.png',
		);
	});

	it('keeps a subpath, as a link does', () => {
		// One reading of a target across both forms: `#` is the app's, not ours.
		expect(parseEmbed('![[Notes#Portrait]]')).toBe('Notes#Portrait');
	});

	it('reads a body with its own whitespace around it', () => {
		// The section body arrives with the note's framing on it.
		expect(parseEmbed('\n![[Portrait.png]]\n')).toBe('Portrait.png');
		expect(parseEmbed('\r\n  ![[Portrait.png]]  \r\n')).toBe('Portrait.png');
	});

	/**
	 * Every spelling refused, and why each one is a decision rather than a gap.
	 *
	 * A table rather than prose because the refusals are the interesting half:
	 * four of these are what the closest analogues accept, and each is a way a
	 * vault reference goes stale silently.
	 */
	const REFUSED: Record<string, string> = {
		'a link, which is not an embed': '[[Portrait.png]]',
		'markdown\'s own image syntax': '![](Portrait.png)',
		'a remote URL': '![](https://example.com/p.png)',
		'a bare path': 'Portrait.png',
		'a bare path in quotes': '"Portrait.png"',
		'prose': 'A picture goes here.',
		'nothing': '',
		'whitespace': '\n  \n',
		'an embed with no target': '![[]]',
		'an embed with a blank target': '![[ | ]]',
		'an unclosed embed': '![[Portrait.png',
		'brackets inside the pair': '![[[[Portrait.png]]',
		'two embeds': '![[a.png]] ![[b.png]]',
		'an embed with a sentence after it': '![[a.png]] and more',
		'an embed with a sentence before it': 'see ![[a.png]]',
	};

	it.each(Object.entries(REFUSED))('refuses %s', (_name, text) => {
		expect(parseEmbed(text)).toBeNull();
	});

	it('reads a target it is not this module\'s business to refuse', () => {
		/*
		 * `![[https://…]]` is embed *syntax* holding something the component will
		 * not accept, and the two are deliberately different answers. Refusing it
		 * here would make it indistinguishable from "this body is not an embed" —
		 * and the reader needs to be told two different things: a typo in a
		 * filename is fixed by editing the filename, while a web address is fixed
		 * by putting the picture in a Rich text block instead. So this reads the
		 * syntax and `image.ts` holds the policy, exactly as `card.ts` validates
		 * its own storage key rather than asking `fenced.ts` to.
		 */
		expect(parseEmbed('![[https://example.com/p.png]]')).toBe(
			'https://example.com/p.png',
		);
	});

	it('agrees with parseLinks about what a target is', () => {
		// Two readings of one syntax is the drift this module exists to prevent, so
		// the embed reader goes through the link reader rather than beside it.
		const [link] = parseLinks('[[Notes#Portrait|shown]]');
		if (link?.kind !== 'link') throw new Error('expected a link');
		expect(parseEmbed('![[Notes#Portrait|shown]]')).toBe(link.target);
	});
});

describe('why an embed is not stored in a fence (Fantasy Statblocks 97)', () => {
	/*
	 * SPEC §4.2 gave Image `fenced` storage holding "a path or wikilink", and the
	 * feature spec amended it to `markdown` on Constraint 2. This is the evidence,
	 * driven rather than argued: both spellings that broke the closest analogue,
	 * through the parser that would have held them here.
	 *
	 * Fantasy Statblocks 97 reports `image: "[[image.jpg]]"` rendering nothing and
	 * `image: [[image.jpg]]` crashing with `SyntaxError: Unexpected token < in JSON
	 * at position 326`. **Neither failure reproduces here, and that is the point
	 * worth pinning:** `readFenced` keeps values as raw strings and JSON-parses
	 * nothing, so there is no crash to inherit and the quoted form is not silently
	 * different from the bare one. The fence would have *worked* — which is exactly
	 * why the objection had to be Constraint 2's rather than the parser's.
	 */
	const SPELLINGS = {
		quoted: '```sheet\nimage: "[[Portrait.png]]"\n```\n',
		bare: '```sheet\nimage: [[Portrait.png]]\n```\n',
	};

	it('reads both spellings without crashing on either', () => {
		for (const body of Object.values(SPELLINGS)) {
			const parsed = readFenced(body);
			expect(parsed.ok).toBe(true);
		}
	});

	it('keeps them as raw strings, so the two are not the same value', () => {
		// The quoted one keeps its quotes, which is what would have made a reader
		// of this entry need a second unquoting rule — one more place to disagree
		// with the app about what a target is.
		const quoted = readFenced(SPELLINGS.quoted);
		const bare = readFenced(SPELLINGS.bare);
		if (!quoted.ok || !bare.ok) throw new Error('expected both to parse');
		expect(quoted.values?.get('image')).toBe('"[[Portrait.png]]"');
		expect(bare.values?.get('image')).toBe('[[Portrait.png]]');
	});

	it('leaves the link inside a fence, where Obsidian does not index it', () => {
		/*
		 * The whole objection, and the only one that survives: the brackets are
		 * inside a ``` block, so backlinks, graph view, hover preview and
		 * **rename propagation** all break with no warning (CLAUDE.md 2). A picture
		 * is the reference most likely to be renamed, so this is the failure class
		 * every image issue in the research belongs to.
		 *
		 * Asserted as a property of the text rather than of a component: the fence
		 * markers are on their own lines and the link is between them, which is
		 * precisely the shape Obsidian's indexer skips.
		 */
		for (const body of Object.values(SPELLINGS)) {
			const lines = body.split('\n');
			const open = lines.findIndex((line) => line.startsWith('```sheet'));
			const close = lines.findIndex(
				(line, at) => at > open && line.startsWith('```'),
			);
			const linked = lines.findIndex((line) => line.includes('[[Portrait.png]]'));
			expect(open).toBeGreaterThanOrEqual(0);
			expect(linked).toBeGreaterThan(open);
			expect(linked).toBeLessThan(close);
		}
	});
});
