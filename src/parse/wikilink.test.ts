import { describe, expect, it } from 'vitest';
import {
	displayText,
	hasLink,
	parseLinks,
	segmentSource,
	TextSegment,
} from './wikilink';

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
