/*
 * The layouts a layout editor pane let go of while it could not save them,
 * kept in memory by vault path until Obsidian closes
 * (`docs/features/unsaveable-layout.md` §4).
 *
 * **Why it exists.** A pane that holds a layout it cannot write used to drop it
 * on every change of file — the dropdown, **New layout**, a file opened from
 * anywhere, closing the pane — with nothing said, so every edit since the first
 * refusal was gone. Leaving now keeps it here, and opening the file again puts
 * it back.
 *
 * **What makes keeping safe is the bytes.** An entry records what the file held
 * when it was kept (`base`), and it is put back only where the file still holds
 * exactly that. Anything else means something wrote the file meanwhile, and the
 * disk wins, as it does for an outside write while the pane is open.
 *
 * **Inside the owner's bound, deliberately**: one `Map` keyed by path, plus the
 * hooks that move an entry with a rename and discard it with a delete
 * (`view/layout-file-events.ts`), the reopen in the editor's render, and the
 * notice when the plugin stops. It holds no DOM and imports nothing from
 * `obsidian`: the plugin owns one instance, and it is never written to
 * `data.json`, because layout text in plugin data would bring a staleness
 * problem of its own.
 *
 * The sentences each path says live here too, as plain strings, so the four
 * surfaces that raise them — the pane, its view, the vault's file events and the
 * plugin's unload — cannot come to word one loss four ways.
 */

/** Why a pane could not save the layout it holds. */
export interface Unsaved {
	/** `invalid`: it will not serialise and re-parse. `write`: the vault refused it. */
	reason: 'invalid' | 'write';
	/** The parser's sentence, or the vault's. */
	message: string;
}

/** One kept layout. */
export interface KeptLayout extends Unsaved {
	/** What the file held when it was kept: the pane's last known bytes. */
	base: string;
	/** The pane's own serialisation of the layout it could not write. */
	text: string;
}

export class UnsavedLayouts {
	private kept = new Map<string, KeptLayout>();
	/**
	 * Set once the plugin has started stopping. Every unsaved layout has been
	 * told about by then, so a pane letting go afterwards keeps nothing and says
	 * nothing, which is what gives each layout exactly one notice.
	 */
	stopped = false;

	/** Keep `entry` under `path`, replacing anything kept there. */
	keep(path: string, entry: KeptLayout): void {
		if (this.stopped) return;
		this.kept.set(path, entry);
	}

	/** The entry under `path`, which leaves the store. */
	take(path: string): KeptLayout | undefined {
		const entry = this.kept.get(path);
		this.kept.delete(path);
		return entry;
	}

	/** Look without taking. */
	peek(path: string): KeptLayout | undefined {
		return this.kept.get(path);
	}

	/** Follow a vault rename. A path holding nothing kept moves nothing. */
	rename(from: string, to: string): void {
		const entry = this.kept.get(from);
		if (entry === undefined) return;
		this.kept.delete(from);
		this.kept.set(to, entry);
	}

	/** Every kept layout, by path. */
	entries(): [string, KeptLayout][] {
		return [...this.kept];
	}
}

/** Where leaving a pane kept the layout, and how to get it back. */
export function keptSentence(basename: string): string {
	return `"${basename}" is not saved. Its changes are kept until Obsidian closes; open it again to get them back.`;
}

/** Where reopening found the file changed since the layout was kept. */
export function changedWhileClosedSentence(basename: string): string {
	return `"${basename}" changed on disk while it was closed, so the changes not saved to it were dropped.`;
}

/** Where the file a kept or held layout belongs to was deleted. */
export function deletedSentence(basename: string): string {
	return `"${basename}" was deleted, so the changes not saved to it were dropped.`;
}

/** Where the plugin stopped with a layout not saved. */
export function stoppedSentence(basename: string): string {
	return `Sheetsmith stopped with changes to "${basename}" not saved. They are gone unless you copy them now.`;
}
