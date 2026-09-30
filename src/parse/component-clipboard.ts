/*
 * A copied component as clipboard text, and reading one back
 * (`docs/features/component-copy-paste.md`, Data and file model).
 *
 * One job: the wrapper's shape. What goes into it is the layout editor's
 * (`editor/paste.ts` builds the component, `editor/paste-dependencies.ts` the
 * context); this spells it as text, and answers whether a piece of text is one
 * and what it holds. Nothing here reads a vault or touches a DOM, so it lives
 * beside the layout parser it validates through (Constraint 5).
 *
 * **A new format that is only ever read.** The text is never written into a
 * vault file as written: a paste takes the component out of it, renames and
 * places it, and the layout is saved through `serialiseLayout` like any other
 * edit. So there is no round trip here for Constraint 3 to be about, and an
 * unknown key at version 1 is ignored rather than preserved.
 *
 * **`from` carries no vault name and no file path**, and privacy is the reason:
 * clipboard text leaves the vault by design — it gets pasted into a chat, an
 * issue or a forum post when someone shares a component — and a vault's name
 * and a layout's folder say things about a person's files that sharing a
 * component does not need to say. What it carries is the layout's basename, for
 * the sentence a paste says, and a fingerprint of where it came from, for the
 * one question the paste asks of it: is this the layout it was copied from?
 */

import { Layout, LayoutParseError, parseLayout } from './layout';
import { ComponentConfig } from '../types';

/** The version this build writes, and the newest it reads. */
export const COMPONENT_COPY_VERSION = 1;

/**
 * What the copy says about the layout it came from, for the report and never
 * for the paste itself: a missing or malformed context degrades what a
 * cross-layout paste can say, and never refuses it.
 */
export interface CopyContext {
	/** The source's definition line for each function the copy calls, by name. */
	functions: Record<string, string>;
	/**
	 * The source's modifier definitions whose changes target a copied
	 * component, with the labels of what each changes. They stay behind.
	 */
	definitions: { name: string; targets: string[] }[];
}

/** One copied component, as the clipboard holds it. */
export interface ComponentCopy {
	from: {
		/** The source layout's basename, for display; null where the text named none. */
		layout: string | null;
		/** `layoutFingerprint` of the source; empty where the text carried none. */
		fingerprint: string;
	};
	/** The component with everything inside it, spelled as a layout spells it. */
	component: ComponentConfig;
	context: CopyContext;
}

/** What reading a piece of clipboard text found. Never thrown (`docs/PATTERNS.md` §4). */
export type ReadCopy = { ok: true; copy: ComponentCopy } | { error: string };

/** The refusal for text that is not a copied component at all. */
export const NO_COMPONENT =
	"The clipboard holds no Sheetsmith component. Copy one from a row's menu first.";

/** The refusal for a wrapper this build is too old to read. */
export const NEWER_COMPONENT =
	'This component was copied from a newer version of Sheetsmith. Update the plugin to paste it.';

/**
 * FNV-1a, 32-bit, over the UTF-16 code units of `text`, as eight lowercase hex
 * digits.
 *
 * Synchronous and a dozen lines with no dependency, which is the whole case for
 * it: `crypto.subtle.digest` is async, and both the copy's write and the
 * paste's same-layout check would have to await it for no gain, since this is
 * not a security boundary. Exported so a test can pin a published vector.
 */
export function fnv1a32(text: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}

/**
 * Which layout file a copy came from, without saying so in readable text.
 *
 * Over the vault name, a U+0000 separator and the file's vault path, so two
 * vaults holding a layout at the same path differ, and neither half can run
 * into the other. **Not a secret**: someone who already guesses both could
 * confirm the guess by hashing them. The aim is not publishing a path, not
 * resisting a targeted guess, and saying so here is what stops it being
 * mistaken for encryption later.
 */
export function layoutFingerprint(vault: string, path: string): string {
	return fnv1a32(`${vault}\u0000${path}`);
}

/**
 * The clipboard text for one copy: a versioned wrapper, tab-indented the way
 * `serialiseLayout` spells a layout, so a person reading the clipboard reads a
 * layout fragment.
 */
export function encodeComponentCopy(copy: ComponentCopy): string {
	return JSON.stringify(
		{
			sheetsmith: 'component',
			version: COMPONENT_COPY_VERSION,
			from: copy.from,
			component: copy.component,
			context: copy.context,
		},
		null,
		'\t',
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read a piece of text as a copied component, or say why it is not one.
 *
 * `version` is checked before anything the version governs. The component goes
 * through `parseLayout` as the single component of a throwaway layout, which is
 * every check a file gets — the shared keys, the reset shape, the depth rule,
 * and the rewrite of an id no formula could reference — so a paste can never
 * write what a layout would refuse to load.
 */
export function readComponentCopy(text: string): ReadCopy {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { error: NO_COMPONENT };
	}
	if (!isRecord(raw) || raw.sheetsmith !== 'component') return { error: NO_COMPONENT };
	const version = raw.version;
	if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
		return { error: NO_COMPONENT };
	}
	if (version > COMPONENT_COPY_VERSION) return { error: NEWER_COMPONENT };

	let parsed: Layout;
	try {
		parsed = parseLayout(
			JSON.stringify({ name: 'Clipboard', components: [raw.component] }),
		);
	} catch (error) {
		const said =
			error instanceof LayoutParseError || error instanceof Error
				? error.message
				: String(error);
		return { error: `The copied component cannot be pasted: ${said}` };
	}
	const component = parsed.components[0] as ComponentConfig;

	const from = isRecord(raw.from) ? raw.from : {};
	return {
		ok: true,
		copy: {
			from: {
				layout: typeof from.layout === 'string' && from.layout !== '' ? from.layout : null,
				fingerprint: typeof from.fingerprint === 'string' ? from.fingerprint : '',
			},
			component,
			context: readContext(raw.context),
		},
	};
}

/**
 * The context, keeping what is well formed and dropping the rest one entry at a
 * time — a function line that is not a string is one comparison the report
 * cannot make, not a reason to throw away the others.
 */
function readContext(value: unknown): CopyContext {
	const context: CopyContext = { functions: {}, definitions: [] };
	if (!isRecord(value)) return context;
	if (isRecord(value.functions)) {
		for (const [name, line] of Object.entries(value.functions)) {
			if (typeof line === 'string') context.functions[name] = line;
		}
	}
	if (Array.isArray(value.definitions)) {
		for (const entry of value.definitions) {
			if (!isRecord(entry) || typeof entry.name !== 'string') continue;
			const targets = Array.isArray(entry.targets)
				? entry.targets.filter((target): target is string => typeof target === 'string')
				: [];
			context.definitions.push({ name: entry.name, targets });
		}
	}
	return context;
}
