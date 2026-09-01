/*
 * The sample body a component says a section of itself would hold, for the
 * tests that drive one (`docs/features/preview-sample-values.md`).
 *
 * **Extracted because six component test files had a copy of it, doc comment
 * and all** — past PATTERNS §1's extract-at-three by twice over, and the same
 * shape `src/test/pointer.ts` was extracted into for the same reason. What is
 * shared is not much code; it is the *reason* the code exists, which is the half
 * §1 names: `sample` is optional on the contract, so a call site has to say what
 * it means by calling it, and six files each answering that in their own words
 * is six places for the answer to drift.
 *
 * **It throws rather than returning an empty string**, which is the whole of
 * what the wrapper buys over `component.sample?.(config) ?? ''`. A component
 * that stopped declaring a sample would make every assertion in a case like
 * "fills nothing where the layout names no entry" pass by describing a member
 * that is no longer there. Optionality is a fact about the *contract*; inside a
 * case that exists to drive one component's filler it is a fault.
 *
 * `src/test/` rather than beside a component, on `pointer.ts`'s own argument:
 * §2 names this folder for scaffolding, and no component owns a helper every
 * component's test uses. Generic over the definition, so the config argument is
 * still checked against that component's own `TConfig` — a `CardConfig` where
 * the component is `card` — and nothing about the extraction loosens a type.
 */

import { ComponentConfig, ComponentDefinition } from '../types';

export function sampleOf<TConfig extends ComponentConfig, TData>(
	component: ComponentDefinition<TConfig, TData>,
	config: TConfig,
): string {
	if (component.sample === undefined) {
		throw new Error(`"${component.type}" declares no sample`);
	}
	return component.sample(config);
}
