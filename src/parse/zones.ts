/*
 * What a Stat block record's body is made of, in bytes
 * (`docs/features/stat-block-zones.md`, Data and file model).
 *
 * `records.ts` one level down. A record's `rest` — everything after its fence —
 * is an optional picture line, an optional untitled lead, then one block per
 * `#### ` heading, and this module splits it into those pieces and puts them
 * back. `rest = picture + lead + block*`, so parse-then-serialise is the
 * identity by construction, exactly as `splitRecords` holds it one level up.
 *
 * **It knows which piece belongs to which zone and nothing about what a zone
 * holds.** A zone is a key, a type and a heading here; what a table, a list of
 * features or a block of text *is* stays with `table.ts`, `features.ts` and
 * `markdown-body.ts`. What this module owns is the placing: which block is
 * which zone, which content is drift, where a zone that has no block yet gets
 * one, and how one zone's content is replaced without any other byte moving.
 *
 * **A heading inside a fenced code block, a blockquote or an indented line is
 * content**, unlike a `###` or a `##`, which `records.ts` and `character.ts`
 * read without tracking fences. The asymmetry is deliberate: those two levels
 * hold structure the plugin writes, and a zone holds the reader's own markdown,
 * where a code block holding `####` is ordinary. Obsidian's outline counts no
 * heading inside a fence or a quote, so at this level the plugin sees the
 * headings the reader sees.
 *
 * In `parse/` for the reason that folder exists: note format, nothing from
 * `obsidian`, testable without the app.
 */

import { fenceAfter } from './code-fence';
import { lineText, renameHeadingLine, splitLines } from './lines';
import { splitLeadingTable } from './table';
import { writeBodyText } from './markdown-body';
import { parseEmbed } from './wikilink';

/** What starts a zone: four hashes at column 0, whitespace, then something. */
const ZONE_HEADING = /^####[ \t]+\S/;

/** The punctuation a heading may trail and still match its zone. */
const TRAILING_PUNCTUATION = /[.:;,!?]+$/;

/**
 * The three kinds of body zone, and the two built-ins a layout places and never
 * removes. **One copy of each, here**, because the component's configuration
 * check, its painter and the editor's field all ask which types exist and which
 * keys are built in, and three copies of a set can only be tested for still
 * agreeing (`docs/PATTERNS.md` §1, the one-step tier). Here rather than beside
 * the component, because the editor reads them too and a component is the one
 * place it may not import from.
 */
export const ZONE_TYPES = ['table', 'features', 'text'] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

/** What a table zone's column holds; a column with none is text. */
export type ZoneColumnType = 'text' | 'number';

export const BUILT_IN_ZONES = ['vitals', 'changes'] as const;

/** Whether a zone key names a built-in, without regard to case or spacing. */
export function isBuiltInZone(key: string | undefined): boolean {
	return (BUILT_IN_ZONES as readonly string[]).includes((key ?? '').trim().toLowerCase());
}

/** Whether a stored type is one of the three. */
export function isZoneType(type: string | undefined): type is ZoneType {
	return (ZONE_TYPES as readonly string[]).includes(type ?? '');
}

/** What a zone is, as far as placing its content goes. */
export interface ZoneSpec {
	key: string;
	type: ZoneType;
	/** The heading the note stores, as the layout spells it. */
	heading: string;
}

/** One `####` block: its heading line exactly as written, and what follows it. */
export interface ZoneBlock {
	headingLine: string;
	body: string;
}

/** A record's rest in its three kinds of piece, which concatenate back to it. */
export interface ZoneSplit {
	/** The picture line with the blank runs either side, or '' where none was looked for or found. */
	picture: string;
	/** Everything before the first zone heading, after the picture. */
	lead: string;
	blocks: ZoneBlock[];
}

/**
 * The key a heading matches its zone by: the text after the hashes, with an
 * ATX closing run, surrounding whitespace and a trailing run of punctuation
 * dropped, lower-cased without regard to locale. Internal spacing and emphasis
 * are kept, so `#### **Traits**` is not `Traits`. The same function reads a
 * layout's own headings, which is what makes two of them that come out alike
 * a refusal rather than a coin toss.
 */
export function zoneHeadingKey(heading: string): string {
	return heading
		.replace(/^#{4}[ \t]+/, '')
		.replace(/[ \t]+#+[ \t]*$/, '')
		.trim()
		.replace(TRAILING_PUNCTUATION, '')
		.trim()
		.toLowerCase();
}

/** A heading line's text as the note writes it, the hashes and spacing off. */
export function headingText(headingLine: string): string {
	return lineText(headingLine).replace(/^####[ \t]+/, '').trim();
}

/**
 * Walk the lines of `text`, saying of each whether it is a zone heading.
 *
 * One walk for every reader here, so the split, the guards and the rename
 * cannot disagree, and one fence rule under it for this module and
 * `features.ts` alike (`code-fence.ts`).
 */
function walk(text: string, visit: (line: string, heading: boolean) => void): void {
	let fence: string | null = null;
	for (const line of splitLines(text)) {
		const before = fence;
		fence = fenceAfter(before, line);
		visit(line, before === null && fence === null && ZONE_HEADING.test(lineText(line)));
	}
}

/** Every zone heading line in `text`, outside its fences, as written. */
export function zoneHeadingLines(text: string): string[] {
	const found: string[] = [];
	walk(text, (line, heading) => {
		if (heading) found.push(lineText(line));
	});
	return found;
}

/**
 * Where the picture line is in `text`, or null: its first non-blank line, one
 * embed and nothing else on `parseEmbed`'s strict reading, at column 0, and on
 * its own — followed by a blank line, a zone heading or the end. An embed that
 * runs into a sentence on the next line belongs to that paragraph.
 */
function findPicture(text: string): { before: string; line: string; after: string } | null {
	const lines = splitLines(text);
	let at = 0;
	while (at < lines.length && lineText(lines[at] as string).trim() === '') at++;
	const line = lines[at];
	if (line === undefined) return null;
	const content = lineText(line);
	if (!content.startsWith('!') || parseEmbed(content) === null) return null;
	const next = lines[at + 1];
	if (next !== undefined) {
		const following = lineText(next);
		if (following.trim() !== '' && !ZONE_HEADING.test(following)) return null;
	}
	let end = at + 1;
	while (end < lines.length && lineText(lines[end] as string).trim() === '') end++;
	return {
		before: lines.slice(0, at).join(''),
		line: lines.slice(at, end).join(''),
		after: lines.slice(end).join(''),
	};
}

/**
 * Split a record's rest into its picture, its lead and its blocks.
 *
 * The picture is looked for only where `picture` is set — the layout's
 * **Picture** — so with it off a lone embed is prose, as it always was.
 */
export function splitZones(rest: string, options: { picture: boolean }): ZoneSplit {
	let picture = '';
	let remainder = rest;
	if (options.picture) {
		const found = findPicture(rest);
		if (found !== null) {
			picture = found.before + found.line;
			remainder = found.after;
		}
	}
	let lead = '';
	const blocks: ZoneBlock[] = [];
	walk(remainder, (line, heading) => {
		if (heading) blocks.push({ headingLine: line, body: '' });
		else if (blocks.length === 0) lead += line;
		else (blocks[blocks.length - 1] as ZoneBlock).body += line;
	});
	return { picture, lead, blocks };
}

/** Put a split back together. The inverse of `splitZones`, byte for byte. */
export function joinZones(split: ZoneSplit): string {
	return (
		split.picture +
		split.lead +
		split.blocks.map((block) => block.headingLine + block.body).join('')
	);
}

/** The picture's target, or null where the split holds no picture line. */
export function pictureTarget(split: ZoneSplit): string | null {
	const line = splitLines(split.picture).find((one) => lineText(one).trim() !== '');
	return line === undefined ? null : parseEmbed(lineText(line));
}

/** The picture line as the note writes it, or ''. */
export function pictureSource(split: ZoneSplit): string {
	const line = splitLines(split.picture).find((one) => lineText(one).trim() !== '');
	return line === undefined ? '' : lineText(line).trim();
}

/** Where one zone's content lives in a record's rest. */
export interface ZonePlace {
	/** In its own block, the lead's leading table, or the lead's prose. */
	from: 'block' | 'lead-table' | 'lead-prose';
	/** The first block it takes, where it is a block. */
	block: number;
	/**
	 * The last block it takes: past `block` where unmatched blocks after a text
	 * zone joined it (the `####` trap), and -1 where it takes none.
	 */
	through: number;
	/** The content, every byte: what a write replaces. */
	content: string;
}

/** Content no zone owns, which is drawn and never dropped. */
export interface ZoneDrift {
	/**
	 * Why: a heading no zone matches, a second heading for a zone already held,
	 * or a lead part whose zone has its own heading or none of its type.
	 */
	kind: 'unmatched' | 'second' | 'lead';
	/** The heading as the note writes it; null for lead drift, which has none. */
	heading: string | null;
	/** The content under it, every byte. */
	content: string;
}

/** Which piece of a record's rest is which zone's, and what is no zone's. */
export interface ZonePlacement {
	split: ZoneSplit;
	/** The lead's leading table, where a table zone exists to take it. */
	leadTable: string;
	/** The lead after that table. */
	leadProse: string;
	zones: Map<string, ZonePlace>;
	drift: ZoneDrift[];
}

/**
 * Place a split's pieces into the layout's zones (Which block is which zone).
 *
 * In file order: a block matching a zone not yet claimed is that zone; one
 * matching a claimed zone is drift; one matching nothing joins the text zone
 * before it, or is drift. **The lead reads by 0.9.0's rule**: its leading
 * table to the first table zone, the rest to the first text zone — unless that
 * zone has a heading of its own, which wins, and the lead part is drift.
 */
export function placeZones(split: ZoneSplit, specs: readonly ZoneSpec[]): ZonePlacement {
	const byKey = new Map(specs.map((spec) => [zoneHeadingKey(spec.heading), spec]));
	const keys = split.blocks.map((block) => zoneHeadingKey(headingText(block.headingLine)));
	const headed = new Set<string>();
	keys.forEach((key) => {
		const spec = byKey.get(key);
		if (spec !== undefined) headed.add(spec.key);
	});

	const zones = new Map<string, ZonePlace>();
	const drift: ZoneDrift[] = [];

	const firstTable = specs.find((spec) => spec.type === 'table');
	const firstText = specs.find((spec) => spec.type === 'text');
	let leadTable = '';
	let leadProse = split.lead;
	if (firstTable !== undefined && split.lead.trim() !== '') {
		const found = splitLeadingTable(split.lead);
		if (found !== null) {
			leadTable = found.table;
			leadProse = found.rest;
		}
	}
	const leadDrift: string[] = [];
	if (leadTable !== '') {
		if (firstTable !== undefined && !headed.has(firstTable.key)) {
			zones.set(firstTable.key, { from: 'lead-table', block: -1, through: -1, content: leadTable });
		} else {
			leadDrift.push(leadTable);
		}
	}
	/** The text zone the lead's prose went to, which unmatched blocks may join. */
	let open: ZonePlace | null = null;
	if (leadProse.trim() !== '') {
		if (firstText !== undefined && !headed.has(firstText.key)) {
			open = { from: 'lead-prose', block: -1, through: -1, content: leadProse };
			zones.set(firstText.key, open);
		} else {
			leadDrift.push(leadProse);
		}
	}
	if (leadDrift.length > 0) {
		drift.push({ kind: 'lead', heading: null, content: leadDrift.join('') });
	}

	split.blocks.forEach((block, at) => {
		const spec = byKey.get(keys[at] as string);
		const whole = block.headingLine + block.body;
		if (spec !== undefined && !zones.has(spec.key)) {
			const place: ZonePlace = { from: 'block', block: at, through: at, content: block.body };
			zones.set(spec.key, place);
			open = spec.type === 'text' ? place : null;
			return;
		}
		if (spec === undefined && open !== null) {
			open.through = at;
			open.content += whole;
			return;
		}
		drift.push({
			kind: spec === undefined ? 'unmatched' : 'second',
			heading: headingText(block.headingLine),
			content: block.body,
		});
		open = null;
	});
	return { split, leadTable, leadProse, zones, drift };
}

/**
 * Put `text` into a zone's raw content, keeping the content's own framing.
 *
 * `writeBodyText` where there is text to frame. Where there is none, the first
 * line ending — the blank under a heading — stays first, and every blank line
 * after it stays after the text, so the gap above the next heading is the gap
 * there was.
 */
export function writeZoneText(raw: string, text: string): string {
	if (raw.trim() !== '') return writeBodyText(raw, text);
	if (raw === '') return `\n${text}\n`;
	const at = raw.indexOf('\n');
	if (at < 0) return `${raw}\n${text}\n`;
	return `${raw.slice(0, at + 1)}${text}\n${raw.slice(at + 1)}`;
}

/** Whether `text` ends on a blank line: what a following heading needs above it. */
function endsBlank(text: string): boolean {
	return /\n[ \t]*\r?\n$/.test(text) || /^[ \t]*\r?\n$/.test(text);
}

/**
 * A new block, `#### <heading>` and its body, placed by layout order: before
 * the first block of a zone the layout puts after this one, or else after the
 * last block but before the rest's trailing blank run, so the gap above the
 * next `###` is unchanged. A blank line goes above it where the piece before
 * does not end in one.
 */
function insertBlock(
	placement: ZonePlacement,
	specs: readonly ZoneSpec[],
	spec: ZoneSpec,
	body: string,
): string {
	const { split } = placement;
	const order = specs.findIndex((one) => one.key === spec.key);
	const later = new Set(specs.slice(order + 1).map((one) => one.key));
	let before: number | null = null;
	for (const [key, place] of placement.zones) {
		if (place.from !== 'block' || !later.has(key)) continue;
		if (before === null || place.block < before) before = place.block;
	}
	const ending = body.endsWith('\n') ? body : `${body}\n`;
	const block = `#### ${spec.heading}\n${ending}`;
	if (before !== null) {
		const head = split.picture + split.lead +
			split.blocks.slice(0, before).map((one) => one.headingLine + one.body).join('');
		const tail = split.blocks.slice(before).map((one) => one.headingLine + one.body).join('');
		const glue = head === '' ? '\n' : endsBlank(head) ? '' : head.endsWith('\n') ? '\n' : '\n\n';
		return `${head}${glue}${block}\n${tail}`;
	}
	const all = joinZones(split);
	const lines = splitLines(all);
	let last = lines.length;
	while (last > 0 && lineText(lines[last - 1] as string).trim() === '') last--;
	const content = lines.slice(0, last).join('');
	const trailing = lines.slice(last).join('');
	if (content === '') return `\n${block}${trailing}`;
	if (content.endsWith('\n')) return `${content}\n${block}${trailing}`;
	return `${content}\n\n${block}`;
}

/**
 * The rest with one zone's content rewritten, every other byte kept.
 *
 * `transform` is handed the zone's content, or null where the zone has none
 * anywhere in the record — and then what it returns becomes a new block's body
 * under the zone's heading, placed by layout order. A zone read off a 0.9.0
 * lead is rewritten in place and gains no heading. A zone that took unmatched
 * blocks after it is one piece: what it returns replaces all of them, and a
 * `####` line it still holds comes back as the same trap on the next read.
 */
export function replaceZone(
	rest: string,
	specs: readonly ZoneSpec[],
	key: string,
	options: { picture: boolean },
	transform: (content: string | null) => string,
): string {
	const spec = specs.find((one) => one.key === key);
	if (spec === undefined) return rest;
	const split = splitZones(rest, options);
	const placement = placeZones(split, specs);
	const place = placement.zones.get(key);
	if (place === undefined) {
		return insertBlock(placement, specs, spec, transform(null));
	}
	const next = transform(place.content);
	if (next === place.content) return rest;
	const blocks = [...split.blocks];
	if (place.from === 'block') {
		const block = blocks[place.block] as ZoneBlock;
		blocks.splice(place.block, place.through - place.block + 1, { ...block, body: next });
		return joinZones({ ...split, blocks });
	}
	if (place.from === 'lead-table') {
		return joinZones({ ...split, lead: next + placement.leadProse });
	}
	blocks.splice(0, place.through + 1);
	return joinZones({ ...split, lead: placement.leadTable + next, blocks });
}

/**
 * The rest with its picture set, replaced or cleared (`target` null), every
 * other byte kept.
 *
 * Set goes after the rest's leading blank run, the line then a blank line, so
 * clearing — the line and the one blank line after it — gives back exactly the
 * rest there was. An empty rest gets `\n![[target]]\n`, and clearing that gives
 * the empty rest back.
 */
export function withPicture(rest: string, target: string | null): string {
	const found = findPicture(rest);
	const ending = /\r\n/.test(rest) ? '\r\n' : '\n';
	if (target === null) {
		if (found === null) return rest;
		const lines = splitLines(found.line);
		const [line, blank, ...more] = lines;
		if (rest === `\n${line ?? ''}`) return '';
		const kept = blank !== undefined && lineText(blank).trim() === '' ? more : [blank ?? '', ...more];
		return found.before + kept.join('') + found.after;
	}
	const embed = `![[${target}]]`;
	if (found !== null) {
		const [line, ...more] = splitLines(found.line);
		const text = lineText(line ?? '');
		const eol = (line ?? '').slice(text.length);
		return found.before + embed + eol + more.join('') + found.after;
	}
	if (rest === '') return `\n${embed}\n`;
	const lines = splitLines(rest);
	let at = 0;
	while (at < lines.length && lineText(lines[at] as string).trim() === '') at++;
	return lines.slice(0, at).join('') + embed + ending + ending + lines.slice(at).join('');
}

/** What a heading rename did to one record's rest. */
export type HeadingRename =
	| { kind: 'absent' }
	| { kind: 'collision' }
	| { kind: 'renamed'; rest: string };

/**
 * Rename every zone heading matching `from` to `to`, keeping each line's
 * `#### ` and its line ending. Refused, and nothing moved, where the rest
 * already holds a heading matching `to` — a drift block included: two blocks
 * are never merged. A 0.9.0 lead has no heading, so nothing in it moves.
 */
export function renameZoneHeading(rest: string, from: string, to: string): HeadingRename {
	const fromKey = zoneHeadingKey(from);
	const toKey = zoneHeadingKey(to);
	const split = splitZones(rest, { picture: false });
	const keys = split.blocks.map((block) => zoneHeadingKey(headingText(block.headingLine)));
	if (!keys.includes(fromKey)) return { kind: 'absent' };
	if (fromKey !== toKey && keys.includes(toKey)) return { kind: 'collision' };
	const blocks = split.blocks.map((block, at) =>
		keys[at] === fromKey ? { ...block, headingLine: renameHeadingLine(block.headingLine, 4, to) } : block,
	);
	const next = joinZones({ ...split, blocks });
	return next === rest ? { kind: 'absent' } : { kind: 'renamed', rest: next };
}
