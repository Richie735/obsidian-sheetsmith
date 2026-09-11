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

/** Which controls `addControls` renders; the tests flip it to cover both. */
export const Platform = { isMobile: false };

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
	// The layout editor's **Copy layout JSON** control, beside the trash on the
	// same row (`docs/features/layout-import-export.md`). Two overlapping sheets,
	// which is the one glyph a reader already reads as "copy" — and it has to be
	// drawn rather than named, because the harness is where a row of clickable
	// icons is checked for measuring the same.
	copy: [
		['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }],
		['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
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
	constructor(message: string) {
		Notice.messages.push(message);
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
 * shape this plugin uses: a single configured folder holding `.json` files.
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
	private folders = new Map<string, TFolder>();
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
		return file;
	}

	async read(file: TFile): Promise<string> {
		return this.files.get(file.path)?.content ?? '';
	}

	async modify(file: TFile, content: string): Promise<void> {
		this.files.set(file.path, { file, content });
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
		this.files.delete(file.path);
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

	constructor(vault: Vault) {
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
 * What is deliberately *not* here: a `file`, and a vault fixture to load one
 * from. That is what a rendered `SheetView` needs beyond this
 * (`docs/PATTERNS.md` §11), and it is a piece of work of its own rather than
 * something to half-build here.
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

/** Only ever extended, never constructed by anything the harness renders. */
export class TextFileView extends ItemView {
	data = '';
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
	 * What the app was asked to show here, recorded rather than acted on.
	 *
	 * The real call swaps the view in this leaf, which means constructing a view
	 * of an arbitrary registered type — the plugin's own sheet view among them —
	 * and nothing here holds that registry. What a caller can be held to is the
	 * request: the view type, and the file it named. So this pushes and
	 * `viewStates` is what a test reads, which is the same bargain
	 * `FileManager.getNewFileParent` above makes.
	 */
	viewStates: { type: string; state?: Record<string, unknown> }[] = [];

	async setViewState(
		viewState: { type: string; state?: Record<string, unknown> },
		_eState?: unknown,
	): Promise<void> {
		this.viewStates.push(viewState);
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

	async revealLeaf(leaf: WorkspaceLeaf): Promise<void> {
		this.activeLeaf = leaf;
	}

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

export class App {
	vault = new Vault();
	workspace = new Workspace(this);
	// After `vault`, which it needs in order to hand out a folder in it. Field
	// initialisers run in declaration order, so the order here is load bearing.
	fileManager = new FileManager(this.vault);
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
