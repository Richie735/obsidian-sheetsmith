/*
 * Formula expressions (SPEC §5).
 *
 * A real tokenizer and recursive descent parser, never eval(): layouts are
 * shareable files, so evaluating them as code would be an injection vector.
 *
 * This is the expression core only. It evaluates one expression against a
 * name-lookup scope. Cross-component references, the dependency graph, and
 * the layout function library arrive with M3.
 */

export type Value = number | boolean | string;

/** Resolves a referenced name, or undefined when nothing has that name. */
export type Scope = (name: string) => Value | undefined;

/** A scope holding nothing, for the paths that have no sheet around them. */
export const EMPTY_SCOPE: Scope = () => undefined;

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
const NAME = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/;

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
	const nums = (count: number): number[] => {
		if (args.length !== count) {
			throw new FormulaError(`${name}() takes ${count} argument${count === 1 ? '' : 's'}.`);
		}
		return args.map((a) => asNumber(a, `${name}()`));
	};
	switch (name) {
		case 'floor':
			return Math.floor((nums(1) as [number])[0]);
		case 'ceil':
			return Math.ceil((nums(1) as [number])[0]);
		case 'round':
			return Math.round((nums(1) as [number])[0]);
		case 'abs':
			return Math.abs((nums(1) as [number])[0]);
		case 'min':
		case 'max': {
			if (args.length === 0) {
				throw new FormulaError(`${name}() needs at least one argument.`);
			}
			const values = args.map((a) => asNumber(a, `${name}()`));
			return name === 'min' ? Math.min(...values) : Math.max(...values);
		}
		default:
			throw new FormulaError(`Unknown function "${name}".`);
	}
}

function evalNode(node: Node, scope: Scope): Value {
	switch (node.kind) {
		case 'num':
			return node.value;
		case 'bool':
			return node.value;
		case 'name': {
			const value = scope(node.name);
			if (value === undefined) {
				throw new FormulaError(`Unknown name "${node.name}".`);
			}
			return value;
		}
		case 'call': {
			// if() is lazy: only the taken branch is evaluated, so a guard
			// like if(prof > 0, 10 / prof, 0) never divides by zero.
			if (node.name === 'if') {
				if (node.args.length !== 3) {
					throw new FormulaError('if() takes a condition and two results.');
				}
				const condition = asBoolean(
					evalNode(node.args[0] as Node, scope),
					'if() condition',
				);
				return evalNode(node.args[condition ? 1 : 2] as Node, scope);
			}
			return callBuiltin(
				node.name,
				node.args.map((arg) => evalNode(arg, scope)),
			);
		}
		case 'unary': {
			const operand = evalNode(node.operand, scope);
			return node.op === '-'
				? -asNumber(operand, 'Negation')
				: !asBoolean(operand, '"!"');
		}
		case 'binary': {
			const left = evalNode(node.left, scope);
			if (node.op === '&&') {
				return asBoolean(left, '"&&"') && asBoolean(evalNode(node.right, scope), '"&&"');
			}
			if (node.op === '||') {
				return asBoolean(left, '"||"') || asBoolean(evalNode(node.right, scope), '"||"');
			}
			const right = evalNode(node.right, scope);
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

/** Evaluate a formula against a scope. Throws FormulaError on any problem. */
export function evaluate(source: string, scope: Scope): Value {
	const result = evalNode(new Parser(tokenize(source)).parse(), scope);
	// Nothing downstream may ever render "NaN" or "Infinity" on a card.
	if (typeof result === 'number' && !Number.isFinite(result)) {
		throw new FormulaError('The formula did not produce a finite number.');
	}
	return result;
}
