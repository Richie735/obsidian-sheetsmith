/*
 * The layout's function library (SPEC §5).
 *
 * This is what makes the plugin system-agnostic: no game's arithmetic is
 * built in, so a 5e layout writes its own
 *
 *     mod(score) = floor((score - 10) / 2)
 *     prof       = ceil(level / 4) + 1
 *
 * and a Call of Cthulhu layout writes `half` and `fifth` instead, without
 * the plugin noticing the difference.
 *
 * One definition per line, stored as an array of strings so the layout file
 * stays hand-editable and the editor can show the same text in a textarea.
 * Blank lines and lines starting with # are ignored.
 *
 * A definition that cannot be read is left out of the library and reported
 * as a problem. It is not an error that stops the layout loading: a typo in
 * one function must not blank every sheet using the layout. The editor shows
 * the problem where it can be fixed, and a formula calling the missing
 * function fails on its own component, per SPEC §5.
 */

import {
	FormulaError,
	FunctionDefinition,
	FunctionLibrary,
	parseExpression,
	RESERVED_NAMES,
} from './expression';

/** A definition that could not be read, and where it is. */
export interface FunctionProblem {
	/** 1-based position in the definitions as written, blank lines included. */
	line: number;
	/** The definition as typed, so the reader can see which one is meant. */
	source: string;
	message: string;
}

export interface ParsedFunctions {
	library: FunctionLibrary;
	problems: readonly FunctionProblem[];
}

export const NO_PARSED_FUNCTIONS: ParsedFunctions = {
	library: new Map(),
	problems: [],
};

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * `name = body`, or `name(a, b) = body`. The `=` may not be `==`, so a
 * definition whose body starts with a comparison is reported as having no
 * `=` at all rather than being split down the middle of one.
 */
const DEFINITION = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s*=(?!=)\s*(.+)$/;

function parseParams(raw: string | undefined, name: string): string[] {
	if (raw === undefined || raw.trim() === '') return [];
	const params = raw.split(',').map((param) => param.trim());
	const seen = new Set<string>();
	for (const param of params) {
		if (!IDENTIFIER.test(param)) {
			throw new FormulaError(
				`"${param}" is not a usable parameter name for ${name}(). Use letters, digits, and underscores, not starting with a digit.`,
			);
		}
		if (seen.has(param)) {
			throw new FormulaError(`${name}() names the parameter "${param}" twice.`);
		}
		seen.add(param);
	}
	return params;
}

function parseDefinition(line: string): FunctionDefinition {
	const match = DEFINITION.exec(line);
	if (!match) {
		throw new FormulaError(
			'A definition looks like "name(a, b) = expression", or "name = expression" for a value.',
		);
	}
	const name = match[1] as string;
	if (RESERVED_NAMES.includes(name)) {
		throw new FormulaError(
			`"${name}" is built in and cannot be redefined by a layout.`,
		);
	}
	const params = parseParams(match[2], name);
	// Parsed here, not on first call: a syntax error should surface while the
	// user is looking at the definition, not later as a "?" on a card.
	return { name, params, body: parseExpression(match[3] as string) };
}

/**
 * Read a layout's function definitions. Never throws: every problem is
 * reported alongside the functions that did parse.
 */
export function parseFunctions(
	source: readonly string[] | undefined,
): ParsedFunctions {
	if (source === undefined || source.length === 0) return NO_PARSED_FUNCTIONS;

	const library = new Map<string, FunctionDefinition>();
	const problems: FunctionProblem[] = [];

	source.forEach((raw, index) => {
		const trimmed = raw.trim();
		if (trimmed === '' || trimmed.startsWith('#')) return;
		const report = (message: string): void => {
			problems.push({ line: index + 1, source: trimmed, message });
		};
		let definition: FunctionDefinition;
		try {
			definition = parseDefinition(trimmed);
		} catch (error) {
			report(error instanceof Error ? error.message : String(error));
			return;
		}
		if (library.has(definition.name)) {
			// The first definition stands. Dropping both would break every
			// formula calling a name the layout does define, twice over.
			report(`"${definition.name}" is already defined above; this line is ignored.`);
			return;
		}
		library.set(definition.name, definition);
	});

	return { library, problems };
}
