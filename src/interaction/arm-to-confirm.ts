/*
 * A control that arms before it fires: the gesture, and the words it says while
 * it is armed.
 *
 * `docs/UI.md` §9's rule — the first press takes a warning tint, marks what it
 * would take and names it; the second applies it — and §12's reason, from the
 * Pool's typed-amount reversal: where a control's input is not its outcome, the
 * outcome has to be on screen before it is applied, and an irreversible outcome
 * is the strongest case of it. The shared confirmation is not available to reach
 * for either: `ConfirmModal` takes an `App` and `RenderContext` carries no route
 * to one, so a component's only confirmation surface is the card itself.
 *
 * **Two consumers, and it is extracted anyway.** PATTERNS §1's ladder shares on
 * the third and allows duplication at two *under a test driving both copies* —
 * and no such test existed: Table's cases and Record set's cases each drove their
 * own copy over their own gesture, which is the one arrangement §1 does not
 * permit. What was duplicated is about seventy-five lines in which every line is
 * a rule with a reason, and three of those reasons are invisible in review: the
 * outside press is in *capture* so a swallowed press still counts, the listener
 * is written to survive being orphaned by a rebuild, and the control stands
 * itself down *before* the write rather than leaving a listener alive on a row
 * that is going.
 *
 * **The class names stay with the caller**, which is PATTERNS §1's rule from the
 * pool's gesture engine: a module in `interaction/` is handed
 * `'sheetsmith-table-remove-armed'` rather than naming a table itself. So is the
 * live region, the label, and what the second press actually does.
 *
 * **The two sentences are here as well, and that is a third consumer rather than
 * a second.** `components/modifier-form.ts`'s **Remove** arms too, and its armed
 * state is the panel's rather than a closure's — it survives a rebuild and
 * redraws through it — so it cannot take the gesture below. What it shares is the
 * *wording*, which is a policy: the mark deliberately does not change when a
 * control arms, because the column is as wide as its content and relabelling in
 * place would move the table under the finger already resting on it. The words
 * are therefore the whole of what says a press is about to be irreversible, and
 * three copies of them is three chances for a design pass to soften one and leave
 * the other two. `components/isolation.test.ts` scans for both clauses.
 *
 * The verb is not a parameter. Both consumers of the gesture delete something,
 * and §1 does not generalise ahead of the evidence; a second verb parameterises
 * `STOOD_DOWN` and nothing else here.
 */

/**
 * What an armed control is called, for a reader who cannot see the tint.
 *
 * Takes the whole name rather than a subject and a verb, because the three
 * callers name themselves differently — "Delete Chalk", "Remove all 2" — and the
 * shared half is the clause after it.
 */
export function armedName(named: string): string {
	return `${named}. Select again to confirm.`;
}

/** What an armed control announces once, at the moment it arms. */
export function armedPrompt(named: string): string {
	return `${named}? Select again to confirm.`;
}

/** What a control that stood down without firing says. */
export const STOOD_DOWN = 'Delete cancelled';

/**
 * Which control on one component is armed, as the function that disarms it.
 *
 * One register per render rather than one per module: arming a second control has
 * to stand the first one down — two rows armed at once is two rows about to go,
 * and only one of them is — and that is a fact about one card rather than about
 * the page. A `let` in the caller's render closure would work equally well and is
 * what both copies had; this is here so the caller does not also have to
 * remember to clear it, which is the half `disarm` below owns.
 */
export interface ArmRegister {
	armed: (() => void) | null;
}

export function armRegister(): ArmRegister {
	return { armed: null };
}

export interface ArmToConfirmOptions {
	/** The glyph-only button that arms, then fires. */
	button: HTMLElement;
	/** The row or record it is about, tinted while armed. */
	row: HTMLElement;
	/** The caller's class for the armed control, and for the row it marks. */
	armedClass: string;
	rowClass: string;
	/**
	 * What the control is called, as a reader sees it — "Delete Chalk". The
	 * accessible name and the `title` are built from it, and the announcement is
	 * the only place the reader is told what the second press will take.
	 */
	named: string;
	/** Say something through the caller's own live region. */
	announce: (said: string) => void;
	/** Apply it. Called on the second press and never on the first. */
	commit: () => void;
	/** Which control on this component is armed. */
	register: ArmRegister;
	/** The document to hang the outside-press listener on. */
	doc: Document;
}

export function bindArmToConfirm(options: ArmToConfirmOptions): void {
	const { button, row, named, announce, register, doc } = options;
	let ready = false;

	const paint = (): void => {
		button.classList.toggle(options.armedClass, ready);
		row.classList.toggle(options.rowClass, ready);
		// The mark itself never changes: the column is as wide as its content, so a
		// control that relabelled or redrew itself in place would move the list
		// under the finger already resting on it — the mistake the pool's amount
		// panel was reversed over. The naming is the tooltip, the accessible name
		// and the announcement.
		button.setAttribute('aria-label', ready ? armedName(named) : named);
		button.setAttribute('title', ready ? `${named}?` : named);
	};

	/** Removes the outside-press listener, while there is one. */
	let standDown: (() => void) | null = null;

	const disarm = (): void => {
		if (!ready) return;
		ready = false;
		if (register.armed === disarm) register.armed = null;
		standDown?.();
		standDown = null;
		paint();
	};

	button.addEventListener('click', () => {
		if (ready) {
			// The gesture is over, so it stands itself down before the write rather
			// than leaving a listener alive on a row that is going. The first press
			// wrote nothing, so this is the first byte the gesture changes.
			disarm();
			options.commit();
			return;
		}
		// Arming one control stands another down.
		register.armed?.();
		ready = true;
		register.armed = disarm;
		/*
		 * The next press anywhere else is a change of mind.
		 *
		 * This is what a finger has instead of moving focus away: there is no touch
		 * gesture for that at all, and WebKit does not focus a button on tap in any
		 * case, so `blur` alone would leave a phone armed with no way to take it
		 * back — the two-step reduced to one on exactly the input that has no hover
		 * to warn it. In capture, so a press something else swallows still counts as
		 * the reader moving on: the same dismissal `popover.ts` makes.
		 *
		 * A press *inside* the control is the second press and must reach the click.
		 * The invisible hit target is part of the button, so a press on the padding
		 * around the glyph counts as inside it.
		 */
		const outside = (event: Event): void => {
			if (button.contains(event.target as Node | null)) return;
			disarm();
			announce(STOOD_DOWN);
		};
		doc.addEventListener('pointerdown', outside, true);
		// A rebuild while a control is armed has no way to disarm it — a component
		// gets no unload — so the listener is written to survive being orphaned:
		// the next press anywhere lands outside a detached button, disarms it, and
		// takes the listener with it.
		standDown = () => doc.removeEventListener('pointerdown', outside, true);
		paint();
		announce(armedPrompt(named));
	});
	// A keyboard has both of the gestures a finger does not: focus moves off the
	// control, and Escape. Both leave the note exactly as it was.
	button.addEventListener('blur', disarm);
	button.addEventListener('keydown', (event) => {
		if (event.key !== 'Escape' || !ready) return;
		disarm();
		announce(STOOD_DOWN);
	});
	paint();
}
