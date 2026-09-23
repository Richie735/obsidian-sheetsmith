/*
 * Track — one or more runs of segments filled in order.
 * Covers exhaustion, stress, XP, uses per day, death saves,
 * clocks, and spell slots.
 *
 * A Pool and a Track both hold a number under a ceiling, which is why the
 * build order called this a simpler Pool. What differs is what the number is
 * for. A pool is read as a proportion, so it draws a bar and prints its
 * numerals; a track is read as a count of things that each mean something —
 * the third exhaustion segment, the second death save — so its segments are
 * already both the proportion and the count and the card carries no numerals
 * at all. That also settles the ceiling's name: a quantity has a `max`, a run
 * has a `count`.
 *
 * The atom is the mark, not the segment. `marks` is how many presses fill one
 * segment and the stored value counts marks, so an Ironsworn progress track of
 * ten four-mark segments stores `value: 22` rather than a segment count and a
 * remainder that can disagree with each other. At the default of one the two
 * are the same number and the note reads exactly as every other track's does.
 *
 * A track may be a set of runs, and the set is Card set's shape: `rows`
 * names them and one fenced block holds an entry per key. Spell slots are five
 * first-level, three second and one third — three runs differing in nothing
 * but their length and their name, which as three components would be three
 * headings, three labels and three reset bindings kept in step by hand.
 *
 * A run of one segment is a flag, and that is where Toggle went (SPEC §13). Two
 * states is not a run with positions between its ends, so the card draws the
 * level ring rather than a segment — the same painter a `toggle` column uses, so
 * a flag on a card cannot measure differently from the same flag in a cell — and
 * stores `yes` or `no`, which reads better in a file for a flag than `1` does.
 * It is a consequence of the length rather than a config field: a declared
 * storage flag would be a third mutually exclusive pair on this form, and the
 * worst of the three, since the author would be holding a fact the layout
 * already states.
 *
 * A row may also be one the *character* invented, through `openRows` — Table's
 * own key and label for the same fact. **The mode is implied by the key not
 * being declared**: an entry whose key no row in `rows[]` spells is the
 * character's, so nothing is written into the note to record who owns a row,
 * and turning the toggle off hides those rows again rather than deleting one.
 * That one sentence is what `runsOf`, `isRowSet`, `read` and `render` below all
 * turn on — the card is a row set wherever the toggle is on, whether or not it
 * declares a row, and `read` claims every unmapped entry instead of passing
 * over it.
 *
 * **What that costs is the re-cut guarantee, and it is the one thing this file
 * gives up.** With the toggle off, an entry no row maps to is invisible and
 * untouched, which is what makes a slot table safe to re-cut (SPEC §7). With it
 * on, the leftover entry of a dropped declared row is drawn as the character's
 * — a row appearing, never a value disappearing, and turning the toggle off is
 * the way back. Identity is the typed name and a fence has no other address, so
 * nothing can tell a leftover from a row somebody typed
 * (`docs/features/character-added-track-rows.md`).
 */

import { setIcon } from 'obsidian';
import {
	armedName,
	armedPrompt,
	STOOD_DOWN,
} from '../interaction/arm-to-confirm';
import { GESTURE_COMMIT } from '../interaction/commit-window';
import { bindEditable, keptRatherThanBlank } from '../interaction/editable';
import { levelGlyph, levelName, parseLevel } from './level-ring';
import { bindRingControl } from './ring-control';
import { flagText, isFlagSet, isFlagSpelling } from './stored-flag';
import { fencedLinkRefusal } from './fenced-link';
import { modifierBreakdown } from './modifier-breakdown';
import { publishedFieldNames } from '../formula/resolve';
import {
	sampleFlag,
	samplePart,
	sampleNumber,
	sampleSeed,
	sampleText,
} from './sample-values';
import { bindLongPress, showPopover } from '../ui/popover';
import { revealWhenTruncated } from '../ui/truncation';
import {
	AnchoredPanel,
	closeAnchoredPanel,
	focusFirstControl,
	openAnchoredPanelKey,
	showAnchoredPanel,
} from '../ui/anchored-panel';
import {
	fencedKeyProblem,
	readFenced,
	renameFencedEntry,
	writeFenced,
} from '../parse/fenced';
import { splitBounded, withCeiling, withValue } from '../parse/bounded-entry';
import {
	ComponentConfig,
	ComponentDefinition,
	FieldResolver,
	ReadResult,
	RenderContext,
	ResetResult,
	ScopeEntry,
	ScopeValues,
	showsOwnLabel,
} from '../types';

/** SPEC §3.1: a single-value component stores its value under `value`. */
const VALUE_KEY = 'value';

/** One run in a set, named for the note and for the card. */
export interface TrackRow {
	/** Entry key in the fenced block. */
	key: string;
	/** Display name beside the run. Falls back to the key. */
	name?: string;
	/** This run's own length. Falls back to the component's `count`. */
	count?: string | number;
	/**
	 * Which end of this run is the bad end, where it differs from the rest of
	 * the card. Falls back to the component's `sense`.
	 *
	 * A set whose rows all mean the same thing sets it once above; death saves
	 * are the case that needs it per row, since three successes and three
	 * failures are the same shape pointed in opposite directions and a card
	 * that painted both alike would say the wrong thing about one of them.
	 */
	sense?: 'progress' | 'harm';
	/**
	 * Where this row's length comes from: the layout's formula (`count` above,
	 * or the component's own), or the character's own number, typed on the
	 * sheet.
	 *
	 * Pool's own two words, ported one level in rather than Record set's
	 * `'field' | 'record'`: a row's length is already a formula field
	 * (`rows.*.count`), so `'calculated'` is exactly true here the way it is on
	 * Pool, and `'character'` is exactly one number per character the way
	 * Pool's is — a row is a small Pool with segments instead of a bar. Absent
	 * means `'calculated'`, so every layout written before this reads exactly
	 * as it did.
	 */
	maxSource?: 'calculated' | 'character';
}

export interface TrackConfig extends ComponentConfig {
	type: 'track';
	/**
	 * How many segments a run holds, as a literal or an expression. Ignored
	 * where `levels` is set, since naming the steps settles how many there
	 * are; where `rows` is set it is the fallback for a row without its own.
	 */
	count?: string | number;
	marks?: number;
	/** One run per entry. Absent is a single unnamed run. */
	rows?: TrackRow[];
	/**
	 * Let the character add rows of their own beside the declared ones.
	 *
	 * Table's own key and its own label, because §2 names a thing for what it
	 * is and this is the same thing. What it does to the *note* is the whole
	 * of the mode: an entry whose key no declared row spells is the
	 * character's, so nothing is written to record who owns a row, and turning
	 * this off hides those entries again rather than deleting one.
	 */
	openRows?: boolean;
	/**
	 * Names for the steps from none upwards, in the syntax a `level` column
	 * uses and parsed by the same code — including a glyph after a colon.
	 */
	levels?: string[];
	/**
	 * Which end of the run is the bad end. The same line of segments fills
	 * toward an achievement in one system and a catastrophe in the next, and
	 * no property of the data distinguishes them.
	 */
	sense?: 'progress' | 'harm';
	hideLabel?: boolean;
}

export interface TrackData {
	/**
	 * Raw stored marks by fenced key, the single run living under `value`.
	 *
	 * On read this holds every entry a run maps to; on write only the entries
	 * present are touched, so an edit reported as a single-key delta can never
	 * clobber a sibling run with a stale snapshot — the rule Card set's
	 * values already follow, and the reason a row set is safe under two
	 * commits racing one rebuild.
	 *
	 * `null` is a delta-only instruction to remove that entry entirely — a
	 * character-owned row the reader has just removed — and `read` never
	 * produces one: a section that read cannot contain an instruction to
	 * delete itself. See `docs/features/track-row-length.md`.
	 */
	values: Record<string, string | null>;
	/**
	 * The character's own keys — the entries no declared row spells — in the
	 * note's own order. Filled by `read`, never by a delta.
	 *
	 * **Nothing may take a draw order off `values` instead.** That is a plain
	 * object, which puts integer-like keys first and in numeric order however
	 * they were inserted, so a character who names a row `10` would see it
	 * jump above every other row and `write` would append the next one in the
	 * wrong place. Named after `RowClaims.own`, whose sentence this is one
	 * storage over: "note rows no declared row claimed, in note order: the
	 * character's own".
	 */
	own?: readonly string[];
	/**
	 * One gesture: rename this key, keeping the whole of its line.
	 *
	 * Singular because one gesture reports one rename (PATTERNS §7), and a
	 * delta rather than a new key beside a null old one, because `writeFenced`
	 * flushes a key it did not find at the closing fence — so a delete plus an
	 * add would move the reader's line to the bottom of the block.
	 */
	rename?: { from: string; to: string };
}

/**
 * The most segments a run may draw. A track is three to ten units wide in
 * every system that has one, and the bound is what stands between a mis-typed
 * formula — or a `count` reading a level that just went up by three orders of
 * magnitude — and a hang. It clamps rather than erroring, because a run too
 * long to draw is still a run, and the number in the note is untouched.
 */
export const MAX_SEGMENTS = 100;

/** Obsidian's own delete glyph, matching Table's and Record set's. */
const REMOVE_ICON = 'trash';

/** Obsidian's own add glyph, matching the modifier form's own **Add**. */
const ADD_ICON = 'plus';

/**
 * A row just added by this card, so the next render can land focus in its
 * length field — Record set's own `awaitingAdd` mechanism, one module-level
 * flag rather than per-render state, since the press that sets it and the
 * render that reads it are two different calls into this file.
 */
let awaitingAdd: { id: string; key: string } | null = null;

/**
 * How many **Add** form messages have been built, so each one's id is its own.
 *
 * Module-level for `awaitingAdd`'s own reason: the render that builds a form
 * and the next one that builds another are two calls into this file. Only one
 * anchored panel is open at a time, so this is about never colliding rather
 * than about addressing a particular message.
 */
let addFormMessages = 0;

/**
 * The furthest a run travels past either end of itself, in pixels, and how
 * hard the pointer has to work to get there. A hard stop reads as a frozen
 * control; a few pixels of give reads as a responsive one with nothing
 * further to offer. The value itself is held inside the run — unlike a Pool,
 * whose boundary is a rule of the game the plugin must not enforce, a track's
 * ends are the run's own extent and there is no segment beyond the last one.
 */
const OVERSCROLL_MAX = 10;
const OVERSCROLL_RESIST = 60;

/** How many presses fill one segment. Anything unusable is one. */
export function markSize(config: TrackConfig): number {
	const marks = Math.floor(config.marks ?? 1);
	return Number.isFinite(marks) && marks >= 1 ? marks : 1;
}

/** The runs this track draws, in order, with the config each one reads. */
export function runsOf(config: TrackConfig): TrackRow[] {
	const rows = config.rows;
	if (rows === undefined || rows.length === 0) {
		// A card the character may add rows to declares none of its own, and
		// that is a row set holding no declared runs rather than a single
		// anonymous one: synthesising `value` here would give the card a run
		// under the key SPEC §3.1 reserves for a single-value component, and
		// a character could then collide with it by typing the word.
		if (config.openRows === true) return [];
		// The single run is a row set of one whose key is the storage key
		// every scalar component uses, so nothing downstream needs a second
		// shape for it.
		return [{ key: VALUE_KEY }];
	}
	return rows;
}

/**
 * Whether this track is a named set rather than one anonymous run.
 *
 * True wherever the character may add rows, declared rows or not: what makes
 * a card a set is that its entries are *named*, and a card offering an **Add**
 * control is offering to name one. That is what keeps `runsOf` above from
 * synthesising a `value` run, and what keeps such a card from publishing under
 * its bare id — there is no one number a set of runs could mean.
 */
export function isRowSet(config: TrackConfig): boolean {
	return (
		config.openRows === true ||
		(config.rows !== undefined && config.rows.length > 0)
	);
}

/**
 * Configuration that makes the card undrawable rather than merely empty.
 * Reported on this component alone, per SPEC §10.
 */
export function configError(config: TrackConfig): string | null {
	if (config.marks !== undefined) {
		const marks = config.marks;
		if (!Number.isInteger(marks) || marks < 1) {
			return 'Marks per segment has to be a whole number, 1 or more.';
		}
	}
	if (isRowSet(config) && config.levels !== undefined) {
		// Named steps are one run's meaning and rows are many runs'
		// identities; together they would ask for step names per row, which
		// is a third axis of configuration for a case nobody has had.
		//
		// **Two arms, because a card can now be a row set without declaring a
		// row.** `isRowSet` reads true wherever `openRows` is on, so the
		// sentence about `rows` reached an author who had declared none and
		// named a control they had never touched — PATTERNS §4's "error text
		// names the fix, not the fault", failed by the one refusal that has
		// two ways in.
		if ((config.rows ?? []).length === 0) {
			return 'A track with named levels cannot also let characters add rows, because a row a character adds has a length of its own and named steps are one run\'s ladder. Clear the level names, or turn off "Characters may add rows".';
		}
		return 'A track has either named levels or rows, not both. A layout wanting both is describing several ladders, which are several components.';
	}
	if (config.levels !== undefined) {
		if (config.levels.length < 2) {
			// The first name is what "none" is called, so a single name
			// describes a run with no step to reach.
			return 'A named track needs at least two level names, starting with the one for none.';
		}
		if (config.levels.some((entry) => parseLevel(entry).name === '')) {
			// A glyph stands for the level's name; it does not replace it. The
			// name is what a screen reader is given and what the step line
			// reads, and a glyph alone leaves both with nothing to say.
			return 'A level has a glyph but no name.';
		}
		return null;
	}
	if (isRowSet(config)) {
		const seen = new Set<string>();
		for (const row of config.rows ?? []) {
			const key = (row.key ?? '').trim();
			if (key === '') return 'Every row needs a key.';
			const problem = fencedKeyProblem(key);
			if (problem !== null) return `The row key "${key}" ${problem}.`;
			if (seen.has(key)) return `Two rows are both called "${key}".`;
			seen.add(key);
		}
		if (config.openRows === true && isFlagCard(config)) {
			// `isFlagCard` already refuses to call a character-owned row a flag,
			// whatever its count says, because a length the layout does not
			// state cannot be the literal 1 that makes a run two states. Every
			// row a character adds is character-owned by construction, so this
			// combination asks for exactly the row that refusal says cannot
			// exist.
			return 'A checkbox card cannot also let characters add rows, because a row a character adds has a length of its own and a one-segment run stores yes or no. Raise the segment count, or turn off "Characters may add rows".';
		}
		return null;
	}
	return null;
}

/**
 * Whether the layout has not yet said how long this card's run is: no count,
 * no level names and no rows.
 *
 * **Empty, not broken**, which is `configError`'s own line above: nothing about
 * such a card is undrawable, it is a Track the layout has not filled in yet, as
 * a Table with no rows and a Roster with no stats are. It is what a bare Track
 * inserted from the component picker is. Defaulting a length instead was
 * weighed and refused — an absent key would start meaning a run the file never
 * states, and a count of one is a flag that stores a different spelling
 * (`docs/features/component-picker.md` § Amendment).
 */
function awaitsLength(config: TrackConfig): boolean {
	return (
		config.count === undefined &&
		config.levels === undefined &&
		!isRowSet(config)
	);
}

/**
 * The line a card with no length draws, naming the fix and where to make it, as
 * Table's and Roster's empty states do.
 */
const NO_LENGTH_MESSAGE =
	'No segments yet. Set Segments in the layout.';

/**
 * The card's name, where the layout shows it. One drawing for both cards that
 * have one — a drawn run and a card with no length — so a change to the label
 * cannot reach one and miss the other.
 */
function renderLabel(
	into: HTMLElement,
	config: TrackConfig,
	context: Pick<RenderContext, 'parentShowsLabel'>,
): void {
	if (!showsOwnLabel(config, context)) return;
	// The shared rank (docs/UI.md §9); this component's own class carries only
	// the narrow-card tracking, which needs a container to ask about.
	into.createDiv({
		cls: 'sheetsmith-component-label sheetsmith-track-label',
		text: config.label,
	});
}

/**
 * How many segments a run holds, or null where its count is present and did
 * not resolve — the one case "?" is reserved for (SPEC §5).
 *
 * Naming the levels settles how many there are, so `levels` wins outright and
 * cannot fail. Everything else is a formula field like a Pool's `max`, and
 * fails like one. A resolved count below one is a failure too: a run of no
 * segments is not something a reader can be shown, and reporting it as an
 * unresolved count is the honest answer.
 */
export function segmentCount(
	config: TrackConfig,
	resolved: string | number | boolean | null | undefined,
): number | null {
	if (config.levels !== undefined) return config.levels.length - 1;
	const value = typeof resolved === 'number' ? resolved : Number(resolved);
	if (!Number.isFinite(value)) return null;
	const segments = Math.floor(value);
	if (segments < 1) return null;
	return Math.min(MAX_SEGMENTS, segments);
}

/**
 * What a step is called: its name where the levels are named, its count
 * otherwise.
 */
export function stepLabel(
	config: TrackConfig,
	segments: number,
	of: number,
): string {
	if (config.levels !== undefined) {
		return levelName({ levels: config.levels }, segments);
	}
	return `${segments} of ${of}`;
}

/** A segment's rectangle, as the run measures it. */
export interface SegmentBox {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/**
 * The mark count a pointer is asking for, in one run's own geometry.
 *
 * Pure, and given rectangles rather than elements, because a run wider than
 * its cell wraps to a second line and the arithmetic that survives that is
 * not a division. A wrap resets x, which is how the lines are found: a segment
 * starting no further right than the one before it begins a new line.
 *
 * Where a segment holds several marks the pointer reaches each of them inside
 * the segment's own width, so a four-mark segment is four positions.
 */
export function marksAtPoint(
	boxes: readonly SegmentBox[],
	x: number,
	y: number,
	marks: number,
): number {
	if (boxes.length === 0) return 0;

	const lines: number[][] = [];
	boxes.forEach((box, index) => {
		const previous = boxes[index - 1];
		if (previous === undefined || box.left <= previous.left) lines.push([]);
		lines[lines.length - 1]?.push(index);
	});

	// The line the pointer is on, or the nearest one: a pointer that has left
	// the run vertically is still asking about the line it left through.
	let line = lines[lines.length - 1] as number[];
	for (const candidate of lines) {
		const bottom = Math.max(...candidate.map((i) => boxes[i]?.bottom ?? 0));
		if (y < bottom) {
			line = candidate;
			break;
		}
	}

	const first = line[0] as number;
	const last = line[line.length - 1] as number;
	// Left of the line is everything before it filled and nothing in it.
	if (x < (boxes[first] as SegmentBox).left) return first * marks;
	for (const index of line) {
		const box = boxes[index] as SegmentBox;
		if (x < box.left) return index * marks;
		if (x > box.right) continue;
		const width = box.right - box.left;
		const share = width > 0 ? (x - box.left) / width : 1;
		// Ceiling, so touching a segment at all fills its first mark: there is
		// no position inside a segment that means "this segment, empty".
		const inside = Math.min(marks, Math.max(1, Math.ceil(share * marks)));
		return index * marks + inside;
	}
	return (last + 1) * marks;
}

/**
 * How full one segment is, from a mark total. Shared by the committed fill
 * and the pending one, which is what keeps a preview from disagreeing with
 * the outcome it is previewing — the rule the Pool's `landing` already keeps.
 */
function segmentFill(total: number, index: number, marks: number): number {
	return Math.max(0, Math.min(1, (total - index * marks) / marks));
}

/**
 * Whether a stored value is something a run can read at all.
 *
 * The vocabulary, in one place, because a run holds two spellings and two
 * callers need the answer for different reasons. `marksFrom` below wants the
 * value; `read` wants only whether it has one, since an unreadable entry is a
 * malformed section and it cannot use a value whose "nothing" covers an empty
 * entry too. Spelled at both — `read` had the negated form inline — the numeric
 * half could drift: reject a leading `+` or an `Infinity` in one and `read`
 * accepts what nothing can read, or refuses what it could have.
 *
 * Expects trimmed text, which both callers already have in hand.
 */
function readsAsMarks(text: string): boolean {
	return Number.isFinite(Number(text)) || isFlagSpelling(text);
}

/**
 * The marks a stored value says, or null where it says nothing.
 *
 * The one place a stored value is turned into a number, and the reason it is one
 * place is that a run holds two spellings. A flag card writes `yes` and `no`
 * (below), and the same layout raising its count to three has to go on reading
 * the notes it already wrote: a flag reads as its first mark, which is the state
 * it was in, and a count on a flag card reads as ticked or clear. Neither is
 * corrected — SPEC §7's rule that a stored value outside the run is rendered
 * rather than fixed covers both, and the note keeps what it says until the reader
 * changes it.
 *
 * Null rather than zero, because "the note holds nothing readable" and "the note
 * holds none" are different answers to a formula and the same answer to a fill.
 * That conflation is also why `read` cannot call this: those two are exactly what
 * it has to tell apart, so it shares the predicate above instead.
 *
 * Split through `splitBounded` before any of that, so a row whose length is
 * the character's own — stored as `2 / 4`, the marks and the length in one
 * entry — reads its marks from the half before the slash. A plain entry has
 * no slash in it, so the split is a no-op there: this runs for every row
 * whatever its `maxSource`, on the rule `docs/features/track-row-length.md`
 * states for the same reason `per-record-ceiling.md` states it for Record
 * set — gating it on the mode would mean a row switched back to a formula
 * left a stale composite for this function to reject as malformed.
 */
function marksFrom(raw: string | null | undefined): number | null {
	const text = splitBounded(raw ?? '').value.trim();
	if (text === '') return null;
	if (!readsAsMarks(text)) return null;
	return Number.isFinite(Number(text)) ? Number(text) : isFlagSet(text) ? 1 : 0;
}

/** The stored marks for one key, as a number. Unreadable counts as none. */
function storedMarks(data: TrackData | null, key: string): number {
	return marksFrom(data?.values[key]) ?? 0;
}

/**
 * A run's length where the layout states it outright, or null where it does not.
 *
 * A plain integer is a length; anything else is a formula, whatever it happens
 * to resolve to today. The distinction is what `isFlagCard` below stands on, and
 * it exists so that being a flag is a property of the *layout* rather than of
 * one evaluation: `count: "level - 4"` is 1 for a fifth-level character and 3
 * later, and a spelling that followed the number would rewrite how a note is
 * spelled when a character levelled up.
 *
 * The text as well as the number, because a `formula` config field is stored as
 * text: an author typing 1 into the segment count and a palette entry carrying
 * `count: 1` must produce the same component.
 */
function literalCount(value: string | number | undefined): number | null {
	if (typeof value === 'number') {
		return Number.isInteger(value) ? value : null;
	}
	if (value === undefined) return null;
	const text = value.trim();
	return /^\d+$/.test(text) ? Number(text) : null;
}

/**
 * Whether this card is a flag card: every run on it one segment of one mark, as
 * the layout declares it, so each stores yes or no rather than a count.
 *
 * This is what Toggle folded into (SPEC §13). A run with one segment and one
 * mark has exactly two states, and `yes` reads better in a file for a flag than
 * `1` does — the same choice a `toggle` column already made.
 *
 * **Per card, not per run**, and the spell-slot case is why: five first-level
 * slots, three second and one third takes the third row's length from the
 * component's `count` fallback, so a per-run rule would write `L1: 2`, `L2: 1`,
 * `L3: yes` down one fenced block. One spelling per card is what a hand-editable
 * note needs. A checklist of named flags is a card *all* of whose rows are one
 * segment, which is a real configuration and what rows gain from the fold.
 */
export function isFlagCard(config: TrackConfig): boolean {
	if (markSize(config) !== 1) return false;
	// Naming the steps settles the length, so two names is one segment. `rows`
	// and `levels` are already refused together, so this is the single run.
	if (config.levels !== undefined) return config.levels.length === 2;
	const runs = runsOf(config);
	// `every` over an empty list is vacuously true, and `runsOf` can return one
	// for the first time now that a card may declare no runs and still be a row
	// set. A card with nothing on it is not a checkbox.
	if (runs.length === 0) return false;
	return runs.every(
		// A character-owned row's length is not settled by the layout at all,
		// so it can never be the literal 1 that makes a run a flag — whatever
		// `row.count` happens to say, which `maxSource` makes irrelevant the
		// moment it reads `'character'`.
		(row) =>
			row.maxSource !== 'character' &&
			literalCount(row.count ?? config.count) === 1,
	);
}

/**
 * What the note should hold for a mark count, in this card's own spelling.
 *
 * `marksFrom` read the other way, and one function for the same reason: this is
 * the write *policy* — where the flag threshold sits, and what a run falls back
 * to — and a card has two write paths kept apart on purpose. A reset trigger
 * comes through `applyReset` and a press comes through the card's own commit, so
 * two copies of the threshold means a long rest writing `1` into a section a
 * press writes `yes` into, in one fenced block, with nothing on screen to say
 * why. PATTERNS §1's policy tier: a guard test over the copies could only assert
 * they still agree.
 *
 * Also what a run's *starting* text is taken to be, which is the one thing this
 * has to get right beyond writing. A flag card handed a note that reads
 * `value: 1`, from a layout that counted segments before the fold, would
 * otherwise find `yes` different from `1` and rewrite the note on the next blur,
 * having changed nothing the reader asked to change. Normalised on the way in,
 * the note keeps `1` until the box is actually pressed.
 *
 * Taken from the config rather than from a resolved count, which is what keeps
 * `applyReset`'s `empty` resolving nothing: a card whose count is broken can
 * still be cleared, and a spelling that needed the count would have taken that
 * away.
 */
function spelledMarks(config: TrackConfig, value: number): string {
	return isFlagCard(config) ? flagText(value >= 1) : String(value);
}

/**
 * A character-owned row's length, read from the ceiling half of its own
 * stored entry through the same rules a resolved formula's count is: floored,
 * clamped to `MAX_SEGMENTS`, null where it is absent or resolves to less than
 * one segment. Absent is the ordinary state of a die type this character does
 * not have, and `render` draws it as such rather than as "?".
 */
function characterLength(
	config: TrackConfig,
	stored: string | null | undefined,
): number | null {
	const ceiling = splitBounded(stored ?? '').ceiling;
	if (ceiling === null) return null;
	return segmentCount(config, ceiling.trim());
}

/**
 * One run's length, resolved. A row's own `count` is a formula field at its
 * own path, so the resolver is asked for that path rather than the shared
 * one — except where the character owns the length, which resolves nothing
 * at all and reads the row's own stored entry instead.
 */
function countFor(
	config: TrackConfig,
	row: TrackRow,
	index: number,
	resolve: FieldResolver,
	shared: string | number | boolean | null | undefined,
	stored: string | null | undefined,
): number | null {
	if (!isRowSet(config)) return segmentCount(config, shared);
	if (row.maxSource === 'character') return characterLength(config, stored);
	if (row.count !== undefined) {
		return segmentCount(config, resolve(`rows.${index}.count`, {}));
	}
	// A row without its own falls back to the component's, which is the point
	// of the component still carrying one.
	return config.count === undefined ? null : segmentCount(config, shared);
}

/**
 * What a count worked out to, where that is a number the run cannot draw.
 *
 * `segmentCount` refuses anything below one, so a penalty pushed at a run's
 * length reaches a caller having resolved perfectly well — and `explainField`
 * correctly has nothing to say, because no formula failed. This is the sentence
 * that replaces the false one.
 *
 * Only a `number` counts as "worked out": a failed evaluation resolves to
 * `null`, and `Number(null)` is 0, which would put the honest sentence on the
 * dishonest branch.
 *
 * Here rather than inline because two carriers say it — the "?" the card draws,
 * and the popover the breakdown button opens on the one kind of card where the
 * reader has nothing else to read.
 */
function worksOutTo(value: unknown): string | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return `This run works out to ${Math.floor(value)} segments.`;
}

/** The card's own `count`, and what a modifier did to it. */
interface CardCount {
	/**
	 * How many segments the card draws, or null where it draws none: the live
	 * run, or the *unmodified* run where a penalty is holding part of it shut.
	 */
	drawn: number | null;
	/** How many of those a press can reach. Zero where a penalty took them all. */
	live: number;
	/**
	 * How many of the live segments a modifier granted, counted from the far
	 * end. Zero where the run's length publishes no name to be pushed at, and
	 * zero on every card that ships today.
	 */
	granted: number;
	/**
	 * How many segments a penalty put out of reach, counted from the far end
	 * and drawn past the live ones.
	 *
	 * **Never nonzero at the same time as `granted`.** A modifier slot holds one
	 * number, so a run is either longer than the layout wrote it or shorter, and
	 * the two marks can never land on one segment.
	 */
	blocked: number;
}

/**
 * One reading of `count` for everything a render does with it: the run drawn,
 * how much of that run was granted, and the length the **Add** form seeds a new
 * row with.
 *
 * **One helper because the grant is a difference between two resolutions**, and
 * a second derivation of either half is a granted tail that disagrees with the
 * run it is drawn on. `PATTERNS.md` §1's `roundSum` rule read on an arithmetic
 * rather than on a number: share the application, not the inputs.
 *
 * **The grant is measured, not declared, and the mechanism is the bug read
 * backwards.** `context.resolved['count']` is now evaluated *as* the published
 * name `<id>.count`, so `mod.self` inside it reads the slot; resolving the same
 * field with no name is what zeroes that slot, which is exactly what the field
 * used to do everywhere. The difference between the two is therefore what the
 * push is worth *after* the formula has had its way with it —
 * `floor((3 + mod.self) / 2)` has a slot total of +2 and grants one segment, and
 * reading the slot total instead would say two.
 *
 * **It is also why nothing has to scan the formula text.** A run whose `count`
 * reads the absolute spelling — `3 + mod.exhaustion.count` — resolves to the
 * same number either way, because only `mod.self` is sensitive to the name, so
 * it correctly draws a longer run with nothing marked as granted. `docs/UI.md`
 * §9's wide set still decides whether there is a breakdown to read.
 *
 * **A penalty is the same subtraction read the other way, and what it produces
 * is drawn rather than thrown away.** The slots an item takes stay on the card
 * and read as blocked: present and unusable, which is a state rather than a
 * second ceiling. (This was `Math.max(0, …)` and the negative half was
 * discarded; `docs/features/modifier-granted-track-segments.md` carries the
 * argument that replaced it.)
 *
 * Where the base does not resolve to a drawable run but the modified one does —
 * `count: "mod.self"` — the base is nothing and every segment is granted. Where
 * neither resolves, nothing is drawn and `render` shows "?".
 *
 * **`published` is the name this card's `count` becomes, and it gates the grant
 * here rather than at the caller**, so the member's own doc is a property of
 * this function rather than of one call site: no name is no slot, so nothing
 * could have been pushed, so nothing could have been granted. The arithmetic
 * would reach zero by itself everywhere the name is absent — the gate is belt
 * and braces, and a rule that holds by accident is one the next row shape can
 * take away. Taken as an argument rather than looked up, because looking it up
 * would mean this module-level helper naming the definition it lives inside.
 */
function cardCount(
	config: TrackConfig,
	context: Pick<RenderContext, 'resolved' | 'resolveField'>,
	published: string | undefined,
): CardCount {
	const modified = segmentCount(config, context.resolved['count']);
	const unmodified = segmentCount(config, context.resolveField('count', {}));
	// A push this component publishes no name for cannot have moved anything,
	// so the run is whatever it resolved to and nothing is marked either way.
	if (published === undefined) {
		return { drawn: modified, live: modified ?? 0, granted: 0, blocked: 0 };
	}
	const base = unmodified ?? 0;
	const live = modified ?? 0;
	// The unmodified run wherever a penalty is holding part of it shut, and the
	// live run otherwise. Null where there is no run either way.
	const drawn = Math.max(base, live);
	return {
		drawn: drawn < 1 ? null : drawn,
		live,
		granted: Math.max(0, live - base),
		blocked: drawn - live,
	};
}

/**
 * Why a character-owned row's length field commit cannot be stored, or null.
 *
 * A note reference, as everywhere else that reaches a fence — Passport's own
 * words, ported one component over, since a Track row has no name and no body
 * to redirect a link into either. **And a slash**, which this feature made
 * syntax: `parse/bounded-entry.ts` splits an entry at its first one, so a
 * length holding a slash is not a length that module can write back —
 * Record set's `refuseNumber` states the identical reason for its own
 * ceiling field.
 */
function refuseRowLength(text: string): string | null {
	const link = fencedLinkRefusal(text, {
		subject: "A row's marks and length",
		instead:
			'Type the plain number here, and put the link in a Rich text block or a table cell, which store markdown.',
	});
	if (link !== null) return link;
	if (!text.includes('/')) return null;
	return `Not saved. A slash separates the marks from the length they are read against, so "${text}" would be stored as two numbers rather than one. Type just the number here.`;
}

/**
 * Why this entry's value half is not a mark count this card can read, or null.
 *
 * Only the value half is looked at. The ceiling half, where one is there at
 * all, is a character-owned row's own length and is not this method's
 * business — `docs/features/track-row-length.md`'s rule that a ceiling which
 * is not a number behaves as no ceiling rather than as a malformed entry.
 *
 * A number the run cannot represent is still a number and is left exactly as
 * it is (SPEC §7). Something that is not one at all is a malformed section,
 * reported on this component alone.
 *
 * A flag's spelling is accepted on *every* run, not only on a flag card, and
 * that is the whole answer to a layout raising its count from 1 to 3: the
 * narrow rule would turn every note the flag ever wrote into an error card at
 * the moment the layout changed. `yes` on a ten-segment run is one mark;
 * `maybe` is still malformed.
 *
 * One function because `read` asks it of a declared row's entry and of a
 * character-added one, and the two must not drift: a spelling this card
 * accepts under a key the layout names has to be the same spelling it accepts
 * under a key the character typed, or the same note read either side of a
 * config edit disagrees about whether it is malformed.
 */
function marksProblem(config: TrackConfig, raw: string): string | null {
	const text = splitBounded(raw).value.trim();
	if (text === '' || readsAsMarks(text)) return null;
	// Named for what this card writes, not for what a Track writes in general:
	// a checkbox stores yes and no, so telling its author about marks points
	// them at a spelling that card never produces. SPEC §10 wants the fix
	// rather than the fault, and here the two are different sentences for the
	// same fault.
	return isFlagCard(config)
		? `"${text}" is not yes or no.`
		: `"${text}" is not a number of marks.`;
}

/**
 * The rows the character added, as rows.
 *
 * **A row the character added *is* a `maxSource: 'character'` row** whose key
 * and whose name are the name they typed, and saying so here is what lets
 * every path below reach one without a second shape: `countFor` reads its
 * length off its own entry, the length field draws, a press joins through the
 * composite, and `applyReset` walks it on identical terms. The mode is implied
 * by the key not being declared, so nothing in the note says any of this.
 *
 * Read off `TrackData.own` rather than off `values`, for the reason that
 * member exists: a plain object's key order is not the note's.
 *
 * Gated on the toggle as well as on the data, so turning it off hides every
 * one of them on the next render without touching a byte of the note.
 */
function ownRows(
	config: TrackConfig,
	data: TrackData | null | undefined,
): TrackRow[] {
	if (config.openRows !== true) return [];
	return (data?.own ?? []).map((key) => ({
		key,
		name: key,
		maxSource: 'character' as const,
	}));
}

/**
 * Why this typed name cannot name a row on this card, or null.
 *
 * One list, two callers: the **Add** form's **Name** field, where the name is
 * checked before the entry exists, and a drawn row's own name field, which is
 * the rename. `taken` is every name already spoken for — every declared row's
 * key and every key this character's fence holds — minus the caller's own,
 * which a rename has to be allowed to keep.
 *
 * **This is the one lenient function in the component, and it can only ever
 * prevent a write.** The fence is exact everywhere else: what `readFenced`
 * stores, which declared row an entry maps to, what `write` addresses and what
 * `renameFencedEntry` calls a collision are all byte-exact and
 * case-sensitive, so `d6` and `D6` are two entries and both survive. Here the
 * comparison folds case, and it folds in the *refusing* direction — the plugin
 * will not create a pair differing only in case, and it will not repair one a
 * hand-edit made, because repairing means writing over a name the user typed.
 * A fold in one place and not the others is precisely the failure this
 * arrangement is shaped to avoid.
 *
 * **`parse/row-claims.ts` is deliberately not reused**, though its `claimRows`
 * folds case too. That is safe on a Table because no formula names a row
 * there, so what a row's capitalisation can change is which declared row
 * claims it and never what any arithmetic resolves. Here the rest of this file
 * addresses by exact key, so a lenient claim would have a declared `d6` claim a
 * note's `D6` while `read`, `write`, `applyReset` and `scopeValues` went on
 * looking for `d6` and finding nothing.
 */
function refuseRowName(text: string, taken: readonly string[]): string | null {
	const name = text.trim();
	if (name === '') {
		// A fence entry with no key is not an entry, and `ENTRY`'s own regex
		// would read a whitespace-only key back as the empty string.
		return 'A row needs a name.';
	}
	const problem = fencedKeyProblem(name);
	if (problem !== null) return `A row name ${problem}.`;
	const link = fencedLinkRefusal(name, {
		subject: 'Row names',
		instead:
			'Type the plain name here, and put the link in a Rich text block or a table cell, which store markdown.',
	});
	if (link !== null) return link;
	const folded = name.toLowerCase();
	if (folded === VALUE_KEY) {
		// SPEC §3.1 reserves it, and `runsOf` synthesises it for a plain run —
		// so an entry under this key would become the card's own run the
		// moment an author turned the toggle back off.
		return `"${VALUE_KEY}" is the entry a card with a single run stores under, so a row cannot be called that. Pick another name.`;
	}
	const clash = taken.find((held) => held.trim().toLowerCase() === folded);
	if (clash !== undefined) {
		// Naming the spelling that is already there, so a reader who typed
		// `goblins` beside a stored `Goblins` can see what they collided with.
		return `"${clash}" is already a row here, so this card cannot hold a second one called that.`;
	}
	return null;
}

export const track: ComponentDefinition<TrackConfig, TrackData> = {
	type: 'track',
	description: 'A row of boxes marked in order, as a count or as named levels.',
	storage: 'fenced',
	// `reset.*.to` rather than `reset.to`: the bindings are a list, so each
	// one's expression lives at its own index and the sheet rewrites the
	// logical name to that index before the component asks for it.
	// `rows.*.count` is the same idea for a set — a caster whose slots come
	// from a level table writes each row's length as an expression.
	formulaFields: ['count', 'rows.*.count', 'reset.*.to'],
	configFields: [
		{
			key: 'count',
			kind: 'formula',
			label: 'Segments',
			description:
				'How many segments a run holds, as a number or a formula, e.g. 10, or 2 + if(abilities.PHY >= 3, 2, 1). Ignored where the levels below are named. Where there are rows it is the fallback for a row that sets no length of its own. A plain 1 makes this a checkbox: two states, drawn as one ring, stored in the note as yes or no rather than as a count. A formula that happens to work out to 1 does not, since the note would then change spelling whenever the number behind it did. Write mod.self here to let an item or a spell lengthen the run: the segments it grants are drawn apart from these, filled last, and go away with it rather than being written into the note.',
		},
		{
			key: 'marks',
			kind: 'number',
			label: 'Marks per segment',
			description:
				'How many presses fill one segment. Defaults to 1, and applies to every row. An Ironsworn progress track is ten segments of four marks. The note stores marks either way, so a segment count and a remainder can never disagree.',
		},
		{
			key: 'sense',
			kind: 'select',
			label: 'Sense',
			description:
				'Which end of a run is the bad end. XP and a countdown clock are the same widget pointed in opposite directions, and nothing in the data says which this is. Harm grades the run toward the boundary colour; it never stops a press, since whether a track may be pushed past its last segment is a rule of the game. Where there are rows this is what a row falls back to, as the segment count above is.',
			options: ['progress', 'harm'],
		},
		{
			key: 'rows',
			kind: 'track-rows',
			label: 'Rows',
			// A row's name column is headed "Name" and not "Full name": a row
			// is named for what it is — a spell level, a death save — where a
			// Card set's entry has an abbreviation on the card and the full word
			// behind it. The editor's list field cannot know that, which is why
			// each field says it (docs/PATTERNS.md §1).
			entryColumns: [
				{ key: 'key', heading: 'Key' },
				{ key: 'name', heading: 'Name' },
			],
			addressesEntry: { fence: 'section' },
			description:
				'One run per entry, sharing a heading, a reset binding and a write. Spell slots are five first-level, three second and one third. Each key names the entry in the character note, and renaming one moves it in every note on this layout; a row with no length of its own falls back to the segment count above. A row\'s length may be the layout\'s formula or the character\'s own number, typed on the sheet — the character\'s for a die type, a slot level, or anything else whose count differs per character rather than being computed. Characters may add rows of their own beside these, where the setting below allows it. Rows and named levels do not combine. With one segment each, rows make a checklist of flags under one heading.',
		},
		{
			key: 'openRows',
			kind: 'boolean',
			label: 'Characters may add rows',
			description:
				'Adds a control under the runs for naming a row of this character\'s own and choosing how many segments it holds — a counter this actor keeps and no other does. Rows a character adds are theirs to rename and remove, and no formula can name one, so a value another card has to read belongs in a row declared above. The rows declared above are unaffected. Turning this off hides the rows characters added without deleting them, and turning it back on brings them back. Refused where the runs are named levels, or where every run is one segment.',
			default: false,
		},
		{
			key: 'levels',
			kind: 'text-list',
			label: 'Level names',
			description:
				'Names the steps from none upwards, comma separated, e.g. Rested, Exhaustion 1, Exhaustion 2. A name may carry one glyph after a colon, as in "Exhaustion 6:☠". Naming the levels settles how many segments there are, so this wins over the count above. On a checkbox, naming the levels letters its ring.',
		},
		{
			key: 'hideLabel',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide label',
			description:
				'Leave the heading off the sheet. Worth it only under a heading that already names the run.',
			default: false,
		},
	],
	/*
	 * A checkbox is this component with `count: 1`, and it is the entry that
	 * took Toggle out of the catalog (SPEC §13). Nobody wanting a checkbox looks
	 * for a component called Track, which is exactly what a palette entry is for
	 * and the whole of why Toggle looked like it needed to exist.
	 */
	palette: [
		{
			name: 'Checkbox',
			description: 'One yes-or-no flag, drawn as a single ring.',
			config: { count: 1 },
		},
	],

	/*
	 * What the component picker draws for a bare Track, whose empty config draws
	 * an empty-state line and no run. Five segments rather than Checkbox's one, so
	 * the bare type is shown as the row of boxes it is and never borrows an
	 * entry's config. Never inserted, which is why the picker labels it.
	 */
	example: { count: 5 },

	/*
	 * Every run part-marked, under the layout's own keys and in this card's own
	 * spelling — which is `spelledMarks`' whole job, so nothing here learns
	 * whether it is filling a checkbox or a ten-segment clock.
	 *
	 * **A flag alternates instead of filling.** A run of one segment has two
	 * states and no inside, so "partial" has no meaning on it and the rule that
	 * applies is the other one: a checklist shows both paints, set first, so a
	 * card of one flag still shows the marked state an empty canvas could not.
	 *
	 * **A run whose length is a formula gets one segment.** The length resolves
	 * against the whole sheet and a component never sees that environment, so
	 * the honest filler is the smallest part any run has: one segment is
	 * partial for every count above one, where a guess at the ceiling could
	 * fill the run to its end and draw the one state this preview exists to
	 * avoid.
	 *
	 * Two runs of the same length fill alike, deliberately. A run's marks are
	 * read against its own end rather than against its neighbour's — death
	 * saves are three and three — so varying them by position would be filler
	 * pretending to be a character.
	 */
	sample(config): string {
		// A card that cannot be drawn is not filled: `render` reports the
		// configuration instead, and a body under a key this card refuses would
		// be a second thing wrong on it. Card's own rule, one component over. A
		// card with no length is not filled either: it has no run to fill, and
		// `render` draws its empty state whatever the section holds.
		if (configError(config) !== null || awaitsLength(config)) return '';
		const marks = markSize(config);
		const flag = isFlagCard(config);
		const updates = new Map<string, string>();
		const rows = runsOf(config);
		// Left un-added, so an author's first preview already shows the
		// **Add** control rather than a row set that looks permanently full
		// (`docs/features/track-row-length.md`).
		const lastCharacterOwned = [...rows]
			.reverse()
			.find((row) => row.maxSource === 'character')?.key;
		// `row.key` verbatim, as `read`, `write` and `applyReset` all take it: the
		// guard above has already refused a key the fenced block could not hold —
		// blank, holding a colon or a line break, or repeated — and a card with no
		// rows runs under `runsOf`'s own synthesised `value`.
		rows.forEach((row, index) => {
			if (flag) {
				updates.set(row.key, spelledMarks(config, sampleFlag(index) ? 1 : 0));
				return;
			}
			if (row.maxSource === 'character') {
				if (row.key === lastCharacterOwned) return;
				// Its own length as well as its own fill, seeded off the row's
				// own key so two character-owned rows on one card draw
				// different lengths rather than the same number twice — what
				// an author needs to see to believe the length varies per row.
				const ceiling = sampleNumber(sampleSeed(config.id + row.key));
				const filled = samplePart(ceiling * marks);
				updates.set(
					row.key,
					withCeiling(spelledMarks(config, filled), String(ceiling)),
				);
				return;
			}
			const count = segmentCount(config, row.count ?? config.count);
			updates.set(
				row.key,
				spelledMarks(config, count === null ? marks : samplePart(count * marks)),
			);
		});
		/*
		 * One row the character added, so an author can see what the toggle
		 * does to the card before opening a character note.
		 *
		 * **It invents no vocabulary** (SPEC §4.1): the name comes from the
		 * config, exactly as Table's open-row sample takes its names from the
		 * name column's own heading. One rather than two, because what is
		 * being shown is that the character's rows sit after the layout's and
		 * wear a field for a name — a second one says nothing the first does
		 * not.
		 *
		 * **Skipped on the same guard the two character-facing paths use**, and
		 * that is the point rather than convenience: the name is composed from
		 * `config.label`, which is author free text, so this is the one place
		 * in the component where text nobody checked becomes a fence key. A
		 * narrower gate let a label holding a wikilink compose one — Constraint
		 * 2, since Obsidian indexes no link inside a fence — and neither
		 * `contract.test.ts`'s "puts no wikilink in a sample" nor the round
		 * trip could see it, because every configuration either sweeps is
		 * labelled in plain words. It also subsumes what this used to check by
		 * hand: a duplicate of a declared key, and a key the fence could not
		 * hold.
		 */
		if (config.openRows === true) {
			const name = sampleText(config.label, 0);
			if (refuseRowName(name, rows.map((row) => row.key)) === null) {
				const ceiling = sampleNumber(sampleSeed(config.id + name));
				const filled = samplePart(ceiling * marks);
				updates.set(
					name,
					withCeiling(spelledMarks(config, filled), String(ceiling)),
				);
			}
		}
		return updates.size === 0 ? '' : writeFenced(null, updates);
	},

	read(body, config): ReadResult<TrackData> {
		const parsed = readFenced(body);
		if (!parsed.ok) return parsed;
		// No fence yet: an editable empty card, not an error.
		if (parsed.values === null) return { ok: true, data: null };
		// Keyed by text out of the note once the toggle is on, so it may not
		// inherit from `Object.prototype` — Table's own rule for the same
		// reason, one storage over. A hand-edited `__proto__:` or `toString:`
		// line is a key like any other here, and on a plain object literal the
		// first sets a prototype instead of an entry and the second reads back
		// as a function.
		const values = Object.create(null) as Record<string, string>;
		const declared = runsOf(config);
		for (const row of declared) {
			const raw = parsed.values.get(row.key);
			if (raw === undefined) continue;
			const problem = marksProblem(config, raw);
			if (problem !== null) return { ok: false, error: problem };
			values[row.key] = raw;
		}
		if (config.openRows !== true) {
			// An entry no row maps to is not read, and `write` touches only the
			// entries it is given — so it stays in the note untouched, which is
			// what makes a slot table safe to re-cut (§7).
			//
			// **With the toggle on that guarantee inverts**, which is the one
			// thing this feature costs: the leftover entry of a dropped
			// declared row is no longer unmapped-and-invisible, it is a row the
			// character owns, drawn and named after the key the author just
			// removed. Accepted rather than mitigated, because the typed name
			// is the only identity a fence has and nothing distinguishes a
			// leftover from a row the character typed. What is lost is
			// quietness, not data: turning the toggle off again hides every one
			// of them without deleting one.
			return { ok: true, data: { values } };
		}
		/*
		 * The character's own, in the order `readFenced`'s `Map` holds them,
		 * which is the note's own order and the only order the file states.
		 *
		 * The map lookup above is what claims a declared row, exactly and
		 * case-sensitively, so a note holding `D6` under a layout declaring
		 * `d6` leaves the declared row empty and reads `D6` as the
		 * character's — two rows on screen, which is the honest consequence of
		 * exactness and visible rather than silent.
		 */
		const spoken = new Set(declared.map((row) => row.key));
		const own: string[] = [];
		for (const [key, raw] of parsed.values) {
			if (spoken.has(key)) continue;
			// Validated as marks the same way a declared row's entry is, which
			// is what `marksProblem` being one function guarantees.
			const problem = marksProblem(config, raw);
			if (problem !== null) return { ok: false, error: problem };
			values[key] = raw;
			own.push(key);
		}
		return {
			ok: true,
			// Absent rather than empty where the character has added nothing,
			// so a card with the toggle on and no rows of its own reads exactly
			// as it did with the toggle off.
			data: own.length === 0 ? { values } : { values, own },
		};
	},

	scopeValues(data, config): ScopeValues {
		const marks = markSize(config);
		const flag = isFlagCard(config);
		const filled = (key: string): number | undefined => {
			const held = marksFrom(data?.values[key]);
			return held === null ? undefined : Math.floor(held / marks);
		};

		/*
		 * A flag publishes a boolean, under its name and under `<name>.value`
		 * alike, which is what Toggle promised and what a `toggle` column's cell
		 * already means to a formula. So `if(inspiration, 1, 0)` is the
		 * expression an author writes for one and it works, where 1 and 0 would
		 * have made it an error. The two names carry the same answer here, and
		 * saying nothing new under `.value` is what the entry below already does
		 * wherever a segment holds one mark.
		 *
		 * An entry the note does not have publishes `false` rather than nothing.
		 * A flag has two states and no room for a third; the empty ring on
		 * screen reads as "no"; and the alternative is a "?" beside every unset
		 * flag on a new character's sheet, which is the argument the aggregate
		 * already makes for an empty inventory weighing nothing. A numeric run
		 * still publishes nothing when its entry is blank, because a run's fill
		 * is a count whose own ceiling can fail to resolve.
		 */
		if (flag) {
			const entry = (key: string): ScopeEntry => ({
				value: (marksFrom(data?.values[key]) ?? 0) >= 1,
			});
			if (isRowSet(config)) {
				const named: Record<string, ScopeEntry> = {};
				for (const row of config.rows ?? []) named[row.key] = entry(row.key);
				return { named };
			}
			// `<id>.count` as a literal, because a numeric run publishes one and a
			// layout lowering its count to 1 must not silently take a name away
			// from every formula reading it — the continuity a raised count gets
			// on the read side. A checklist publishes none, exactly as a numeric
			// row set does: a set of runs has no one ceiling to name.
			return { self: entry(VALUE_KEY), named: { count: { value: 1 } } };
		}

		/*
		 * The stored marks, and the segments they fill, on one entry. A name is
		 * worth the boxes a reader can see — `exhaustion - 1` is written about
		 * those, not about a mark total whose size depends on a config field no
		 * formula can see — and §5 still wants the raw number reachable, which
		 * `<name>.value` is. Where a segment holds one mark the two are the
		 * same number and this says nothing new.
		 *
		 * `compute` rather than `display` because dividing the marks by the
		 * marks a segment holds is not one of this component's formula fields
		 * and could not be made into one: how many marks a segment holds is
		 * layout configuration, not a name any formula on the sheet can see.
		 */
		const run = (key: string, left?: ScopeEntry['left']): ScopeEntry => ({
			// `read` never stores null; only a write delta ever does.
			value: data?.values[key] ?? undefined,
			compute: () => filled(key),
			...(left !== undefined ? { left } : {}),
		});

		if (isRowSet(config)) {
			// A component holding several values answers to `<id>.<name>`, as
			// `abilities.DEX` does, and not under its bare id: there is no one
			// number a set of runs could mean.
			//
			// A row set's own ceiling has nowhere to publish today — its
			// entries already reach `<id>.<key>`, which is one segment short of
			// a third for the ceiling to sit at (SPEC §13) — so a row-set
			// entry gets `left` where a plain run does not: a plain run's own
			// id is already the ceiling's home, at `<id>.count`, so a second
			// name for the same fact there would be a second spelling of an
			// equation a formula can already write. The row and its index are
			// only needed inside the `left` closure itself — `countFor`, the
			// same helper `render` and `applyReset` already share for a row's
			// ceiling, resolves `rows.<index>.count` — so `run` still builds
			// the shared `value`/`compute` shape; only the extra argument
			// differs.
			const named: Record<string, ScopeEntry> = {};
			for (const [index, row] of (config.rows ?? []).entries()) {
				named[row.key] = run(row.key, (resolve) => {
					const count = countFor(
						config,
						row,
						index,
						resolve,
						resolve('count', {}),
						data?.values[row.key],
					);
					if (count === null) return undefined;
					// Unclamped, like the entry it sits beside: an overfull row
					// already publishes a `<id>.<key>` past its own `.count`
					// (SPEC §7's "a stored value outside the run is rendered,
					// not corrected"), and flooring `.left` alone would put the
					// two suffixes at odds about the same row. Publishes
					// nothing wherever either half fails to resolve — the
					// row's count formula, or a fill the note has not stored
					// yet — on SPEC §5's blanket "a name that will not
					// resolve publishes nothing", one row's failure never
					// taking the others with it.
					const held = filled(row.key);
					return held === undefined ? undefined : count - held;
				});
			}
			return { named };
		}

		const named: Record<string, ScopeEntry> = {};
		if (config.levels !== undefined) {
			named.count = { value: config.levels.length - 1 };
		} else if (config.count !== undefined) {
			// A formula like a Pool's max, evaluated lazily because it may
			// reference another component.
			named.count = { display: { field: 'count', scope: {} } };
		}
		return { self: run(VALUE_KEY), named };
	},

	write(data, body): string {
		/*
		 * The rename first, then the value deltas, and the order is
		 * load-bearing: a rename and an unrelated edit arriving in one commit
		 * would otherwise address a key that no longer exists.
		 *
		 * `renameFencedEntry` rewrites the key token alone and puts the
		 * separator, the value, the trailing text and the line ending back
		 * verbatim, so the marks, the length and the line's position in the
		 * fence all survive. A delete plus an add would not: `writeFenced`
		 * flushes a key it did not find at the closing fence, so the row would
		 * silently move to the bottom of the reader's block.
		 *
		 * A `collision` is a state the name field's own guard already
		 * excluded, and an `absent` one is a rename of a key this body has not
		 * got. Both leave the body exactly as it was rather than being
		 * half-applied — for a rename delta, whose `values` is empty, that is
		 * the whole of the write.
		 */
		let next = body;
		if (data.rename !== undefined) {
			const renamed = renameFencedEntry(
				next ?? '',
				data.rename.from,
				data.rename.to,
			);
			if (renamed.kind === 'renamed') next = renamed.body;
		}
		/*
		 * **This walks `values`, which `TrackData.own` says nothing may take an
		 * order off, and the exemption is a property of `writeFenced` and of
		 * the callers rather than of this loop.**
		 *
		 * `writeFenced` addresses an entry the body already holds by key and
		 * rewrites it in place, so for those the order here is not observable
		 * at all. It is observable for a key the body does *not* hold, which is
		 * appended at the closing fence in the order it arrives — and a row the
		 * character added always has an entry by construction, so it is never
		 * one of those. The order `own` exists to protect is therefore never
		 * decided here.
		 *
		 * What can be new is a *declared* row's key, whose order is `rows[]`'s
		 * and not the note's. **`Object.create(null)` does not help with any of
		 * this** — a prototype has nothing to do with key order, and an
		 * integer-like key sorts first whatever the object inherits from. So a
		 * layout declaring rows keyed `10` and `d6`, both unstored and both
		 * pressed inside one debounce window, would append them in numeric
		 * order rather than declared order. That is the whole of the residue,
		 * it predates this feature, and it is recorded here so the next delta
		 * shape that can create several entries at once knows it has to carry
		 * its own order rather than inherit one from an object.
		 */
		const updates = new Map<string, string | null>();
		for (const [key, value] of Object.entries(data.values)) {
			updates.set(key, value);
		}
		return writeFenced(next, updates);
	},

	applyReset(data, config, reset, context): ResetResult<TrackData> {
		const marks = markSize(config);
		// The character's rows beside the declared ones, on identical terms:
		// a character-added row is inert to formulas and is deliberately not
		// inert to triggers, which is the one place the second-class outcome
		// is avoided rather than accepted. Every branch below already knows
		// what to do with a `maxSource: 'character'` row, and that is exactly
		// what one of these is.
		const rows = [...runsOf(config), ...ownRows(config, data)];
		const flag = isFlagCard(config);
		// Null-prototype for `read`'s own reason: with the toggle on, a row's
		// key is text out of the note.
		const values = Object.create(null) as Record<string, string>;
		// §6's `full` and `empty` name the states rather than the numbers
		// precisely so that one set of three actions covers a Pool's max and zero
		// and a flag's yes and no, and `spelledMarks` is where that pays: no
		// branch below learns which kind of card it is on.

		if (reset.action === 'empty') {
			// Nothing to resolve: empty is zero whatever a run's length is, so
			// a track whose count is broken can still be cleared. Through the
			// join, so a character-owned row's own length survives — an
			// emptied counter is `0 / 4` and never `0` (Constraint 4).
			//
			// A character-owned row with no entry at all is left absent rather
			// than materialised: writing to it would *add* a row the character
			// never asked for, which is not what a reset is for — Record set's
			// own reset never adds or removes a record either.
			for (const row of rows) {
				if (row.maxSource === 'character' && data?.values[row.key] === undefined) {
					continue;
				}
				values[row.key] = withValue(data?.values[row.key] ?? '', spelledMarks(config, 0));
			}
			return { ok: true, data: { values } };
		}

		if (flag && reset.action === 'full') {
			// A flag resolves nothing, here as on the card: its length is a
			// literal by construction (`isFlagCard`), so `full` is `yes` and has
			// no ceiling to go and ask for. That gives it the property `empty`
			// above already has, which is worth having on both — a card whose
			// formulas are in a bad way can still be ticked and cleared.
			for (const row of rows) values[row.key] = flagText(true);
			return { ok: true, data: { values } };
		}

		if (reset.action === 'full') {
			/*
			 * Every row, in one write. This is the concrete argument for rows
			 * over three components: a long rest that has to find three Tracks
			 * is three bindings kept in step by hand and three writes the undo
			 * has to be pressed three times to reverse.
			 */
			for (const [index, row] of rows.entries()) {
				const stored = data?.values[row.key];
				const count = countFor(
					config,
					row,
					index,
					(field, scope) => context.resolve(field, scope),
					context.resolve('count', {}),
					stored,
				);
				if (count === null) {
					// A character-owned row with no length typed yet — added
					// with a blank length, or not added at all — is, in the
					// ordinary case, a die type this character does not have —
					// Record set's per-record argument one level up. Skipping it
					// rather than failing is what keeps a Long Rest from
					// refusing every other row on the card over one blank one;
					// the entry, if any, is left exactly as it was, and a row
					// with no entry at all stays absent rather than gaining one.
					if (row.maxSource === 'character') continue;
					const where = isRowSet(config) ? ` for "${row.name ?? row.key}"` : '';
					return {
						ok: false,
						error:
							context.explain(
								row.count !== undefined ? `rows.${index}.count` : 'count',
								{},
							) ?? `it has no segments to fill${where}.`,
					};
				}
				// The join, so a character-owned row's own length rides through
				// the write rather than being replaced by a bare mark count.
				values[row.key] = withValue(stored ?? '', spelledMarks(config, count * marks));
			}
			return { ok: true, data: { values } };
		}

		if (reset.action === 'formula') {
			const value = context.resolve('reset.to', {});
			if (value === null) {
				return {
					ok: false,
					error: context.explain('reset.to', {}) ?? 'its reset formula is empty.',
				};
			}
			const segments = Number(value);
			if (!Number.isFinite(segments)) {
				return {
					ok: false,
					error: `its reset formula produced "${String(value)}", which is not a number of segments.`,
				};
			}
			// The expression is written in segments, because that is what the
			// run publishes and what an author counts. Down to the nearest
			// mark, so half a segment of an Ironsworn track lands on a mark
			// boundary rather than storing a fraction the note cannot mean.
			const next = spelledMarks(config, Math.floor(segments * marks));
			// Through the join per row, same as the other two actions: a
			// character-owned row's own length survives a formula reset too.
			// A row with no entry at all stays absent, on the same argument
			// `empty` above makes: a reset must not add a row nobody added.
			for (const row of rows) {
				if (row.maxSource === 'character' && data?.values[row.key] === undefined) {
					continue;
				}
				values[row.key] = withValue(data?.values[row.key] ?? '', next);
			}
			return { ok: true, data: { values } };
		}

		// A binding carrying only a buffer instruction, which a track has none
		// of. Nothing to do, and nothing failed.
		return { ok: true, data: { values } };
	},

	render(container, config, data, context): void {
		const doc = container.ownerDocument;
		const view = doc.defaultView;
		container.replaceChildren();

		const card = container.createDiv('sheetsmith-track');

		const problem = configError(config);
		if (problem !== null) {
			// A misconfigured component reports on itself; SPEC §10 keeps the
			// rest of the sheet rendering and editable.
			const error = card.createDiv('sheetsmith-error');
			error.textContent = problem;
			return;
		}

		if (awaitsLength(config)) {
			// No run, no control and no breakdown: there is no length for any
			// of them to be about. The label is still drawn, so the card says
			// which component the line is about. A stored value is left alone —
			// `read` never asks this question, so it is kept and written as is.
			renderLabel(card, config, context);
			card.createDiv({ cls: 'sheetsmith-table-empty', text: NO_LENGTH_MESSAGE });
			return;
		}

		/**
		 * The name this card's own `count` publishes under, or absent where it
		 * publishes none.
		 *
		 * **Asked rather than spelled**, which is the same decision the reset path
		 * takes one layer out. A `<id>.count` written here would be a second copy
		 * of the conditions `scopeValues` already decides — a row set publishes no
		 * ceiling at all (SPEC §13's open name-depth question), and named levels
		 * and a flag publish theirs as a literal — and a predicate in two places is
		 * what `PATTERNS.md` §1's one-step tier refuses.
		 */
		const countName = publishedFieldNames(track, config).get('count');

		/** The card's own `count` and what a modifier did to it, once per render. */
		const ownCount = cardCount(config, context, countName);

		/**
		 * What a modifier is doing to this card's run, as one block of text, or
		 * null where nothing is.
		 *
		 * **One string and one builder, whatever the carrier.** It is the popover
		 * the button below opens *and* the `.sheetsmith-sr-only` twin the run
		 * points at, so a pointer and a screen reader cannot be told different
		 * things about one number — the rule the `title` and the twin were already
		 * held to, with the carriers changed under it.
		 *
		 * **It follows the wide set, which the granted drawing deliberately does
		 * not.** A breakdown answers "has anything been pushed at this name",
		 * which is a question about the name; the dashed tail answers "how much of
		 * this length came from a push", which is a question about the formula. A
		 * run whose `count` reads `mod.exhaustion.count` gets the door and no
		 * dashes, and that is right on both counts.
		 *
		 * Row sets get none by the same absence everything else here turns on:
		 * `countName` is undefined, so there is no name to break down.
		 */
		const cardPushed =
			countName === undefined
				? null
				: modifierBreakdown(
						context.modifiers?.breakdown(countName),
						ownCount.live,
					);

		/**
		 * What this card's own count worked out to, where the card draws no run
		 * at all.
		 *
		 * Gated on nothing being drawn, which is narrower than "the count is
		 * below one": a penalty a run has slots to absorb draws them blocked, and
		 * the blocked slots *are* the reading — saying "works out to −3" over a
		 * drawn run would be a second account of a picture the reader has.
		 */
		const worksOut =
			ownCount.drawn === null ? worksOutTo(context.resolved['count']) : null;

		/**
		 * What the breakdown button opens.
		 *
		 * **The popover carries what the reader cannot otherwise see, and that is
		 * one rule rather than two.** Where a run is drawn, the reading is the
		 * segments and `aria-valuetext` says it, so the popover holds the
		 * breakdown alone — repeating the reading would be the number said twice,
		 * which is why the run's own `title` gave it up. Where the card draws `?`
		 * there is no run to read and no `aria-valuetext` to carry one, so the
		 * sentence is said *nowhere* else and the popover is the only door to it.
		 *
		 * That state is the whole of why this matters: a `?` card told a reader
		 * who pushed at it and not what happened, and it is the card with least
		 * else to go on. The "?" glyph's own `title` and twin take this same
		 * string, so the three carriers cannot disagree.
		 */
		const withBreakdown = (lead: string): string =>
			cardPushed === null ? lead : `${lead}\n\n${cardPushed}`;
		const doorText = worksOut === null ? cardPushed : withBreakdown(worksOut);

		/*
		 * **A heading row, and only where there is something to put in it.** An
		 * unmodified card keeps the DOM it always had — the label as a direct
		 * child of the card — so nothing about the common Track moves.
		 */
		const heading = cardPushed === null ? null : card.createDiv('sheetsmith-track-heading');
		renderLabel(heading ?? card, config, context);
		if (heading !== null && cardPushed !== null) {
			/*
			 * **The door to the breakdown, and it is deliberately not the run.**
			 * A press on the run sets the value, so the second door a Card and a
			 * computed cell open on the number itself is not available here —
			 * which is what § *What a granted segment announces* concluded, and
			 * it stopped one step short: the conclusion it drew was `title`, and
			 * the answer is a *different control*. A native tooltip is slow,
			 * unstyled, truncates, and a finger never sees one at all.
			 *
			 * Beside the label rather than beside the run, for the reason the run
			 * cannot carry it: everything in the run's own row is either a target
			 * or a thing a drag passes over, and a control there would be pressed
			 * by accident on the way to setting a mark. The label is the one part
			 * of this card that answers no gesture.
			 *
			 * A glyph-only `<button>` is `docs/UI.md` §9's shape for exactly this.
			 * The press works on a pointer, under a finger and from the keyboard
			 * without a second code path, which is the whole of what it is for.
			 *
			 * **`info` and not `zap`, and the trade is worth recording because
			 * the bolt had a real argument.** Every existing `zap` on a sheet is
			 * a control that *edits* — a modifier cell's picker and the form it
			 * opens, where an author writes `endurance.count += 2` — so a reader
			 * who has learnt that a bolt opens something they can change would
			 * press this one expecting to and get a panel they can only read.
			 * What is given up is real: a design review found the bolt read as
			 * "what is affecting this" precisely *because* the same glyph is
			 * doing that job in a modifier column three cards up the same
			 * screen. That association against the edit/explain distinction, and
			 * the distinction won (`docs/UI.md` §9).
			 */
			const button = heading.createEl('button');
			button.type = 'button';
			button.classList.add('sheetsmith-track-modifier-button');
			setIcon(button, 'info');
			button.setAttribute('aria-label', `Modifiers on ${config.label}`);
			button.addEventListener('click', () => {
				showPopover(button, doorText ?? cardPushed);
			});
		}

		const marks = markSize(config);
		const rows = runsOf(config);
		const open = config.openRows === true;
		/**
		 * Every row the card draws: the layout's in `rows[]`'s own order, then
		 * the character's in the note's own order. Table's order exactly, and
		 * the only order the file itself states.
		 */
		const drawn = [...rows, ...ownRows(config, data)];
		/** Whether the row at this index is one the character named. */
		const isOwnName = (index: number): boolean => index >= rows.length;
		/** Every key already spoken for on this card, declared or typed. */
		const takenNames = drawn.map((row) => row.key);
		const rowSet = isRowSet(config);
		const named = config.levels !== undefined;
		const flag = isFlagCard(config);
		const cardHarm = config.sense === 'harm';
		const reduced =
			view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

		// A row's length field is the one part of this card that is a plain
		// typed value rather than a slider whose own `aria-valuetext` already
		// speaks for it, so it is the one part that needs a live region at
		// all — Pool's own reason for carrying one.
		const status = card.createDiv({
			cls: 'sheetsmith-sr-only',
			attr: { 'aria-live': 'polite' },
		});

		const list = card.createDiv('sheetsmith-track-rows');
		if (rowSet) {
			list.classList.add('sheetsmith-track-set');
			// The set is one control made of several, and a reader arriving on
			// it should be told what the several are of before being handed
			// the first one.
			list.setAttribute('role', 'group');
			list.setAttribute('aria-label', config.label);
		}
		// A stacked column of rings needs its rows further apart than a stacked
		// column of runs: the ring's hit target reaches past its own box, and at
		// the set's ordinary row gap two rows' targets overlap and the later ring
		// wins the press. Same arithmetic as the editor's level sample, for the
		// same reason.
		if (flag) list.classList.add('sheetsmith-track-flags');
		// A third subgrid column for the length field, added only where some
		// row actually needs one — an ordinary spell-slot card must not gain
		// a blank column nobody is using. Every row in this set then reserves
		// that column whether or not it is the one with a field in it, or a
		// mixed set's runs would misalign into whichever track its own row
		// happens to fill (`docs/features/track-row-length.md`).
		const lengthsInSet =
			rowSet && drawn.some((r) => r.maxSource === 'character');
		if (lengthsInSet) list.classList.add('sheetsmith-track-lengths');


		/** One run on the card: its own value, its own geometry, its own gesture. */
		interface Run {
			key: string;
			el: HTMLElement;
			segments: HTMLElement[];
			total: number;
			/** Marks currently shown, which is not yet what the note holds. */
			value: number;
			/** What the note holds, as text. Faint fill is the gap to it. */
			sent: string;
			/** Where a gesture in flight would land, or null when none is. */
			pending: number | null;
			paint: () => void;
			/**
			 * Move the run without writing, for both kinds of run.
			 *
			 * **One member, one meaning**, which is worth stating because the two
			 * implementations are now built out of different parts: a segmented
			 * run sets `value` and paints, and a flag sets `value` and hands the
			 * level to `ring-control.ts`'s own silent setter. Neither tells the
			 * note. `commit` writes every dirty run in one change, which is the
			 * whole argument for a row set over three components, so a `setMarks`
			 * that wrote for itself would turn a sweep over a checklist into one
			 * change per row. Nothing sweeps a flag run today — its presses are
			 * the control's — so this is the contract a later sweep inherits
			 * rather than one anything currently exercises.
			 */
			setMarks: (next: number) => void;
		}

		const runs: Run[] = [];
		let commitTimer: number | undefined;

		/**
		 * Write every run that moved, in one change to the note.
		 *
		 * One write for the card rather than one per run: a rest that empties
		 * three slot levels is one edit and one undo, which is the whole
		 * argument for a row set over three components.
		 */
		const commit = (): void => {
			if (commitTimer !== undefined) {
				view?.clearTimeout(commitTimer);
				commitTimer = undefined;
			}
			// A rebuild replaces the card, and a commit arriving after that
			// would be writing out of a detached control.
			if (!card.isConnected) return;
			// Null-prototype for `read`'s own reason: with the toggle on, a
			// run's key is text out of the note.
			const values = Object.create(null) as Record<string, string>;
			for (const run of runs) {
				// Through the join: `run.sent` holds the row's whole raw entry,
				// composite or not, so a press on a character-owned row's
				// segments rewrites its marks and carries its own length
				// through untouched. A no-op for every other row, which has no
				// separator for the join to find.
				const next = withValue(run.sent, spelledMarks(config, run.value));
				if (next === run.sent) continue;
				values[run.key] = next;
				run.sent = next;
			}
			if (Object.keys(values).length === 0) return;
			// The write is what the solid fill means, so every run settles
			// here rather than waiting for the rebuild the change will cause.
			for (const run of runs) run.paint();
			context.onChange({ values });
		};

		/** Write at the end of the run of presses, unless something ends it sooner. */
		const commitSoon = (): void => {
			if (commitTimer !== undefined) view?.clearTimeout(commitTimer);
			commitTimer = view?.setTimeout(() => {
				commitTimer = undefined;
				commit();
			}, GESTURE_COMMIT);
		};

		/**
		 * Move the keyboard to one run, and make it the card's only tab stop.
		 *
		 * A roving index rather than a stop per run: nine slot levels must not
		 * be nine stops on the way past the card, and the axis the rows are
		 * laid out on is the one that should move between them.
		 */
		const focusRun = (index: number): void => {
			const next = Math.max(0, Math.min(runs.length - 1, index));
			runs.forEach((run, i) => {
				run.el.tabIndex = i === next ? 0 : -1;
			});
			runs[next]?.el.focus();
		};

		/**
		 * Rows the character has not added yet — no entry at all, `stored ===
		 * undefined` — collected while walking `rows` so the add line below
		 * can be built once, in declared order, after every added row has
		 * drawn. Only a character-owned row can land here; a calculated row
		 * always draws.
		 */
		const notAdded: TrackRow[] = [];

		/**
		 * Added character-owned rows, with the line each one drew — collected
		 * the same way `notAdded` is, so the single **Remove** picker built
		 * after the loop can list them and tint whichever one it arms.
		 */
		const addedRows: { row: TrackRow; line: HTMLElement }[] = [];

		/**
		 * The row whose length field focus should land in, because this
		 * card's own **Add** button for it was just pressed — Record set's
		 * `awaitingAdd` mechanism, read once per render. Cleared here, on the
		 * render that reflects the add, rather than left for a later one to
		 * find stale.
		 */
		const landingKey =
			awaitingAdd?.id === config.id &&
			data?.values[awaitingAdd.key] !== undefined
				? awaitingAdd.key
				: null;
		if (landingKey !== null) awaitingAdd = null;

		drawn.forEach((row, index) => {
			const rowLabel = rowSet ? (row.name ?? row.key) : config.label;
			const characterOwned = row.maxSource === 'character';
			const ownName = isOwnName(index);
			// Read once per render, the same rule a resolved count already
			// follows: a row's length is layout-adjacent state, not something
			// that changes mid-render.
			const stored = data?.values[row.key];

			if (characterOwned && stored === undefined) {
				// Not added: no entry at all, the ordinary state of a die type
				// this character does not have. Nothing is drawn for the row
				// itself — no name, no field, no run, no "—" — and it
				// contributes one **Add** button to the shared add line
				// instead (`docs/features/track-row-length.md`).
				notAdded.push(row);
				return;
			}

			// A row's own sense wins over the card's, on the pattern `count`
			// already set: the component states what the set means and a row
			// says where it differs.
			const harm = row.sense === undefined ? cardHarm : row.sense === 'harm';
			const line = list.createDiv('sheetsmith-track-row');

			if (rowSet && !ownName) {
				// Immediately left of its run, in the clothes the step name
				// wears. Proximity is what says a name belongs to the run
				// beside it rather than the one above it, and the column is
				// what lets the runs be read down as a shape.
				const name = line.createSpan('sheetsmith-track-row-name');
				name.textContent = row.name ?? row.key;
			} else if (rowSet) {
				/*
				 * A row the character named wears the same rank in the same
				 * column, as a field rather than as static text — and that is
				 * the whole of how a reader tells who owns a row. No badge, no
				 * glyph, no second treatment: the read-only/editable split
				 * Table already draws for the same fact.
				 *
				 * The rename is in the design rather than deferred because
				 * **Remove** deletes the entry whole, marks and length
				 * together, so remove-and-retype costs a session's worth of
				 * marked segments to fix a typo.
				 */
				const field = line.createEl('input');
				field.type = 'text';
				field.classList.add(
					'sheetsmith-track-row-name',
					'sheetsmith-track-row-name-input',
				);
				field.value = row.key;
				// The column's own word alone, where every other control on the
				// row is named for its row as well: this field's *value* is the
				// row's name, and a reader is given the value with the name, so
				// qualifying it would announce the same word twice. Table's own
				// rule for the same field.
				field.setAttribute('aria-label', 'Row name');
				// The reveal owns `title` here, and the explanatory tooltip the
				// length field beside it carries is deliberately not repeated:
				// this field's `title` is its *own text*, shown only where the
				// name is too long for the column to draw (docs/UI.md §9). The
				// two cannot both have it, and a clipped name a reader cannot
				// read at all is the worse loss — while the fact that the row
				// is this character's is already carried by the name being
				// editable, which is the whole of the design's own answer.
				revealWhenTruncated(field);
				// Every other name on the card, so the guard can refuse a
				// collision while letting this row keep its own spelling.
				const others = takenNames.filter((key) => key !== row.key);
				/**
				 * The refused draft's own sentence, under the row it is about.
				 *
				 * **Announced *and* drawn, which is the half this was missing.**
				 * The live region alone left the card showing two rows both
				 * reading `d6` with nothing on screen saying why the second had
				 * not been taken — while the identical sentence is drawn as a
				 * visible line inside the **Add** panel, so one refusal was
				 * visible on one surface and invisible on the other. SPEC's own
				 * "a refused name: the message sits under the field that refused
				 * it, inside the panel *or on the card*", and `docs/UI.md` §10.
				 *
				 * It takes the message the live region is already given rather
				 * than composing a second one, so the two can never say
				 * different things about one refusal.
				 *
				 * Built on the first refusal rather than at every render: a card
				 * whose names are all fine keeps the DOM it always had, which is
				 * the rule a table cell with nothing to render already follows.
				 */
				let refusal: HTMLElement | null = null;
				const drawRefusal = (message: string | null): void => {
					if (message === null) {
						refusal?.remove();
						refusal = null;
						return;
					}
					refusal ??= line.createDiv(
						'sheetsmith-error sheetsmith-track-row-problem',
					);
					refusal.textContent = message;
				};
				const handle = bindEditable(field, {
					initial: row.key,
					// The blank is deliberately not a refusal here, which is
					// what keeps `refuse`'s own rule — a refused draft is kept —
					// from leaving an empty field with a message beside it where
					// the name actually stored would say more. It is a "put the
					// stored one back and say so" instead, which is Record set's
					// departure at `drawName` and its argument exactly.
					refuse: (next) =>
						next.trim() === '' ? null : refuseRowName(next, others),
					onRefusal: (message) => {
						status.textContent = message ?? '';
						drawRefusal(message);
					},
					announceCommit: (next) => {
						// The restore below says what happened to a blank one.
						if (next === '') return;
						status.textContent = `Row renamed to ${next}`;
					},
					announceRestore: (restored) => {
						status.textContent = `Row name restored to ${restored}`;
					},
					onCommit: (next) => {
						if (next.trim() === '') {
							handle.sync(row.key);
							status.textContent = keptRatherThanBlank('row', row.key);
							return;
						}
						// One gesture, one rename, and no value with it: the
						// key token alone moves and everything else on the line
						// stays exactly as the note spells it.
						context.onChange({
							values: {},
							rename: { from: row.key, to: next },
						});
					},
				});
			}

			/**
			 * The length field, where this row's own length is the
			 * character's — drawn immediately after the name and before the
			 * run, whether or not the run itself has anything to draw yet.
			 *
			 * Pool's ceiling reading (`.sheetsmith-pool-max`) at rest, since
			 * there is no value beside it to separate from the way Pool's
			 * numeral separates from its own ceiling — a run's segments are
			 * already the reading of the value, the way Pool's numeral is the
			 * reading of its own. `docs/features/track-row-length.md`'s own
			 * argument for not also taking `.sheetsmith-pool-ceiling` and
			 * `-separator`.
			 */
			let lengthField: HTMLInputElement | null = null;
			// The column exists on every row once any row in the set needs
			// it, so a row that does not still reserves an empty cell rather
			// than leaving the subgrid to auto-place its run one column too
			// early.
			if (lengthsInSet) {
				const wrap = line.createSpan('sheetsmith-track-row-length');
				// A row keeping its calculated length has nothing to draw in
				// the reserved column: the empty `wrap` above is the whole
				// of it.
				if (characterOwned) {
					const field = wrap.createEl('input');
					field.type = 'text';
					field.inputMode = 'numeric';
					// The reading and the chrome removal are both Pool's: no
					// value sits beside this one to separate from (a run's
					// segments are already that reading), but the field
					// itself is the same "the surface above is the object"
					// answer Pool's own character-owned max already gives.
					field.classList.add(
						'sheetsmith-pool-max',
						'sheetsmith-pool-max-input',
						'sheetsmith-track-row-length-input',
					);
					field.value = splitBounded(stored ?? '').ceiling ?? '';
					// The same "—" Pool's own ceiling shows where none is set,
					// and here it is also the only invitation to type: a row
					// nobody has given a length yet has no run, no bar, and
					// nothing else to press.
					field.placeholder = '—';
					field.setAttribute('aria-label', `${rowLabel} length`);
					field.title = `Length of ${rowLabel}, held by this character.`;
					lengthField = field;
					if (row.key === landingKey) field.focus();
				}
			}

			/**
			 * Wire the length field's editing gesture, against whatever holds
			 * this row's current raw entry — a plain local where there is no
			 * run to ask about it yet (nothing typed, no segments), and
			 * `run.sent` once one exists, so a length edit joins with marks a
			 * segment press already committed rather than with what the
			 * render started from.
			 */
			const wireLength = (
				field: HTMLInputElement,
				getRaw: () => string,
				setRaw: (next: string) => void,
			): void => {
				bindEditable(field, {
					initial: field.value,
					step: true,
					arithmetic: true,
					refuse: refuseRowLength,
					onRefusal: (message) => {
						status.textContent = message ?? '';
					},
					announceCommit: (next) => {
						status.textContent =
							next === ''
								? `${rowLabel} length cleared`
								: `${rowLabel} length ${next}`;
					},
					announceRestore: (restored) => {
						status.textContent =
							restored === ''
								? `${rowLabel} length restored to empty`
								: `${rowLabel} length restored to ${restored}`;
					},
					onCommit: (next) => {
						const updated = withCeiling(getRaw(), next);
						setRaw(updated);
						context.onChange({ values: { [row.key]: updated } });
					},
				});
			};

			if (flag) {
				/*
				 * Two states, so the control is the level ring and not a run:
				 * SPEC §4.2's rule that a `level` column and a `toggle` are one
				 * control with a different number of states, applied to a card.
				 * A `<button aria-pressed>` because that is the word ARIA has
				 * for two states, where the run's `role="slider"` is for a value
				 * with positions between its ends.
				 *
				 * Before `countFor`, so a flag resolves nothing at all. Its
				 * length is a literal by construction (`isFlagCard`), and this is
				 * the same property `applyReset`'s `empty` branch keeps: a card
				 * whose formulas are in a bad way can still be ticked.
				 *
				 * None of the run's gesture carries over, and that is the point
				 * rather than an omission. The drag, the mark-level hit test, the
				 * give at either end and the pending fill exist because a run has
				 * somewhere in between to be. Here the press is the whole
				 * gesture and its outcome is its input, so §12's rule about
				 * putting an outcome on screen before applying it does not
				 * engage, and there is no run of presses to debounce.
				 */
				const el = line.createEl('button');
				el.type = 'button';
				el.classList.add('sheetsmith-level-ring', 'sheetsmith-track-flag');
				// Nothing in the stylesheet reads it yet, and the class is here
				// anyway: `sense` grades a run from its first segment to its
				// last, and a run of one *is* its last, so there is nothing to
				// grade. A colour that said "bad" instead is what the pool's own
				// boundary rule refuses. This is where a later answer hangs.
				if (harm) el.classList.add('sheetsmith-track-harm');
				// One tab stop for the card, whatever it is a run of.
				el.tabIndex = runs.length === 0 ? 0 : -1;

				const held = storedMarks(data, row.key);
				const run: Run = {
					key: row.key,
					el,
					segments: [],
					total: marks,
					value: held,
					sent: spelledMarks(config, held),
					pending: null,
					paint: () => undefined,
					setMarks: () => undefined,
				};

				/*
				 * The ARIA, the tooltip, the touch route and the presses are
				 * `ring-control.ts`'s, so a flag on a card and the same control in a
				 * cell cannot come to disagree about what either of them says. What
				 * stays here is what a card has and a cell does not: the run record
				 * the rest of this component sweeps, and the axis a checklist is
				 * laid out on.
				 *
				 * `graded` where the steps are *named*, which is what puts the level's
				 * own mark in the ring — and a flag is the one place `count === 1` and
				 * `graded` meet, since a cell's toggle is never graded.
				 */
				const control = bindRingControl({
					button: el,
					column: { levels: config.levels },
					count: 1,
					graded: named,
					level: held >= 1 ? 1 : 0,
					name: rowSet ? (row.name ?? row.key) : config.label,
					// The card's own label stands over it, or the row's name beside it.
					nameOnScreen: true,
					onSet: (level) => {
						run.value = level;
						// Synchronously, not through `commitSoon`: a press's outcome
						// is its input, so there is no run of presses to wait out and
						// the debounce would only make the note late. So a checklist
						// writes once per ring rather than once per burst — `commit`
						// collects every dirty run, but this path has already written
						// the last one before the next press can arrive.
						commit();
					},
					// Up and down move between a checklist's flags, on the axis they
					// are laid out on — the row set's rule unchanged, so a card is
					// still one tab stop. The ring's own axis is the level's and
					// points the other way, so moving *down* the list is `-step`.
					// A card with one flag answers neither key rather than stepping.
					onVertical: (step) => {
						if (runs.length < 2) return false;
						focusRun(runs.indexOf(run) - step);
						return true;
					},
				});
				run.paint = control.repaint;
				// The segmented run's own shape, with the control's silent setter
				// where that one calls `run.paint()`. One interface member has to
				// mean one thing: `commit` writes every dirty run in *one* change
				// to the note, which is the whole argument for a row set over three
				// components, and a `setMarks` that wrote for itself would turn a
				// sweep over a checklist into one change per row.
				run.setMarks = (next: number): void => {
					const wanted = next >= 1 ? 1 : 0;
					if (wanted === run.value) return;
					run.value = wanted;
					control.setLevel(wanted);
				};
				runs.push(run);
				return;
			}

			// The card's own count arrives already resolved, so the run drawn and
			// the marks measured against it come from one reading. `countFor`
			// floors and clamps it a second time, which is the same number back:
			// its other two callers hand it a raw resolved value, and taking the
			// raw one here is what would let a run and its tail disagree.
			const count = countFor(
				config,
				row,
				index,
				context.resolveField,
				ownCount.drawn,
				stored,
			);

			if (count === null) {
				if (characterOwned) {
					// The ordinary state of a die type this character does not
					// have, not an error: no run, no "?", just the length
					// field's own invitation to type. `docs/features/
					// track-row-length.md`'s graceful-empty state.
					if (lengthField !== null) {
						let raw = stored ?? '';
						wireLength(
							lengthField,
							() => raw,
							(next) => {
								raw = next;
							},
						);
					}
					// An empty reserved span for the run's own column: this
					// row has drawn nothing in it.
					line.createSpan();
					addedRows.push({ row, line });
					return;
				}
				/*
				 * Present and unresolved, which is exactly what "?" is for. On
				 * that row alone: one failure must not take the card down, which
				 * is SPEC §5's rule applied inside a component rather than
				 * across the sheet.
				 *
				 * No delay here, unlike a card's derived display: that one waits
				 * out UNRESOLVED_DELAY because it repaints from a draft being
				 * typed and a half-typed value is not wrong yet. A count is
				 * layout config resolved once per render, so there is no
				 * in-between state to wait through and the delay would only make
				 * the answer late.
				 */
				const unresolved = line.createDiv('sheetsmith-track-unresolved');
				unresolved.textContent = '?';
				const field =
					row.count !== undefined ? `rows.${index}.count` : 'count';
				/*
				 * **A count that resolved perfectly well and came to nothing is a
				 * different state, and saying "it did not resolve" about it is
				 * false.** `segmentCount` refuses anything below one, so a penalty
				 * pushed at the run's length — `2 + mod.self` with a −5 — reaches
				 * here having worked out to −3, and `explainField` correctly has
				 * nothing to say, because no formula failed.
				 *
				 * Until a modifier could reach a ceiling this state needed a layout
				 * author to write it; now a player can put on a cursed item and
				 * meet it, so the sentence has to name the number rather than
				 * blame the formula. The breakdown goes with it, which is what
				 * makes the −5 findable rather than merely reported.
				 *
				 * Only a `number` counts as "worked out": a failed evaluation
				 * resolves to `null`, and `Number(null)` is 0, which would put the
				 * honest sentence on the dishonest branch.
				 */
				const settled =
					row.count !== undefined
						? worksOutTo(context.resolveField(field, {}))
						: worksOut;
				// One join spelling for both leads, so the "?" and the button
				// cannot drift apart about where the account begins.
				const said = withBreakdown(
					settled ??
						context.explainField?.(field, {}) ??
						'The number of segments did not resolve.',
				);
				unresolved.setAttribute('title', said);
				/*
				 * **The same text where there is no pointer**, and it is the
				 * *table's* spelling of that rather than the run's, because this
				 * is the table's case: `aria-describedby` needs something to hang
				 * on, a run is one focusable control and has it, and a "?" is a
				 * static div that is neither focusable nor named. `table.ts`
				 * already answers exactly that shape — a `.sheetsmith-sr-only`
				 * span beside the mark, inside the box both are read as part of,
				 * with no ARIA wiring at all.
				 *
				 * **Beside the "?" rather than inside it**, which is that
				 * precedent read to the element: a cell's twin sits in the `td`
				 * next to the cell, not in it, and here the equivalent is the row
				 * rather than the glyph. It also keeps the glyph's own
				 * `textContent` the one character it draws, which a test already
				 * asserts and which would otherwise have had to be loosened to
				 * accommodate text nobody can see.
				 *
				 * This state is the one the sentence above was *added* for, and
				 * until now it was the one state on the card with a single
				 * channel: a reader who cannot see a tooltip met "?" and had no
				 * route to the number or to the push that produced it. Not
				 * `role="img"` with the text as an `aria-label`: that replaces
				 * the glyph with the sentence and flattens it to one string,
				 * where this is a sentence and then a breakdown.
				 */
				line.createSpan({ cls: 'sheetsmith-sr-only', text: said });
				return;
			}

			/*
			 * **How much of the drawn run a press can reach.** A row set and a
			 * card nothing is pushed at draw exactly what they always did, since
			 * `blocked` is zero for both; where an item has taken slots away,
			 * `count` is the unmodified run and this is what is left of it.
			 *
			 * Every number the control is built from is this one rather than
			 * `count`: the mark total it clamps to, `aria-valuemax`, the reading,
			 * and the rectangles the hit test is given. That is the whole of how
			 * a blocked slot stops being a value — not a guard that refuses a
			 * press, but a run that never had those positions. A press out there
			 * lands past the end and fills the live run, which is what a press
			 * past the end of any run already does.
			 */
			const blocked = rowSet ? 0 : ownCount.blocked;
			const live = count - blocked;
			const total = live * marks;
			const el = line.createDiv('sheetsmith-track-run');
			if (harm) el.classList.add('sheetsmith-track-harm');
			if (marks > 1) {
				// A segment holding several marks is several targets, so it is
				// drawn wider and its divisions are drawn in. Both are the same
				// point: a position you cannot see is a position you cannot aim
				// at, and the drag that reaches these is worth having only if
				// the reader can tell one quarter of a segment from another.
				el.classList.add('sheetsmith-track-marked');
				el.style.setProperty('--sheetsmith-track-marks', String(marks));
			}
			el.setAttribute('role', 'slider');
			el.setAttribute('aria-valuemin', '0');
			el.setAttribute('aria-valuemax', String(total));
			// One tab stop for the card, whatever it is a run of: nine slot
			// levels must not be nine stops on the way past it. The rest are
			// reachable, by the axis they are laid out on.
			el.tabIndex = runs.length === 0 ? 0 : -1;

			const segments: HTMLElement[] = [];
			for (let at = 0; at < count; at++) {
				const segment = el.createSpan('sheetsmith-track-segment');
				/*
				 * The granted segments are the last of the run, and that follows
				 * from the file model rather than from taste. A run is filled in
				 * order from the near end, so raising `count` adds indices at the
				 * far end by arithmetic; putting the grant at the near end would
				 * renumber, and the same stored `value: 2` would fill a different
				 * pair of segments with the talisman on than with it off — a
				 * modifier changing what the note means without the note changing.
				 * Being last is also what makes them spent last, which is the
				 * whole of "spent last" as a rule.
				 */
				if (at >= live) {
					/*
					 * Past the live run: a slot an item has taken, drawn where it
					 * has always been and marked as unusable. The owner's rule —
					 * "those slots should still be there, instead of just
					 * disappearing" — and it is not the ghost this feature
					 * refuses: a ghost faintly shows what is *not* there, which is
					 * a second ceiling, where this is present and shut.
					 */
					segment.classList.add('sheetsmith-track-segment-blocked');
				} else if (at >= live - ownCount.granted) {
					segment.classList.add('sheetsmith-track-segment-granted');
				}
				// How far along the run this segment is. A harm run mixes its
				// fill from it, so the escalation is read as a shape before a
				// single name is; a progress run takes the accent whole. The
				// share comes in from here because the stylesheet cannot know
				// how long this run is — the same reason a level ring is
				// handed its own.
				if (harm) {
					// Over the live run rather than the drawn one: a blocked
					// segment never fills, so its grade is never painted, and
					// `live` can be zero where a penalty took the whole run.
					segment.style.setProperty(
						'--sheetsmith-track-grade',
						String((at + 1) / Math.max(1, live)),
					);
				}

				segment.createSpan('sheetsmith-track-segment-fill');
				segment.createSpan('sheetsmith-track-segment-ghost');

				/*
				 * A divider per boundary *between* marks, so a segment holding
				 * n of them gets n - 1. The segment's own border is already the
				 * outer two, and drawing those again is what a repeating
				 * gradient does: it puts a line at the end of every mark,
				 * including the last, which lands on the inner edge of the
				 * right border and doubles it.
				 *
				 * Elements rather than a background, and the count is the
				 * reason. The gradient's own edge behaviour is not something a
				 * test can look at, so "one line too many" was invisible to
				 * everything except the eye; three spans at three offsets is a
				 * number a test can assert.
				 */
				for (let division = 1; division < marks; division++) {
					const divider = segment.createSpan('sheetsmith-track-mark');
					divider.style.setProperty(
						'--sheetsmith-track-at',
						String(division / marks),
					);
				}

				// Last, and positioned, so it paints over the fills rather
				// than under them. As the segment's own inline text it did
				// not: a positioned descendant paints after its parent's
				// inline content, so the one segment a layout bothered to
				// letter lost its letter at exactly the moment it filled.
				if (named) {
					const glyph = parseLevel(config.levels?.[at + 1] ?? '').glyph;
					if (glyph !== null && glyph !== '') {
						const letter = segment.createSpan('sheetsmith-track-segment-glyph');
						letter.textContent = levelGlyph({ levels: config.levels }, at + 1);
					}
				}

				/*
				 * **The live ones only, and that is where "not pressable" is
				 * decided.** `segments` is what the fill is painted over and what
				 * the hit test is handed rectangles from, so a blocked slot is
				 * drawn and then plays no further part: no gesture can land in
				 * it, and no stored value can fill it — which is the case a note
				 * holding six marks reaches the moment the shackles go on. The
				 * note is untouched (SPEC §4.2's "rendered, not corrected"); what
				 * is clamped is the drawing, exactly as a stored 9 on a
				 * six-segment run already fills six and stays 9.
				 */
				if (at < live) segments.push(segment);
			}

			const step = named ? line.createDiv('sheetsmith-track-step') : null;

			/**
			 * The breakdown where there is no pointer.
			 *
			 * A `.sheetsmith-sr-only` twin with `aria-describedby`, which is the
			 * card's spelling of this rather than the table's: a run is one
			 * focusable control, so it has something to hang the reference on,
			 * where a cell has only its own contents. Drawn after the step line so
			 * the row reads run, name, explanation.
			 *
			 * **It is the same string the button above opens**, from the same
			 * builder — the carriers changed when the affordance arrived and the
			 * one-string rule did not. It holds the breakdown alone rather than
			 * the reading and the breakdown, because the reading is already in
			 * `aria-valuetext` and a description repeating it is a number said
			 * twice; `card-face.ts`'s own twin holds the breakdown alone for the
			 * same reason.
			 *
			 * Built only where there is something to say, which keeps every
			 * unmodified card the DOM it always had.
			 */
			const explanation =
				cardPushed === null ? null : line.createDiv('sheetsmith-sr-only');
			if (explanation !== null) {
				explanation.id = `sheetsmith-track-modified-${config.id}`;
				el.setAttribute('aria-describedby', explanation.id);
			}

			const run: Run = {
				key: row.key,
				el,
				segments,
				total,
				value: storedMarks(data, row.key),
				sent: data?.values[row.key] ?? '',
				pending: null,
				paint: () => undefined,
				setMarks: () => undefined,
			};

			/** The mark count the note holds for this run. */
			const written = (): number => marksFrom(run.sent) ?? 0;

			run.paint = (): void => {
				const landing = run.pending ?? run.value;
				/*
				 * Solid is what the note holds; faint is everything the run is
				 * showing that the note does not hold yet. One rule, and the
				 * faint region always means exactly "this much is not saved".
				 *
				 * It used to be measured from the run's live value instead,
				 * which made it a preview of the gesture under the finger and
				 * nothing else. Every path that moves the value without a
				 * pointer then had no representation at all: an arrow key drew
				 * a solid segment and the note caught up to it as much as seven
				 * hundred milliseconds later, so the screen said "written" for
				 * the whole of the window where it was not.
				 */
				const held = written();
				const solidMarks = Math.min(held, landing);
				const ghostMarks = Math.max(held, landing);
				run.segments.forEach((segment, at) => {
					const solid = segmentFill(solidMarks, at, marks);
					const ghost = segmentFill(ghostMarks, at, marks);
					segment.style.setProperty('--sheetsmith-track-fill', String(solid));
					segment.style.setProperty(
						'--sheetsmith-track-ghost',
						String(held === landing ? 0 : ghost),
					);
					segment.classList.toggle('sheetsmith-track-segment-on', solid > 0);
				});
				// Held inside the run for what the control reports, however the
				// note happens to be spelled: a hand-edited 9 on a six-segment
				// run fills every segment and stays 9 in the note (§7).
				const shown = Math.max(0, Math.min(run.total, landing));
				const filled = Math.floor(shown / marks);
				const reading = stepLabel(config, filled, live);
				/*
				 * **What the run says when part of it is shut, and the reason it
				 * has to be said in words.** ARIA models a slider as one value
				 * between `aria-valuemin` and `aria-valuemax`, and a blocked slot
				 * is not a value this control can take — so the ceiling stays the
				 * *live* run and the drawn boxes deliberately outnumber it. That
				 * disagreement is real and `aria-valuetext` is the only sanctioned
				 * place to explain it, which is what it is for: a flat string
				 * where the number alone would mislead.
				 *
				 * Not spelled inside `stepLabel`, which a named run's step line
				 * also draws: `levels` publishes its count as a literal, so a
				 * named run can never be blocked, and putting the clause there
				 * would be a branch nothing reaches.
				 */
				const said =
					blocked === 0 ? reading : `${reading}, ${blocked} blocked`;
				el.setAttribute('aria-valuenow', String(shown));
				el.setAttribute('aria-valuetext', said);
				el.setAttribute(
					'aria-label',
					rowSet
						? `${row.name ?? row.key}, ${said}`
						: `${config.label}, ${said}`,
				);
				if (step !== null) step.textContent = reading;
				/*
				 * Only a named run earns one. An unnamed step's name is the
				 * count, which the segments already state — and a tooltip
				 * repeating what is legible is noise fired at every pass, as
				 * the card's label and the level ring both learned.
				 *
				 * **The breakdown used to be the exception and is not any more.**
				 * It rode here because the run's own press was taken and a
				 * `title` was what was left; the button beside the label is the
				 * door now, so carrying it here as well would be two doors to
				 * one room — and the worse of the two, since a native tooltip is
				 * slow, unstyled, truncating and invisible to a finger. What the
				 * run keeps is the route that never depended on a pointer: the
				 * twin below, which it points at.
				 */
				if (named) el.title = reading;
				if (explanation !== null) explanation.textContent = cardPushed ?? '';
			};

			/** Move the run without writing. Feedback is continuous (SPEC §4.2). */
			run.setMarks = (next: number): void => {
				const held = Math.max(0, Math.min(run.total, Math.round(next)));
				if (held === run.value) return;
				run.value = held;
				run.paint();
			};

			runs.push(run);

			if (characterOwned && lengthField !== null) {
				wireLength(
					lengthField,
					() => run.sent,
					(next) => {
						run.sent = next;
					},
				);
			}

			if (characterOwned) addedRows.push({ row, line });

			/* --- Pointer: a press answers on the way down --- */

			/** How far the run gives past either end, and springing back. */
			const overscroll = (beyond: number): void => {
				if (reduced || beyond === 0) {
					el.setCssStyles({ transform: '' });
					return;
				}
				// Saturating, so the give increases in resistance and stops at
				// a few pixels rather than following the finger off the card.
				const px =
					Math.sign(beyond) *
					OVERSCROLL_MAX *
					(1 - 1 / (1 + Math.abs(beyond) / OVERSCROLL_RESIST));
				el.setCssStyles({ transform: `translateX(${px}px)` });
			};

			const boxes = (): SegmentBox[] =>
				segments.map((segment) => {
					const box = segment.getBoundingClientRect();
					return {
						left: box.left,
						right: box.right,
						top: box.top,
						bottom: box.bottom,
					};
				});

			/**
			 * Whether a point is still on this run, which is a question about
			 * y alone.
			 *
			 * Going past either end horizontally is not leaving: it is the case
			 * the end resistance exists for, where the value holds at empty or
			 * full and the run gives a few pixels. If x counted here the two
			 * rules would be unreachable together — every drag that reached a
			 * boundary would be reported as having left the control, and the
			 * resistance would never fire.
			 *
			 * With rows on the card this is also what keeps a gesture on the
			 * first-level slots from drifting twenty pixels down and silently
			 * setting the second-level ones: the band is this run's own.
			 */
			const onRun = (y: number): boolean => {
				const box = el.getBoundingClientRect();
				return y >= box.top && y <= box.bottom;
			};

			let pointer: number | null = null;
			/**
			 * Whether the pointer has moved at all since it went down. It
			 * decides one thing only — whether the fill tracks the finger or
			 * eases into place — and deliberately not whether the movement
			 * counts.
			 *
			 * There is no drag threshold on this control, and the absence is
			 * the decision. A Pool needs one because its number is a text field
			 * where a press places a caret and a drag scrubs, so the two
			 * gestures genuinely compete and one has to win. Here the press
			 * already fills on the way down: a press is a drag of no length,
			 * the same code path reading the same position, and there is
			 * nothing to disambiguate. A threshold would only have been dead
			 * distance at the start of every gesture — and with a mark about
			 * thirteen pixels wide, ten of them is most of the way to the next
			 * one, so it took away exactly the correction that makes a
			 * mark-sized target recoverable.
			 *
			 * What stops a resting hand from twitching the value is
			 * quantisation, not hysteresis: the run answers in whole marks, so
			 * a wobble inside one is not a different answer.
			 */
			let moved = false;
			/**
			 * The mark this gesture armed a clear on, or null where it is an
			 * ordinary set.
			 *
			 * Clearing and setting are the same press on the same pixel, and
			 * without this the two answers to it depended on something the
			 * screen never showed: landing on the mark the value stands on
			 * previews one less, and the first pointermove two pixels later
			 * read the position afresh and previewed the same mark again. One
			 * position, two values, separated only by whether the finger had
			 * twitched.
			 *
			 * The mark rather than the segment, because at several marks to a
			 * segment those are different lines and only the finer one is the
			 * target: a run at twenty-two of a forty-mark track has its
			 * boundary two marks into the sixth segment, and that segment is
			 * both the one a press should clear from and the one whose third
			 * mark a press should set. The disarming boundary follows the
			 * target down, and the line it survives inside is a division the
			 * card actually draws.
			 */
			let clearing: number | null = null;
			/**
			 * Whether the press now ending was a long press that already did
			 * its job. Assigned below, where the naming is set up.
			 */
			let longPressed: (() => boolean) | null = null;

			el.addEventListener('pointerdown', (event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				pointer = event.pointerId;
				moved = false;
				// Captured on the way down rather than once some distance is
				// travelled: the gesture is live from the first frame, so the
				// pointer belongs to this run from the first frame too. With
				// rows that is also what claims it — a drag that drifts onto a
				// neighbouring run keeps reporting here, and the neighbour is
				// never touched by a gesture it did not start.
				el.setPointerCapture(event.pointerId);
				// A slider takes focus from the press that operates it, so the
				// keyboard picks up where the finger left off.
				focusRun(runs.indexOf(run));

				const wanted = marksAtPoint(boxes(), event.clientX, event.clientY, marks);
				// Pressing the mark the value stands on clears it, so one
				// control both fills and clears without a modifier — and the
				// run can never show the states nobody means, which is the
				// argument a level column already made against a row of
				// checkboxes. Armed here and resolved on release, so what the
				// fill previews on the way down is what the release commits.
				clearing = wanted === run.value ? wanted : null;
				run.pending = Math.max(
					0,
					Math.min(run.total, clearing !== null ? wanted - 1 : wanted),
				);
				run.paint();
			});

			el.addEventListener('pointermove', (event) => {
				if (pointer !== event.pointerId) return;

				if (!onRun(event.clientY)) {
					// Off the run the committed value comes back and nothing is
					// pending. Coming back resumes the gesture; releasing out
					// here commits nothing at all. Leaving the run is leaving
					// its mark, so a clear armed on the way down does not
					// survive it.
					clearing = null;
					if (run.pending !== null) {
						run.pending = null;
						overscroll(0);
						run.paint();
					}
					return;
				}

				if (!moved) {
					// From here the fill is glued to the finger rather than
					// easing after it. A press that never moves keeps the ease,
					// because there a jump is what happened.
					moved = true;
					el.classList.add('sheetsmith-track-dragging');
				}
				event.preventDefault();
				const measured = boxes();
				const at = marksAtPoint(measured, event.clientX, event.clientY, marks);
				// A clear holds for as long as the pointer is on the mark that
				// armed it, so a wobble cannot silently turn it back into a set.
				if (clearing !== null && at !== clearing) clearing = null;
				const wanted = clearing !== null ? clearing - 1 : at;
				run.pending = Math.max(0, Math.min(run.total, wanted));

				/*
				 * The give at the ends belongs to the ends of the *run*, which
				 * on a wrapped run is not the ends of a line.
				 *
				 * Measured against the run's box, every line shared its right
				 * edge with the last one, so pushing past the end of line one —
				 * five segments of ten — resisted exactly as if the run were
				 * full. The rubber band was saying "there is nothing more here"
				 * at the halfway point, about a run with a whole second line
				 * below it.
				 *
				 * So the condition is the value, not the geometry: the run
				 * gives only where the pointer is pushing at a value that has
				 * nowhere left to go, past the first or last segment itself.
				 */
				const firstBox = measured[0];
				const lastBox = measured[measured.length - 1];
				overscroll(
					run.pending >= run.total &&
						lastBox !== undefined &&
						event.clientX > lastBox.right
						? event.clientX - lastBox.right
						: run.pending <= 0 &&
							  firstBox !== undefined &&
							  event.clientX < firstBox.left
							? event.clientX - firstBox.left
							: 0,
				);
				run.paint();
			});

			const release = (event: PointerEvent): void => {
				if (pointer !== event.pointerId) return;
				pointer = null;
				moved = false;
				clearing = null;
				el.classList.remove('sheetsmith-track-dragging');
				overscroll(0);
				const landing = run.pending;
				run.pending = null;
				// A press held long enough to ask what the step is called was a
				// question, not an instruction: the bubble is already up and
				// the run goes back to where it was.
				if (longPressed?.() === true) {
					run.paint();
					return;
				}
				// Nothing pending is a release that happened off the run, and
				// the gesture ends where the finger does — there is no throw to
				// carry it anywhere else.
				if (landing !== null) run.setMarks(landing);
				run.paint();
				commit();
			};

			el.addEventListener('pointerup', release);
			el.addEventListener('pointercancel', release);
			el.addEventListener('blur', commit);

			/* --- Keyboard --- */

			el.addEventListener('keydown', (event) => {
				// Up and down move between rows rather than stepping, which is
				// why they are not a second way to change the value: the axis
				// the rows are laid out on is the one that should move between
				// them, and nine slot levels must not be nine tab stops.
				if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
					if (runs.length < 2) return;
					event.preventDefault();
					focusRun(runs.indexOf(run) + (event.key === 'ArrowDown' ? 1 : -1));
					return;
				}
				let next: number | null = null;
				if (event.key === 'ArrowRight') {
					// Shift steps a mark where a segment holds several — the
					// inverse of a card's shift-by-ten, because a track's fine
					// grain lies below its unit rather than above it.
					next = run.value + (event.shiftKey ? 1 : marks);
				} else if (event.key === 'ArrowLeft') {
					next = run.value - (event.shiftKey ? 1 : marks);
				} else if (event.key === 'Home') {
					next = 0;
				} else if (event.key === 'End') {
					next = run.total;
				} else if (event.key === ' ' || event.key === 'Spacebar') {
					// The next segment, not the next mark: Space is the plain
					// "one more" and a partial segment finishes before the next
					// begins.
					next = (Math.floor(run.value / marks) + 1) * marks;
				}
				if (next === null) return;
				event.preventDefault();
				run.setMarks(next);
				commitSoon();
			});

			/*
			 * A named step's name, on a pointer and on a phone alike. The line
			 * under the run carries it where the card has the room; this is the
			 * route that survives a run squeezed into one grid unit, and it is
			 * the only route at all to a segment's glyph, which is an
			 * abbreviation like any other.
			 */
			if (named) {
				longPressed = bindLongPress(el, () =>
					stepLabel(config, Math.floor(run.value / marks), live),
				);
			}

			run.paint();
		});

		/** A row's own name, or the card's where it draws no name of its own. */
		const rowName = (row: TrackRow): string =>
			rowSet ? (row.name ?? row.key) : config.label;

		/**
		 * What the **Length** field arrives holding: the card's own segment
		 * count where the layout sets one and it resolves, and nothing where it
		 * does not.
		 *
		 * A *seed for the field*, consulted once at the add and never again —
		 * which is what lets a layout say "a clock here is usually six" without
		 * a second storage mode. Once the entry exists its length is the stored
		 * one and only the stored one, and a character-added row with a blank
		 * length has no length exactly as a declared one does.
		 */
		const seeded = config.count === undefined ? null : ownCount.drawn;

		/**
		 * The form that names a row before it exists, appended under whatever
		 * declared rows the **Add** picker still has to offer.
		 *
		 * **The name is typed before the entry exists, and that is the
		 * load-bearing decision.** Record set's **Add** writes a record named
		 * after the noun and lands focus in its name field, which works because
		 * a record's identity is its position and two records called "Shield"
		 * are two records. Here the name *is* the key, so a placeholder pressed
		 * twice would be a duplicate — and a duplicate key is not a second row,
		 * it is a whole-section failure that takes the card down. Uniquifying a
		 * placeholder would be name-plus-occurrence, which invents syntax the
		 * note does not contain. So the name is typed, checked here, and only
		 * then written: nothing a reader can do through this plugin can put the
		 * section into the duplicate-key state.
		 */
		const addForm = (panel: AnchoredPanel<null>): void => {
			const form = panel.body.createDiv(
				'sheetsmith-panel-fields sheetsmith-track-add-form',
			);
			/**
			 * One labelled control, in the panel's own field clothes.
			 *
			 * **A `<label>` with the control inside it**, which is
			 * `modifier-form.ts`'s own shape and is here for a reason beyond
			 * matching: the visible word is then the control's accessible name
			 * outright. Written as a `<div>` with an `aria-label` saying more,
			 * the **Length** field announced "Segments in the row to add" —
			 * a name that does not contain the word on screen, which is what
			 * WCAG 2.5.3 forbids and what leaves voice control with nothing to
			 * match when a reader says "Length" (`docs/UI.md` §6). The dialog's
			 * own label carries the context those words were trying to add.
			 */
			const field = (label: string): HTMLInputElement => {
				const row = form.createEl('label', { cls: 'sheetsmith-panel-field' });
				row.createSpan({ cls: 'sheetsmith-panel-field-label', text: label });
				const input = row.createEl('input');
				input.type = 'text';
				input.classList.add('sheetsmith-panel-input');
				return input;
			};
			/**
			 * Where a refusal about the field above it goes.
			 *
			 * It carries an id because a field points at its own through
			 * `aria-describedby`, and the id is counted rather than derived
			 * from `config.id`: only one anchored panel is ever open, so a
			 * counter is enough, and a component id is not guaranteed to be a
			 * token an `id` can hold.
			 */
			const problem = (which: string): HTMLElement => {
				const said = form.createEl('p');
				said.classList.add('sheetsmith-panel-problem');
				said.id = `sheetsmith-track-add-${++addFormMessages}-${which}`;
				said.hidden = true;
				return said;
			};

			const nameField = field('Name');
			const nameProblem = problem('name');
			const lengthField = field('Length');
			lengthField.inputMode = 'numeric';
			// **No placeholder, and the `—` it had was borrowed wrongly.** On a
			// card that dash is a *reading*: it says this row has no ceiling,
			// which is a state the note is actually in. In an empty form field
			// it reads as a value already sitting there waiting to be cleared,
			// and says nothing about what may be typed — while the field is
			// optional, so the honest empty state is empty. The label beside it
			// is what names it (`docs/UI.md` §6).
			lengthField.value = seeded === null ? '' : String(seeded);
			const lengthProblem = problem('length');

			const submit = form.createEl('button');
			submit.type = 'button';
			submit.classList.add('sheetsmith-panel-save');
			submit.textContent = 'Add';

			/**
			 * Show or clear one field's refusal, and wire the field to it.
			 *
			 * **A description on a hidden element is not exposed**, so the
			 * `aria-describedby` goes on with the message and comes off with
			 * it rather than being set once at build time — which would point
			 * every field at an empty paragraph for the whole life of the
			 * form.
			 */
			const say = (
				input: HTMLInputElement,
				into: HTMLElement,
				message: string | null,
			): void => {
				into.textContent = message ?? '';
				into.hidden = message === null;
				if (message === null) {
					input.removeAttribute('aria-describedby');
					input.removeAttribute('aria-invalid');
					return;
				}
				input.setAttribute('aria-describedby', into.id);
				input.setAttribute('aria-invalid', 'true');
			};

			const add = (): void => {
				const name = nameField.value.trim();
				const length = lengthField.value.trim();
				const refusedName = refuseRowName(name, takenNames);
				// The length goes into the same entry the card's own length
				// field writes, so it answers to the same refusals: a slash
				// would be read back as a second number, and a note reference
				// inside a fence is a link Obsidian never indexes.
				const refusedLength = length === '' ? null : refuseRowLength(length);
				say(nameField, nameProblem, refusedName);
				say(lengthField, lengthProblem, refusedLength);
				if (refusedName !== null || refusedLength !== null) {
					// **Announced as well as drawn**, which is the half a
					// description cannot carry: the press leaves focus on the
					// button, so a message tied to the field it is about says
					// nothing until the reader goes back there. The card's own
					// live region is what the row's rename field already
					// refuses through, so one feature does not answer the same
					// refusal two ways (PATTERNS §6).
					status.textContent = refusedName ?? refusedLength ?? '';
					// A message grows the panel by a line, and a panel anchored
					// above its trigger would otherwise drift off it.
					panel.place();
					return;
				}
				status.textContent = `${name} added`;
				// Set before the change, as the declared rows' own **Add**
				// already does, so the render the write causes lands focus in
				// the new row's length field.
				awaitingAdd = { id: config.id, key: name };
				panel.close();
				// A blank length drops the separator with it, so a row added
				// with no length is a bare `name:` rather than `name: /`.
				context.onChange({ values: { [name]: withCeiling('', length) } });
			};

			submit.addEventListener('click', add);
			for (const input of [nameField, lengthField]) {
				input.addEventListener('keydown', (event) => {
					if (event.key !== 'Enter') return;
					// Enter in either field submits, which is the gesture a
					// two-field form owes a reader who never reaches for the
					// button.
					event.preventDefault();
					add();
				});
			}
		};

		/**
		 * One **Add** and one **Remove**, each behind a picker naming the
		 * specific rows it offers, rather than one button per candidate —
		 * a hit-dice set with four die types no longer sits under four named
		 * buttons and a bin icon apiece. The picker itself is `ui/anchored-
		 * panel.ts`'s surface, not Obsidian's `Menu`: a component may take
		 * only `setIcon` from `obsidian` (`docs/PATTERNS.md` §2), and the
		 * panel already carries placement, dismissal, and focus management
		 * for exactly this shape of list (`docs/UI.md`'s "what it holds is a
		 * list and one disclosure").
		 */
		if (notAdded.length > 0 || addedRows.length > 0 || open) {
			const actions = card.createDiv('sheetsmith-track-actions');

			// Whenever the character may add a row, rather than only while a
			// declared one is left to add: the form below is always something
			// to offer, so a card that has run out of declared rows still has
			// an **Add** control and a card that declares none starts with one.
			if (notAdded.length > 0 || open) {
				const addButton = actions.createEl('button');
				addButton.type = 'button';
				addButton.classList.add('sheetsmith-track-action-button');
				setIcon(addButton, ADD_ICON);
				const label = `Add to ${config.label}`;
				addButton.setAttribute('aria-label', label);
				addButton.title = label;
				addButton.setAttribute('aria-haspopup', 'dialog');
				addButton.setAttribute('aria-expanded', 'false');
				addButton.addEventListener('click', () => {
					if (openAnchoredPanelKey() === `${config.id}:track-add`) {
						// A second press on the same glyph closes it, which is
						// what a control carrying `aria-expanded` owes.
						closeAnchoredPanel();
						return;
					}
					const panel = showAnchoredPanel(
						addButton,
						label,
						`${config.id}:track-add`,
						null,
						() => addButton.setAttribute('aria-expanded', 'false'),
					);
					addButton.setAttribute('aria-expanded', 'true');
					for (const row of notAdded) {
						const rowLabel = rowName(row);
						const line = panel.body.createEl('button');
						line.type = 'button';
						line.classList.add('sheetsmith-panel-line');
						const glyph = line.createSpan('sheetsmith-panel-glyph');
						glyph.setAttribute('aria-hidden', 'true');
						setIcon(glyph, ADD_ICON);
						const words = line.createSpan('sheetsmith-panel-line-words');
						words.createSpan({ cls: 'sheetsmith-panel-said', text: rowLabel });
						line.addEventListener('click', () => {
							status.textContent = `${rowLabel} added`;
							awaitingAdd = { id: config.id, key: row.key };
							panel.close();
							context.onChange({ values: { [row.key]: '' } });
						});
					}
					if (open) addForm(panel);
					focusFirstControl(panel);
				});
			}

			if (addedRows.length > 0) {
				const removeButton = actions.createEl('button');
				removeButton.type = 'button';
				removeButton.classList.add('sheetsmith-track-action-button');
				setIcon(removeButton, REMOVE_ICON);
				const label = `Remove from ${config.label}`;
				removeButton.setAttribute('aria-label', label);
				removeButton.title = label;
				removeButton.setAttribute('aria-haspopup', 'dialog');
				removeButton.setAttribute('aria-expanded', 'false');
				removeButton.addEventListener('click', () => {
					if (openAnchoredPanelKey() === `${config.id}:track-remove`) {
						closeAnchoredPanel();
						return;
					}
					// Which row this opening has armed, if any — a fresh
					// picker starts with nothing armed, on the same terms a
					// fresh press of a per-row bin icon once did.
					let armedKey: string | null = null;
					let armedLine: HTMLElement | null = null;
					const standDown = (): void => {
						armedLine?.classList.remove('sheetsmith-track-row-arming');
						armedLine = null;
						armedKey = null;
					};
					const panel = showAnchoredPanel(
						removeButton,
						label,
						`${config.id}:track-remove`,
						null,
						() => {
							removeButton.setAttribute('aria-expanded', 'false');
							// Dismissed without a second press on the armed
							// line is a change of mind, exactly as it was
							// when the arming control sat on the row itself.
							if (armedKey !== null) status.textContent = STOOD_DOWN;
							standDown();
						},
					);
					removeButton.setAttribute('aria-expanded', 'true');
					const items: {
						key: string;
						label: string;
						button: HTMLButtonElement;
						said: HTMLElement;
					}[] = [];
					const paint = (): void => {
						for (const item of items) {
							const armed = item.key === armedKey;
							item.button.classList.toggle(
								'sheetsmith-track-remove-armed',
								armed,
							);
							item.said.textContent = armed
								? armedName(item.label)
								: item.label;
							item.button.setAttribute(
								'aria-label',
								armed ? armedName(item.label) : item.label,
							);
						}
					};
					for (const { row, line } of addedRows) {
						const rowLabel = rowName(row);
						const button = panel.body.createEl('button');
						button.type = 'button';
						button.classList.add('sheetsmith-panel-line');
						const glyph = button.createSpan('sheetsmith-panel-glyph');
						glyph.setAttribute('aria-hidden', 'true');
						setIcon(glyph, REMOVE_ICON);
						const words = button.createSpan('sheetsmith-panel-line-words');
						const said = words.createSpan({
							cls: 'sheetsmith-panel-said',
							text: rowLabel,
						});
						button.addEventListener('click', () => {
							if (armedKey === row.key) {
								// The second press: the gesture is over, so it
								// stands itself down before the write rather
								// than leaving the panel's own listeners alive
								// on a row that is going.
								standDown();
								panel.close();
								context.onChange({ values: { [row.key]: null } });
								return;
							}
							// Arming one line stands another down, exactly as
							// arming a sibling row's own bin icon once did.
							standDown();
							armedKey = row.key;
							armedLine = line;
							line.classList.add('sheetsmith-track-row-arming');
							status.textContent = armedPrompt(rowLabel);
							paint();
						});
						items.push({ key: row.key, label: rowLabel, button, said });
					}
					// Sets every line's `aria-label` before anything is armed,
					// rather than leaving it to whichever line's own click
					// happens to run `paint()` first.
					paint();
					focusFirstControl(panel);
				});
			}
		}
	},
};
