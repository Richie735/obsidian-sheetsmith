/*
 * Enough of the Obsidian module to run the settings UI under happy-dom.
 *
 * The layout editor and the list fields are the only code in this plugin that
 * could not be tested at all: `src/parse` and `src/formula` are pure by
 * constraint, components build DOM with the standard API, and everything else
 * was reachable. That left the editor — which is where the layout, and so
 * every character sheet built on it, is actually authored.
 *
 * This stubs the two module members those files import, plus the helpers
 * Obsidian adds to the DOM prototypes. It is a test double, not a
 * reimplementation: each method does the least that makes the code under test
 * behave as it does in the app.
 */

/**
 * `DomElementInfo`, member for member.
 *
 * **Kept level with the real interface rather than with what this repository
 * happens to pass**, because the failure of a narrow options type is silent in
 * the one direction that matters: a key the app honours and the double ignores
 * works in Obsidian, does nothing under test, and does nothing in the harness.
 * `placeholder` is the case that proves it: seventeen `.placeholder =`
 * assignments across `src/`, thirteen of them in `src/components/`, any of
 * which a later edit could move into an options object.
 *
 * `attr` values are widened to what the real interface allows, and `text` takes
 * a `DocumentFragment`, which is how a description built by `createFragment`
 * reaches an element.
 */
interface ElementOptions {
	cls?: string | string[];
	text?: string | DocumentFragment;
	attr?: Record<string, string | number | boolean | null>;
	title?: string;
	parent?: Node;
	value?: string;
	type?: string;
	prepend?: boolean;
	placeholder?: string;
	href?: string;
}

function applyOptions(el: HTMLElement, options?: ElementOptions): void {
	if (!options) return;
	if (options.cls) {
		// ASCII whitespace exactly, never `\s`, on `ui/element.ts`'s argument and
		// not a fresh one: `\s` also matches a non-breaking space, which is a
		// legal class character a browser keeps, so splitting on it would cut a
		// name the DOM would have honoured. `DOMTokenList` refuses this set and
		// this set only. An array is not split, which is why an element of one
		// holding a space is the trap `class-tokens.test.ts` reads for.
		const classes = Array.isArray(options.cls)
			? options.cls
			: options.cls.split(/[ \t\n\f\r]+/);
		for (const name of classes) if (name !== '') el.classList.add(name);
	}
	if (options.text !== undefined) {
		// A fragment is assigned rather than appended, which is the same thing on
		// the fresh element every helper hands this and the honest spelling of
		// "the textContent to be assigned".
		if (typeof options.text === 'string') el.textContent = options.text;
		else el.replaceChildren(options.text);
	}
	if (options.type !== undefined) el.setAttribute('type', options.type);
	// The property, not the attribute: on an input the `value` attribute is the
	// *default* value, and the code under test reads the live one.
	if (options.value !== undefined) (el as HTMLInputElement).value = options.value;
	if (options.placeholder !== undefined) {
		(el as HTMLInputElement | HTMLTextAreaElement).placeholder =
			options.placeholder;
	}
	if (options.href !== undefined) el.setAttribute('href', options.href);
	if (options.title !== undefined) el.setAttribute('title', options.title);
	for (const [name, value] of Object.entries(options.attr ?? {})) {
		// `null` means "not set" rather than the string "null". Every element
		// reaching here is fresh, so there is nothing to remove.
		if (value === null) continue;
		el.setAttribute(name, String(value));
	}
}

/**
 * Build an element the way Obsidian's helpers do.
 *
 * `parent` in the options wins over the receiver, which is what "the parent
 * element to be assigned to" means, and `prepend` puts the element first
 * instead of last. Both matter to a caller that cannot append in the order it
 * creates.
 *
 * The parent is a `Node`, because Obsidian installs these on `Node` and a
 * `DocumentFragment` is one: `createFragment`'s callback builds through exactly
 * this path.
 */
function make(
	/**
	 * Null for the *global* `createEl`, which creates an element and attaches it
	 * to nothing. Obsidian's own `Node.prototype.createEl` is that global with
	 * `parent` filled in — `enhance.js` reads
	 * `Node.prototype.createEl = function (t, e, n) { (e ||= {}).parent = this;
	 * return createEl(t, e, n) }` — so the detached form is the primitive here
	 * and the attaching one is the special case, not the other way round.
	 */
	parent: Node | null,
	tag: string,
	options?: ElementOptions | string,
	callback?: (el: HTMLElement) => void,
): HTMLElement {
	const info = typeof options === 'string' ? { cls: options } : options;
	const doc = parent?.ownerDocument ?? (parent as Document | null) ?? document;
	const el = doc.createElement(tag);
	applyOptions(el, info);
	const into = info?.parent ?? parent;
	if (into) {
		if (info?.prepend) into.insertBefore(el, into.firstChild);
		else into.appendChild(el);
	}
	callback?.(el);
	return el;
}

/** Install the prototype helpers Obsidian adds to every element. */
export function installDomHelpers(): void {
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;

	// All three take `DomElementInfo | string`, a bare string being the class.
	// `createEl` took only the object before, which is the narrowing this file's
	// header warns about: `createEl('span', 'sheetsmith-x')` compiles in the app.
	proto.createEl = function (
		this: HTMLElement,
		tag: string,
		options?: ElementOptions | string,
		callback?: (el: HTMLElement) => void,
	): HTMLElement {
		return make(this, tag, options, callback);
	};

	proto.createDiv = function (
		this: HTMLElement,
		options?: ElementOptions | string,
		callback?: (el: HTMLElement) => void,
	): HTMLElement {
		return make(this, 'div', options, callback);
	};

	proto.createSpan = function (
		this: HTMLElement,
		options?: ElementOptions | string,
		callback?: (el: HTMLElement) => void,
	): HTMLElement {
		return make(this, 'span', options, callback);
	};

	proto.appendText = function (this: HTMLElement, text: string): void {
		this.appendChild(this.ownerDocument.createTextNode(text));
	};

	proto.addClass = function (this: HTMLElement, ...names: string[]): void {
		this.classList.add(...names);
	};
	proto.removeClass = function (this: HTMLElement, ...names: string[]): void {
		this.classList.remove(...names);
	};
	proto.toggleClass = function (
		this: HTMLElement,
		names: string | string[],
		on: boolean,
	): void {
		for (const name of Array.isArray(names) ? names : [names]) {
			this.classList.toggle(name, on);
		}
	};
	// A plain write through `el.style`, which is all the app's own is. Here
	// because a module that calls it has to keep working in the test run and in
	// the harness, neither of which has Obsidian to install it. When a plugin
	// module should reach for it is `docs/PATTERNS.md` §5's question, not this
	// file's: `setCssProps` is deliberately absent, because nothing calls it.
	proto.setCssStyles = function (
		this: HTMLElement,
		styles: Partial<CSSStyleDeclaration>,
	): void {
		Object.assign(this.style, styles);
	};
	/*
	 * Obsidian's own visibility pair, and the inline `display` is the whole
	 * point of it rather than an implementation detail.
	 *
	 * `app.css` declares `.setting-item { display: flex }` at author level,
	 * which beats the UA sheet's `[hidden] { display: none }` — and no
	 * `[hidden]` rule exists in `app.css`, `styles.css` or `src/styles/` to put
	 * it back. So `settingEl.hidden = true` leaves a setting row on screen in
	 * the app, while a case asserting the attribute passes: green in the suite
	 * and wrong in the app, which is this file's own reason for existing. An
	 * inline `display` wins over the class, which is why a plugin hiding a row
	 * reaches for these (`docs/features/starting-a-new-layout.md`).
	 *
	 * `show` *removes* the property rather than setting a value, so a row goes
	 * back to whatever display its class gives it rather than to `block`.
	 * `isShown` is deliberately absent: the app's answers about every ancestor
	 * too, and a self-only version would be exactly the declared-and-not-
	 * honoured member this file's header is about.
	 */
	// Through the helper above rather than through `el.style` directly, which
	// `obsidianmd/no-static-styles-assignment` refuses in either spelling: it is
	// the same write, and `''` is how a standard property is cleared
	// (`docs/PATTERNS.md` §5), so `show` puts a row back to whatever display its
	// class gives it rather than to `block`.
	/*
	 * Self-only and therefore honestly modellable, which is what separates it
	 * from `isShown` above: the app's answer is `document.activeElement === this`
	 * and nothing about an ancestor. `AbstractInputSuggest` gates every query on
	 * it, so a double without it lets a test drive a path the app refuses.
	 */
	proto.isActiveElement = function (this: HTMLElement): boolean {
		return this.ownerDocument.activeElement === this;
	};
	proto.show = function (this: HTMLElement): void {
		this.setCssStyles({ display: '' });
	};
	proto.hide = function (this: HTMLElement): void {
		this.setCssStyles({ display: 'none' });
	};
	proto.toggleVisibility = function (
		this: HTMLElement,
		visible: boolean,
	): void {
		if (visible) this.show();
		else this.hide();
	};
	proto.setText = function (this: HTMLElement, text: string): void {
		this.textContent = text;
	};
	proto.empty = function (this: HTMLElement): void {
		this.replaceChildren();
	};

	// Obsidian's own guard: constructors are per-window, so `instanceof` is
	// unreliable across a popout. The plugin uses it everywhere.
	(Element.prototype as unknown as Record<string, unknown>).instanceOf =
		function (this: Element, type: new () => unknown): boolean {
			return this instanceof type;
		};
}

// Only where there is a DOM to install onto. This module is the whole of
// `obsidian` under vitest, so importing it is now something a component does — a
// Table takes `setIcon` — and that puts it in the import graph of tests that
// have no business with a DOM at all: the registry contract, the reset flow, the
// worked examples. Those run in node, where `HTMLElement` does not exist, and an
// unconditional call here made them fail on import. Nothing in a node environment
// renders, so there is nothing for the helpers to be missing from.
if (typeof HTMLElement !== 'undefined') installDomHelpers();

/**
 * The two platform facts the plugin reads. `isMobile` is which controls
 * `addControls` renders, and the tests flip it to cover both; `isMacOS` is which
 * modifier name the layout editor's tree spells in its shortcut hint (Option
 * against Alt), false by default so a hint reads the same on every machine a
 * test runs on.
 */
export const Platform = { isMobile: false, isMacOS: false };

/**
 * The path half of a link, with any `#subpath` dropped — which is what
 * `getFirstLinkpathDest` is given.
 */
export function getLinkpath(linktext: string): string {
	return linktext.split('#')[0] ?? linktext;
}

/**
 * Whether the running app is at least this version.
 *
 * True, always, and the constant is the honest answer rather than a shortcut:
 * this stub implements one Obsidian, the newest one, and every member on it is
 * a member that app has. A stub that answered `false` for some version would be
 * claiming to be an older app while still offering the whole of the newer
 * surface, which is a worse lie than the simple one.
 *
 * It exists so a caller can *say* which floor it is assuming.
 * `harness/settings-panel.ts` renders the settings tab through `update()`, an
 * Obsidian 1.13 member, against a `minAppVersion` of 1.9.0 that the plugin's
 * own `display()` fallback is there to serve — and a guard is how that reads as
 * a decision in the code rather than as an oversight a linter caught.
 */
export function requireApiVersion(_version: string): boolean {
	return true;
}

/** Which modifiers mean "somewhere else" is the app's rule; this is its shape. */
export class Keymap {
	static isModEvent(event?: { metaKey?: boolean; ctrlKey?: boolean } | null): boolean {
		return event?.metaKey === true || event?.ctrlKey === true;
	}
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One shape in an icon: an element name and its attributes. */
type IconShape = readonly [string, Readonly<Record<string, string>>];

/** Six dots in two columns, which is what a Lucide drag handle is. */
function gripDots(): IconShape[] {
	const dots: IconShape[] = [];
	for (const cx of ['9', '15']) {
		for (const cy of ['5', '12', '19']) {
			dots.push(['circle', { cx, cy, r: '1' }]);
		}
	}
	return dots;
}

/**
 * The Lucide shapes for the icons this plugin asks for, on a 24x24 grid.
 *
 * Drawn rather than named because the harness exists to be looked at: a control
 * labelled "grip-vertical" is not the control a user sees, and reviewing it
 * reviews the wrong thing. Only the icons `src/` actually uses are here, and an
 * unknown name falls back to the name — which is how a missing entry announces
 * itself rather than rendering an empty square.
 */
const ICONS: Readonly<Record<string, readonly IconShape[]>> = {
	trash: [
		['path', { d: 'M3 6h18' }],
		['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }],
		['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
	],
	'trash-2': [
		['path', { d: 'M3 6h18' }],
		['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }],
		['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
		['line', { x1: '10', x2: '10', y1: '11', y2: '17' }],
		['line', { x1: '14', x2: '14', y1: '11', y2: '17' }],
	],
	'chevron-down': [['path', { d: 'm6 9 6 6 6-6' }]],
	'chevron-right': [['path', { d: 'm9 18 6-6-6-6' }]],
	'chevron-left': [['path', { d: 'm15 18-6-6 6-6' }]],
	'arrow-up': [
		['path', { d: 'm5 12 7-7 7 7' }],
		['path', { d: 'M12 19V5' }],
	],
	'arrow-down': [
		['path', { d: 'M12 5v14' }],
		['path', { d: 'm19 12-7 7-7-7' }],
	],
	'grip-vertical': gripDots(),
	// The layout editor's tree row menu button (`docs/features/layout-editor-tree.md`
	// §1): three dots stacked, Lucide's own circles.
	'ellipsis-vertical': [
		['circle', { cx: '12', cy: '12', r: '1' }],
		['circle', { cx: '12', cy: '5', r: '1' }],
		['circle', { cx: '12', cy: '19', r: '1' }],
	],
	// The layout editor's **Copy layout JSON** control, beside the trash on the
	// same row (`docs/features/layout-import-export.md`). Two overlapping sheets,
	// which is the one glyph a reader already reads as "copy" — and it has to be
	// drawn rather than named, because the harness is where a row of clickable
	// icons is checked for measuring the same.
	copy: [
		['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }],
		['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
	],
	// A tree row's **Paste** and **Paste configuration**
	// (`docs/features/component-copy-paste.md` §1), copied out of Obsidian
	// 1.13.7's own icon table rather than from Lucide's site, so the glyph a
	// shot draws is the one the app draws. The rect is `[x, y, w, h, rx]` there.
	'clipboard-paste': [
		['path', { d: 'M11 14h10' }],
		['path', { d: 'M16 4h2a2 2 0 0 1 2 2v1.344' }],
		['path', { d: 'm17 18 4-4-4-4' }],
		['path', { d: 'M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113' }],
		['rect', { x: '8', y: '2', width: '8', height: '4', rx: '1' }],
	],
	paintbrush: [
		['path', { d: 'm14.622 17.897-10.68-2.913' }],
		[
			'path',
			{
				d: 'M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z',
			},
		],
		[
			'path',
			{
				d: 'M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15',
			},
		],
	],
	// An empty modifier cell, which is the entry point for adding one: `plus`
	// rather than a fainter `zap`, because "none" against "applying" would then be
	// a difference of fill strength alone (`docs/UI.md` §6).
	plus: [
		['path', { d: 'M5 12h14' }],
		['path', { d: 'M12 5v14' }],
	],
	// The modifier cell's two filled states (SPEC §5). A shape difference rather
	// than a fill strength, which is what `docs/UI.md` §6 asks of a new mark — and
	// it is what a review has to be able to *see*, since the whole control is a
	// glyph.
	zap: [
		[
			'path',
			{
				d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
			},
		],
	],
	/*
	 * The read-only account of a modifier, which is deliberately *not* the bolt
	 * beside it: `zap` marks a control that edits which modifiers a row declares,
	 * and this marks one that only explains (`docs/UI.md` §9).
	 *
	 * `h.01` is Lucide's own spelling of the dot — a zero-length stroke with a
	 * round cap — rather than a fourth circle, and it is copied as written for
	 * the reason this table exists at all.
	 */
	info: [
		['circle', { cx: '12', cy: '12', r: '10' }],
		['path', { d: 'M12 16v-4' }],
		['path', { d: 'M12 8h.01' }],
	],
	'zap-off': [
		['path', { d: 'M10.513 4.856 13.12 2.17a.5.5 0 0 1 .86.46l-1.377 4.317' }],
		['path', { d: 'M15.656 10H20a1 1 0 0 1 .78 1.63l-1.72 1.773' }],
		[
			'path',
			{
				d: 'M16.273 16.273 10.88 21.83a.5.5 0 0 1-.86-.46l1.917-6.01A1 1 0 0 0 11 14H4a1 1 0 0 1-.78-1.63l4.507-4.643',
			},
		],
		['path', { d: 'm2 2 20 20' }],
	],
};

/**
 * Draw an icon the way Obsidian does: an inline SVG carrying `svg-icon` and
 * `lucide-<name>`, stroked in `currentColor` so it takes the colour of the
 * control holding it.
 *
 * Built through the DOM rather than assembled as markup — the name is a
 * parameter, and interpolating one into `innerHTML` is the unsafe-assignment
 * the lint rules reject on the plugin's behalf.
 *
 * `data-icon` is still set: it is what a test asserts on, and a far better
 * handle than the shape of a path.
 */
export function setIcon(el: HTMLElement, icon: string): void {
	el.dataset.icon = icon;
	const shapes = ICONS[icon];
	if (shapes === undefined) {
		el.textContent = icon;
		return;
	}
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('class', `svg-icon lucide-${icon}`);
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', '2');
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');
	for (const [tag, attrs] of shapes) {
		const shape = document.createElementNS(SVG_NS, tag);
		for (const [name, value] of Object.entries(attrs)) {
			shape.setAttribute(name, value);
		}
		svg.appendChild(shape);
	}
	el.replaceChildren(svg);
}

export class Notice {
	static messages: string[] = [];
	/**
	 * Every notice raised, in order, beside the messages.
	 *
	 * `messages` answers "what was the reader told", which is what almost every
	 * case wants. This answers "which notice", and exists for the one notice that
	 * is a control rather than a sentence: a test pressing the reset's **Undo**
	 * has to reach the element the link was built into, and the string says
	 * nothing about it. Reset by the same `beforeEach` that resets `messages`;
	 * a case that leaves it standing only leaks a detached div.
	 */
	static instances: Notice[] = [];
	/** Built on first read. See `messageEl`. */
	private element: HTMLElement | null = null;
	/**
	 * The element the notice's own content goes in.
	 *
	 * Modelled because one notice in this plugin is a *control* rather than a
	 * sentence: the reset trigger's undo builds a span and an `<a>` into it
	 * (`view/sheet-view.ts`'s `offerUndo`), and until this existed any test that
	 * reached that line threw on an undefined property — so the whole undo
	 * gesture was undrivable and a real defect in it shipped.
	 *
	 * **A getter, because a field initialiser made `new Notice(...)` require a
	 * DOM.** `document.createElement` in the initialiser threw
	 * `ReferenceError: document is not defined` in every node-environment file —
	 * `reset-flow.test.ts`, `worked-examples.test.ts`, `contract.test.ts` — and
	 * the message named neither the notice nor the environment. `PATTERNS.md`
	 * §2's recorded trap one step over: the question is not what a layer needs
	 * in order to be *imported* but what it needs in order to be
	 * *constructed*, and a notice that is only a string in a node test has to
	 * cost nothing. Reading this still wants a DOM, which is honest — a caller
	 * reading it is asking for an element.
	 *
	 * Detached, which is the one thing about it that is *not* the app: Obsidian
	 * appends the notice to a container on `document.body`. Detached is enough
	 * for everything a test can ask — the markup, the listeners, and pressing
	 * the link — and attaching it would put a live element on the body that no
	 * `hide` in a failing case ever takes down.
	 */
	get messageEl(): HTMLElement {
		this.element ??= document.createElement('div');
		return this.element;
	}
	/** Whether `hide()` has been called, which is what a press of the link does. */
	hidden = false;
	/**
	 * `timeout` is accepted and ignored, which is faithful for what a test can
	 * see: the app's own timer removes the element, and nothing here observes an
	 * element that was never attached.
	 */
	constructor(message: string | DocumentFragment, _timeout?: number) {
		Notice.messages.push(typeof message === 'string' ? message : '');
		Notice.instances.push(this);
	}
	hide(): void {
		this.hidden = true;
	}
}

/**
 * One line of a `Menu`, drawing the app's own markup: `div.menu-item` holding
 * `.menu-item-icon` and `.menu-item-title`, with `is-disabled` and `is-warning`
 * as the two states this plugin sets.
 *
 * **A disabled item's click does nothing**, which is the app's rule and the one
 * a test leans on: `setDisabled` is how the tree refuses a move from its menu,
 * and a double that still ran the callback would let a refused move write.
 */
export class MenuItem {
	readonly dom: HTMLElement;
	private readonly iconEl: HTMLElement;
	private readonly titleEl: HTMLElement;
	private callback: ((event: MouseEvent | KeyboardEvent) => unknown) | null = null;
	disabled = false;

	constructor(private readonly menu: Menu) {
		this.dom = document.createElement('div');
		this.dom.className = 'menu-item tappable';
		this.iconEl = this.dom.createDiv('menu-item-icon');
		this.titleEl = this.dom.createDiv('menu-item-title');
		this.dom.addEventListener('click', (event) => {
			if (this.disabled) return;
			this.menu.hide();
			void this.callback?.(event);
		});
	}

	setTitle(title: string | DocumentFragment): this {
		if (typeof title === 'string') this.titleEl.textContent = title;
		else this.titleEl.replaceChildren(title);
		return this;
	}

	setIcon(icon: string | null): this {
		if (icon === null) this.iconEl.replaceChildren();
		else setIcon(this.iconEl, icon);
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.disabled = disabled;
		this.dom.classList.toggle('is-disabled', disabled);
		return this;
	}

	setWarning(isWarning: boolean): this {
		this.dom.classList.toggle('is-warning', isWarning);
		return this;
	}

	onClick(callback: (event: MouseEvent | KeyboardEvent) => unknown): this {
		this.callback = callback;
		return this;
	}
}

/**
 * The app's context menu, as far as a plugin can see it: items and separators
 * added in order, shown at a point, hidden by a press on an item.
 *
 * **It draws the app's markup on `document.body`** — `div.menu` over
 * `div.menu-scroll`, holding `div.menu-item` and `div.menu-separator` — so a
 * harness shot of an open menu is painted by the calibrated stylesheet rather
 * than by a stand-in, and a test finds an item by its title. Placed at the point
 * it was shown at, with `position: fixed` coming from the app's own rule.
 *
 * **What is not modelled**: the keyboard (the app's menu takes the arrows,
 * Enter and Escape through a scope of its own), dismissal on a press outside,
 * submenus, sections, and clamping into the window. One open menu at a time is
 * modelled, because the app hides the previous menu when another is shown.
 */
export class Menu {
	/** The menu on screen, if any, which is what a test reads. */
	static open: Menu | null = null;
	readonly dom: HTMLElement;
	private readonly scroll: HTMLElement;
	readonly items: MenuItem[] = [];
	private hideCallbacks: (() => unknown)[] = [];

	constructor() {
		this.dom = document.createElement('div');
		this.dom.className = 'menu';
		this.scroll = this.dom.createDiv('menu-scroll');
	}

	addItem(cb: (item: MenuItem) => unknown): this {
		const item = new MenuItem(this);
		this.items.push(item);
		this.scroll.appendChild(item.dom);
		cb(item);
		return this;
	}

	addSeparator(): this {
		this.scroll.createDiv('menu-separator');
		return this;
	}

	showAtMouseEvent(event: MouseEvent): this {
		return this.showAtPosition({ x: event.clientX, y: event.clientY });
	}

	showAtPosition(position: { x: number; y: number }, doc: Document = document): this {
		if (Menu.open !== null && Menu.open !== this) Menu.open.hide();
		this.dom.setCssStyles({ left: `${position.x}px`, top: `${position.y}px` });
		doc.body.appendChild(this.dom);
		Menu.open = this;
		return this;
	}

	hide(): this {
		if (!this.dom.isConnected) return this;
		this.dom.remove();
		if (Menu.open === this) Menu.open = null;
		for (const callback of this.hideCallbacks) void callback();
		return this;
	}

	close(): void {
		this.hide();
	}

	onHide(callback: () => unknown): void {
		this.hideCallbacks.push(callback);
	}
}

/* ------------------------------------------------------------------------ *
 * Settings UI.
 *
 * Added so the layout editor and the settings tab can be rendered outside the
 * app, by a test and by the harness alike. The DOM shape matters and is not
 * incidental: styles.css targets `.setting-item`, `.setting-item-control`,
 * `.setting-item-name` and `.clickable-icon`, so a stub emitting a different
 * structure would render the editor in a way no user would ever see.
 *
 * Still a test double. Each method does the least that makes the code under
 * test behave as it does in the app, and no more.
 * ------------------------------------------------------------------------ */

type Callback<T> = (value: T) => unknown;

class ValueComponent<T, TEl extends HTMLElement> {
	changeCallback?: Callback<T>;
	disabled = false;
	constructor(public el: TEl) {}
	onChange(cb: Callback<T>): this {
		this.changeCallback = cb;
		return this;
	}
	setDisabled(disabled: boolean): this {
		this.disabled = disabled;
		(this.el as unknown as { disabled: boolean }).disabled = disabled;
		this.el.toggleAttribute('disabled', disabled);
		return this;
	}
	setTooltip(tooltip: string): this {
		this.el.setAttribute('aria-label', tooltip);
		return this;
	}
	then(cb: (self: this) => unknown): this {
		cb(this);
		return this;
	}
}

export class TextComponent extends ValueComponent<string, HTMLInputElement> {
	get inputEl(): HTMLInputElement {
		return this.el;
	}
	constructor(parent: HTMLElement) {
		const input = parent.ownerDocument.createElement('input');
		input.type = 'text';
		parent.appendChild(input);
		super(input);
		input.addEventListener('input', () => this.changeCallback?.(input.value));
	}
	getValue(): string {
		return this.el.value;
	}
	setValue(value: string): this {
		this.el.value = value;
		return this;
	}
	setPlaceholder(text: string): this {
		this.el.placeholder = text;
		return this;
	}
}

export class TextAreaComponent extends ValueComponent<
	string,
	HTMLTextAreaElement
> {
	get inputEl(): HTMLTextAreaElement {
		return this.el;
	}
	constructor(parent: HTMLElement) {
		const area = parent.ownerDocument.createElement('textarea');
		parent.appendChild(area);
		super(area);
		area.addEventListener('input', () => this.changeCallback?.(area.value));
	}
	getValue(): string {
		return this.el.value;
	}
	setValue(value: string): this {
		this.el.value = value;
		return this;
	}
	setPlaceholder(text: string): this {
		this.el.placeholder = text;
		return this;
	}
}

/**
 * Obsidian's toggle: a `.checkbox-container` div carrying the state as a class,
 * with an invisible checkbox inside it.
 *
 * **The structure is the whole of what this has to get right**, and it did not.
 * The input itself used to carry `.checkbox-container`, which is one element
 * where the app has two — and that is not a harmless simplification, because
 * both the plugin's CSS and the app's select on the difference. `editor.css`
 * widens a form's direct-child `input` to 14em, which in the app never matches a
 * toggle and in the stub matched every one of them, so every boolean in the pane
 * rendered as a 182px track with a bare checkbox adrift in it. An instrument
 * harsher than the thing costs a review as surely as a kinder one: no toggle in
 * the pane had ever been looked at, because what was drawn was not what ships.
 *
 * `toggleEl` is the container, as it is in the app — it is the element that takes
 * focus and the one a caller hangs a focus token on.
 */
export class ToggleComponent extends ValueComponent<boolean, HTMLElement> {
	private input: HTMLInputElement;

	get toggleEl(): HTMLElement {
		return this.el;
	}

	constructor(parent: HTMLElement) {
		const doc = parent.ownerDocument;
		const container = doc.createElement('div');
		container.classList.add('checkbox-container');
		const input = doc.createElement('input');
		input.type = 'checkbox';
		container.appendChild(input);
		parent.appendChild(container);
		super(container);
		this.input = input;
		input.addEventListener('change', () => {
			// The state lives on the container as a class, which is what the app's
			// own stylesheet paints the pill and the thumb from.
			container.classList.toggle('is-enabled', input.checked);
			this.changeCallback?.(input.checked);
		});
	}

	getValue(): boolean {
		return this.input.checked;
	}

	setValue(value: boolean): this {
		this.input.checked = value;
		this.el.classList.toggle('is-enabled', value);
		return this;
	}

	setDisabled(disabled: boolean): this {
		// Not the base class's: a div has no `disabled`, and the app marks a
		// toggle with a class it actually styles.
		this.input.disabled = disabled;
		this.el.classList.toggle('is-disabled', disabled);
		return this;
	}
}

export class DropdownComponent extends ValueComponent<
	string,
	HTMLSelectElement
> {
	get selectEl(): HTMLSelectElement {
		return this.el;
	}
	constructor(parent: HTMLElement) {
		const select = parent.ownerDocument.createElement('select');
		select.classList.add('dropdown');
		parent.appendChild(select);
		super(select);
		select.addEventListener('change', () =>
			this.changeCallback?.(select.value),
		);
	}
	addOption(value: string, display: string): this {
		const option = this.el.ownerDocument.createElement('option');
		option.value = value;
		option.textContent = display;
		this.el.appendChild(option);
		return this;
	}
	addOptions(options: Record<string, string>): this {
		for (const [value, display] of Object.entries(options)) {
			this.addOption(value, display);
		}
		return this;
	}
	getValue(): string {
		return this.el.value;
	}
	setValue(value: string): this {
		this.el.value = value;
		return this;
	}
}

export class ButtonComponent extends ValueComponent<void, HTMLButtonElement> {
	get buttonEl(): HTMLButtonElement {
		return this.el;
	}
	constructor(parent: HTMLElement) {
		const button = parent.ownerDocument.createElement('button');
		button.type = 'button';
		parent.appendChild(button);
		super(button);
	}
	setButtonText(text: string): this {
		this.el.textContent = text;
		return this;
	}
	setIcon(icon: string): this {
		setIcon(this.el, icon);
		return this;
	}
	setCta(): this {
		this.el.classList.add('mod-cta');
		return this;
	}
	setWarning(): this {
		this.el.classList.add('mod-warning');
		return this;
	}
	setClass(cls: string): this {
		this.el.classList.add(cls);
		return this;
	}
	onClick(cb: (event: Event) => unknown): this {
		this.el.addEventListener('click', (event) => cb(event as MouseEvent));
		return this;
	}
}

/** An icon-only button. Obsidian gives it `.clickable-icon`; styles.css relies on that. */
export class ExtraButtonComponent extends ButtonComponent {
	/** Obsidian's name for this control's element. Callers reach for it by name. */
	get extraSettingsEl(): HTMLButtonElement {
		return this.el;
	}
	constructor(parent: HTMLElement) {
		super(parent);
		this.el.classList.add('clickable-icon');
	}
}

export class Setting {
	settingEl: HTMLElement;
	infoEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;
	components: unknown[] = [];

	constructor(containerEl: HTMLElement) {
		const doc = containerEl.ownerDocument;
		this.settingEl = doc.createElement('div');
		this.settingEl.classList.add('setting-item');
		this.infoEl = doc.createElement('div');
		this.infoEl.classList.add('setting-item-info');
		this.nameEl = doc.createElement('div');
		this.nameEl.classList.add('setting-item-name');
		this.descEl = doc.createElement('div');
		this.descEl.classList.add('setting-item-description');
		this.controlEl = doc.createElement('div');
		this.controlEl.classList.add('setting-item-control');
		this.infoEl.append(this.nameEl, this.descEl);
		this.settingEl.append(this.infoEl, this.controlEl);
		containerEl.appendChild(this.settingEl);
	}

	setName(name: string | DocumentFragment): this {
		this.nameEl.replaceChildren();
		if (typeof name === 'string') this.nameEl.textContent = name;
		else this.nameEl.appendChild(name);
		return this;
	}

	setDesc(desc: string | DocumentFragment): this {
		this.descEl.replaceChildren();
		if (typeof desc === 'string') this.descEl.textContent = desc;
		else this.descEl.appendChild(desc);
		return this;
	}

	setHeading(): this {
		this.settingEl.classList.add('setting-item-heading');
		return this;
	}

	setClass(cls: string): this {
		this.settingEl.classList.add(cls);
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.settingEl.toggleClass('is-disabled', disabled);
		return this;
	}

	private add<T>(component: T, cb?: (component: T) => unknown): this {
		this.components.push(component);
		cb?.(component);
		return this;
	}

	addText(cb?: (c: TextComponent) => unknown): this {
		return this.add(new TextComponent(this.controlEl), cb);
	}
	addTextArea(cb?: (c: TextAreaComponent) => unknown): this {
		return this.add(new TextAreaComponent(this.controlEl), cb);
	}
	addToggle(cb?: (c: ToggleComponent) => unknown): this {
		return this.add(new ToggleComponent(this.controlEl), cb);
	}
	addDropdown(cb?: (c: DropdownComponent) => unknown): this {
		return this.add(new DropdownComponent(this.controlEl), cb);
	}
	addButton(cb?: (c: ButtonComponent) => unknown): this {
		return this.add(new ButtonComponent(this.controlEl), cb);
	}
	addExtraButton(cb?: (c: ExtraButtonComponent) => unknown): this {
		return this.add(new ExtraButtonComponent(this.controlEl), cb);
	}

	then(cb: (setting: this) => unknown): this {
		cb(this);
		return this;
	}
}

/* ------------------------------------------------------------------------ *
 * Vault, app and view.
 *
 * An in-memory vault, because the layout editor lists, reads, creates and
 * modifies layout files and none of that works against nothing. Paths are
 * plain strings and folders are derived from them, which is enough for the one
 * shape this plugin uses: a single configured folder holding layout files.
 * ------------------------------------------------------------------------ */

/** The folder segment of a path, or '' for a path at the root. */
function parentPath(path: string): string {
	const cut = path.lastIndexOf('/');
	return cut === -1 ? '' : path.slice(0, cut);
}

export class TAbstractFile {
	constructor(
		public path: string,
		public vault: Vault,
	) {}
	get name(): string {
		return this.path.split('/').pop() ?? this.path;
	}
	/**
	 * The folder holding this file, which for a top-level file is the root.
	 *
	 * **The root arm is the app's, and it is here so the double cannot
	 * contradict itself.** Obsidian's `getDirectParent` answers `fileMap['/']`
	 * where the path has no slash in it, and `Vault.getFolderByPath('/')` now
	 * answers the root with those files as its children — so a `null` here would
	 * mean the double told a caller that `Aramil.md` is a child of the root and
	 * told `Aramil.md` it has no parent. Two answers, both assertable, which is
	 * worse in a test double than the under-model it replaced.
	 */
	get parent(): TFolder | null {
		const parent = parentPath(this.path);
		return this.vault.getFolderByPath(parent === '' ? '/' : parent);
	}
}

export class TFile extends TAbstractFile {
	get basename(): string {
		const name = this.name;
		const dot = name.lastIndexOf('.');
		return dot === -1 ? name : name.slice(0, dot);
	}
	get extension(): string {
		const name = this.name;
		const dot = name.lastIndexOf('.');
		return dot === -1 ? '' : name.slice(dot + 1);
	}
}

export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
}

export class Vault {
	private files = new Map<string, { file: TFile; content: string }>();
	/**
	 * The vault's name, which the app takes from its folder. Settable, because
	 * the one reader (a copied component's fingerprint,
	 * `parse/component-clipboard.ts`) is about telling two vaults apart.
	 */
	name = 'Test vault';
	private folders = new Map<string, TFolder>();
	/**
	 * Who is listening for which file event.
	 *
	 * **Fired synchronously, from inside the write that caused it**, which is
	 * the one timing this double can promise honestly: the app fires `create`,
	 * `modify`, `delete` and `rename` once its own map has changed and before the
	 * awaited call returns to the writer, so a listener sees the vault as it is
	 * after the write — never before it. What is not modelled is everything the
	 * app fires on its own: an edit made in another program, a sync landing, or
	 * the `create` storm the app raises for every file while the vault first
	 * loads (which is why a plugin registers its `create` listener from
	 * `onLayoutReady`). A test drives those by calling `trigger` itself.
	 */
	private listeners = new Map<string, Set<(...args: unknown[]) => unknown>>();
	/**
	 * The vault root, whose path is `/`.
	 *
	 * `normalizePath` above is where that comes from — the app's own function
	 * answers `/` for the empty path — and `FileManager.getNewFileParent`
	 * returns this whenever **Default location for new notes** is not a named
	 * folder, which includes its default. A double whose root claimed `''`
	 * let a plugin join `'' + '/' + name` into a path the app never produces
	 * and call it green.
	 */
	private root = new TFolder('/', this);

	getName(): string {
		return this.name;
	}

	/**
	 * The root is in the folder map, because in the app it is a map entry.
	 *
	 * Obsidian 1.13.7 builds the vault with
	 * `n.root = new YD(n, ""), n.onChange('folder-created', '/'), n.root = n.fileMap['/']`
	 * — the root it hands out *is* `fileMap['/']` — and `getFolderByPath` is
	 * `fileMap.hasOwnProperty(e)` and nothing else. So `getFolderByPath('/')`
	 * answers the root there, and answered null here until this line existed.
	 *
	 * **A reader can type the value that reaches it.** `characters.ts` checks
	 * the configured character folder with `getFolderByPath` before creating
	 * it, and `normalizePath('/')` is `/`, so a field holding `/` asked this
	 * double whether the vault root exists, was told no, and would have asked
	 * for it to be created — where the app says yes and writes at the root.
	 */
	constructor() {
		this.folders.set('/', this.root);
	}

	/**
	 * The root, by the same route as every other folder.
	 *
	 * Through `getFolderByPath` rather than straight off the field, because that
	 * is where children are rebuilt: handed out raw, `getRoot().children` was
	 * `[]` until something happened to ask for `/` by path, which made the answer
	 * depend on call order. `FileManager.getNewFileParent` returns this, so the
	 * order-dependence sat on the one path a new note takes.
	 */
	getRoot(): TFolder {
		return this.getFolderByPath('/') ?? this.root;
	}

	/**
	 * The file at exactly this path, or null.
	 *
	 * **No normalisation, which is the app's behaviour and load bearing.**
	 * Obsidian's is `fileMap.hasOwnProperty(path)` and nothing else, so
	 * `getFileByPath('/x.md')` misses a vault holding `x.md` — while
	 * `create('/x.md')` normalises and writes `x.md`. A caller that builds
	 * paths one way and looks them up the other gets "free" from every check
	 * and "File already exists." from the write.
	 */
	getFileByPath(path: string): TFile | null {
		return this.files.get(path)?.file ?? null;
	}

	/**
	 * The file or folder at exactly this path, or null — `getFileByPath` and
	 * `getFolderByPath` in one lookup, which is what `FileView.setState` asks
	 * with a path it was handed and has not yet looked at.
	 */
	getAbstractFileByPath(path: string): TAbstractFile | null {
		return this.getFileByPath(path) ?? this.getFolderByPath(path);
	}

	/** Listen for a file event, the app's four: create, modify, delete, rename. */
	on(name: string, callback: (...args: unknown[]) => unknown): EventRef {
		const set = this.listeners.get(name) ?? new Set();
		set.add(callback);
		this.listeners.set(name, set);
		return { off: () => set.delete(callback) };
	}

	/**
	 * Fire a file event, which is also how a test says "another program wrote
	 * this" — the case the double cannot produce from any of its own writes.
	 */
	trigger(name: string, ...args: unknown[]): void {
		for (const callback of [...(this.listeners.get(name) ?? [])]) {
			callback(...args);
		}
	}

	getFolderByPath(path: string): TFolder | null {
		const folder = this.folders.get(path);
		if (!folder) return null;
		// Rebuilt on read rather than maintained: creation is rare here and a
		// stale children list is the one bug this stub could hide from a test.
		//
		// Compared as paths, never through `file.parent` — that getter asks the
		// vault for a folder, and a folder asking each file for its parent to
		// decide its own children recurses until the stack goes.
		// The root owns the paths `parentPath` calls parentless, which is the
		// app's own rule: `getDirectParent` answers `fileMap['/']` for a path
		// with no slash in it. Every other folder owns its own path.
		const owner = path === '/' ? '' : path;
		folder.children = [...this.files.values()]
			.filter(({ file }) => parentPath(file.path) === owner)
			.map(({ file }) => file);
		return folder;
	}

	/**
	 * Create a folder, and refuse a path that anything already holds.
	 *
	 * **Normalised and refused in the app's own order**, the same pair `create`
	 * below makes, and here for the same reason: a caller guards the path itself
	 * and says in its comment that nothing is clobbered even so. `layouts.ts`
	 * and `characters.ts` both check `getFolderByPath` before creating, and a
	 * double that created unconditionally would let a regression that dropped
	 * either check go green — and would make the one state `characters.ts`
	 * reports as an error unreachable, since a file sitting at the configured
	 * folder's path is exactly what the app refuses.
	 *
	 * Obsidian 1.13.7's `app.js`, deminified:
	 *
	 * ```js
	 * Vault.prototype.createFolder = async function (path) {
	 *   const at = normalizePath(path);
	 *   this.checkPath(at);
	 *   if (await this.adapter.exists(at)) throw new Error('Folder already exists.');
	 *   await this.adapter.mkdir(at);
	 *   const f = this.getAbstractFileByPath(at);
	 *   return f instanceof TFolder ? f : null;
	 * }
	 * ```
	 *
	 * `adapter.exists` is a filesystem check rather than a folder lookup, so a
	 * **file** at that path refuses too — and the message is the same one either
	 * way, which is the app's wording rather than a tidier one this double might
	 * have invented. Files and folders are two maps here where the app has one
	 * `fileMap`, so both are asked.
	 *
	 * **And `mkdir` is recursive, so a missing ancestor is created with it.**
	 * The desktop adapter, from the same bundle:
	 *
	 * ```js
	 * FileSystemAdapter.prototype.mkdir = function (path) {
	 *   return this.queue(async () => {
	 *     await this.fsPromises.mkdir(this.getFullPath(path), { recursive: true });
	 *     await this.reconcileInternalFile(path);
	 *   });
	 * }
	 * ```
	 *
	 * `createFolder('Characters/New')` therefore leaves a vault holding both
	 * `Characters` and `Characters/New`, which is what a plugin sees next when
	 * it asks `getFolderByPath` about either — and `characters.ts` asks about
	 * the deeper one on the second character it writes. A double that set one
	 * map entry made that test pass for the wrong reason.
	 *
	 * What is deliberately **not** modelled is an ancestor path a *file* holds:
	 * the real `mkdir -p` fails there with `ENOTDIR`, and this writes the deeper
	 * folder instead. **The state is reachable and not foreign** — both folder
	 * preferences are free text, so `Characters/New` typed over a vault whose
	 * `Characters` is an extension-less *file* is exactly it, and the character
	 * suite's own fixture creates a file at that very path for the
	 * folder-refused case. What is true is narrower than "nothing writes a
	 * folder under a note": nothing *asserts* on this state, and the ancestor is
	 * left alone rather than shadowed, so the double never reports a folder
	 * where it holds a file. A test that needs the app's answer here has to
	 * model `ENOTDIR` first.
	 */
	async createFolder(path: string): Promise<TFolder> {
		const at = normalizePath(path);
		if (this.folders.has(at) || this.files.has(at)) {
			throw new Error('Folder already exists.');
		}
		for (
			let parent = parentPath(at);
			parent !== '';
			parent = parentPath(parent)
		) {
			if (!this.folders.has(parent) && !this.files.has(parent)) {
				this.folders.set(parent, new TFolder(parent, this));
			}
		}
		const folder = new TFolder(at, this);
		this.folders.set(at, folder);
		this.trigger('create', folder);
		return folder;
	}

	/**
	 * Write a new file, and refuse a path that is taken.
	 *
	 * The refusal is the app's — `Vault.create` rejects rather than
	 * overwriting — and it is here because two callers *rely* on it as their
	 * last line of defence and neither could show it while this method wrote
	 * unconditionally: `layouts.ts` refuses a duplicate layout name before
	 * creating, and `characters.ts` dedupes `Untitled character` before
	 * creating. Both say in their comments that nothing is overwritten even so.
	 * With a permissive double, a regression dropping either guard would
	 * silently overwrite a reader's file here and go green, where the app would
	 * have rejected — and the file it would overwrite is a character note,
	 * which is Constraint 4.
	 */
	async create(path: string, content: string): Promise<TFile> {
		// Normalised first and refused second, in the app's own order:
		// `create` is `normalizePath` then `adapter.exists` then the write, so
		// the path that is checked and the path that is written are the same
		// one, and neither is the string the caller passed.
		const at = normalizePath(path);
		if (this.files.has(at)) {
			throw new Error('File already exists.');
		}
		const file = new TFile(at, this);
		this.files.set(at, { file, content });
		this.trigger('create', file);
		return file;
	}

	async read(file: TFile): Promise<string> {
		return this.files.get(file.path)?.content ?? '';
	}

	/**
	 * The app's cached read, which differs from `read` only in where the text
	 * comes from: a cache the app invalidates on every write. This double keeps
	 * no cache to go stale, so the two answer the same text — which is the
	 * app's answer too, for a file nothing is writing at that moment.
	 */
	async cachedRead(file: TFile): Promise<string> {
		return this.read(file);
	}

	async modify(file: TFile, content: string): Promise<void> {
		this.files.set(file.path, { file, content });
		this.trigger('modify', file);
	}

	/**
	 * Move a file, keeping the **same `TFile` object** with its `path` changed,
	 * and refuse a destination that is taken.
	 *
	 * Both are the app's and both are load bearing. A `FileView` holds the object
	 * rather than the path, which is how a view follows a rename made anywhere —
	 * a double that minted a new `TFile` would leave every open view on an
	 * orphan. The refusal is `FileSystemAdapter.rename`'s own, verbatim from
	 * 1.13.7: `throw new Error("Destination file already exists!")`, checked
	 * before anything moves.
	 *
	 * Normalised the way `create` is, and the event carries the old path as its
	 * second argument, as the app's `rename` event does.
	 */
	async rename(file: TAbstractFile, newPath: string): Promise<void> {
		const at = normalizePath(newPath);
		const from = file.path;
		if (at === from) return;
		if (this.files.has(at) || this.folders.has(at)) {
			throw new Error('Destination file already exists!');
		}
		const entry = this.files.get(from);
		if (entry === undefined) {
			// A folder, or a file this vault no longer holds. Folder moves are
			// not modelled: nothing in this plugin renames one.
			throw new Error(`obsidian-stub: no file at "${from}" to rename`);
		}
		this.files.delete(from);
		entry.file.path = at;
		this.files.set(at, entry);
		this.trigger('rename', entry.file, from);
	}

	/**
	 * Read, transform and write under one lock, which is what the app offers for
	 * modifying a file in the background.
	 *
	 * The atomicity is the app's and cannot be stubbed, so what this has to be
	 * faithful about is the two things a caller can observe: the callback is
	 * handed the file's current contents, and a callback that throws writes
	 * nothing. `layouts.ts` refuses a duplicate name by throwing, and a stub that
	 * wrote anyway would pass a test the app fails.
	 */
	async process(file: TFile, fn: (data: string) => string): Promise<string> {
		const content = fn(await this.read(file));
		await this.modify(file, content);
		return content;
	}

	async delete(file: TAbstractFile): Promise<void> {
		const held = this.files.delete(file.path);
		if (held) this.trigger('delete', file);
	}

	/**
	 * Every file the vault holds, in no particular order — the app's own
	 * contract, since it walks an internal map rather than a sorted list.
	 *
	 * Added for `view/file-suggest.ts`: a type-ahead over vault files has
	 * nothing to offer without this, and a suggester nothing can list from is a
	 * suggester nothing can test.
	 */
	getFiles(): TFile[] {
		return [...this.files.values()].map(({ file }) => file);
	}

	/**
	 * Every markdown file, for a caller that wants character notes rather than
	 * a vault's worth of everything — `component-rename-migration.ts`'s own
	 * candidate scan, the first consumer of `getFiles` narrower than "all".
	 */
	getMarkdownFiles(): TFile[] {
		return this.getFiles().filter((file) => file.extension === 'md');
	}

	/** A file's own text, read synchronously — `MetadataCache`'s own need. */
	rawContent(path: string): string | null {
		return this.files.get(path)?.content ?? null;
	}
}

export class FileManager {
	/**
	 * Where the app would put a new note, and every source path it was asked
	 * about.
	 *
	 * A recorder rather than an option: the real `getNewFileParent` answers
	 * **Settings → Files and links → Default location for new notes**, which is a
	 * preference nothing here models, so what a caller can be held to is the two
	 * observable halves — the folder it wrote into, and the source path it passed
	 * so "Same folder as current file" can mean what it says. Set
	 * `newFileParent` to move the answer; the default is the vault root, whose
	 * path in Obsidian is `/`.
	 */
	newFileParent: TFolder;
	/** Source paths asked about, in order. */
	newFileParentSources: string[] = [];

	constructor(private readonly vault: Vault) {
		// The vault's own root, whose path is `/`. The app falls back to
		// `vault.getRoot()` for every **Default location for new notes** that is
		// not a named folder, which includes the default.
		this.newFileParent = vault.getRoot();
	}

	getNewFileParent(sourcePath: string, _newFilePath?: string): TFolder {
		this.newFileParentSources.push(sourcePath);
		return this.newFileParent;
	}

	async trashFile(file: TAbstractFile): Promise<void> {
		await file.vault.delete(file);
	}

	/**
	 * Rename a file and carry every wikilink to it along, which is the whole of
	 * what separates this from `Vault.rename`.
	 *
	 * The app's is `runAsyncLinkUpdate(() => vault.rename(file, newPath))`: the
	 * rename, then a pass over every reference the metadata cache resolved to
	 * the file, each rewritten to the new path. **What this models is the one
	 * shape a caller here can observe**: a `[[target]]` or `[[target|alias]]` or
	 * `[[target#heading]]` in a markdown body, embeds included, whose target is
	 * the file's old *name* or old *path* — with the extension for a file that
	 * is not a note, without it for one that is, which is how a reader writes
	 * each — rewritten in the same form to the new name or path.
	 *
	 * **What is not modelled, named rather than assumed** (`docs/PATTERNS.md`
	 * §2): markdown-style `[text](path)` links, links in frontmatter, relative
	 * paths, a short link the rename makes ambiguous, the app's **New link
	 * format** preference, and **Automatically update internal links** being off
	 * — the app skips the whole rewrite then, and this always runs it. The
	 * resolution is by text rather than through the cache, so a link the app
	 * would have resolved to a *different* file of the same name is rewritten
	 * here too; no case in this repository holds two such files.
	 */
	async renameFile(file: TAbstractFile, newPath: string): Promise<void> {
		const oldPath = file.path;
		await this.vault.rename(file, newPath);
		if (!(file instanceof TFile)) return;
		const note = file.extension.toLowerCase() === 'md';
		const spell = (path: string): string[] => {
			const bare = note ? path.replace(/\.md$/i, '') : path;
			const name = bare.split('/').pop() ?? bare;
			return name === bare ? [bare] : [bare, name];
		};
		const [oldFull, oldShort] = spell(oldPath);
		const [newFull, newShort] = spell(file.path);
		const rewrites = new Map<string, string>([[oldFull ?? '', newFull ?? '']]);
		if (oldShort !== undefined) rewrites.set(oldShort, newShort ?? newFull ?? '');
		for (const candidate of this.vault.getMarkdownFiles()) {
			if (candidate === file) continue;
			const text = await this.vault.read(candidate);
			const next = text.replace(
				/\[\[([^\]|#]+)([^\]]*)\]\]/g,
				(whole, target: string, rest: string) => {
					const to = rewrites.get(target);
					return to === undefined ? whole : `[[${to}${rest}]]`;
				},
			);
			if (next !== text) await this.vault.modify(candidate, next);
		}
	}

	/**
	 * The reference the app's own paste and drag-and-drop write for `file`,
	 * enough of it for `view/file-suggest.ts`'s one use: turning a picked file
	 * into the embed a reader would have typed by hand.
	 *
	 * **What is modelled**: a markdown file links and every other extension
	 * embeds — checked by extension *count* rather than an image allowlist, on
	 * purpose: `image.test.ts`'s repository-wide guard refuses a second format
	 * this close to the first, since a plugin holding its own idea of which
	 * formats count is how webp stopped rendering inside one while working one
	 * line outside it, and a single `'md'` check names no such list. A note's
	 * own extension is dropped from the target the way every wikilink already
	 * omits it, and the shortest path is used only where no other file in the
	 * vault would answer to the same one — the two-file case a reader actually
	 * hits, checked against every file rather than assumed unique.
	 *
	 * **What is not**: `subpath` and `alias`, and the app's own **Use
	 * \[\[Wikilinks\]]** / **New link format** settings — nothing here reaches
	 * for a relative-path format, so `sourcePath` is accepted and threaded
	 * through the call the caller makes (`view/file-suggest.ts` passes the
	 * character note's own path, not the vault root) but goes unused by this
	 * double's own arithmetic, which only ever answers in shortest-path-or-full
	 * form. Every consumer here wants a reference to whatever was picked and
	 * nothing else.
	 */
	generateMarkdownLink(file: TFile, _sourcePath: string): string {
		const markdown = file.extension.toLowerCase() === 'md';
		const named = markdown ? file.basename : file.name;
		const collides = this.vault
			.getFiles()
			.some(
				(candidate) =>
					candidate !== file &&
					(candidate.extension.toLowerCase() === 'md'
						? candidate.basename
						: candidate.name) === named,
			);
		const target = collides ? file.path.replace(/\.md$/, '') : named;
		return `${markdown ? '' : '!'}[[${target}]]`;
	}
}

/* ------------------------------------------------------------------------ *
 * Component lifecycle, leaves and views.
 *
 * Added so a workspace view can be rendered outside the app. The layout editor
 * lives in one, and a pane nothing can construct is a pane nothing can test or
 * photograph. Three things here are load bearing and the rest is the least that
 * makes them work.
 *
 * **The lifecycle is real, not a no-op.** "Registers on load, drops on unload"
 * is a claim a view makes, and a `register` that discards its callback turns
 * that claim into an assertion nothing can fail.
 *
 * **The element nesting is contract**, exactly as the settings builders above
 * are. Obsidian wraps a view in `.workspace-leaf-content` holding a
 * `.view-header` and a `.view-content`; `harness/calibrate.mjs` lifts the real
 * rules for those three out of the app, and the harness reviews the pane inside
 * them. A stub nesting them differently would review a frame no user has.
 *
 * **A leaf is asked for, never conjured.** `Workspace.getLeaf` is what hands one
 * out, so `getLeavesOfType` has something to look through and the refresh hop a
 * view makes into other views is drivable rather than stubbed to nothing.
 *
 * **A view bound to a file is here too**: `FileView`, transcribed from the app
 * below, with the vault's file events it listens to. A leaf still constructs
 * no view of its own — `setViewState` of a *different* type is recorded, not
 * acted on — because that needs the plugin's registered creators, and a test
 * opens a view through `src/test/workspace.ts` instead.
 * ------------------------------------------------------------------------ */

/** What `Workspace.on` hands back, and what `registerEvent` detaches. */
export interface EventRef {
	off(): void;
}

/**
 * Obsidian's `Component`: a load/unload lifecycle with children and registered
 * teardowns.
 */
export class Component {
	private children: Component[] = [];
	private cleanups: (() => void)[] = [];
	/** Whether `load` has run, which is what decides when a late child loads. */
	loaded = false;

	load(): void {
		if (this.loaded) return;
		this.loaded = true;
		this.onload();
		for (const child of this.children) child.load();
	}

	onload(): void {}

	unload(): void {
		if (!this.loaded) return;
		this.loaded = false;
		for (const child of [...this.children]) child.unload();
		// Last registered, first undone — the app's order, and the only one that
		// cannot run a teardown before something it depends on.
		for (const cleanup of [...this.cleanups].reverse()) cleanup();
		this.cleanups = [];
		this.onunload();
	}

	onunload(): void {}

	addChild<T extends Component>(child: T): T {
		this.children.push(child);
		if (this.loaded) child.load();
		return child;
	}

	removeChild<T extends Component>(child: T): T {
		this.children = this.children.filter((candidate) => candidate !== child);
		child.unload();
		return child;
	}

	register(cb: () => void): void {
		this.cleanups.push(cb);
	}

	registerEvent(ref: EventRef): void {
		this.register(() => ref.off());
	}

	registerDomEvent(
		el: HTMLElement | Document | Window,
		type: string,
		callback: EventListener,
	): void {
		el.addEventListener(type, callback);
		this.register(() => el.removeEventListener(type, callback));
	}

	registerInterval(id: number): number {
		this.register(() => window.clearInterval(id));
		return id;
	}
}

/**
 * The app's markdown renderer, as far as a test can be told about it.
 *
 * **Deliberately not a markdown implementation.** A second one in this
 * repository would drift from Obsidian's, and this stub's whole job is to be the
 * least that makes the code under test behave as it does in the app. What the
 * code under test cares about is the *shape*: that the call is asynchronous, that
 * it appends into the element it was given, and that it is bounded by a
 * `Component` — which is what `view/markdown-pass.ts` exists to get right, and
 * what nothing else could drive.
 *
 * So the markup is one `<p>` holding the source. That is enough for a test to
 * say whether anything landed and whose pass it landed in, and honest about
 * being a stand-in. The harness passes no renderer at all, for the same reason
 * this one is not real: a component's fallback is what a reviewer should be
 * looking at where there is no app.
 */
export class MarkdownRenderer {
	/**
	 * Make the next render reject, which is a state the real app is genuinely in
	 * whenever a theme's or another plugin's post-processor throws.
	 *
	 * A flag rather than a sentinel inside the markdown, because the caller under
	 * test passes the markdown through untouched and a magic string in it would be
	 * a second thing to keep in step. Set it, drive the call, and it clears itself
	 * — so a test that forgets to reset it cannot poison the next one.
	 */
	static failNextRender = false;

	static async render(
		_app: App,
		markdown: string,
		el: HTMLElement,
		_sourcePath: string,
		_component: Component,
	): Promise<void> {
		// A microtask, so a test can drive "the pass ended before this landed" by
		// awaiting nothing in between.
		await Promise.resolve();
		if (MarkdownRenderer.failNextRender) {
			MarkdownRenderer.failNextRender = false;
			throw new Error('a post-processor threw');
		}
		/*
		 * **It appends whether or not the component is still loaded**, and that is
		 * a decision rather than a shortcut. Unloading a `Component` stops the app
		 * creating more render children under it; whether it also abandons a call
		 * already in flight is not documented and not something this repository can
		 * verify, so the stub takes the case a caller has to survive. Assuming the
		 * kinder behaviour here would have made `markdown-pass.ts`'s whole reason
		 * for existing pass vacuously — measured, not supposed: with a `loaded`
		 * check in this method, deleting that module's staleness guard altogether
		 * left every case green.
		 */
		const p = el.ownerDocument.createElement('p');
		p.textContent = markdown;
		el.appendChild(p);
	}
}

/**
 * A workspace view, and the DOM Obsidian wraps one in.
 *
 * `onOpen` and `onClose` are public here where the app declares them
 * protected: a leaf is what calls them, and in the app the leaf is inside the
 * boundary. Widening is the only way a stub outside it can play the same part.
 */
export class View extends Component {
	app: App;
	containerEl: HTMLElement;
	contentEl: HTMLElement;
	/** Obsidian's own flag: false for a view that is not navigated to a file. */
	navigation = false;
	/** The header's title, which `WorkspaceLeaf.open` fills from the view. */
	readonly titleEl: HTMLElement;

	constructor(public leaf: WorkspaceLeaf) {
		super();
		this.app = leaf.app;
		const doc = leaf.containerEl.ownerDocument;
		this.containerEl = doc.createElement('div');
		this.containerEl.classList.add('workspace-leaf-content');
		const header = doc.createElement('div');
		header.classList.add('view-header');
		const titleContainer = doc.createElement('div');
		titleContainer.classList.add('view-header-title-container');
		this.titleEl = doc.createElement('div');
		this.titleEl.classList.add('view-header-title');
		titleContainer.appendChild(this.titleEl);
		header.appendChild(titleContainer);
		this.contentEl = doc.createElement('div');
		this.contentEl.classList.add('view-content');
		this.containerEl.append(header, this.contentEl);
	}

	getViewType(): string {
		return '';
	}

	getDisplayText(): string {
		return '';
	}

	getIcon(): string {
		return 'document';
	}

	async onOpen(): Promise<void> {}

	async onClose(): Promise<void> {}

	getState(): Record<string, unknown> {
		return {};
	}

	async setState(_state: unknown, _result: unknown): Promise<void> {}

	getEphemeralState(): Record<string, unknown> {
		return {};
	}

	setEphemeralState(_state: unknown): void {}
}

export class ItemView extends View {}

/**
 * A view bound to one file, and the half of the app's own lifecycle that a
 * subclass can observe.
 *
 * **Transcribed from Obsidian 1.13.7's `app.js`, not designed.** The members,
 * deminified:
 *
 * ```js
 * onload()   { super.onload(); this.registerEvent(vault.on('rename', this.onRename));
 *                              this.registerEvent(vault.on('delete', this.onDelete)) }
 * getState() { const s = super.getState(); if (this.file) s.file = this.file.path; return s }
 * setState(state, result) {
 *   if ('file' in state) { const f = vault.getAbstractFileByPath(state.file);
 *                          await this.loadFile(f instanceof TFile ? f : null) }
 *   if (!this.file && !this.allowNoFile) result.close = true; ... }
 * onClose()  { this.contentEl.empty(); await this.loadFile(null) }
 * loadFile(f) { if (this.file === f) return false;
 *               if (this.file) await this.onUnloadFile(this.file);
 *               this.file = null; if (f) { this.file = f; await this.onLoadFile(f) }
 *               this.titleEl.setText(this.getDisplayText()); ... }
 * onRename(f) { if (f === this.file) this.titleEl.setText(f.basename) ... }
 * onDelete(f) { if (f !== this.file) return;
 *               if (this.allowNoFile) await this.loadFile(null) else <history back, or close> }
 * canAcceptExtension() { return false }
 * ```
 *
 * `loadFile` and `onDelete` are the app's own internals and absent from
 * `obsidian.d.ts`, so a plugin cannot call or override either; they are here
 * because every public member above routes through them. **What is not
 * modelled**: the breadcrumbs, `syncState` across a linked group, a failed
 * `onLoadFile` becoming a notice, and `onDelete`'s arm for a view that allows no
 * file, which walks the leaf's history back — there is no history here, so this
 * detaches the leaf instead, and nothing in this repository deletes a file under
 * such a view.
 */
export class FileView extends ItemView {
	allowNoFile = false;
	file: TFile | null = null;
	navigation = true;

	onload(): void {
		super.onload();
		const vault = this.app.vault;
		this.registerEvent(
			vault.on('rename', (file) => {
				if (file instanceof TFile) void this.onRename(file);
			}),
		);
		this.registerEvent(
			vault.on('delete', (file) => void this.onDelete(file as TAbstractFile)),
		);
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'No file';
	}

	getState(): Record<string, unknown> {
		const state = super.getState();
		if (this.file) state.file = this.file.path;
		return state;
	}

	async setState(state: unknown, result: unknown): Promise<void> {
		const given = (state ?? {}) as Record<string, unknown>;
		if (Object.prototype.hasOwnProperty.call(given, 'file')) {
			const found =
				typeof given.file === 'string'
					? this.app.vault.getAbstractFileByPath(given.file)
					: null;
			await this.loadFile(found instanceof TFile ? found : null);
		}
		if (!this.file && !this.allowNoFile && result && typeof result === 'object') {
			(result as { close?: boolean }).close = true;
		}
		await super.setState(state, result);
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
		await this.loadFile(null);
	}

	/** The app's own, and not a plugin's to call: see the class comment. */
	async loadFile(file: TFile | null): Promise<boolean> {
		const current = this.file;
		if (current === file) return false;
		if (current) await this.onUnloadFile(current);
		this.file = null;
		if (file) {
			this.file = file;
			await this.onLoadFile(file);
		}
		this.titleEl.textContent = this.getDisplayText();
		return true;
	}

	async onLoadFile(_file: TFile): Promise<void> {}

	async onUnloadFile(_file: TFile): Promise<void> {}

	async onRename(file: TFile): Promise<void> {
		if (file === this.file) this.titleEl.textContent = file.basename;
	}

	/** The app's own, and not a plugin's to override: see the class comment. */
	async onDelete(file: TAbstractFile): Promise<void> {
		if (file !== this.file) return;
		if (this.allowNoFile) await this.loadFile(null);
		else await this.leaf.detach();
	}

	canAcceptExtension(_extension: string): boolean {
		return false;
	}
}

/**
 * Only ever extended, never constructed by anything the harness renders.
 *
 * **The save half is modelled, not stubbed away**, because the two facts a
 * `TextFileView` subclass depends on are both timing facts and both invisible
 * from inside the subclass. `requestSave` is Obsidian's own *debounced* save —
 * its typing says "Debounced save in 2 seconds from now" — so the text a view
 * commits is not on disk when the commit returns; and the view's `data` is the
 * only thing `save` ever writes, so a file rewritten underneath an open view is
 * overwritten by it. A stub whose `requestSave` wrote through synchronously
 * would make both of those unobservable, which is how `docs/PATTERNS.md` §11's
 * "a rendered `SheetView` needs a vault fixture" stayed a gap: the view opens
 * fine, it is the save that had nowhere to land.
 *
 * `savesRequested` and `runRequestedSave` are the debounce made explicit, the
 * same bargain `LayoutEditorView.flush` already offers the editor's own: a test
 * decides whether the two seconds have elapsed, rather than a timer deciding
 * for it. **Named so they cannot be mistaken for Obsidian's own members**, and
 * so a subclass adding a flush of its own — `SheetView.flushSave` does — is
 * overriding nothing here.
 */
export class TextFileView extends FileView {
	data = '';
	/**
	 * How many debounced saves are outstanding — Obsidian's 2-second window,
	 * counted rather than flagged so a test can say the view asked twice.
	 */
	savesRequested = 0;

	/**
	 * A property rather than a method, as in `obsidian.d.ts`, so a subclass
	 * calling `this.requestSave()` reaches this and not an override.
	 */
	requestSave = (): void => {
		this.savesRequested += 1;
	};

	/** Fire the debounce: run a requested save, if one is outstanding. */
	async runRequestedSave(): Promise<void> {
		if (this.savesRequested === 0) return;
		this.savesRequested = 0;
		await this.save();
	}

	/**
	 * Write what the view holds, and **leave the counter alone.**
	 *
	 * Discharging the request here was a fiction with consequences: Obsidian
	 * types `requestSave` as a bare `() => void` with no cancel and no
	 * `isPending`, so calling `save()` directly does **not** call off the
	 * debounced write already scheduled — it still fires about two seconds
	 * later, from whatever the view holds then. A double that cleared the
	 * counter on any save made that interleaving inexpressible, which is the
	 * one sequence a consumer most needs to be able to write: a save landing
	 * *between* two other vault writes. Only `runRequestedSave` and
	 * `onUnloadFile` discharge it, because those are the two moments the app
	 * genuinely has nothing left outstanding.
	 */
	async save(_clear?: boolean): Promise<void> {
		if (!this.file) return;
		await this.app.vault.modify(this.file, this.getViewData());
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.file = file;
		this.setViewData(await this.app.vault.read(file), true);
	}

	/**
	 * The app's own order on the way out: the view saves, and only then is it
	 * cleared — which is the whole reason a stale `data` matters.
	 *
	 * **Unconditional, because the app's is.** `obsidian.d.ts` says "by default,
	 * this view only saves when it's closing", so the close write is the base
	 * behaviour and `requestSave` is the *addition* a view makes on top of it.
	 * Conditioning this on an outstanding request instead made the double
	 * quietly permissive in the one direction that mattered: anything that had
	 * already called `save()` discharged the counter, so closing wrote nothing,
	 * and a view holding text staler than the file could be closed in a test
	 * with no consequence. That is precisely the write-back this plugin's own
	 * reload exists to prevent, so the double was hiding the bug its consumer
	 * was written to catch.
	 */
	async onUnloadFile(_file: TFile): Promise<void> {
		this.savesRequested = 0;
		await this.save();
		this.clear();
		this.file = null;
	}

	getViewData(): string {
		return this.data;
	}

	setViewData(data: string, _clear: boolean): void {
		this.data = data;
	}

	clear(): void {
		this.data = '';
	}
}

export class MarkdownView extends TextFileView {}

export class WorkspaceLeaf {
	/** The view showing here, or null until one is opened. */
	view: View | null = null;
	/** The element the app gives a leaf; a view's own container goes inside it. */
	containerEl: HTMLElement;

	constructor(public app: App) {
		this.containerEl = document.createElement('div');
		this.containerEl.classList.add('workspace-leaf');
	}

	/**
	 * Show a view here, in the app's own order: attach, load, then `onOpen`.
	 *
	 * The order is the point rather than an accident. A pane's first render is
	 * inside `onOpen`, and anything that measures itself there measures an
	 * element that is already in a document — so a stub that opened before
	 * attaching would give a pane geometry the app never gives it.
	 */
	async open<T extends View>(view: T): Promise<T> {
		this.view = view;
		this.containerEl.replaceChildren(view.containerEl);
		view.titleEl.textContent = view.getDisplayText();
		view.load();
		await view.onOpen();
		return view;
	}

	/**
	 * What the app was asked to show here, recorded — and acted on only where
	 * the view already here is of the type asked for.
	 *
	 * The real call swaps the view in this leaf where the type differs, which
	 * means constructing a view of an arbitrary registered type — the plugin's
	 * own sheet view among them — and nothing here constructs one. What a caller
	 * can be held to there is the request: the view type, and the file it named.
	 * So every call pushes, and `viewStates` is what a test reads, which is the
	 * same bargain `FileManager.getNewFileParent` above makes.
	 *
	 * **The same type keeps its view and hands it the state**, and that half is
	 * modelled because a plugin relies on it: 1.13.7's `setViewState` reads
	 * `o = e.type !== i` and creates a view only `if (o || r)`, then
	 * `await n.setState(c, s)` on whichever view it has — so a pane opening
	 * another file in its own leaf keeps its own instance, and a `FileView`
	 * loads the file through `setState`. A double that only recorded would make
	 * "the pane opens the chosen layout in the same leaf" unassertable.
	 */
	viewStates: { type: string; state?: Record<string, unknown> }[] = [];

	async setViewState(
		viewState: { type: string; state?: Record<string, unknown> },
		_eState?: unknown,
	): Promise<void> {
		this.viewStates.push(viewState);
		const view = this.view;
		if (view === null || view.getViewType() !== viewState.type) return;
		await view.setState(viewState.state ?? {}, {
			history: false,
			layout: false,
			close: false,
		});
	}

	/** Close whatever is showing, unloading it as the app does. */
	async detach(): Promise<void> {
		const view = this.view;
		this.view = null;
		this.containerEl.replaceChildren();
		if (!view) return;
		await view.onClose();
		view.unload();
	}
}

export class Workspace {
	/** Every leaf handed out, in the order they were asked for. */
	leaves: WorkspaceLeaf[] = [];
	/** The leaf `revealLeaf` last brought forward, which is "active" here. */
	activeLeaf: WorkspaceLeaf | null = null;
	private listeners = new Map<string, Set<(...args: unknown[]) => unknown>>();

	constructor(public app: App) {}

	/**
	 * A leaf to open a view in.
	 *
	 * Always a new one, whatever the argument. The app reuses the active leaf for
	 * `getLeaf(false)`, and reproducing that would mean modelling which leaf is
	 * active and what is already in it — state nothing here reads. A caller that
	 * wants the leaf a view is already in asks `getLeavesOfType` for it, which is
	 * what the plugin's own command does.
	 */
	getLeaf(_newLeaf?: boolean | string): WorkspaceLeaf {
		const leaf = new WorkspaceLeaf(this.app);
		this.leaves.push(leaf);
		return leaf;
	}

	/**
	 * The file the reader is looking at, or null.
	 *
	 * Settable, because the app answers it from whichever leaf is active and
	 * nothing here models that (`getLeaf` above says why). One caller needs it:
	 * creating a character passes the active file's path to
	 * `getNewFileParent`, so "Same folder as current file" has a current file.
	 */
	activeFile: TFile | null = null;

	getActiveFile(): TFile | null {
		return this.activeFile;
	}

	getLeavesOfType(type: string): WorkspaceLeaf[] {
		return this.leaves.filter((leaf) => leaf.view?.getViewType() === type);
	}

	/**
	 * The active leaf's view where it is of this class, the app's own one-liner:
	 * `var t = this.activeLeaf; if (!t) return null; var n = t.view; return n
	 * instanceof e ? n : null`. "Active" is `revealLeaf`'s here (above).
	 */
	getActiveViewOfType<T>(type: abstract new (...args: never[]) => T): T | null {
		const view = this.activeLeaf?.view;
		return view instanceof type ? view : null;
	}

	/**
	 * Run `callback` once the workspace is ready — at once, since this double
	 * has no saved layout to restore and so is always ready. The app's own:
	 * `null === this.onLayoutReadyCallbacks ? e() : <queue it>`, and the queue
	 * is `null` from the moment the layout is ready.
	 */
	onLayoutReady(callback: () => unknown): void {
		void callback();
	}

	async revealLeaf(leaf: WorkspaceLeaf): Promise<void> {
		this.activeLeaf = leaf;
	}

	/**
	 * How many times a view asked for the workspace to be saved, which is what a
	 * test reads. The app's own is a `Debouncer` that writes `workspace.json` a
	 * moment later; nothing here has a workspace file, so what is honoured is the
	 * request, and `cancel`/`run` are there because the type offers them.
	 */
	layoutSavesRequested = 0;

	requestSaveLayout = Object.assign(
		() => {
			this.layoutSavesRequested += 1;
			return this.requestSaveLayout;
		},
		{
			cancel: () => this.requestSaveLayout,
			run: () => undefined,
		},
	);

	on(name: string, callback: (...args: unknown[]) => unknown): EventRef {
		const set = this.listeners.get(name) ?? new Set();
		set.add(callback);
		this.listeners.set(name, set);
		return { off: () => set.delete(callback) };
	}

	/** Fire an event, so a test can drive what the app would have fired. */
	trigger(name: string, ...args: unknown[]): void {
		for (const callback of this.listeners.get(name) ?? []) callback(...args);
	}
}

/** The frontmatter block's own delimiter lines, and one `key: value` line inside it. */
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const FRONTMATTER_LINE = /^([^:]+):[ \t]*(.*)$/;

/**
 * Enough of `MetadataCache` for `getFileCache(file)?.frontmatter` — the read
 * every caller in `src/` already uses to answer "is this a character note for
 * this layout" (`view/auto-open.ts`, `commands.ts`,
 * `component-rename-migration.ts`) without parsing a body that will not
 * match.
 *
 * **Derived from the file's own text on every call, not maintained as a
 * separate index.** The real cache is asynchronous and can lag a fresh
 * write — `characters.ts`'s own header cites that race — but nothing in this
 * plugin's test suite depends on the lag itself, only on reading back what a
 * note's frontmatter block says, so a synchronous read off `Vault.rawContent`
 * is the double's whole job.
 *
 * **What this deliberately cannot show.** A value is never coerced past a
 * trimmed string and one layer of surrounding quotes, which is
 * `parse/character.ts`'s own `extractLayoutName` rule — so this models the
 * *plugin's* reader, not the app's. `parse/frontmatter.ts`'s `isPlainScalar`
 * exists precisely because those two have to agree about one line, and a double
 * that implements the second as a copy of the first can never fail when they
 * disagree: real YAML gives a typed scalar back for `sheet-layout: 12`, `: No`
 * or `: null`, and this double answers all three as the strings `'12'`, `'No'`
 * and `'null'`. Nothing here is a claim that Obsidian agrees.
 *
 * **The plugin no longer writes any of those three unquoted**, which is what
 * closed the backlog row this paragraph used to end on: the predicate quotes
 * what a bool or a number resolver would take, so a note this plugin wrote
 * cannot reach the disagreement. What a *hand-edited* note can, and every caller
 * is still written to be correct either way —
 * `component-rename-migration.ts` treats a non-string as undecidable and lets
 * the note's own text settle it. The wider missing probe, which would hold every
 * comment here about the app to the app, is `docs/BACKLOG.md` § Patterns.
 */
export class MetadataCache {
	constructor(private readonly vault: Vault) {}

	getFileCache(file: TFile): { frontmatter?: Record<string, string> } | null {
		const content = this.vault.rawContent(file.path);
		if (content === null) return null;
		const match = FRONTMATTER_BLOCK.exec(content);
		if (!match) return {};
		const frontmatter: Record<string, string> = {};
		for (const rawLine of (match[1] ?? '').split(/\r?\n/)) {
			const line = FRONTMATTER_LINE.exec(rawLine);
			if (!line) continue;
			const key = (line[1] ?? '').trim();
			let value = (line[2] ?? '').trim();
			if (
				(value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
				(value.startsWith("'") && value.endsWith("'") && value.length > 1)
			) {
				value = value.slice(1, -1);
			}
			frontmatter[key] = value;
		}
		return { frontmatter };
	}
}

/**
 * The app's registry of view types and the file extensions they open.
 *
 * **Not in `obsidian.d.ts`**, so nothing in the plugin may name its type; a
 * plugin reaches it through `Plugin.registerView` and
 * `Plugin.registerExtensions`, and reads it back — where it reads it at all —
 * through a narrow interface of its own. Here because both of those are the
 * app's writes into it, and the refusal is the part a plugin has to survive:
 * 1.13.7's `registerExtensions` checks every extension first and **throws before
 * registering any**, `'Attempting to register an existing file extension "' + o
 * + '"'`, so a taken extension leaves the whole call unregistered.
 */
export class ViewRegistry {
	viewByType: Record<string, (leaf: WorkspaceLeaf) => View> = {};
	typeByExtension: Record<string, string> = {};

	registerView(type: string, creator: (leaf: WorkspaceLeaf) => View): void {
		if (Object.prototype.hasOwnProperty.call(this.viewByType, type)) {
			throw new Error(`Attempting to register an existing view type "${type}"`);
		}
		this.viewByType[type] = creator;
	}

	unregisterView(type: string): void {
		delete this.viewByType[type];
	}

	registerExtensions(extensions: string[], type: string): void {
		for (const extension of extensions) {
			if (Object.prototype.hasOwnProperty.call(this.typeByExtension, extension)) {
				throw new Error(
					`Attempting to register an existing file extension "${extension}"`,
				);
			}
		}
		for (const extension of extensions) this.typeByExtension[extension] = type;
	}

	unregisterExtensions(extensions: string[]): void {
		for (const extension of extensions) delete this.typeByExtension[extension];
	}

	getTypeByExtension(extension: string): string | undefined {
		return this.typeByExtension[extension];
	}
}

export class App {
	viewRegistry = new ViewRegistry();
	vault = new Vault();
	workspace = new Workspace(this);
	// After `vault`, which it needs in order to hand out a folder in it. Field
	// initialisers run in declaration order, so the order here is load bearing.
	fileManager = new FileManager(this.vault);
	metadataCache = new MetadataCache(this.vault);
}

/** A plugin's manifest, the members a plugin here reads. */
export interface PluginManifest {
	id: string;
	name: string;
	version: string;
}

/**
 * A command as `addCommand` receives it: an id, a name, and one of the two
 * ways the app asks it to run.
 */
export interface Command {
	id: string;
	name: string;
	callback?: () => unknown;
	checkCallback?: (checking: boolean) => boolean | void;
}

/**
 * Obsidian's `Plugin`, enough of it for `onload` to run against.
 *
 * **Each registration is recorded and, where the app keeps a registry, written
 * into it** — views and extensions into `app.viewRegistry`, torn down again on
 * unload as the app's `register` callbacks do — so a test can ask what a plugin
 * registered, in what order, and whether a refusal from one registration left
 * the rest in place. `registrations` is that order, one entry per call, named
 * by the member and its first argument.
 *
 * **Not modelled**: `loadData` reading a file (it answers what `data` holds),
 * the ribbon, the status bar, and every `register*` this plugin does not call.
 */
export class Plugin extends Component {
	/** What `loadData` answers and `saveData` last wrote. */
	data: unknown = null;
	/** Every registration, in call order: `'<member>:<first argument>'`. */
	registrations: string[] = [];
	commands: Command[] = [];
	settingTabs: PluginSettingTab[] = [];

	constructor(
		public app: App,
		public manifest: PluginManifest,
	) {
		super();
	}

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: unknown): Promise<void> {
		this.data = data;
	}

	addSettingTab(tab: PluginSettingTab): void {
		this.registrations.push('addSettingTab');
		this.settingTabs.push(tab);
	}

	registerView(type: string, creator: (leaf: WorkspaceLeaf) => View): void {
		this.registrations.push(`registerView:${type}`);
		this.app.viewRegistry.registerView(type, creator);
		this.register(() => this.app.viewRegistry.unregisterView(type));
	}

	/**
	 * The app's own two lines: register, then undo it on unload. The recording
	 * comes first, so a call that throws is still on the record — which is what
	 * a test asserting the attempt needs.
	 */
	registerExtensions(extensions: string[], type: string): void {
		this.registrations.push(`registerExtensions:${extensions.join(',')}`);
		this.app.viewRegistry.registerExtensions(extensions, type);
		this.register(() => this.app.viewRegistry.unregisterExtensions(extensions));
	}

	registerHoverLinkSource(id: string, _info: unknown): void {
		this.registrations.push(`registerHoverLinkSource:${id}`);
	}

	addCommand(command: Command): Command {
		this.registrations.push(`addCommand:${command.id}`);
		this.commands.push(command);
		return command;
	}
}

export class Modal {
	containerEl: HTMLElement;
	modalEl: HTMLElement;
	contentEl: HTMLElement;
	titleEl: HTMLElement;

	constructor(public app: App) {
		this.containerEl = document.createElement('div');
		this.containerEl.classList.add('modal-container');
		this.modalEl = document.createElement('div');
		this.modalEl.classList.add('modal');
		this.titleEl = document.createElement('div');
		this.titleEl.classList.add('modal-title');
		this.contentEl = document.createElement('div');
		this.contentEl.classList.add('modal-content');
		this.modalEl.append(this.titleEl, this.contentEl);
		this.containerEl.appendChild(this.modalEl);
	}

	onOpen(): void {}
	onClose(): void {}

	open(): void {
		document.body.appendChild(this.containerEl);
		this.onOpen();
	}

	close(): void {
		this.onClose();
		this.containerEl.remove();
		this.contentEl.replaceChildren();
	}
}

/**
 * Obsidian's suggest modal, enough of it to drive a list and a choice.
 *
 * Added because a real surface reaches it: the starter picker
 * (`src/starters/picker.ts`) is one, and a modal nothing can construct is a
 * modal nothing can test.
 *
 * **Deliberately no list machinery**, which is the member-list rule at the top
 * of `plugin.ts` applied here: an `updateSuggestions` drawing each item into a
 * `.suggestion-item` was written first and then removed, because nothing drives
 * it. A test asks the modal for its suggestions and renders one itself — both
 * are the app's own public surface, and both are typed by the real `obsidian`
 * declarations rather than by this file, so a case driving them cannot pass
 * against a shape the app does not have.
 *
 * **And no `resultContainerEl` either, which is the same rule catching this file
 * a second time.** It survived the first cut — declared, built, classed and
 * appended, with the list loop that was its only reader gone — so the class held
 * the rule in its comment and a violation of it three lines below. What is left
 * is the two members a real subclass here actually reaches.
 */
export abstract class SuggestModal<T> extends Modal {
	inputEl: HTMLInputElement;

	constructor(app: App) {
		super(app);
		this.inputEl = document.createElement('input');
		this.inputEl.type = 'text';
		this.modalEl.append(this.inputEl);
	}

	setPlaceholder(placeholder: string): void {
		this.inputEl.placeholder = placeholder;
	}

	abstract getSuggestions(query: string): T[] | Promise<T[]>;
	abstract renderSuggestion(value: T, el: HTMLElement): void;
	abstract onChooseSuggestion(
		item: T,
		event: MouseEvent | KeyboardEvent,
	): void;
}

/**
 * Obsidian's base for a type-ahead popover, enough of it to be a base.
 *
 * Declared beside `AbstractInputSuggest` rather than folded into it because the
 * app splits them there: `open`, `close`, `renderSuggestion` and
 * `selectSuggestion` are `PopoverSuggest`'s, and a module reaching one of those
 * through a variable typed as the base compiles against the real declarations
 * and has to compile against these.
 *
 * **`scope` is deliberately absent.** The real class carries a `Scope` whose
 * pushed keymap consumes Enter, Escape, the arrows, Home, End and PageUp/Down
 * while the popup is open; this double answers those on the element's own
 * `keydown` instead, because a `Scope` with nothing to push it onto would be
 * modelling Obsidian's keymap stack rather than doubling one class.
 */
export abstract class PopoverSuggest<T> {
	constructor(public app: App) {}

	open(): void {}
	close(): void {}

	abstract renderSuggestion(value: T, el: HTMLElement): void;
	abstract selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void;
}

/**
 * Obsidian's input type-ahead, enough of it to drive a list, a keyboard and a
 * choice.
 *
 * Added because a real surface reaches it: the layout editor's formula fields
 * bind one (`docs/features/formula-name-suggestions.md`), and a popup nothing
 * can construct is a popup nothing can test or photograph.
 *
 * **What is modelled** is the whole of what that feature's design rests on: the
 * three listeners the app binds on the element, that `blur` closes, the
 * `.suggestion-container > .suggestion > .suggestion-item` markup appended to
 * `document.body` with `is-selected` on the highlighted item, `limit`, and the
 * keys the popup consumes *only while it is open* — which is the property the
 * accept-then-commit gesture rests on, since the second Enter has to reach the
 * input and fire `change`.
 *
 * **What is not modelled, named rather than left to be assumed** (`PATTERNS.md`
 * §2): the popup's placement, its flip when the input sits low in the window,
 * its height clamp and its reposition on scroll; the `Scope` the real class
 * pushes, and therefore Home, End and PageUp/PageDown; the mobile regime, which
 * defers `onInputFocus` through a `requestAnimationFrame` until the keyboard
 * settles and closes on the back gesture; the `autoDestroy` timer the app arms
 * on every open; the `isShown()` gate in `showSuggestions`, for the reason
 * `installDomHelpers` gives for leaving `isShown` out entirely; and
 * `suggestEl`/`isOpen`, which the app does not declare and so nothing here may
 * offer a test a way to read.
 *
 * **`getSuggestions` is awaited only where it returns a promise**, which is what
 * the app does: `onInputChange` branches on `Array.isArray` and calls
 * `showSuggestions` straight through for a plain array. This said the opposite
 * for one wave — "awaited unconditionally" — and the cost was not a bug but a
 * lie a test could not see through: every case and the harness both awaited a
 * microtask the app never takes.
 *
 * **Every query is gated on `textInputEl.isActiveElement()`**, as the app's is.
 * Without it a case could drive the whole popup at an element that was never
 * focused, which the app would refuse outright — the double being kinder than
 * the app, the one direction this file's header forbids.
 *
 * **A `mousedown` on a `.suggestion-item` is prevented and one on the container
 * is not**, which is the app's own delegation and not an approximation of it.
 * That distinction is load bearing rather than incidental: it is why pressing an
 * item accepts without blurring the field, and why a press on the popup's own
 * padding blurs and commits — a cost `docs/features/formula-name-suggestions.md`
 * §4 accepts by name, and one nothing could have observed here before.
 */
export abstract class AbstractInputSuggest<T> extends PopoverSuggest<T> {
	/** Elements rendered at once. 0 disables the cap, as the app's does. */
	limit = 100;

	private readonly textInputEl: HTMLInputElement | HTMLDivElement;
	private containerEl: HTMLElement | null = null;
	private shown: T[] = [];
	private selected = 0;
	private selectCallback:
		| ((value: T, evt: MouseEvent | KeyboardEvent) => unknown)
		| null = null;

	constructor(app: App, textInputEl: HTMLInputElement | HTMLDivElement) {
		super(app);
		this.textInputEl = textInputEl;
		textInputEl.addEventListener('input', () => this.refresh());
		textInputEl.addEventListener('focus', () => this.refresh());
		textInputEl.addEventListener('blur', () => this.close());
		textInputEl.addEventListener('keydown', (event) =>
			this.handleKey(event as KeyboardEvent),
		);
	}

	/**
	 * The app's own delegated handler: a press on an *item* keeps the field
	 * focused, a press on the container's padding does not.
	 *
	 * Bound on the container each time one is built rather than once in the
	 * constructor, because this double builds the container at `open()` where
	 * the app builds it with the instance.
	 */
	private preventItemBlur(container: HTMLElement): void {
		container.addEventListener('mousedown', (event) => {
			const target = event.target;
			if (target instanceof HTMLElement && target.closest('.suggestion-item')) {
				event.preventDefault();
			}
		});
	}

	getValue(): string {
		return this.textInputEl instanceof HTMLInputElement
			? this.textInputEl.value
			: (this.textInputEl.textContent ?? '');
	}

	setValue(value: string): void {
		if (this.textInputEl instanceof HTMLInputElement) {
			this.textInputEl.value = value;
		} else {
			this.textInputEl.textContent = value;
		}
	}

	protected abstract getSuggestions(query: string): T[] | Promise<T[]>;

	selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void {
		this.selectCallback?.(value, evt);
	}

	onSelect(
		callback: (value: T, evt: MouseEvent | KeyboardEvent) => unknown,
	): this {
		this.selectCallback = callback;
		return this;
	}

	open(): void {
		if (this.containerEl !== null) return;
		const container = document.createElement('div');
		container.classList.add('suggestion-container');
		const list = document.createElement('div');
		list.classList.add('suggestion');
		container.appendChild(list);
		this.preventItemBlur(container);
		document.body.appendChild(container);
		this.containerEl = container;
	}

	close(): void {
		this.containerEl?.remove();
		this.containerEl = null;
		this.shown = [];
		this.selected = 0;
	}

	/**
	 * Ask for suggestions and draw them, or close where there are none.
	 *
	 * The two gates are the app's, in the app's order: nothing is asked at all
	 * unless the element is focused, and a plain array is drawn straight through
	 * while a promise is awaited.
	 */
	private refresh(): void {
		if (!this.textInputEl.isActiveElement()) return;
		const answer = this.getSuggestions(this.getValue());
		if (Array.isArray(answer)) {
			this.show(answer);
			return;
		}
		void answer.then((values) => {
			this.show(values);
		});
	}

	private show(values: T[]): void {
		const capped = this.limit > 0 ? values.slice(0, this.limit) : values;
		if (capped.length === 0) {
			this.close();
			return;
		}
		this.shown = capped;
		this.selected = 0;
		this.open();
		this.paint();
	}

	private paint(): void {
		const list = this.containerEl?.querySelector('.suggestion');
		if (!(list instanceof HTMLElement)) return;
		list.replaceChildren();
		this.shown.forEach((value, index) => {
			const item = document.createElement('div');
			item.classList.add('suggestion-item');
			if (index === this.selected) item.classList.add('is-selected');
			this.renderSuggestion(value, item);
			item.addEventListener('click', (event) =>
				this.selectSuggestion(value, event),
			);
			list.appendChild(item);
		});
	}

	/**
	 * The keys the popup owns, and only while it is open.
	 *
	 * The guard is the whole point: closed, every one of these reaches the input,
	 * which is what makes Enter a commit rather than a second accept.
	 */
	private handleKey(event: KeyboardEvent): void {
		if (this.containerEl === null || this.shown.length === 0) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			this.close();
			return;
		}
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			const count = this.shown.length;
			this.selected = (this.selected + step + count) % count;
			this.paint();
			return;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			const value = this.shown[this.selected];
			if (value !== undefined) this.selectSuggestion(value, event);
		}
	}
}

/**
 * The subset of a setting definition this double honours.
 *
 * Obsidian 1.13's `SettingDefinitionItem` is a union of four row shapes with
 * three container kinds above it, and modelling all of that would be
 * reimplementing the app's settings renderer rather than doubling it. What is
 * here is what this plugin declares: a row with a name, a description, and its
 * own `render` callback. **Not `control`** — every row on the tab renders itself,
 * because a `control` is read and written by the 1.13 renderer and would leave
 * the row blank on the versions the tab's `display()` fallback exists for.
 *
 * Everything else is **refused loudly** by `assertModelled` rather than
 * dropped, on the rule §2 of `docs/PATTERNS.md` states for this file: a member
 * the app honours and the double ignores goes green under test and green in the
 * harness while Obsidian builds something else.
 */
export interface SettingDefinition {
	/** Required, as `SettingDefinitionBase.name` is: a nameless row is unsearchable. */
	name: string;
	desc?: string | DocumentFragment;
	/**
	 * Extra search terms. Read by the settings search and by nothing that
	 * renders, so it is accepted and ignored here rather than refused — that is
	 * what the app does with it at render time too.
	 */
	aliases?: string[];
	/** Controls search visibility only, so likewise accepted and unread. */
	searchable?: boolean | (() => boolean);
	render?: (setting: Setting, group: SettingGroup) => void | (() => void);
}

/**
 * Refuse a definition member this double would silently drop.
 *
 * Each branch names something the app draws or stores and this file does not,
 * so a row that grows one fails at the assertion instead of rendering as a row
 * that happens to look right.
 */
function assertModelled(def: SettingDefinition): void {
	const raw = def as unknown as Record<string, unknown>;
	if (typeof raw.type === 'string') {
		// `group`, `list` and `page` each bring their own chrome — a heading, a
		// search box, an empty state, a navigable sub-page — and none of it is
		// here.
		throw new Error(
			`obsidian-stub: setting definition type "${raw.type}" is not modelled`,
		);
	}
	if (raw.action !== undefined) {
		throw new Error(
			'obsidian-stub: an `action` definition is not modelled — it makes the whole row clickable through Setting.setAction',
		);
	}
	if (raw.visible !== undefined || raw.disabled !== undefined) {
		throw new Error(
			'obsidian-stub: `visible` and `disabled` are not modelled — the app re-evaluates both on every render and through refreshDomState',
		);
	}
	if (raw.control !== undefined) {
		// Refused rather than modelled, because nothing declares one: a `control`
		// is bound by the framework through `getControlValue`/`setControlValue`,
		// and a double that half-implements that binding would be the one thing
		// this file exists to prevent.
		throw new Error(
			'obsidian-stub: a `control` definition is not modelled — every row on this tab renders itself',
		);
	}
}

/**
 * The group a rendered row sits in, and **the wrapper is the whole point**.
 *
 * Obsidian's definition renderer never puts a row straight into the tab.
 * `e6` collects every consecutive definition that is not itself a group or a
 * list — `O2(e)` is `"type" in e && ("group" === e.type || "list" === e.type)`,
 * which all four of this plugin's rows fail — into one synthetic
 * `{ type: 'group', items: [...] }`, and renders it through this class. Its
 * constructor, from 1.13.7's `app.js`:
 *
 * ```js
 * function e(e) {
 *   var t = this.groupEl = e.createDiv("setting-group"),
 *       n = this.headerEl = createDiv("setting-item setting-item-heading");
 *   this.headerInnerEl = n.createDiv("setting-item-name");
 *   this.controlEl = n.createDiv("setting-item-control");
 *   this.searchContainerEl = t.createDiv({
 *     cls: "setting-group-search", attr: { tabIndex: -1 }
 *   });
 *   this.listEl = t.createDiv("setting-items")
 * }
 * ```
 *
 * So the shape is `containerEl > .setting-group > .setting-items >
 * .setting-item`, and **`app.css` hangs real rules on both wrappers**:
 * `.setting-group .setting-items` supplies one shared card — background, border
 * and radius — while `.setting-group .setting-item:not(.setting-item-heading)`
 * takes each row's own card, border, radius and `margin-bottom` away and
 * replaces the gaps with `::before` hairlines, at `--setting-items-padding-*`
 * rather than `--size-4-4`. `.setting-group` itself caps the width at
 * `--setting-group-max-width` and centres it.
 *
 * **This was missed once and it cost the review its instrument.** The double
 * appended rows straight into `containerEl`, which is what the *old* imperative
 * `display()` produced, so the settings shots came out byte-identical across the
 * declarative move and the acceptance criterion that watched them measured
 * nothing. Four separately-carded rows are not what Obsidian 1.13 draws.
 *
 * `headerEl` is deliberately absent from the DOM: the app builds it detached and
 * only `prepend`s it when `setHeading` is called with text, which nothing here
 * does.
 */
export class SettingGroup {
	groupEl: HTMLElement;
	listEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this.groupEl = containerEl.createDiv('setting-group');
		// Created empty and left empty. `.setting-group-search:empty` is
		// `display: none`, and the sibling rules that square off the list's top
		// corners are gated on `:not(:empty)`, so an empty one has to be *there*
		// for the list to keep its own radius.
		this.groupEl.createDiv({
			cls: 'setting-group-search',
			attr: { tabIndex: -1 },
		});
		this.listEl = this.groupEl.createDiv('setting-items');
	}
}

/**
 * Obsidian 1.13's settings tab, with both of the paths it renders by.
 *
 * Deminified from 1.13.7's `app.js`, where the base class is `l6` and
 * `PluginSettingTab` is `p4`:
 *
 * ```js
 * getSettingDefinitions() { return [] }
 * update() {
 *   this.settingItems = this.getSettingDefinitions();
 *   H2(this.settingItems, this.name);        // duplicate page-name check
 *   this.setting.refreshSearch();
 *   this.setting.refreshCurrentPage(this);   // <- the paint
 * }
 * renderTab() { this.settingItems.length > 0 ? W2(this) : this.display() }
 * display() { W2(this) }                     // W2 paints this.settingItems
 * getControlValue(key) { const s = this.plugin.settings; if (s) return s[key] }
 * setControlValue(key, v) {
 *   const s = this.plugin.settings;
 *   if (s) return s[key] = v, this.plugin.saveData(s)
 * }
 * getControlBinding(key) {
 *   return {
 *     value: this.getControlValue(key),
 *     onChange: async v => {
 *       await this.setControlValue(key, v);
 *       this.refreshDomState()
 *     }
 *   }
 * }
 * ```
 *
 * **One deliberate deviation, and it is in `update()`.** In the app the paint
 * goes through `this.setting.refreshCurrentPage(this)` — the settings modal,
 * which owns the page a tab is drawn into. There is no modal here, so `update()`
 * renders into `containerEl` itself. What this double models is the
 * definition-to-DOM mapping; the modal's scheduling of it is the app's and out
 * of reach. `display()` stays what the app's is, painting whatever `update()`
 * last stored, which is why a caller renders by calling `update()`.
 *
 * **A second, narrower one: this rebuilds where the app diffs.** `e6` empties the
 * container only on the first render and afterwards reconciles row by row. The
 * skip that preserves a half-typed value is `"control" in t.def &&
 * !!t.def.control && a.contains(l) && a !== l` — **gated on the row being a
 * `control` row**, which none of this plugin's are. A `render` row holding the
 * active element is torn down and rebuilt like any other, and the app then
 * re-focuses its control container with `Fm(a, { preventScroll: true })`, so
 * what survives there is the focus and not the value. This double rebuilds
 * unconditionally and re-focuses nothing, so nothing may read focus across an
 * `update()` and expect the app's answer.
 */
export class PluginSettingTab {
	containerEl: HTMLElement;
	/** Populated by `update()` and painted by both render paths, as in the app. */
	settingItems: SettingDefinition[] = [];
	private cleanups: (() => void)[] = [];

	constructor(
		public app: App,
		public plugin: unknown,
	) {
		this.containerEl = document.createElement('div');
		this.containerEl.classList.add('vertical-tab-content');
	}

	getSettingDefinitions(): SettingDefinition[] {
		return [];
	}

	update(): void {
		this.settingItems = this.getSettingDefinitions();
		this.paint();
	}

	display(): void {
		this.paint();
	}

	hide(): void {}

	/*
	 * **`getControlValue`, `setControlValue`, `getControlBinding` and
	 * `refreshDomState` are deliberately absent**, and the deminified source
	 * above is left in place so the next reader can see what they would do.
	 * All four exist to serve a `control` definition, `assertModelled` refuses
	 * one, and no row on this plugin's tab declares one. A binding half-built
	 * here — a write that lands in the object but never asks for a save, say —
	 * is precisely the silent divergence this file exists to prevent, so the
	 * four arrive together with the first row that needs them or not at all.
	 */

	private paint(): void {
		for (const cleanup of this.cleanups) cleanup();
		this.cleanups = [];
		this.containerEl.replaceChildren();
		// One synthetic group for the whole run, which is what `e6` builds for a
		// list of definitions none of which is itself a group or a list.
		const group = new SettingGroup(this.containerEl);

		for (const def of this.settingItems) {
			assertModelled(def);
			// Name and description before the control, as the app sets them, so a
			// `render` callback that writes over either wins the way it does there.
			const setting = new Setting(group.listEl);
			setting.setName(def.name);
			// `sg(e)` in the app: `typeof e === 'string' ? e : e.cloneNode(true)`.
			// The clone is load-bearing rather than defensive — `renderTab()` paints
			// the *stored* definitions on every tab activation while `update()` runs
			// once, so a fragment appended rather than cloned would empty the row's
			// description the second time it is drawn.
			setting.setDesc(
				typeof def.desc === 'string'
					? def.desc
					: ((def.desc?.cloneNode(true) as DocumentFragment | undefined) ?? ''),
			);

			if (def.render) {
				const cleanup = def.render(setting, group);
				if (cleanup) this.cleanups.push(cleanup);
			}
		}
	}
}

/**
 * Obsidian's path tidy, transcribed from the app's own implementation.
 *
 * Obsidian 1.13.7's `app.js`, deminified:
 *
 * ```js
 * function normalizePath(e) { return replaceControlChars(slashes(e)).normalize('NFC') }
 * function slashes(e) {
 *   return '' === (e = e.replace(/([\\/])+/g, '/').replace(/(^\/+|\/+$)/g, '')) && (e = '/'), e
 * }
 * ```
 *
 * **Three facts this stub got wrong, and the third is the one that shipped a
 * bug.** Runs of *either* slash collapse to one `/`, so a Windows-style
 * separator normalises too. Leading slashes are stripped as well as trailing
 * ones — this double only dropped a trailing one. And **what is left of an empty
 * path is `/`, which is the vault root's own path**: `getRoot().path` is `/`,
 * not `''`, exactly as `obsidian.d.ts` says of `getAllFolders(includeRoot)`
 * ("the root folder (`/`)").
 *
 * The control-character replacement is deliberately not modelled: it is a
 * character class this repository cannot read reliably out of a minified
 * bundle, and nothing here depends on it. The `.trim()` this function used to
 * do is gone, because the app does not do it — a folder name with a trailing
 * space is a folder name.
 */
export function normalizePath(path: string): string {
	const trimmed = path.replace(/([\\/])+/g, '/').replace(/(^\/+|\/+$)/g, '');
	return (trimmed === '' ? '/' : trimmed).normalize('NFC');
}

/**
 * Obsidian's debounce. The real one returns a function carrying `.cancel()`
 * and `.run()`; the layout editor calls `.run()` to flush a pending edit when
 * the tab closes, so both are here.
 */
export function debounce<A extends unknown[]>(
	fn: (...args: A) => unknown,
	timeout = 0,
): ((...args: A) => void) & { cancel: () => void; run: () => void } {
	// A DOM timer id, which is a number. `typeof setTimeout` here would pick up
	// Node's overload from @types/node and disagree with `window.setTimeout`.
	let handle: number | undefined;
	let pending: A | undefined;
	const flush = () => {
		if (pending === undefined) return;
		const args = pending;
		pending = undefined;
		fn(...args);
	};
	const wrapped = (...args: A): void => {
		pending = args;
		if (handle !== undefined) window.clearTimeout(handle);
		handle = window.setTimeout(() => {
			handle = undefined;
			flush();
		}, timeout);
	};
	wrapped.cancel = () => {
		if (handle !== undefined) window.clearTimeout(handle);
		handle = undefined;
		pending = undefined;
	};
	wrapped.run = () => {
		if (handle !== undefined) window.clearTimeout(handle);
		handle = undefined;
		flush();
	};
	return wrapped;
}

/**
 * Obsidian puts `createFragment`, the three element creators and `el.win` in
 * global scope.
 */
export function installGlobals(): void {
	const scope = globalThis as unknown as Record<string, unknown>;
	/*
	 * The detached creators, and they are the reason nine sites in `src/` and
	 * nine in `harness/` used to hold `document.createElement` with an argument
	 * written at each one.
	 *
	 * The argument was that `createEl` attaches on creation and so cannot
	 * express an element attached later than it is created. That is true of the
	 * *prototype* helper and false of the API: `obsidian.d.ts` declares
	 * `createEl`, `createDiv` and `createSpan` as globals beside the `Node`
	 * methods, and those return an element with no parent. Read out of the app's
	 * own `enhance.js`, the global is the implementation and the method is a
	 * two-line wrapper that sets `parent` to the receiver.
	 *
	 * So this is not the stub growing a convenience. It is the stub catching up
	 * with three API members it had never installed, which is why the claim
	 * looked true for as long as it did — nothing in the test run or the harness
	 * could call them.
	 */
	scope.createEl = (
		tag: string,
		options?: ElementOptions | string,
		callback?: (el: HTMLElement) => void,
	): HTMLElement => make(null, tag, options, callback);
	scope.createDiv = (
		options?: ElementOptions | string,
		callback?: (el: HTMLElement) => void,
	): HTMLElement => make(null, 'div', options, callback);
	scope.createSpan = (
		options?: ElementOptions | string,
		callback?: (el: HTMLElement) => void,
	): HTMLElement => make(null, 'span', options, callback);
	scope.createFragment = (
		build?: (fragment: DocumentFragment) => unknown,
	): DocumentFragment => {
		const fragment = document.createDocumentFragment();
		build?.(fragment);
		return fragment;
	};
	// A DocumentFragment is not an HTMLElement, so the prototype helpers above
	// miss it — and `createFragment` hands its callback exactly that. The
	// settings tab builds its description this way, so without these the tab
	// throws on render rather than degrading. Obsidian installs the helpers on
	// `Node`, which covers both; this file installs them twice instead, and the
	// two now share `make` so the options they honour cannot drift apart. That
	// sharing also removes the last read of the global `document` here: `make`
	// takes the parent's own, which is `PATTERNS.md` §5's rule.
	const fragProto = DocumentFragment.prototype as unknown as Record<
		string,
		unknown
	>;
	fragProto.createEl = function (
		this: DocumentFragment,
		tag: string,
		options?: ElementOptions | string,
		callback?: (el: HTMLElement) => void,
	): HTMLElement {
		return make(this, tag, options, callback);
	};
	fragProto.createDiv = function (
		this: DocumentFragment,
		options?: ElementOptions | string,
		callback?: (el: HTMLElement) => void,
	): HTMLElement {
		return make(this, 'div', options, callback);
	};
	fragProto.createSpan = function (
		this: DocumentFragment,
		options?: ElementOptions | string,
		callback?: (el: HTMLElement) => void,
	): HTMLElement {
		return make(this, 'span', options, callback);
	};
	fragProto.appendText = function (this: DocumentFragment, text: string): void {
		this.appendChild(this.ownerDocument.createTextNode(text));
	};

	if (!('win' in HTMLElement.prototype)) {
		Object.defineProperty(HTMLElement.prototype, 'win', {
			get(this: HTMLElement) {
				return this.ownerDocument.defaultView ?? window;
			},
		});
	}
}

// Guarded for the reason `installDomHelpers` is: a node-environment test may now
// reach this module through a component, and there is no document there to install
// globals onto.
if (typeof DocumentFragment !== 'undefined') installGlobals();
