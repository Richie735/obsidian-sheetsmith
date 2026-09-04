import { describe, expect, it } from 'vitest';
import { EMBED_PLACEHOLDER, embedRefusal } from './embed-rule';

/*
 * The four refusals SPEC §4.2's Image entry names, driven at the module rather
 * than through either component.
 *
 * **A test file of its own, which is `docs/PATTERNS.md` §10's default rather than
 * one of its three exceptions.** This is not a gesture, so there is no control it
 * can only be driven through; it is not a vocabulary, since `addressed`'s
 * ordering is an algorithm with a bug in its history rather than a constant
 * equalling itself; and it is not a note-format primitive, because nothing here
 * is about bytes in a file — `parse/wikilink.ts` owns that half and has its own
 * cases. What its two consumers hold is the other half: where the message is
 * drawn, that the field survives it, and that no `read` fails for it.
 */

describe('embedRefusal', () => {
	it('refuses nothing for no text at all', () => {
		// PATTERNS §4: a missing value is an editable empty state and never an
		// error. The clause lives here rather than at three call sites, which is
		// where it used to be — the fact was shared and one clause of its
		// application was left behind (§1).
		for (const source of ['', ' ', '\n', '  \n\t\n ']) {
			expect(embedRefusal(source), JSON.stringify(source)).toBeNull();
		}
	});

	it('accepts an embed, with or without pipe options', () => {
		for (const source of [
			'![[Portrait.png]]',
			'![[Portrait.png|200x300]]',
			'![[Art/Portrait.png]]',
			'  ![[Portrait.png]]  ',
			EMBED_PLACEHOLDER,
		]) {
			expect(embedRefusal(source), source).toBeNull();
		}
	});

	it('refuses a bare path, and names the bracket form as the fix', () => {
		// The spelling every analogue accepts and the one that goes stale silently:
		// rename the file and the sheet shows nothing, with nothing saying why.
		expect(embedRefusal('Portrait.png')).toBe(
			'A picture is an embed: ![[Portrait.png]].',
		);
	});

	it('refuses markdown\'s own local image syntax the same way', () => {
		// `![](path)` does not propagate on rename either, which is the whole
		// reason the value is an embed.
		expect(embedRefusal('![](Portrait.png)')).toBe(
			'A picture is an embed: ![[Portrait.png]].',
		);
	});

	it('refuses anything before or after the embed', () => {
		for (const source of [
			'![[a.png]] ![[b.png]]',
			'A picture goes here.',
			'Portrait: ![[Portrait.png]]',
			'[[Portrait.png]]',
		]) {
			expect(embedRefusal(source), source).toBe(
				'A picture is an embed: ![[Portrait.png]].',
			);
		}
	});

	it('refuses a web address to a different component, whichever way it is spelled', () => {
		/*
		 * The remote refusal is a *policy* and not a syntax check, so all three
		 * spellings get the one message — and the order matters. `parseEmbed`
		 * recognises only `![[…]]`, so `![](https://…)` used to fall through to
		 * "a picture is an embed", whose advice produces `![[https://…]]` and
		 * reaches this message one step later by a different route (PATTERNS §4:
		 * a fix that leads to a second refusal does not name the fix).
		 */
		for (const source of [
			'![[https://example.com/p.png]]',
			'![](https://example.com/p.png)',
			'https://example.com/p.png',
		]) {
			expect(embedRefusal(source), source).toBe(
				'"https://example.com/p.png" is a web address, and a picture has to be a file in this vault. Put a remote picture in a Rich text block instead, where Obsidian fetches it under your own settings.',
			);
		}
	});

	it('quotes the address alone where the markdown form carries a title', () => {
		expect(embedRefusal('![](https://example.com/p.png "Portrait")')).toContain(
			'"https://example.com/p.png" is a web address',
		);
	});

	it('takes a filename holding a colon-slash as a filename', () => {
		// The remote check is anchored, so a file whose name is odd is still a
		// file: it goes on to resolution and fails there as a filename, rather
		// than being sent to a different component as a web address.
		expect(embedRefusal('![[weird:name.png]]')).toBeNull();
	});
});
