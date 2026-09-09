// @vitest-environment happy-dom
/*
 * Repointing a note at another layout, end to end
 * (`docs/features/layout-picker.md`).
 *
 * `promote-flow.test.ts`'s shape and its reason: the layer tests each prove one
 * seam — `parse/character.ts` rewrites the line, `view/missing-layout.ts` draws
 * the offer, `layout-picker.ts` hands back a name — and this proves they
 * compose into what a reader actually does. It mirrors the wiring in
 * `SheetView.repointLayout`, which cannot be driven without a workspace around
 * it; if the two ever disagree, this file is the copy that is wrong.
 *
 * **What is being proved is Constraint 4.** A layout change never deletes
 * character data, so the assertions are about the bytes that did *not* move:
 * every other frontmatter property, the preamble, and every section — including
 * one the new layout maps to nothing, which SPEC §10 retains rather than
 * cleaning up.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { App as ObsidianApp } from 'obsidian';
import { chooseLayoutForNewCharacter } from '../characters';
import { loadLayout, noLayoutsMessage } from '../layouts';
import {
	getSection,
	parseCharacter,
	serialiseCharacter,
	withLayoutName,
} from '../parse/character';
import { App, Notice } from '../test/obsidian-stub';
import { fakePlugin, LAYOUT_FOLDER } from '../test/plugin';
import { renderMissingLayout } from './missing-layout';

/** Fixture state 1: a character whose layout went away, holding real values. */
const NOTE = `---
tags:
  - party
# who plays this one
player: Ana
sheet-layout: Layout that went away
---

Notes to self, above every section.

## Abilities
\`\`\`sheet
STR: 8
DEX: 16
\`\`\`

## Backstory

Grew up in [[Neverwinter]] under [[Sildar Hallwinter]].
`;

/**
 * The three lines `SheetView.repointLayout` is, with the view's own save
 * omitted: what the file becomes is the whole of what this proves.
 */
const repoint = (data: string, name: string): string =>
	serialiseCharacter(withLayoutName(parseCharacter(data), name));

describe('picking another layout', () => {
	it('changes the layout line and nothing else in the file', () => {
		const after = repoint(NOTE, 'Starter 5e');
		expect(after).toBe(
			NOTE.replace(
				'sheet-layout: Layout that went away',
				'sheet-layout: Starter 5e',
			),
		);
	});

	it('keeps every value in the note, mapped or not', () => {
		// The Abilities section is one **Starter 5e** maps; Backstory is one it
		// does not. Both come back with their bodies byte-identical, which is
		// SPEC §10 and Constraint 4.
		const before = parseCharacter(NOTE);
		const after = parseCharacter(repoint(NOTE, 'Starter 5e'));
		expect(after.preamble).toBe(before.preamble);
		expect(after.sections.map((one) => one.label)).toEqual([
			'Abilities',
			'Backstory',
		]);
		for (const label of ['Abilities', 'Backstory']) {
			expect(getSection(after, label), label).toEqual(
				getSection(before, label),
			);
		}
		expect(getSection(after, 'Backstory')?.body).toContain(
			'[[Sildar Hallwinter]]',
		);
	});

	it('carries the note’s other properties through untouched', () => {
		// Including the YAML comment and the list, which is what
		// `processFrontMatter` would have re-emitted.
		const after = parseCharacter(repoint(NOTE, 'Starter 5e'));
		expect(after.frontmatter).toContain('# who plays this one');
		expect(after.frontmatter).toContain('tags:\n  - party');
		expect(after.frontmatter).toContain('player: Ana');
	});

	it('round-trips the repointed note byte for byte', () => {
		// Constraint 3 on the *other* note this feature produces. The created
		// note's round trip is pinned in `parse/character.test.ts`; a repointed
		// one is a different shape — frontmatter with several keys, a preamble,
		// two sections — and the spec claims both are pinned.
		const repointed = repoint(NOTE, 'Starter 5e');
		expect(serialiseCharacter(parseCharacter(repointed))).toBe(repointed);
	});

	it('is losslessly reversible by picking the old one back', () => {
		expect(
			repoint(repoint(NOTE, 'Starter 5e'), 'Layout that went away'),
		).toBe(NOTE);
	});

	it('produces text the view has something to save', () => {
		// The view writes only where the text changed, so the gesture has to
		// actually change it — and picking is only reachable while the named
		// layout is missing, so the chosen one is never the one already named.
		expect(repoint(NOTE, 'Starter 5e')).not.toBe(NOTE);
	});
});

describe('the no-layouts sentence has one owner', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		Notice.messages = [];
		document.body.replaceChildren();
	});

	it('reads identically in the command’s notice and in the sheet’s', () => {
		// Two surfaces, one string. A guard over two copies of it could only
		// assert they still read alike, which is what one name says for free
		// (`docs/PATTERNS.md` §1).
		chooseLayoutForNewCharacter(fakePlugin(app));

		const container = document.createElement('div');
		renderMissingLayout(container, {
			message: 'Layout "Gone" was not found in "Sheetsmith layouts".',
			folder: LAYOUT_FOLDER,
			hasLayouts: false,
			onPick: () => {},
		});
		const lines = Array.from(
			container.querySelectorAll<HTMLElement>('p'),
			(line) => line.textContent,
		);

		expect(Notice.messages).toEqual([noLayoutsMessage(LAYOUT_FOLDER)]);
		expect(lines.at(-1)).toBe(Notice.messages[0]);
	});
});

describe('the offer is not made where the layout is present and broken', () => {
	/*
	 * A scan rather than a rendered view, because `SheetView` cannot be
	 * constructed outside the app — and a mirror of the branch here could only
	 * assert that this file's own copy of it behaves, which is the vacuous pass
	 * §10 forbids. `formula/sheet.test.ts` scans its hosts for a call for the
	 * same reason: the claim is about the *other* file.
	 *
	 * The cut it holds: a layout that is present and will not parse is one the
	 * reader has, and its fix is to repair it. Offering "pick another" there
	 * would invite them to abandon it and silently repoint the character at a
	 * sheet its author did not build.
	 */
	// The path spelled as `picker.test.ts` spells it: happy-dom replaces the
	// global `URL`, and `fs` refuses an instance of that one.
	const source = readFileSync(
		join(dirname(fileURLToPath(import.meta.url)), 'sheet-view.ts'),
		'utf8',
	);
	const MARKER = 'if (loadError !== null) {';

	/** The branch's own lines, trimmed, with the blank ones dropped. */
	const branch = (): string[] =>
		source
			.slice(source.indexOf(MARKER), source.indexOf('if (!layout) {'))
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line !== '');

	it('finds the branch it is scanning', () => {
		// Vacuity guard (§10): every assertion below passes on a miss.
		expect(source).toContain(MARKER);
		expect(source).toContain('renderMissingLayout(');
		expect(branch().length).toBeGreaterThan(2);
	});

	it('reports the load error, offers nothing, and stops', () => {
		/*
		 * **The whole branch rather than what it contains**, and the `return` is
		 * the reason. A scan asserting only that this branch draws the message
		 * and names no picker was green with the `return` deleted — and deleting
		 * it does not make the branch draw a button, it makes execution *fall
		 * through* to `if (!layout)`, which is true on a load error because
		 * `loadLayout` threw and `layout` is still null. So the forbidden state
		 * arrives from a line that is absent rather than from one that is
		 * present, and no `not.toContain` can see that. Pinned whole: anything
		 * added, removed or reordered here fails and has to be argued.
		 */
		expect(branch()).toEqual([
			MARKER,
			'this.renderMessage(loadError);',
			'return;',
			'}',
		]);
	});

	/*
	 * **What holds the mirror to the thing it mirrors.** This file's own header
	 * says that if the two disagree it is the copy that is wrong, and until this
	 * case existed nothing could tell: rewriting `repointLayout` to use
	 * `app.fileManager.processFrontMatter` — the one spelling its doc comment
	 * forbids — left every Constraint 3 and Constraint 4 assertion above green,
	 * because they run against `repoint` here rather than against the view.
	 *
	 * `formula/sheet.test.ts`'s host scan is the shape: the host has to go
	 * through the shared writer, and the spelling it would have been rebuilt out
	 * of is named as forbidden. `processFrontMatter` is that spelling — it
	 * re-emits the whole frontmatter block through Obsidian's YAML serialiser,
	 * which reformats the reader's unrelated properties and drops their
	 * comments (Constraint 3) — and `vault.modify` is the other: a second path
	 * into a file this view owns and is the editor of.
	 */
	it('is what sheet-view.ts actually does', () => {
		// A path that stopped resolving would read an empty string and pass
		// everything below by having nothing in it.
		expect(source.length).toBeGreaterThan(2000);
		expect(source).toContain('withLayoutName(parseCharacter(');
		expect(source).toContain('serialiseCharacter(');
		expect(source).toContain('this.requestSave();');
		// And that the offer is wired to it: the button's press is the one seam
		// no case can execute, since the view cannot be constructed here.
		expect(source).toContain('this.repointLayout(name)');
		expect(source).not.toContain('processFrontMatter');
		expect(source).not.toContain('vault.modify');
	});

	/*
	 * The premise the branch above rests on, which nothing else drives:
	 * `loadLayout` answers *null* for a layout that is not there and *throws*
	 * for one that is there and will not parse. Collapse those two into one
	 * answer and the cut disappears — either the broken layout gets the offer,
	 * or the missing one stops getting it — with every assertion above still
	 * green, because they are about a branch and this is about what reaches it.
	 */
	describe('the two answers the cut is made of', () => {
		let app: App;

		beforeEach(async () => {
			app = new App();
			await app.vault.createFolder(LAYOUT_FOLDER);
		});

		it('answers null where the folder holds no such layout', async () => {
			await expect(
				loadLayout(app as unknown as ObsidianApp, LAYOUT_FOLDER, 'Gone'),
			).resolves.toBeNull();
		});

		it('throws the parser’s own reason where the layout is there and broken', async () => {
			await app.vault.create(`${LAYOUT_FOLDER}/Broken.json`, '{');
			await expect(
				loadLayout(app as unknown as ObsidianApp, LAYOUT_FOLDER, 'Broken'),
			).rejects.toThrow();
		});
	});
});
