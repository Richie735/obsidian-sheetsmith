import { paletteEntries } from '../components';
import type { ComponentConfig } from '../types';

/*
 * One palette entry's prefill, taken from the registry rather than retyped.
 *
 * A case or a sample about an entry has to be the entry. `docs/PATTERNS.md`
 * §1's policy tier is the argument: a prefill is a *set* of keys, so the only
 * thing a guard could assert about a second copy is that it still agrees with
 * the first. Shared here because three callers spelled the lookup — the
 * harness's samples, the canvas preview case and the worked examples — and one
 * of them fell back to `{}` where the others threw.
 *
 * **It throws rather than falling back**, and that is the whole reason it is one
 * spelling. An entry renamed would otherwise spread nothing, and whatever was
 * built on it goes on passing as a bare component of that type: a Computed card
 * renamed away leaves a plain Card whose derived pill reads the same sum, so a
 * case asserting the sum stays green over the wrong configuration.
 *
 * Table's own suite keeps a typed single-type lookup of its own (`prefill` in
 * `table.test.ts`), which returns `Partial<TableConfig>` for the cases that read
 * its keys back; this one returns what every caller here can spread.
 */
export function entryConfig(type: string, name: string): Partial<ComponentConfig> {
	const entry = paletteEntries(type).find((one) => one.name === name);
	if (entry === undefined) {
		throw new Error(
			`No "${name}" entry on ${type}. It was renamed or removed; fix the name here, or this is a bare ${type}.`,
		);
	}
	return entry.config;
}
