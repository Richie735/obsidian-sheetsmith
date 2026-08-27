// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { richText, RichTextConfig, RichTextData } from './rich-text';
import { parseCharacter, serialiseCharacter } from '../parse/character';
import { FOCUSABLE } from '../view/cell-focus';
import { RenderContext } from '../types';

const config: RichTextConfig = {
	id: 'backstory',
	type: 'rich-text',
	label: 'Backstory',
	position: { col: 1, row: 1, width: 6, height: 3 },
};

const BODY =
	'\nGrew up in [[Neverwinter]] under [[Sildar Hallwinter|Sildar]].\n\n' +
	'- Owes a debt to the [[Zhentarim]]\n- Cannot swim\n';

const TEXT =
	'Grew up in [[Neverwinter]] under [[Sildar Hallwinter|Sildar]].\n\n' +
	'- Owes a debt to the [[Zhentarim]]\n- Cannot swim';

const context: RenderContext<RichTextData> = {
	resolved: {},
	resolveField: () => null,
	onChange: () => undefined,
};

function render(
	overrides: Partial<RichTextConfig> = {},
	data: RichTextData | null = { text: TEXT },
	ctx: Partial<RenderContext<RichTextData>> = {},
) {
	const el = document.createElement('div');
	richText.render(el, { ...config, ...overrides }, data, {
		...context,
		...ctx,
	});
	return el;
}

const field = (el: HTMLElement) =>
	el.querySelector('.sheetsmith-rich-text-input') as HTMLTextAreaElement;
const rendered = (el: HTMLElement) =>
	el.querySelector('.sheetsmith-rich-text-rendered') as HTMLElement;
const block = (el: HTMLElement) =>
	el.querySelector('.sheetsmith-rich-text') as HTMLElement;
const links = (el: HTMLElement) =>
	Array.from(el.querySelectorAll<HTMLAnchorElement>('a'));

/** A `read` that must have succeeded with data, as every round trip needs. */
function readData(body: string): RichTextData {
	const result = richText.read(body, config);
	if (!result.ok || result.data === null) throw new Error('expected data');
	return result.data;
}

describe('richText.read', () => {
	it('hands back the body with the whitespace run at each end removed', () => {
		expect(richText.read(BODY, config)).toEqual({
			ok: true,
			data: { text: TEXT },
		});
	});

	it('never fails, whatever the body holds', () => {
		/*
		 * Not a sample of likely bodies: this is the whole claim. Every body is
		 * legal text, so this component has no read error state at all — which is
		 * why it declares no config guard and never draws `.sheetsmith-error`.
		 * A fence, a table and a heading are here because each is reserved syntax
		 * to some other component and content to this one.
		 */
		const bodies = [
			'',
			'\n',
			'   \t\n \n',
			'\n```sheet\nvalue: 3\n```\n',
			'\n| Item | Qty |\n| --- | --- |\n| Rope | 1 |\n',
			'\n# A heading\n\nAnd a paragraph.\n',
			'\n![[Portrait.png]]\n',
			'\r\nCRLF prose.\r\n',
			'\nUnclosed [[bracket\n',
		];
		for (const body of bodies) {
			expect(richText.read(body, config).ok).toBe(true);
		}
	});

	it('treats a body of nothing but whitespace as empty, not stored', () => {
		// PATTERNS §4: an editable empty block, and the first commit writes it.
		// Reporting an empty string instead would make the first render offer to
		// save a value the note never held.
		for (const body of ['', '\n', '  \n\t\n ', '\r\n\r\n']) {
			expect(richText.read(body, config)).toEqual({ ok: true, data: null });
		}
	});
});

describe('richText.write', () => {
	/*
	 * Constraint 3 over bodies whose spacing is what a hand-edited note actually
	 * looks like. The body *is* the value plus its own framing here, so a drift
	 * would reformat every note on the first save of any component on the sheet.
	 */
	const SPELLINGS: Record<string, string> = {
		'the canonical shape': '\nGrew up in Neverwinter.\n',
		'no blank line after the heading': 'Grew up in Neverwinter.\n',
		'no trailing newline at all': '\nGrew up in Neverwinter.',
		'several trailing blank lines': '\nGrew up in Neverwinter.\n\n\n',
		'a blank line before the prose': '\n\nGrew up in Neverwinter.\n',
		'CRLF': '\r\nGrew up in Neverwinter.\r\n',
		'CRLF with a blank line either side': '\r\n\r\nGrew up.\r\n\r\n',
		'tabs and spaces around it': '\n\t Grew up in Neverwinter. \t\n',
		'two paragraphs': '\nFirst.\n\nSecond.\n',
		'a fence, which is content here': '\n```\ncode\n```\n',
	};

	it.each(Object.entries(SPELLINGS))(
		'round-trips %s byte for byte',
		(_name, body) => {
			expect(richText.write(readData(body), body, config)).toBe(body);
		},
	);

	it('changes only the prose, leaving the body\'s own runs in place', () => {
		// The other half of the round trip, and the half a byte-identical check
		// cannot see: an *edit* has to land between the same two runs rather than
		// in a canonical body of its own.
		expect(
			richText.write({ text: 'Moved to Waterdeep.' }, '\n\nGrew up.\n\n\n', config),
		).toBe('\n\nMoved to Waterdeep.\n\n\n');
		expect(
			richText.write({ text: 'Moved.' }, '\r\n\r\nGrew up.\r\n', config),
		).toBe('\r\n\r\nMoved.\r\n');
		expect(richText.write({ text: 'Moved.' }, 'Grew up.\n', config)).toBe(
			'Moved.\n',
		);
	});

	it('writes the canonical body for a section that does not exist yet', () => {
		// `freshBody`'s shape, so a new section reads like every other one.
		expect(richText.write({ text: 'A start.' }, null, config)).toBe(
			'\nA start.\n',
		);
	});

	it('writes the canonical body into a section holding only whitespace', () => {
		// There is nothing to preserve: the body *is* the prose, so a whitespace
		// body has no two runs around a text and no spelling worth keeping.
		expect(richText.write({ text: 'A start.' }, '\n\n', config)).toBe(
			'\nA start.\n',
		);
	});

	it('keeps the section rather than removing it when the text is cleared', () => {
		// Constraint 4 read at its smallest: clearing is an edit, and an edit
		// never takes the heading with it. The body reads back as empty, which is
		// the same editable empty block a fresh section is.
		const cleared = richText.write({ text: '' }, '\nGrew up.\n', config);
		expect(cleared).toBe('\n\n');
		expect(richText.read(cleared, config)).toEqual({ ok: true, data: null });
	});
});

describe('richText.render — the box is the placement', () => {
	/*
	 * The failure this component was written against: four issues over four years
	 * on the closest analogue, for a prose block with no vertical size, with zero
	 * height, squished, or absent — the oldest open 47 months and saying it "grows
	 * according to its content which does not allow to control its position in the
	 * sheet in a stable way".
	 *
	 * What a unit test can prove is the number the block is told, since happy-dom
	 * lays nothing out: the block carries its placement's row count, and carries
	 * the *same* one whatever the text is. The three CSS facts that turn that
	 * number into a height, and stop the content growing past it, are in
	 * `src/styles.test.ts` — neither half is worth anything without the other.
	 */
	const SHORT = 'One line.';
	const LONG = Array.from({ length: 200 }, (_, n) => `Paragraph ${n}.`).join(
		'\n\n',
	);

	it.each([1, 2, 3, 8])('takes its height from a %s-row placement', (height) => {
		const el = render({ position: { col: 1, row: 1, width: 6, height } });
		expect(
			block(el).style.getPropertyValue('--sheetsmith-rows'),
		).toBe(String(height));
	});

	const CONTENTS: [string, RichTextData | null][] = [
		['nothing stored', null],
		['content shorter than the box', { text: SHORT }],
		['content far longer than the box', { text: LONG }],
	];

	it.each(CONTENTS)('is the same box with %s', (_name, data) => {
		// One placement, three contents, one answer. This is the assertion the
		// prior art's oldest issue is about: the box may not consult its text.
		for (const height of [1, 4]) {
			const el = render(
				{ position: { col: 1, row: 1, width: 6, height } },
				data,
			);
			expect(
				block(el).style.getPropertyValue('--sheetsmith-rows'),
			).toBe(String(height));
		}
	});

	it('draws no inner scroller of its own for the content to live in', () => {
		// The box is the only scrolling element, which is what makes the placement
		// the box: a wrapper of its own around the text would be a second height
		// nothing declared, and the content would decide it.
		const el = render({}, { text: LONG });
		expect(
			rendered(el).querySelector('.sheetsmith-rich-text-box'),
		).toBeNull();
		expect(
			el.querySelectorAll('.sheetsmith-rich-text-box'),
		).toHaveLength(1);
	});
});

describe('richText.render — it is a placed box', () => {
	/*
	 * The half of the shared box that a stylesheet cannot check. The floor, the
	 * surface and the two media rules live once, on `.sheetsmith-placed` and
	 * `.sheetsmith-placed-box` — so the way that breaks is no longer two copies
	 * drifting, it is **this component forgetting to ask for them**, which would
	 * leave the box with no height at all and nothing saying why.
	 *
	 * `styles.test.ts` holds what the shared rule says; this holds that this
	 * component is one of the things it says it about.
	 */
	it('asks for the shared box as well as its own class', () => {
		const el = render();
		const root = el.querySelector('.sheetsmith-rich-text') as HTMLElement;
		expect(root.classList.contains('sheetsmith-placed')).toBe(true);
		const box = el.querySelector('.sheetsmith-rich-text-box') as HTMLElement;
		expect(box.classList.contains('sheetsmith-placed-box')).toBe(true);
	});

	it('keeps its own class, which is what carries what differs', () => {
		// Not decoration: what goes *inside* the box is the one thing the two
		// consumers do not share, and every rule for it is addressed by this class.
		const el = render();
		expect(el.querySelector('.sheetsmith-rich-text')).not.toBeNull();
		expect(el.querySelector('.sheetsmith-rich-text-box')).not.toBeNull();
	});
});

describe('richText.render — the text and the field', () => {
	it('puts the stored text in the field', () => {
		expect(field(render()).value).toBe(TEXT);
	});

	it('keeps the field in the DOM and in the tab order unfocused', () => {
		// UI §9: stacked, never swapped. A field that came and went would renumber
		// every control after it and the view's focus restoration would land on
		// the wrong one after a rebuild.
		const el = render();
		const input = field(el);
		expect(el.contains(input)).toBe(true);
		expect(input.disabled).toBe(false);
		expect(input.hasAttribute('tabindex')).toBe(false);
		expect(input.readOnly).toBe(false);
	});

	it('is not spellchecked while the rendered prose is what is on screen', () => {
		// Transparent text still gets its squiggles painted, and they land on the
		// layer's words, positioned by the source line rather than by where the
		// rendered word is.
		const input = field(render());
		expect(input.getAttribute('spellcheck')).toBe('false');
		input.dispatchEvent(new Event('focus'));
		expect(input.getAttribute('spellcheck')).toBe('true');
	});

	it('gives the field the component\'s name even with the label hidden', () => {
		// The visible heading goes; the accessible name never does.
		const el = render({ hideLabel: true });
		expect(el.querySelector('.sheetsmith-rich-text-label')).toBeNull();
		expect(field(el).getAttribute('aria-label')).toBe('Backstory');
	});

	it('draws its own label unless the layout or a container says not to', () => {
		expect(
			render().querySelector('.sheetsmith-rich-text-label')?.textContent,
		).toBe('Backstory');
		// A tab strip has already named it, so drawing it again says it twice.
		expect(
			render({}, { text: TEXT }, { parentShowsLabel: true }).querySelector(
				'.sheetsmith-rich-text-label',
			),
		).toBeNull();
	});

	it('offers a placeholder and no error where nothing is stored', () => {
		const el = render({}, null);
		expect(field(el).value).toBe('');
		expect(field(el).placeholder).toBe('Write anything.');
		expect(el.querySelector('.sheetsmith-error')).toBeNull();
		expect(rendered(el).childNodes).toHaveLength(0);
	});
});

describe('richText.render — the app\'s renderer, and the fallback', () => {
	it('hands the text to the renderer and draws no fallback of its own', () => {
		// Exclusive: painting the fallback first would flash raw `# Heading` before
		// every rendered heading on every rebuild, and a sheet rebuilds on every
		// edit anywhere on it.
		const renderMarkdown = vi.fn((markdown: string, into: HTMLElement) => {
			into.appendChild(into.ownerDocument.createElement('h1')).textContent =
				markdown;
		});
		// Called with a way to report a failure, whether or not this one uses it:
		// the component has no other route to hear about a rejection, since the
		// render is asynchronous and it has already returned.
		
		const el = render({}, { text: TEXT }, { renderMarkdown });
		expect(renderMarkdown.mock.calls.map(([markdown]) => markdown)).toEqual([
			TEXT,
		]);
		expect(rendered(el).querySelector('h1')).not.toBeNull();
		// The fallback's own class, which is what says which branch ran.
		expect(
			rendered(el).classList.contains('sheetsmith-rich-text-plain'),
		).toBe(false);
	});

	it('draws the fallback where the app\'s renderer failed', () => {
		/*
		 * The branch above is exclusive, so at the moment the renderer is called the
		 * box is empty — and a renderer that rejects leaves it that way unless the
		 * component is told. A theme's or another plugin's post-processor throwing
		 * is not something the reader caused or can fix, and an empty block under a
		 * filled-in label with the prose still in the note is the one way this
		 * component can look like it lost somebody's words.
		 *
		 * So the answer is the fallback rather than an error: from the component's
		 * side an app that cannot help and an app that is not there are the same
		 * situation, and the reader gets their prose with its links live.
		 */
		const renderMarkdown = (
			_markdown: string,
			_into: HTMLElement,
			onFailure: () => void,
		) => onFailure();
		const el = render({}, { text: TEXT }, { renderMarkdown });
		expect(
			rendered(el).classList.contains('sheetsmith-rich-text-plain'),
		).toBe(true);
		// TEXT is two blank-line-separated blocks: the prose, then the list.
		expect(rendered(el).querySelectorAll('p')).toHaveLength(2);
		expect(links(el).map((a) => a.textContent)).toEqual([
			'Neverwinter',
			'Sildar',
			'Zhentarim',
		]);
		// And no error: there is no fix for one to name (PATTERNS §4), and the box
		// is showing the text.
		expect(el.querySelector('.sheetsmith-error')).toBeNull();
	});

	it('draws the fallback into the box the renderer had already filled', () => {
		// A rejection may arrive after a post-processor put something in, so the
		// fallback replaces rather than appends — otherwise the reader gets half a
		// rendered block with the whole source repeated under it.
		const renderMarkdown = (
			markdown: string,
			into: HTMLElement,
			onFailure: () => void,
		) => {
			into.appendChild(into.ownerDocument.createElement('h1')).textContent =
				markdown;
			onFailure();
		};
		const el = render({}, { text: TEXT }, { renderMarkdown });
		expect(rendered(el).querySelector('h1')).toBeNull();
		expect(rendered(el).querySelectorAll('p')).toHaveLength(2);
	});

	it('asks the renderer for nothing at all where nothing is stored', () => {
		const renderMarkdown = vi.fn();
		render({}, null, { renderMarkdown });
		expect(renderMarkdown).not.toHaveBeenCalled();
	});

	it('draws one paragraph per blank-line-separated block without one', () => {
		const el = render(
			{},
			{ text: 'First.\n\nSecond.\n\n\nThird.\n \nFourth.' },
		);
		expect(
			rendered(el).classList.contains('sheetsmith-rich-text-plain'),
		).toBe(true);
		expect(
			Array.from(rendered(el).querySelectorAll('p')).map((p) => p.textContent),
		).toEqual(['First.', 'Second.', 'Third.', 'Fourth.']);
	});

	it('keeps a hard-wrapped paragraph as one paragraph', () => {
		// A single newline is not a break: it takes a blank line, which is what
		// markdown says and what the source's own shape shows.
		const el = render({}, { text: 'One line\nand its continuation.' });
		const paragraphs = rendered(el).querySelectorAll('p');
		expect(paragraphs).toHaveLength(1);
		expect(paragraphs[0]?.textContent).toBe('One line\nand its continuation.');
	});

	it('draws a wikilink inside prose as a real link', () => {
		const el = render();
		const anchors = links(el);
		expect(anchors.map((a) => a.textContent)).toEqual([
			'Neverwinter',
			'Sildar',
			'Zhentarim',
		]);
		for (const anchor of anchors) {
			expect(anchor.classList.contains('internal-link')).toBe(true);
			// Both, because that is what Obsidian's own markup carries.
			expect(anchor.getAttribute('href')).toBe(anchor.getAttribute('data-href'));
		}
		expect(anchors[1]?.getAttribute('data-href')).toBe('Sildar Hallwinter');
		// The alias's target is otherwise nowhere on the sheet, and `title` rather
		// than `aria-label` so the accessible name stays the text that is visible.
		expect(anchors[1]?.getAttribute('title')).toBe('Sildar Hallwinter');
		expect(anchors[1]?.hasAttribute('aria-label')).toBe(false);
		// And the prose around the links survives it.
		expect(rendered(el).textContent).toContain(
			'Grew up in Neverwinter under Sildar.',
		);
	});

	it('marks a link the vault says is not there, and only that one', () => {
		const el = render({}, { text: TEXT }, {
			link: {
				resolves: (target) => target !== 'Zhentarim',
				open: () => undefined,
				preview: () => undefined,
			},
		});
		expect(
			links(el)
				.filter((a) => a.classList.contains('is-unresolved'))
				.map((a) => a.getAttribute('data-href')),
		).toEqual(['Zhentarim']);
	});

	it('paints every link as resolved where there is no vault', () => {
		// A missing vault is not evidence that a note is missing, which is what
		// makes the harness and a unit test both show a real link.
		expect(
			links(render()).some((a) => a.classList.contains('is-unresolved')),
		).toBe(false);
	});

	it('opens a link on a press, without focusing the field behind it', () => {
		const opened: string[] = [];
		const el = render({}, { text: TEXT }, {
			link: {
				resolves: () => true,
				open: (target) => opened.push(target),
				preview: () => undefined,
			},
		});
		document.body.appendChild(el);
		const anchor = links(el)[0] as HTMLAnchorElement;
		const event = new MouseEvent('click', { bubbles: true, cancelable: true });
		anchor.dispatchEvent(event);
		expect(opened).toEqual(['Neverwinter']);
		// The press belongs to the link: it does not reach the box behind it, and
		// the browser's default navigation is refused.
		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).not.toBe(field(el));
		el.remove();
	});
});

describe('richText.render — the layer answers presses because it scrolls', () => {
	/*
	 * The bug this describes, because it shipped: the rendered layer was
	 * `pointer-events: none`, copied from the table cell where a click falls
	 * through and the browser places the caret. A cell is one line with nothing to
	 * scroll. A prose box is a scrollport — and a scrollport that is not a hit
	 * target never receives a wheel, so the gesture went to the *invisible* field
	 * behind it: measured in a real browser, the field scrolled 150px while the
	 * visible prose stayed exactly where it was.
	 *
	 * Neither the harness nor a unit test could have caught it — a still cannot
	 * show a scroll and happy-dom has no hit testing. What is testable here is the
	 * consequence: the layer answering presses at all means the routing is now this
	 * component's, so these cases hold the routing and `styles.test.ts` holds the
	 * `pointer-events` that makes it necessary.
	 */
	function driven(data: RichTextData | null = { text: TEXT }) {
		const el = render({}, data);
		document.body.appendChild(el);
		return { el, done: () => el.remove() };
	}

	const press = (on: HTMLElement) => {
		const event = new MouseEvent('click', { bubbles: true, cancelable: true });
		on.dispatchEvent(event);
		return event;
	};

	it('focuses the field on a press anywhere in the prose', () => {
		const { el, done } = driven();
		const paragraph = rendered(el).querySelector('p') as HTMLElement;
		press(paragraph);
		expect(document.activeElement).toBe(field(el));
		done();
	});

	it('focuses the field on a press in an empty block', () => {
		// The layer covers the box whether or not it holds anything, so an empty
		// block has to be reachable through the same one route.
		const { el, done } = driven(null);
		press(rendered(el));
		expect(document.activeElement).toBe(field(el));
		done();
	});

	it('leaves a press on a link to the link', () => {
		const { el, done } = driven();
		const anchor = links(el)[0] as HTMLElement;
		press(anchor);
		expect(document.activeElement).not.toBe(field(el));
		done();
	});

	it('leaves a press on a link the *app* rendered to the link', () => {
		/*
		 * The case the one above cannot make, and the one that matters. The
		 * fallback's own anchors call `stopPropagation`, so a press on one never
		 * reaches the layer's listener and the guard is never consulted — which
		 * means the case above passes with the guard deleted. Measured: removing it
		 * left every other case here green.
		 *
		 * Obsidian's renderer draws its own anchors and does no such thing, so a
		 * press on a rendered link *does* bubble. Without the guard the layer would
		 * `preventDefault` it and kill the app's own navigation, on every link in
		 * every prose block — the path that only exists with a real renderer, which
		 * is exactly the path the harness cannot show.
		 */
		const renderMarkdown = (
			_markdown: string,
			into: HTMLElement,
			_onFailure: () => void,
		) => {
			const anchor = into.ownerDocument.createElement('a');
			anchor.setAttribute('href', 'Neverwinter');
			anchor.setAttribute('data-href', 'Neverwinter');
			anchor.classList.add('internal-link');
			anchor.textContent = 'Neverwinter';
			into.appendChild(anchor);
		};
		const el = render({}, { text: TEXT }, { renderMarkdown });
		document.body.appendChild(el);
		const anchor = links(el)[0] as HTMLElement;
		const event = press(anchor);
		// The app's own click handling is left intact, and the field is not stolen.
		expect(event.defaultPrevented).toBe(false);
		expect(document.activeElement).not.toBe(field(el));
		el.remove();
	});

	it('refuses the browser\'s default, so a rendered task stays inert', () => {
		/*
		 * A rendered embed is display, not a control, and that was free while the
		 * layer took no presses at all. Now it is `preventDefault`'s job: a task
		 * checkbox inside an embedded note would otherwise be tickable from the
		 * sheet, and what it writes is another note's file.
		 */
		const { el, done } = driven();
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		rendered(el).appendChild(checkbox);
		const event = press(checkbox);
		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(field(el));
		done();
	});

	it('does not steal focus from a press that ended a selection', () => {
		/*
		 * Selecting prose to copy it is the other thing the layer answering presses
		 * buys, and a drag that selects text ends in a `click` — so focusing
		 * unconditionally would drop the selection the reader had just made and
		 * replace the rendered text with its source.
		 */
		const { el, done } = driven();
		const paragraph = rendered(el).querySelector('p') as HTMLElement;
		const range = document.createRange();
		range.selectNodeContents(paragraph);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		expect(selection?.isCollapsed).toBe(false);

		press(paragraph);
		expect(document.activeElement).not.toBe(field(el));
		selection?.removeAllRanges();
		done();
	});
});

describe('richText.render — the editing gesture', () => {
	/** Render attached, so focus and blur behave, and report what commits. */
	function driven(data: RichTextData | null = { text: TEXT }) {
		const commits: RichTextData[] = [];
		const el = render({}, data, { onChange: (d) => commits.push(d) });
		document.body.appendChild(el);
		return { el, input: field(el), commits, done: () => el.remove() };
	}

	const key = (input: HTMLTextAreaElement, name: string) => {
		const event = new KeyboardEvent('keydown', {
			key: name,
			bubbles: true,
			cancelable: true,
		});
		input.dispatchEvent(event);
		return event;
	};

	it('commits nothing while the reader is typing', () => {
		const { input, commits, done } = driven();
		input.value = 'Half a thought';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		expect(commits).toEqual([]);
		done();
	});

	it('inserts a newline on Enter and commits nothing', () => {
		// The one key whose meaning had to change from the one-line field: a block
		// whose Enter committed could not hold a second paragraph.
		const { input, commits, done } = driven();
		const event = key(input, 'Enter');
		expect(event.defaultPrevented).toBe(false);
		expect(commits).toEqual([]);
		done();
	});

	it('commits on blur', () => {
		const { input, commits, done } = driven();
		input.focus();
		input.value = 'Moved to [[Waterdeep]].';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.blur();
		expect(commits).toEqual([{ text: 'Moved to [[Waterdeep]].' }]);
		done();
	});

	it('reports the text with its own paragraph breaks intact', () => {
		// Not flattened to one line, which is the other thing that separates this
		// binding from the field's: a paragraph break is data here.
		const { input, commits, done } = driven();
		input.focus();
		input.value = 'First.\n\nSecond.\n- a list item';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.blur();
		expect(commits).toEqual([{ text: 'First.\n\nSecond.\n- a list item' }]);
		done();
	});

	it('commits nothing on a blur that changed nothing', () => {
		const { input, commits, done } = driven();
		input.focus();
		input.blur();
		expect(commits).toEqual([]);
		done();
	});

	it('restores the stored text on Escape, and announces the restore', () => {
		// SPEC §5's rule, unchanged from the card: an undo nobody can perceive is
		// not obviously one.
		const { el, input, commits, done } = driven();
		input.focus();
		input.value = 'Something else entirely';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		key(input, 'Escape');
		expect(input.value).toBe(TEXT);
		expect(commits).toEqual([]);
		expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toBe(
			'Backstory restored',
		);
		done();
	});

	it('announces a commit by what happened, never by the prose', () => {
		// Reading a backstory back at its author is not feedback.
		const { el, input, done } = driven();
		input.focus();
		input.value = 'A long and involved history.';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.blur();
		const status = el.querySelector('.sheetsmith-sr-only') as HTMLElement;
		expect(status.getAttribute('aria-live')).toBe('polite');
		expect(status.textContent).toBe('Backstory saved');

		input.focus();
		input.value = '';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.blur();
		expect(status.textContent).toBe('Backstory cleared');
		done();
	});

	it('says nothing on an Escape that abandoned no draft', () => {
		const { el, input, done } = driven();
		input.focus();
		key(input, 'Escape');
		expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toBe('');
		done();
	});

	it('does not repaint the rendered layer from a commit', () => {
		/*
		 * The table's reversal, and it applies here for the same reason: a commit
		 * only fires when the text changed, so the rebuild always comes, and a
		 * local repaint would replace the anchor the browser had just focused on
		 * the way out of the field — dropping focus to the body, so the view
		 * captures none and restores none.
		 */
		const { el, input, done } = driven();
		const before = links(el)[0];
		input.focus();
		input.value = 'No links at all now.';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.blur();
		expect(links(el)[0]).toBe(before);
		done();
	});
});

describe('richText — text typed into a sheet comes back', () => {
	/*
	 * The second failure class the prior art names, and it is the one that costs a
	 * user their words: three separate issues on the closest analogue where a rich
	 * text block loses what was typed, one of them only inside a repeating row.
	 *
	 * A rebuild is what would have caught all three, so this drives the whole
	 * path the app drives — type, leave, write the reported delta into the note,
	 * re-read it, render again — and asserts the text is on screen and in the
	 * field afterwards. Nothing here trusts the object that was reported: the
	 * assertion is against text that made a round trip through a note body, which
	 * is what "it saved" actually means.
	 */
	function sheet(body: string | null) {
		let stored = body;
		let el = document.createElement('div');
		const draw = () => {
			const read = richText.read(stored ?? '', config);
			el.remove();
			el = document.createElement('div');
			document.body.appendChild(el);
			richText.render(el, config, read.ok ? read.data : null, {
				...context,
				onChange: (edited) => {
					stored = richText.write(edited, stored, config);
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
				// Leaving the field is the commit, and it is the gesture a reader
				// actually makes: clicking another card, or tabbing away.
				input.blur();
			},
			onScreen: () => rendered(el).textContent,
			inField: () => field(el).value,
			body: () => stored,
			done: () => el.remove(),
		};
	}

	it('keeps the first thing ever typed into an empty block', () => {
		const live = sheet(null);
		live.type('Grew up in [[Neverwinter]].');
		expect(live.body()).toBe('\nGrew up in [[Neverwinter]].\n');
		expect(live.inField()).toBe('Grew up in [[Neverwinter]].');
		expect(live.onScreen()).toBe('Grew up in Neverwinter.');
		live.done();
	});

	it('keeps an edit to a block that already held prose', () => {
		const live = sheet(BODY);
		live.type('Moved to [[Waterdeep]] after the fire.');
		expect(live.inField()).toBe('Moved to [[Waterdeep]] after the fire.');
		expect(live.onScreen()).toBe('Moved to Waterdeep after the fire.');
		live.done();
	});

	it('keeps several paragraphs, and keeps them apart', () => {
		const live = sheet(null);
		live.type('First.\n\nSecond.\n\nThird.');
		expect(live.inField()).toBe('First.\n\nSecond.\n\nThird.');
		expect(
			Array.from(rendered(document.body).querySelectorAll('p')).map(
				(p) => p.textContent,
			),
		).toEqual(['First.', 'Second.', 'Third.']);
		live.done();
	});

	it('keeps text typed one edit after another', () => {
		// Each commit re-reads the note the previous one wrote, so a `write` that
		// only round-tripped its own output would fail here rather than at the
		// second save in somebody's vault.
		const live = sheet(BODY);
		live.type('One.');
		live.type('One. Two.');
		live.type('One. Two. Three.');
		expect(live.inField()).toBe('One. Two. Three.');
		expect(live.body()).toBe('\nOne. Two. Three.\n');
		live.done();
	});

	it('keeps prose a hand-written section spelled unconventionally', () => {
		// A note nobody's plugin wrote: no blank line after the heading, and no
		// newline at the end. The edit lands in it and the spelling survives.
		const live = sheet('Old prose.');
		live.type('New prose.');
		expect(live.body()).toBe('New prose.');
		expect(live.inField()).toBe('New prose.');
		live.done();
	});
});

describe('richText — what the view has to put focus back onto', () => {
	/*
	 * The block's contribution to `view/cell-focus.ts`, which identifies a control
	 * by its index among `FOCUSABLE` within a cell. Two facts about this component
	 * decide whether that survives a rebuild, and both are asserted here rather
	 * than left to the view's own file — the view cannot be rendered by a test, and
	 * neither fact is the view's to state.
	 */
	it('puts its links after its field, so an anchor is never index zero', () => {
		// Which is what makes the clamp in `restoreFocus` load-bearing for this
		// component: with the app's asynchronous renderer the layer is empty at
		// restore time, so every captured anchor index is past the end.
		const el = render();
		const controls = Array.from(el.querySelectorAll(FOCUSABLE));
		expect(controls[0]).toBe(field(el));
		expect(controls.length).toBeGreaterThan(1);
		expect(controls.slice(1).every((c) => c.tagName === 'A')).toBe(true);
	});

	it('holds exactly one control while the app\'s render is in flight', () => {
		// The other half of the same fact, and the reason the loss was invisible in
		// the harness: the fallback is synchronous and its anchors are there, while
		// the app's renderer leaves the layer empty for a microtask.
		const el = render({}, { text: TEXT }, { renderMarkdown: () => undefined });
		expect(Array.from(el.querySelectorAll(FOCUSABLE))).toEqual([field(el)]);
	});
});

describe('richText — the one line of markdown a block cannot hold', () => {
	/*
	 * **`## ` at the start of a line is the character note's own section
	 * delimiter** (SPEC §3.1), so it is the one piece of markdown this component
	 * cannot store, and the only reserved syntax it has. Found by writing the
	 * vault fixture rather than by reading the parser: a backstory with two
	 * chapters in it is the obvious thing to type, and it is what a component
	 * whose spec says "a body holding a fence, a heading or a table is content"
	 * invites.
	 *
	 * Here rather than in `parse/character.test.ts` because only this component
	 * can raise it. Every other component stores a fence or a markdown table, and
	 * neither can contain a line beginning `## `.
	 *
	 * **Not escaped and not refused**, and both refusals are the file model's.
	 * Escaping would put a plugin's syntax into a note the user owns, and `read`
	 * returning an error would make this the one body that is not legal text. What
	 * is guaranteed instead is the thing that actually matters: nothing is lost
	 * from the file (Constraint 4), and the note still round-trips.
	 */
	const NOTE = (body: string) =>
		`---\nsheet-layout: Prose\n---\n\n## Backstory\n${body}`;

	it('leaves every other heading level in the body, as content', () => {
		// One `#`, three, and two without the space: all content, all round-tripped.
		const body = '\n# One\n\n### Three\n\n#Tight\n\n##NoSpace\n';
		const parsed = parseCharacter(NOTE(body));
		expect(parsed.sections.map((section) => section.label)).toEqual(['Backstory']);
		const read = richText.read(body, config);
		if (!read.ok || read.data === null) throw new Error('expected data');
		expect(read.data.text).toContain('### Three');
		expect(richText.write(read.data, body, config)).toBe(body);
	});

	it('loses nothing from the note when a block is typed a level-two heading', () => {
		/*
		 * The claim, stated at its strongest because it is the one that protects
		 * the user's words: the note splits, so the block shows only what is above
		 * the heading — and every character the reader typed is still in the file,
		 * byte for byte, in a section the layout does not map (SPEC §10).
		 */
		const typed = 'Before the fire.\n\n## After the fire\n\nAfter it.';
		const before = NOTE('\n');
		const note = parseCharacter(before);
		const body = richText.write({ text: typed }, note.sections[0]?.body ?? null, config);
		const saved = serialiseCharacter({
			...note,
			sections: [{ ...note.sections[0]!, body }],
		});
		// Every word survives the save.
		expect(saved).toContain('Before the fire.');
		expect(saved).toContain('## After the fire');
		expect(saved).toContain('After it.');

		// And on the next read the note holds two sections, the second unmapped.
		const reparsed = parseCharacter(saved);
		expect(reparsed.sections.map((section) => section.label)).toEqual([
			'Backstory',
			'After the fire',
		]);
		// Which is still a note that round-trips: the split is the file model's
		// own, not a mangling.
		expect(serialiseCharacter(reparsed)).toBe(saved);

		// The block now reads back only its own half, which is the visible cost.
		const read = richText.read(reparsed.sections[0]?.body ?? '', config);
		expect(read).toEqual({ ok: true, data: { text: 'Before the fire.' } });
	});
});

describe('richText — what it deliberately does not have', () => {
	/*
	 * Asked as "is the member declared" rather than "is it undefined", which is
	 * the stronger claim and the one `contract.test.ts` makes registry-wide: a
	 * component that declared `scopeValues: undefined` would satisfy the weaker
	 * one while telling every reader of the file that it publishes something.
	 */
	const declares = (member: string) => member in richText;

	it('publishes no name a formula could resolve', () => {
		// SPEC §4.1 names this case, and §5's language has no strings: a published
		// block of prose could be compared to nothing and handed to no builtin,
		// while a Pool's `max` naming a backstory is the bug §4.1 warns about.
		expect(declares('scopeValues')).toBe(false);
		expect(declares('scopeRows')).toBe(false);
	});

	it('holds no state a reset trigger could reach', () => {
		// So the editor offers it no reset binding and a trigger passes over it.
		expect(declares('applyReset')).toBe(false);
		expect(declares('hasBuffer')).toBe(false);
	});

	it('accepts no configuration but its label and whether to show it', () => {
		// SPEC §4.2 promised `label` and nothing else. `label` is the editor's, so
		// `hideLabel` is the only field, and there is no placeholder key, no
		// height, and no toggle for rendering markdown.
		expect(richText.configFields.map((f) => f.key)).toEqual(['hideLabel']);
		expect(richText.formulaFields).toEqual([]);
	});

	it('offers no palette entry', () => {
		// §4.2's rule: an entry earns its place where a job is one component's
		// configuration away. There is no configuration for one to prefill, and
		// "Backstory" would be a Rich text with a label the author is about to
		// change.
		expect(declares('palette')).toBe(false);
	});
});
