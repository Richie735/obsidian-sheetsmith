/*
 * Make an element, give it a class, put text in it, append it.
 *
 * Four lines, spelled three times — `table.ts`, `record-set.ts` and
 * `modifier-form.ts` — which is `PATTERNS` §1's extraction rung. But the count
 * is not what forced it. The three *disagreed on mechanism*: two split the class
 * string on spaces and called `classList.add` per part, and the third assigned
 * `el.className`.
 *
 * `classList.add` throws `InvalidCharacterError` on a string holding a space,
 * and `src/test/obsidian-stub.ts` accepts one. That pair once aborted a table's
 * render mid-loop, so the sheet lost every row below the first while the whole
 * suite stayed green (`UI.md` §12). The `className =` copy was immune to it by
 * accident rather than by decision, which is the worst of the three states to be
 * in: a call site moved between two spellings that read identically changes
 * behaviour with nothing saying so.
 *
 * **The split is the behaviour that survived**, because it is what the call
 * sites already read the helper as — `'dropdown sheetsmith-panel-select'` is one
 * argument naming two classes — and a helper that means what its callers read it
 * as is cheaper than a rule each of them has to remember.
 *
 * `ui/` rather than `components/`, because nothing here knows what a component
 * is: a tag, a class string, a parent and some text are the whole vocabulary.
 * That is also what keeps it off the sibling allowlist §2 reserves for
 * decisions.
 *
 * `src/class-tokens.test.ts` holds the guard for the *trap*, which is a
 * different thing from the guard for this extraction and is deliberately not
 * kept here: it scans every `classList.add` in the repository, it covers files
 * that will never import this module, and it would still be the right check if
 * this module were deleted tomorrow.
 */

/**
 * The characters `DOMTokenList` refuses inside a token: the DOM spec's ASCII
 * whitespace, and exactly that set.
 *
 * Not `\s`, which is the obvious spelling and is wrong in both directions here.
 * It matches a non-breaking space, which is a perfectly legal class character a
 * browser keeps — so splitting on `\s` would quietly cut a name the browser
 * would have honoured, and a guard predicated on it would report a throw that
 * does not happen.
 */
const SEPARATOR = /[ \t\n\f\r]+/;

/**
 * Create `tag` with `className`, append it to `parent`, and return it.
 *
 * `className` is one class or several separated by whitespace — see the header
 * for why the split happens here and not at the call sites. Every run of ASCII
 * whitespace separates, and empty parts are dropped, so no string a caller can
 * compose reaches `classList.add` holding a character it would refuse.
 *
 * `text` omitted leaves the element empty, which is what a caller that is about
 * to fill it with children wants.
 *
 * The element comes from `parent.ownerDocument` rather than the global
 * `document`: a sheet renders into whatever document its view owns, and tests
 * and the harness render into the stub's.
 */
export function element<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className: string,
	parent: HTMLElement,
	text?: string,
): HTMLElementTagNameMap[K] {
	const el = parent.ownerDocument.createElement(tag);
	for (const one of className.split(SEPARATOR)) {
		if (one !== '') el.classList.add(one);
	}
	if (text !== undefined) el.textContent = text;
	parent.appendChild(el);
	return el;
}
