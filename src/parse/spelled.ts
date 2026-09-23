/*
 * Quoting a list of names as an English series, for a sentence the author
 * reads: a modifier definition's report and the layout editor's depth refusal
 * both name several things at once, and one spelling keeps them agreeing,
 * down to what an empty list reads as.
 */

/** Quote a list as an English series: `"a"`, `"a" and "b"`, `"a", "b" and "c"`; `''` for none. */
export function spelled(names: readonly string[]): string {
	const quoted = names.map((name) => `"${name}"`);
	if (quoted.length <= 1) return quoted.join('');
	return `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
}
