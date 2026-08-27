/*
 * Rich text — a free markdown block on the sheet (SPEC §4.2). Covers backstory,
 * appearance, notes, a Keeper's six short boxes: the prose a character sheet is
 * half made of and that no card, table or pool has anywhere to put.
 *
 * **The placement is the box, and the content scrolls inside it.** Stated first
 * because it is the one decision this component exists to get right, and the one
 * every analogue got wrong: the closest has four separate issues over four years
 * for a prose block with no vertical size, zero height, squished, or absent, the
 * oldest of them open since 2022 — "it grows according to its content which does
 * not allow to control its position in the sheet in a stable way". A block that
 * sized itself to its content is a component ceasing to fill its placement,
 * which SPEC §8 forbids outright, and what it produces is the sheet moving
 * because of something the author never placed. So the box is `height` grid rows
 * tall whatever is in it, a long backstory scrolls, and an author who wants a
 * taller box places a taller component — §8's own sentence, that the grid is the
 * sizing control.
 *
 * The height is a floor on the *block* rather than a size on the text, which is
 * what keeps the other half of that failure away too: the two layers inside the
 * box are out of flow, so they contribute no intrinsic height, and without the
 * floor the block would collapse to nothing. Both halves are held by
 * `src/styles.test.ts`, because neither is visible in a unit test.
 *
 * **It stores its section body and nothing else.** No fence, no key, no
 * structure: the body *is* the value, so Constraint 3 holds by construction
 * rather than by canonicalisation — the one spelling of it that survives
 * free-form prose. `read` hands back the body with the whitespace run at each
 * end removed and can never fail, since every body is legal text; `write` puts
 * the new text back inside the runs the body already had, so a hand-written
 * section keeps its own spacing and an edit changes exactly the prose.
 *
 * **Its one piece of reserved syntax is `## ` at the start of a line**, and it is
 * the note format's rather than this component's: SPEC §3.1 gives a character note
 * one `##` section per component, so a block holding such a line splits the note
 * there and shows only what was above it. Not escaped, because that would put a
 * plugin's syntax into a file the user owns; not refused, because `read` returning
 * an error would make this the one body that is not legal text. What is guaranteed
 * is the part that matters — nothing is lost from the file, and the note still
 * round-trips — and `rich-text.test.ts` pins it. Every other heading level is
 * content, `#` and `###` included.
 *
 * **It publishes nothing.** No `scopeValues`, no `scopeRows`, no `applyReset`.
 * SPEC §4.1 names this case — "a heading, an image, a block of prose" — and
 * §5's language has no strings, so a published block of prose could be compared
 * to nothing and handed to no builtin. It could only be written, and a Pool
 * whose `max` named a backstory is the bug §4.1 warns about with prose in it.
 *
 * **It is not a Card with the note line grown.** A Card's note is one line
 * qualifying a value; this has no value, and its text is the content rather than
 * a gloss on it. The two differences that make it a component are the ones a
 * config field could not add: markdown is *rendered*, and the box is sized by
 * the placement rather than by the line.
 *
 * **It renders markdown by default and there is no setting for it.** The prior
 * art is 27 months of an opt-in that had to be fixed twice — one block ignoring
 * it, a layout editor giving no sign which blocks had it — before being removed
 * in favour of rendering always. Rich text renders markdown. Where there is no
 * app to ask, it draws paragraphs with their wikilinks live, which is
 * `LinkContext`'s own bargain and the truth of what is available — and the same
 * fallback answers a renderer that *rejected*, since from this side an app that
 * cannot help and an app that is not there are the same situation.
 */

import { bindMultiline } from '../interaction/editable';
import {
	ComponentDefinition,
	ReadResult,
	RenderContext,
	ComponentConfig,
	showsOwnLabel,
} from '../types';
import { paintLinkedText } from './linked-text';

/**
 * Hint shown while the block is empty. Fixed rather than configured: SPEC §4.2
 * promised this component `label` and nothing else, and one sentence saying the
 * box takes anything is the whole of what an empty prose box has to say. Card's
 * `notePlaceholder` exists because a note line qualifies a value and the
 * qualifier differs per card ("ft.", "armour worn"); prose does not.
 */
const PLACEHOLDER = 'Write anything.';

/**
 * A blank line, which is what separates one paragraph from the next.
 *
 * Any line holding nothing but spaces or tabs counts, because a hand-typed
 * blank line often is not empty, and a run of them is one break rather than
 * several empty paragraphs. Both line endings, since a note may hold either.
 */
const PARAGRAPH_BREAK = /(?:\r?\n[ \t]*)+\r?\n/;

/**
 * A section body split into the whitespace runs at each end and the text
 * between them.
 *
 * One helper for both directions, because `read` and `write` have to agree
 * about where the text starts to the character: read one way and written the
 * other, an untouched note would be reformatted on every save, which is
 * Constraint 3's whole point. Derived from `trim` itself rather than from a
 * `\s` pattern of its own, so there is no second definition of whitespace to
 * drift from the one `read` returns.
 *
 * Private to this component, which has the only body that *is* its value. A
 * second such component would take this out to `parse/` rather than copy it.
 */
function frame(body: string): { lead: string; text: string; tail: string } {
	const lead = body.slice(0, body.length - body.trimStart().length);
	const text = body.trim();
	// An all-whitespace body has no text, so it has no two runs around one —
	// the whole body is the leading run and there is nothing after it.
	const tail = text === '' ? '' : body.slice(lead.length + text.length);
	return { lead, text, tail };
}

export interface RichTextConfig extends ComponentConfig {
	type: 'rich-text';
	hideLabel?: boolean;
}

/**
 * The block's text, with the section's own leading and trailing whitespace
 * removed — so the data is the prose and the framing stays the note's.
 *
 * One field, held flat rather than as a delta. PATTERNS §7's rule protects
 * siblings from a commit racing a rebuild, and there is no sibling here.
 */
export interface RichTextData {
	text: string;
}

/**
 * Draw text as paragraphs with its wikilinks live, for where there is no app.
 *
 * The fallback, and the branch is exclusive: with a renderer this is not drawn
 * at all. Painting it first and letting the renderer replace it would buy a
 * synchronous first frame and cost a flash of raw `# Heading` before every
 * rendered heading on every rebuild — and a sheet rebuilds on every edit
 * anywhere on it. A momentarily empty box is cheaper than that.
 *
 * What it buys is wikilinks and no other markdown, exactly as a table cell does
 * today: `*italic*` shows its asterisks. That is a stated cost rather than a
 * gap — the harness has no renderer, so how a rendered heading, list or embed
 * sits inside the box is the one part of this component's appearance that is
 * reviewed in Obsidian rather than in the harness.
 */
function paintParagraphs(
	into: HTMLElement,
	text: string,
	context: RenderContext<RichTextData>,
): void {
	const doc = into.ownerDocument;
	// Cleared, because this is no longer only ever called into a fresh element: a
	// renderer that rejects may have put something in first, and appending under it
	// would give the reader half a rendered block with the whole source repeated
	// below it. Never `innerHTML` (PATTERNS §5).
	into.replaceChildren();
	into.classList.add('sheetsmith-rich-text-plain');
	for (const paragraph of text.split(PARAGRAPH_BREAK)) {
		if (paragraph.trim() === '') continue;
		const p = doc.createElement('p');
		into.appendChild(p);
		paintLinkedText(p, paragraph, { link: context.link });
	}
}

export const richText: ComponentDefinition<RichTextConfig, RichTextData> = {
	type: 'rich-text',
	storage: 'markdown',
	formulaFields: [],
	configFields: [
		{
			key: 'hideLabel',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide the label',
			description:
				'Draws the block with no name over it, for prose that reads as prose rather than as a named section. The text is unaffected, and the note keeps its heading either way.',
			default: false,
		},
	],

	/*
	 * Never `{ ok: false }`. Every body is legal text, so this component has no
	 * read error state at all — which is worth saying rather than leaving a
	 * reader to infer it from the absence of a branch.
	 */
	read(body): ReadResult<RichTextData> {
		const { text } = frame(body);
		// Nothing but whitespace is an editable empty block, not an error and not
		// a stored empty string: PATTERNS §4, and the first commit writes it.
		if (text === '') return { ok: true, data: null };
		return { ok: true, data: { text } };
	},

	write(data, body): string {
		// A section that does not exist yet, or one holding only whitespace: the
		// canonical shape, matching what `freshBody` writes for a fence. There is
		// no prose to preserve in either case, because the body *is* the prose.
		if (body === null || body.trim() === '') return `\n${data.text}\n`;
		const { lead, text, tail } = frame(body);
		// Byte for byte where nothing changed (Constraint 3): the body is returned
		// rather than rebuilt, so there is nothing for a rebuild to get wrong.
		if (data.text === text) return body;
		return lead + data.text + tail;
	},

	/*
	 * No config guard, and that is a statement rather than an omission: the one
	 * setting this component has is a boolean, so there is no combination of its
	 * configuration without a reading and nothing for a guard to refuse. Group
	 * says the same thing about its own.
	 */
	render(container, config, data, context): void {
		const doc = container.ownerDocument;
		container.replaceChildren();

		const block = doc.createElement('div');
		// The shared box: a component whose size is its placement and not its
		// content (docs/UI.md §9). Its own class beside it carries only what it does
		// differently, which is what goes *inside* the box.
		block.classList.add('sheetsmith-placed', 'sheetsmith-rich-text');
		// The placement, handed to CSS as the box's own floor. Read here rather
		// than derived in the stylesheet because only the component has the
		// config — Card set does the same with its `width` — and it is a floor on
		// the block rather than a size on the text, so a long backstory scrolls
		// instead of moving the sheet (SPEC §8). The property is the grid's rather
		// than this component's, because Image needs the same answer.
		block.style.setProperty(
			'--sheetsmith-rows',
			String(config.position.height),
		);
		container.appendChild(block);

		if (showsOwnLabel(config, context)) {
			const label = doc.createElement('div');
			label.classList.add('sheetsmith-component-label', 'sheetsmith-rich-text-label');
			label.textContent = config.label;
			block.appendChild(label);
		}

		/*
		 * The rendered prose and the field that edits it, stacked (`docs/UI.md`
		 * §9): both fill the box, the field stays in the DOM and in the tab order
		 * in both states, and neither changes the box's size on focus. Three
		 * departures from the cell's version of the same pattern, each with its
		 * reason, because a shared gesture is only shared if the differences are
		 * stated:
		 *
		 * 1. **The rendered layer is hidden on focus rather than left
		 *    transparent.** A cell's two layers hold the same one line in the same
		 *    shape, so they can overlap; here they hold the same text in two
		 *    different shapes — a rendered heading is not the height of its source
		 *    line — and two differently-shaped copies of one text overlaid would
		 *    be unreadable.
		 * 2. **The caret is not placed from the click**, for the same reason: a
		 *    point in the rendered view is not the same character in the source, so
		 *    there is no landing position to preserve and pretending otherwise
		 *    would put the caret confidently in the wrong place. It lands wherever
		 *    the field's own position already was. This used to read "where the
		 *    browser puts it", which stopped being true when the rendered layer
		 *    became the pointer target — a click no longer reaches the field — and
		 *    the *reason* is unchanged, which is why the departure stands: the
		 *    position given up was never meaningful. Whether a better landing
		 *    exists is its own question and not this one.
		 * 3. **The box never changes size, but its scroll extent does.** Each
		 *    layer scrolls on its own, so a focused field scrolls to its caret —
		 *    which is what the reader asked for by clicking — while nothing on the
		 *    sheet moves, since the box is the placement.
		 */
		const box = doc.createElement('div');
		box.classList.add('sheetsmith-placed-box', 'sheetsmith-rich-text-box');
		block.appendChild(box);

		const field = doc.createElement('textarea');
		field.classList.add('sheetsmith-rich-text-input');
		field.value = data?.text ?? '';
		field.placeholder = PLACEHOLDER;
		// The label may be hidden and the field still has to have a name. Always
		// the label, never the placeholder: `docs/UI.md` §6, and a placeholder is
		// gone the moment anything is typed.
		field.setAttribute('aria-label', config.label);
		box.appendChild(field);

		const rendered = doc.createElement('div');
		rendered.classList.add('sheetsmith-rich-text-rendered');
		box.appendChild(rendered);

		/*
		 * The layer is the pointer target, so the press routing is this
		 * component's rather than the cascade's (PATTERNS §6).
		 *
		 * **It has to be the target because it is what scrolls.** The obvious
		 * spelling is the table cell's — `pointer-events: none`, so a click falls
		 * through and the browser places the caret — and on a box whose content
		 * scrolls that spelling silently removes the scroll: the layer is not a hit
		 * target, so the wheel goes to the invisible field behind it, which scrolls
		 * while the visible prose does not move at all. A cell has nothing to
		 * scroll, which is why the pattern is right there and wrong here.
		 *
		 * A link owns its own press, as everywhere else on the sheet. Everything
		 * else focuses the field — including a task checkbox inside a rendered
		 * embed, which stays inert: a rendered embed is display, not a control, and
		 * `preventDefault` is what holds that now the layer answers presses at all.
		 *
		 * On `click` rather than `pointerdown`, under the second half of PATTERNS
		 * §6's rule: "focus on pointerdown" is for a control where focus is
		 * *preparation* for an outcome, and here handing over the field is the whole
		 * outcome — so there is no commit left to abandon on, and §6's own
		 * forgiveness argument picks release. §6's reason for pointerdown is that a
		 * tap has no hover to say what it is about to hit, and here the whole box is
		 * the target, so there is nothing to disambiguate either.
		 *
		 * **And a second reason this component has and Image does not**, which is
		 * why the general one above is stated first: the layer is a scroll
		 * container, and a touch drag begins with a `pointerdown`. Focusing there
		 * would hide the layer and swap in the raw source in the middle of a scroll
		 * gesture. Read alone, that reason sent a reader looking for it in a
		 * component whose content does not scroll and finding nothing.
		 */
		rendered.addEventListener('click', (event) => {
			const target = event.target;
			if (target instanceof HTMLElement && target.closest('a[href]')) return;
			event.preventDefault();
			// A drag that selected text is not a request to edit: focusing would
			// drop the selection the reader just made, and copying a backstory
			// without entering edit mode is the other thing the layer answering
			// presses buys.
			const selection = doc.getSelection();
			if (selection !== null && !selection.isCollapsed) return;
			field.focus();
		});

		/*
		 * The app's own renderer where there is one, and the fallback where there
		 * is not. Exclusive, and asynchronous on the app's side: the box's height
		 * is the placement, so markup arriving a frame later cannot move anything
		 * — which is the fact `parse/wikilink.ts`'s header did not have when it
		 * ruled the renderer out for a table row, and the reason the same renderer
		 * is right here and still wrong in a cell.
		 *
		 * A rendered embed inside the block is display, not a control: links own
		 * their presses and everything else focuses the field, so a task checkbox
		 * inside an embedded note is not tickable from the sheet. That is the
		 * price of the block being editable at all.
		 */
		const text = data?.text ?? '';
		if (text !== '') {
			if (context.renderMarkdown !== undefined) {
				// And the fallback again where the app's renderer rejected — a theme
				// or another plugin's post-processor throwing, which is not something
				// the reader caused or can fix. The box the branch above left empty
				// would otherwise stay empty under a filled-in label, with the prose
				// still in the note and nothing on screen saying so, which is the one
				// way this component can look like it lost somebody's words.
				context.renderMarkdown(text, rendered, () =>
					paintParagraphs(rendered, text, context),
				);
			} else {
				paintParagraphs(rendered, text, context);
			}
		}

		// Announces once per commit. Attached after the controls, as the card's
		// is, and in the document before its text changes.
		const status = doc.createElement('div');
		status.classList.add('sheetsmith-sr-only');
		status.setAttribute('aria-live', 'polite');
		block.appendChild(status);

		bindMultiline(field, {
			initial: text,
			// The label and the outcome, never the prose: reading a backstory back
			// at its author is not feedback, and the announcement is what says the
			// note was written rather than what was written into it.
			announceCommit: (next) => {
				status.textContent =
					next === '' ? `${config.label} cleared` : `${config.label} saved`;
			},
			announceRestore: () => {
				status.textContent = `${config.label} restored`;
			},
			// Reported, never repainted first. PATTERNS §5's optimistic paint is
			// for a write that may produce no rebuild; a commit here only fires
			// when the text changed, so the rebuild always comes — and repainting
			// would destroy an anchor the browser had just focused on the way out
			// of the field, which is the reversal the table already recorded.
			onCommit: (next) => context.onChange({ text: next }),
		});
	},
};
