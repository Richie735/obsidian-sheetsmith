/*
 * Generate the harness's Obsidian chrome from the installed Obsidian.
 *
 * Obsidian ships its stylesheet inside a versioned asar in the user data
 * directory, so the real variable palette and the real settings-tab rules are
 * readable from disk. That beats approximating them by eye, which is where the
 * harness drifted: it was built against a pre-1.13 settings design and rendered
 * the layout editor in a frame Obsidian no longer uses.
 *
 * Output is `harness/obsidian.generated.css`, which `index.html` loads after
 * `theme.css` so it wins. It is **gitignored on purpose**: it is Obsidian's own
 * CSS, and this repository is public, so it is generated locally rather than
 * redistributed. Without it the harness falls back to the hand-written
 * approximation in `theme.css` and still works.
 *
 *   npm run harness:calibrate
 *
 * Re-run after an Obsidian update. `theme.css` documents which parts are
 * contract and which are chrome; this replaces the chrome with the real thing.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Where Obsidian keeps the versioned app bundle it updates itself into. */
function dataDir() {
	if (process.platform === 'darwin') {
		return join(homedir(), 'Library', 'Application Support', 'obsidian');
	}
	if (process.platform === 'win32') {
		return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'obsidian');
	}
	return join(homedir(), '.config', 'obsidian');
}

/** The newest obsidian-<version>.asar, by version order rather than name order. */
function newestAsar(dir) {
	const found = readdirSync(dir)
		.filter((name) => /^obsidian-[\d.]+\.asar$/.test(name))
		.map((name) => ({
			name,
			parts: (name.match(/[\d]+/g) ?? []).map(Number),
		}))
		.sort((a, b) => {
			for (let i = 0; i < Math.max(a.parts.length, b.parts.length); i++) {
				const diff = (b.parts[i] ?? 0) - (a.parts[i] ?? 0);
				if (diff !== 0) return diff;
			}
			return 0;
		});
	if (found.length === 0) throw new Error(`No obsidian-*.asar in ${dir}`);
	return join(dir, found[0].name);
}

/**
 * Read one file out of an asar.
 *
 * The header is four little-endian uint32s — a Chromium Pickle wrapping the
 * JSON directory — and the payload starts after it. The JSON begins at byte 16,
 * not 12: the pickle carries its own size *and* the string's.
 */
function readFromAsar(asarPath, name) {
	const buf = readFileSync(asarPath);
	const pickleSize = buf.readUInt32LE(4);
	const jsonLength = buf.readUInt32LE(12);
	const header = JSON.parse(buf.subarray(16, 16 + jsonLength).toString('utf8'));
	const entry = header.files[name];
	if (!entry) throw new Error(`${name} not found in ${asarPath}`);
	const start = 8 + pickleSize + Number(entry.offset);
	return buf.subarray(start, start + entry.size).toString('utf8');
}

/**
 * Global resets, taken whole.
 *
 * A category of its own rather than another CHROME entry, because a universal
 * selector is not settings chrome and the reason it has to come along is
 * different in kind. `* { box-sizing: border-box }` sits at the top level of
 * app.css and changes what every width and height in the app *means*; leaving
 * it out made the harness disagree with Obsidian by padding plus border at
 * every `height: 100%` — 18px on a card — which reads in a screenshot as a
 * component overflowing its grid cell.
 *
 * That is the worst possible failure for this harness to have. Reviewing
 * appearance here means reading the shots, so a false positive is not a
 * cosmetic problem: it invites a fix, with margins, for a collision that only
 * exists in the instrument. It masks the real thing just as well, since 18px of
 * phantom slack hides genuine overflow at the same sites.
 */
const RESET = /^\*$/;

/** Rules whose *whole* body is wanted: Obsidian's real settings chrome. */
const CHROME = [
	/^\.setting-item/,
	/^\.setting-editor/,
	/^\.clickable-icon/,
	/^\.vertical-tab-content/,
	/^\.checkbox-container/,
	/^\.dropdown$/,
	/^\.svg-icon/,
];

/**
 * Rules where only the custom properties are wanted, never the layout.
 *
 * The colour palette lives on bare `.theme-light` / `.theme-dark`, not on
 * `body.theme-*`: Obsidian sets the class on `body`, so both forms match at
 * runtime, and requiring the prefix here silently dropped every colour and left
 * the semantic variables pointing at an undefined `--color-base-00`.
 */
const PALETTE =
	/^(:root|body|\.theme-dark|\.theme-light|body\.theme-dark|body\.theme-light)$/;

/**
 * Split a stylesheet into top-level rules.
 *
 * Deliberately crude, and deliberately skips at-rules entirely: a real parser
 * would be a dependency, and everything wanted here sits at the top level.
 */
function rules(source) {
	// Comments first: a `}` inside one desyncs the brace depth for the rest of
	// the file, which is how this produced rules with selectors like `input`
	// spliced out of the middle of a declaration block.
	const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
	const out = [];
	let depth = 0;
	let start = 0;
	/** The quote character of the string being scanned through, if any. */
	let quote = '';
	for (let i = 0; i < css.length; i++) {
		const ch = css[i];
		// A brace inside a string is data, not syntax — the same hazard as the
		// comments stripped above, and the same desync. Not what broke this file
		// (see customProperties, which is where the real cut was) but the stylesheet
		// is full of quoted data URLs and a `content: "}"` would be enough.
		if (quote !== '') {
			if (ch === '\\') i++;
			else if (ch === quote) quote = '';
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (ch === '{') {
			if (depth === 0) start = i;
			depth++;
		} else if (ch === '}') {
			depth--;
			if (depth === 0) {
				const head = css.slice(out.at(-1)?.end ?? 0, start);
				out.push({
					selector: head.trim(),
					body: css.slice(start + 1, i),
					end: i + 1,
				});
			}
			if (depth < 0) depth = 0;
		}
	}
	return out;
}

/**
 * The custom property declarations in a rule body.
 *
 * Split with a scanner rather than `/--x:[^;]+;/`, because **a semicolon inside a
 * quoted value is data**. Obsidian carries pdf.js's variables, one of which is
 * `url("data:image/svg+xml;charset=UTF-8,<svg …>")`, and stopping at the first
 * semicolon emitted `url("data:image/svg+xml;` — an unterminated string. A
 * browser handed that swallows every rule after it looking for the closing quote,
 * so the entire generated file was dead from its eleventh line.
 *
 * That failure is worth the scanner on its own: nothing reported it. The harness
 * loaded a calibration that did nothing, the hand-written fallback in theme.css
 * carried every colour, and the shots looked plausible — an instrument claiming a
 * fidelity it did not have, which is worse for a review than no calibration at
 * all.
 */
function customProperties(body) {
	const found = [];
	let quote = '';
	let start = 0;
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (quote !== '') {
			if (ch === '\\') i++;
			else if (ch === quote) quote = '';
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (ch !== ';') continue;
		const declaration = body.slice(start, i).trim();
		start = i + 1;
		if (/^--[a-z0-9-]+\s*:/i.test(declaration)) found.push(`${declaration};`);
	}
	// A last declaration may carry no semicolon at all.
	const tail = body.slice(start).trim();
	if (/^--[a-z0-9-]+\s*:/i.test(tail)) found.push(`${tail};`);
	return found;
}

const asar = newestAsar(dataDir());
const version = asar.match(/obsidian-([\d.]+)\.asar/)?.[1] ?? 'unknown';
const css = readFromAsar(asar, 'app.css');

const lines = [
	'/*',
	' * GENERATED — do not edit, and do not commit.',
	` * Extracted from Obsidian ${version} by harness/calibrate.mjs.`,
	' *',
	' * Obsidian\'s own stylesheet, narrowed to the theme palette and the settings',
	' * chrome the layout editor sits in. Loaded after theme.css so it overrides the',
	' * hand-written approximation there.',
	' */',
	'',
];

let palettes = 0;
let chrome = 0;
let resets = 0;
for (const rule of rules(css)) {
	if (rule.selector.startsWith('@') || rule.selector === '') continue;
	const parts = rule.selector.split(',').map((s) => s.trim());
	if (parts.some((s) => RESET.test(s))) {
		lines.push(`${rule.selector} {${rule.body}}`, '');
		resets++;
		continue;
	}
	if (parts.some((s) => PALETTE.test(s))) {
		const props = customProperties(rule.body);
		if (props.length === 0) continue;
		lines.push(`${rule.selector} {`, ...props.map((p) => `\t${p}`), '}', '');
		palettes++;
		continue;
	}
	if (parts.some((s) => CHROME.some((re) => re.test(s)))) {
		lines.push(`${rule.selector} {${rule.body}}`, '');
		chrome++;
	}
}

const out = 'harness/obsidian.generated.css';
writeFileSync(out, lines.join('\n'));
console.log(
	`Wrote ${out} from Obsidian ${version}: ${palettes} palette blocks, ` +
		`${chrome} chrome rules, ${resets} global resets.`,
);
