/*
 * Launch headless Chrome and drive it over the DevTools Protocol.
 *
 * Two scripts need a browser that is *driven* rather than pointed at a file:
 * `shot.mjs`, for the states `--screenshot` cannot reach (a viewport under
 * 500px, an emulated media feature, a pointer resting or held down), and
 * `measure-groups.mjs`, which presses and measures. Each carried its own copy of
 * the launch, the discovery and the session, and the two had already drifted: one
 * imported `ws`, which is in no `package.json` and resolved only transitively,
 * and the other picked a random port and hoped. One module, so a third caller
 * does not make a third copy.
 *
 * **No dependency**, which is the constraint `shot.mjs` opens with. CDP is HTTP
 * for discovery and a WebSocket for the session, and Node has both built in;
 * this is `inspect.mjs`'s technique pointed at a Chrome this module starts.
 * `inspect.mjs` attaches to a running Obsidian and launches nothing, so the
 * launch half here is nothing it could use — but `connect` and `evaluate` are
 * near-copies of its own, and those it could. **They stay duplicated because the
 * pass that extracted this one left `inspect.mjs` untouched by scope**, not
 * because the shapes differ, and the copies have already drifted: this one names
 * the method in a protocol error and routes events to `next`, and that one does
 * neither.
 *
 * **Port 0, read back from Chrome**, rather than a fixed or random one: Chrome
 * picks a free port and prints `DevTools listening on ws://…` to stderr, so two
 * runs side by side, or a developer's own Chrome on 9222, cannot collide with it.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHROME = [
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/Applications/Chromium.app/Contents/MacOS/Chromium',
	'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
].find((path) => existsSync(path));

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Start a headless Chrome on `about:blank` and open a session on its page.
 *
 * `flags` are passed to the launch, after the ones every caller needs. Resolves
 * to `{ send, evaluate, next, close }`, where `close` resolves once Chrome has
 * exited and its profile is gone: `send` resolves with the command's
 * result and rejects with its error, `evaluate` returns a value rather than a
 * remote handle and throws what the page threw, and `next(method)` resolves on
 * the next event of that name, so a caller can wait for `Page.loadEventFired`
 * instead of guessing at a sleep.
 */
export async function launch(flags = []) {
	if (!CHROME) throw new Error('No Chrome-family browser found.');
	// A profile of its own, so a run never shares state with another one or
	// with the developer's own browser, and is removed when the session closes.
	const profile = mkdtempSync(join(tmpdir(), 'sheetsmith-cdp-'));
	const child = spawn(
		CHROME,
		[
			'--headless=new',
			'--disable-gpu',
			'--hide-scrollbars',
			'--remote-debugging-port=0',
			`--user-data-dir=${profile}`,
			...flags,
			'about:blank',
		],
		{ stdio: ['ignore', 'ignore', 'pipe'] },
	);
	/**
	 * Stop Chrome and remove its profile, resolving once both are done. Waits
	 * for the exit rather than removing at once, because Chrome may still hold
	 * the profile for a moment after the kill — and a caller that exits the
	 * process straight after (`measure-groups.mjs`) has to be able to await it,
	 * or the removal never runs.
	 */
	const shut = async () => {
		if (child.exitCode === null && child.signalCode === null) {
			const exited = new Promise((resolve) => child.once('exit', resolve));
			child.kill();
			await exited;
		}
		rmSync(profile, { recursive: true, force: true });
	};
	// Everything past the spawn can fail, and a launch that throws must not
	// leave a headless Chrome and its profile behind.
	try {
		const endpoint = await new Promise((resolve, reject) => {
			let seen = '';
			const timer = setTimeout(() => reject(new Error('Chrome printed no DevTools endpoint.')), 15000);
			child.stderr.on('data', (chunk) => {
				seen += chunk;
				const found = seen.match(/DevTools listening on (ws:\/\/[^\s]+)/);
				if (found) {
					clearTimeout(timer);
					resolve(new URL(found[1]));
				}
			});
			child.on('exit', () => reject(new Error('Chrome exited before it was driven.')));
		});
		const targets = await (await fetch(`http://${endpoint.host}/json/list`)).json();
		const target = targets.find((one) => one.type === 'page');
		if (!target) throw new Error('Chrome opened no page target.');
		const session = await connect(target.webSocketDebuggerUrl);
		return {
			...session,
			async close() {
				session.close();
				await shut();
			},
		};
	} catch (error) {
		await shut();
		throw error;
	}
}

/** One CDP session. Resolves each command by id, as the protocol requires. */
async function connect(url) {
	const socket = new WebSocket(url);
	const pending = new Map();
	const listeners = new Map();
	let nextId = 1;
	await new Promise((resolve, reject) => {
		socket.addEventListener('open', resolve, { once: true });
		socket.addEventListener('error', () => reject(new Error('CDP connect failed')), { once: true });
	});
	socket.addEventListener('message', (event) => {
		const message = JSON.parse(event.data);
		if (message.method !== undefined) {
			const waiting = listeners.get(message.method) ?? [];
			listeners.delete(message.method);
			for (const resolve of waiting) resolve(message.params);
			return;
		}
		const waiter = pending.get(message.id);
		if (!waiter) return;
		pending.delete(message.id);
		if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
		else waiter.resolve(message.result);
	});
	const send = (method, params = {}) => {
		const id = nextId++;
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject, method });
			socket.send(JSON.stringify({ id, method, params }));
		});
	};
	return {
		send,
		async evaluate(expression) {
			const result = await send('Runtime.evaluate', {
				expression,
				returnByValue: true,
				awaitPromise: true,
			});
			if (result.exceptionDetails) {
				throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
			}
			return result.result.value;
		},
		next(method) {
			return new Promise((resolve) => {
				listeners.set(method, [...(listeners.get(method) ?? []), resolve]);
			});
		},
		close: () => socket.close(),
	};
}
