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
 */

import { setIcon } from 'obsidian';
import {
	armedName,
	armedPrompt,
	STOOD_DOWN,
} from '../interaction/arm-to-confirm';
import { GESTURE_COMMIT } from '../interaction/commit-window';
import { bindEditable } from '../interaction/editable';
import { levelGlyph, levelName, paintLevelRing, parseLevel } from './level-ring';
import {
	flagReading,
	flagText,
	isFlagSet,
	isFlagSpelling,
} from './stored-flag';
import { fencedLinkRefusal } from './fenced-link';
import { sampleFlag, samplePart, sampleNumber, sampleSeed } from './sample-values';
import { bindLongPress } from '../ui/popover';
import {
	closeAnchoredPanel,
	focusFirstControl,
	openAnchoredPanelKey,
	showAnchoredPanel,
} from '../ui/anchored-panel';
import { fencedKeyProblem, readFenced, writeFenced } from '../parse/fenced';
import { splitBounded, withCeiling, withValue } from '../parse/bounded-entry';
import {
	ComponentConfig,
	ComponentDefinition,
	FieldResolver,
	ReadResult,
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
		// The single run is a row set of one whose key is the storage key
		// every scalar component uses, so nothing downstream needs a second
		// shape for it.
		return [{ key: VALUE_KEY }];
	}
	return rows;
}

/** Whether this track is a named set rather than one anonymous run. */
export function isRowSet(config: TrackConfig): boolean {
	return config.rows !== undefined && config.rows.length > 0;
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
		return null;
	}
	if (config.count === undefined) {
		return 'This track needs a number of segments, named levels, or rows.';
	}
	return null;
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
	return runsOf(config).every(
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

export const track: ComponentDefinition<TrackConfig, TrackData> = {
	type: 'track',
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
				'How many segments a run holds, as a number or a formula, e.g. 10, or 2 + if(abilities.PHY >= 3, 2, 1). Ignored where the levels below are named. Where there are rows it is the fallback for a row that sets no length of its own. A plain 1 makes this a checkbox: two states, drawn as one ring, stored in the note as yes or no rather than as a count. A formula that happens to work out to 1 does not, since the note would then change spelling whenever the number behind it did.',
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
			description:
				'One run per entry, sharing a heading, a reset binding and a write. Spell slots are five first-level, three second and one third. Each key names the entry in the character note; a row with no length of its own falls back to the segment count above. A row\'s length may be the layout\'s formula or the character\'s own number, typed on the sheet — the character\'s for a die type, a slot level, or anything else whose count differs per character rather than being computed. Rows and named levels do not combine.',
		},
		{
			key: 'levels',
			kind: 'text-list',
			label: 'Level names',
			description:
				'Names the steps from none upwards, comma separated, e.g. Rested, Exhaustion 1, Exhaustion 2. A name may carry one glyph after a colon, as in "Exhaustion 6:☠". Naming the levels settles how many segments there are, so this wins over the count above.',
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
			description:
				'One yes-or-no flag: inspiration, equipped, trained. A track of one segment, so the note stores yes or no rather than a count, and the card draws one ring. Name the levels to letter the ring, or add rows for a checklist of flags under one heading.',
			config: { count: 1 },
		},
	],

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
		// be a second thing wrong on it. Card's own rule, one component over.
		if (configError(config) !== null) return '';
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
		return updates.size === 0 ? '' : writeFenced(null, updates);
	},

	read(body, config): ReadResult<TrackData> {
		const parsed = readFenced(body);
		if (!parsed.ok) return parsed;
		// No fence yet: an editable empty card, not an error.
		if (parsed.values === null) return { ok: true, data: null };
		const values: Record<string, string> = {};
		for (const row of runsOf(config)) {
			const raw = parsed.values.get(row.key);
			if (raw === undefined) continue;
			// Only the value half is validated as marks. The ceiling half, where
			// one is there at all, is a character-owned row's own length and is
			// not this method's business — `docs/features/track-row-length.md`'s
			// rule that a ceiling which is not a number behaves as no ceiling
			// rather than as a malformed entry, `bounded-entry.ts`'s own answer
			// one component over.
			const text = splitBounded(raw).value.trim();
			// A number the run cannot represent is still a number and is left
			// exactly as it is (§7). Something that is not one at all is a
			// malformed section, reported on this component alone.
			//
			// A flag's spelling is accepted on *every* run, not only on a flag
			// card, and that is the whole answer to a layout raising its count
			// from 1 to 3: the narrow rule would turn every note the flag ever
			// wrote into an error card at the moment the layout changed. `yes` on
			// a ten-segment run is one mark; `maybe` is still malformed.
			if (text !== '' && !readsAsMarks(text)) {
				// Named for what this card writes, not for what a Track writes in
				// general: a checkbox stores yes and no, so telling its author
				// about marks points them at a spelling that card never produces.
				// SPEC §10 wants the fix rather than the fault, and here the two
				// are different sentences for the same fault.
				return {
					ok: false,
					error: isFlagCard(config)
						? `"${text}" is not yes or no.`
						: `"${text}" is not a number of marks.`,
				};
			}
			values[row.key] = raw;
		}
		// An entry no row maps to is not read, and `write` touches only the
		// entries it is given — so it stays in the note untouched, which is
		// what makes a slot table safe to re-cut (§7).
		return { ok: true, data: { values } };
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
		const updates = new Map<string, string | null>();
		for (const [key, value] of Object.entries(data.values)) {
			updates.set(key, value);
		}
		return writeFenced(body, updates);
	},

	applyReset(data, config, reset, context): ResetResult<TrackData> {
		const marks = markSize(config);
		const rows = runsOf(config);
		const flag = isFlagCard(config);
		const values: Record<string, string> = {};
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

		if (showsOwnLabel(config, context)) {
			const label = card.createDiv();
			// The shared rank (docs/UI.md §9); this component's own class carries only
			// the narrow-card tracking, which needs a container to ask about.
			label.classList.add('sheetsmith-component-label', 'sheetsmith-track-label');
			label.textContent = config.label;
		}

		const marks = markSize(config);
		const rows = runsOf(config);
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
			rowSet && rows.some((r) => r.maxSource === 'character');
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
			const values: Record<string, string> = {};
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

		rows.forEach((row, index) => {
			const rowLabel = rowSet ? (row.name ?? row.key) : config.label;
			const characterOwned = row.maxSource === 'character';
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

			if (rowSet) {
				// Immediately left of its run, in the clothes the step name
				// wears. Proximity is what says a name belongs to the run
				// beside it rather than the one above it, and the column is
				// what lets the runs be read down as a shape.
				const name = line.createSpan('sheetsmith-track-row-name');
				name.textContent = row.name ?? row.key;
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

				/** The step's own name where they are named, yes or no otherwise. */
				const reading = (on: boolean): string =>
					named ? stepLabel(config, on ? 1 : 0, 1) : flagReading(on);

				run.paint = (): void => {
					const on = run.value >= 1;
					// Everything a reader sees comes from the shared painter, so
					// a flag on a card cannot measure differently from the same
					// flag in a cell. `graded` only where the steps are named,
					// which is what puts the level's own mark in the ring.
					paintLevelRing(el, { levels: config.levels }, on ? 1 : 0, named);
					el.setAttribute('aria-pressed', String(on));
					el.setAttribute(
						'aria-label',
						rowSet ? (row.name ?? row.key) : config.label,
					);
					// Only a named step earns a tooltip, and every named one is an
					// abbreviation: an initial, a mark of the layout's own, or a
					// bare fill saying nothing. An unnamed flag is a box, and
					// aria-pressed already says which way it is — a tooltip
					// repeating what is legible is noise fired at every pass.
					if (named) el.title = reading(on);
				};

				run.setMarks = (next: number): void => {
					const wanted = next >= 1 ? 1 : 0;
					if (wanted === run.value) return;
					run.value = wanted;
					run.paint();
				};

				runs.push(run);

				// The touch route to what a glyph stands for, where there is
				// something it is not already saying. A press held that long was
				// a question rather than an instruction, and it ends in a click.
				const longPressed = named
					? bindLongPress(el, () => reading(run.value >= 1))
					: null;

				el.addEventListener('click', () => {
					if (longPressed?.() === true) return;
					run.setMarks(run.value >= 1 ? 0 : 1);
					// Synchronously, not through `commitSoon`: a press's outcome
					// is its input, so there is no run of presses to wait out and
					// the debounce would only make the note late. So a checklist
					// writes once per ring rather than once per burst — `commit`
					// collects every dirty run, but this path has already written
					// the last one before the next press can arrive.
					commit();
				});

				el.addEventListener('keydown', (event) => {
					// Up and down move between a checklist's flags, on the axis
					// they are laid out on — the row set's rule unchanged, so a
					// card is still one tab stop. Left and right set and clear
					// without wrapping, which is the ring's "aim rather than
					// count" at two states. Space and Enter are the button's own
					// click and need nothing here.
					if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
						if (runs.length < 2) return;
						event.preventDefault();
						focusRun(runs.indexOf(run) + (event.key === 'ArrowDown' ? 1 : -1));
						return;
					}
					const wanted =
						event.key === 'ArrowRight'
							? 1
							: event.key === 'ArrowLeft'
								? 0
								: null;
					if (wanted === null) return;
					event.preventDefault();
					run.setMarks(wanted);
					commit();
				});

				run.paint();
				return;
			}

			const count = countFor(
				config,
				row,
				index,
				context.resolveField,
				context.resolved['count'],
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
				unresolved.setAttribute(
					'title',
					context.explainField?.(
						row.count !== undefined ? `rows.${index}.count` : 'count',
						{},
					) ?? 'The number of segments did not resolve.',
				);
				return;
			}

			const total = count * marks;
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
				// How far along the run this segment is. A harm run mixes its
				// fill from it, so the escalation is read as a shape before a
				// single name is; a progress run takes the accent whole. The
				// share comes in from here because the stylesheet cannot know
				// how long this run is — the same reason a level ring is
				// handed its own.
				if (harm) {
					segment.style.setProperty(
						'--sheetsmith-track-grade',
						String((at + 1) / count),
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

				segments.push(segment);
			}

			const step = named ? line.createDiv('sheetsmith-track-step') : null;

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
				const reading = stepLabel(config, filled, count);
				el.setAttribute('aria-valuenow', String(shown));
				el.setAttribute('aria-valuetext', reading);
				el.setAttribute(
					'aria-label',
					rowSet
						? `${row.name ?? row.key}, ${reading}`
						: `${config.label}, ${reading}`,
				);
				if (step !== null) step.textContent = reading;
				// Only a named run earns one. An unnamed step's name is the
				// count, which the segments already state — and a tooltip
				// repeating what is legible is noise fired at every pass, as
				// the card's label and the level ring both learned.
				if (named) el.title = reading;
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
					stepLabel(config, Math.floor(run.value / marks), count),
				);
			}

			run.paint();
		});

		/** A row's own name, or the card's where it draws no name of its own. */
		const rowName = (row: TrackRow): string =>
			rowSet ? (row.name ?? row.key) : config.label;

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
		if (notAdded.length > 0 || addedRows.length > 0) {
			const actions = card.createDiv('sheetsmith-track-actions');

			if (notAdded.length > 0) {
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
