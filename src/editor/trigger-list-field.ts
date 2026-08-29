/*
 * The layout's reset triggers (SPEC §6, §7), as a field in the layout editor.
 *
 * A textarea, one name per line: a trigger list is read as a set, a 5e layout's
 * is two lines, and the order they are written in is the order their buttons
 * appear. It renders in the panel, under the layout's own row in the tree.
 *
 * A name that cannot be used is reported here rather than refused at load,
 * exactly as an unparseable function definition is: the sheets on this layout go
 * on rendering while it is fixed. Bindings pointing at nothing are reported here
 * too, since this is the one place with the whole picture — a component's own
 * form repeats only the problem that belongs to it.
 *
 * **The form itself is `line-list-field.ts`.** This module is what that one
 * cannot know: the layout key, the copy, and how a trigger list is read. The two
 * were near-identical modules until a measurement showed they shared 72 stripped
 * lines and differed in a key, a parse call and eight strings; the argument, and
 * why the function library is *not* a third consumer, is in that file's header.
 */

import {
	commitLineList,
	LineListField,
	LineListSpec,
	renderLineList,
} from './line-list-field';
import { Layout } from '../parse/layout';
import { parseTriggers } from '../parse/triggers';

/**
 * A sample name for the field. A constant rather than prose because it is a name
 * an author types, and sentence case would make it a different one.
 */
const TRIGGER_EXAMPLE = 'Short rest';
const TRIGGER_PLACEHOLDER = 'Long rest';

/** Everything the shared field cannot work out for itself. */
function spec(layout: Layout): LineListSpec {
	return {
		key: 'triggers',
		heading: 'Reset triggers',
		description:
			'The named events this layout resets on, one per line, in the order their buttons appear on a sheet. A component binds to one in its own settings above.',
		example: TRIGGER_EXAMPLE,
		placeholder: TRIGGER_PLACEHOLDER,
		className: 'sheetsmith-trigger-list',
		token: 'trigger-list',
		problemsId: 'sheetsmith-trigger-problems',
		noun: 'trigger',
		// Closed over the layout, which is what lets the shared field stay ignorant
		// of the fact that this parser wants the whole thing where the other wants
		// a list.
		read: (names) => {
			const { names: usable, problems } = parseTriggers({
				...layout,
				triggers: [...names],
			});
			// A binding's problem belongs to a component; the shared field names
			// the member for the job rather than for either producer.
			return {
				usable,
				problems: problems.map(({ message, component }) => ({
					message,
					...(component !== undefined ? { locator: component } : {}),
				})),
			};
		},
	};
}

/** Kept as a name of its own, so the pane and its tests read as they did. */
export type TriggerListField = LineListField;

export type TriggerListContext = Parameters<typeof renderLineList>[3];

export function commitTriggerList(field: TriggerListField | null): boolean {
	return commitLineList(field);
}

export function renderTriggerList(
	container: HTMLElement,
	layout: Layout,
	context: TriggerListContext,
): TriggerListField {
	return renderLineList(container, layout, spec(layout), context);
}
