/*
 * Image — a portrait or a symbol on the sheet (SPEC §4.2). Covers the one thing a
 * character sheet holds that is not text or arithmetic: a face, a sigil, a crest.
 *
 * **Its value is an embed, and that is an amendment to §4.2 rather than a
 * reading of it.** The catalog gave this component `fenced` storage holding "a
 * path or wikilink", and Constraint 2 is unconditional: Obsidian does not index
 * links inside a code fence, so backlinks, graph view, hover preview and
 * **rename propagation** all break with no warning. A picture is the reference in
 * a vault most likely to be renamed, which makes it the worst possible value to
 * bury in a fence. So the section body *is* the embed the reader would have
 * written anyway:
 *
 *     ## Portrait
 *
 *     ![[Sildar Hallwinter.png]]
 *
 * Every consequence is a gain. Rename propagates. The portrait shows in markdown
 * view, where a fenced `path: Portrait.png` would have shown a code block. And it
 * matches Table's precedent exactly: the component that holds links stores
 * markdown. `parse/markdown-body.ts` is the storage half, shared with Rich text.
 *
 * **Only the embed form is accepted**, and each refusal is in
 * `parse/wikilink.ts`'s `parseEmbed`. A bare path would not propagate on rename,
 * which is the whole point; `![](…)` is markdown's own syntax and does not
 * either; a remote URL is refused here rather than there, because it is policy
 * rather than syntax — see `refusal` below.
 *
 * **It fills its placement and the picture is scaled to fit inside it**, up as
 * well as down: `object-fit: contain`, centred, never cropped and never
 * distorted. §8 is not bent by this, it is read correctly: the *component* fills
 * its placement, and a picture is what the component draws inside it. The
 * scaling is the stylesheet's and the argument for scaling *up* is with it — in
 * short, drawing at native size would let the file's pixel count size a box the
 * layout author placed, which is the same defect this component refuses the
 * stored size hint for. A size hint in the stored embed —
 * `![[Portrait.png|200x300]]` — is preserved in the file byte-for-byte and
 * **ignored on the sheet**, because honouring a number out of a *character's*
 * note would let one character's portrait float centred in a box the *layout
 * author* sized, which is the first thing §8 forbids. The plugin invents no
 * sizing key of its own for the same reason: a width on the component would be a
 * second sizing control disagreeing with the grid.
 *
 * **Every failure is on screen, under the component's own label.** That clause is
 * load-bearing: every image failure in the prior art is silent — an empty div
 * with the diagnosis in the console, a broken-image icon, a value reverting with
 * "console is not outputing any warning nor error" — so the label is drawn first
 * and the error goes in the frame below it, and nothing here writes to the
 * console.
 *
 * **It holds no extension list**, and that is the one shape of Fantasy Statblocks
 * 455 that cannot be written here: webp silently ceasing to render inside a
 * plugin while the same syntax worked one line outside it is what a resolution
 * path diverging from the app's own looks like. The app answers whether the file
 * exists; the browser answers whether it can draw it; this reports what happened.
 *
 * **It declares no `sample`, and it is the component that made that member
 * optional** (`docs/features/preview-sample-values.md`). Every sample is a body
 * the component's own `read` is handed, and the one body this component could
 * write is an embed naming a file: on the layout editor's canvas there is no
 * vault to resolve one against, so `RenderContext.resource` is absent and the
 * frame draws empty whatever the body says. A sample here would be filler
 * nothing could ever paint — and a member every component must implement and one
 * component can only implement uselessly is a member with a lie in it. So the
 * canvas draws this frame identically with sample values on and off, which is
 * the honest reading: without a vault, this component has nothing to show.
 *
 * **It is not a Card with a path in it.** A Card's value is text the reader types
 * and a formula may read; this publishes nothing at all, because §5's language
 * has no strings — a published path could be compared to nothing and handed to no
 * builtin, and could only be *written*, which is a Pool clamping its bar against
 * a file path (SPEC §13).
 */

import { bindEditable } from '../interaction/editable';
import { spellcheckWhileFocused } from '../ui/spellcheck';
import { bodyText, writeBodyText } from '../parse/markdown-body';
import { parseEmbed } from '../parse/wikilink';
import {
	ComponentConfig,
	ComponentDefinition,
	ReadResult,
	showsOwnLabel,
} from '../types';

/**
 * Hint shown while the frame is empty: the syntax, in the idiomatic place.
 *
 * The whole of what an empty frame has to say, and the reason the component
 * needs no picker (SPEC §4.2). Obsidian's own paste-a-file-into-a-note produces
 * exactly this, so the text the reader is handed everywhere else is the text this
 * field takes.
 */
const PLACEHOLDER = '![[Portrait.png]]';

/** What a remote address looks like, for the one target this refuses by policy. */
const REMOTE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** `![alt](target)`, the other spelling of an image markdown has. */
const MARKDOWN_IMAGE = /^!\[[^\]]*\]\(([^)]*)\)$/;

/**
 * What the body is pointing at, whichever way it spells it, for the remote check
 * alone.
 *
 * The refusal below has to know this *before* it decides the body is not an
 * embed, and that ordering is the whole of the bug it fixes. `parseEmbed` only
 * recognises `![[…]]`, so `![](https://…)` — which question 5 names as the
 * spelling the demand actually arrives in, because it is the one Obsidian itself
 * renders — was falling through to "a picture is an embed". Doing what that says
 * produces `![[https://…]]`, which is refused again by a different message
 * sending the reader to a different component. Two refusals to reach one answer,
 * and the first one's advice was wrong: PATTERNS §4 asks the text to name the
 * fix, and a fix that leads to a second refusal does not.
 *
 * A title is dropped — `![](url "Portrait")` — so the message quotes the address
 * rather than the address and a caption.
 *
 * Deliberately not `parseEmbed`'s job, and not a shared parser: this is the
 * remote *policy* asking what host a body would reach, not the file model asking
 * what an embed means. Nothing else needs it, so it stays here (PATTERNS §1).
 */
function addressed(source: string): string {
	const trimmed = source.trim();
	const embed = parseEmbed(trimmed);
	if (embed !== null) return embed;
	const markdown = MARKDOWN_IMAGE.exec(trimmed);
	// The bare paste is the third spelling and gets the same answer: a reader who
	// drops a URL in on its own is asking for exactly what the other two ask for.
	const target = (markdown?.[1] ?? trimmed).trim();
	return target.split(/\s/)[0] ?? target;
}

export interface ImageConfig extends ComponentConfig {
	type: 'image';
	hideLabel?: boolean;
}

/**
 * The embed exactly as written, pipe options included.
 *
 * The source line rather than the target, so `![[Portrait.png|200x300]]` survives
 * byte-for-byte: the sheet ignores the hint and markdown view goes on honouring
 * it, and neither has to know what the other does with it.
 *
 * One field, held flat rather than as a delta. PATTERNS §7's rule protects
 * siblings from a commit racing a rebuild, and there is no sibling here.
 */
export interface ImageData {
	source: string;
}

/**
 * Why this body cannot be a picture, or null where it can.
 *
 * Two refusals with two messages, because the fix differs and PATTERNS §4 asks
 * the text to name it. A body that is not an embed is fixed by writing the
 * bracket form; a body naming a web address is fixed by using a *different
 * component*, and a message saying "no file in this vault is called
 * https://example.com/p.png" would never lead anyone there.
 *
 * The remote refusal is this component's rather than `parseEmbed`'s because it is
 * policy and not syntax: `![[https://…]]` is a well-formed embed. `AGENTS.md` and
 * Obsidian's Developer Policies both say default to local and offline operation,
 * and an `<img src="https://…">` this plugin wrote is a request it makes on the
 * reader's behalf, on every render of the sheet, to a host named in someone
 * else's note — leaking the reader's address and, through the URL, which sheet is
 * open. The positive answer is what keeps this from being a bare refusal:
 * Obsidian renders `![](https://…)` perfectly well under its own settings and its
 * own disclosure, so the message sends the reader to a Rich text block.
 */
function refusal(source: string): string | null {
	// Remote first, and that order is load-bearing rather than incidental: the
	// syntax refusal names a fix, and for a body naming a web address that fix is
	// wrong — writing the bracket form around a URL only reaches this message one
	// step later. See `addressed` for the three spellings this now covers.
	const target = addressed(source);
	if (REMOTE.test(target)) {
		return `"${target}" is a web address, and a picture has to be a file in this vault. Put a remote picture in a Rich text block instead, where Obsidian fetches it under your own settings.`;
	}
	if (parseEmbed(source) === null) {
		return `A picture is an embed: ${PLACEHOLDER}.`;
	}
	return null;
}

export const image: ComponentDefinition<ImageConfig, ImageData> = {
	type: 'image',
	storage: 'markdown',
	formulaFields: [],
	configFields: [
		{
			key: 'hideLabel',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide the label',
			description:
				'Draws the picture with no caption over it, which is usually right for a portrait. The picture still announces itself by the label to assistive tech, and the note keeps its heading either way.',
			default: false,
		},
	],

	/*
	 * **`read` cannot fail, and that is a correction rather than a simplification.**
	 * It used to refuse a body that is not a usable embed, and a failed `read` never
	 * reaches `render`: `view/grid-cells.ts` replaces the whole cell, so there is no
	 * frame, no label row and **no field**.
	 *
	 * Every other component's read failure comes from a hand-edited note. Image is
	 * the first whose own editing gesture can produce one: type `![](https://…)`
	 * into the field, blur, and the sheet rebuilds into a cell with nothing in it to
	 * edit — the reader is locked out of a value they entered one second ago, and
	 * the only way back is markdown view. It also broke PATTERNS §4 where it matters
	 * most, since the message said "Put a remote picture in a Rich text block
	 * instead" and the reader could not act on it from where they were standing.
	 *
	 * So a body this component cannot use is still a body it can *hold*: `read`
	 * hands it back, the field draws it, and `render` puts the reason in the frame.
	 * That is what the other three failures already did, so all four now land in one
	 * place — which is the outcome `docs/UI.md` §12's error-card row asked for, and
	 * why that row no longer names this component. Constraint 3 is untouched: `write`
	 * returns an unchanged body byte-for-byte whether or not the source is usable.
	 */
	read(body): ReadResult<ImageData> {
		const source = bodyText(body);
		// No section, an empty one, or one holding only blank lines: an editable
		// empty frame, not an error (PATTERNS §4). The first commit writes it.
		if (source === '') return { ok: true, data: null };
		return { ok: true, data: { source } };
	},

	write(data, body): string {
		return writeBodyText(body, data.source);
	},

	/*
	 * No config guard: the one setting this component has is a boolean, so there
	 * is no combination of its configuration without a reading and nothing for a
	 * guard to refuse. Everything that can be wrong here is in the *note*, and
	 * `read` reports it.
	 */
	render(container, config, data, context): void {
		const doc = container.ownerDocument;
		container.replaceChildren();

		const block = doc.createElement('div');
		// The shared box: a component whose size is its placement and not its
		// content (docs/UI.md §9). Its own class beside it carries only what it does
		// differently, which is what goes *inside* the box.
		block.classList.add('sheetsmith-placed', 'sheetsmith-image');
		// The placement, handed to CSS as the frame's own floor. The same property
		// Rich text sets and for the same reason: the picture is out of flow so its
		// intrinsic size contributes nothing, and without a floor derived from the
		// layout the frame would take its height from the file — which is a
		// character's note deciding a box the layout author sized (SPEC §8).
		block.style.setProperty(
			'--sheetsmith-rows',
			String(config.position.height),
		);
		container.appendChild(block);

		// Drawn first, and before any failure, so the name is on screen whichever
		// path raised it. This is what keeps the component out of UI §12's
		// "error card renders without its component name" row.
		const labelled = showsOwnLabel(config, context);
		if (labelled) {
			const label = doc.createElement('div');
			label.classList.add('sheetsmith-component-label', 'sheetsmith-image-label');
			label.textContent = config.label;
			block.appendChild(label);
		}

		const box = doc.createElement('div');
		box.classList.add('sheetsmith-placed-box', 'sheetsmith-image-box');
		block.appendChild(box);

		/**
		 * Where the picture goes, or the reason there is none.
		 *
		 * Its own element so a failure can replace the picture without touching the
		 * field stacked over it — which matters for the one failure that arrives
		 * *after* render, when the `<img>` reports it cannot draw the file.
		 */
		const frame = doc.createElement('div');
		frame.classList.add('sheetsmith-image-frame');
		box.appendChild(frame);

		const status = doc.createElement('div');
		status.classList.add('sheetsmith-sr-only');
		status.setAttribute('aria-live', 'polite');

		const source = data?.source ?? '';

		const field = doc.createElement('input');
		field.type = 'text';
		field.classList.add('sheetsmith-image-input');
		field.value = source;
		field.placeholder = PLACEHOLDER;
		// The label may be hidden and the field still has to have a name.
		field.setAttribute('aria-label', config.label);
		// A reference is not prose — `Sildar Hallwinter.png` squiggles — and the
		// field's text is transparent unfocused, so the marks would land on the
		// portrait rather than on anything the reader is reading.
		spellcheckWhileFocused(field);
		box.appendChild(field);

		/**
		 * Why the frame is empty, in the frame, under the label.
		 *
		 * **It names itself where it drew no label**, which is `docs/UI.md` §12's
		 * error-card row applied to this component's own failures rather than to the
		 * view's. With `hideLabel` set, or inside a container that already named it,
		 * there is no heading above the frame — so an error would be a red box on a
		 * sheet with nothing saying which component it belongs to, and on a sheet
		 * holding three portraits, nothing saying which one to fix.
		 *
		 * It cannot say it twice: this component has no failing `read` any more, so
		 * the view never composes a prefix for it, and the branch is the same one
		 * that decided whether to draw the heading at all.
		 */
		const fail = (message: string): void => {
			frame.replaceChildren();
			const error = doc.createElement('div');
			error.classList.add('sheetsmith-error');
			error.textContent = labelled ? message : `${config.label}: ${message}`;
			frame.appendChild(error);
		};

		// The two refusals `read` used to raise, now raised where the field survives
		// them. First, because a body that is not a usable reference has no target
		// to resolve and "no file in this vault is called ![](https://…)" would lead
		// nowhere.
		const unusable = source === '' ? null : refusal(source);
		if (unusable !== null) {
			fail(unusable);
			// Said as well as drawn, since the reader who cannot see the frame has
			// only the label and an empty box otherwise.
			status.textContent = unusable;
		}
		const target = unusable !== null || source === '' ? null : parseEmbed(source);
		if (target !== null && context.resource !== undefined) {
			const url = context.resource(target);
			if (url === null) {
				// The commonest way a vault reference goes stale, and the one the
				// prior art always reported as an empty box: the file was renamed,
				// moved or never existed. Named, so the fix is the filename.
				fail(`No file in this vault is called "${target}".`);
			} else {
				const picture = doc.createElement('img');
				// A class the stylesheet owns rather than a bare `<img>`. Content
				// drawn into a themed surface inherits the reader's theme and
				// snippets, and Meta Bind 671 is a picture cropped because a rule in
				// the reporter's own theme was keyed on its *filename* ending in
				// `-portrait`. The class is what this plugin's own `object-fit` rides
				// on, so the fit is stated here rather than hoped for.
				picture.classList.add('sheetsmith-image-picture');
				// Exactly what the app returned, with nothing prepended and no
				// extension inspected on the way (SPEC §4.2).
				picture.src = url;
				// The visible heading already names it, and saying it twice is worse
				// than saying it once. Where the heading is hidden this is the only
				// name the picture has.
				picture.alt = labelled ? '' : config.label;
				// The one failure that cannot be known before the browser tries: a
				// file the vault holds and the browser cannot draw. Reported rather
				// than predicted, because a plugin holding its own list of formats is
				// how webp stopped rendering inside one while working outside it.
				picture.addEventListener('error', () => {
					fail(`"${target}" is not a picture.`);
				});
				frame.appendChild(picture);
			}
		}
		// A target with no `resource` draws an empty frame and no error: the absence
		// of a vault is not evidence that a file is missing, which is `LinkContext`'s
		// own bargain read for a picture.

		box.appendChild(status);

		/*
		 * The press. The frame answers it and hands focus to the field, which is
		 * §4.2's "click to change" honoured and narrowed: a click changes the
		 * picture by editing its text rather than by opening a picker.
		 *
		 * **A picker is what this is instead of**, and the reasons are in the
		 * feature spec: it would be a context member with its own keyboard model,
		 * what it would list is every file in the vault, and the plugin's existing
		 * answer for "a choice from a closed list" is a `<select>` — a vault is not
		 * a closed list.
		 *
		 * The field is a line across the middle rather than the whole box, so the
		 * frame is what the reader actually presses. Simpler than Rich text's
		 * equivalent and worth saying why they differ: there the display layer is a
		 * scrollport, so it has to be the pointer target or the wheel never reaches
		 * it. A picture does not scroll — `object-fit` fits it — so the routing here
		 * is only about focus.
		 *
		 * **On `click` rather than `pointerdown`, under the second half of PATTERNS
		 * §6's rule rather than in departure from it.** "Focus on `pointerdown`" is
		 * for a control where focus is *preparation* — a card's field, where the
		 * outcome is the value committed after it, so a press that slides off has
		 * taken nothing with it. Here handing over the field is the whole outcome,
		 * so there is no commit left to abandon on, and focusing on the press would
		 * open a mobile keyboard for a finger that slid off the picture and changed
		 * its mind. §6's own forgiveness argument therefore picks release. Not
		 * Rich text's reason, which is about a scroll gesture and does not apply to
		 * a picture — this is the general one, and §6 now carries it so the next
		 * component reads a rule rather than copying a precedent.
		 */
		frame.addEventListener('click', () => {
			// Already editing: a press on the frame beside the field is the reader
			// aiming at the picture, not asking to start over, and re-selecting
			// would throw away a caret position they had just placed.
			if (doc.activeElement === field) return;
			// A drag that selected the error text is not a request to edit either:
			// the message names a filename the reader may well be copying.
			const selection = doc.getSelection();
			if (selection !== null && !selection.isCollapsed) return;
			field.focus();
			// Selected, not just focused. The value is one short reference the
			// reader is replacing wholesale — pasting the embed Obsidian put on
			// their clipboard is the gesture — so a caret at one end would mean
			// selecting it by hand first.
			field.select();
		});

		bindEditable(field, {
			initial: source,
			announceCommit: (next) => {
				status.textContent =
					next === '' ? `${config.label} cleared` : `${config.label} set to ${next}`;
			},
			announceRestore: (restored) => {
				status.textContent =
					restored === ''
						? `${config.label} restored to empty`
						: `${config.label} restored to ${restored}`;
			},
			// Reported, never painted first. PATTERNS §5's optimistic paint is for a
			// write that may produce no rebuild; a commit here only fires when the
			// source changed, so the rebuild always comes — and it is the rebuild
			// that has to fetch a new resource URL, which this component cannot do.
			onCommit: (next) => context.onChange({ source: next }),
		});
	},
};
