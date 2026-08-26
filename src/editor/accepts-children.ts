/*
 * Whether a component in a layout may take a child where it sits.
 *
 * One predicate, and a module of its own for the reason its own comment already
 * gave: it is asked in three regions of the pane and in both polarities, and two
 * of those regions are now two files. `docs/PATTERNS.md` §1's ladder puts a
 * predicate on the one-step tier — a guard test over two copies could only
 * assert they still agree — so the copy that a fourth clause was added to would
 * be the one nothing was watching.
 *
 * Named for its export, the way `copyable-name.ts` and `field-commit.ts` are,
 * rather than shelved in a module about something else. It has no test file of
 * its own for the same reason those do not: every caller is a region of the
 * pane, and `layout-editor.test.ts` drives all three through the rendered pane.
 */

import { getComponent } from '../components';
import { mayHoldChildren } from '../parse/layout';
import { ComponentConfig, isContainer } from '../types';

/**
 * Whether this component may take a child *where it sits*.
 *
 * Two questions the editor always asks together — is it a container, and is it
 * shallow enough that the parser would still accept a child in it — and the
 * conjunction is the editor's own rather than either half's: `isContainer` is a
 * fact about the type and `mayHoldChildren` is the parser's depth rule, and
 * neither answers this on its own.
 *
 * Named because it is spelled in three regions and in both polarities. The add
 * row withholds a destination, the left column withholds a schematic, and the
 * panel prints a sentence saying nothing can go in it — and while the last two
 * were adjacent lines of one function, a rule growing a clause would have been
 * hard to add to one and miss on the other. They are a column apart now, and a
 * file apart since the panel moved out, and a divergence paints a grid beside a
 * sentence denying it: the instrument disagreeing with itself, which
 * `docs/UI.md` §11 calls worse than showing nothing. This is
 * `docs/PATTERNS.md` §1's predicate clause, and the shape is `childIsPlaced`'s:
 * the registry lookup the callers were each doing comes inside, so a caller
 * passes what it has.
 */
export function acceptsChildren(
	config: ComponentConfig,
	depth: number,
): boolean {
	return isContainer(getComponent(config.type)) && mayHoldChildren(depth);
}
