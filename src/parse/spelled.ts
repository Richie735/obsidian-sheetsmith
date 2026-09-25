/*
 * How a sentence the author reads presents a list of names: quoted as an
 * English series, and — past a bound — counted rather than named at all. Both
 * are one question, how many names a sentence can carry and in what form, so
 * the series and the point where it stops being worth spelling live together.
 * A modifier definition's report, the layout editor's depth refusal, a paste's
 * notice and the kept-section report (`section-adoption.ts`) all name several
 * things at once, and one module keeps them agreeing, down to what an empty
 * list reads as and how long a list may be before it is counted.
 */

/**
 * How many names a sentence spells out before it counts them instead: past this,
 * a `Notice` naming each is a paragraph nobody reads to the end.
 */
const NAMED_AT_MOST = 5;

/**
 * Whether a list is too long to name, so the sentence counts it instead.
 *
 * **The comparison, not only the number**, on `docs/PATTERNS.md` §1's rule to
 * share the application: three sentences in two modules make this choice (what
 * a paste depends on, which keys a configuration paste left, which kept sections
 * a paste now shows), and each spelled `length > NAMED_AT_MOST` itself. What each
 * one then *says* in either branch is its own sentence and stays with it.
 */
export function tooManyToName(names: readonly unknown[]): boolean {
	return names.length > NAMED_AT_MOST;
}

/** Quote a list as an English series: `"a"`, `"a" and "b"`, `"a", "b" and "c"`; `''` for none. */
export function spelled(names: readonly string[]): string {
	const quoted = names.map((name) => `"${name}"`);
	if (quoted.length <= 1) return quoted.join('');
	return `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
}
