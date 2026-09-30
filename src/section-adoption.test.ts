// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
	adoptionSentence,
	countAdoptions,
	reportAdoption,
	sectionLabels,
} from './section-adoption';
import type { App as ObsidianApp } from 'obsidian';
import { App, Notice } from './test/obsidian-stub';
import { layoutCandidates } from './layout-notes';
import { ComponentConfig, LAYOUT_KEY } from './types';

const AT = { col: 1, row: 1, width: 2, height: 1 };

/** A note naming `layout`, holding each section given. */
function note(layout: string, ...sections: readonly [string, string][]): string {
	return [
		'---',
		`sheet-layout: ${layout}`,
		'---',
		'',
		...sections.map(([label, body]) => `## ${label}\n${body}`),
	].join('\n');
}

/** The stub as the app the module is typed against, which it is a double for. */
const asApp = (app: App): ObsidianApp => app as unknown as ObsidianApp;

const FENCE = '```sheet\nvalue: 5\n```\n';

describe('sectionLabels', () => {
	it('names a component with a section, and passes over a container for its children', () => {
		const group = {
			id: 'defences',
			type: 'group',
			label: 'Defences',
			position: AT,
			children: [
				{ id: 'ac', type: 'card', label: 'AC', position: AT },
				{
					id: 'tabs',
					type: 'tab-set',
					label: 'Tabs',
					position: AT,
					children: [{ id: 'story', type: 'rich-text', label: 'Backstory', position: AT }],
				},
			],
		} as ComponentConfig;
		expect(sectionLabels(group)).toEqual(['AC', 'Backstory']);
		expect(sectionLabels({ id: 'ac', type: 'card', label: 'AC', position: AT })).toEqual([
			'AC',
		]);
	});
});

describe('countAdoptions', () => {
	it('counts a note holding something under the label, once however many labels it holds', async () => {
		const app = new App();
		await app.vault.create('A.md', note('L', ['Card', FENCE], ['Portrait', '![[a.png]]\n']));
		await app.vault.create('B.md', note('L', ['Card', FENCE]));
		expect(await countAdoptions(asApp(app), 'L', ['Portrait', 'Card', 'Absent'])).toEqual({
			notes: 2,
			labels: ['Portrait', 'Card'],
		});
	});

	it('does not count a section holding only whitespace, or a heading with nothing under it', async () => {
		const app = new App();
		await app.vault.create('A.md', note('L', ['Track', '\n  \n\t\n']));
		await app.vault.create('B.md', note('L', ['Track', '']));
		expect(await countAdoptions(asApp(app), 'L', ['Track'])).toEqual({ notes: 0, labels: [] });
	});

	it('does not count a note on another layout', async () => {
		const app = new App();
		await app.vault.create('A.md', note('Other', ['Card', FENCE]));
		await app.vault.create('B.md', '## Card\n' + FENCE);
		expect((await countAdoptions(asApp(app), 'L', ['Card'])).notes).toBe(0);
	});

	it('counts a note on a layout named `12` where its text names it', async () => {
		// Undecidable in the frontmatter cache, which reads it as a number. The
		// double answers the string, so the app's answer is put in by hand, as
		// `layout-notes.test.ts` does: both notes are then admitted as undecidable
		// and only each note's own text says which one names `12`.
		const app = new App();
		await app.vault.create('A.md', note('12', ['Card', FENCE]));
		await app.vault.create('B.md', note('13', ['Card', FENCE]));
		const numbers: Record<string, number> = { 'A.md': 12, 'B.md': 13 };
		vi.spyOn(app.metadataCache, 'getFileCache').mockImplementation(
			(file) =>
				({
					frontmatter: { [LAYOUT_KEY]: numbers[file.path] },
				}) as unknown as ReturnType<typeof app.metadataCache.getFileCache>,
		);
		expect(layoutCandidates(asApp(app), '12').map(({ certain }) => certain)).toEqual([
			false,
			false,
		]);
		expect((await countAdoptions(asApp(app), '12', ['Card'])).notes).toBe(1);
	});

	it('passes over a note holding the old label too, which is the migration’s collision', async () => {
		const app = new App();
		await app.vault.create('A.md', note('L', ['AC', FENCE], ['Armour class', FENCE]));
		await app.vault.create('B.md', note('L', ['Armour class', FENCE]));
		expect((await countAdoptions(asApp(app), 'L', ['Armour class'], 'AC')).notes).toBe(1);
	});

	it('neither counts nor reports a note it cannot read', async () => {
		const app = new App();
		const file = await app.vault.create('A.md', note('L', ['Card', FENCE]));
		await app.vault.create('B.md', note('L', ['Card', FENCE]));
		const read = app.vault.cachedRead.bind(app.vault);
		vi.spyOn(app.vault, 'cachedRead').mockImplementation(async (target) => {
			if (target === file) throw new Error('gone');
			return read(target);
		});
		expect((await countAdoptions(asApp(app), 'L', ['Card'])).notes).toBe(1);
	});

	it('writes nothing', async () => {
		const app = new App();
		await app.vault.create('A.md', note('L', ['Card', FENCE]));
		const modify = vi.spyOn(app.vault, 'modify');
		const process = vi.spyOn(app.vault, 'process');
		await countAdoptions(asApp(app), 'L', ['Card']);
		expect(modify).not.toHaveBeenCalled();
		expect(process).not.toHaveBeenCalled();
	});
});

describe('adoptionSentence', () => {
	it('says nothing where no note holds anything', () => {
		expect(adoptionSentence({ notes: 0, labels: [] }, 'component')).toBeNull();
	});

	it('words one component and one note', () => {
		expect(adoptionSentence({ notes: 1, labels: ['Card'] }, 'component')).toBe(
			'1 character note already has a section called "Card", and this component now shows it. Rename the component if that section belongs to something else.',
		);
	});

	it('words one component and several notes', () => {
		expect(adoptionSentence({ notes: 3, labels: ['Card'] }, 'component')).toBe(
			'3 character notes already have a section called "Card", and this component now shows them. Rename the component if those sections belong to something else.',
		);
	});

	it('words a pasted component', () => {
		expect(adoptionSentence({ notes: 1, labels: ['Portrait'] }, 'pasted')).toBe(
			'1 character note already has a section called "Portrait", and the pasted component now shows it. Rename it if that section belongs to something else.',
		);
	});

	it('names several pasted labels, and counts them past the bound', () => {
		expect(adoptionSentence({ notes: 2, labels: ['Portrait', 'Backstory'] }, 'pasted')).toBe(
			'2 character notes already have sections called "Portrait" and "Backstory", and the pasted components now show them. Rename any whose section belongs to something else.',
		);
		const many = ['A', 'B', 'C', 'D', 'E', 'F'];
		expect(adoptionSentence({ notes: 1, labels: many }, 'pasted')).toBe(
			'1 character note already has sections under the names of 6 of the pasted components, and those components now show them. Rename any whose section belongs to something else.',
		);
	});
});

describe('reportAdoption', () => {
	it('raises one notice where a note holds the label, and none where none does', async () => {
		const app = new App();
		await app.vault.create('A.md', note('L', ['Card', FENCE]));
		Notice.messages = [];
		await reportAdoption(asApp(app), 'L', ['Rich text']);
		expect(Notice.messages).toEqual([]);
		await reportAdoption(asApp(app), 'L', ['Card']);
		expect(Notice.messages).toEqual([
			'1 character note already has a section called "Card", and this component now shows it. Rename the component if that section belongs to something else.',
		]);
	});
});
