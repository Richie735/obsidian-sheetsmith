/*
 * Formula expressions (SPEC §5).
 *
 * A real tokenizer and recursive descent parser, never eval(): layouts are
 * shareable files, so evaluating them as code would be an injection vector.
 *
 * This is the expression core: it evaluates one expression against a
 * name-lookup scope, and calls the layout's own functions. The syntax those
 * functions are written in lives in functions.ts, which parses definitions
 * into the FunctionLibrary this module evaluates against.
 */

import { NO_ROWS, RowLookup } from './rows';

export type Value = number | boolean | string;

/** Resolves a referenced name, or undefined when nothing has that name. */
export type Scope = (name: string) => Value | undefined;

/** A scope holding nothing, for the paths that have no sheet around them. */
export const EMPTY_SCOPE: Scope = () => undefined;

/**
 * A parsed expression. Opaque: hold one, hand it back to evaluateExpression.
 * Function bodies are parsed once when the library is built rather than on
 * every call, which is also what catches a syntax error while the user is
 * looking at the definition instead of at a card reading "?".
 */
export type Expression = Node;

/** One function the layout defines (SPEC §5). */
export interface FunctionDefinition {
	name: string;
	params: readonly string[];
	body: Expression;
}

/** The layout's function library, by function name. */
export type FunctionLibrary = ReadonlyMap<string, FunctionDefinition>;

/** For every path that has no layout around it. */
export const NO_FUNCTIONS: FunctionLibrary = new Map();

/**
 * Where a sum stops being exact.
 *
 * Sums are floating point, so a column of tenths would otherwise read
 * 0.30000000000000004; past six decimals is not a weight anyone typed.
 *
 * A function rather than the bare number, because the number was never the
 * duplication worth removing: two callers round — a Table's own total under the
 * column, and `sum()` over the same rows — and sharing only the constant left
 * `Math.round(x * P) / P` written out at both, which drifts by a `floor` or a
 * missing divide. The feature spec expected both call sites to be inside
 * table.ts, and one of them cannot be: the aggregate's loop evaluates an
 * expression per row in the row's own scope, so it lives in the evaluator. That
 * makes this the one thing crossing the boundary, which is the smallest thing
 * that can (PATTERNS §1's policy tier, applied to the policy rather than to its
 * constant).
 */
export function roundSum(total: number): number {
	return Math.round(total * TOTAL_PRECISION) / TOTAL_PRECISION;
}

/** The precision `roundSum` holds to. Read it there rather than applying it. */
const TOTAL_PRECISION = 1e6;

interface Builtin {
	/** Fixed argument count, or null for "one or more". */
	arity: number | null;
	apply: (args: number[]) => number;
}

/**
 * The standard helpers (SPEC §5), as a table rather than a switch so that the
 * reserved list below can be derived from it.
 *
 * A Map, not an object, and for the same reason the field resolver spells out
 * its own-property check: a formula naming `constructor` or `toString` must
 * fall through to "unknown function", not find something inherited from
 * Object.prototype and be told its arity is wrong. Keyed the way
 * `FunctionLibrary` already is, so a lookup here and a lookup there behave
 * alike.
 *
 * Every entry takes numbers and returns one; a helper needing anything else
 * would be a different shape and should say so rather than widen this.
 */
const BUILTINS: ReadonlyMap<string, Builtin> = new Map<string, Builtin>([
	['floor', { arity: 1, apply: (args) => Math.floor(args[0] as number) }],
	['ceil', { arity: 1, apply: (args) => Math.ceil(args[0] as number) }],
	['round', { arity: 1, apply: (args) => Math.round(args[0] as number) }],
	['abs', { arity: 1, apply: (args) => Math.abs(args[0] as number) }],
	['min', { arity: null, apply: (args) => Math.min(...args) }],
	['max', { arity: null, apply: (args) => Math.max(...args) }],
]);

/**
 * Names a layout function may not take, since a formula reading `floor` must
 * mean the one thing everywhere (SPEC §5).
 *
 * Derived from the table above rather than listed beside it: two lists that
 * must agree eventually will not, and the failure is silent — a helper added
 * to one but not the other becomes a name a layout can shadow, which is the
 * rule this constant exists to enforce. Only the names that are not table
 * entries are written out, and each says why it is not one.
 */
export const RESERVED_NAMES: readonly string[] = [
	...BUILTINS.keys(),
	// Lazy in its branches, so evalNode handles it rather than callBuiltin.
	'if',
	// Lazy in every argument but the first, which is not a value at all: the
	// aggregates evaluate their arguments once per row, in the row's own scope.
	// evalNode handles them for the same reason it handles `if`.
	'sum',
	'count',
	// Literals the parser reads before it looks any name up.
	'true',
	'false',
];

/**
 * Whether a formula could reference this text as a name.
 *
 * One segment, not a dotted path: the callers are naming *part* of a reference —
 * a component's id, or a value it publishes as `<id>.<name>` — and a dot inside
 * one of those would publish a name with more segments than the contract has,
 * able to collide with the `.value` every entry already answers to.
 *
 * Asked here rather than restated by each caller. A hyphen is the trap this
 * exists for: `armour-class` tokenises as `armour` minus `class`, so the name
 * reads as arithmetic over two names that do not exist and the formula fails a
 * long way from the actual mistake.
 */
export function isName(text: string): boolean {
	return ONE_NAME.test(text);
}

/**
 * What an expression may reach beyond the scope it is evaluated in. Every
 * member is optional and every one has an empty answer, because the paths with
 * no layout and no sheet around them are real: a component rendered on its own,
 * a formula in a test.
 */
export interface FunctionEnv {
	/** The layout's own functions (SPEC §5). */
	library?: FunctionLibrary;
	/**
	 * What a function body sees besides its own parameters: the sheet, and
	 * never the scope of whoever called it. A function is not a macro —
	 * `mod(score)` must mean the same arithmetic on every card, not quietly
	 * read the `value` of the one that happened to call it.
	 */
	base?: Scope;
	/**
	 * The rows an aggregate may walk, by component id. Absent where there is no
	 * sheet around the expression, and then every aggregate fails saying the
	 * table it named is not on the sheet — which is the truth there.
	 */
	rows?: RowLookup;
	/**
	 * Never set, and here only so the compiler refuses a `FormulaEnv` passed
	 * where this is wanted.
	 *
	 * The two share `library` and `rows`, and `base` is optional, so without
	 * this the sheet-wide environment satisfies this one structurally with its
	 * `sheet` ignored as an excess property and `base` silently absent — and a
	 * function body would then see nothing where production hands it the whole
	 * sheet. Nothing would fail until a body read a name off the sheet, and then
	 * it would fail in a way it cannot fail in the app. `callsFrom` in resolve.ts
	 * is the conversion; this is what makes reaching for it obligatory rather
	 * than remembered.
	 */
	sheet?: never;
}

/** Library, body scope, and the guard against a function that calls itself. */
interface Runtime {
	library: FunctionLibrary;
	base: Scope;
	rows: RowLookup;
	active: Set<string>;
}

export class FormulaError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FormulaError';
	}
}

type Token =
	| { kind: 'number'; value: number }
	| { kind: 'name'; value: string }
	| { kind: 'op'; value: string }
	| { kind: 'end' };

type Node =
	| { kind: 'num'; value: number }
	| { kind: 'bool'; value: boolean }
	| { kind: 'name'; name: string }
	| { kind: 'call'; name: string; args: Node[] }
	| { kind: 'unary'; op: string; operand: Node }
	| { kind: 'binary'; op: string; left: Node; right: Node };

const TWO_CHAR_OPS = ['<=', '>=', '==', '!=', '&&', '||'];
const ONE_CHAR_OPS = '+-*/%(),<>!';
const NUMBER = /^\d+(\.\d+)?/;

/**
 * One segment of a name: a letter or an underscore, then letters, digits and
 * underscores (SPEC §5). Built once and shared, rather than written out in each
 * of the three forms below, because this is the grammar every referencable name
 * in the plugin is measured against — a component id, a published value, a
 * column total — and three copies of it drift into three different answers to
 * "what can a formula read?".
 */
const SEGMENT = '[A-Za-z_][A-Za-z0-9_]*';

/** A name, or a dotted path of them: `prof`, `abilities.DEX.value`. */
const NAME = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})*`);

const ONE_NAME = new RegExp(`^${SEGMENT}$`);

function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let rest = source;
	while (rest.length > 0) {
		const trimmed = rest.replace(/^\s+/, '');
		if (trimmed === '') break;
		rest = trimmed;

		const number = NUMBER.exec(rest);
		if (number) {
			tokens.push({ kind: 'number', value: Number(number[0]) });
			rest = rest.slice(number[0].length);
			continue;
		}
		const name = NAME.exec(rest);
		if (name) {
			tokens.push({ kind: 'name', value: name[0] });
			rest = rest.slice(name[0].length);
			continue;
		}
		const two = rest.slice(0, 2);
		if (TWO_CHAR_OPS.includes(two)) {
			tokens.push({ kind: 'op', value: two });
			rest = rest.slice(2);
			continue;
		}
		const one = rest[0] as string;
		if (ONE_CHAR_OPS.includes(one)) {
			tokens.push({ kind: 'op', value: one });
			rest = rest.slice(1);
			continue;
		}
		throw new FormulaError(`Unexpected character "${one}" in formula.`);
	}
	tokens.push({ kind: 'end' });
	return tokens;
}

class Parser {
	private tokens: Token[];
	private pos = 0;

	constructor(tokens: Token[]) {
		this.tokens = tokens;
	}

	private peek(): Token {
		return this.tokens[this.pos] as Token;
	}

	private takeOp(...ops: string[]): string | null {
		const token = this.peek();
		if (token.kind === 'op' && ops.includes(token.value)) {
			this.pos++;
			return token.value;
		}
		return null;
	}

	private expectOp(op: string): void {
		if (this.takeOp(op) === null) {
			throw new FormulaError(`Expected "${op}" in formula.`);
		}
	}

	parse(): Node {
		const node = this.parseOr();
		if (this.peek().kind !== 'end') {
			throw new FormulaError('Unexpected trailing input in formula.');
		}
		return node;
	}

	private parseOr(): Node {
		let left = this.parseAnd();
		let op;
		while ((op = this.takeOp('||')) !== null) {
			left = { kind: 'binary', op, left, right: this.parseAnd() };
		}
		return left;
	}

	private parseAnd(): Node {
		let left = this.parseComparison();
		let op;
		while ((op = this.takeOp('&&')) !== null) {
			left = { kind: 'binary', op, left, right: this.parseComparison() };
		}
		return left;
	}

	private parseComparison(): Node {
		let left = this.parseAdditive();
		let op;
		while ((op = this.takeOp('==', '!=', '<=', '>=', '<', '>')) !== null) {
			left = { kind: 'binary', op, left, right: this.parseAdditive() };
		}
		return left;
	}

	private parseAdditive(): Node {
		let left = this.parseMultiplicative();
		let op;
		while ((op = this.takeOp('+', '-')) !== null) {
			left = { kind: 'binary', op, left, right: this.parseMultiplicative() };
		}
		return left;
	}

	private parseMultiplicative(): Node {
		let left = this.parseUnary();
		let op;
		while ((op = this.takeOp('*', '/', '%')) !== null) {
			left = { kind: 'binary', op, left, right: this.parseUnary() };
		}
		return left;
	}

	private parseUnary(): Node {
		const op = this.takeOp('-', '!');
		if (op !== null) {
			return { kind: 'unary', op, operand: this.parseUnary() };
		}
		return this.parsePrimary();
	}

	private parsePrimary(): Node {
		const token = this.peek();
		if (token.kind === 'number') {
			this.pos++;
			return { kind: 'num', value: token.value };
		}
		if (token.kind === 'name') {
			this.pos++;
			if (token.value === 'true') return { kind: 'bool', value: true };
			if (token.value === 'false') return { kind: 'bool', value: false };
			if (this.takeOp('(') !== null) {
				const args: Node[] = [];
				if (this.takeOp(')') === null) {
					do {
						args.push(this.parseOr());
					} while (this.takeOp(',') !== null);
					this.expectOp(')');
				}
				return { kind: 'call', name: token.value, args };
			}
			return { kind: 'name', name: token.value };
		}
		if (token.kind === 'op' && token.value === '(') {
			this.pos++;
			const inner = this.parseOr();
			this.expectOp(')');
			return inner;
		}
		throw new FormulaError('Expected a value in formula.');
	}
}

function asNumber(value: Value, context: string): number {
	if (typeof value !== 'number') {
		throw new FormulaError(`${context} needs a number, got "${String(value)}".`);
	}
	return value;
}

function asBoolean(value: Value, context: string): boolean {
	if (typeof value !== 'boolean') {
		throw new FormulaError(`${context} needs true or false, got "${String(value)}".`);
	}
	return value;
}

function callBuiltin(name: string, args: Value[]): Value {
	const builtin = BUILTINS.get(name);
	if (!builtin) throw new FormulaError(`Unknown function "${name}".`);
	// Arity before coercion, so calling floor() with nothing says so rather
	// than complaining about a missing argument's type.
	if (builtin.arity === null) {
		if (args.length === 0) {
			throw new FormulaError(`${name}() needs at least one argument.`);
		}
	} else if (args.length !== builtin.arity) {
		throw new FormulaError(
			`${name}() takes ${builtin.arity} argument${builtin.arity === 1 ? '' : 's'}.`,
		);
	}
	return builtin.apply(args.map((arg) => asNumber(arg, `${name}()`)));
}

/**
 * Call a layout-defined function.
 *
 * The body runs in a scope of its own: parameters first, then the sheet.
 * Nothing of the caller's leaks in, which is what makes a function library
 * a library rather than a set of text substitutions.
 */
function callDefined(
	definition: FunctionDefinition,
	args: Value[],
	rt: Runtime,
): Value {
	const { name, params } = definition;
	if (args.length !== params.length) {
		throw new FormulaError(
			`${name}() takes ${params.length} argument${params.length === 1 ? '' : 's'}, got ${args.length}.`,
		);
	}
	if (rt.active.has(name)) {
		// SPEC §5 wants cycles caught when the layout is saved. This is the
		// runtime floor under that: a function needing its own result reports
		// it, rather than recursing until the stack goes and takes the app
		// with it. Mutual recursion is caught by the same set.
		throw new FormulaError(`Function "${name}" is defined in terms of itself.`);
	}
	const frame = new Map<string, Value>();
	params.forEach((param, index) => frame.set(param, args[index] as Value));
	const scope: Scope = (lookup) =>
		frame.has(lookup) ? frame.get(lookup) : rt.base(lookup);

	rt.active.add(name);
	try {
		return evalNode(definition.body, scope, rt);
	} finally {
		rt.active.delete(name);
	}
}

/**
 * How many arguments each aggregate takes, and what to say when it was given
 * some other number.
 *
 * `sum(<table>, <expression>, [<condition>])` and `count(<table>,
 * [<condition>])`. Written out per aggregate rather than derived from a shape,
 * because the message is the whole value of the entry: "takes 2 or 3
 * arguments" names the fault, and PATTERNS §4 wants the fix.
 */
interface Aggregate {
	/** Arguments before the optional condition, the component reference included. */
	least: number;
	wrongCount: string;
}

const AGGREGATES: ReadonlyMap<string, Aggregate> = new Map<string, Aggregate>([
	[
		'sum',
		{
			least: 2,
			wrongCount:
				'sum() takes a table, what to add up, and optionally a condition.',
		},
	],
	[
		'count',
		{ least: 1, wrongCount: 'count() takes a table, and optionally a condition.' },
	],
]);

/**
 * Restate a row's failure as the row a reader sees, plus what went wrong.
 *
 * One row out of nine with an unreadable cell fails the whole aggregate, which
 * is `columnTotal`'s existing rule — reporting the row beats adding up the
 * rest, because a quietly wrong number is worse than a missing one — and the
 * only thing that rule needs from here is which row.
 *
 * The inner message loses its capital, because it is a clause now rather than a
 * sentence: `Row "Dagger": Unknown name "Wieght".` reads as two sentences run
 * into one.
 */
function inRow(label: string, error: unknown): FormulaError {
	const said = error instanceof FormulaError ? error.message : String(error);
	return new FormulaError(inRowMessage(label, said));
}

/**
 * The naming itself, without an error to wrap.
 *
 * Exported because a second thing now has to say which row stopped it: a
 * modifier slot refuses when one row's amount will not resolve, and it holds a
 * reason rather than a thrown error (`formula/modifiers.ts`). Two spellings of
 * one sentence is PATTERNS §1's policy tier — the only thing a guard test over
 * them could assert is that they still read alike — so `inRow` is now this plus
 * a `FormulaError`.
 */
export function inRowMessage(label: string, said: string): string {
	return `Row "${label}": ${said.charAt(0).toLowerCase()}${said.slice(1)}`;
}

/**
 * sum() and count() over the rows a component holds (SPEC §5).
 *
 * Handled here rather than in the BUILTINS table for the reason `if` is: every
 * argument but the first is evaluated once per row, in a scope the row provides,
 * so the caller must not evaluate any of them.
 *
 * **Argument 1 is a component reference, not a value.** It is read out of the
 * parse tree as identifier text and never resolved through the name table, so
 * this is the one position in the language where one text has two meanings. The
 * alternative is a string literal, which is what the closest prior art uses
 * precisely to avoid the exception — and the tokenizer has no quote handling at
 * all, so adding string literals to the grammar for one argument is a larger and
 * more permanent tax, on top of making that argument look like the one thing
 * the prior art is unanimous against: a language inside a string.
 *
 * **Nothing here is collection-valued.** A row set lives for the duration of
 * this frame, is never a `Value`, and so has no way to reach a card, a
 * published name, or a note. That is the whole guard, and it is why `Value`
 * stays `number | boolean | string`: a `Value` in this codebase is one typo
 * from `applyReset` writing it into a file, and a Pool whose max is a list
 * clamps its bar against a list and restores to one.
 */
function evalAggregate(
	name: string,
	shape: Aggregate,
	args: readonly Node[],
	scope: Scope,
	rt: Runtime,
): Value {
	if (args.length < shape.least || args.length > shape.least + 1) {
		throw new FormulaError(shape.wrongCount);
	}
	const table = args[0] as Node;
	if (table.kind !== 'name' || table.name.includes('.')) {
		throw new FormulaError(
			name === 'sum'
				? 'sum() names a table first, then what to add up: sum(inventory, Weight).'
				: 'count() names a table first: count(inventory).',
		);
	}
	const found = rt.rows(table.name, name);
	if ('error' in found) throw new FormulaError(found.error);

	// count() has no expression to add up: each row it keeps is worth one.
	const each = name === 'sum' ? (args[1] as Node) : null;
	const condition = args[shape.least];

	let total = 0;
	for (const row of found.rows) {
		// The row is the nearest scope there is, nearer than a function's own
		// parameters: `load(Weight) = sum(inventory, Weight)` sums the column
		// rather than the parameter. A row expression that could not see a column
		// because a parameter happened to share its name is the harder surprise,
		// and SPEC §5's "means the same arithmetic wherever it is called" is not
		// threatened, because the table is named in the same expression as the
		// shadowing.
		const inner: Scope = (lookup) =>
			Object.hasOwn(row.values, lookup)
				? row.values[lookup]
				: scope(lookup);
		try {
			if (
				condition !== undefined &&
				!asBoolean(evalNode(condition, inner, rt), `${name}()'s condition`)
			) {
				continue;
			}
			if (each === null) {
				total += 1;
				continue;
			}
			const value = evalNode(each, inner, rt);
			// The one mistake this feature invites, and worth its own sentence
			// rather than "needs a number, got true". A `toggle` column is a type
			// `total` accepts, and it totals to a count — so an author who has
			// seen the number under the column writes `sum` for it. The language
			// has no numeric meaning for yes and no anywhere else, so the answer
			// is the other aggregate rather than a coercion here.
			if (typeof value === 'boolean') {
				throw new FormulaError(
					`sum() adds numbers up and this is yes or no. Count the rows it holds for instead, with count(${table.name}, <condition>).`,
				);
			}
			total += asNumber(value, `${name}()`);
		} catch (error) {
			throw inRow(row.label, error);
		}
	}
	// An empty row set is 0, not a failure: an empty inventory weighs nothing,
	// and a new character's sheet must not be full of "?". Rounded through the
	// same helper the totals row under the column uses, so one expression cannot
	// read 0.30000000000000004 where the number under the column reads 0.3.
	// A count is whole and has nothing to round.
	return name === 'sum' ? roundSum(total) : total;
}

function evalNode(node: Node, scope: Scope, rt: Runtime): Value {
	switch (node.kind) {
		case 'num':
			return node.value;
		case 'bool':
			return node.value;
		case 'name': {
			const value = scope(node.name);
			if (value !== undefined) return value;
			// A function taking no arguments is a named value, and reads as
			// one: `prof`, not `prof()`. It answers last, so a component whose
			// id collides with a function name keeps its own meaning.
			const definition = rt.library.get(node.name);
			if (definition) {
				if (definition.params.length === 0) return callDefined(definition, [], rt);
				// The name is defined, just not as a value. Saying it is
				// unknown would send the reader looking for a typo that is
				// not there.
				throw new FormulaError(
					`"${node.name}" is a function the layout defines; call it as ${node.name}(${definition.params.join(', ')}).`,
				);
			}
			throw new FormulaError(`Unknown name "${node.name}".`);
		}
		case 'call': {
			// if() is lazy: only the taken branch is evaluated, so a guard
			// like if(prof > 0, 10 / prof, 0) never divides by zero.
			if (node.name === 'if') {
				if (node.args.length !== 3) {
					throw new FormulaError('if() takes a condition and two results.');
				}
				const condition = asBoolean(
					evalNode(node.args[0] as Node, scope, rt),
					'if() condition',
				);
				return evalNode(node.args[condition ? 1 : 2] as Node, scope, rt);
			}
			// The aggregates are lazy in the same way and for the same reason,
			// and their first argument is not a value at all.
			const aggregate = AGGREGATES.get(node.name);
			if (aggregate) {
				return evalAggregate(node.name, aggregate, node.args, scope, rt);
			}
			const args = node.args.map((arg) => evalNode(arg, scope, rt));
			// The layout's own functions cannot be named after a builtin, so
			// which is consulted first decides nothing but the error message.
			const definition = rt.library.get(node.name);
			if (definition) return callDefined(definition, args, rt);
			return callBuiltin(node.name, args);
		}
		case 'unary': {
			const operand = evalNode(node.operand, scope, rt);
			return node.op === '-'
				? -asNumber(operand, 'Negation')
				: !asBoolean(operand, '"!"');
		}
		case 'binary': {
			const left = evalNode(node.left, scope, rt);
			if (node.op === '&&') {
				return (
					asBoolean(left, '"&&"') &&
					asBoolean(evalNode(node.right, scope, rt), '"&&"')
				);
			}
			if (node.op === '||') {
				return (
					asBoolean(left, '"||"') ||
					asBoolean(evalNode(node.right, scope, rt), '"||"')
				);
			}
			const right = evalNode(node.right, scope, rt);
			if (node.op === '==') return left === right;
			if (node.op === '!=') return left !== right;
			const a = asNumber(left, `"${node.op}"`);
			const b = asNumber(right, `"${node.op}"`);
			switch (node.op) {
				case '+':
					return a + b;
				case '-':
					return a - b;
				case '*':
					return a * b;
				case '%':
					if (b === 0) throw new FormulaError('Modulo by zero.');
					return a % b;
				case '/':
					if (b === 0) throw new FormulaError('Division by zero.');
					return a / b;
				case '<':
					return a < b;
				case '<=':
					return a <= b;
				case '>':
					return a > b;
				case '>=':
					return a >= b;
				default:
					throw new FormulaError(`Unknown operator "${node.op}".`);
			}
		}
	}
}

/**
 * Whether an expression reads the given name. Lets a component tell "there
 * is nothing to compute from yet" apart from "this formula is broken": a
 * card whose formula reads its own empty `value` is blank, while one that
 * reads only other components resolves regardless of what it holds.
 */
export function referencesName(source: string, name: string): boolean {
	try {
		return tokenize(source).some(
			(token) => token.kind === 'name' && token.value === name,
		);
	} catch {
		// Unparseable input references nothing; the evaluator reports it.
		return false;
	}
}

/** Parse an expression without evaluating it. Throws FormulaError. */
export function parseExpression(source: string): Expression {
	return new Parser(tokenize(source)).parse();
}

/**
 * Evaluate a parsed expression against a scope, and optionally a library of
 * layout-defined functions. Throws FormulaError on any problem.
 */
export function evaluateExpression(
	expression: Expression,
	scope: Scope,
	env?: FunctionEnv,
): Value {
	const result = evalNode(expression, scope, {
		library: env?.library ?? NO_FUNCTIONS,
		base: env?.base ?? EMPTY_SCOPE,
		rows: env?.rows ?? NO_ROWS,
		// Per evaluation, not per library: the guard is about one call chain,
		// and a library outlives every expression that uses it.
		active: new Set(),
	});
	// Nothing downstream may ever render "NaN" or "Infinity" on a card.
	if (typeof result === 'number' && !Number.isFinite(result)) {
		throw new FormulaError('The formula did not produce a finite number.');
	}
	return result;
}

/** Parse and evaluate in one step. Throws FormulaError on any problem. */
export function evaluate(
	source: string,
	scope: Scope,
	env?: FunctionEnv,
): Value {
	return evaluateExpression(parseExpression(source), scope, env);
}
