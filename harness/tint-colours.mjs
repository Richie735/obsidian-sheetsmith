/*
 * The form tint's colours, for the harness's plain Node scripts
 * (`docs/features/form-tint-colour.md`): `shot.mjs` takes a view per named
 * colour from it and `measure-form-tint.mjs` measures each one.
 *
 * **A copy of `TINT_COLOURS` in `src/types.ts`, and the one copy the harness
 * keeps.** These scripts run under Node without a build, so they cannot import
 * the TypeScript list; `tint-colours.test.ts` holds this one equal to it, so a
 * colour added there and missed here fails rather than going unshot and
 * unmeasured.
 */
export const TINT_COLOURS = ['accent', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];
