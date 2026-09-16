/*
 * A scan, so it is its own file and not a case in `sheet-view.test.ts`: that
 * file runs in `happy-dom`, where `import.meta.url` is not a file URL and
 * nothing can read the source it is asserting about. `pointer-gestures.test.ts`
 * and `create-element-sites.test.ts` are its precedents and stand apart for the
 * same reason.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The completeness property the conditional write rests on, as a check rather
 * than as a thing two reviewers happened to verify by hand.
 *
 * `save` refuses to write unless the view is holding an edit nobody has saved,
 * and that is only sound if **every** assignment to the view's own text buffer
 * maintains the flag. Nothing about the guard says so: a fourth writer added
 * later would compile, pass every case above, and silently make the flag mean
 * less than it claims — either losing a reader's edit or reinstating the stale
 * write the flag exists to refuse. Both reviewers established the property by
 * reading the file; nothing would establish it next round, and this repository's
 * own rule is that a rule worth having is worth checking.
 *
 * **It is a floor, not a proof.** It cannot show that a new writer maintains the
 * flag correctly — only that a new writer exists, which is exactly the moment
 * somebody has to decide. That is the same bargain `pointer-gestures.test.ts`
 * and `create-element-sites.test.ts` strike, and the reason the failure message
 * names the decision rather than the fix.
 *
 * The predicate is narrow on purpose: an assignment, at the start of a
 * statement, outside a comment. A read is not a writer, and the file discusses
 * its own buffer at length in prose — this scan reads source text, comments
 * included, so a wider match would report the explanations as violations.
 */
describe('every writer of the view’s text buffer maintains the flag', () => {
	const SOURCE = readFileSync(
		new URL('./sheet-view.ts', import.meta.url),
		'utf8',
	);

	/** The member a line belongs to, by the last signature seen above it. */
	function writersByMember(): Map<string, number> {
		const found = new Map<string, number>();
		let member = '<file scope>';
		for (const raw of SOURCE.split('\n')) {
			const line = raw.trim();
			// Comment lines are skipped before anything else: the file explains
			// this very rule in prose, and the explanation must not match it.
			if (line.startsWith('*') || line.startsWith('//') || line.startsWith('/*')) {
				continue;
			}
			// One tab of indentation is a class member; the signature is what
			// names the method an assignment below it sits in. A brace walk would
			// be exact, and is not needed while every writer is a method of this
			// one class — which is itself part of what the count below pins.
			const signature = /^\t(?:private |protected |public )?(?:async )?(\w+)\(/.exec(raw);
			if (signature?.[1]) member = signature[1];
			if (/^this\.data\s*=/.test(line)) {
				found.set(member, (found.get(member) ?? 0) + 1);
			}
		}
		return found;
	}

	it('has exactly the three writers the guard was reasoned over', () => {
		// `commit` raises the flag, `setViewData` lowers it only for a new file,
		// and `clear` lowers it outright. A fourth name here means the guard's
		// soundness argument has a case nobody has considered: decide whether the
		// new writer owes the flag, then add it to this list with its reason.
		expect([...writersByMember().keys()].sort()).toEqual([
			'clear',
			'commit',
			'setViewData',
		]);
	});

	it('finds the flag named in each of them', () => {
		// The weaker half, and the only structural thing a scan can say about
		// maintenance: the member that writes the buffer also mentions the flag.
		// It cannot tell a correct maintenance from an incorrect one.
		const members = SOURCE.split(/^\t(?=(?:private |protected |public )?(?:async )?\w+\()/m);
		for (const name of writersByMember().keys()) {
			const body = members.find((chunk) => new RegExp(`^(?:private |protected |public )?(?:async )?${name}\\(`).test(chunk));
			expect(body, `no body found for ${name}`).toBeDefined();
			expect(body, `${name} writes the buffer without naming the flag`).toContain(
				'pendingSave',
			);
		}
	});
});
