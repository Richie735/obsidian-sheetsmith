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

interface ElementOptions {
	cls?: string | string[];
	text?: string;
	type?: string;
	value?: string;
	attr?: Record<string, string>;
	href?: string;
	title?: string;
}

function applyOptions(el: HTMLElement, options?: ElementOptions): void {
	if (!options) return;
	if (options.cls) {
		const classes = Array.isArray(options.cls)
			? options.cls
			: options.cls.split(/\s+/);
		for (const name of classes) if (name !== '') el.classList.add(name);
	}
	if (options.text !== undefined) el.textContent = options.text;
	if (options.type !== undefined) el.setAttribute('type', options.type);
	if (options.value !== undefined) (el as HTMLInputElement).value = options.value;
	if (options.href !== undefined) el.setAttribute('href', options.href);
	if (options.title !== undefined) el.setAttribute('title', options.title);
	for (const [name, value] of Object.entries(options.attr ?? {})) {
		el.setAttribute(name, value);
	}
}

/** Build an element the way Obsidian's helpers do. */
function make(
	parent: HTMLElement,
	tag: string,
	options?: ElementOptions,
	callback?: (el: HTMLElement) => void,
): HTMLElement {
	const el = parent.ownerDocument.createElement(tag);
	applyOptions(el, options);
	parent.appendChild(el);
	callback?.(el);
	return el;
}

/** Install the prototype helpers Obsidian adds to every element. */
export function installDomHelpers(): void {
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;

	proto.createEl = function (
		this: HTMLElement,
		tag: string,
		options?: ElementOptions,
		callback?: (el: HTMLElement) => void,
	): HTMLElement {
		return make(this, tag, options, callback);
	};

	proto.createDiv = function (
		this: HTMLElement,
		cls?: string | ElementOptions,
		callback?: (el: HTMLElement) => void,
	): HTMLElement {
		return make(this, 'div', typeof cls === 'string' ? { cls } : cls, callback);
	};

	proto.createSpan = function (
		this: HTMLElement,
		cls?: string | ElementOptions,
		callback?: (el: HTMLElement) => void,
	): HTMLElement {
		return make(this, 'span', typeof cls === 'string' ? { cls } : cls, callback);
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
	'arrow-up': [
		['path', { d: 'm5 12 7-7 7 7' }],
		['path', { d: 'M12 19V5' }],
	],
	'arrow-down': [
		['path', { d: 'M12 5v14' }],
		['path', { d: 'm19 12-7 7-7-7' }],
	],
	'grip-vertical': gripDots(),
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
	onClick(cb: (event: MouseEvent) => unknown): this {
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
	get parent(): TFolder | null {
		const parent = parentPath(this.path);
		return parent === '' ? null : this.vault.getFolderByPath(parent);
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
		folder.children = [...this.files.values()]
			.filter(({ file }) => parentPath(file.path) === path)
			.map(({ file }) => file);
		return folder;
	}

	async createFolder(path: string): Promise<TFolder> {
		const folder = new TFolder(path, this);
		this.folders.set(path, folder);
		return folder;
	}

	async create(path: string, content: string): Promise<TFile> {
		const file = new TFile(path, this);
		this.files.set(path, { file, content });
		return file;
	}

	async read(file: TFile): Promise<string> {
		return this.files.get(file.path)?.content ?? '';
	}

	async modify(file: TFile, content: string): Promise<void> {
		this.files.set(file.path, { file, content });
	}

	async delete(file: TAbstractFile): Promise<void> {
		this.files.delete(file.path);
	}
}

export class FileManager {
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
	fileManager = new FileManager();
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

export class PluginSettingTab {
	containerEl: HTMLElement;
	constructor(
		public app: App,
		public plugin: unknown,
	) {
		this.containerEl = document.createElement('div');
		this.containerEl.classList.add('vertical-tab-content');
	}
	display(): void {}
	hide(): void {}
}

/** Obsidian's path tidy: collapse duplicate slashes, drop a trailing one. */
export function normalizePath(path: string): string {
	return path.replace(/\/+/g, '/').replace(/\/$/, '').trim();
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

/** Obsidian puts `createFragment` and `el.win` in global scope. */
export function installGlobals(): void {
	const scope = globalThis as unknown as Record<string, unknown>;
	scope.createFragment = (
		build?: (fragment: DocumentFragment) => unknown,
	): DocumentFragment => {
		const fragment = document.createDocumentFragment();
		build?.(fragment);
		return fragment;
	};
	// A DocumentFragment is not an HTMLElement, so the prototype helpers above
	// miss it — and `createFragment` hands its callback exactly that. The
	// settings tab builds its description this way, so without these two the
	// tab throws on render rather than degrading.
	const fragProto = DocumentFragment.prototype as unknown as Record<
		string,
		unknown
	>;
	fragProto.createEl = function (
		this: DocumentFragment,
		tag: string,
		options?: ElementOptions,
		callback?: (el: HTMLElement) => void,
	): HTMLElement {
		const el = document.createElement(tag);
		applyOptions(el, options);
		this.appendChild(el);
		callback?.(el);
		return el;
	};
	fragProto.createSpan = function (
		this: DocumentFragment,
		cls?: string | ElementOptions,
		callback?: (el: HTMLElement) => void,
	): HTMLElement {
		return (this as unknown as { createEl: (t: string, o?: ElementOptions, c?: (el: HTMLElement) => void) => HTMLElement }).createEl(
			'span',
			typeof cls === 'string' ? { cls } : cls,
			callback,
		);
	};
	fragProto.appendText = function (this: DocumentFragment, text: string): void {
		this.appendChild(document.createTextNode(text));
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
