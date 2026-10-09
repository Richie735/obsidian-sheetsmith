// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordSet, RecordSetConfig } from './components/record-set';
import { Canvas } from './editor/canvas';
import { renderComponentPreview } from './editor/component-preview';
import { pickerCatalog } from './editor/picker-catalog';
import { NO_ENV } from './formula/resolve';
import { note, sheetOn } from './test/sheet-on-note';
import { ComponentConfig, RenderContext, ResetContext } from './types';
import { planTrigger } from './view/reset-plan';

/*
 * Every production host hands a component the members that evaluate an
 * expression it holds in its data (`docs/features/record-ceiling-formula.md`).
 *
 * **Optional in the type, required of every host, and this is what holds the
 * second half.** `RenderContext.resolveExpression` and its explainer are
 * optional so eighty hand-built test contexts need not grow them, and that
 * leaves exactly one failure nothing else would see: a host that drops one. A
 * record's ceiling would then draw `?` on every formula, with a sentence saying
 * there is no sheet — on a sheet — and only a reader would notice.
 *
 * So each host is driven through its real entry point, with a probe that records
 * the context the component is handed: the probe is Record set's own `render`
 * and `applyReset`, spied on rather than replaced, because a fake component in
 * the registry is the arrangement `docs/BACKLOG.md` refuses. Each member must be
 * a function and must evaluate `1 + 1` to 2, so a stub that returns null fails
 * as surely as an absent one.
 *
 * **A file of its own at `src/`**, on `formula-field-coverage.test.ts`'s
 * argument: it guards hosts in three folders and belongs to none of them. The
 * harness goes through `formulaContext` too, and is not here because it is a
 * development tool rather than a production host.
 */

const LIST: Partial<RecordSetConfig> = {
	type: 'record-set',
	label: 'Features',
	fields: [{ key: 'Uses', type: 'number', maxSource: 'record' }],
};

/** Every render context the spy saw for a Record set, as the host built it. */
function probeRenders(): RenderContext[] {
	const seen: RenderContext[] = [];
	const real = recordSet.render.bind(recordSet);
	vi.spyOn(recordSet, 'render').mockImplementation(
		(container, config, data, context) => {
			seen.push(context as RenderContext);
			real(container, config, data, context);
		},
	);
	return seen;
}

function expectEvaluates(context: RenderContext | undefined): void {
	expect(context, 'the host rendered no Record set').toBeDefined();
	expect(typeof context?.resolveExpression).toBe('function');
	expect(typeof context?.explainExpression).toBe('function');
	expect(context?.resolveExpression?.('1 + 1', {})).toBe(2);
	expect(context?.explainExpression?.('1 + 1', {})).toBeNull();
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('every production host supplies the expression readers', () => {
	it('the sheet view', async () => {
		const seen = probeRenders();
		await sheetOn(
			{ id: 'features', ...LIST },
			note(['Features', '\n### Rage\n```sheet\nUses: 1 / 2\n```\n']),
		);
		expectEvaluates(seen.at(-1));
	});

	it("the layout editor's canvas", () => {
		const seen = probeRenders();
		const host = {
			persist: () => undefined,
			persistSoon: () => undefined,
			syncPositionFields: () => undefined,
			select: () => undefined,
			selection: '',
			sampleValues: true,
		};
		const config = {
			id: 'features',
			position: { col: 1, row: 1, width: 6, height: 3 },
			...LIST,
		} as ComponentConfig;
		new Canvas(host).draw(document.createElement('div'), {
			name: 'Coverage',
			components: [config],
		});
		expectEvaluates(seen.at(-1));
	});

	it("the component picker's preview", () => {
		const seen = probeRenders();
		const choice = pickerCatalog().find(
			(one) => one.type === 'record-set' && !one.entry,
		);
		if (choice === undefined) throw new Error('no Record set in the picker');
		renderComponentPreview(document.createElement('div'), choice);
		expectEvaluates(seen.at(-1));
	});

	it("a reset trigger's plan", () => {
		const seen: ResetContext[] = [];
		const real = recordSet.applyReset?.bind(recordSet);
		if (real === undefined) throw new Error('Record set resets');
		vi.spyOn(recordSet, 'applyReset').mockImplementation(
			(data, config, binding, context) => {
				seen.push(context);
				return real(data, config, binding, context);
			},
		);
		const config = {
			id: 'features',
			position: { col: 1, row: 1, width: 6, height: 3 },
			...LIST,
			reset: [{ trigger: 'Long rest', action: 'empty' }],
		} as ComponentConfig;
		const read = recordSet.read(
			'\n### Rage\n```sheet\nUses: 1 / 2\n```\n',
			config as RecordSetConfig,
		);
		if (!read.ok) throw new Error(read.error);
		planTrigger(
			'Long rest',
			[{ config, component: recordSet, error: null, data: read.data }],
			NO_ENV,
		);
		const context = seen.at(-1);
		expect(context, 'the plan reset no Record set').toBeDefined();
		expect(typeof context?.resolveExpression).toBe('function');
		expect(context?.resolveExpression?.('1 + 1', {})).toBe(2);
	});
});
