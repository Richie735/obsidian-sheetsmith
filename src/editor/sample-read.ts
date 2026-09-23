/*
 * What a component reads with no character behind it.
 *
 * Two consumers draw a layout's components where there is no note: the layout
 * editor's canvas, and the component picker's preview
 * (`docs/features/component-picker.md` §5). What they share is a **policy** —
 * a container reads nothing, a sample is read through the component's own
 * `read`, and a component with no sample reads an empty section — so it climbs
 * `docs/PATTERNS.md` §1's ladder in one step. Two copies could only be tested
 * for still agreeing, and the drift that matters is invisible: a preview drawn
 * one way and the canvas the other would show an author a component that is
 * not the one the canvas then draws.
 *
 * It is also the one place a `sample` is called (`contract.test.ts` scans for
 * that), because a sample is filler and a path reaching a character note with
 * one in it would be writing invented data into a file somebody owns.
 *
 * It has an entry point and a reportable output, so it has a test file of its
 * own (`docs/PATTERNS.md` §10), beside the drawings its two consumers' tests
 * make of it.
 */

import { ReadComponent } from '../formula/sheet';
import { ComponentConfig, isContainer } from '../types';
import { getComponent } from '../components';

/**
 * Read one component the way a drawing with no note behind it does: the body
 * it says a section of itself would hold where `filled`, or an empty section —
 * exactly as a fresh note's is (`docs/PATTERNS.md` §4) — where not. A config
 * error — a Table's duplicate column key — is not a data question and surfaces
 * from the same call either way, since a component's own `read` checks its
 * config before it ever looks at a body.
 *
 * The body goes through the component's own `read`, so what is drawn is
 * exactly what a note holding that text would draw, and everything downstream
 * — `renderGrid`, `buildSheet`, `resolveFormulaFields` — is handed the same
 * shapes a sheet is (`docs/features/preview-sample-values.md` §5). A component
 * with no sample of its own (Image) reads identically either way, which is the
 * honest reading of a component that needs a vault.
 */
export function readSample(config: ComponentConfig, filled: boolean): ReadComponent {
	const component = getComponent(config.type);
	if (!component || isContainer(component)) {
		return { config, component, data: null, error: null };
	}
	const body = filled ? (component.sample?.(config) ?? '') : '';
	const result = component.read(body, config);
	return {
		config,
		component,
		data: result.ok ? result.data : null,
		error: result.ok ? null : result.error,
	};
}
