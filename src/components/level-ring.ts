/*
 * The graded ring: what a level column's control shows, and how it is painted.
 *
 * Shared by the sheet and by the layout editor's sample of it, which is the
 * point of the file existing. An editor drawing its own approximation of the
 * control would drift from the real one the first time either changed, and the
 * sample is there to answer "what will this look like?" exactly.
 *
 * Three consumers now, and the third is why the class it paints is called
 * `sheetsmith-level-ring` rather than naming a table: a Track whose run is one
 * segment is a flag, and `docs/UI.md` §9 requires a card and a cell doing the
 * same job to share the painter rather than measure differently under the same
 * finger. A painter naming one of its callers is PATTERNS §1's worked example.
 *
 * A level name may say what its ring shows, after a colon: "Proficient:" for a
 * plain fill carrying no letter, "Proficient:★" for a mark of the author's
 * own. Left alone it carries the initial of its name, which is what every
 * level did before this and what every existing layout still says.
 *
 * The marker lives in the name rather than in a key beside it because which
 * levels are worth lettering is a per-level answer: 5e letters expertise and
 * leaves proficiency a plain fill, and a system with four grades might letter
 * the top two. A flag on the column could only offer the guesses someone
 * thought of — all, none, the highest — and the layout is the thing that
 * knows.
 */

/** The parts of a level column this file reads. */
export interface LevelColumn {
	/** Names from none upwards, each optionally carrying its own glyph. */
	levels?: string[];
	/** Highest level, for a column whose levels are not worth naming. */
	max?: number;
}

/** Separates a level's name from the glyph its ring shows. */
const GLYPH_MARK = ':';

/**
 * The most a mark may be. One code point is all a 1.6em circle holds, and the
 * bound is what keeps the marker from changing what an existing file means: a
 * level called "Trained: the useful one" is a name with a colon in it, not a
 * ring carrying a sentence, and it reads today exactly as it read before this
 * syntax existed.
 */
const MARK_MAX = 1;

/**
 * A level as authored. `glyph` is null where the entry said nothing about it,
 * which means the initial of the name; empty where the entry asked for a fill
 * with nothing on it.
 */
export function parseLevel(entry: string): { name: string; glyph: string | null } {
	const mark = entry.indexOf(GLYPH_MARK);
	if (mark === -1) return { name: entry.trim(), glyph: null };
	const glyph = entry.slice(mark + 1).trim();
	// Counted by code point, so an astral mark counts as the one character it
	// looks like rather than the two it is stored as.
	if (Array.from(glyph).length > MARK_MAX) return { name: entry.trim(), glyph: null };
	return { name: entry.slice(0, mark).trim(), glyph };
}

/**
 * The most levels a ring may cycle through. Past this it is not a control the
 * hand cycles, and the bound is what stands between the editor and a typo: it
 * draws a ring per level, so a level count that arrived as a mis-typed 1000000
 * — or as the `max` of a number column whose type was changed — would other-
 * wise be a hang rather than a mistake to correct.
 */
export const MAX_LEVELS = 20;

/**
 * A level column's highest level. Naming the levels settles how many there
 * are, so the two cannot disagree; `max` covers the column whose levels are
 * not worth naming. One level is an ordinary toggle.
 *
 * Only the unnamed path is bounded. A list of names is a thing someone sat and
 * wrote, and silently dropping the end of it would be worse than a long
 * dropdown; a bare number is a field a finger can rest on.
 */
export function levelCount(column: LevelColumn): number {
	if (column.levels !== undefined) return column.levels.length - 1;
	const max = Math.floor(column.max ?? 1);
	if (!Number.isFinite(max) || max < 1) return 1;
	return Math.min(MAX_LEVELS, max);
}

/** What a level is called: its name where it has one, its number otherwise. */
export function levelName(column: LevelColumn, level: number): string {
	const entry = column.levels?.[level];
	return entry === undefined ? String(level) : parseLevel(entry).name;
}

/**
 * The one character the control shows for a level: what the level asked for,
 * the initial of its name where it asked for nothing, or its number where the
 * levels are unnamed. The initial is taken by code point rather than by index,
 * so a name starting outside the basic plane keeps its first character instead
 * of half of one.
 */
export function levelGlyph(column: LevelColumn, level: number): string {
	const entry = column.levels?.[level];
	if (entry === undefined) return String(level);
	const { name, glyph } = parseLevel(entry);
	if (glyph !== null) return glyph;
	return (Array.from(name)[0] ?? '').toUpperCase();
}

/**
 * The level a cell holds, held inside the column's range. A stored value
 * outside it is a hand edit or a layout that used to have more marks; showing
 * the nearest level the column can represent beats showing nothing, and the
 * note keeps what it says until the user changes that cell.
 */
export function levelOf(column: LevelColumn, raw: string): number {
	const value = raw.trim() === '' ? 0 : Number(raw);
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(levelCount(column), Math.round(value)));
}

/**
 * Paint a ring at a level: its glyph, its fill, and how far up the ramp the
 * fill sits. Everything a reader sees, and nothing a reader does — the sheet
 * adds the naming and the gestures, and the editor's sample adds neither.
 *
 * `graded` separates a level column from a plain toggle, which has one state
 * to be in and so no glyph and no share of the way up.
 */
export function paintLevelRing(
	ring: HTMLElement,
	column: LevelColumn,
	level: number,
	graded: boolean,
): void {
	const count = graded ? levelCount(column) : 1;
	// One glyph in a filled circle, and nothing at all for none — an empty
	// ring is what an unticked proficiency looks like on paper, and it needs
	// no letter to say so. A level that asked for no glyph shows the fill
	// alone, which is the same answer one step further.
	ring.textContent = level === 0 || !graded ? '' : levelGlyph(column, level);
	ring.classList.toggle('sheetsmith-level-ring-on', level > 0);
	// How far up the column this cell is, as a share of the way. The fill is
	// mixed from it, so a glance down the column reads the shape of a
	// character's training before a single letter is read. It arrives as a
	// number because the stylesheet cannot know how many levels a column has;
	// a plain toggle sets nothing and takes the full fill.
	if (graded && level > 0) {
		ring.style.setProperty('--sheetsmith-level', String(level / count));
	} else {
		ring.style.removeProperty('--sheetsmith-level');
	}
	// Under a partial fill the glyph is on something nearer the page than the
	// accent, so the letter goes back to reading against the page. Decided
	// here rather than in the mix, because a colour interpolated between the
	// two lands halfway to unreadable in the middle of the ramp.
	ring.classList.toggle(
		'sheetsmith-level-ring-part',
		level > 0 && level < count,
	);
}
