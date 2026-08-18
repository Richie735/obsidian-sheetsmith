/*
 * Inspect the real Obsidian instead of approximating it.
 *
 * Obsidian is Electron, so its renderer speaks the Chrome DevTools Protocol
 * when the app is launched with a debug port. That makes the running app
 * readable: its actual computed theme variables, and a screenshot of the actual
 * settings tab. The harness approximates Obsidian's chrome by eye, and eye is
 * exactly where it drifts — this is how the approximation gets corrected
 * against the thing it approximates.
 *
 * Requires Obsidian started with the port open, which is not its normal state:
 *
 *   /Applications/Obsidian.app/Contents/MacOS/Obsidian --remote-debugging-port=9222
 *
 * The port allows arbitrary code execution in the app, so open it for a
 * calibration session against the throwaway test vault (CLAUDE.md 6) and quit
 * afterwards. It binds to localhost.
 *
 * Usage:
 *   node harness/inspect.mjs vars              # theme variables as CSS
 *   node harness/inspect.mjs settings          # open the plugin's settings tab
 *   node harness/inspect.mjs shot out.png      # screenshot the window
 *   node harness/inspect.mjs eval "<js>"       # evaluate in the renderer
 *
 * No dependencies: CDP is HTTP for discovery and a WebSocket for the session,
 * and Node has both built in.
 */

import { writeFileSync } from 'node:fs';

const PORT = process.env.OBSIDIAN_DEBUG_PORT ?? '9222';
const ORIGIN = `http://127.0.0.1:${PORT}`;

/** Every variable the plugin's stylesheet consumes, plus the ones the harness needs. */
const VARIABLES = [
	'--background-primary',
	'--background-primary-alt',
	'--background-secondary',
	'--background-modifier-border',
	'--background-modifier-hover',
	'--background-modifier-active-hover',
	'--background-modifier-error',
	'--background-modifier-box-shadow',
	'--background-modifier-form-field',
	'--text-normal',
	'--text-muted',
	'--text-faint',
	'--text-accent',
	'--text-error',
	'--text-on-accent',
	'--interactive-accent',
	'--interactive-accent-hover',
	'--font-normal',
	'--font-ui-medium',
	'--font-ui-small',
	'--font-ui-smaller',
	'--font-smallest',
	'--font-medium',
	'--font-semibold',
	'--font-bold',
	'--font-monospace',
	'--size-2-1',
	'--size-2-2',
	'--size-2-3',
	'--size-4-1',
	'--size-4-2',
	'--size-4-3',
	'--size-4-4',
	'--size-4-6',
	'--size-4-8',
	'--radius-s',
	'--radius-m',
	'--radius-l',
	'--icon-s',
	'--layer-popover',
	'--file-line-width',
];

async function mainTarget() {
	let targets;
	try {
		targets = await (await fetch(`${ORIGIN}/json`)).json();
	} catch {
		throw new Error(
			`No debug port on ${PORT}. Start Obsidian with:\n` +
				'  /Applications/Obsidian.app/Contents/MacOS/Obsidian --remote-debugging-port=9222\n' +
				'(quit the running instance first — Electron is single-instance).',
		);
	}
	const page = targets.find(
		(t) => t.type === 'page' && !t.url.startsWith('devtools://'),
	);
	if (!page) throw new Error('No page target. Is a vault open?');
	return page;
}

/** One CDP session. Resolves each command by id, as the protocol requires. */
async function connect(url) {
	const socket = new WebSocket(url);
	const pending = new Map();
	let nextId = 1;
	await new Promise((resolve, reject) => {
		socket.addEventListener('open', resolve, { once: true });
		socket.addEventListener('error', () => reject(new Error('CDP connect failed')), { once: true });
	});
	socket.addEventListener('message', (event) => {
		const message = JSON.parse(event.data);
		const waiter = pending.get(message.id);
		if (!waiter) return;
		pending.delete(message.id);
		if (message.error) waiter.reject(new Error(message.error.message));
		else waiter.resolve(message.result);
	});
	return {
		send(method, params = {}) {
			const id = nextId++;
			return new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject });
				socket.send(JSON.stringify({ id, method, params }));
			});
		},
		close: () => socket.close(),
	};
}

/** Evaluate in the renderer and return the value, not a remote handle. */
async function evaluate(session, expression) {
	const result = await session.send('Runtime.evaluate', {
		expression,
		returnByValue: true,
		awaitPromise: true,
	});
	if (result.exceptionDetails) {
		throw new Error(
			result.exceptionDetails.exception?.description ??
				result.exceptionDetails.text,
		);
	}
	return result.result.value;
}

const COMMANDS = {
	async vars(session) {
		const read = await evaluate(
			session,
			`(() => {
				const style = getComputedStyle(document.body);
				const out = {};
				for (const name of ${JSON.stringify(VARIABLES)}) {
					out[name] = style.getPropertyValue(name).trim();
				}
				return { theme: document.body.className, vars: out };
			})()`,
		);
		const dark = read.theme.includes('theme-dark');
		const missing = Object.entries(read.vars).filter(([, v]) => v === '');
		console.log(`/* Read from Obsidian, theme: ${dark ? 'dark' : 'light'} */`);
		console.log(`body.theme-${dark ? 'dark' : 'light'} {`);
		for (const [name, value] of Object.entries(read.vars)) {
			if (value !== '') console.log(`\t${name}: ${value};`);
		}
		console.log('}');
		if (missing.length > 0) {
			console.log(
				`\n/* Not defined by this theme: ${missing.map(([n]) => n).join(', ')} */`,
			);
		}
		console.log(
			'\n/* Run again after switching the app theme to capture the other block. */',
		);
	},

	async settings(session) {
		const opened = await evaluate(
			session,
			`(() => {
				app.setting.open();
				app.setting.openTabById('sheetsmith');
				return app.setting.activeTab?.id ?? null;
			})()`,
		);
		console.log(
			opened === 'sheetsmith'
				? 'Plugin settings tab open.'
				: `Opened settings, active tab: ${opened ?? 'none'} (is the plugin enabled?)`,
		);
	},

	async shot(session, out = 'harness/obsidian.png') {
		const { data } = await session.send('Page.captureScreenshot', {
			format: 'png',
			captureBeyondViewport: false,
		});
		writeFileSync(out, Buffer.from(data, 'base64'));
		console.log(`Wrote ${out}`);
	},

	async eval(session, ...rest) {
		console.log(JSON.stringify(await evaluate(session, rest.join(' ')), null, 2));
	},
};

const [command, ...args] = process.argv.slice(2);
const run = COMMANDS[command ?? ''];
if (!run) {
	console.error(`Usage: node harness/inspect.mjs <${Object.keys(COMMANDS).join('|')}> [args]`);
	process.exit(1);
}

const target = await mainTarget();
const session = await connect(target.webSocketDebuggerUrl);
try {
	await run(session, ...args);
} finally {
	session.close();
}
