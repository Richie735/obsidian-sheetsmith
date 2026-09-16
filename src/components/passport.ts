/*
 * Passport — who the character is, as one face (SPEC §4.2). The character's
 * name, an optional picture, and a short line of identity values: a 5e class,
 * species and level; a Blades playbook, heritage and background; a Keeper's
 * occupation, age and residence. It is the one block on a sheet that says *who*
 * rather than *how much*.
 *
 * **It is not a Group holding an Image and a row of Cards**, which is the
 * arrangement it replaces and the first thing a reader will want to collapse it
 * back into. **The argument used to have a knockout and now it is cumulative**,
 * which is worth knowing before the next component is argued in on these grounds:
 *
 * 1. ~~No component can draw the character's name.~~ **Gone, on the owner's
 *    decision.** The name was the note's *filename*, reached through a context
 *    member; it is an entry in this component's own fence now, because a note
 *    called `Thora.md` holds a character called *Thora Ironhelm of Mirabar* and a
 *    filename and a name are two different things. So an arrangement of a Group,
 *    an Image and some Cards *can* reach every value a passport holds, and this
 *    count is false rather than weakened.
 * 2. **Every Card wears a label above its value.** That is the right contract for
 *    "Armour class 18" and the wrong one for a face whose whole point is that the
 *    values read as one line about a person — and `hideLabel` does not make a
 *    card into a chip: it leaves an unlabelled box wearing the card's own surface,
 *    padding and border. Six of them is six surfaces where a passport is one.
 * 3. **It is six components**, and SPEC §4.2 rules that out of the palette in so
 *    many words: a job needing two components has nothing for one entry to be.
 *    **This is the count that carries it now** — the alternative is not a palette
 *    entry anybody could write, it is an arrangement, and the vault fixture
 *    already demonstrated what that arrangement reads as: six labelled boxes
 *    saying "CLASS Bard".
 *
 * What this component *is*, in one sentence for SPEC §12's test: it composes
 * three ranks on one card surface — a value at headline size, a picture beside
 * it, and the rest as a line of tags. That is a claim about composition where
 * Record set's was a claim about capability, which is the weaker of the two and
 * is said out loud in `docs/features/passport.md` rather than smoothed over.
 *
 * **It is not a Card set with a photo slot either.** A Card set is a strip of
 * equal tiles under one heading sharing one `derived`, each entry's key drawn as
 * its abbreviation. A passport's values are unequal in weight, carry no
 * arithmetic, and read as a line rather than a strip; its picture has no key; and
 * its name is not stored at all. Giving Card set a photo slot, a name slot,
 * unlabelled rendering and a line layout is a different component wearing Card
 * set's name (SPEC §2's naming rule).
 *
 * **Its small line is rendering, not concatenation.** "Half-elf · Bard · 5" looks
 * like the string type SPEC §13 has an open question about, and it is not: this
 * draws three stored values side by side in the order the layout declared them.
 * No expression is evaluated and nothing is published that a formula could not
 * already read, so §5's language stays exactly as it is and nobody should reopen
 * the string question to build this.
 *
 * **The section holds two things in a fixed relationship**, and each half follows
 * the rule of the component that owns that kind of value:
 *
 *     ## Passport
 *
 *     ![[Thora.png]]
 *
 *     ```sheet
 *     class: Bard
 *     species: Half-elf
 *     level: 5
 *     ```
 *
 * The fields are scalars the way a Card's value is, so they live in a fence and
 * `readFenced`/`writeFenced` give them Constraint 3 for free. The picture is an
 * embed, and **Constraint 2 forbids it from the fence**: a `![[Thora.png]]` inside
 * `sheet` would break rename propagation, backlinks and graph view silently, which
 * is the whole of why Image moved to markdown storage. So it is a line of plain
 * markdown in the section, exactly as Image stores it, and it inherits Image's
 * acceptance rule through `embed-rule.ts` rather than through a second copy.
 *
 * **The two lines are found, not positioned.** Whichever order the hand that wrote
 * the note put them in, a write puts each back where it found it, and everything
 * else in the section — prose before, between or after — is preserved untouched
 * and never drawn (SPEC §10). Record set is the precedent for a section combining
 * storage rules; this is two of its three.
 *
 * **The name is read-only, on purpose.** Renaming a character is renaming a file,
 * which is a vault operation with rename propagation, backlinks and a modal of its
 * own, and none of it is reachable from a component. A press on the name does
 * nothing; the `title` is what that decision owes a reader who tries.
 *
 * **It publishes one name per declared field and no bare `<id>`.** A passport is
 * not one value, and `ScopeValues.self` is optional for exactly this case.
 */

import { setIcon } from 'obsidian';
import { ArmRegister, armRegister, bindArmToConfirm } from '../interaction/arm-to-confirm';
import { bindEditable } from '../interaction/editable';
import {
	fenceLines,
	fencedKeyProblem,
	readFenced,
	writeFenced,
} from '../parse/fenced';
import { joinParts, listParts } from '../parse/list-value';
import { lineText, splitLines } from '../parse/lines';
import {
	ComponentConfig,
	ComponentDefinition,
	ReadResult,
	RenderContext,
	ScopeEntry,
	ScopeValues,
	showsOwnLabel,
} from '../types';
import { revealWhenTruncated } from '../ui/truncation';
import { embedRefusal } from './embed-rule';
import { fencedLinkRefusal } from './fenced-link';
import { renderPictureFrame } from './picture-frame';

/**
 * What the name slot reads while nothing is stored in it.
 *
 * PATTERNS §4's editable empty card, at the headline rank rather than a rank
 * down: a Card's empty value is an em dash at the card's own size, faint, and
 * `docs/UI.md` §9 cites that dash as the model.
 */
const NAME_PLACEHOLDER = 'Character name';

/**
 * Where the character's name lives in the fence, unless the layout says otherwise.
 *
 * **`name`, and it is file vocabulary rather than display vocabulary**
 * (PATTERNS §7): it names the entry so hand editing reads well —
 *
 *     name: Thora Ironhelm of Mirabar
 *     class: Bard
 *
 * — and it never appears on the face. A formula references `<id>.<key>`, exactly
 * as a declared field's does.
 */
const DEFAULT_NAME_KEY = 'name';

/**
 * Why a commit into the fence cannot be stored, or null where it can.
 *
 * **Constraint 2 on the write side, and it is a runtime refusal rather than a
 * feature this component declines.** The name and the values all live in a
 * `sheet` fence, and Obsidian indexes no link inside one — so a `[[Bard]]`
 * committed into any of them would be written into the note looking like a link
 * and behaving like none of one, with rename propagation silently gone. Record
 * set refuses exactly this at exactly this point and the sentence is shared with
 * it (`fenced-link.ts`); what differs is the advice, because a record has a name
 * and a body to move a link into and a passport has neither.
 *
 * A note that *already* holds one is untouched: `read` never fails for it and
 * `write` never rewrites an entry the reader did not commit, so a hand-edited
 * link is rendered and carried under SPEC §10.
 *
 * **Module scope because the name takes it too**, which is what the name becoming
 * a stored value bought: it is one entry in the same fence as the values, so it is
 * refused by the same sentence rather than by a filesystem's rules.
 */
function refuseFencedLink(next: string): string | null {
	return fencedLinkRefusal(next, {
		subject: "A passport's values",
		instead:
			'Type the plain word here, and put the link in a Rich text block or a table cell, which store markdown.',
	});
}

/**
 * What a line has to look like to be the picture rather than prose.
 *
 * **Deliberately looser than `parseEmbed`, and that is what makes the refusal
 * reachable.** Image's rule is that a body it cannot *use* is still a body it can
 * *hold*, because the field that fixes a refused value has to still be on screen
 * — so a hand-edited `![](https://example.com/p.png)` has to be *found* before it
 * can be refused in `render`. Matching only what `parseEmbed` accepts would leave
 * that line unread, drawn as nothing, and unfixable.
 *
 * It is also what keeps prose out of the picture slot. A section may hold a
 * sentence before or after either line, and those are preserved and never drawn
 * (SPEC §10) — so "the first non-blank line" cannot be the rule, and "starts an
 * image" can.
 */
const EMBED_LIKE = /^!\[/;

/**
 * The narrowest a field's box may be, in characters.
 *
 * **One, which is to say no floor at all, and that is a correction.** It was four,
 * on the argument that a one-character box in a line of words reads as damage —
 * and a design review measured what four actually costs: `5` is one character in
 * a 40px box, so 13.5px of dead box sits either side of the digit against 3px
 * either side of `Bard`, and the middle dots then sit visibly closer to one
 * neighbour than the other. The floor *was* the uneven reading.
 *
 * A value shorter than its own placeholder is not reached by this either: an
 * empty field is sized by the placeholder, which is the layout's word for the
 * field and is never one character in practice.
 *
 * **What the floor was accidentally paying for is the pointer target**, and that
 * is now paid where it belongs — the fields line routes a press to the nearest
 * field, so every pixel of the line belongs to one and no box has to be wide
 * enough to be hit on its own. See `drawFields`.
 */
const MIN_FIELD_WIDTH = 1;

export interface PassportField {
	key: string;
	name?: string;
	/**
	 * This field holds several values rather than one, drawn as one chip per
	 * part and stored on one line separated by semicolons
	 * (`docs/features/passport-field-lists.md`). Absent means one value,
	 * exactly as every field read before this existed.
	 */
	list?: boolean;
}

export interface PassportConfig extends ComponentConfig {
	type: 'passport';
	/** Entry key for the character's name. Defaults to `name`. Never displayed. */
	nameKey?: string;
	fields?: PassportField[];
	hidePicture?: boolean;
	hideLabel?: boolean;
	/** How the picture fills its frame. Defaults to 'contain'. */
	fit?: 'contain' | 'cover' | 'stretch';
}

/**
 * What the section holds, as a delta rather than a snapshot (PATTERNS §7).
 *
 * Both members are optional because the two halves are siblings: an edit reports
 * only the one the reader touched, so a commit racing a rebuild cannot write back
 * a stale picture over a field edit or the other way round. On read both are
 * present wherever the note has them.
 */
export interface PassportData {
	/**
	 * The embed line exactly as written, pipe options included.
	 *
	 * The source line rather than the target, so `![[Thora.png|200x300]]` survives
	 * byte for byte: the sheet ignores the hint (SPEC §8) and markdown view goes
	 * on honouring it.
	 */
	source?: string;
	/** The fenced entries by key. A write touches only the keys it is given. */
	values?: Record<string, string>;
}

/**
 * The fields the note can actually hold, in display order.
 *
 * A key the fenced block cannot store is left out rather than drawn and lost: a
 * colon is what separates key from value in the block, so a key holding one would
 * round-trip as a different entry, and a line break would round-trip as two
 * (PATTERNS §7's "validate what the file format requires"). Skipped rather than
 * reported as a config error, on Card set's precedent for a list of keys — one
 * unusable key must not take a passport's name, picture and every other field off
 * the sheet with it.
 *
 * One helper because `sample`, `scopeValues` and `render` have to agree about it:
 * a field the sheet cannot show must not publish a name the rest of the sheet
 * would then be built on.
 */
function storableFields(config: PassportConfig): PassportField[] {
	const out: PassportField[] = [];
	// The name's entry is taken before any field, so a field declaring the same
	// key is the one that gives way: two controls writing one entry is the defect
	// the duplicate rule below already refuses, and of the two the name is the
	// slot this component is named for.
	const seen = new Set<string>([nameKey(config)]);
	for (const field of config.fields ?? []) {
		const key = (field.key ?? '').trim();
		if (key === '' || fencedKeyProblem(key) !== null) continue;
		// Two fields on one key are one entry in the note, so the second would
		// draw the first's value and overwrite it on commit.
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			key,
			...(field.name === undefined ? {} : { name: field.name }),
			...(field.list === true ? { list: true } : {}),
		});
	}
	return out;
}

/**
 * Where the name is stored, which is `name` unless the layout renamed it.
 *
 * A key the fence cannot hold falls back to the default rather than failing the
 * component, on `card.ts`'s own reasoning one step softer: a colon separates key
 * from value in the block, so a key holding one would round-trip as a different
 * entry — and a passport whose *name* could not be stored would be a face with
 * nothing on it, where falling back leaves every other part of it working.
 */
function nameKey(config: PassportConfig): string {
	const key = (config.nameKey ?? '').trim();
	return key === '' || fencedKeyProblem(key) !== null ? DEFAULT_NAME_KEY : key;
}

/**
 * The layout's word for the field, falling back to its key where there is none.
 *
 * The fallback is the whole of what this says that `name` does not: a field with
 * no word has to be called *something* by a screen reader, and the key is what
 * the note already spells it as.
 */
function fieldName(field: PassportField): string {
	const name = (field.name ?? '').trim();
	return name === '' ? field.key : name;
}

/**
 * Which line of a body is the picture's, or -1.
 *
 * Lines inside the `sheet` fence are skipped, and that is Constraint 2 read from
 * the other side: an embed written inside a fence is not indexed by Obsidian, so
 * treating one as the picture would be this component agreeing to a state the
 * constraint exists to prevent — and it would then rewrite that line on the next
 * commit. `fenceLines` is `parse/fenced.ts`', so the fence's spelling stays in one
 * place.
 */
function pictureLine(lines: readonly string[], body: string): number {
	const fence = fenceLines(body);
	for (let at = 0; at < lines.length; at++) {
		if (fence !== null && at >= fence.open && at <= fence.close) continue;
		if (EMBED_LIKE.test(lineText(lines[at] as string).trim())) return at;
	}
	return -1;
}

/**
 * Put the picture line back where it was found, or add one where there was none.
 *
 * Returns `body` **byte for byte** where the line has not changed, which is the
 * half of Constraint 3 the fence does not already give this component: the line
 * keeps its own leading whitespace and its own ending, so a hand-spaced note is
 * not reformatted on the next save of any field on it.
 *
 * A new line goes directly above the fence with one blank line between, or at the
 * end of a section that has no fence yet. An empty source removes the line
 * rather than leaving a blank one behind, because unlike Image the body here is
 * not the value and a stray line would be prose the reader did not write.
 */
function writePictureLine(body: string | null, source: string): string {
	if (body === null || body.trim() === '') {
		return source === '' ? (body ?? '') : `\n${source}\n`;
	}
	const lines = splitLines(body);
	const at = pictureLine(lines, body);
	if (at !== -1) {
		const line = lines[at] as string;
		const text = lineText(line);
		if (text.trim() === source) return body;
		if (source === '') {
			lines.splice(at, 1);
			return lines.join('');
		}
		// The line's own framing is kept and only the reference between it
		// changes, which is `parse/markdown-body.ts`'s rule applied to one line
		// rather than to a body: a hand-indented note is not reformatted, and a
		// trailing space nobody can see does not turn a save into a diff.
		const ending = line.slice(text.length);
		const lead = text.slice(0, text.length - text.trimStart().length);
		const trail = text.slice(lead.length + text.trim().length);
		lines[at] = lead + source + trail + ending;
		return lines.join('');
	}
	if (source === '') return body;
	const fence = fenceLines(body);
	const insert = fence === null ? lines.length : fence.open;
	// A body not ending in a newline would otherwise have the new line run onto
	// the end of the last one.
	const last = lines[lines.length - 1];
	if (insert === lines.length && last !== undefined && !last.endsWith('\n')) {
		lines[lines.length - 1] = `${last}\n`;
	}
	lines.splice(
		insert,
		0,
		...(insert === lines.length ? ['\n', `${source}\n`] : [`${source}\n`, '\n']),
	);
	return lines.join('');
}

/**
 * The picture, or the reason there is none, in the shared frame.
 *
 * Everything about a picture is `picture-frame.ts`', shared with Image: the
 * frame, the field stacked over it, `object-fit` through Image's own class, the
 * press that hands the field over with its text selected, and the four failure
 * states drawn *in the frame*. What is this component's is the box the frame goes
 * in — a square beside a name inside a card, where Image's is a placed box under
 * its own label — and the two decisions the painter is handed.
 */
function drawPicture(
	face: HTMLElement,
	config: PassportConfig,
	data: PassportData | null,
	context: RenderContext<PassportData>,
	status: HTMLElement,
	labelled: boolean,
): void {
	const box = face.createDiv({ cls: ['sheetsmith-placed-box', 'sheetsmith-passport-picture'] });

	renderPictureFrame(box, {
		// Image's own classes, deliberately: `object-fit`, the transparent field
		// and its focus treatment are one copy of each, and a second spelling of
		// them would be the lookalike `docs/UI.md` §9 forbids.
		classes: {
			frame: 'sheetsmith-image-frame',
			picture: 'sheetsmith-image-picture',
			field: 'sheetsmith-image-input',
		},
		source: data?.source ?? '',
		// Named for what it holds rather than for the component, because the
		// component's own label is already on three other controls in this face.
		name: `${config.label} picture`,
		// The face already carries the character's name in large type, so the
		// picture says nothing a reader has not just read.
		alt: '',
		prefix: labelled ? null : config.label,
		status,
		fit: config.fit,
		...(context.resource === undefined ? {} : { resource: context.resource }),
		...(context.suggestFile === undefined
			? {}
			: { suggestFile: context.suggestFile }),
		/*
		 * **The one refusal this component makes that Image does not, and it is
		 * about the file model rather than about pictures.** Image's whole body is
		 * its value, so any text it is handed is text it can hold. Here the picture
		 * is *one line beside a fence*, found by looking like an embed — so a draft
		 * that does not is a line the section cannot hold in a place `read` would
		 * ever look, and committing it would leave the reader's own text on screen
		 * as prose with the field empty beside it. That is precisely the lockout
		 * Image's correction exists to prevent, arrived at from the other side.
		 *
		 * `editable.ts`'s `refuse` is the hook for exactly this, and it keeps the
		 * draft, so the text stays on screen with the reason under it. The message
		 * is `embed-rule.ts`'s either way, so a reader meeting the refusal here and
		 * in an Image meets one sentence.
		 *
		 * Everything the section *can* hold is refused by the painter on Image's
		 * terms: stored, drawn, and explained in the frame.
		 */
		refuse: (next) => (EMBED_LIKE.test(next) ? null : embedRefusal(next)),
		onCommit: (next) => context.onChange({ source: next }),
	});
}

/**
 * The character's name, large, and an ordinary stored value.
 *
 * **It is an entry in the fence, not the note's filename, and that is the
 * owner's reversal of this component's own first decision.** The name began as
 * `RenderContext.noteName` — the file's basename — first read-only and then
 * editable through a rename. Both are gone, and the case that ended them is one
 * sentence: a note called `Thora.md` holds a character called *Thora Ironhelm of
 * Mirabar*, and no amount of renaming the file should be required to say so. A
 * filename and a character's name are different things.
 *
 * What that buys is everything a stored value already has. It commits through
 * `context.onChange` like every other value here, so Constraint 3 covers it for
 * free — one more entry in a fence this component already round-trips — and the
 * three branches the seam needed collapse to one, because there is no host to be
 * absent. The empty state is PATTERNS §4's editable empty card: the placeholder
 * at the headline rank, faint, which is the treatment built for an absent
 * `noteName` and is now the same rule for a new reason.
 *
 * **The refusal it keeps is the fence's, and the refusals it loses were the
 * filesystem's.** A wikilink cannot go in a `sheet` fence (Constraint 2), so the
 * name takes exactly the sentence the values take. A blank name is no longer
 * refused at all — it is an empty card — and the illegal-character check went
 * with the rename, because those characters were forbidden by *paths* and this is
 * not one.
 *
 * `ui/truncation.ts` stays on it. It was blocked by the read-only `title` and
 * that is gone; the owner's own case is a long name in a narrow card.
 */
/**
 * A commit's own refusal notice, anchored right after its own control and
 * cleared on the next attempt that succeeds.
 *
 * **Three consumers now** (`docs/PATTERNS.md` §1's third-consumer rung): the
 * name, and — since `docs/features/passport-field-lists.md`'s per-part
 * rework — each list field part's own commit and its add control's transient
 * one, each of which now owns its refusal independently rather than sharing
 * one notice for the whole fields line. `record-set.ts`'s `refusalNotice` is
 * the shape this already followed once with one consumer; this is that shape
 * named and shared rather than copied twice more.
 */
function attachRefusalNotice(
	after: HTMLElement,
	status: HTMLElement,
): (message: string | null) => void {
	let notice: HTMLElement | null = null;
	return (message: string | null): void => {
		notice?.remove();
		notice = null;
		if (message === null) return;
		// The *global* `createDiv`, which attaches to nothing: this goes *after a
		// sibling* rather than into a parent, so `after.after` below is the
		// attachment and no `parent` option could express it (`PATTERNS.md` §5).
		notice = createDiv({ cls: 'sheetsmith-error', text: message });
		after.after(notice);
		status.textContent = message;
	};
}

function drawName(
	text: HTMLElement,
	stored: string,
	refuse: (next: string) => string | null,
	onCommit: (next: string) => void,
	status: HTMLElement,
): void {
	const field = text.createEl('input');
	field.type = 'text';
	field.classList.add('sheetsmith-passport-name-input');
	field.value = stored;
	// The headline rank while it is empty too, faint — a Card's em dash at the
	// card's own size, which docs/UI.md §9 names as the model. A design review
	// measured the alternative: drawn a rank down, the smallest and faintest
	// string on the face held the *headline* slot while the values under it became
	// the headline, which is the labelled-box reading this component exists to
	// escape.
	field.placeholder = NAME_PLACEHOLDER;
	// Named for what it holds rather than for the component: "Passport" over a
	// field holding "Thora" would name the wrong thing (docs/UI.md §6).
	field.setAttribute('aria-label', 'Name');
	revealWhenTruncated(field);

	// Its own notice rather than the fields line's, because they are about
	// different controls and a message about a name must not be cleared by a
	// commit on a species.
	const showRefusal = attachRefusalNotice(field, status);

	bindEditable(field, {
		initial: stored,
		refuse,
		onRefusal: showRefusal,
		announceCommit: (next) => {
			status.textContent = next === '' ? 'Name cleared' : `Name ${next}`;
		},
		announceRestore: (restored) => {
			status.textContent =
				restored === '' ? 'Name restored to empty' : `Name restored to ${restored}`;
		},
		onCommit,
	});
}

/**
 * The identity values, as a row of controls.
 *
 * Each declared field is an `editable.ts` field on the card's own interaction
 * rules — Enter commits and moves to the next field on the face, Escape
 * restores, blur commits — drawn as a discrete tag in Obsidian's own tag
 * clothes. A field marked as a list draws several of these, one per stored
 * part, each with its own delete control (`drawListField` below).
 *
 * The surface is `sheet.css`'s and the argument for borrowing rather than
 * inventing it is there.
 */
function drawFields(
	text: HTMLElement,
	config: PassportConfig,
	data: PassportData | null,
	context: RenderContext<PassportData>,
	status: HTMLElement,
): void {
	const doc = text.ownerDocument;
	const fields = storableFields(config);
	if (fields.length === 0) return;

	const line = text.createDiv('sheetsmith-passport-fields');

	/**
	 * Which list field's part is armed, one register for the whole face
	 * rather than one per list field.
	 *
	 * `interaction/arm-to-confirm.ts`'s own rule is that this is a fact about
	 * one card rather than about the page: arming a second delete anywhere on
	 * it has to stand the first one down, exactly as Table's `armedRow` and
	 * Record set's `armedRecord` are each one register for their whole
	 * component rather than one per row. A Passport declaring two `list: true`
	 * fields — "Class" and, say, "Languages" — shares this one register
	 * between them, so arming a part's delete in one stands down an armed one
	 * in the other.
	 */
	const armedPart = armRegister();

	/**
	 * Every declared field's own current entry point, so Enter can reach it —
	 * a plain function rather than an element, because a list field's own
	 * first control changes as parts are added or removed under it (see
	 * `drawListField` below), so a static reference taken once at render
	 * would go stale the moment a reader adds a second value.
	 */
	const fieldEntry: (() => HTMLElement)[] = [];

	/**
	 * Focus a sibling field and select whatever it holds, for Enter's "done
	 * with this field, on to the next" gesture.
	 *
	 * A plain `.focus()` is enough for a list field's own entry point: it is
	 * either that field's first part, which selects its own text on focus the
	 * way every part's own `bindEditable` already does below, or its add
	 * control, which has no text to select.
	 */
	const focusAndSelect = (get: (() => HTMLElement) | undefined): void => {
		const el = get?.();
		el?.focus();
		if (el?.instanceOf(HTMLInputElement)) el.select();
	};

	/*
	 * **The line is the hit target, not the box** — PATTERNS §6's "the whole card
	 * is the hit target" read one axis over, and the thing this component was
	 * missing rather than an addition to it.
	 *
	 * A design review measured why it matters. The boxes are content-sized, so a
	 * level's is about as wide as one digit; without this the target for `5` would
	 * be 19px against `legibility.md` §5's 20pt pointer minimum and its 28pt
	 * coarse minimum, and the old four-character floor was quietly paying for that
	 * with dead box on either side of the digit. Routing the press moves the
	 * payment to where it costs the reading nothing: every pixel between two
	 * fields belongs to whichever is nearer, so the target is as large as the
	 * line allows and no two targets overlap.
	 *
	 * **Read fresh from the DOM on every press, rather than from a list built
	 * once at render.** A list field's own controls change count as parts are
	 * added and removed, so an array captured once would drift the moment a
	 * reader pressed **Add** — the exact class of staleness `docs/PATTERNS.md`
	 * §1 warns a cached reference invites. `input, button` reaches every
	 * control on the line — a scalar field's field, a list field's own part
	 * inputs and delete buttons, and its add control alike — which is what
	 * lets "a field's own cluster of controls as a whole" (`docs/features/
	 * passport-field-lists.md`) resolve to whichever one is nearest without
	 * this line needing to know a list field exists.
	 *
	 * `click` rather than `pointerdown`, and nearest by *horizontal* distance:
	 * both are `card-face.ts`'s own rules, one axis over, because a card is a
	 * column of controls and this is a row of them.
	 */
	line.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		// Real controls own their own presses (PATTERNS §6). A press that landed
		// on a control is already where it was going.
		if (target?.closest('input, button') !== null) return;
		// Never at the cost of a selection in progress: a reader dragging across
		// "Half-elf · Bard" is copying it, not asking to edit.
		const selection = doc.getSelection();
		if (selection !== null && !selection.isCollapsed) return;
		const candidates = Array.from(
			line.querySelectorAll<HTMLElement>('input, button'),
		);
		let nearest: HTMLElement | undefined = candidates[0];
		let closest = Infinity;
		for (const candidate of candidates) {
			const box = candidate.getBoundingClientRect();
			const distance = Math.abs(event.clientX - (box.left + box.width / 2));
			if (distance < closest) {
				closest = distance;
				nearest = candidate;
			}
		}
		nearest?.focus();
	});

	/**
	 * Why a commit cannot be stored, or null where it can.
	 *
	 * **Constraint 2 on the write side, and it is a runtime refusal rather than a
	 * feature this component declines.** The fields live in a `sheet` fence, and
	 * Obsidian indexes no link inside one — so a `[[Bard]]` committed here would
	 * be written into the note looking like a link and behaving like none of one,
	 * with rename propagation silently gone. Record set refuses exactly this at
	 * exactly this point and the sentence is shared with it (`fenced-link.ts`);
	 * what differs is the advice, because a record has a name and a body to move a
	 * link into and a passport has neither.
	 *
	 * A note that *already* holds one is untouched: `read` never fails for it and
	 * `write` never rewrites an entry the reader did not commit, so a hand-edited
	 * link is rendered and carried under SPEC §10. Shared by every part of a
	 * list field too (`drawListField` below), since it is the same fence taking
	 * the same values.
	 */
	const refuse = (next: string): string | null =>
		fencedLinkRefusal(next, {
			subject: 'A passport\'s values',
			instead:
				'Type the plain word here, and put the link in a Rich text block or a table cell, which store markdown.',
		});

	/**
	 * A scalar field's own refusal notice, shared for the whole line.
	 *
	 * **Unchanged from before this feature, and deliberately not the per-part
	 * mechanism below.** A list field's refusal moved to the part actually
	 * being committed (`docs/features/passport-field-lists.md`, "Wikilink
	 * refusal, now per commit rather than per field"), but a scalar field is
	 * still one field with one commit, so it keeps the one shared notice under
	 * the whole line it always had — `editable.ts` reports a cleared refusal
	 * on every commit attempt, so the next scalar field to be left clears
	 * whatever is standing.
	 */
	let notice: HTMLElement | null = null;
	const showScalarRefusal = (message: string | null): void => {
		notice?.remove();
		notice = null;
		if (message === null) return;
		notice = text.createDiv({ cls: 'sheetsmith-error', text: message });
		status.textContent = message;
	};

	fields.forEach((field, index) => {
		const name = fieldName(field);
		const stored = data?.values?.[field.key] ?? '';

		if (field.list === true) {
			fieldEntry.push(
				drawListField(
					line,
					doc,
					name,
					stored,
					refuse,
					status,
					(joined) => context.onChange({ values: { [field.key]: joined } }),
					armedPart,
				),
			);
			return;
		}

		const input = line.createEl('input');
		input.type = 'text';
		input.classList.add('sheetsmith-passport-input');
		input.value = stored;
		// The layout's word for the field, shown only while the field is empty —
		// which is what says what goes where without a label over anything.
		input.placeholder = name;
		// The one thing on screen is a value, so the name has to come from
		// somewhere: a species of "Half-elf" with nothing over it is exactly the
		// control docs/UI.md §6 asks for an `aria-label` on.
		input.setAttribute('aria-label', name);
		/*
		 * Sized to its own content, and **at render rather than per keystroke**.
		 * A box that grew as a value was typed would move every field after it
		 * under the reader's hand, which is the movement `docs/UI.md` §9 measured
		 * and refused for a record's ceiling: stepping a level from 9 to 10 must
		 * not shift the fields beside it mid-press. So the line settles on the
		 * rebuild a commit produces.
		 */
		input.size = Math.max(MIN_FIELD_WIDTH, (stored === '' ? name : stored).length);
		fieldEntry.push(() => input);

		bindEditable(input, {
			initial: stored,
			// Arrow keys step a numeric field and stay caret movement in a text
			// one, which is `editable.ts`'s own rule and costs nothing here: a
			// level steps and a species does not.
			step: true,
			refuse,
			onRefusal: showScalarRefusal,
			onEnter: () => {
				// Enter means "done with this field", and the next field on the
				// face is the obvious place to be.
				focusAndSelect(fieldEntry[index + 1]);
			},
			announceCommit: (next) => {
				status.textContent =
					next === '' ? `${name} cleared` : `${name} ${next}`;
			},
			announceRestore: (restored) => {
				status.textContent = `${name} restored to ${restored}`;
			},
			// Delta, not snapshot: writing only this key cannot revert a sibling's
			// fresher edit, or the picture line.
			onCommit: (next) => context.onChange({ values: { [field.key]: next } }),
		});
	});
}

/**
 * A field marked `list: true`: one small, always-live control per stored
 * part, each with its own always-visible delete control, plus a control to
 * add another (`docs/features/passport-field-lists.md`, settled answer 3's
 * second pass).
 *
 * **Every part is the same live editable-looking control every other value on
 * the sheet already is.** There is no closed state to discover and no whole-
 * field text to edit — the first pass tried both and the owner rejected the
 * result on both counts. `editable.ts` governs each part's own `<input>` on
 * exactly the rules a scalar field's already follows; what is new here is
 * only what a commit computes before handing `onCommit` a string, and the
 * add control, which has no analogue on a scalar field at all.
 *
 * **`parts` is this closure's own copy of what is currently stored**, kept in
 * step with every commit so `paint` below can rebuild the row without
 * waiting for the view's own rebuild to come back around — the optimistic
 * half of `docs/PATTERNS.md` §5, applied to a control whose own shape changes
 * on every add or remove rather than only its value.
 *
 * **`paint` always rebuilds the whole row, never one part in place.** Editing
 * one part changes no one else's text or position, so a surgical patch is
 * possible; it is not taken, because a full rebuild is one function for
 * every commit (edit, add, remove) rather than three, and this row is short
 * enough that the cost is not worth the branch.
 *
 * **Every DOM mutation the paint performs is deferred one microtask**, for
 * the reason this feature's first pass already found the hard way: Enter
 * fires this synchronously while the committing input is still focused, and
 * removing it from the DOM immediately would blur it for real — reentering
 * `editable.ts`'s own commit handler, one call still on the stack. By the
 * next microtask, whatever else Enter is doing (moving focus to the next
 * part, or to the add control) has already run, so there is nothing left for
 * the rebuild to blur. Escape and an ordinary blur reach here with focus
 * already moved on and would be just as correct done immediately; deferred
 * is one rule for all commits rather than a special case for Enter alone.
 *
 * Returns this field's own current entry point, for a sibling field's Enter
 * to focus (`drawFields` above) — a function rather than an element, since it
 * changes as parts are added or removed.
 */
function drawListField(
	line: HTMLElement,
	doc: Document,
	name: string,
	stored: string,
	refuse: (next: string) => string | null,
	status: HTMLElement,
	onCommit: (joined: string) => void,
	armed: ArmRegister,
): () => HTMLElement {
	const region = line.createDiv('sheetsmith-passport-list');
	let parts: readonly string[] = listParts(stored);
	/** The add control, always the row's last child once `paint` has run. */
	let addButton: HTMLButtonElement;

	/**
	 * Redraw every part and the add control from `parts`, in one pass.
	 *
	 * Zero parts draws the add control alone — no chip, on the settled
	 * answer's own correction of the first pass's placeholder chip.
	 */
	const paint = (): void => {
		region.replaceChildren();
		parts.forEach((part, index) => {
			const row = region.createDiv('sheetsmith-passport-part');
			const input = row.createEl('input');
			input.type = 'text';
			input.classList.add('sheetsmith-passport-input');
			input.value = part;
			// Positional rather than by value: the value is already read back
			// from the input itself, and a name built from it would repeat
			// what a screen reader already says next.
			input.setAttribute('aria-label', `${name} ${index + 1}`);
			input.size = Math.max(MIN_FIELD_WIDTH, part.length);

			// Anchored after the whole part, not after the input alone: the
			// input and its delete button are one row, and a message wedged
			// between the two would read as belonging to neither.
			const showRefusal = attachRefusalNotice(row, status);

			bindEditable(input, {
				initial: part,
				refuse,
				onRefusal: showRefusal,
				onCommit: (next) => {
					queueMicrotask(() => {
						// **Written through, empty text included — never
						// filtered away.** An edit is not the delete control:
						// removing a part is the arm-then-confirm gesture's
						// own job, and the spec's own "Deliberately not
						// doing" section already refuses a lighter, one-press
						// removal on purpose — clearing a part's text and
						// blurring is exactly that, reached through a side
						// door, if committing it silently dropped the part.
						// `joinParts` writes the empty entry out as a bare
						// separator (`'; Bladesinger Wizard 4'`), which
						// `listParts` already reads tolerantly on the next
						// parse — the same "collapses on read, never rewritten
						// unbidden" shape this feature's own separator module
						// documents — so the part stays exactly where the
						// reader left it: present, empty, and only a further,
						// explicit delete away from actually going.
						parts = parts.map((p, i) => (i === index ? next : p));
						onCommit(joinParts(parts));
						paint();
					});
				},
				onEnter: () => {
					queueMicrotask(() => {
						const inputs = Array.from(
							region.querySelectorAll<HTMLInputElement>(
								'.sheetsmith-passport-input',
							),
						);
						const next: HTMLElement = inputs[index + 1] ?? addButton;
						next.focus();
						if (next.instanceOf(HTMLInputElement)) next.select();
					});
				},
				announceCommit: (next) => {
					status.textContent =
						next === '' ? `${name} ${index + 1} cleared` : `${name} ${index + 1} ${next}`;
				},
				announceRestore: (restored) => {
					status.textContent = `${name} ${index + 1} restored to ${restored}`;
				},
			});

			const remove = row.createEl('button');
			remove.type = 'button';
			remove.classList.add('sheetsmith-passport-part-remove');
			// The app's own trash icon rather than a copy of it, the same mark
			// Table's and Record set's own row delete already use, so a
			// fourth control on the sheet asks the reader to recognise one
			// glyph rather than a second one.
			setIcon(remove, 'trash');
			bindArmToConfirm({
				button: remove,
				row,
				armedClass: 'sheetsmith-passport-part-remove-armed',
				rowClass: 'sheetsmith-passport-part-arming',
				named: `Delete ${part}`,
				announce: (said) => {
					status.textContent = said;
				},
				commit: () => {
					queueMicrotask(() => {
						parts = parts.filter((_, i) => i !== index);
						onCommit(joinParts(parts));
						paint();
					});
				},
				register: armed,
				doc,
			});

			/*
			 * **Stands the arm down the moment focus genuinely leaves this
			 * part**, additive to `bindArmToConfirm`'s own listeners rather
			 * than a replacement for them (`docs/features/
			 * passport-field-lists.md`, "Standing an armed delete down when
			 * its part loses focus"). Needed because the delete control is
			 * now hidden except while its own part has focus (below): without
			 * this, a part that stayed armed while its control went on
			 * hiding elsewhere would show a reddened input with nothing on
			 * screen explaining why.
			 *
			 * `relatedTarget` is what tells "focus moved to this part's own
			 * delete button" — progress within the same part, not a
			 * departure — apart from "focus left the row entirely," which is
			 * the one case this stands the arm down for. Calling the
			 * register's own stand-down (`interaction/arm-to-confirm.ts`'s
			 * `cancel`, which disarms *and* announces `STOOD_DOWN` in one
			 * step now) rather than reaching into a specific button's own
			 * handler: the armed control might not be this part's own (a
			 * sibling's, or nothing), and `register.armed` already holds
			 * whichever one is current — a safe no-op where nothing is
			 * armed, since `cancel` itself does nothing unless armed.
			 *
			 * **Still needed alongside the button's own `blur` listener,
			 * not made redundant by it.** A finger arming this control on a
			 * platform where a tap never focuses a button (WebKit's own
			 * documented behaviour, which is why the module arms on `click`
			 * rather than relying on `blur` alone) leaves nothing to blur
			 * when the reader moves on — the row's own `focusout` is the one
			 * thing left watching in that case.
			 */
			row.addEventListener('focusout', (event) => {
				const to = event.relatedTarget;
				if (to instanceof Node && row.contains(to)) return;
				armed.armed?.();
			});
		});

		addButton = region.createEl('button');
		addButton.type = 'button';
		addButton.classList.add('sheetsmith-passport-add');
		setIcon(addButton, 'plus');
		// The invitation an empty field's placeholder used to carry, since a
		// list field with zero parts draws no chip for one to sit in.
		addButton.setAttribute('aria-label', `Add ${name}`);
		addButton.setAttribute('title', `Add ${name}`);
		addButton.addEventListener('click', () => openAdd());
	};

	/**
	 * Turn the add control into a fresh, empty, focused input — "the same
	 * position" the design calls for, since replacing it in place is exactly
	 * what removing it and appending a plain input in its stead achieves.
	 */
	const openAdd = (): void => {
		const current = addButton;
		// The *global* `createEl`, detached, since it is attached later than it
		// is created (`docs/PATTERNS.md` §5): `replaceWith` below is the
		// attachment, and no `parent` option could express "in this button's
		// own place".
		const input = createEl('input');
		input.type = 'text';
		input.classList.add('sheetsmith-passport-input');
		input.placeholder = name;
		input.setAttribute('aria-label', `New ${name}`);
		// Sized to the placeholder it is about to show, on the same terms as
		// this field's other two input sites: a box floored at one character
		// draws only a caret, which defeats the placeholder's own job of
		// carrying the add control's invitation once it is a field rather
		// than a glyph.
		input.size = Math.max(MIN_FIELD_WIDTH, name.length);
		current.replaceWith(input);

		const showRefusal = attachRefusalNotice(input, status);

		bindEditable(input, {
			initial: '',
			refuse,
			onRefusal: (message) => {
				showRefusal(message);
				// `onRefusal` fires on every attempt, including the one that
				// changed nothing — which, from an initial value of `''`, is
				// exactly the empty commit/Escape cancellation the design
				// calls for: nothing is written, and the transient input goes
				// away in favour of a fresh add control, focused — on *every*
				// path that ends here, blur included, not only Enter: the
				// spec's own words for the empty case are "focus returns to
				// the add control," and Tab order depends on it as much as
				// convenience does. A reader who tabs (not clicks) out of an
				// empty transient input has already had the browser decide
				// where Tab is going before this rebuild runs a microtask
				// later — the *next declared field*, since the add button
				// Tab is supposed to reach does not exist yet at the moment
				// the key is pressed — so without an explicit refocus here,
				// Tab would skip the add control's own stop the one time its
				// input closes empty.
				if (message === null && input.value.trim() === '') {
					queueMicrotask(() => {
						paint();
						addButton.focus();
					});
				}
			},
			onCommit: (next) => {
				// Focus is returned here too, on the same argument as the
				// empty path above: this input closing (whichever way it
				// closes) always leaves a fresh add control in its place,
				// and Tab's own forward progress already left mid-flight by
				// the time this runs cannot be trusted to have landed on it
				// by itself.
				queueMicrotask(() => {
					parts = [...parts, next];
					onCommit(joinParts(parts));
					paint();
					addButton.focus();
				});
			},
			announceCommit: (next) => {
				status.textContent = `${name} added: ${next}`;
			},
			announceRestore: () => {
				status.textContent = 'Add cancelled';
			},
		});

		input.focus();
	};

	paint();

	// This field's own current entry point, read live: the first part while
	// there is one, the add control while there is none.
	return () =>
		region.querySelector<HTMLElement>('.sheetsmith-passport-input') ?? addButton;
}

export const passport: ComponentDefinition<PassportConfig, PassportData> = {
	type: 'passport',
	storage: 'markdown',
	/*
	 * No expression anywhere on this component. The line under the name is three
	 * stored values drawn side by side, which is rendering rather than arithmetic
	 * — see the header on why that is not the string question SPEC §13 holds.
	 */
	formulaFields: [],
	configFields: [
		{
			key: 'nameKey',
			kind: 'text',
			label: 'Name key',
			addressesEntry: { fence: 'section', whenBlank: DEFAULT_NAME_KEY },
			description:
				'Entry name for the character\'s name in the note, e.g. "Character". Not shown on the face, and not what formulas reference — they use the component id above. Defaults to "name". Renaming it moves that entry in every note on this layout. A field below declaring this same key is left off the face, since two controls cannot write one entry.',
		},
		{
			key: 'fields',
			kind: 'entries',
			label: 'Fields',
			// This component's own words for the two columns. Held here rather than
			// in the editor's shared list field, which serves four vocabularies now
			// and must not know which one it is drawing (PATTERNS §1).
			entryColumns: [
				{ key: 'key', heading: 'Key' },
				{ key: 'name', heading: 'Name' },
			],
			// `types.ts`'s `entryFlag`, on `rowFlag`'s own precedent: a per-entry
			// checkbox the shared list editor draws without knowing what it means.
			entryFlag: { key: 'list', label: 'Several values' },
			addressesEntry: { fence: 'section' },
			description:
				'The values shown under the name, in this order. Each key is the entry\'s name in the note, and renaming one moves it in every note on this layout; its name is what the field shows while it is empty and what a screen reader calls it. A field may say it holds several values, drawn as one chip per part and stored as one line with the parts separated by semicolons — a multiclass character\'s class field reading "Fighter 1; Bladesinger Wizard 4" where a single-class character\'s reads "Bard 5", on the same layout.',
		},
		{
			key: 'hidePicture',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide picture',
			description:
				'Leaves the picture off and gives the text the whole face. The note keeps any embed it already holds. A face with no picture is a name and a short line, so give it one row: the component fills the rows you placed it in either way, and two of them leaves a band of empty card above and below the text.',
			default: false,
		},
		{
			key: 'hideLabel',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide label',
			description:
				'Leaves the component\'s name off the sheet. A header usually does, since the face names itself.',
			default: false,
		},
		{
			key: 'fit',
			group: 'Appearance',
			kind: 'select',
			label: 'Fit',
			description:
				'How the picture fills its frame. Fitted draws the whole picture with nothing cropped, which may leave empty space above or below it. Cropped fills the frame and cuts off whatever does not fit, centred. Stretched fills the frame exactly, distorting the picture where its shape does not match.',
			options: ['contain', 'cover', 'stretch'],
		},
	],
	/*
	 * A sheet's header is this component with three fields in it, and the entry
	 * passes SPEC §4.2's test on both halves: an author looking for a header does
	 * not look for a component called Passport, and the job is one component's
	 * configuration away.
	 *
	 * It leaves `hideLabel` alone deliberately, though a header usually wants it:
	 * the label is visible when the entry lands, so the author sees where the
	 * setting is rather than having to find a checkbox that is already ticked.
	 * `hidePicture` is absent for PATTERNS §8's reason — the default is what the
	 * absent key already means, and a layout file is hand-edited and shared, so an
	 * entry that writes down defaults writes noise into every layout using it.
	 */
	palette: [
		{
			name: 'Header',
			description:
				'The character\'s name, a picture and a short line of identity values: class, species and level. The name comes from the note\'s own filename and is not edited here; the three values are edited on the sheet. Rename, reorder or drop the fields your game does not use. Two rows suit a header with a picture; turn the picture off and one row suits it, since the text alone does not fill two.',
			config: {
				fields: [
					{ key: 'class', name: 'Class' },
					{ key: 'species', name: 'Species' },
					{ key: 'level', name: 'Level' },
				],
			},
		},
	],

	/*
	 * Each declared key holding the layout's own word for it, and no embed line.
	 *
	 * **The filler is the field's own name rather than `sample-values.ts`'s**, and
	 * that is this component's one departure from the shared vocabulary. A
	 * passport's values are words about a person, so a number would be filler
	 * nobody could read as a species; and the rule the shared module exists to
	 * protect — a sample never invents vocabulary — is honoured rather than broken,
	 * because the word comes from the config the component was handed. "Species"
	 * in the species slot reads unambiguously as a preview.
	 *
	 * **No embed line**, on Image's own reason for declaring no sample at all:
	 * there is no vault behind the canvas, so `RenderContext.resource` is absent
	 * and the frame draws empty whatever the body says. A sampled embed would be
	 * filler nothing could ever paint — and it would be a wikilink in a sample,
	 * which the registry contract forbids for the same reason.
	 *
	 * No fields names nothing to fill, so the body is empty and the face draws
	 * exactly as it does today.
	 */
	sample(config): string {
		/*
		 * **The name is filled and the fields are, so the canvas previews a
		 * populated face rather than an empty one in the slot the component is
		 * named for.** Its filler is `NAME_PLACEHOLDER`, which is the component's
		 * own generic word for its own slot and already the placeholder — so
		 * nothing new is invented, and the only difference from the empty state is
		 * that the canvas draws it at full contrast rather than faint. That
		 * difference is the informative half: it tells the author the name is a
		 * value the note holds.
		 */
		const fields = storableFields(config);
		return writeFenced(
			null,
			new Map([
				[nameKey(config), NAME_PLACEHOLDER],
				...fields.map((field): [string, string] => [field.key, fieldName(field)]),
			]),
		);
	},

	/*
	 * **The fence can fail a read and the picture line cannot**, which is the two
	 * halves of this section keeping the rules of the components that own them. A
	 * fence that will not parse is Card's case — the line is named and nothing else
	 * is drawn, because the fields are Card's kind of data and a component cannot
	 * draw values it could not read. An embed line that is not one embed is Image's
	 * case, and Image's correction applies verbatim: a failed read never reaches
	 * `render`, so refusing here would replace the whole cell and take the field
	 * that fixes the value with it.
	 */
	read(body, config): ReadResult<PassportData> {
		const parsed = readFenced(body);
		if (!parsed.ok) return parsed;
		const at = pictureLine(splitLines(body), body);
		const source = at === -1 ? undefined : lineText(splitLines(body)[at] as string).trim();
		// Neither half stored: an editable empty face, not an error (PATTERNS §4).
		// The first commit writes whichever half the reader touched.
		if (parsed.values === null && source === undefined) {
			return { ok: true, data: null };
		}
		const data: PassportData = {};
		if (source !== undefined) data.source = source;
		// Every entry the fence holds, not only the declared ones, so a write of
		// the whole of `data` cannot drop one (`write` below, and Constraint 4).
		if (parsed.values !== null) data.values = Object.fromEntries(parsed.values);
		return { ok: true, data };
	},

	/*
	 * One name per declared field, `passport.level`, so a 5e layout that keeps its
	 * level here writes `prof = ceil(passport.level / 4) + 1`.
	 *
	 * **No bare `passport`**: a face is not one value, and `ScopeValues.self` is
	 * optional for exactly this case.
	 *
	 * **The stored text, published as Card publishes a dropdown's value**, which is
	 * what makes a numeric field a number and a word a name no formula can compare.
	 * `formula/sheet.ts`'s own `coerceValue` is what does the reading — `5` becomes
	 * 5 and `Bard` stays "Bard" — so there is nothing here to decide and nothing to
	 * disagree with `typed-value.ts` about: a passport field declares no type, and
	 * that module's rules over an untyped field are the identity.
	 *
	 * A word published as a name is *deliberately* useless to arithmetic, and SPEC
	 * §5 is why: the language has no strings, so the only way to write a comparison
	 * against a word is a bare identifier, which fails as an unknown name. That is
	 * the existing message and this component adds no new one.
	 */
	scopeValues(data, config): ScopeValues {
		const named: Record<string, ScopeEntry> = {};
		// The name publishes on exactly the fields' terms, and withholding it would
		// be the special case: it is one entry in the same fence under a key the
		// layout named, so `passport.name` is a word no formula can compare in
		// precisely the way `passport.class` is. Nothing here has to know which of
		// them the face draws large.
		named[nameKey(config)] = { value: data?.values?.[nameKey(config)] };
		for (const field of storableFields(config)) {
			const raw = data?.values?.[field.key];
			named[field.key] = { value: raw };
		}
		return { named };
	},

	/*
	 * Each half back where it came from, and neither one touching the other.
	 *
	 * The delta is what makes that safe: `values` absent means the reader edited the
	 * picture and the fence must not be rewritten, and `source` absent means they
	 * edited a field and the picture line must not move — which is also what keeps
	 * `hidePicture` from dropping an embed the note holds, since a hidden picture
	 * draws no field and so never commits one.
	 */
	write(data, body): string {
		const withFields =
			data.values === undefined
				? body
				: writeFenced(body, new Map(Object.entries(data.values)));
		return data.source === undefined
			? (withFields ?? '')
			: writePictureLine(withFields, data.source);
	},

	render(container, config, data, context): void {
		container.replaceChildren();

		/*
		 * No config guard. A passport with no fields is a name and a picture, which
		 * is a legible thing to place and the state a freshly added component is in;
		 * a key the note cannot hold is left out by `storableFields` rather than
		 * taking the face down with it. Everything else that can be wrong here is in
		 * the *note*, and `read` and the frame below report it.
		 */
		const block = container.createDiv();
		/*
		 * The shared box: a component whose size is its placement and not its
		 * content (docs/UI.md §9). The whole of the box is that class's — the
		 * floor, the flex column and the gap — and `--sheetsmith-rows` below is the
		 * placement it takes the floor from.
		 *
		 * `sheetsmith-passport` beside it is the name a rule reaching *this*
		 * component's block uses, so an override does not have to be written
		 * against every placed box on the sheet — `.sheetsmith-image`'s shape. It
		 * arrived carrying no rule and **has one now**, which is the shape earning
		 * its keep rather than a coincidence: the face's reflow has to be keyed on
		 * the component's own width, and a container query cannot restyle the
		 * element that is itself the container, so the block is where
		 * `container-type` goes and the block needed a name to put it on.
		 */
		block.classList.add('sheetsmith-placed', 'sheetsmith-passport');
		block.style.setProperty('--sheetsmith-rows', String(config.position.height));

		// Drawn first and before any failure, so the component's name is on screen
		// whichever half raised one (docs/UI.md §12's error-card row).
		const labelled = showsOwnLabel(config, context);
		if (labelled) {
			const label = block.createDiv();
			// The rank is `.sheetsmith-component-label`'s, shared by six components
			// now (docs/UI.md §9). `-passport-label` is the hook `sheetsmith-passport`
			// above was until it grew a rule — **no rule today**, and the name a
			// narrow-face override would reach for, which is what every other
			// consumer of that rank already keeps its own of.
			label.classList.add(
				'sheetsmith-component-label',
				'sheetsmith-passport-label',
			);
			label.textContent = config.label;
		}

		/*
		 * The card surface, borrowed the way Pool borrows it (docs/UI.md §9): this
		 * is one card-shaped object on the sheet, at the card's own rank, and it
		 * adds no chrome of its own. Its own class carries the one thing a card does
		 * not already say — that the picture and the text sit side by side.
		 */
		const face = block.createDiv({ cls: ['sheetsmith-card', 'sheetsmith-passport-face'] });

		// The *global* `createDiv`, which attaches to nothing: appended after the
		// picture rather than at creation (`PATTERNS.md` §5). Invisible, so its
		// position is reading order and the harness cannot see it move.
		const status = createDiv({
			cls: 'sheetsmith-sr-only',
			attr: { 'aria-live': 'polite' },
		});

		if (config.hidePicture !== true) {
			drawPicture(face, config, data, context, status, labelled);
		}

		const text = face.createDiv('sheetsmith-passport-text');

		drawName(
			text,
			data?.values?.[nameKey(config)] ?? '',
			refuseFencedLink,
			(next) => context.onChange({ values: { [nameKey(config)]: next } }),
			status,
		);
		drawFields(text, config, data, context, status);

		face.appendChild(status);
	},
};
