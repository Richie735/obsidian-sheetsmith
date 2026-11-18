/*
 * The controls that edit one fenced record: its name, a number field and its
 * ceiling, its modifier glyph, and its prose.
 *
 * **Shared by Record set and Stat block** (`docs/features/character-forms.md`),
 * moved out of `record-set.ts` on `docs/PATTERNS.md` §1's two-consumer rung
 * rather than copied. Each is one gesture with rules a reader cannot see in
 * review — a blank name puts the stored one back, a slash in a value is refused
 * because the entry splits at it, a link is refused at every route into the
 * fence, a body line starting `## ` or `### ` is refused because it would start
 * a section or a record — and two copies of any of them is one design pass away
 * from saying two things.
 *
 * What a caller keeps is where each control sits and what its commit reports:
 * a control here is handed a `commit` and never builds a delta, so it knows the
 * shape of a record and nothing of the component holding it. `record-fields.ts`
 * holds the data path these controls read and write through.
 */

import { setIcon } from 'obsidian';
import {
	bindEditable,
	bindMultiline,
	keptRatherThanBlank,
} from '../interaction/editable';
import { splitBounded, withCeiling, withValue } from '../parse/bounded-entry';
import { cellParts, spellParts, storedParts } from '../parse/modifier-cell';
import { startsRecord } from '../parse/records';
import { startsSection } from '../parse/character';
import { hasLink } from '../parse/wikilink';
import { formatDerived } from './card-face';
import { fencedLinkRefusal } from './fenced-link';
import { boundedText, TypedField } from './typed-value';
import {
	Ceiling,
	CeilingReaders,
	ceilingNumber,
	ceilingOf,
	ceilingProblem,
	fieldBounds,
	RecordEntry,
	RecordField,
	recordsOwnMax,
	typedCeiling,
} from './record-fields';
import { FieldValue, RenderContext, RowValues } from '../types';
import { adoptRenderedLinks, paintLinkedText } from './linked-text';
import {
	ModifierFormState,
	modifierFormState,
	renderModifierForm,
} from './modifier-form';
import {
	applying,
	modifierRowName,
	modifierRowText,
	rowModifiers,
} from './modifier-breakdown';
import {
	AnchoredPanel,
	focusFirstControl,
	openAnchoredPanelKey,
	reanchorAnchoredPanel,
	showAnchoredPanel,
} from '../ui/anchored-panel';
import { element } from '../ui/element';
import { flagWhileFocused } from '../interaction/field-focus-flag';
import { spellcheckWhileFocused } from '../ui/spellcheck';
import { revealWhenTruncated } from '../ui/truncation';

/**
 * The disclosure's two marks. Lucide's own chevrons, so the control reads as
 * every other disclosure in the app rather than as a glyph of this plugin's.
 */
export const CLOSED_ICON = 'chevron-right';
export const OPEN_ICON = 'chevron-down';

/** The delete control's mark on a record, which is Table's and the layout editor's. */
export const REMOVE_ICON = 'trash';

/**
 * Bind a button that opens a region in place: its chevron, `aria-expanded`,
 * `aria-controls`, and a closed region `hidden="until-found"` so find-in-page
 * still reaches it, with a `beforematch` that agrees it is open.
 *
 * **One disclosure for a record's body and a stat block's**, which had three
 * copies between Record set and Stat block. Painted before reporting, because
 * nothing here reaches the note: no write means no rebuild, so a control
 * waiting for one would never answer the press at all (PATTERNS §5). happy-dom
 * implements neither the attribute nor the event, so a test asserts the wiring
 * and the harness cannot photograph it.
 */
export function bindDisclosure(options: {
	button: HTMLButtonElement;
	region: HTMLElement;
	open: boolean;
	/**
	 * What the region is called, where the button has no words of its own: it
	 * is then named `Open …` or `Close …` by `aria-label` and `title`. Absent
	 * where the button carries a visible label, which is its name.
	 */
	named?: string;
	/** Where the chevron is drawn; the button itself where absent. */
	glyph?: HTMLElement;
	onToggle: (open: boolean) => void;
}): void {
	const { button, region, named, onToggle } = options;
	const glyph = options.glyph ?? button;
	let open = options.open;
	button.type = 'button';
	button.setAttribute('aria-controls', region.id);
	const paint = (): void => {
		glyph.replaceChildren();
		setIcon(glyph, open ? OPEN_ICON : CLOSED_ICON);
		button.setAttribute('aria-expanded', String(open));
		if (named !== undefined) {
			const said = open ? `Close ${named}` : `Open ${named}`;
			button.setAttribute('aria-label', said);
			button.setAttribute('title', said);
		}
		// The attribute's *value*, not the boolean: `until-found` is what keeps
		// find-in-page able to reach a closed region and reveal it.
		if (open) region.removeAttribute('hidden');
		else region.setAttribute('hidden', 'until-found');
	};
	const set = (next: boolean): void => {
		if (next === open) return;
		open = next;
		paint();
		onToggle(open);
	};
	button.addEventListener('click', () => set(!open));
	region.addEventListener('beforematch', () => set(true));
	/*
	 * **The focus ring is the keyboard's.** A press that focuses the chevron
	 * marks it, and the mark is what the stylesheet reads to draw no ring; a key
	 * or leaving the control clears it. Spelled here rather than trusted to
	 * `:focus-visible` alone, because a focus the view restores after a rebuild
	 * is a script focus, which the engine may paint as visible whatever focused
	 * it first.
	 */
	button.addEventListener('pointerdown', () => button.classList.add(POINTER_FOCUS));
	button.addEventListener('keydown', () => button.classList.remove(POINTER_FOCUS));
	button.addEventListener('blur', () => button.classList.remove(POINTER_FOCUS));
	paint();
}

/** The class a disclosure wears while a pointer, not a key, gave it focus. */
export const POINTER_FOCUS = 'sheetsmith-pointer-focus';

/**
 * Report the open records after the one at `removedAt` goes, moved up by one.
 *
 * The open set is keyed by position, like everything else about a record, so a
 * delete shifts it, and the change is reported as the difference through the
 * view's per-index pair (`onToggleRecord`). **`defaultOpen` is what a position
 * is when the set does not hold it**: Record set's records are all closed by
 * default, and a Stat block companion's first is open, so its set holds the
 * positions that *differ* — and shifting those bits without reading them back
 * through the default would close the record that moved into the first place.
 */
export function shiftOpenRecords(
	opened: ReadonlySet<number>,
	removedAt: number,
	count: number,
	report: (at: number, inSet: boolean) => void,
	defaultOpen: (at: number) => boolean = () => false,
): void {
	const isOpen = (at: number): boolean => defaultOpen(at) !== opened.has(at);
	const target = new Set<number>();
	for (let at = 0; at < count - 1; at++) {
		const open = isOpen(at < removedAt ? at : at + 1);
		if (open !== defaultOpen(at)) target.add(at);
	}
	for (const at of opened) {
		if (!target.has(at)) report(at, false);
	}
	for (const at of target) {
		if (!opened.has(at)) report(at, true);
	}
}

/** A blank line, which is what separates one paragraph from the next. */
const PARAGRAPH_BREAK = /(?:\r?\n[ \t]*)+\r?\n/;

/** What clipping means on a record's name, for the shared linked-text painter. */
const NAME_CLIPPING = {
	soleLinkClass: 'sheetsmith-record-link-only',
	reveal: revealWhenTruncated,
};

/**
 * What a record's controls need from the component drawing them: its render
 * context, its id (a panel's key and a formula field's owner), what one record
 * is called, and the live region every control announces through.
 */
export interface RecordHost {
	/** Everything but the change report, which a control hands to its `commit`. */
	context: Omit<RenderContext, 'onChange'>;
	id: string;
	noun: string;
	status: HTMLElement;
	/** The component's label, which its pushes name it by: half of a grant's key. */
	source: string;
}

/** A number field as its caller holds it, for a stepper drawn beside it. */
export interface RecordNumber {
	input: HTMLInputElement;
	/**
	 * Set the value and commit it through the typed value's own path — refused,
	 * held to its bounds, announced and written exactly as a typed one is — which
	 * is `EditableHandle.set`, so the field's idea of what is committed stays true.
	 */
	set: (next: string) => void;
	/** The ceiling this field is read against now, or null where it has none. */
	ceiling: () => number | null;
}

/** Draw prose as paragraphs with its wikilinks live, for where there is no app. */
export function paintRecordProse(
	into: HTMLElement,
	text: string,
	context: Pick<RenderContext, 'link'>,
): void {
	into.replaceChildren();
	into.classList.add('sheetsmith-record-body-plain');
	for (const paragraph of text.split(PARAGRAPH_BREAK)) {
		if (paragraph.trim() === '') continue;
		const p = element('p', '', into);
		paintLinkedText(p, paragraph, { link: context.link });
	}
}

/**
 * Every refusal a record's fence routes say, built for one component: a link
 * anywhere, and a slash in a value half.
 */
export function recordRefusals(host: Pick<RecordHost, 'noun'>): {
	refuseLink: (text: string) => string | null;
	refusal: (text: string) => string | null;
	refuseNumber: (text: string) => string | null;
	refuseCeiling: (text: string) => string | null;
} {
	const { noun } = host;
	/**
	 * Why a note reference cannot be stored in a record's fields, or null.
	 *
	 * **One builder for every route that reaches the fence**, because the
	 * sentence is the whole of what the reader is told and two copies of it is
	 * one design pass away from saying two things — which is the drift
	 * `components/isolation.test.ts` scans for by clause.
	 *
	 * **And the builder is `components/fenced-link.ts` now rather than this
	 * closure**, because Passport is the second fenced component with a
	 * free-text field and the sentence above was about to be written twice —
	 * which is the paragraph directly above happening across two files instead
	 * of within one. The two words that differ are arguments: a record has a
	 * name and a body to move a link into and a passport has neither.
	 *
	 * **It used to be bound to the modifier field alone, and that was a hole
	 * rather than a scoping decision.** The claim covering the rest was that no
	 * field type Record set offered could hold a wikilink, which is true of the
	 * *type* and false of the *input*: a `number` field is an
	 * `<input type="text">` and `boundedText` leaves text that is not a number
	 * exactly as typed, so a pasted `[[Ring]]` in a `Uses` field was written
	 * into the fence. A scan over the offered types could not see it.
	 *
	 * **Table has the same free text and does not have this problem**, which is
	 * why it never came up: a modifier cell there is a markdown table cell, so a
	 * `[[…]]` in one *is* indexed. A record's fields are a `sheet` fence, and
	 * Obsidian indexes no link inside one — backlinks, graph view, hover preview
	 * and rename propagation all break with no warning, which is the whole of
	 * Constraint 2.
	 *
	 * Refused rather than escaped, on Rich text's own rule: escaping puts a
	 * plugin's syntax into a file the user owns. And refused at the *commit*
	 * rather than in `read`, so a note that already holds one is rendered and
	 * carried rather than corrected (SPEC §10) — the message is for the reader
	 * who is typing one now.
	 */
	const refuseLink = (text: string): string | null =>
		fencedLinkRefusal(text, {
			subject: `A ${noun.toLowerCase()}'s fields`,
			instead: `Put it in the ${noun.toLowerCase()}'s name or its body instead.`,
		});

	/** The whole sentence a refused commit says, or null where the text is fine. */
	const refusal = (text: string): string | null => {
		const said = refuseLink(text);
		return said === null ? null : `Not saved. ${said}`;
	};

	/**
	 * Why a number field's commit cannot be stored, or null.
	 *
	 * A link, as everywhere else that reaches the fence — **and a slash**,
	 * which this feature made syntax. `parse/bounded-entry.ts` splits an entry
	 * at its first slash, so a value half holding one is not a value that
	 * module can write back: committing `1/2` into a field whose entry is
	 * `Uses: 2 / 3` produces `Uses: 1/2 / 3`, which re-reads as a value of 1
	 * against a ceiling of `2 / 3` — text, so nothing clamps to it and `full`
	 * starts skipping that record. Nothing is deleted, so Constraint 4 holds;
	 * what goes is the reading the reader set, silently, on an ordinary typo.
	 *
	 * **Refused rather than repaired**, on `boundedText`'s own rule one level
	 * up: `1/2` might mean "one of two" and might be a slip, and replacing what
	 * somebody wrote with a number they did not is the thing this codebase
	 * refuses to do. It is also PATTERNS §7 exactly — validate what the file
	 * format requires, not what looks tidy — and the slash is now what a colon
	 * already was.
	 *
	 * The value field's alone, in both modes: where the ceiling is the
	 * record's there is a field after the slash to type it in, and where it is
	 * the layout's there is nothing to type at all, so neither is told to go
	 * anywhere in particular. The ceiling field takes `refuseCeiling` below,
	 * since a slash after the first is division there.
	 */
	const refuseNumber = (text: string): string | null => {
		const link = refusal(text);
		if (link !== null) return link;
		if (!text.includes('/')) return null;
		return `Not saved. A slash separates a value from the maximum it is read against, so "${text}" would be stored as two numbers rather than one. Type just the number here.`;
	};

	/**
	 * Why a record's own ceiling cannot be stored, or null: a link, and nothing
	 * else (`docs/features/record-ceiling-formula.md`).
	 *
	 * **The slash is lifted here and kept on the value.** The entry splits at
	 * its *first* slash, so a slash after it is the ceiling's own: `level / 2`
	 * is division, and `Uses: 1 / level / 2` reads back as the value 1 against
	 * the ceiling `level / 2`. The value half can still hold none, which is why
	 * `refuseNumber` keeps it. A parse problem is not refused either: it is
	 * stored as typed and the line under the record says what is wrong, since a
	 * refusal would keep the reader's words only until the next render.
	 */
	const refuseCeiling = (text: string): string | null => refusal(text);
	return { refuseLink, refusal, refuseNumber, refuseCeiling };
}

/**
 * Draw or clear one standing refusal under a record, and say it.
 *
 * **A closure per message rather than a function taking one**, because what has
 * to be remembered is *which* element to remove — so a message about a record's
 * value is not cleared by a commit on the ceiling beside it, and the modifier
 * field's is not cleared by the body's. The host element is a parameter because
 * it differs: a field's message hangs on the record, the body's under its row.
 */
export function recordRefusalNotice(
	host: Pick<RecordHost, 'status'>,
	into: HTMLElement,
): (message: string | null) => void {
	let notice: HTMLElement | null = null;
	return (message) => {
		notice?.remove();
		notice = null;
		if (message === null) return;
		notice = element('div', 'sheetsmith-error', into, message);
		host.status.textContent = message;
	};
}

/**
 * The record's name: a field over a rendered layer in one grid cell, which
 * is `docs/UI.md` §9's stacked arrangement. Editing shows the raw
 * `[[Sunblade|sword]]`, exactly as a cell does.
 *
 * A record whose fence will not read gets the display alone. Its bytes have
 * to survive and every write into it is refused at the file boundary, so a
 * field there would be a gesture that does nothing.
 *
 * **`readOnly` asks for that same display where the record reads**, for a face
 * that reads a record rather than edits it (a companion Stat block at rest,
 * `docs/features/stat-block-companion-face.md`). It is the plain branch, not a
 * second painter, so a read name and a broken one are one DOM.
 */
export function drawRecordName(
	into: HTMLElement,
	host: RecordHost,
	record: Pick<RecordEntry, 'name' | 'error'>,
	named: string,
	/** A name that is not blank; a blank one puts the stored name back here. */
	onCommit: (next: string) => void,
	options: { readOnly?: boolean } = {},
): HTMLInputElement | null {
	const { context, noun, status } = host;
	const cell = element('div', 'sheetsmith-record-name', into);
	if (record.error !== null || options.readOnly === true) {
		cell.classList.add('sheetsmith-record-name-plain');
		paintLinkedText(cell, record.name, {
			link: context.link,
			clipping: NAME_CLIPPING,
		});
		// The cell clips its own text, so it is what reveals it: the name is
		// the track that gives first on a fields-first line
		// (`docs/features/record-summary-fields-first.md`). A sole link's
		// anchor is bound by the painter as well, and reveals the same words.
		revealWhenTruncated(cell);
		return null;
	}
	const input = linkedNameField(cell, record.name, context);
	input.type = 'text';
	input.value = record.name;
	// The noun alone, where every other control is named for its record as
	// well: this field's *value* is the record's name, so qualifying it would
	// announce the same word twice.
	input.setAttribute('aria-label', noun);
	const handle = bindEditable(input, {
		initial: record.name,
		announceCommit: (next) => {
			status.textContent = `${noun} ${next}`;
		},
		announceRestore: (restored) => {
			status.textContent = `${noun} restored to ${restored}`;
		},
		onCommit: (next) => {
			if (next.trim() === '') {
				/*
				 * **A record needs a name, and this is where that is enforced.**
				 * `### ` with nothing after it is not a heading, so an empty name
				 * would drop the record on the next read and hand its body to the
				 * record above it — a silent deletion, which Constraint 4 refuses.
				 *
				 * **This is the repository's one refused commit that discards the
				 * draft, and it departs from `editable.ts`'s stated policy on
				 * purpose.** That binding's `refuse` keeps the draft, because a
				 * refusal that hid what the reader typed would be the silent loss
				 * it exists to stop — and this field is the case where keeping it
				 * is worse: the draft is *empty*, so keeping it leaves a blank
				 * field with a message beside it where the name that is actually
				 * stored would say more. It is also not a "do not write this" but
				 * a "put the stored one back and say so", which is why it is here
				 * rather than in `refuse` at all. Named here because
				 * `docs/PATTERNS.md` §11 held a row asking exactly that this
				 * departure be stated somewhere.
				 */
				handle.sync(record.name);
				status.textContent = keptRatherThanBlank(
					noun.toLowerCase(),
					named,
				);
				return;
			}
			onCommit(next);
		},
	});
	return input;
}

/**
 * A field over a rendered layer, where the name holds a wikilink.
 *
 * A name with no link gets the field alone — no wrapper, no layer, the same
 * DOM a forty-record list has always had.
 */
function linkedNameField(
	cell: HTMLElement,
	raw: string,
	context: Pick<RenderContext, 'link'>,
): HTMLInputElement {
	if (!hasLink(raw)) {
		const input = element('input', 'sheetsmith-record-name-input', cell);
		// The field clips with an ellipsis and holds exactly what is drawn,
		// so its `value` is the reveal. Not bound in the linked branch below:
		// there the field holds the raw `[[…]]`, and a `title` would reveal
		// the source rather than the words on screen (`docs/BACKLOG.md` § UI).
		revealWhenTruncated(input);
		return input;
	}
	const stack = element('div', 'sheetsmith-record-linked', cell);
	const input = element(
		'input',
		'sheetsmith-record-name-input',
		stack,
	);
	// This branch is the stacked one: unfocused, the field's text is
	// transparent under the link layer, and its spelling marks would not be.
	spellcheckWhileFocused(input);
	// And the name layer goes inert while the field is focused. A class
	// rather than `:has(.sheetsmith-record-name-input:focus)`.
	flagWhileFocused(stack, input, 'sheetsmith-record-name-focused');
	const layer = element('div', 'sheetsmith-record-name-layer', stack);
	paintLinkedText(layer, raw, {
		link: context.link,
		clipping: NAME_CLIPPING,
	});
	revealWhenTruncated(layer);
	return input;
}

/**
 * A record's number field: its value, and its ceiling where the layout gave it
 * one, in Pool's reading (`docs/UI.md` §9). Returns the value field and a way to
 * commit a value through the same path a typed one takes, which is what a
 * stepper beside it needs (`docs/features/character-forms.md`).
 */
export function drawRecordNumber(
	cell: HTMLElement,
	/** The record's own element, where a refused commit hangs its message. */
	row: HTMLElement,
	host: RecordHost,
	options: {
		field: RecordField;
		/** The entry as the fence holds it, value and ceiling together. */
		raw: string;
		/** The field as a reader names it. */
		name: string;
		/** The field's accessible name, qualified by its record. */
		accessible: string;
		/** Whether it is drawn where an empty value has to say it is empty. */
		body: boolean;
		/** The record's stored layer, which a formula ceiling reads. */
		scope: Record<string, FieldValue>;
	},
	commit: (next: string) => void,
): RecordNumber {
	const { context, noun, status } = host;
	const { field, raw, name, accessible, body } = options;
	const config = { id: host.id };
	const drawn = { scope: options.scope };
	const refusalNotice = (into: HTMLElement) => recordRefusalNotice(host, into);
	const { refuseNumber, refuseCeiling } = recordRefusals(host);
	const ownMax = recordsOwnMax(field);
	const entry = splitBounded(raw);
	const input = element('input', 'sheetsmith-record-input', cell);
	input.type = 'text';
	// The full keyboard, a Table number cell's own reason: a field's value
	// may be negative or a fraction, and iOS's `numeric` keypad has neither
	// a minus nor a decimal point (`docs/UI.md` §7).
	input.inputMode = 'text';
	input.value = entry.value;
	input.setAttribute('aria-label', accessible);
	/*
	 * **An empty body number says it is empty; a summary one does not need
	 * to.** On the summary line a blank value sits in a line of values, under
	 * a heading or beside its neighbours, and the slot reads as a slot. In the
	 * body a name followed by nothing reads as missing content, or as a
	 * subheading over the prose, so the field takes Pool's own `—`, the one a
	 * record-owned ceiling already shows. Body only, so the summary line — and
	 * every layout without a body field — draws exactly what it drew.
	 */
	if (body) input.placeholder = '—';
	/*
	 * **A ceiling is drawn beside the value, in Pool's own vocabulary
	 * rather than a second spelling of it.**
	 *
	 * `Uses 1` cannot tell a reader whether that is all of them or one of
	 * three, which undercuts the one thing a record list has that a Track
	 * or a Pool beside the list could never do: a uses counter that belongs
	 * to a record the character added. So a bounded number reads
	 * `Uses 1 / 3`.
	 *
	 * The classes are `.sheetsmith-pool-ceiling`, `-separator` and `-max`,
	 * borrowed rather than copied under a `record` name — a lookalike beside
	 * them is the drift `docs/UI.md` §9 opens by forbidding, and §9's own
	 * rule is that the name belongs to the component that is nothing but the
	 * thing (a Pool is a value over its ceiling) and everyone else wears it,
	 * exactly as this field's name already wears the card's abbreviation.
	 * One declaration is overridden in the stylesheet, the size, because a
	 * pool's ceiling qualifies a headline number and a record's qualifies a
	 * 13px one.
	 *
	 * **Which of Pool's two branches is drawn is the layout's `maxSource`.**
	 * A field-owned `max` is a literal the layout declared, so there is
	 * nothing to type into — a read-only span, no placeholder, and no
	 * `aria-label` for Pool's own reason: a bare span is `role=generic`,
	 * which prohibits naming, and what carries it to a screen reader is the
	 * announcement below ("5 of 9", which is how the slash is read aloud).
	 * A record-owned ceiling is a number the character holds, so it is a
	 * field with the same `—` placeholder Pool uses — which is also the only
	 * invitation to type — drawn on *every* record whether or not one is
	 * set, because otherwise there is nothing to type into.
	 *
	 * **`.sheetsmith-pool-max-input` is deliberately not borrowed**, and
	 * that is not a contradiction of "reuse Pool's vocabulary". That class
	 * is the *pool card's* field chrome, sized in `ch` against the card's
	 * value size with its own hover and focus. Two fields on one summary
	 * line answering a hover two different ways is exactly the defect §9's
	 * "reuse rather than a lookalike" rule exists to prevent, and here the
	 * lookalike would be the pool's treatment sitting next to the record's.
	 * So the ceiling wears the record's field chrome and the pool's
	 * *reading*: `.sheetsmith-record-input` and `.sheetsmith-pool-max`
	 * together, with one stylesheet rule putting the muted colour back and
	 * narrowing it, since a ceiling is one or two digits where a value may
	 * be three.
	 */
	/**
	 * The entry as this field last wrote it, rather than as the render read
	 * it.
	 *
	 * **Both halves rebuild the whole entry, so a snapshot is not enough.**
	 * `docs/PATTERNS.md` §7 is about reporting a delta rather than a
	 * snapshot so a commit racing a rebuild cannot write back a stale
	 * sibling — the delta *is* right here, one field of one record, and the
	 * staleness moved one level in: a write is asynchronous, so a reader who
	 * leaves the value and then the ceiling commits both out of one render,
	 * and a second commit composed from `raw` puts the first half back to
	 * what the note said before either.
	 */
	let held = raw;

	let ceilingInput: HTMLInputElement | null = null;
	/** What a formula ceiling came to, drawn over its field; null for a typed one. */
	let ceilingLayer: HTMLElement | null = null;
	/** The field's own title, and what a formula ceiling adds to it. */
	const ceilingTitle = (text: string): string => {
		const base = `Maximum ${name}, held by this ${noun.toLowerCase()}.`;
		const trimmed = text.trim();
		return trimmed === '' || typedCeiling(trimmed) !== null
			? base
			: `${base} Worked out from ${trimmed}.`;
	};
	if (ownMax || field.max !== undefined) {
		const ceiling = element(
			'span',
			'sheetsmith-pool-ceiling',
			cell,
		);
		element('span', 'sheetsmith-pool-separator', ceiling, '/');
		if (ownMax) {
			const stored = (entry.ceiling ?? '').trim();
			/*
			 * **A ceiling that is a formula is drawn as what it came to**, over
			 * the field that holds its text: `docs/UI.md` §9's stacked
			 * arrangement, which this record's name already uses for its links.
			 * Unfocused the layer shows the number and the field's own text is
			 * transparent under it; focused the layer goes inert and the reader
			 * edits `prof`, not 3. The layer takes no press — one short line,
			 * so a press lands the caret in the field, as a table cell's does.
			 *
			 * **A typed number, or nothing, gets no stack at all**: the field
			 * alone, the DOM it has always had, which is what makes "a typed
			 * number reads exactly as before" true by construction.
			 */
			const worked =
				stored !== '' && typedCeiling(stored) === null
					? element('span', 'sheetsmith-record-worked-out', ceiling)
					: null;
			// `maxInput`, which is Pool's own name for the same control — and
			// deliberately not `held`, which is the mutable entry above and the
			// state every commit on this line composes from.
			const maxInput = element(
				'input',
				'sheetsmith-record-input sheetsmith-pool-max',
				worked ?? ceiling,
			);
			maxInput.type = 'text';
			/*
			 * **Text, always**, where this was `numeric`: a phone's numeric
			 * keypad has no letters, so `prof` could not be typed there. A
			 * keypad that switched on what the field holds would be stuck on
			 * the keypad from an empty or numeric ceiling, the one state from
			 * which a formula is typed (`docs/features/record-ceiling-formula.md`).
			 */
			maxInput.inputMode = 'text';
			maxInput.value = entry.ceiling ?? '';
			maxInput.placeholder = '—';
			// **The one thing the field gains that the span could not have.** A
			// bare span prohibits naming, so the read-only ceiling reaches a
			// screen reader only through the field's announcement; an input is
			// nameable, and both channels are kept rather than traded.
			maxInput.setAttribute(
				'aria-label',
				`${accessible} maximum`,
			);
			maxInput.title = ceilingTitle(stored);
			if (worked !== null) {
				// A formula is not prose: a squiggle under `prof` is noise, and
				// under transparent text it would show through the layer.
				maxInput.spellcheck = false;
				flagWhileFocused(
					worked,
					maxInput,
					'sheetsmith-record-worked-out-focused',
				);
				ceilingLayer = element(
					'span',
					'sheetsmith-pool-max sheetsmith-record-worked-out-layer',
					worked,
				);
			}
			ceilingInput = maxInput;
			context.suggestFormula?.(maxInput, config.id);
		} else {
			element(
				'span',
				'sheetsmith-pool-max',
				ceiling,
				String(field.max),
			);
		}
	}

	const readers: CeilingReaders = {
		resolveExpression: context.resolveExpression,
		explainExpression: context.explainExpression,
	};
	/**
	 * The ceiling the value is read against as it stands — the *draft* where
	 * one is being typed, which is Pool's own rule: what the value is
	 * announced against and held to is what the reader can see. Worked out
	 * in the record's stored layer, the scope `visibleWhen` reads.
	 *
	 * **This says which text; `ceilingOf` says what it is worth**, and every
	 * channel on this line goes through both. The announcement used to take
	 * the raw text where the clamp parsed it, so a record storing
	 * `Uses: 2 / lots` clamped to nothing and *still* announced "Uses 40 of
	 * lots". The one channel that was wrong is the only one a reader who
	 * cannot see the field has.
	 */
	const ceilingNow = (): Ceiling =>
		ownMax
			? ceilingOf(ceilingInput?.value ?? '', field, drawn.scope, readers)
			: field.max === undefined
				? null
				: typedCeiling(String(field.max));
	/** "of 3", or nothing at all where this record has no ceiling it can read. */
	const said = (): string => {
		const ceiling = ceilingNumber(ceilingNow());
		return ceiling === null ? '' : ` of ${ceiling}`;
	};
	/** The bounds the value is held to, against that same standing ceiling. */
	const valueBounds = (): TypedField =>
		ownMax ? fieldBounds(field, ceilingNow()) : field;

	/**
	 * The ceiling's reading and its problem line, from the field's text as it
	 * stands: at the draw, so a hand-edited or renamed ceiling says so on
	 * first paint, and after a commit, so the line answers before the rebuild
	 * (PATTERNS §5's optimistic paint).
	 *
	 * **Its own line, not the refusal's**, so a refused link on the value
	 * beside it does not clear it, and two failing fields draw two. Hung on
	 * the record, where a refusal hangs, because the summary line has nowhere
	 * to put a sentence.
	 *
	 * **Drawn whether or not the field's condition shows it.** A reset never
	 * reads visibility, so it skips and counts a hidden field whose ceiling
	 * will not work out exactly as a shown one, and the confirmation's "1
	 * feature skipped" has to name a record the reader can find. The line is
	 * the only place on the sheet that says which.
	 */
	let ceilingLine: HTMLElement | null = null;
	const paintCeiling = (): void => {
		if (!ownMax || ceilingInput === null) return;
		const ceiling = ceilingNow();
		const problem = ceilingProblem(ceiling);
		if (ceilingLayer !== null) {
			const blank = ceilingInput.value.trim() === '';
			// Blank shows the field's own `—` placeholder through the layer.
			ceilingLayer.textContent = blank
				? ''
				: formatDerived(ceilingNumber(ceiling), false);
			ceilingLayer.classList.toggle(
				'sheetsmith-pool-max-unresolved',
				problem !== null,
			);
		}
		ceilingInput.title = ceilingTitle(ceilingInput.value);
		ceilingLine?.remove();
		ceilingLine = null;
		if (problem === null) return;
		ceilingLine = element(
			'div',
			'sheetsmith-error',
			row,
			`${name} maximum could not be worked out: ${problem} Change it after the slash, or clear it.`,
		);
	};
	paintCeiling();

	const showValueRefusal = refusalNotice(row);
	/** The value half's commit, once the binding has refused or passed it. */
	const commitValue = (next: string): void => {
		const settled = boundedText(next, valueBounds());
		if (settled !== next) {
			input.value = settled;
			status.textContent = `${accessible} held to ${settled}${said()}`;
		}
		held = withValue(held, settled);
		commit(held);
	};
	const valueHandle = bindEditable(input, {
		initial: entry.value,
		step: true,
		min: field.min,
		/*
		 * **Read on every step rather than captured at bind**, because the
		 * ceiling can move under this field while every other channel here
		 * already follows it. `clamp` reads these off the options object each
		 * time it runs, so a getter is all it takes.
		 *
		 * **Two states make the difference reachable, and neither is "a
		 * ceiling raised but not yet left".** That one cannot happen: the
		 * arrows need focus in *this* field, and moving focus here blurs the
		 * ceiling, which commits it. What is reachable is (1) a ceiling draft
		 * holding a note reference, which the refusal above *keeps* by design,
		 * so it is on screen while `valueBounds` correctly reads it as no
		 * ceiling; and (2) the moment after any ceiling commit, because the
		 * commit is reported synchronously and the write is not — until the
		 * rebuild lands, the ceiling on screen is the new one and a captured
		 * bound is the old one. That second window is the same one `held`
		 * above exists for.
		 */
		get max() {
			return ceilingNumber(ceilingNow()) ?? undefined;
		},
		announceCommit: (next) => {
			status.textContent =
				next === ''
					? `${accessible} cleared`
					: `${accessible} ${next}${said()}`;
		},
		announceRestore: (restored) => {
			status.textContent =
				restored === ''
					? `${accessible} restored to empty`
					: `${accessible} restored to ${restored}${said()}`;
		},
		refuse: refuseNumber,
		onRefusal: showValueRefusal,
		onCommit: commitValue,
	});

	if (ceilingInput !== null) bindCeiling(ceilingInput);
	return {
		input,
		set: (next) => valueHandle.set(next),
		ceiling: () => ceilingNumber(ceilingNow()),
	};

	function bindCeiling(ceilingInput: HTMLInputElement): void {
		const ceilingName = `${accessible} maximum`;
		const showCeilingRefusal = refusalNotice(row);
		bindEditable(ceilingInput, {
			initial: entry.ceiling ?? '',
			step: true,
			// **Held to the field's `min` and to nothing else.** A ceiling under
			// the floor describes a range no value can occupy, and the value
			// beside it is already clamped to that same floor — one line must not
			// hold a floor the value obeys and the ceiling contradicts. There is
			// no upper bound on a ceiling to hold it to.
			min: field.min,
			// **No arithmetic settles**, and this is a departure from Pool stated
			// rather than hidden: a record's *value* field does not settle `31+7`,
			// so turning a ceiling's `prof + 1` into a number at the commit would
			// put two commit rules on one line. An expression is stored as typed
			// and worked out on every read instead, which is the value field's
			// own rule: store what was typed. Arrow keys step a typed number and
			// leave an expression alone, `editable.ts`'s rule for text.
			announceCommit: (next) => {
				// A formula that will not work out is stored as typed — the note is
				// where the reader's words belong — and the commit says what is
				// wrong with it, which the line under the record then shows.
				const unread =
					ceilingProblem(ceilingOf(next, field, drawn.scope, readers)) !== null;
				status.textContent =
					next === ''
						? `${ceilingName} cleared`
						: `${ceilingName} ${next}${unread ? ', which could not be worked out' : ''}`;
			},
			announceRestore: (restored) => {
				status.textContent =
					restored === ''
						? `${ceilingName} restored to empty`
						: `${ceilingName} restored to ${restored}`;
			},
			refuse: refuseCeiling,
			onRefusal: showCeilingRefusal,
			onCommit: (next) => {
				const settled = boundedText(next, {
					type: 'number',
					min: field.min,
				});
				if (settled !== next) {
					ceilingInput.value = settled;
					status.textContent = `${ceilingName} held to ${settled}`;
				}
				// **Only the ceiling.** Lowering one under the value does not
				// rewrite the value: `5 / 3` is drawn as it is stored, which is the
				// standing rule to render rather than correct — the alternative is
				// a write the reader did not ask for on the press of another field.
				// And clearing it drops the separator with it, so the entry goes
				// back to a bare number rather than to `2 /`.
				held = withCeiling(held, settled);
				paintCeiling();
				commit(held);
			},
		});
	}
}

/**
 * The modifier field: one glyph per record, opening the shared form.
 *
 * `ui/anchored-panel.ts` and `components/modifier-form.ts` are reused whole
 * — the form takes its label, parts, outcomes, definitions, targets and
 * bonus types as arguments, so it knows nothing about a table and nothing
 * about a record. That is the claim its own header makes about knowing the
 * shape of a modifier and none of its meaning, tested by a second consumer.
 */
export function drawRecordModifier(
	cell: HTMLElement,
	/** The record's own element, where a refused commit hangs its message. */
	recordEl: HTMLElement,
	host: RecordHost,
	options: {
		/** The field's stored text, as the fence holds it. */
		raw: string;
		/** The record as a reader names it. */
		named: string;
		/** The field as a reader names it. */
		fieldName: string;
		/** Which panel is this one, across a rebuild. */
		panelKey: string;
		/** The record's own scope, built only where an outcome is asked for. */
		values: () => RowValues;
	},
	commit: (next: string) => void,
): void {
	const { context, status } = host;
	const { raw, named, panelKey } = options;
	const doc = cell.ownerDocument;
	const refusalNotice = (into: HTMLElement) => recordRefusalNotice(host, into);
	const { refuseLink, refusal } = recordRefusals(host);
	const button = element(
		'button',
		'sheetsmith-record-modifier',
		cell,
	);
	button.type = 'button';
	const glyph = element(
		'span',
		'sheetsmith-record-modifier-glyph',
		button,
	);
	glyph.setAttribute('aria-hidden', 'true');

	// The stored list is what the form addresses, so every index is an index
	// into the note; the collapsed list is what the record is *doing*, so the
	// glyph and its count agree with the arithmetic.
	const stored = storedParts(raw);
	const enrolled = cellParts(raw);
	/** Built once per record, however many parts the field holds. */
	let values: RowValues | null = null;
	const ask = (part: string) =>
		context.modifiers?.outcomes(
			part,
			(values ??= options.values()),
			host.source,
		) ?? [];
	const applied = rowModifiers(enrolled, ask);
	// Through the shared predicate: see `modifier-breakdown.ts` for why one
	// name rather than four copies.
	const applyingParts = applied.filter((one) =>
		applying(one.outcomes),
	).length;
	if (enrolled.length === 0) {
		cell.classList.add('sheetsmith-record-modifier-empty');
	}
	// Three shapes for four states, because docs/UI.md §6 refuses a mark
	// whose only channel is fill strength: a faint `plus` on an empty field,
	// `zap` where any part applies, `zap-off` where none does.
	setIcon(
		glyph,
		enrolled.length === 0
			? 'plus'
			: applyingParts > 0
				? 'zap'
				: 'zap-off',
	);
	button.setAttribute(
		'aria-label',
		modifierRowName(`${named} ${options.fieldName}`, applied),
	);
	const said = modifierRowText(applied);
	if (said !== null) button.setAttribute('title', said);
	button.setAttribute('aria-haspopup', 'dialog');
	button.setAttribute('aria-expanded', 'false');

	/** What identifies this panel across a rebuild of the list. */

	/** The standing refusal, drawn under the record and cleared when it lifts. */
	const showRefusal = refusalNotice(recordEl);

	/**
	 * Commit the cell, unless a part of it holds a note reference.
	 *
	 * **A `modifier` field's part is free text on three routes**: the shared
	 * form's **Amount** and **Only when** inputs, and a promoted
	 * definition's name, whose only refusals are a semicolon and an
	 * assignment shape. So `armour_class += [[Ring]]` was an acceptable
	 * part, and the record's fence is where it landed. `refuseLink`
	 * above holds the sentence and the argument.
	 */
	const commitParts = (parts: readonly string[]): void => {
		/*
		 * **The part being *written*, which is the part that is not already
		 * stored.** The form hands back the whole list with one entry changed,
		 * so "the part being written" is the one this cell does not already
		 * hold — and a part identical to a stored one is carried, byte for
		 * byte, exactly as `spellParts`' own contract promises.
		 *
		 * Tested over the joined cell, or over every part, a record whose note
		 * already reads `Modifiers: armour_class += 1; [[Ring]]` — reachable by
		 * hand, which §10 requires be carried — refused *every* commit from the
		 * form, including edits to the other part, whose only way out was
		 * deleting the link. That is this refusal's own "rendered and carried
		 * rather than corrected" claim broken by the refusal: rendering a state
		 * is not carrying it if nothing else on the record can be edited.
		 */
		const held = new Set(stored);
		const offending = parts.find(
			(part) => !held.has(part) && refuseLink(part) !== null,
		);
		const said =
			offending === undefined ? null : refusal(offending);
		// Called on every attempt including the ones that succeed, so the last
		// message clears without this tracking when to.
		showRefusal(said);
		if (said !== null) return;
		commit(spellParts(parts));
	};

	const fill = (panel: AnchoredPanel<ModifierFormState>): void => {
		renderModifierForm(panel.body, panel.state, {
			label: named,
			// The stored list, never the collapsed one: the form's indices are
			// indices into the note.
			parts: stored,
			outcomes: ask,
			definitions: context.modifiers?.definitions ?? [],
			targets: context.modifiers?.targets ?? [],
			published: context.modifiers?.published ?? [],
			noteTargets: context.modifiers?.noteTargets ?? [],
			states: context.modifiers?.states ?? [],
			buffers: context.modifiers?.buffers ?? [],
			choices: context.modifiers?.choices ?? [],
			bonusTypes: context.modifiers?.bonusTypes ?? [],
			// The one import from `obsidian` in this folder, passed on rather
			// than taken again: the allowlist stays one name long.
			icon: (into, name) => setIcon(into, name),
			onCommit: commitParts,
			/*
			 * **Refused here, before the layout is written**, which is where
			 * the ordering had it wrong: the form checks `unspellableName`,
			 * which refuses only a semicolon and an assignment shape, then
			 * awaits this — so a `[[…]]` name reached the layout file, the
			 * reader was told "Saved" and *then* the cell rewrite was declined
			 * on the same name. The layout kept a definition it should never
			 * have gained. A wrapper rather than a rule inside
			 * `unspellableName`, because that predicate is Table's too and a
			 * link in a *markdown cell* is a working link — this refusal is
			 * about the fence, which is a fenced record's alone.
			 */
			onPromote: (name, effect) => {
				const refused = refuseLink(name);
				if (refused !== null) {
					// Returned rather than announced, so the form draws it in its
					// own problem line, beside the field the name is typed in.
					return Promise.resolve({ error: refused });
				}
				return (
					context.modifiers?.promote(name, effect) ??
					Promise.resolve({
						error: 'This sheet cannot save a modifier to its layout.',
					})
				);
			},
			announce: (text) => {
				status.textContent = text;
			},
			onResize: () => panel.place(),
		});
		panel.place();
	};

	// The panel stays open across every commit: a commit re-renders the
	// sheet, so this button is a *new* button and the panel — which lives on
	// `document.body` — is handed to it with the reader's own posture intact.
	//
	// **Held in a `let` rather than read once**, because the panel this
	// render is handed and the panel this press opens are the same object to
	// the reader and two different values here: without it, a second press on
	// a glyph opened in *this* render would find a null handle and close
	// nothing, which is a control carrying `aria-expanded` that only answers
	// the attribute after a commit has rebuilt it.
	let standing = reanchorAnchoredPanel<ModifierFormState>(
		panelKey,
		button,
	);
	if (standing !== null) {
		button.setAttribute('aria-expanded', 'true');
		fill(standing);
	}

	button.addEventListener('click', () => {
		if (openAnchoredPanelKey() === panelKey) {
			// A second press on the same glyph closes it, which is what a
			// control carrying `aria-expanded` owes.
			standing?.close();
			return;
		}
		const panel = showAnchoredPanel<ModifierFormState>(
			button,
			`Modifiers on "${named}"`,
			panelKey,
			modifierFormState(stored),
			() => {
				button.setAttribute('aria-expanded', 'false');
			},
		);
		standing = panel;
		button.setAttribute('aria-expanded', 'true');
		fill(panel);
		// Focus moves to the first control on open, which is the platform's
		// own contract for a dialog — unless the form has already placed it,
		// which it does on a record with no parts.
		if (!panel.body.contains(doc.activeElement))
			focusFirstControl(panel);
	});
}

/**
 * The record's prose, on Rich text's box gesture and its three stated
 * departures: the rendered layer is hidden rather than left transparent,
 * the caret is not placed from the click, and the two layers scroll
 * separately.
 *
 * The one thing that differs is the box: Rich text's is the placement and
 * this one is as tall as its prose, which is not a violation of "never
 * sized by its content" — that rule is about the *component's* box, and
 * this sits inside the scrollport.
 */
export function drawRecordBody(
	into: HTMLElement,
	/** The record's own element, where a refused commit hangs its message. */
	row: HTMLElement,
	host: RecordHost,
	options: {
		/** The prose, with the record's own framing removed. */
		text: string;
		/** Why the record's fence will not read, which draws the prose alone. */
		error: string | null;
		/** The record as a reader names it. */
		named: string;
		/** The field's accessible name, where it is not the record's whole body. */
		label?: string;
		/** What the empty field says, where it is not the record's whole body. */
		placeholder?: string;
		/**
		 * A refusal of the caller's own, asked after the two reserved line
		 * starts: a Stat block zone's heading guards (`stat-block-zones.ts`).
		 */
		refuse?: (next: string) => string | null;
		/**
		 * The heading a refused `## ` or `### ` line is advised to become,
		 * where `#### ` is not one the caller takes: a Stat block features
		 * entry or lead refuses every `####` line, so advising one there
		 * would earn a second refusal (`stat-block-zones.ts`). The marker
		 * rather than the clause, so the sentence stays one template here.
		 */
		subheading?: string;
	},
	onCommit: (next: string) => void,
): void {
	const { context, noun, status } = host;
	const { named } = options;
	const doc = into.ownerDocument;
	const record = options;
	const paintProse = (shown: HTMLElement, prose: string): void =>
		paintRecordProse(shown, prose, context);
	const refusalNotice = (within: HTMLElement) => recordRefusalNotice(host, within);
	const { text } = options;
	if (record.error !== null) {
		// A record whose fence will not read still shows what it holds, and
		// shows it read-only: every write into it is refused at the file
		// boundary, so a field would be a gesture that does nothing.
		const shown = element(
			'div',
			'sheetsmith-record-body-rendered',
			into,
		);
		paintProse(shown, text);
		return;
	}

	const input = element(
		'textarea',
		'sheetsmith-record-body-input',
		into,
	);
	input.value = text;
	// The start, chosen, rather than the end, inherited: assigning `value`
	// moves the cursor to the end of the control and focusing scrolls it into
	// view, which is the one position in the text nobody asked for.
	input.setSelectionRange(0, 0);
	input.placeholder = options.placeholder ?? `Write anything about this ${noun.toLowerCase()}.`;
	input.setAttribute('aria-label', options.label ?? `${named} body`);
	// Its text is transparent unfocused and the prose is drawn over it, so
	// its squiggles would be too.
	spellcheckWhileFocused(input);
	// And the rendered prose hides while the field is focused. A class rather
	// than `:has(.sheetsmith-record-body-input:focus)`. Flagged on `into`,
	// which is what holds the rendered layer below, so the pair cannot be
	// separated by a wrapper appearing between them.
	flagWhileFocused(
		into,
		input,
		'sheetsmith-record-body-field-focused',
	);

	const rendered = element(
		'div',
		'sheetsmith-record-body-rendered',
		into,
	);
	// The links the app draws, given this plugin's behaviour. Bound to the
	// layer once, before anything is painted into it: the fallback painter
	// wires each anchor as it makes it, and the app's renderer makes its own.
	adoptRenderedLinks(rendered, context.link);
	if (text !== '') {
		if (context.renderMarkdown !== undefined) {
			// And the fallback again where the app's renderer rejected, which is
			// not something the reader caused or can fix.
			context.renderMarkdown(text, rendered, () =>
				paintProse(rendered, text),
			);
		} else {
			paintProse(rendered, text);
		}
	}

	// The layer is the pointer target rather than `pointer-events: none`,
	// because it is what scrolls: a layer that is not a hit target never
	// receives a wheel, and the gesture would go to the invisible field
	// behind it. A link owns its own press, as everywhere else on the sheet.
	rendered.addEventListener('click', (event) => {
		const target = event.target;
		if (target instanceof HTMLElement && target.closest('a[href]'))
			return;
		event.preventDefault();
		// A drag that selected text is not a request to edit.
		const selection = doc.getSelection();
		if (selection !== null && !selection.isCollapsed) return;
		input.focus();
	});

	/** The standing refusal, drawn under the body and cleared when it lifts. */
	const showRefusal = refusalNotice(row);

	bindMultiline(input, {
		initial: text,
		/*
		 * The two reserved line starts, and both are the note format's rather
		 * than either component's taste: `## ` splits the *note* and `### `
		 * splits the *record*. Neither is escaped and neither fails `read` —
		 * the write is declined instead, the field keeps the draft, and the
		 * message names the line and the fix.
		 */
		refuse: (next) => {
			const subheading = options.subheading ?? '#### ';
			const section = startsSection(next);
			if (section !== null) {
				return `Not saved. "${section.trim()}" would start a new section in this note — use "${subheading}" instead.`;
			}
			const record = startsRecord(next);
			if (record !== null) {
				return `Not saved. "${record.trim()}" would start a new ${noun.toLowerCase()} in this list — use "${subheading}" instead.`;
			}
			return options.refuse?.(next) ?? null;
		},
		/*
		 * **The draft is shown, not hidden, for as long as it is refused.**
		 * Unfocused, this field's text is transparent under the rendered
		 * layer, so a refusal left alone would put the *stored* prose back on
		 * screen with an error under it and the reader's actual words
		 * invisible. The class swaps that round, as Rich text's does.
		 */
		onRefusal: (message) => {
			into.classList.toggle(
				'sheetsmith-record-body-refused',
				message !== null,
			);
			// Under the body rather than inside it: the body is a two-layer
			// stack in one grid cell, so a third child there would sit on top
			// of the prose the message is about — which is why the host is the
			// shared helper's parameter rather than its own rule.
			showRefusal(message);
		},
		// The label and the outcome, never the prose: reading a record's text
		// back at its author is not feedback.
		announceCommit: (next) => {
			status.textContent =
				next === '' ? `${named} cleared` : `${named} saved`;
		},
		announceRestore: () => {
			status.textContent = `${named} restored`;
		},
		onCommit: (next) => {
			onCommit(next);
		},
	});
}
