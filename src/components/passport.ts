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

import { bindEditable } from '../interaction/editable';
import { fenceLines, readFenced, writeFenced } from '../parse/fenced';
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
}

export interface PassportConfig extends ComponentConfig {
	type: 'passport';
	/** Entry key for the character's name. Defaults to `name`. Never displayed. */
	nameKey?: string;
	fields?: PassportField[];
	hidePicture?: boolean;
	hideLabel?: boolean;
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
		if (key === '' || /[:\r\n]/.test(key)) continue;
		// Two fields on one key are one entry in the note, so the second would
		// draw the first's value and overwrite it on commit.
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(field.name === undefined ? { key } : { key, name: field.name });
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
	return key === '' || /[:\r\n]/.test(key) ? DEFAULT_NAME_KEY : key;
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
	const doc = face.ownerDocument;
	const box = doc.createElement('div');
	box.classList.add('sheetsmith-placed-box', 'sheetsmith-passport-picture');
	face.appendChild(box);

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
		...(context.resource === undefined ? {} : { resource: context.resource }),
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
function drawName(
	text: HTMLElement,
	stored: string,
	refuse: (next: string) => string | null,
	onCommit: (next: string) => void,
	status: HTMLElement,
): void {
	const doc = text.ownerDocument;
	const field = doc.createElement('input');
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
	text.appendChild(field);

	/**
	 * Draw or clear the standing refusal under the name, and say it.
	 *
	 * Its own notice rather than the fields line's, because they are about
	 * different controls and a message about a name must not be cleared by a
	 * commit on a species. `record-set.ts`'s `refusalNotice` is the shape and its
	 * comment is the argument: a closure per message, remembering which element to
	 * remove.
	 */
	let notice: HTMLElement | null = null;
	const showRefusal = (message: string | null): void => {
		notice?.remove();
		notice = null;
		if (message === null) return;
		notice = doc.createElement('div');
		notice.classList.add('sheetsmith-error');
		notice.textContent = message;
		field.after(notice);
		status.textContent = message;
	};

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
 * The identity values, as a row of tags.
 *
 * Each declared field is an `editable.ts` field on the card's own interaction
 * rules — Enter commits and moves to the next field on the face, Escape restores,
 * blur commits — drawn as a discrete chip in Obsidian's own tag clothes.
 *
 * **A row of tags rather than a sentence, and that is the owner's call reversing
 * an earlier one of ours.** The line began as a sentence with middle dots between
 * the values, and the dots are gone with the chips: a chip separates itself, and a
 * dot between two padded pills reads as a third thing. That also took a real
 * defect with it — at six fields the line wrapped after a dot and stranded it at
 * the end of a row, which the vault fixture found and no harness view had. What
 * else went with them is the `aria-hidden` span each dot needed, so there is
 * nothing on this line now that a screen reader has to be told to skip.
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

	const line = doc.createElement('div');
	line.classList.add('sheetsmith-passport-fields');
	text.appendChild(line);

	/** Every field on the face, so Enter can reach the next one. */
	const inputs: HTMLInputElement[] = [];

	/*
	 * **The line is the hit target, not the box** — PATTERNS §6's "the whole card
	 * is the hit target" read one axis over, and the thing this component was
	 * missing rather than an addition to it.
	 *
	 * A design review measured why it matters. The boxes are content-sized, so a
	 * level's is about as wide as one digit; without this the target for `5` would
	 * be 19px against `legibility.md` §5's 20pt pointer minimum and its 28pt
	 * coarse minimum, and the old four-character floor was quietly paying for that
	 * with dead box on either side of the digit — which is what made the dots read
	 * unevenly. Routing the press moves the payment to where it costs the reading
	 * nothing: every pixel between two fields belongs to whichever is nearer, so
	 * the target is as large as the line allows and no two targets overlap.
	 *
	 * **An inset `::after` per field is the alternative and it is worse here**,
	 * which is worth writing down because it is the level ring's own answer
	 * (`legibility.md` §8) and the obvious reach. Two reasons: a pseudo-element
	 * does not render on an `<input>` at all — which is also why the middle dots
	 * this line used to carry were real spans — so it would need a wrapper element
	 * per field;
	 * and the boxes sit about 12px apart, so two targets inset 8px each would
	 * overlap, which is precisely §5's "a target big enough to hit is not big
	 * enough if the neighbouring target starts before the gap does". Nearest-wins
	 * has no overlap by construction.
	 *
	 * `click` rather than `pointerdown`, and nearest by *horizontal* distance:
	 * both are `card-face.ts`'s own rules, one axis over, because a card is a
	 * column of controls and this is a row of them.
	 */
	line.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		// Real controls own their own presses (PATTERNS §6). A press that landed
		// in a field is already where it was going.
		if (target?.closest('input') !== null) return;
		// Never at the cost of a selection in progress: a reader dragging across
		// "Half-elf · Bard" is copying it, not asking to edit.
		const selection = doc.getSelection();
		if (selection !== null && !selection.isCollapsed) return;
		let nearest: HTMLInputElement | undefined = inputs[0];
		let closest = Infinity;
		for (const candidate of inputs) {
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
	 * link is rendered and carried under SPEC §10.
	 */
	const refuse = (next: string): string | null =>
		fencedLinkRefusal(next, {
			subject: 'A passport\'s values',
			instead:
				'Type the plain word here, and put the link in a Rich text block or a table cell, which store markdown.',
		});

	/**
	 * Draw or clear the standing refusal under the line, and say it.
	 *
	 * Under the line rather than beside the field, because the fields are a
	 * *sentence* and a message wedged between two words would break the one thing
	 * this component's layout is for. One notice for the whole line, since only
	 * one commit is ever in flight: `editable.ts` reports a cleared refusal on
	 * every commit attempt, so the next field to be left clears whatever is
	 * standing. Record set's `refusalNotice` is the shape, and it keeps a closure
	 * per message there because four controls have four hosts; there is one host
	 * here, so there is one closure.
	 */
	let notice: HTMLElement | null = null;
	const showRefusal = (message: string | null): void => {
		notice?.remove();
		notice = null;
		if (message === null) return;
		notice = doc.createElement('div');
		notice.classList.add('sheetsmith-error');
		notice.textContent = message;
		text.appendChild(notice);
		status.textContent = message;
	};

	fields.forEach((field, index) => {
		const name = fieldName(field);
		const stored = data?.values?.[field.key] ?? '';
		const input = doc.createElement('input');
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
		line.appendChild(input);
		inputs.push(input);

		bindEditable(input, {
			initial: stored,
			// Arrow keys step a numeric field and stay caret movement in a text
			// one, which is `editable.ts`'s own rule and costs nothing here: a
			// level steps and a species does not.
			step: true,
			refuse,
			onRefusal: showRefusal,
			onEnter: () => {
				// Enter means "done with this field", and the next field on the
				// face is the obvious place to be.
				const next = inputs[index + 1];
				next?.focus();
				next?.select();
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
			description:
				'Entry name for the character\'s name in the note, e.g. "Character". Not shown on the face, and not what formulas reference — they use the component id above. Defaults to "name". Renaming it does not move a stored value: the old entry stays in the note under the old key. A field below declaring this same key is left off the face, since two controls cannot write one entry.',
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
			description:
				'The values shown under the name, in this order. Each key is the entry\'s name in the note; its name is what the field shows while it is empty and what a screen reader calls it. Renaming a key does not move a stored value: the old entry stays in the note under the old key.',
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
		const doc = container.ownerDocument;
		container.replaceChildren();

		/*
		 * No config guard. A passport with no fields is a name and a picture, which
		 * is a legible thing to place and the state a freshly added component is in;
		 * a key the note cannot hold is left out by `storableFields` rather than
		 * taking the face down with it. Everything else that can be wrong here is in
		 * the *note*, and `read` and the frame below report it.
		 */
		const block = doc.createElement('div');
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
		container.appendChild(block);

		// Drawn first and before any failure, so the component's name is on screen
		// whichever half raised one (docs/UI.md §12's error-card row).
		const labelled = showsOwnLabel(config, context);
		if (labelled) {
			const label = doc.createElement('div');
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
			block.appendChild(label);
		}

		/*
		 * The card surface, borrowed the way Pool borrows it (docs/UI.md §9): this
		 * is one card-shaped object on the sheet, at the card's own rank, and it
		 * adds no chrome of its own. Its own class carries the one thing a card does
		 * not already say — that the picture and the text sit side by side.
		 */
		const face = doc.createElement('div');
		face.classList.add('sheetsmith-card', 'sheetsmith-passport-face');
		block.appendChild(face);

		const status = doc.createElement('div');
		status.classList.add('sheetsmith-sr-only');
		status.setAttribute('aria-live', 'polite');

		if (config.hidePicture !== true) {
			drawPicture(face, config, data, context, status, labelled);
		}

		const text = doc.createElement('div');
		text.classList.add('sheetsmith-passport-text');
		face.appendChild(text);

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
