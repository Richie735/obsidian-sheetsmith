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

installDomHelpers();

/** Which controls `addControls` renders; the tests flip it to cover both. */
export const Platform = { isMobile: false };

/** Icons are decoration here: record the name so a test can assert on it. */
export function setIcon(el: HTMLElement, icon: string): void {
	el.dataset.icon = icon;
}

export class Notice {
	static messages: string[] = [];
	constructor(message: string) {
		Notice.messages.push(message);
	}
}
