// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { image, ImageConfig, ImageData } from './image';
import { parseCharacter, serialiseCharacter } from '../parse/character';
import { FOCUSABLE } from '../view/cell-focus';
import { RenderContext } from '../types';

const config: ImageConfig = {
	id: 'portrait',
	type: 'image',
	label: 'Portrait',
	position: { col: 1, row: 1, width: 3, height: 4 },
};

const SOURCE = '![[Sildar Hallwinter.png]]';
const BODY = `\n${SOURCE}\n`;

/** A vault that holds one picture, one note, and nothing else. */
const HELD: Record<string, string> = {
	'Sildar Hallwinter.png': 'app://vault/Sildar%20Hallwinter.png',
	'Notes.md': 'app://vault/Notes.md',
};

const context: RenderContext<ImageData> = {
	resolved: {},
	resolveField: () => null,
	onChange: () => undefined,
	resource: (target) => HELD[target] ?? null,
};

function render(
	overrides: Partial<ImageConfig> = {},
	data: ImageData | null = { source: SOURCE },
	ctx: Partial<RenderContext<ImageData>> = {},
) {
	const el = document.createElement('div');
	image.render(el, { ...config, ...overrides }, data, { ...context, ...ctx });
	return el;
}

const block = (el: HTMLElement) =>
	el.querySelector('.sheetsmith-image') as HTMLElement;
const frame = (el: HTMLElement) =>
	el.querySelector('.sheetsmith-image-frame') as HTMLElement;
const picture = (el: HTMLElement) =>
	el.querySelector<HTMLImageElement>('.sheetsmith-image-picture');
const field = (el: HTMLElement) =>
	el.querySelector('.sheetsmith-image-input') as HTMLInputElement;
const error = (el: HTMLElement) =>
	el.querySelector('.sheetsmith-error')?.textContent ?? null;

function readData(body: string): ImageData {
	const result = image.read(body, config);
	if (!result.ok || result.data === null) throw new Error('expected data');
	return result.data;
}

describe('image.read', () => {
	it('reads a body whose only content is one embed', () => {
		expect(image.read(BODY, config)).toEqual({
			ok: true,
			data: { source: SOURCE },
		});
	});

	it('keeps the size hint in the value rather than reading it', () => {
		// The convergent vocabulary is Obsidian's own `|100` and `|640x480`, and the
		// plugin invents no third one. What it does with them is nothing: they are
		// stored, preserved, and honoured by markdown view (SPEC §4.2, §8).
		for (const hint of ['|200', '|640x480', '|Sildar, in better days']) {
			const source = `![[Sildar Hallwinter.png${hint}]]`;
			expect(image.read(`\n${source}\n`, config)).toEqual({
				ok: true,
				data: { source },
			});
		}
	});

	it('treats an empty or missing section as an empty frame, not an error', () => {
		// PATTERNS §4: the first commit writes it. Reporting a value the note never
		// held would make the first render offer to save one.
		for (const body of ['', '\n', '  \n\t\n ', '\r\n\r\n']) {
			expect(image.read(body, config)).toEqual({ ok: true, data: null });
		}
	});

	/*
	 * Every refusal, with the fix it names. The message matters as much as the
	 * refusal: PATTERNS §4 asks the text to name the fix, and these are two
	 * different fixes — write the bracket form, or use a different component.
	 */
	it('names the syntax when the body is not an embed', () => {
		for (const body of [
			'Sildar Hallwinter.png',
			'[[Sildar Hallwinter.png]]',
			'![](Sildar.png)',
			'A picture goes here.',
			'![[a.png]] ![[b.png]]',
			'![[a.png]] and a caption',
		]) {
			const result = image.read(body, config);
			expect(result.ok).toBe(false);
			if (result.ok) throw new Error('expected a refusal');
			expect(result.error).toBe('A picture is an embed: ![[Portrait.png]].');
		}
	});

	it('sends a web address to the component that can carry one', () => {
		/*
		 * The refusal that is policy rather than syntax. `![[https://…]]` is a
		 * well-formed embed, and an `<img src>` this plugin wrote would be a request
		 * it makes on the reader's behalf on every render, to a host named in
		 * someone else's note. The message has to carry the positive answer or it is
		 * a dead end: Obsidian fetches a remote picture in a Rich text block under
		 * its own settings.
		 */
		const result = image.read('![[https://example.com/p.png]]', config);
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected a refusal');
		expect(result.error).toContain('web address');
		expect(result.error).toContain('Rich text');
		// And it does not say "no file in this vault is called https://…", which is
		// what a resolution failure would have said and would lead nowhere.
		expect(result.error).not.toContain('No file in this vault');
	});

	it('does not refuse a filename that merely contains a colon-slash', () => {
		// The remote check is anchored, so a file whose name is odd is still a file.
		expect(image.read('![[weird:name.png]]', config).ok).toBe(true);
	});
});

describe('image.write', () => {
	/*
	 * Constraint 3 over the spacings a hand-edited note actually has. The body is
	 * the value plus its own framing, so drift here reformats every note on the
	 * first save of any component on the sheet.
	 */
	const SPELLINGS: Record<string, string> = {
		'the canonical shape': '\n![[P.png]]\n',
		'no blank line after the heading': '![[P.png]]\n',
		'no trailing newline': '\n![[P.png]]',
		'several trailing blank lines': '\n![[P.png]]\n\n\n',
		'a blank line before it': '\n\n![[P.png]]\n',
		CRLF: '\r\n![[P.png]]\r\n',
		'spaces around it': '\n  ![[P.png]]  \n',
		'a width hint': '\n![[P.png|200]]\n',
		'a width and height hint': '\n![[P.png|640x480]]\n',
		'a subpath': '\n![[Notes#Portrait]]\n',
	};

	it.each(Object.entries(SPELLINGS))(
		'round-trips %s byte for byte',
		(_name, body) => {
			expect(image.write(readData(body), body, config)).toBe(body);
		},
	);

	it('changes only the embed, leaving the body\'s own runs in place', () => {
		expect(
			image.write({ source: '![[Q.png]]' }, '\n\n![[P.png]]\n\n\n', config),
		).toBe('\n\n![[Q.png]]\n\n\n');
		expect(
			image.write({ source: '![[Q.png]]' }, '\r\n![[P.png]]\r\n', config),
		).toBe('\r\n![[Q.png]]\r\n');
	});

	it('writes the canonical body for a section that does not exist yet', () => {
		expect(image.write({ source: SOURCE }, null, config)).toBe(BODY);
	});

	it('never writes a fence, which is the whole of Constraint 2 here', () => {
		// The amendment to §4.2, asserted as a property rather than argued: the
		// brackets have to be in plain markdown or Obsidian does not index them and
		// renaming the file silently breaks the sheet.
		const written = [
			image.write({ source: SOURCE }, null, config),
			image.write({ source: SOURCE }, '\n![[Old.png]]\n', config),
			image.write({ source: '' }, '\n![[Old.png]]\n', config),
		];
		for (const body of written) expect(body).not.toContain('```');
	});

	it('keeps the section rather than removing it when the value is cleared', () => {
		// Constraint 4 at its smallest: clearing is an edit, and an edit never takes
		// the heading with it. The body reads back as the empty frame it now is.
		const cleared = image.write({ source: '' }, BODY, config);
		expect(image.read(cleared, config)).toEqual({ ok: true, data: null });
	});
});

describe('image.render — the picture', () => {
	it('takes the src the app returned, and nothing else', () => {
		const el = render();
		expect(picture(el)?.getAttribute('src')).toBe(
			'app://vault/Sildar%20Hallwinter.png',
		);
	});

	it('asks for the target and never for the source line', () => {
		// The pipe options are the file's business, not the resolver's: asking for
		// `Sildar Hallwinter.png|200` would resolve to nothing.
		const asked: string[] = [];
		render({}, { source: '![[Sildar Hallwinter.png|200]]' }, {
			resource: (target) => {
				asked.push(target);
				return HELD[target] ?? null;
			},
		});
		expect(asked).toEqual(['Sildar Hallwinter.png']);
	});

	it('draws the same picture whatever size hint the note carries', () => {
		// SPEC §8: the grid is the sizing control. A number out of a character's
		// note may not resize a box the layout author placed, so the hint changes
		// nothing at all about what is drawn.
		const plain = render({}, { source: SOURCE });
		for (const hint of ['|200', '|640x480']) {
			const hinted = render({}, { source: `![[Sildar Hallwinter.png${hint}]]` });
			expect(picture(hinted)?.getAttribute('src')).toBe(
				picture(plain)?.getAttribute('src'),
			);
			expect(picture(hinted)?.getAttribute('width')).toBeNull();
			expect(picture(hinted)?.getAttribute('height')).toBeNull();
			expect(picture(hinted)?.style.width).toBe('');
			expect(picture(hinted)?.style.height).toBe('');
		}
	});

	it('gives the picture a class this stylesheet owns', () => {
		/*
		 * Meta Bind 671, open and unanswered: a picture whose filename ended in
		 * `-portrait` rendered cropped while the same file renamed displayed whole —
		 * almost certainly a filename-keyed rule in the reporter's own theme.
		 * Content drawn into a themed surface inherits the reader's theme and
		 * snippets, and a bare `<img>` inherits whatever they say. The class is what
		 * this plugin's own `object-fit` rides on, and `styles.test.ts` holds the
		 * declaration.
		 */
		const el = render({}, { source: '![[Sildar Hallwinter.png]]' });
		expect(picture(el)?.classList.contains('sheetsmith-image-picture')).toBe(
			true,
		);
	});

	it('names the picture to assistive tech only where the heading does not', () => {
		// Two names for one thing is worse than one. Where the heading is hidden
		// this is the only name the picture has.
		expect(picture(render())?.getAttribute('alt')).toBe('');
		expect(picture(render({ hideLabel: true }))?.getAttribute('alt')).toBe(
			'Portrait',
		);
	});

	it('takes its height from its placement, whatever it holds', () => {
		// The same floor a prose block takes, and for the same reason: an `<img>`
		// has an intrinsic size, so left in flow it would size the box from the
		// *file* — a character's note deciding a box the layout placed (SPEC §8).
		for (const height of [1, 2, 4, 8]) {
			const el = render({ position: { col: 1, row: 1, width: 3, height } });
			expect(block(el).style.getPropertyValue('--sheetsmith-rows')).toBe(
				String(height),
			);
		}
	});

	it('is the same box with a picture, an error, and nothing at all', () => {
		const states: (ImageData | null)[] = [
			null,
			{ source: SOURCE },
			{ source: '![[Missing.png]]' },
		];
		for (const data of states) {
			const el = render({}, data);
			expect(block(el).style.getPropertyValue('--sheetsmith-rows')).toBe('4');
		}
	});
});

describe('image.render — it is a placed box', () => {
	/*
	 * The half of the shared box that a stylesheet cannot check. The floor, the
	 * surface and the two media rules live once, on `.sheetsmith-placed` and
	 * `.sheetsmith-placed-box` — so the way that breaks is no longer two copies
	 * drifting, it is **this component forgetting to ask for them**, which would
	 * leave the frame with no height at all and nothing saying why.
	 *
	 * `styles.test.ts` holds what the shared rule says; this holds that this
	 * component is one of the things it says it about.
	 */
	it('asks for the shared box as well as its own class', () => {
		const el = render();
		const root = el.querySelector('.sheetsmith-image') as HTMLElement;
		expect(root.classList.contains('sheetsmith-placed')).toBe(true);
		const box = el.querySelector('.sheetsmith-image-box') as HTMLElement;
		expect(box.classList.contains('sheetsmith-placed-box')).toBe(true);
	});

	it('keeps its own class, which is what carries what differs', () => {
		// Not decoration: what goes *inside* the box is the one thing the two
		// consumers do not share, and every rule for it is addressed by this class.
		const el = render();
		expect(el.querySelector('.sheetsmith-image')).not.toBeNull();
		expect(el.querySelector('.sheetsmith-image-box')).not.toBeNull();
	});

	it('is not spellchecked while the picture is what is on screen', () => {
		// A reference is not prose, and the field's text is transparent unfocused:
		// its squiggles would be painted across the portrait.
		const input = field(render());
		expect(input.getAttribute('spellcheck')).toBe('false');
		input.dispatchEvent(new Event('focus'));
		expect(input.getAttribute('spellcheck')).toBe('true');
	});
});

describe('image.render — every failure is on screen (the prior art)', () => {
	it('says which file is missing, rather than drawing an empty box', () => {
		/*
		 * Fantasy Statblocks 300: the plugin rendered
		 * `<div class="statblock-inline-item group-container"></div>` and put "No
		 * image could be loaded" in the *console*, so the reader saw an empty box
		 * and no explanation. This is the commonest way a vault reference goes
		 * stale — the file was renamed, moved, or never existed — so the message
		 * names the file, which is the fix.
		 */
		const el = render({}, { source: '![[Missing.png]]' });
		expect(error(el)).toBe('No file in this vault is called "Missing.png".');
		expect(picture(el)).toBeNull();
	});

	it('says a file it cannot draw is not a picture, when the browser says so', () => {
		/*
		 * Fantasy Statblocks 455: webp stopped rendering inside the plugin after an
		 * update, in a brand new vault, while "Can display the image outside of the
		 * statblock with the same syntax." A resolution path diverging from the
		 * app's own is the mechanism, and the defence is to hold no list at all: the
		 * app says whether the file exists, the browser says whether it can draw it,
		 * and this reports what happened rather than predicting it.
		 */
		const el = render({}, { source: '![[Notes.md]]' });
		// Resolved, so a picture is drawn and nothing is wrong yet.
		expect(picture(el)).not.toBeNull();
		expect(error(el)).toBeNull();

		// The browser then reports it cannot draw it.
		picture(el)?.dispatchEvent(new Event('error'));
		expect(error(el)).toBe('"Notes.md" is not a picture.');
		expect(picture(el)).toBeNull();
		// And the field survives it, so the reference is still editable.
		expect(field(el)).not.toBeNull();
		expect(field(el).value).toBe('![[Notes.md]]');
	});

	it('holds no extension list anywhere in src/', () => {
		/*
		 * The structural half of the same report, checked rather than promised: a
		 * plugin that decided for itself which formats count is exactly how webp
		 * came to render outside a component and not inside it, so the guard is that
		 * no such list exists to fall behind.
		 *
		 * **What it looks for is a *list*, not a mention**, and the first spelling
		 * of this check got that wrong — matching any dotted extension fired on
		 * `![[Portrait.png]]` in this component's own placeholder and on the doc
		 * comments explaining the rule, which is the guard whose false positive is
		 * the sentence explaining the guard. Two *distinct* formats close together
		 * is what an allowlist is made of, in every spelling it could take: an
		 * array, a regex alternation, a switch, a set.
		 */
		const offenders = sourceFiles()
			.filter(({ source }) => holdsFormatList(source))
			.map(({ name }) => name);
		expect(offenders).toEqual([]);
	});

	it('would catch a format list however it is spelled', () => {
		// The check above asserts an empty list, so a predicate that had stopped
		// matching would read exactly like a rule nothing violates.
		for (const spelling of [
			"const IMAGES = ['png', 'jpg', 'webp'];",
			"if (/\\.(png|jpe?g|webp)$/.test(path)) return true;",
			"const OK = new Set(['image/png', 'image/webp']);",
			"case '.png': case '.gif': return true;",
		]) {
			expect(holdsFormatList(spelling)).toBe(true);
		}
		// And the prose and the placeholder it must not fire on.
		for (const kept of [
			"const PLACEHOLDER = '![[Portrait.png]]';",
			'// webp silently ceasing to render, while the same syntax worked outside',
			"expect(parseEmbed('![[Portrait.png|200]]')).toBe('Portrait.png');",
		]) {
			expect(holdsFormatList(kept)).toBe(false);
		}
	});

	it('writes nothing to the console on any failure path', () => {
		/*
		 * The thread running through every report in the research: CSB 497's
		 * "Console is not outputing any warning nor error", and FS 300's opposite,
		 * a console message where the reader was looking at a box. Both are wrong.
		 * The sheet says it; the console says nothing.
		 */
		const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map(
			(name) => vi.spyOn(console, name).mockImplementation(() => undefined),
		);
		try {
			render({}, { source: '![[Missing.png]]' });
			const bad = render({}, { source: '![[Notes.md]]' });
			picture(bad)?.dispatchEvent(new Event('error'));
			render({}, null);
			image.read('not an embed', config);
			image.read('![[https://example.com/p.png]]', config);
			for (const spy of spies) expect(spy).not.toHaveBeenCalled();
		} finally {
			for (const spy of spies) spy.mockRestore();
		}
	});

	it('draws its label above whichever failure the frame holds', () => {
		/*
		 * UI §12's open row is that a render-time error "replaces the whole card
		 * including its heading, so nothing on screen says which component failed".
		 * This component adds no instance to it: the label is drawn before anything
		 * can fail, and the error goes in the frame below it.
		 */
		for (const source of ['![[Missing.png]]', '![[Notes.md]]']) {
			const el = render({}, { source });
			picture(el)?.dispatchEvent(new Event('error'));
			expect(
				el.querySelector('.sheetsmith-image-label')?.textContent,
			).toBe('Portrait');
			expect(frame(el).querySelector('.sheetsmith-error')).not.toBeNull();
		}
	});

	it('draws an empty frame and no error where there is no vault', () => {
		// `resource` absent is the harness and a unit test, and the absence of a
		// vault is not evidence that a file is missing — `LinkContext`'s own bargain
		// read for a picture. So: no picture, no error, and the reference in the
		// field where the reader can still see and edit it.
		const el = render({}, { source: SOURCE }, { resource: undefined });
		expect(picture(el)).toBeNull();
		expect(error(el)).toBeNull();
		expect(field(el).value).toBe(SOURCE);
	});

	it('draws an empty frame with a placeholder where nothing is stored', () => {
		const el = render({}, null);
		expect(picture(el)).toBeNull();
		expect(error(el)).toBeNull();
		expect(field(el).value).toBe('');
		expect(field(el).placeholder).toBe('![[Portrait.png]]');
	});
});

describe('image.render — the gesture', () => {
	function driven(data: ImageData | null = { source: SOURCE }) {
		const commits: ImageData[] = [];
		const el = render({}, data, { onChange: (d) => commits.push(d) });
		document.body.appendChild(el);
		return { el, commits, done: () => el.remove() };
	}

	const press = (on: HTMLElement) =>
		on.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

	it('focuses the field on a press on the picture', () => {
		// §4.2's "click to change", honoured and narrowed: a click changes it by
		// editing its text rather than by opening a picker.
		const { el, done } = driven();
		press(frame(el));
		expect(document.activeElement).toBe(field(el));
		done();
	});

	it('selects the whole reference, since that is what gets replaced', () => {
		// The reader pastes what Obsidian put on their clipboard for a file, which
		// is the whole embed — so a caret at one end would mean selecting it by hand.
		const { el, done } = driven();
		press(frame(el));
		expect(field(el).selectionStart).toBe(0);
		expect(field(el).selectionEnd).toBe(SOURCE.length);
		done();
	});

	it('focuses the field on a press on an empty frame', () => {
		const { el, done } = driven(null);
		press(frame(el));
		expect(document.activeElement).toBe(field(el));
		done();
	});

	it('focuses the field on a press on an error message', () => {
		// Which is how the reader fixes it: the message names the file and the field
		// under it is where the name is changed.
		const { el, done } = driven({ source: '![[Missing.png]]' });
		const message = el.querySelector('.sheetsmith-error') as HTMLElement;
		press(message);
		expect(document.activeElement).toBe(field(el));
		done();
	});

	it('leaves a caret alone once the field is already being edited', () => {
		// A press on the frame beside the field is the reader aiming at the picture,
		// not asking to start over — re-selecting would throw away a caret they had
		// just placed.
		const { el, done } = driven();
		field(el).focus();
		field(el).setSelectionRange(4, 4);
		press(frame(el));
		expect(field(el).selectionStart).toBe(4);
		expect(field(el).selectionEnd).toBe(4);
		done();
	});

	it('does not steal focus from a press that ended a selection', () => {
		// The error message names a filename the reader may well be copying.
		const { el, done } = driven({ source: '![[Missing.png]]' });
		const message = el.querySelector('.sheetsmith-error') as HTMLElement;
		const range = document.createRange();
		range.selectNodeContents(message);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		press(message);
		expect(document.activeElement).not.toBe(field(el));
		selection?.removeAllRanges();
		done();
	});

	it('commits on blur, and nothing before it', () => {
		const { el, commits, done } = driven();
		const input = field(el);
		input.focus();
		input.value = '![[Sera.png]]';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		expect(commits).toEqual([]);
		input.blur();
		expect(commits).toEqual([{ source: '![[Sera.png]]' }]);
		done();
	});

	it('restores the stored value on Escape, and announces the restore', () => {
		const { el, commits, done } = driven();
		const input = field(el);
		input.focus();
		input.value = '![[Wrong.png]]';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
		);
		expect(input.value).toBe(SOURCE);
		expect(commits).toEqual([]);
		expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toBe(
			`Portrait restored to ${SOURCE}`,
		);
		done();
	});

	it('keeps the field in the DOM and in the tab order unfocused', () => {
		// UI §9: stacked, never swapped. A field that came and went would renumber
		// every control after it for the view's focus restoration.
		const { el, done } = driven();
		const input = field(el);
		expect(el.contains(input)).toBe(true);
		expect(input.disabled).toBe(false);
		expect(input.readOnly).toBe(false);
		expect(Array.from(el.querySelectorAll(FOCUSABLE))).toEqual([input]);
		done();
	});
});

describe('image — a chosen picture survives what happens next', () => {
	/*
	 * Custom System Builder 497: a chosen picture rolls back to its default on an
	 * unrelated action, and "Console is not outputing any warning nor error." The
	 * shape of that bug is a value that lives anywhere other than the note — so
	 * this drives the whole path the app drives, including a rebuild caused by
	 * *something else*, and asserts against text that made a round trip through a
	 * note body rather than against the object that was reported.
	 */
	function sheet(body: string | null) {
		let note = parseCharacter(
			`---\nsheet-layout: Prose\n---\n\n## Portrait\n${body ?? ''}\n## Level\n\n\`\`\`sheet\nlevel: 6\n\`\`\`\n`,
		);
		let el = document.createElement('div');
		const draw = () => {
			const section = note.sections.find((s) => s.label === 'Portrait');
			const read = image.read(section?.body ?? '', config);
			el.remove();
			el = document.createElement('div');
			document.body.appendChild(el);
			image.render(el, config, read.ok ? read.data : null, {
				...context,
				onChange: (edited) => {
					const at = note.sections.findIndex((s) => s.label === 'Portrait');
					const sections = note.sections.slice();
					sections[at] = {
						...sections[at]!,
						body: image.write(edited, sections[at]!.body, config),
					};
					note = { ...note, sections };
					draw();
				},
			});
		};
		draw();
		return {
			type: (text: string) => {
				const input = field(el);
				input.focus();
				input.value = text;
				input.dispatchEvent(new Event('input', { bubbles: true }));
				input.blur();
			},
			/** A rebuild caused by something that is not this component. */
			elsewhere: () => draw(),
			shown: () => picture(el)?.getAttribute('src') ?? null,
			inField: () => field(el).value,
			note: () => serialiseCharacter(note),
			done: () => el.remove(),
		};
	}

	it('keeps a picture chosen in an empty frame', () => {
		const live = sheet(null);
		live.type(SOURCE);
		expect(live.inField()).toBe(SOURCE);
		expect(live.shown()).toBe('app://vault/Sildar%20Hallwinter.png');
		expect(live.note()).toContain(SOURCE);
		live.done();
	});

	it('keeps it across a rebuild caused by something else on the sheet', () => {
		// The CSB 497 shape exactly: an unrelated action redraws the sheet, and the
		// value must not roll back to anything.
		const live = sheet(null);
		live.type(SOURCE);
		live.elsewhere();
		live.elsewhere();
		expect(live.inField()).toBe(SOURCE);
		expect(live.shown()).toBe('app://vault/Sildar%20Hallwinter.png');
		live.done();
	});

	it('keeps a size hint the sheet does not read, across the same rebuild', () => {
		// The half most likely to be quietly dropped, since nothing on the sheet
		// uses it: a `write` that rebuilt the value from the target would lose it.
		const live = sheet('\n![[Sildar Hallwinter.png|200x300]]\n');
		live.elsewhere();
		expect(live.inField()).toBe('![[Sildar Hallwinter.png|200x300]]');
		live.type('![[Sildar Hallwinter.png|640x480]]');
		live.elsewhere();
		expect(live.note()).toContain('![[Sildar Hallwinter.png|640x480]]');
		live.done();
	});

	it('leaves the rest of the note untouched by an edit here', () => {
		// Constraint 4: the section beside this one keeps its own bytes.
		const live = sheet('\n![[Old.png]]\n');
		const before = live.note();
		live.type(SOURCE);
		const after = live.note();
		expect(before).toContain('level: 6');
		expect(after).toContain('level: 6');
		expect(after.slice(after.indexOf('## Level'))).toBe(
			before.slice(before.indexOf('## Level')),
		);
		live.done();
	});

	it('round-trips the whole note when nothing changed', () => {
		const live = sheet('\n![[Old.png]]\n');
		const before = live.note();
		live.elsewhere();
		expect(live.note()).toBe(before);
		live.done();
	});
});

describe('image — what it deliberately does not have', () => {
	const declares = (member: string) => member in image;

	it('publishes no name a formula could resolve', () => {
		// SPEC §4.1 names "an image" as the case that leaves `scopeValues` off, and
		// §5's language has no strings: a published path could be compared to
		// nothing and handed to no builtin, and could only be *written* — a Pool
		// clamping its bar against a file path (SPEC §13).
		expect(declares('scopeValues')).toBe(false);
		expect(declares('scopeRows')).toBe(false);
	});

	it('holds no state a reset trigger could reach', () => {
		expect(declares('applyReset')).toBe(false);
		expect(declares('hasBuffer')).toBe(false);
	});

	it('accepts no configuration but its label and whether to show it', () => {
		// §4.2 promised `label` and nothing else. No width, no height, no fit, no
		// crop: the grid is the sizing control (SPEC §8).
		expect(image.configFields.map((f) => f.key)).toEqual(['hideLabel']);
		expect(image.formulaFields).toEqual([]);
		const keys = JSON.stringify(image.configFields);
		for (const invented of ['width', 'height', 'fit', 'crop', 'size']) {
			expect(keys).not.toContain(`"key":"${invented}"`);
		}
	});

	it('offers no palette entry', () => {
		expect(declares('palette')).toBe(false);
	});
});

/*
 * Scaffolding for the extension-list scan, at the foot because it is machinery
 * rather than a case.
 */

/**
 * One image format, in any of the shapes a list of them is written in.
 *
 * The delimiter set is what makes this catch a *regex alternation* — the likeliest
 * spelling of such a list, and the one the first draft of this predicate missed:
 * in `/\.(png|jpe?g|webp)$/` only the first format follows a dot, and the rest
 * follow a pipe.
 */
const FORMAT = /(?:\.|image\/|['"`]|[(|])(png|jpe?g|gif|webp|avif|bmp|tiff?)\b/gi;

/** How close two of them have to be to be one construct rather than two mentions. */
const TOGETHER = 90;

/**
 * Whether this source holds a list of image formats, rather than mentioning one.
 *
 * Two *distinct* formats within {@link TOGETHER} characters. A list has to name
 * more than one format to be a list at all, and no prose in this repository names
 * two of them in one clause — while every spelling of an allowlist does, whether
 * it is an array, a regex alternation, a switch or a set.
 *
 * `svg` is deliberately absent from {@link FORMAT}: the icon stub draws SVG and
 * says so, which is a fact about drawing markup rather than about deciding what
 * counts as a picture.
 */
function holdsFormatList(source: string): boolean {
	const seen: { at: number; format: string }[] = [];
	for (const match of source.matchAll(FORMAT)) {
		const format = (match[1] ?? '').toLowerCase();
		for (const earlier of seen) {
			if (earlier.format === format) continue;
			if (match.index - earlier.at <= TOGETHER) return true;
		}
		seen.push({ at: match.index, format });
	}
	return false;
}

/** Every source file under `src/`, tests and this file's own scan excluded. */
function sourceFiles(): { name: string; source: string }[] {
	const here = dirname(fileURLToPath(import.meta.url));
	const root = join(here, '..');
	const found: { name: string; source: string }[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(path);
			} else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
				found.push({ name: path.slice(root.length + 1), source: readFileSync(path, 'utf8') });
			}
		}
	};
	walk(root);
	return found;
}
