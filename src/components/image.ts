/*
 * Image — a portrait or a symbol on the sheet (SPEC §4.2). Covers the one thing a
 * character sheet holds that is not text or arithmetic: a face, a sigil, a crest.
 *
 * **Its value is an embed, and that is an amendment to §4.2 rather than a
 * reading of it.** The catalog gave this component `fenced` storage holding "a
 * path or wikilink", and Constraint 2 is unconditional: Obsidian does not index
 * links inside a code fence, so backlinks, graph view, hover preview and
 * **rename propagation** all break with no warning. A picture is the reference in
 * a vault most likely to be renamed, which makes it the worst possible value to
 * bury in a fence. So the section body *is* the embed the reader would have
 * written anyway:
 *
 *     ## Portrait
 *
 *     ![[Sildar Hallwinter.png]]
 *
 * Every consequence is a gain. Rename propagates. The portrait shows in markdown
 * view, where a fenced `path: Portrait.png` would have shown a code block. And it
 * matches Table's precedent exactly: the component that holds links stores
 * markdown. `parse/markdown-body.ts` is the storage half, shared with Rich text.
 *
 * **Only the embed form is accepted**, and each refusal is in
 * `parse/wikilink.ts`'s `parseEmbed`. A bare path would not propagate on rename,
 * which is the whole point; `![](…)` is markdown's own syntax and does not
 * either; a remote URL is refused as policy rather than as syntax — which is why
 * that half is `components/embed-rule.ts`'s and not the parser's.
 *
 * **The acceptance rule itself left this file when Passport arrived.** It was two
 * private functions here, and the second reader made it a *policy* shared by two
 * components — a predicate and the sentences it refuses with — which
 * `docs/PATTERNS.md` §1 extracts on the second consumer rather than the third,
 * because a guard test over two copies could only assert they still agree. What
 * stayed is everything this component does with the answer: where the message is
 * drawn, that the field survives it, and that `read` never fails.
 *
 * **It fills its placement and the picture is scaled to fit inside it**, up as
 * well as down: `object-fit: contain`, centred, never cropped and never
 * distorted. §8 is not bent by this, it is read correctly: the *component* fills
 * its placement, and a picture is what the component draws inside it. The
 * scaling is the stylesheet's and the argument for scaling *up* is with it — in
 * short, drawing at native size would let the file's pixel count size a box the
 * layout author placed, which is the same defect this component refuses the
 * stored size hint for. A size hint in the stored embed —
 * `![[Portrait.png|200x300]]` — is preserved in the file byte-for-byte and
 * **ignored on the sheet**, because honouring a number out of a *character's*
 * note would let one character's portrait float centred in a box the *layout
 * author* sized, which is the first thing §8 forbids. The plugin invents no
 * sizing key of its own for the same reason: a width on the component would be a
 * second sizing control disagreeing with the grid.
 *
 * **Every failure is on screen, under the component's own label.** That clause is
 * load-bearing: every image failure in the prior art is silent — an empty div
 * with the diagnosis in the console, a broken-image icon, a value reverting with
 * "console is not outputing any warning nor error" — so the label is drawn first
 * and the error goes in the frame below it, and nothing here writes to the
 * console.
 *
 * **It holds no extension list**, and that is the one shape of Fantasy Statblocks
 * 455 that cannot be written here: webp silently ceasing to render inside a
 * plugin while the same syntax worked one line outside it is what a resolution
 * path diverging from the app's own looks like. The app answers whether the file
 * exists; the browser answers whether it can draw it; this reports what happened.
 *
 * **It declares no `sample`, and it is the component that made that member
 * optional** (`docs/features/preview-sample-values.md`). Every sample is a body
 * the component's own `read` is handed, and the one body this component could
 * write is an embed naming a file: on the layout editor's canvas there is no
 * vault to resolve one against, so `RenderContext.resource` is absent and the
 * frame draws empty whatever the body says. A sample here would be filler
 * nothing could ever paint — and a member every component must implement and one
 * component can only implement uselessly is a member with a lie in it. So the
 * canvas draws this frame identically with sample values on and off, which is
 * the honest reading: without a vault, this component has nothing to show.
 *
 * **It is not a Card with a path in it.** A Card's value is text the reader types
 * and a formula may read; this publishes nothing at all, because §5's language
 * has no strings — a published path could be compared to nothing and handed to no
 * builtin, and could only be *written*, which is a Pool clamping its bar against
 * a file path (SPEC §13).
 */

import { bodyText, writeBodyText } from '../parse/markdown-body';
import {
	ComponentConfig,
	ComponentDefinition,
	ReadResult,
	showsOwnLabel,
} from '../types';
import { renderPictureFrame } from './picture-frame';

export interface ImageConfig extends ComponentConfig {
	type: 'image';
	hideLabel?: boolean;
}

/**
 * The embed exactly as written, pipe options included.
 *
 * The source line rather than the target, so `![[Portrait.png|200x300]]` survives
 * byte-for-byte: the sheet ignores the hint and markdown view goes on honouring
 * it, and neither has to know what the other does with it.
 *
 * One field, held flat rather than as a delta. PATTERNS §7's rule protects
 * siblings from a commit racing a rebuild, and there is no sibling here.
 */
export interface ImageData {
	source: string;
}

export const image: ComponentDefinition<ImageConfig, ImageData> = {
	type: 'image',
	storage: 'markdown',
	formulaFields: [],
	configFields: [
		{
			key: 'hideLabel',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide the label',
			description:
				'Draws the picture with no caption over it, which is usually right for a portrait. The picture still announces itself by the label to assistive tech, and the note keeps its heading either way.',
			default: false,
		},
	],

	/*
	 * **`read` cannot fail, and that is a correction rather than a simplification.**
	 * It used to refuse a body that is not a usable embed, and a failed `read` never
	 * reaches `render`: `view/grid-cells.ts` replaces the whole cell, so there is no
	 * frame, no label row and **no field**.
	 *
	 * Every other component's read failure comes from a hand-edited note. Image is
	 * the first whose own editing gesture can produce one: type `![](https://…)`
	 * into the field, blur, and the sheet rebuilds into a cell with nothing in it to
	 * edit — the reader is locked out of a value they entered one second ago, and
	 * the only way back is markdown view. It also broke PATTERNS §4 where it matters
	 * most, since the message said "Put a remote picture in a Rich text block
	 * instead" and the reader could not act on it from where they were standing.
	 *
	 * So a body this component cannot use is still a body it can *hold*: `read`
	 * hands it back, the field draws it, and `render` puts the reason in the frame.
	 * That is what the other three failures already did, so all four now land in one
	 * place — which is the outcome `docs/UI.md` §12's error-card row asked for, and
	 * why that row no longer names this component. Constraint 3 is untouched: `write`
	 * returns an unchanged body byte-for-byte whether or not the source is usable.
	 */
	read(body): ReadResult<ImageData> {
		const source = bodyText(body);
		// No section, an empty one, or one holding only blank lines: an editable
		// empty frame, not an error (PATTERNS §4). The first commit writes it.
		if (source === '') return { ok: true, data: null };
		return { ok: true, data: { source } };
	},

	write(data, body): string {
		return writeBodyText(body, data.source);
	},

	/*
	 * No config guard: the one setting this component has is a boolean, so there
	 * is no combination of its configuration without a reading and nothing for a
	 * guard to refuse. Everything that can be wrong here is in the *note*, and
	 * `read` reports it.
	 */
	render(container, config, data, context): void {
		const doc = container.ownerDocument;
		container.replaceChildren();

		const block = doc.createElement('div');
		// The shared box: a component whose size is its placement and not its
		// content (docs/UI.md §9). Its own class beside it carries only what it does
		// differently, which is what goes *inside* the box.
		block.classList.add('sheetsmith-placed', 'sheetsmith-image');
		// The placement, handed to CSS as the frame's own floor. The same property
		// Rich text sets and for the same reason: the picture is out of flow so its
		// intrinsic size contributes nothing, and without a floor derived from the
		// layout the frame would take its height from the file — which is a
		// character's note deciding a box the layout author sized (SPEC §8).
		block.style.setProperty(
			'--sheetsmith-rows',
			String(config.position.height),
		);
		container.appendChild(block);

		// Drawn first, and before any failure, so the name is on screen whichever
		// path raised it. This is what keeps the component out of UI §12's
		// "error card renders without its component name" row.
		const labelled = showsOwnLabel(config, context);
		if (labelled) {
			const label = doc.createElement('div');
			label.classList.add('sheetsmith-component-label', 'sheetsmith-image-label');
			label.textContent = config.label;
			block.appendChild(label);
		}

		const box = doc.createElement('div');
		box.classList.add('sheetsmith-placed-box', 'sheetsmith-image-box');
		block.appendChild(box);

		const status = doc.createElement('div');
		status.classList.add('sheetsmith-sr-only');
		status.setAttribute('aria-live', 'polite');

		/*
		 * The picture, the field, the press and every failure are
		 * `picture-frame.ts`'s, shared with Passport. What stays here is this
		 * component's own chrome: the placed box, the label above it, and the
		 * decisions the painter is *handed* — that the field is named by the
		 * component's own label, since the picture is the whole of what this
		 * component is, and that the picture's `alt` is empty wherever the heading
		 * above it already says the name.
		 *
		 * **It passes no `refuse`**, which is this component's own rule rather than
		 * an omission: a body it cannot use is still a body it can hold, because a
		 * failed `read` never reaches `render` and Image is the first component
		 * whose own editing gesture can produce one (see `read` above).
		 */
		renderPictureFrame(box, {
			classes: {
				frame: 'sheetsmith-image-frame',
				picture: 'sheetsmith-image-picture',
				field: 'sheetsmith-image-input',
			},
			source: data?.source ?? '',
			name: config.label,
			// The visible heading already names it, and saying it twice is worse
			// than saying it once. Where the heading is hidden this is the only
			// name the picture has.
			alt: labelled ? '' : config.label,
			// It cannot say the label twice: this component has no failing `read`
			// any more, so the view never composes a prefix for it, and this is the
			// same branch that decided whether to draw the heading at all.
			prefix: labelled ? null : config.label,
			status,
			...(context.resource === undefined
				? {}
				: { resource: context.resource }),
			onCommit: (next) => context.onChange({ source: next }),
		});

		box.appendChild(status);
	},
};
