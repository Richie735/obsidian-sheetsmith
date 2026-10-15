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

/**
 * The body classes Obsidian sets for a platform, which the stub never does. A
 * tablet is mobile as well, so it carries both, as the app's `body` does, and so
 * is a phone: `.is-mobile`'s bare-control rules and the phone's own variables
 * are what `calibrate.mjs` carries under them, so `phone` stages the app's phone
 * CSS — its 44px inputs and `.is-mobile input[type='text']`'s width among them —
 * at whatever width the view gives it. It is not a device.
 *
 * Here rather than in `shot.mjs` because `measure-groups.mjs` stages a phone
 * too, and its own copy had already drifted: a hardcoded pair, and a check on
 * one class of the two.
 */
export const PLATFORMS = { tablet: ['is-mobile', 'is-tablet'], phone: ['is-mobile', 'is-phone'] };

/**
 * Stage a platform before the next navigation: touch emulated, so a coarse
 * pointer's rules answer as they do on the device, and the platform's body
 * classes added the moment `body` exists, ahead of the page's own script, so
 * nothing is placed against desktop sizes first. Resolves to a handle for
 * `checkPlatform` and `unstagePlatform`.
 *
 * The observer watches `document` itself, because this runs before the parser
 * has made even `<html>`: observing `documentElement` threw on null, the script
 * died silently, and the "tablet" drew at desktop scale.
 */
export async function stagePlatform(send, name) {
	const classes = PLATFORMS[name];
	if (classes === undefined) {
		throw new Error(`Bad platform "${name}"; want one of ${Object.keys(PLATFORMS).join(', ')}.`);
	}
	await send('Page.enable');
	await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
	const list = classes.map((one) => `'${one}'`).join(', ');
	const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
		source: `(() => {
			const add = () => document.body !== null && (document.body.classList.add(${list}), true);
			if (!add()) new MutationObserver((_, watch) => { if (add()) watch.disconnect(); })
				.observe(document, { childList: true, subtree: true });
		})()`,
	});
	return { name, classes, identifier };
}

/**
 * Throw unless the loaded page's `body` carries every class staged. Held rather
 * than trusted: a staging that silently fails draws a plausible desktop sheet.
 */
export async function checkPlatform(evaluate, staged) {
	const missing = await evaluate(
		`${JSON.stringify(staged.classes)}.filter((one) => !document.body.classList.contains(one))`,
	);
	if (missing.length > 0) throw new Error(`platform=${staged.name}: body lacks ${missing.join(', ')}`);
}

/** Undo `stagePlatform` for later navigations in the same session. */
export async function unstagePlatform(send, staged) {
	await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: staged.identifier });
	await send('Emulation.setTouchEmulationEnabled', { enabled: false });
}
