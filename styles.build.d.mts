/** Declarations for styles.build.mjs, so a test may import it under tsc. */
export declare const PARTS: readonly string[];
/** styles.css as it should be on disk, assembled from src/styles/. */
export declare function renderStyles(): string;
/** Write that to styles.css, returning the path written. */
export declare function buildStyles(): string;
