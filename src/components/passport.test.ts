// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { passport, PassportConfig, PassportData } from './passport';
import { card } from './card';
import { evaluate } from '../formula/expression';
import { callsFrom } from '../formula/resolve';
import { buildSheet, ReadComponent } from '../formula/sheet';
import { Layout } from '../parse/layout';
import { parseCharacter, serialiseCharacter } from '../parse/character';
import { fenceLines } from '../parse/fenced';
import { splitLines } from '../parse/lines';
import { press } from '../test/pointer';
import { RenderContext } from '../types';

const config: PassportConfig = {
	id: 'passport',
	type: 'passport',
	label: 'Passport',
	position: { col: 1, row: 1, width: 6, height: 2 },
	fields: [
		{ key: 'class', name: 'Class' },
		{ key: 'subclass', name: 'Subclass' },
		{ key: 'species', name: 'Species' },
		{ key: 'level', name: 'Level' },
	],
};

const SOURCE = '![[Thora.png]]';

/** The fixture body from `docs/features/passport.md`'s data model. */
const BODY = [
	'',
	SOURCE,
	'',
	'```sheet',
	'name: Thora Ironhelm of Mirabar',
	'class: Bard',
	'subclass: College of Lore',
	'species: Half-elf',
	'level: 5',
	'```',
	'',
].join('\n');

const FENCE_ONLY = [
	'',
	'```sheet',
	'name: Thora Ironhelm of Mirabar',
	'class: Bard',
	'subclass: College of Lore',
	'species: Half-elf',
	'level: 5',
	'```',
	'',
].join('\n');

const EMBED_ONLY = `\n${SOURCE}\n`;

/** A vault that holds one picture, one note, and nothing else. */
const HELD: Record<string, string> = {
	'Thora.png': 'app://vault/Thora.png',
	'Notes.md': 'app://vault/Notes.md',
};

const context: RenderContext<PassportData> = {
	resolved: {},
	resolveField: () => null,
	onChange: () => undefined,
	resource: (target) => HELD[target] ?? null,
};

function render(
	overrides: Partial<PassportConfig> = {},
	data: PassportData | null = readData(BODY),
	ctx: Partial<RenderContext<PassportData>> = {},
) {
	const el = document.createElement('div');
	document.body.replaceChildren(el);
	passport.render(el, { ...config, ...overrides }, data, { ...context, ...ctx });
	return el;
}

function readData(body: string, from: PassportConfig = config): PassportData {
	const result = passport.read(body, from);
	if (!result.ok || result.data === null) throw new Error('expected data');
	return result.data;
}

const frame = (el: HTMLElement) =>
	el.querySelector<HTMLElement>('.sheetsmith-image-frame');
const pictureField = (el: HTMLElement) =>
	el.querySelector<HTMLInputElement>('.sheetsmith-image-input');
const picture = (el: HTMLElement) =>
	el.querySelector<HTMLImageElement>('.sheetsmith-image-picture');
const nameField = (el: HTMLElement) =>
	el.querySelector<HTMLInputElement>('.sheetsmith-passport-name-input');
const shownName = (el: HTMLElement) => nameField(el)?.value ?? null;
/** The refusal a name commit put under it, which is its own notice. */
const nameRefusal = (el: HTMLElement) =>
	el.querySelector('.sheetsmith-passport-name-input + .sheetsmith-error')
		?.textContent ?? null;
const fields = (el: HTMLElement) =>
	Array.from(el.querySelectorAll<HTMLInputElement>('.sheetsmith-passport-input'));
const error = (el: HTMLElement) =>
	el.querySelector('.sheetsmith-error')?.textContent ?? null;
/**
 * The refusal a field commit put under the line, which is a different message in
 * a different place from the picture frame's — hence a selector of its own rather
 * than `error()` above, which returns whichever comes first in the DOM.
 */
const refusal = (el: HTMLElement) =>
	el.querySelector('.sheetsmith-passport-text > .sheetsmith-error')?.textContent ??
	null;

describe('passport.read', () => {
	it('reads the picture and every field out of the fixture body', () => {
		expect(passport.read(BODY, config)).toEqual({
			ok: true,
			data: {
				source: SOURCE,
				values: {
					name: 'Thora Ironhelm of Mirabar',
					class: 'Bard',
					subclass: 'College of Lore',
					species: 'Half-elf',
					level: '5',
				},
			},
		});
	});

	it('reads a body holding only a fence as the name, four fields and no picture', () => {
		const result = passport.read(FENCE_ONLY, config);
		expect(result.ok && result.data?.source).toBeUndefined();
		expect(result.ok && Object.keys(result.data?.values ?? {})).toEqual([
			'name',
			'class',
			'subclass',
			'species',
			'level',
		]);
	});

	it('reads a body holding only an embed as the picture and no fields', () => {
		expect(passport.read(EMBED_ONLY, config)).toEqual({
			ok: true,
			data: { source: SOURCE },
		});
	});

	it('treats a body with neither as an empty face, not an error', () => {
		// PATTERNS §4: a missing section, an empty one and one holding only blank
		// lines all mean the same thing — an editable empty face. The first commit
		// writes whichever half the reader touched.
		for (const body of ['', '\n', '  \n\t\n ', '\r\n\r\n']) {
			expect(passport.read(body, config)).toEqual({ ok: true, data: null });
		}
	});

	it('keeps the picture line exactly as written, size hint included', () => {
		for (const hint of ['|200', '|640x480', '|Thora, before the war']) {
			const source = `![[Thora.png${hint}]]`;
			expect(passport.read(`\n${source}\n`, config)).toEqual({
				ok: true,
				data: { source },
			});
		}
	});

	it('finds the picture whichever side of the fence the note put it on', () => {
		const after = [
			'',
			'```sheet',
			'class: Bard',
			'```',
			'',
			SOURCE,
			'',
		].join('\n');
		expect(passport.read(after, config)).toEqual({
			ok: true,
			data: { source: SOURCE, values: { class: 'Bard' } },
		});
	});

	it('never reads a line inside the fence as the picture (Constraint 2)', () => {
		/*
		 * An embed inside a code fence is indexed by nothing, so treating one as
		 * the picture would be this component agreeing to the state the constraint
		 * exists to prevent — and it would then rewrite that line on the next
		 * commit. So a fence holding nothing but entries reads as fields and no
		 * picture, however much the entries look like one.
		 */
		const inside = '\n```sheet\nclass: Bard\n```\n';
		expect(passport.read(inside, config)).toEqual({
			ok: true,
			data: { values: { class: 'Bard' } },
		});
		const fenced = ['', '```sheet', 'note: x', '```', ''].join('\n');
		expect(passport.read(fenced, config)).toEqual({
			ok: true,
			data: { values: { note: 'x' } },
		});
	});

	it('leaves prose alone and never takes it for a picture', () => {
		const prose = [
			'',
			'A note to the DM.',
			'',
			'```sheet',
			'class: Bard',
			'```',
			'',
			'More prose.',
			'',
		].join('\n');
		expect(passport.read(prose, config)).toEqual({
			ok: true,
			data: { values: { class: 'Bard' } },
		});
	});

	it('takes a bare path for prose rather than for the picture', () => {
		/*
		 * **The one place this component and Image genuinely differ about a body,
		 * and it follows from the file model rather than from taste.** Image's whole
		 * body is its value, so `Sildar Hallwinter.png` there is a value it holds
		 * and refuses in the frame. Here the picture is one *line* beside a fence,
		 * found by looking like an embed — and SPEC §10 says everything else in the
		 * section is preserved and never drawn. So a hand-written bare path stays in
		 * the note, the frame draws empty with its placeholder inviting an embed, and
		 * the reader's own gesture can never produce this state, because the field
		 * refuses such a draft rather than committing it (see `render` below).
		 */
		const bare = '\nSildar Hallwinter.png\n\n```sheet\nclass: Bard\n```\n';
		expect(passport.read(bare, config)).toEqual({
			ok: true,
			data: { values: { class: 'Bard' } },
		});
		// Preserved, which is the half that matters: nothing here removes it.
		expect(passport.write({ values: { class: 'Rogue' } }, bare, config)).toContain(
			'Sildar Hallwinter.png',
		);
	});

	it('fails on a fence line that is not an entry, naming the line', () => {
		const broken = '\n```sheet\nclass Bard\n```\n';
		const result = passport.read(broken, config);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('class Bard');
	});

	it('holds an embed-like line it cannot use, so the field can fix it', () => {
		// Image's correction, verbatim: a failed `read` never reaches `render`, so
		// refusing here would replace the cell and take the field with it.
		for (const source of [
			'![](https://example.com/p.png)',
			'![[https://example.com/p.png]]',
			'![](Thora.png)',
		]) {
			expect(passport.read(`\n${source}\n`, config)).toEqual({
				ok: true,
				data: { source },
			});
		}
	});
});

describe('passport.write — Constraint 3', () => {
	/**
	 * Every spelling a hand-edited section actually has, written back unchanged.
	 *
	 * The fence half is inherited from `writeFenced` and the picture half is this
	 * component's own, so what these cases are really about is the *pair*: two
	 * storage rules in one section, each put back where it was found, with
	 * whatever the note had around them untouched.
	 */
	const UNCHANGED: [string, string][] = [
		['the fixture body', BODY],
		[
			'fence before embed',
			[
				'',
				'```sheet',
				'class: Bard',
				'level: 5',
				'```',
				'',
				SOURCE,
				'',
			].join('\n'),
		],
		[
			'prose before and after',
			[
				'',
				'A line the layout knows nothing about.',
				'',
				SOURCE,
				'',
				'```sheet',
				'class: Bard',
				'```',
				'',
				'And one after it.',
				'',
			].join('\n'),
		],
		['a fence spelled with no space', '\n![[Thora.png]]\n\n```sheet\nclass:Bard\n```\n'],
		['loose spacing around the picture', '\n\t![[Thora.png]]  \n\n```sheet\nclass: Bard\n```\n'],
		['CRLF endings', BODY.replace(/\n/g, '\r\n')],
	];

	it.each(UNCHANGED)('returns %s byte for byte', (_where, body) => {
		expect(passport.write(readData(body), body, config)).toBe(body);
	});

	it('preserves an entry the layout does not declare, and does not move the picture', () => {
		const body = [
			'',
			SOURCE,
			'',
			'```sheet',
			'class: Bard',
			'retired: Fighter',
			'level: 5',
			'```',
			'',
		].join('\n');
		const written = passport.write(
			{ values: { level: '6' } },
			body,
			config,
		);
		expect(written).toBe(body.replace('level: 5', 'level: 6'));
		// Said outright rather than left to the diff above: Constraint 4 is that a
		// layout change never deletes character data, and an undeclared entry is
		// exactly the shape that arrives from a renamed key.
		expect(written).toContain('retired: Fighter');
		expect(written.indexOf(SOURCE)).toBe(body.indexOf(SOURCE));
	});

	it('changes only the picture line, leaving the fence and its spelling alone', () => {
		const written = passport.write(
			{ source: '![[Thora in armour.png]]' },
			BODY,
			config,
		);
		expect(written).toBe(BODY.replace(SOURCE, '![[Thora in armour.png]]'));
	});

	it('keeps the picture line\'s own indentation and ending', () => {
		const body = '\n\t![[Thora.png]]  \n\n```sheet\nclass: Bard\n```\n';
		expect(passport.write({ source: '![[Other.png]]' }, body, config)).toBe(
			'\n\t![[Other.png]]  \n\n```sheet\nclass: Bard\n```\n',
		);
	});

	it('adds a picture above the fence, with one blank line between', () => {
		expect(passport.write({ source: SOURCE }, FENCE_ONLY, config)).toBe(
			`\n${SOURCE}\n${FENCE_ONLY}`,
		);
	});

	it('adds a picture to a section that has none at all', () => {
		expect(passport.write({ source: SOURCE }, null, config)).toBe(`\n${SOURCE}\n`);
		expect(passport.write({ source: SOURCE }, '\n', config)).toBe(`\n${SOURCE}\n`);
	});

	it('appends a picture after prose where the section holds no fence', () => {
		expect(passport.write({ source: SOURCE }, '\nSome prose.\n', config)).toBe(
			`\nSome prose.\n\n${SOURCE}\n`,
		);
	});

	it('removes the picture line rather than leaving a blank one behind', () => {
		// Unlike Image the body here is not the value, so a line left empty would
		// be prose the reader did not write.
		expect(passport.write({ source: '' }, BODY, config)).toBe(
			BODY.replace(`${SOURCE}\n`, ''),
		);
	});

	it('writes only the half the reader touched', () => {
		// The delta rule (PATTERNS §7): a field edit must not rewrite the picture
		// line and a picture edit must not rewrite the fence.
		expect(passport.write({ values: { class: 'Rogue' } }, BODY, config)).toBe(
			BODY.replace('class: Bard', 'class: Rogue'),
		);
		expect(passport.write({ source: SOURCE }, BODY, config)).toBe(BODY);
	});

	it('puts the picture line outside the fence, whatever follows it (Constraint 2)', () => {
		/*
		 * **The fence is not the last thing in the section here, and that is the
		 * whole of the case.** An embed inside a `sheet` fence is indexed by
		 * nothing — backlinks, graph view, hover preview and rename propagation all
		 * gone with no warning — so where the new line lands is a constraint and
		 * not a layout preference.
		 *
		 * Driven rather than asserted about the fixture: this used to write no
		 * `source` at all, which meant `writePictureLine` never ran and the
		 * assertion held for the body it was handed before the write. A regression
		 * inserting at `fence.close + 1` would have left that green.
		 */
		const body = '\n```sheet\nclass: Bard\n```\n\nA note to the DM.\n';
		const written = passport.write({ source: SOURCE }, body, config);
		expect(written).toBe(
			'\n![[Thora.png]]\n\n```sheet\nclass: Bard\n```\n\nA note to the DM.\n',
		);
		// And structurally, against the fence's own reader rather than against a
		// substring index: the line is above the opening fence, so it is outside
		// the range `readFenced` treats as fence contents.
		const lines = splitLines(written);
		const fence = fenceLines(written);
		const at = lines.findIndex((line) => line.includes(SOURCE));
		expect(fence).not.toBeNull();
		expect(at).toBeGreaterThanOrEqual(0);
		expect(at).toBeLessThan(fence?.open ?? 0);
		// Read back, so the round trip is the claim rather than the bytes alone.
		expect(readData(written).source).toBe(SOURCE);
	});

});

describe('passport — a value survives what happens next', () => {
	/**
	 * The component driven through a real note: parse, read, render, commit,
	 * write, serialise.
	 *
	 * `image.test.ts` and `rich-text.test.ts` both hold their note-level claims
	 * this way, and the reason is what the previous version of this block got
	 * wrong: a case asserting `serialiseCharacter(parseCharacter(note)) === note`
	 * calls neither `read` nor `write`, so it passes with this component deleted.
	 * The section-level round trip above is the real Constraint 3 claim; what a
	 * *note* adds is that a commit here changes one section and nothing else.
	 */
	function sheet(body: string | null) {
		let note = parseCharacter(
			`---\nsheet-layout: DnD 5e\n---\n\n## Passport\n${body ?? ''}\n## Level\n\n\`\`\`sheet\nlevel: 6\n\`\`\`\n`,
		);
		let el = document.createElement('div');
		const draw = () => {
			const section = note.sections.find((one) => one.label === 'Passport');
			const read = passport.read(section?.body ?? '', config);
			el.remove();
			el = document.createElement('div');
			document.body.appendChild(el);
			passport.render(el, config, read.ok ? read.data : null, {
				...context,
				onChange: (edited) => {
					const at = note.sections.findIndex((one) => one.label === 'Passport');
					const sections = note.sections.slice();
					sections[at] = {
						...sections[at]!,
						body: passport.write(edited, sections[at]!.body, config),
					};
					note = { ...note, sections };
					draw();
				},
			});
		};
		draw();
		return {
			/** Commit into one of the identity fields. */
			typeField: (index: number, text: string) => {
				const input = fields(el)[index] as HTMLInputElement;
				input.focus();
				input.value = text;
				input.dispatchEvent(new Event('input', { bubbles: true }));
				input.blur();
			},
			/** Commit into the picture's reference field. */
			typePicture: (text: string) => {
				const input = pictureField(el) as HTMLInputElement;
				input.focus();
				input.value = text;
				input.dispatchEvent(new Event('input', { bubbles: true }));
				input.blur();
			},
			/** A rebuild caused by something that is not this component. */
			elsewhere: () => draw(),
			shown: () => picture(el)?.getAttribute('src') ?? null,
			inField: (index: number) => fields(el)[index]?.value ?? null,
			inPicture: () => pictureField(el)?.value ?? null,
			note: () => serialiseCharacter(note),
			done: () => el.remove(),
		};
	}

	it('writes a committed field into the note and nowhere else', () => {
		const live = sheet(BODY.trim());
		const before = live.note();
		live.typeField(0, 'Rogue');
		const after = live.note();
		expect(after).toContain('class: Rogue');
		// Constraint 4: the section beside this one keeps its own bytes.
		expect(after.slice(after.indexOf('## Level'))).toBe(
			before.slice(before.indexOf('## Level')),
		);
		live.done();
	});

	it('writes a chosen picture into a section that had none', () => {
		const live = sheet('\n```sheet\nclass: Bard\n```\n');
		live.typePicture(SOURCE);
		expect(live.inPicture()).toBe(SOURCE);
		expect(live.shown()).toBe('app://vault/Thora.png');
		expect(live.note()).toContain(SOURCE);
		// And the fence it was inserted above is intact and still read.
		expect(live.inField(0)).toBe('Bard');
		live.done();
	});

	it('keeps both halves across a rebuild caused by something else', () => {
		// The two are siblings reported as a delta, so the risk is one commit
		// writing back the other's stale value: an unrelated redraw must not roll
		// either of them back.
		const live = sheet(BODY.trim());
		live.typeField(3, '6');
		live.typePicture('![[Thora in armour.png]]');
		live.elsewhere();
		expect(live.inField(3)).toBe('6');
		expect(live.inPicture()).toBe('![[Thora in armour.png]]');
		expect(live.note()).toContain('level: 6');
		expect(live.note()).toContain('![[Thora in armour.png]]');
		live.done();
	});

	it('returns the note to its own bytes when an edit is undone by hand', () => {
		/*
		 * **Two commits rather than none, and that is the correction.** A case that
		 * redraws without committing runs neither `read`'s partner nor `write` at
		 * all — and `editable.ts` declines to report a draft equal to what is
		 * stored, so typing the stored value back is not a write either. So the
		 * only way to drive `write` twice and land on the original bytes is to
		 * change the value and change it back, which is Constraint 3 over a real
		 * note rather than over a body a test built.
		 */
		const live = sheet(BODY.trim());
		const before = live.note();
		live.typeField(0, 'Rogue');
		expect(live.note()).not.toBe(before);
		live.typeField(0, 'Bard');
		expect(live.note()).toBe(before);
		live.done();
	});

	it('leaves prose and an undeclared entry alone through an edit', () => {
		const live = sheet(
			[
				'',
				'A note to the DM.',
				'',
				SOURCE,
				'',
				'```sheet',
				'class: Bard',
				'retired: Fighter',
				'```',
				'',
				'And one after it.',
			].join('\n'),
		);
		live.typeField(0, 'Rogue');
		const after = live.note();
		expect(after).toContain('A note to the DM.');
		expect(after).toContain('retired: Fighter');
		expect(after).toContain('And one after it.');
		expect(after).toContain('class: Rogue');
		live.done();
	});
});

describe('what a passport publishes', () => {
	function envFor(body: string, from: PassportConfig = config) {
		const data = passport.read(body, from);
		const prepared: ReadComponent[] = [
			{
				config: from,
				component: passport,
				data: data.ok ? data.data : null,
				error: null,
			},
		];
		const layout: Layout = { name: 'L', components: [from] };
		return buildSheet(layout, prepared);
	}

	it('publishes one name per declared field, and no bare id', () => {
		const { env } = envFor(BODY);
		expect(evaluate('passport.level', env.sheet, callsFrom(env))).toBe(5);
		expect(evaluate('passport.class', env.sheet, callsFrom(env))).toBe('Bard');
		// A face is not one value, so `ScopeValues.self` is left off.
		expect(() => evaluate('passport', env.sheet, callsFrom(env))).toThrow(
			/Unknown name "passport"/,
		);
	});

	it('keeps the stored text reachable under .value as well', () => {
		const { env } = envFor(BODY);
		expect(evaluate('passport.level.value', env.sheet, callsFrom(env))).toBe(5);
		expect(evaluate('passport.class.value', env.sheet, callsFrom(env))).toBe(
			'Bard',
		);
	});

	it('publishes nothing for a field the layout does not declare', () => {
		// The other half of the rule Card set states: a field the sheet cannot
		// show must not publish a name the rest of the sheet is then built on.
		const { env } = envFor(
			'\n```sheet\nclass: Bard\nretired: Fighter\n```\n',
		);
		expect(() => evaluate('passport.retired', env.sheet, callsFrom(env))).toThrow(
			/Unknown name/,
		);
	});

	it('lets a card derive a proficiency bonus from the level', () => {
		// The whole reason a passport publishes at all: a 5e layout that keeps its
		// level here writes `ceil(passport.level / 4) + 1`.
		const prof = {
			id: 'prof',
			type: 'card',
			label: 'Proficiency',
			position: { col: 1, row: 3, width: 2, height: 1 },
			derived: 'ceil(passport.level / 4) + 1',
		} as const;
		const data = passport.read(BODY, config);
		const layout: Layout = { name: 'L', components: [config, prof] };
		const { env } = buildSheet(layout, [
			{
				config,
				component: passport,
				data: data.ok ? data.data : null,
				error: null,
			},
			{ config: prof, component: card, data: null, error: null },
		]);
		expect(evaluate('ceil(passport.level / 4) + 1', env.sheet, callsFrom(env))).toBe(
			3,
		);
	});

	it('gives a word no arithmetic, and adds no message of its own for it', () => {
		/*
		 * SPEC §5's language has no strings, so the only way to write a comparison
		 * against a word is a bare identifier — which fails as an unknown name.
		 * That is the *existing* message, and this component deliberately does not
		 * invent a second one saying "a passport field cannot be compared".
		 */
		const { env } = envFor(BODY);
		expect(() =>
			evaluate('passport.class == Bard', env.sheet, callsFrom(env)),
		).toThrow(/Unknown name "Bard"/);
	});

	it('publishes an empty field as no name rather than as a blank', () => {
		const { env } = envFor('\n```sheet\nclass:\n```\n');
		expect(() => evaluate('passport.class', env.sheet, callsFrom(env))).toThrow(
			/Unknown name/,
		);
	});

	it('declares no rows, no modifiers, no buffer and no reset', () => {
		// A passport is not a list and identity does not recover on a rest.
		expect(typeof passport.scopeRows).toBe('undefined');
		expect(typeof passport.scopeModifiers).toBe('undefined');
		expect(typeof passport.applyReset).toBe('undefined');
		expect(typeof passport.resetColumns).toBe('undefined');
		expect(passport.hasBuffer).toBeUndefined();
	});
});

describe('passport.render — the name', () => {
	it('draws the stored name once, in a field at the headline rank', () => {
		const el = render();
		expect(nameField(el)?.value).toBe('Thora Ironhelm of Mirabar');
		expect(el.querySelectorAll('.sheetsmith-passport-name-input')).toHaveLength(1);
		// Named for what it holds rather than for the component: "Passport" over a
		// field holding a name would name the wrong thing (docs/UI.md §6).
		expect(nameField(el)?.getAttribute('aria-label')).toBe('Name');
		// And no read-only sentence, which the rename left behind when it went.
		expect(nameField(el)?.getAttribute('title')).toBeNull();
	});

	it('commits the name through onChange, under the key the layout named', () => {
		/*
		 * **The whole of the owner's reversal in one case.** The name was the
		 * note's *filename*, reached through a context member and written by a vault
		 * rename; it is an entry in this component's own fence now, so it commits
		 * exactly as `class` does and Constraint 3 covers it for free.
		 */
		const written: unknown[] = [];
		const el = render({}, readData(BODY), {
			onChange: (data) => written.push(data),
		});
		const field = nameField(el) as HTMLInputElement;
		field.focus();
		field.value = 'Thora Two';
		field.blur();
		expect(written).toEqual([{ values: { name: 'Thora Two' } }]);
	});

	it('writes the name into the fence and nowhere else', () => {
		const written = passport.write({ values: { name: 'Thora Two' } }, BODY, config);
		expect(written).toContain('name: Thora Two');
		// One more entry in a fence this component already round-trips: the picture
		// line and every other entry are exactly where they were.
		expect(written).toBe(BODY.replace('name: Thora Ironhelm of Mirabar', 'name: Thora Two'));
	});

	it('stores it under a key the layout renamed, and leaves the old entry', () => {
		// Card's own rule for a renamed key (PATTERNS §7): renaming it does not
		// move a stored value.
		const from: PassportConfig = { ...config, nameKey: 'Character' };
		const body = '\n```sheet\nCharacter: Thora\nclass: Bard\n```\n';
		expect(readData(body, from).values?.Character).toBe('Thora');
		const el = render({ nameKey: 'Character' }, readData(body, from));
		expect(nameField(el)?.value).toBe('Thora');
	});

	it('falls back to the default key where the layout named an unusable one', () => {
		// A colon separates key from value in the fence, so a key holding one would
		// round-trip as a different entry. Falling back beats failing the component:
		// a passport whose *name* could not be stored is a face with nothing on it.
		const el = render({ nameKey: 'a:b' }, readData(BODY));
		expect(nameField(el)?.value).toBe('Thora Ironhelm of Mirabar');
	});

	it('leaves a field off the face where it declared the name\'s own key', () => {
		// Two controls writing one entry is the defect the duplicate-key rule
		// already refuses, and of the two the name is the slot this component is
		// named for.
		const el = render(
			{ fields: [{ key: 'name', name: 'Name' }, { key: 'class', name: 'Class' }] },
			readData(BODY),
		);
		expect(fields(el).map((f) => f.getAttribute('aria-label'))).toEqual(['Class']);
		expect(nameField(el)?.value).toBe('Thora Ironhelm of Mirabar');
	});

	it('commits on Enter and on blur, and nothing before either', () => {
		const written: unknown[] = [];
		const el = render({}, readData(BODY), {
			onChange: (data) => written.push(data),
		});
		const field = nameField(el) as HTMLInputElement;
		field.focus();
		field.value = 'Thora Two';
		field.dispatchEvent(new Event('input'));
		expect(written).toEqual([]);
		field.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
		);
		expect(written).toEqual([{ values: { name: 'Thora Two' } }]);
	});

	it('restores the stored name on Escape, and writes nothing', () => {
		const written: unknown[] = [];
		const el = render({}, readData(BODY), {
			onChange: (data) => written.push(data),
		});
		const field = nameField(el) as HTMLInputElement;
		field.focus();
		field.value = 'Something else';
		field.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
		);
		expect(field.value).toBe('Thora Ironhelm of Mirabar');
		expect(written).toEqual([]);
		expect(el.querySelector('[aria-live]')?.textContent).toContain(
			'Name restored to Thora Ironhelm of Mirabar',
		);
	});

	it('refuses a wikilink in the name, on the values\' own sentence', () => {
		/*
		 * **The one refusal the name kept, and the reason the others went.** It is
		 * an entry in a `sheet` fence now, so Constraint 2 applies exactly as it
		 * does to the values and the sentence is the same one — shared with Record
		 * set through `fenced-link.ts`. What went with the rename is everything the
		 * *filesystem* forbade: a blank name is an empty card, and a name holding a
		 * path separator is now just a name.
		 */
		const written: unknown[] = [];
		const el = render({}, readData(BODY), {
			onChange: (data) => written.push(data),
		});
		const field = nameField(el) as HTMLInputElement;
		field.focus();
		field.value = '[[Thora]]';
		field.blur();
		expect(written).toEqual([]);
		expect(field.value).toBe('[[Thora]]');
		expect(nameRefusal(el)).toContain(
			'are stored in a code block and Obsidian indexes no link inside one',
		);
	});

	it('accepts a blank name and a slash, which are values rather than paths', () => {
		const written: unknown[] = [];
		const el = render({}, readData(BODY), {
			onChange: (data) => written.push(data),
		});
		const field = nameField(el) as HTMLInputElement;
		field.focus();
		field.value = 'Thora/Ironhelm';
		field.blur();
		field.focus();
		field.value = '';
		field.blur();
		expect(written).toEqual([
			{ values: { name: 'Thora/Ironhelm' } },
			{ values: { name: '' } },
		]);
		expect(nameRefusal(el)).toBeNull();
	});

	it('clears a standing refusal once the name is storable again', () => {
		const el = render();
		const field = nameField(el) as HTMLInputElement;
		field.focus();
		field.value = '[[Thora]]';
		field.blur();
		expect(nameRefusal(el)).not.toBeNull();
		field.focus();
		field.value = 'Thora';
		field.blur();
		expect(nameRefusal(el)).toBeNull();
	});

	it('shows the placeholder at the headline rank where nothing is stored', () => {
		// PATTERNS §4's editable empty card, and the treatment a design review
		// settled: the headline size with only the colour changed, which is a
		// Card's own em dash. The class is one now rather than a rank plus an
		// override, because there is one element.
		const el = render({}, { values: { class: 'Bard' } });
		expect(nameField(el)?.value).toBe('');
		expect(nameField(el)?.placeholder).toBe('Character name');
	});

	it('draws the name even where nothing at all is stored', () => {
		const el = render({}, null);
		expect(nameField(el)?.value).toBe('');
		expect(picture(el)).toBeNull();
		expect(fields(el).map((field) => field.placeholder)).toEqual([
			'Class',
			'Subclass',
			'Species',
			'Level',
		]);
	});

	it('takes its height from its placement, whatever it holds', () => {
		const block = render().querySelector('.sheetsmith-placed') as HTMLElement;
		expect(block.style.getPropertyValue('--sheetsmith-rows')).toBe('2');
		expect(block.classList.contains('sheetsmith-passport')).toBe(true);
	});

	it('draws the card surface rather than a fourth kind of panel', () => {
		// docs/UI.md §9: the card is shared vocabulary, and a passport is one
		// card-shaped object on the sheet.
		const face = render().querySelector('.sheetsmith-passport-face');
		expect(face?.classList.contains('sheetsmith-card')).toBe(true);
	});

	it('draws its label above the face, and drops it where it is told to', () => {
		const el = render();
		const label = el.querySelector('.sheetsmith-component-label');
		expect(label?.textContent).toBe('Passport');
		expect(render({ hideLabel: true }).querySelector('.sheetsmith-component-label')).toBeNull();
		// And where a container above has already named it (`parentShowsLabel`).
		expect(
			render({}, readData(BODY), { parentShowsLabel: true }).querySelector(
				'.sheetsmith-component-label',
			),
		).toBeNull();
	});
});

describe('passport.render — the line of fields', () => {
	it('draws one field per declared field, named for assistive tech', () => {
		const el = render();
		expect(fields(el).map((field) => field.getAttribute('aria-label'))).toEqual([
			'Class',
			'Subclass',
			'Species',
			'Level',
		]);
		expect(fields(el).map((field) => field.value)).toEqual([
			'Bard',
			'College of Lore',
			'Half-elf',
			'5',
		]);
	});

	it('falls back to the key where the layout gave no name', () => {
		const el = render({ fields: [{ key: 'playbook' }] }, null);
		expect(fields(el)[0]?.getAttribute('aria-label')).toBe('playbook');
		expect(fields(el)[0]?.placeholder).toBe('playbook');
	});

	it('shows the layout\'s word only while the field is empty', () => {
		const el = render({}, { values: { class: 'Bard' } });
		const [klass, subclass] = fields(el);
		expect(klass?.value).toBe('Bard');
		expect(subclass?.value).toBe('');
		expect(subclass?.placeholder).toBe('Subclass');
	});

	it('draws the values as chips, with nothing between them', () => {
		/*
		 * **A chip separates itself.** The line used to carry a middle dot between
		 * every pair, and the owner's reading of the values as *tags* rather than
		 * as a sentence took them with it: a dot between two padded pills reads as
		 * a third thing. It also took a real defect — at six fields the line
		 * wrapped after a dot and stranded it at the end of a row, which the vault
		 * fixture found and no harness view had.
		 *
		 * Asserted as an absence *and* a presence, because an empty line would
		 * satisfy the absence perfectly: the fields are still there, and nothing
		 * else is.
		 */
		const el = render();
		const line = el.querySelector('.sheetsmith-passport-fields') as HTMLElement;
		expect(fields(el)).toHaveLength(4);
		expect(line.querySelectorAll('.sheetsmith-passport-separator')).toHaveLength(
			0,
		);
		// Every child of the line is a field, so there is nothing on it a screen
		// reader has to be told to skip and nothing that could end up in a value.
		expect(Array.from(line.children).every((one) => one.tagName === 'INPUT')).toBe(
			true,
		);
		expect(fields(el).some((field) => field.value.includes('·'))).toBe(false);
	});

	it('commits on blur, and nothing before it', () => {
		const written: unknown[] = [];
		const el = render({}, readData(BODY), {
			onChange: (data) => written.push(data),
		});
		const field = fields(el)[0] as HTMLInputElement;
		field.focus();
		field.value = 'Rogue';
		field.dispatchEvent(new Event('input'));
		expect(written).toEqual([]);
		field.blur();
		// A delta of the one field the reader touched (PATTERNS §7).
		expect(written).toEqual([{ values: { class: 'Rogue' } }]);
	});

	it('commits on Enter and moves to the next field on the face', () => {
		const written: unknown[] = [];
		const el = render({}, readData(BODY), {
			onChange: (data) => written.push(data),
		});
		const [klass, subclass] = fields(el);
		klass?.focus();
		if (klass) klass.value = 'Rogue';
		klass?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
		);
		expect(written).toEqual([{ values: { class: 'Rogue' } }]);
		expect(document.activeElement).toBe(subclass);
	});

	it('leaves the last field\'s Enter where it is', () => {
		const el = render();
		const last = fields(el)[3] as HTMLInputElement;
		last.focus();
		last.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
		);
		expect(document.activeElement).toBe(last);
	});

	it('restores the stored text on Escape, and writes nothing', () => {
		const written: unknown[] = [];
		const el = render({}, readData(BODY), {
			onChange: (data) => written.push(data),
		});
		const field = fields(el)[0] as HTMLInputElement;
		field.focus();
		field.value = 'Rogue';
		field.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
		);
		expect(field.value).toBe('Bard');
		expect(written).toEqual([]);
		// Announced, since an undo nobody can perceive is not obviously one.
		expect(el.querySelector('[aria-live]')?.textContent).toContain(
			'Class restored to Bard',
		);
	});

	it('steps a numeric field under the arrow keys and leaves a word alone', () => {
		const el = render();
		const level = fields(el)[3] as HTMLInputElement;
		level.focus();
		level.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
		);
		expect(level.value).toBe('6');
		const klass = fields(el)[0] as HTMLInputElement;
		klass.focus();
		klass.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
		);
		expect(klass.value).toBe('Bard');
	});

	it('refuses a wikilink at the commit, and writes nothing (Constraint 2)', () => {
		/*
		 * **The fields are a `sheet` fence and Obsidian indexes no link inside
		 * one**, so a `[[Bard]]` committed here would be written looking like a
		 * link and behaving like none of one, with rename propagation silently
		 * gone. Record set refuses exactly this at exactly this point and the
		 * sentence is shared with it (`fenced-link.ts`).
		 *
		 * Refused rather than escaped, and at the commit rather than in `read`: a
		 * note that already holds one is rendered and carried (SPEC §10), and the
		 * message is for the reader typing one now.
		 */
		const written: unknown[] = [];
		const el = render({}, readData(BODY), {
			onChange: (data) => written.push(data),
		});
		const field = fields(el)[0] as HTMLInputElement;
		field.focus();
		field.value = '[[Bard]]';
		field.blur();
		expect(written).toEqual([]);
		// The draft is kept, which is `editable.ts`'s own rule: the text the
		// message is about has to still be on screen.
		expect(field.value).toBe('[[Bard]]');
		expect(refusal(el)).toContain(
			'are stored in a code block and Obsidian indexes no link inside one',
		);
		// And the advice is this component's, because a passport has no name and no
		// body to move a link into.
		expect(refusal(el)).toContain('Rich text block or a table cell');
		// Said as well as drawn.
		expect(el.querySelector('[aria-live]')?.textContent).toContain(
			'would stop being a link',
		);
	});

	it('clears the refusal once the draft is storable again', () => {
		// `editable.ts` reports a cleared refusal on every commit attempt including
		// the ones that change nothing, so a message about an abandoned draft must
		// not outlive it.
		const el = render();
		const field = fields(el)[0] as HTMLInputElement;
		field.focus();
		field.value = '[[Bard]]';
		field.blur();
		expect(refusal(el)).not.toBeNull();
		field.focus();
		field.value = 'Bard';
		field.blur();
		expect(refusal(el)).toBeNull();
	});

	it('carries a link the note already holds rather than correcting it', () => {
		// SPEC §10: the refusal is about the plugin's own gesture, never about what
		// a hand-edited note arrived holding.
		const body = '\n```sheet\nclass: [[Bard]]\n```\n';
		expect(readData(body).values).toEqual({ class: '[[Bard]]' });
		const el = render({}, readData(body));
		expect(fields(el)[0]?.value).toBe('[[Bard]]');
		expect(refusal(el)).toBeNull();
		// And an edit elsewhere on the face leaves it exactly where it was.
		expect(passport.write({ values: { level: '5' } }, body, config)).toContain(
			'class: [[Bard]]',
		);
	});

	it('draws no line at all where the layout declared no fields', () => {
		const el = render({ fields: [] }, null);
		expect(el.querySelector('.sheetsmith-passport-fields')).toBeNull();
		// The name is still a control, since it is a value of this component's own
		// rather than a fact about a host.
		expect(nameField(el)).not.toBeNull();
	});

	it('leaves out a key the note could not hold, and the rest of the face stands', () => {
		// A colon separates key from value in the fence, so a key holding one
		// would round-trip as a different entry. Skipped rather than reported as a
		// config error: one unusable key must not take the whole face off the
		// sheet with it.
		const el = render(
			{ fields: [{ key: 'a:b', name: 'Broken' }, { key: 'class', name: 'Class' }] },
			readData(BODY),
		);
		expect(fields(el).map((field) => field.getAttribute('aria-label'))).toEqual([
			'Class',
		]);
		expect(shownName(el)).toBe('Thora Ironhelm of Mirabar');
	});

	it('draws one field for a key the layout declared twice', () => {
		// Two fields on one key are one entry in the note, so the second would
		// draw the first's value and overwrite it on commit.
		const el = render(
			{ fields: [{ key: 'class', name: 'Class' }, { key: 'class', name: 'Again' }] },
			readData(BODY),
		);
		expect(fields(el)).toHaveLength(1);
		// **The *first* one, and the count alone does not say that**: a fix keeping
		// the last would pass a length check and silently reorder a layout's own
		// fields, which is the order the author wrote down.
		expect(fields(el)[0]?.getAttribute('aria-label')).toBe('Class');
	});
});

describe('passport.render — the picture', () => {
	it('takes the src the app returned, and nothing else', () => {
		expect(picture(render())?.getAttribute('src')).toBe('app://vault/Thora.png');
	});

	it('asks for the target rather than the source line', () => {
		const asked: string[] = [];
		render({}, { source: '![[Thora.png|200x300]]' }, {
			resource: (target) => {
				asked.push(target);
				return HELD[target] ?? null;
			},
		});
		expect(asked).toEqual(['Thora.png']);
	});

	it('draws the picture in Image\'s own frame and box', () => {
		// The reuse is the point: `object-fit`, the transparent field and its
		// focus treatment are one copy of each (docs/UI.md §9).
		const el = render();
		const box = el.querySelector('.sheetsmith-passport-picture') as HTMLElement;
		expect(box.classList.contains('sheetsmith-placed-box')).toBe(true);
		expect(box.querySelector('.sheetsmith-image-frame')).not.toBeNull();
		expect(box.querySelector('.sheetsmith-image-input')).not.toBeNull();
	});

	it('names the file it cannot find, rather than drawing an empty box', () => {
		const el = render({}, { source: '![[Portrait of Sera.png]]' });
		expect(error(el)).toBe(
			'No file in this vault is called "Portrait of Sera.png".',
		);
	});

	it('says a file it cannot draw is not a picture, when the browser says so', () => {
		const el = render({}, { source: '![[Notes.md]]' });
		picture(el)?.dispatchEvent(new Event('error'));
		expect(error(el)).toBe('"Notes.md" is not a picture.');
	});

	it('draws an empty frame and no error where there is no vault', () => {
		const el = render({}, readData(BODY), { resource: undefined });
		expect(picture(el)).toBeNull();
		expect(error(el)).toBeNull();
		expect(pictureField(el)?.value).toBe(SOURCE);
	});

	it('draws Image\'s refusal in the frame, with the field still holding the value', () => {
		// The acceptance criterion: a body whose only embed-like line is
		// `![](https://x/y.png)` passes `read`, and `render` is where it is
		// refused — with the field that fixes it still on screen.
		const source = '![](https://example.com/p.png)';
		const el = render({}, readData(`\n${source}\n`));
		expect(error(el)).toContain(
			'"https://example.com/p.png" is a web address',
		);
		expect(pictureField(el)?.value).toBe(source);
		// And every other part of the face is live. This body holds no fence, so
		// the name is empty and shows its placeholder — a state, not a failure.
		expect(nameField(el)?.value).toBe('');
		expect(nameField(el)?.placeholder).toBe('Character name');
		expect(fields(el)).toHaveLength(4);
	});

	it('names itself in the error where it drew no heading', () => {
		const el = render(
			{ hideLabel: true },
			readData('\n![](https://example.com/p.png)\n'),
		);
		expect(error(el)?.startsWith('Passport: ')).toBe(true);
	});

	it('focuses the field on a press, with the reference selected', () => {
		const el = render();
		press(frame(el));
		(frame(el) as HTMLElement).dispatchEvent(
			new MouseEvent('click', { bubbles: true }),
		);
		expect(document.activeElement).toBe(pictureField(el));
		expect(pictureField(el)?.selectionStart).toBe(0);
		expect(pictureField(el)?.selectionEnd).toBe(SOURCE.length);
	});

	it('commits a new reference on blur', () => {
		const written: unknown[] = [];
		const el = render({}, readData(BODY), {
			onChange: (data) => written.push(data),
		});
		const field = pictureField(el) as HTMLInputElement;
		field.focus();
		field.value = '![[Thora in armour.png]]';
		field.blur();
		expect(written).toEqual([{ source: '![[Thora in armour.png]]' }]);
	});

	it('refuses a draft the section could not hold, and keeps it on screen', () => {
		/*
		 * The one refusal this component makes that Image does not, and it is
		 * about the file model rather than about pictures: the picture is one line
		 * beside a fence, *found* by looking like an embed, so committing a bare
		 * path would leave the reader's own text in the note as prose with the
		 * field empty beside it — the lockout Image's correction exists to
		 * prevent, arrived at from the other side.
		 */
		const written: unknown[] = [];
		const el = render({}, readData(BODY), {
			onChange: (data) => written.push(data),
		});
		const field = pictureField(el) as HTMLInputElement;
		field.focus();
		field.value = 'Thora.png';
		field.blur();
		expect(written).toEqual([]);
		expect(field.value).toBe('Thora.png');
		// The message is `embed-rule.ts`'s, so a reader meets one sentence here
		// and in an Image.
		expect(error(el)).toBe('A picture is an embed: ![[Portrait.png]].');
	});

	it('clears a standing refusal once the draft is acceptable again', () => {
		const el = render();
		const field = pictureField(el) as HTMLInputElement;
		field.focus();
		field.value = 'Thora.png';
		field.blur();
		expect(error(el)).not.toBeNull();
		// A draft equal to what is stored produces no rebuild, so the frame has to
		// be able to come back on its own.
		field.focus();
		field.value = SOURCE;
		field.blur();
		expect(error(el)).toBeNull();
		expect(picture(el)).not.toBeNull();
	});

	it('clears the picture without refusing an empty draft', () => {
		const written: unknown[] = [];
		const el = render({}, readData(BODY), {
			onChange: (data) => written.push(data),
		});
		const field = pictureField(el) as HTMLInputElement;
		field.focus();
		field.value = '';
		field.blur();
		expect(written).toEqual([{ source: '' }]);
	});

	it('keeps the field in the DOM and in the tab order unfocused', () => {
		// The rendered layer and the field are stacked, never swapped, which is
		// what keeps the view's focus restoration counting the same controls.
		const el = render();
		expect(pictureField(el)?.isConnected).toBe(true);
		expect(pictureField(el)?.tabIndex).toBe(0);
	});
});

describe('passport.render — hidePicture', () => {
	it('draws no frame and no picture field', () => {
		const el = render({ hidePicture: true });
		expect(el.querySelector('.sheetsmith-passport-picture')).toBeNull();
		expect(frame(el)).toBeNull();
		expect(pictureField(el)).toBeNull();
		expect(picture(el)).toBeNull();
	});

	it('leaves the name and every field live', () => {
		const el = render({ hidePicture: true });
		expect(shownName(el)).toBe('Thora Ironhelm of Mirabar');
		expect(fields(el)).toHaveLength(4);
	});

	it('still preserves an embed line the note holds', () => {
		// Constraint 4: a layout change never deletes character data. A hidden
		// picture draws no field, so nothing ever commits a `source` — and the
		// delta is what makes that enough.
		const el = render({ hidePicture: true });
		const field = fields(el)[0] as HTMLInputElement;
		field.focus();
		field.value = 'Rogue';
		field.blur();
		expect(
			passport.write({ values: { class: 'Rogue' } }, BODY, {
				...config,
				hidePicture: true,
			}),
		).toContain(SOURCE);
	});
});

describe('passport.sample', () => {
	it('fills the name and each declared key with its own word', () => {
		expect(passport.sample?.(config)).toBe(
			'\n```sheet\nname: Character name\nclass: Class\nsubclass: Subclass\nspecies: Species\nlevel: Level\n```\n',
		);
	});

	it('writes no embed line, since there is no vault behind the canvas', () => {
		expect(passport.sample?.(config)).not.toContain('![[');
	});

	it('fills the name even where the layout declared no fields', () => {
		// **Every configuration of this component fills something now**, which is
		// the owner's reversal reaching the canvas: the name used to come from the
		// note's filename, so a passport with no declared fields held nothing a
		// note could store and sampled the empty body.
		const bare = '\n```sheet\nname: Character name\n```\n';
		expect(passport.sample?.({ ...config, fields: [] })).toBe(bare);
		expect(passport.sample?.({ ...config, fields: undefined })).toBe(bare);
	});

	it('reads back through its own read, and writes back byte for byte', () => {
		// The point of a sample being a body: what the canvas draws is exactly
		// what a note holding that text would draw.
		const body = passport.sample?.(config) ?? '';
		const data = readData(body);
		expect(Object.keys(data.values ?? {})).toEqual([
			'name',
			'class',
			'subclass',
			'species',
			'level',
		]);
		expect(passport.write(data, body, config)).toBe(body);
	});
});
