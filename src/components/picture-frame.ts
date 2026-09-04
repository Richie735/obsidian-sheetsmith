/*
 * A picture in a box, the field that changes it, and every reason there is no
 * picture — shared by Image and Passport.
 *
 * **This is `docs/PATTERNS.md` §1's "share the application, not just the fact",
 * and it exists because the first pass got that wrong.** `embed-rule.ts` extracted
 * the *predicate* — can this text be a picture, and if not, what is the fix — and
 * left its whole application duplicated: 33 non-blank lines byte-identical
 * between the two components, the click handler included, both of its comments
 * included. That is the `roundSum` mistake §1 records word for word, "a policy
 * shared and its application duplicated", in the same diff that cited the rule.
 *
 * **And the two-consumer rung was not available**, which is `arm-to-confirm.ts`'s
 * entry verbatim. §1 allows duplication at two only under a test driving both
 * copies over the same cases, and `image.test.ts` drives five the second copy had
 * no equivalent for: a caret left alone where the field is already focused, no
 * focus stolen from a press that ended a selection, a press on an error message,
 * a press on an empty frame, and no spellcheck while the picture is what is on
 * screen. Every one of those is a rule with a reason, and three of the reasons
 * are invisible in review.
 *
 * **What the caller keeps is the box and the chrome around it**, which is the one
 * thing the two do not share: Image's is `.sheetsmith-placed-box` filling a
 * placement under its own label, and a Passport's is a square beside a name
 * inside a card. So this is handed an element and draws inside it, exactly as
 * `card-face.ts` is.
 *
 * **The class names arrive as arguments**, which is `linked-text.ts`'s precedent
 * and not a formality: a module beside the components must not know that an image
 * exists, and these classes are spelled `sheetsmith-image-*` because Image was
 * the first consumer and `styles.test.ts` names one of them in its field roster.
 * Renaming them to match this module would be a stylesheet change with two test
 * files behind it and no behaviour in it; passing them keeps the module honest
 * and the sheet unchanged.
 *
 * **No test file of its own, on `card-face.ts`'s and `level-ring.ts`'s settled
 * practice rather than as an exception claimed here.** A painter has no entry
 * point: it is only ever reached by a component drawing one, and what it owns
 * becomes observable only in the component's own box. `image.test.ts` drives 68
 * cases through this code and `passport.test.ts` its own, so the five gesture
 * rules that had one driver before the extraction now have two — which is the
 * whole of what §1 was asking for, and what a third file would restate rather
 * than assert.
 *
 * In no registry, declaring no `ComponentDefinition`, importing nothing from
 * `obsidian` and touching no file.
 */

import { bindEditable } from '../interaction/editable';
import { parseEmbed } from '../parse/wikilink';
import { spellcheckWhileFocused } from '../ui/spellcheck';
import { EMBED_PLACEHOLDER, embedRefusal } from './embed-rule';

/** What the caller's stylesheet calls each of the three elements drawn here. */
export interface PictureFrameClasses {
	/** The frame: the picture, or the reason there is none. */
	frame: string;
	/** The `<img>` itself, so the caller's own `object-fit` has something to ride on. */
	picture: string;
	/** The one-line field holding the embed's own text. */
	field: string;
}

export interface PictureFrameOptions {
	classes: PictureFrameClasses;
	/** The embed line exactly as the note holds it, or '' where it holds none. */
	source: string;
	/**
	 * The field's accessible name, and the subject of every announcement.
	 *
	 * One member for both because they are one answer: whatever the field is
	 * called is what "… set to …" has to be about. Image passes its own label,
	 * since the picture is the whole component; a Passport passes "<label>
	 * picture", since three other controls on the same face carry that label too.
	 */
	name: string;
	/**
	 * What a reader who cannot see the picture is told it is, or '' where the page
	 * already says it — a visible heading above the frame, or a name in large type
	 * beside it. Saying it twice is worse than saying it once.
	 */
	alt: string;
	/**
	 * Prefixed onto every message here, or null where the component drew a visible
	 * label of its own.
	 *
	 * `docs/UI.md` §12's error-card row applied to a component's own failures: with
	 * the label hidden, or inside a container that already named it, an error would
	 * otherwise be a red box with nothing saying which component it belongs to —
	 * and on a sheet holding three portraits, nothing saying which one to fix.
	 */
	prefix: string | null;
	/**
	 * The live region messages are announced into. The caller owns where it sits,
	 * because that is part of its own chrome.
	 */
	status: HTMLElement;
	/**
	 * A URL an `<img>` can take for a file the vault holds, or null where the
	 * target names no file. Absent where there is no vault.
	 */
	resource?: (target: string) => string | null;
	/**
	 * Why a draft must not be written, or null where it may be. Absent where any
	 * text the reader types is text the component can hold.
	 *
	 * Image's whole body is its value, so it passes nothing: a body it cannot
	 * *use* is still a body it can *hold*, and the refusal below is drawn in the
	 * frame with the field left holding what the note holds. A Passport's picture
	 * is one line beside a fence, found by looking like an embed, so a draft that
	 * does not is a line `read` would never look for — and committing it would
	 * leave the reader's own text in the note as prose with the field empty.
	 */
	refuse?: (next: string) => string | null;
	onCommit: (next: string) => void;
}

/**
 * Draw the frame and its field into `box`.
 *
 * The frame's whole content is derived from the source plus whichever refusal is
 * standing, in one closure rather than a one-way `fail`, because `editable.ts`
 * reports a *cleared* refusal on every commit attempt including the ones that
 * change nothing — and a draft equal to the stored value produces no rebuild, so
 * without a way back the frame would keep a message about a draft the reader has
 * already abandoned.
 */
export function renderPictureFrame(
	box: HTMLElement,
	options: PictureFrameOptions,
): void {
	const doc = box.ownerDocument;

	/**
	 * Where the picture goes, or the reason there is none.
	 *
	 * Its own element so a failure can replace the picture without touching the
	 * field stacked over it — which matters for the one failure that arrives
	 * *after* render, when the `<img>` reports it cannot draw the file.
	 */
	const frame = doc.createElement('div');
	frame.classList.add(options.classes.frame);
	box.appendChild(frame);

	const field = doc.createElement('input');
	field.type = 'text';
	field.classList.add(options.classes.field);
	field.value = options.source;
	field.placeholder = EMBED_PLACEHOLDER;
	// The label may be hidden and the field still has to have a name.
	field.setAttribute('aria-label', options.name);
	// A reference is not prose — `Sildar Hallwinter.png` squiggles — and the
	// field's text is transparent unfocused, so the marks would land on the
	// portrait rather than on anything the reader is reading.
	spellcheckWhileFocused(field);
	box.appendChild(field);

	const showError = (message: string): void => {
		const error = doc.createElement('div');
		error.classList.add('sheetsmith-error');
		error.textContent =
			options.prefix === null ? message : `${options.prefix}: ${message}`;
		frame.appendChild(error);
	};

	/**
	 * Why the *stored* source cannot be a picture, or null where it can.
	 *
	 * Asked once rather than per paint: it is a fact about the note, and the note
	 * does not change under a render.
	 */
	const unusable = embedRefusal(options.source);

	const paint = (refused: string | null): void => {
		frame.replaceChildren();
		const message = refused ?? unusable;
		if (message !== null) {
			showError(message);
			return;
		}
		const target = parseEmbed(options.source);
		// A target with no `resource` draws an empty frame and no error: the
		// absence of a vault is not evidence that a file is missing, which is
		// `LinkContext`'s own bargain read for a picture.
		if (target === null || options.resource === undefined) return;
		const url = options.resource(target);
		if (url === null) {
			// The commonest way a vault reference goes stale, and the one the prior
			// art always reported as an empty box: the file was renamed, moved or
			// never existed. Named, so the fix is the filename.
			showError(`No file in this vault is called "${target}".`);
			return;
		}
		const picture = doc.createElement('img');
		// A class the stylesheet owns rather than a bare `<img>`. Content drawn
		// into a themed surface inherits the reader's theme and snippets, and Meta
		// Bind 671 is a picture cropped because a rule in the reporter's own theme
		// was keyed on its *filename* ending in `-portrait`. The class is what the
		// caller's own `object-fit` rides on, so the fit is stated rather than
		// hoped for.
		picture.classList.add(options.classes.picture);
		// Exactly what the app returned, with nothing prepended and no extension
		// inspected on the way (SPEC §4.2).
		picture.src = url;
		picture.alt = options.alt;
		// The one failure that cannot be known before the browser tries: a file the
		// vault holds and the browser cannot draw. Reported rather than predicted,
		// because a plugin holding its own list of formats is how webp stopped
		// rendering inside one while working outside it.
		picture.addEventListener('error', () => {
			frame.replaceChildren();
			showError(`"${target}" is not a picture.`);
		});
		frame.appendChild(picture);
	};

	paint(null);
	if (unusable !== null) {
		// Said as well as drawn, since a reader who cannot see the frame has only
		// the label and an empty box otherwise.
		options.status.textContent = unusable;
	}

	/*
	 * The press. The frame answers it and hands focus to the field, which is
	 * SPEC §4.2's "click to change" honoured and narrowed: a click changes the
	 * picture by editing its text rather than by opening a picker.
	 *
	 * **A picker is what this is instead of**, and the reasons are in
	 * `docs/features/rich-text-and-image.md`: it would be a context member with
	 * its own keyboard model, what it would list is every file in the vault, and
	 * the plugin's existing answer for "a choice from a closed list" is a
	 * `<select>` — a vault is not a closed list.
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
	 * taken nothing with it. Here handing over the field is the whole outcome, so
	 * there is no commit left to abandon on, and focusing on the press would open
	 * a mobile keyboard for a finger that slid off the picture and changed its
	 * mind. §6's own forgiveness argument therefore picks release. Not Rich text's
	 * reason, which is about a scroll gesture and does not apply to a picture —
	 * this is the general one, and §6 carries it so the next component reads a
	 * rule rather than copying a precedent.
	 */
	frame.addEventListener('click', () => {
		// Already editing: a press on the frame beside the field is the reader
		// aiming at the picture, not asking to start over, and re-selecting would
		// throw away a caret position they had just placed.
		if (doc.activeElement === field) return;
		// A drag that selected the error text is not a request to edit either: the
		// message names a filename the reader may well be copying.
		const selection = doc.getSelection();
		if (selection !== null && !selection.isCollapsed) return;
		field.focus();
		// Selected, not just focused. The value is one short reference the reader
		// is replacing wholesale — pasting the embed Obsidian put on their
		// clipboard is the gesture — so a caret at one end would mean selecting it
		// by hand first.
		field.select();
	});

	bindEditable(field, {
		initial: options.source,
		announceCommit: (next) => {
			options.status.textContent =
				next === '' ? `${options.name} cleared` : `${options.name} set to ${next}`;
		},
		announceRestore: (restored) => {
			options.status.textContent =
				restored === ''
					? `${options.name} restored to empty`
					: `${options.name} restored to ${restored}`;
		},
		// Reported, never painted first. PATTERNS §5's optimistic paint is for a
		// write that may produce no rebuild; a commit here only fires when the
		// source changed, so the rebuild always comes — and it is the rebuild that
		// has to fetch a new resource URL, which no component can do.
		onCommit: options.onCommit,
		// Wired only where the caller refuses something, so a component that
		// refuses nothing does not repaint its frame on every commit — and the
		// repaint would replace the `<img>` and start a second load, one frame
		// before the rebuild replaced it anyway.
		...(options.refuse === undefined
			? {}
			: {
					refuse: options.refuse,
					onRefusal: (message: string | null) => {
						paint(message);
						if (message !== null) options.status.textContent = message;
					},
				}),
	});
}
