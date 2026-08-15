import { describe, it } from 'vitest';

/*
 * Contract for the character note parser.
 *
 * The parser is deliberately free of Obsidian API imports so it can run here
 * without launching the app. It is also the one place in the codebase where a
 * bug destroys user data, so every case below should be covered before the
 * parser is wired into a view.
 *
 * Fill these in as the parser takes shape. Round-tripping is the rule that
 * matters most: parse then serialise must return the original file byte for
 * byte when nothing changed, or hand-edited notes will drift on every save.
 */

describe('parseCharacter', () => {
	it.todo('reads the layout name from the sheet-layout property');
	it.todo('fails clearly when the sheet-layout property is missing');
	it.todo('parses a fenced block section into keyed values');
	it.todo('parses a markdown table section into rows');
	it.todo('preserves wikilinks verbatim in table cells');
	it.todo('keeps sections that match no component rather than dropping them');
	it.todo('reports a malformed section without discarding the others');
});

describe('serialiseCharacter', () => {
	it.todo('round-trips an unchanged note byte for byte');
	it.todo('writes a changed value without reformatting untouched sections');
	it.todo('leaves body prose outside known sections untouched');
	it.todo('creates a section for a component that has no data yet');
});
