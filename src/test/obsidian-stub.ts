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
 * Added so the layout editor can be rendered outside the app — by the harness
 * today, and by a test whenever `layout-editor.ts` gets one, which it does not
 * have. The DOM shape matters and is not incidental: styles.css targets
 * `.setting-item`, `.setting-item-control`, `.setting-item-name` and
 * `.clickable-icon`, so a stub emitting a different structure would render the
 * editor in a way no user would ever see.
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

export class ToggleComponent extends ValueComponent<boolean, HTMLInputElement> {
	get toggleEl(): HTMLInputElement {
		return this.el;
	}
	constructor(parent: HTMLElement) {
		const input = parent.ownerDocument.createElement('input');
		input.type = 'checkbox';
		input.classList.add('checkbox-container');
		parent.appendChild(input);
		super(input);
		input.addEventListener('change', () =>
			this.changeCallback?.(input.checked),
		);
	}
	getValue(): boolean {
		return this.el.checked;
	}
	setValue(value: boolean): this {
		this.el.checked = value;
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

export class Workspace {
	getLeavesOfType(): unknown[] {
		return [];
	}
	on(): unknown {
		return {};
	}
}

export class FileManager {
	async trashFile(file: TAbstractFile): Promise<void> {
		await file.vault.delete(file);
	}
}

export class App {
	vault = new Vault();
	workspace = new Workspace();
	fileManager = new FileManager();
}

export class WorkspaceLeaf {}

/** Only ever extended, never constructed by anything the harness renders. */
export class TextFileView {
	containerEl: HTMLElement = document.createElement('div');
	data = '';
	constructor(public leaf: WorkspaceLeaf) {}
	registerEvent(): void {}
	registerDomEvent(): void {}
	registerInterval(): void {}
}

export class MarkdownView extends TextFileView {}

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
