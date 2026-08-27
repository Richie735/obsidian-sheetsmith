// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { App, Component } from 'obsidian';
// The failure hook is the stub's own and deliberately not part of Obsidian's API,
// so it is imported from the scaffolding rather than through the module alias —
// the same route `settings.test.ts` and the editor's cases already take.
import { MarkdownRenderer } from '../test/obsidian-stub';
import { MarkdownPasses } from './markdown-pass';

/*
 * Beside the module rather than in the sheet view's own file, because
 * `SheetView` cannot be rendered by a test — a vault, a metadata cache and a
 * layout file to load (`docs/PATTERNS.md` §11 holds that row). What is here is
 * everything the view's three lines delegate: which pass a render belongs to,
 * and what happens to one that arrives after its pass is over.
 *
 * A `Component` stands in for the view, which is what the view is: an `ItemView`
 * is a `Component`, and the only thing this asks of its owner is `addChild` and
 * `removeChild`.
 */

/** The owner a pass hangs its children on, loaded as the app loads a view. */
function owner(): Component {
	const view = new Component();
	view.load();
	return view;
}

/** A box to render into, as the sheet hands a component's own element. */
function box(): HTMLElement {
	return document.createElement('div');
}

/** What the stub renderer put in a box: one paragraph holding the source. */
const drawn = (el: HTMLElement) => el.textContent;

/**
 * The failure callback for a case that is not about failure.
 *
 * It throws rather than doing nothing, because every case below asserts what
 * ended up in the box and a silent no-op would let a spurious failure report
 * pass as "the render simply drew nothing".
 */
const noFallback = () => {
	throw new Error('the render was not expected to fail');
};

/**
 * A vault that holds every note, for the cases that are not about resolution.
 *
 * The pass marks unresolved links once a render lands, because the renderer does
 * not — so every `begin` now says what the vault holds, and a case with no
 * opinion says "everything".
 */
const everythingResolves = () => true;

describe('MarkdownPasses', () => {
	it('marks the unresolved links once the render has landed', async () => {
		/*
		 * The renderer produces `a.internal-link` and marks none of them, because
		 * the class comes from the app's preview machinery rather than from the
		 * render call — so without this every link in a backstory painted as live.
		 * Here rather than in the component because this is the only place that
		 * knows the render finished.
		 *
		 * The anchors go in before the render lands rather than after, and that is
		 * the staleness guard's doing rather than a convenience: beginning a second
		 * pass to get a second marking would end the first, and the first's `.then`
		 * clears the box it no longer owns.
		 */
		const passes = new MarkdownPasses(owner(), new App());
		const into = box();
		const known = into.ownerDocument.createElement('a');
		known.className = 'internal-link';
		known.setAttribute('data-href', 'Neverwinter');
		const unknown = into.ownerDocument.createElement('a');
		unknown.className = 'internal-link';
		unknown.setAttribute('data-href', 'Nowhere');
		into.append(known, unknown);

		passes.begin('Sildar.md', (t) => t === 'Neverwinter')(
			'prose',
			into,
			noFallback,
		);
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(unknown.classList.contains('is-unresolved')).toBe(true);
		expect(known.classList.contains('is-unresolved')).toBe(false);
	});

	it('marks nothing when the render failed, since the box is empty', async () => {
		// The fallback painter owns that path and writes its own anchors, with the
		// resolution state on them already.
		const passes = new MarkdownPasses(owner(), new App());
		const into = box();
		const el = into.ownerDocument.createElement('a');
		el.className = 'internal-link';
		el.setAttribute('data-href', 'Nowhere');
		into.appendChild(el);
		MarkdownRenderer.failNextRender = true;
		let told = 0;
		passes.begin('Sildar.md', () => false)('prose', into, () => told++);
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(told).toBe(1);
		expect(el.classList.contains('is-unresolved')).toBe(false);
	});

	it('draws markdown into the element it was given', () => {
		const passes = new MarkdownPasses(owner(), new App());
		const into = box();
		passes.begin('Sildar.md', everythingResolves)('Grew up in Neverwinter.', into, noFallback);
		return Promise.resolve().then(() => {
			expect(drawn(into)).toBe('Grew up in Neverwinter.');
		});
	});

	it('unloads the previous pass when the next one begins', async () => {
		/*
		 * The leak this module exists to prevent. A sheet rebuilds on every
		 * committed edit anywhere on it, so a view that kept adding children would
		 * accumulate every embed's listeners across every rebuild for as long as
		 * the note stayed open.
		 *
		 * Observed through a child of the pass's own child, which is what an embed
		 * registering a listener actually is: the app hangs its render children on
		 * the `Component` it was handed, so if that one is unloaded so are they.
		 */
		const passes = new MarkdownPasses(owner(), new App());
		const unloaded: string[] = [];

		/** Something the first pass's renderer would have hung on its component. */
		class Embed extends Component {
			constructor(private name: string) {
				super();
			}
			override onunload(): void {
				unloaded.push(this.name);
			}
		}

		const first = box();
		passes.begin('Sildar.md', everythingResolves)('First.', first, noFallback);
		await Promise.resolve();
		// Hung on the pass's own child, which is where the renderer hangs the
		// children it creates: the component it was handed is the parent.
		firstChildOf(passes).addChild(new Embed('first'));
		expect(unloaded).toEqual([]);

		passes.begin('Sildar.md', everythingResolves);
		expect(unloaded).toEqual(['first']);
	});

	it('leaves the current pass loaded, so a late render still lands', async () => {
		const passes = new MarkdownPasses(owner(), new App());
		const draw = passes.begin('Sildar.md', everythingResolves);
		const into = box();
		draw('Still current.', into, noFallback);
		await Promise.resolve();
		await Promise.resolve();
		expect(drawn(into)).toBe('Still current.');
	});

	it('writes nothing where the pass ended before the render landed', async () => {
		/*
		 * The second trap, and the quiet one. `MarkdownRenderer.render` is
		 * asynchronous and a rebuild replaces the DOM, so the element a call was
		 * given may be detached by the time the call resolves. Unloading the child
		 * stops the *app* rendering more; what it does not do is stop the awaited
		 * call appending into an orphan, and markup arriving in a box nothing can
		 * see is a detached subtree the post-processors are still holding.
		 */
		const passes = new MarkdownPasses(owner(), new App());
		const draw = passes.begin('Sildar.md', everythingResolves);
		const into = box();
		draw('From a pass that is over.', into, noFallback);
		// The rebuild lands between the call and its resolution, which is exactly
		// the race: one committed edit is enough to produce it.
		passes.begin('Sildar.md', everythingResolves);
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(into.childNodes).toHaveLength(0);
	});

	it('writes nothing after the passes are ended for good', async () => {
		// A file change, which is `clear()` on the view: the outgoing note's embeds
		// go with it and no render of its may still arrive.
		const passes = new MarkdownPasses(owner(), new App());
		const draw = passes.begin('Sildar.md', everythingResolves);
		const into = box();
		draw('From the note just closed.', into, noFallback);
		passes.end();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(into.childNodes).toHaveLength(0);
	});

	it('tells the caller when the app\'s renderer rejected', async () => {
		/*
		 * The finding this case exists for: the rejection used to be swallowed on
		 * the grounds that the box already held what the component drew, which was
		 * false — the branch that reaches this is exclusive, so the box is empty.
		 * What the reader got was a blank block under a filled-in label, the prose
		 * still in the note, and nothing said in the box or the console.
		 */
		const passes = new MarkdownPasses(owner(), new App());
		const into = box();
		let told = 0;
		MarkdownRenderer.failNextRender = true;
		passes.begin('Sildar.md', everythingResolves)('Grew up in Neverwinter.', into, () => {
			told++;
			// What the component actually does with it: draws what it can from the
			// text alone, which is the same thing it draws with no renderer at all.
			into.appendChild(into.ownerDocument.createElement('p')).textContent =
				'Drawn from the text alone';
		});
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(told).toBe(1);
		expect(drawn(into)).toBe('Drawn from the text alone');
	});

	it('tells the caller nothing when the render succeeded', async () => {
		// The other half, so the case above is not passing on a callback that fires
		// unconditionally: a success must not draw a fallback over the markup.
		const passes = new MarkdownPasses(owner(), new App());
		const into = box();
		let told = 0;
		passes.begin('Sildar.md', everythingResolves)('Grew up in Neverwinter.', into, () => told++);
		await Promise.resolve();
		await Promise.resolve();
		expect(told).toBe(0);
		expect(drawn(into)).toBe('Grew up in Neverwinter.');
	});

	it('reports no failure into a box whose pass is already over', async () => {
		// Both guards at once, and the order between them is the point: a component
		// cannot usefully draw a fallback into an element that is no longer on
		// screen, so a rejection from a dead pass is cleared rather than reported.
		const passes = new MarkdownPasses(owner(), new App());
		const into = box();
		let told = 0;
		MarkdownRenderer.failNextRender = true;
		passes.begin('Sildar.md', everythingResolves)('From a pass that is over.', into, () => told++);
		passes.begin('Sildar.md', everythingResolves);
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(told).toBe(0);
		expect(into.childNodes).toHaveLength(0);
	});

	it('unloads whatever the last pass left when its owner unloads', () => {
		// Closing the leaf, which is the one teardown this module does not have to
		// implement: the pass's child is the view's child, so the view takes it.
		// Observed the same way as above, through something hung on that child:
		// `Component.loaded` is the stub's and not part of Obsidian's own type.
		const view = owner();
		const passes = new MarkdownPasses(view, new App());
		passes.begin('Sildar.md', everythingResolves);
		let unloaded = false;
		const embed = new Component();
		embed.onunload = () => {
			unloaded = true;
		};
		firstChildOf(passes).addChild(embed);
		expect(unloaded).toBe(false);
		view.unload();
		expect(unloaded).toBe(true);
	});

	it('ends a pass that never began without reaching for a child', () => {
		// `clear()` runs before the first render on a leaf that opens and closes,
		// and a null child is what it meets there.
		const passes = new MarkdownPasses(owner(), new App());
		expect(() => passes.end()).not.toThrow();
	});
});

/**
 * The `Component` the current pass renders under.
 *
 * Reached through the module's own private field rather than through a seam of
 * its own, because a seam is what the assertion would then be about: the claim
 * is that a pass's renders are bounded by one child and the previous child is
 * unloaded, and an injected factory would only prove the factory was called.
 * PATTERNS §11 records the same trap one level up, that a module over a fake
 * host rewrites every assertion to test the seam instead of the behaviour.
 */
function firstChildOf(passes: MarkdownPasses): Component {
	const child = (passes as unknown as { child: Component | null }).child;
	if (child === null) throw new Error('no pass has begun');
	return child;
}
