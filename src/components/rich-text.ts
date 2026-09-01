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
 * section keeps its own spacing and an edit changes exactly the prose. Both
 * halves are `parse/markdown-body.ts`, shared with Image, which stores one embed
 * under the same rule.
 *
 * **Its one piece of reserved syntax is `## ` at the start of a line**, and it is
 * the note format's rather than this component's: SPEC §3.1 gives a character note
 * one `##` section per component, so a block holding such a line splits the note
 * there and shows only what was above it. Not escaped, because that would put a
 * plugin's syntax into a file the user owns, and `read` is not failed either,
 * because an error there would make this the one body that is not legal text.
 * **The *write* is declined instead**, which is the third answer and reaches
 * neither of those objections: `read` stays total, every body that gets to it is
 * still legal text, and a draft holding such a line simply never reaches the file
 * — the field keeps it, and the message names the offending line and `### `. See
 * `refuse` in `render` for why byte survival was the wrong thing to guarantee.
 * Every other heading level is content, `#` and `###` included.
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
import { bodyText, writeBodyText } from '../parse/markdown-body';
import {
	ComponentDefinition,
	ReadResult,
	RenderContext,
	ComponentConfig,
	showsOwnLabel,
} from '../types';
import { adoptRenderedLinks, paintLinkedText } from './linked-text';
import { sampleText } from './sample-values';
import { spellcheckWhileFocused } from '../ui/spellcheck';
import { startsSection } from '../parse/character';

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
	 * Two short paragraphs of obvious filler.
	 *
	 * **Two rather than one**, because the break between them is the only thing
	 * about this block a canvas can be wrong about and an empty one never showed:
	 * the box is a fixed height whatever is in it (see the header), so what an
	 * author is judging here is whether prose fills that box, wraps inside it and
	 * stops where the placement said — and a single line answers none of that.
	 *
	 * **It says out loud that it is filler.** Every other component's sample is
	 * unmistakable because it is a number or a `Name n`; prose is the one place a
	 * plausible-looking sample would read as somebody's actual backstory, so this
	 * one names itself. The block's own label carries the index, so the words a
	 * reader recognises are still the author's (§2).
	 *
	 * No markdown, and no wikilink. A sample draws through `paintParagraphs`
	 * wherever there is no renderer — the layout editor's canvas hands over none
	 * (`docs/UI.md` §12) — so anything but prose would draw as its own source, and
	 * a link would draw unresolved against a canvas with no vault behind it.
	 */
	sample(config): string {
		// The block's own name, or a word for what it holds where the layout has
		// not given it one — an unnamed block still has to fill something in.
		const name = config.label.trim() === '' ? 'Text' : config.label.trim();
		const paragraphs = [
			`${sampleText(name, 0)}. Sample text, so the block shows how a paragraph fills the box and where it stops.`,
			`${sampleText(name, 1)}. A second paragraph, so the space between two is visible as well.`,
		];
		return writeBodyText(null, paragraphs.join('\n\n'));
	},

	/*
	 * Never `{ ok: false }`. Every body is legal text, so this component has no
	 * read error state at all — which is worth saying rather than leaving a
	 * reader to infer it from the absence of a branch.
	 */
	read(body): ReadResult<RichTextData> {
		const text = bodyText(body);
		// Nothing but whitespace is an editable empty block, not an error and not
		// a stored empty string: PATTERNS §4, and the first commit writes it.
		if (text === '') return { ok: true, data: null };
		return { ok: true, data: { text } };
	},

	write(data, body): string {
		return writeBodyText(body, data.text);
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
		 *    would put the caret confidently in the wrong place. It lands at the
		 *    start of the text, which is a choice and not an inheritance — see the
		 *    `setSelectionRange` below for what it is chosen over. This used to read
		 *    "where the browser puts it", which stopped being true when the rendered
		 *    layer became the pointer target — a click no longer reaches the field —
		 *    and the *reason* is unchanged, which is why the departure stands: the
		 *    position given up was never meaningful. Whether a better landing
		 *    exists is its own question and not this one.
		 * 3. **The box never changes size, but its scroll extent does.** Each layer
		 *    scrolls on its own — they hold the same text in two different shapes,
		 *    so one shared offset would put them out of step — while nothing on the
		 *    sheet moves, since the box is the placement.
		 *
		 *    **The reader's place is not carried across, and that is the accepted
		 *    cost rather than an oversight.** This used to claim the focused field
		 *    "scrolls to its caret — which is what the reader asked for by
		 *    clicking", and departure 2 is precisely that there is no such caret:
		 *    the click is prevented, so the browser places nothing. Scroll a long
		 *    backstory to paragraph twelve, click, and the field opens at
		 *    paragraph one. Carrying the offset over is possible — map it
		 *    proportionally on focus — but only honest if the caret moves with it,
		 *    since a reader looking at paragraph twelve whose keystrokes land in
		 *    paragraph forty is worse off than one who can see where they are.
		 *    That trade reverses departure 2, so it is a decision rather than a
		 *    fix, and it has not been taken.
		 */
		const box = doc.createElement('div');
		box.classList.add('sheetsmith-placed-box', 'sheetsmith-rich-text-box');
		block.appendChild(box);

		const field = doc.createElement('textarea');
		field.classList.add('sheetsmith-rich-text-input');
		field.value = data?.text ?? '';
		// **The start, chosen, rather than the end, inherited.** Assigning `value`
		// moves the text entry cursor to the end of the control (HTML's own rule for
		// the setter), and focusing scrolls that cursor into view — so a backstory
		// long enough to scroll opened at its last line, which is the one position
		// in the text nobody asked for. Departure 2 gives up placing the caret from
		// the click; it does not follow that the caret should land wherever an
		// unrelated setter left it. Measured in Chrome before and after: a
		// forty-paragraph block focused at `scrollTop` 2062 of a possible 2062.
		field.setSelectionRange(0, 0);
		field.placeholder = PLACEHOLDER;
		// The label may be hidden and the field still has to have a name. Always
		// the label, never the placeholder: `docs/UI.md` §6, and a placeholder is
		// gone the moment anything is typed.
		field.setAttribute('aria-label', config.label);
		// Its text is transparent unfocused and the rendered prose is drawn over
		// it, so its squiggles would be too.
		spellcheckWhileFocused(field);
		box.appendChild(field);

		const rendered = doc.createElement('div');
		rendered.classList.add('sheetsmith-rich-text-rendered');
		box.appendChild(rendered);

		// **The links the app draws, given this plugin's behaviour.** Bound to the
		// layer once, before anything is painted into it: the fallback painter wires
		// each anchor as it makes it, and the app's renderer makes its own, so
		// without this a wikilink worked in a unit test and in the harness and did
		// nothing in Obsidian. Delegated, so it survives the renderer replacing what
		// it drew, and harmless on the fallback path — that painter's anchors call
		// `stopPropagation`, so this never sees them twice.
		adoptRenderedLinks(rendered, context.link);

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

		/**
		 * The refusal, and the only one this component has.
		 *
		 * `read` stays total — every body that reaches it is legal text, which is
		 * what makes this component the one with no read error state — and what is
		 * refused is the *write*. `## ` at the start of a line is the note's own
		 * section delimiter, so committing one splits the note underneath the block
		 * and the box comes back holding only what was above the heading.
		 *
		 * **The spec settled this on the wrong criterion and a report corrected
		 * it.** It weighed two options and rejected both on principle — escaping
		 * would put a plugin's syntax into a file the user owns, and failing `read`
		 * would make this the one body that is not legal text — and concluded that
		 * "nothing is lost from the file" was the part that mattered. From the
		 * reader's seat it is not: the bytes survive in a section nothing maps, the
		 * box empties, and the announcement said *saved*. That is the silent-failure
		 * class this whole component was specified against. Declining the write
		 * reaches neither original objection: nothing is escaped and `read` is
		 * untouched.
		 *
		 * The offending line is quoted because a backstory is long and "somewhere in
		 * here" is not a fix (PATTERNS §4).
		 */
		const refuse = (next: string): string | null => {
			const heading = startsSection(next);
			if (heading === null) return null;
			// The outcome first, because "was it saved?" is the reader's question and
			// the old behaviour answered it wrongly.
			return `Not saved. "${heading.trim()}" would start a new section in this note — use "### " instead.`;
		};

		/** The standing refusal, drawn under the box and cleared when it lifts. */
		let notice: HTMLElement | null = null;

		bindMultiline(field, {
			initial: text,
			refuse,
			/*
			 * **The draft is shown, not hidden, for as long as it is refused.**
			 * Unfocused, this field's text is transparent under the rendered layer,
			 * so a refusal left alone would put the *stored* prose back on screen
			 * with an error under it and the reader's actual words invisible in a box
			 * they had just been told was not saved. The class swaps that round: the
			 * layer stays hidden and the field keeps its colour, so what is on screen
			 * is the text the message is about.
			 *
			 * Focus is not taken back, deliberately. Refocusing on blur is the other
			 * way to keep the draft visible and it steals the pointer from wherever
			 * the reader just clicked; this leaves them free to go and come back, and
			 * the draft is still there when they do.
			 */
			onRefusal: (message) => {
				box.classList.toggle('sheetsmith-rich-text-refused', message !== null);
				notice?.remove();
				notice = null;
				if (message === null) return;
				notice = doc.createElement('div');
				notice.classList.add('sheetsmith-error');
				notice.textContent = message;
				block.appendChild(notice);
				// Said as well as drawn: the reader who cannot see the box is the one
				// the old "saved" announcement misled worst.
				status.textContent = message;
			},
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
