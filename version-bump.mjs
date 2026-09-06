/*
 * Carry the version in package.json across to manifest.json and versions.json.
 *
 * Run it as `npm run version` after editing package.json's `version` by hand.
 * **Not through `npm version`**, whose lifecycle commits and tags, and in this
 * repository only `/land-it` commits (`CLAUDE.md`). That is also why the npm
 * script no longer ends in `git add`: it was there to fold these two files into
 * that commit, and there is no such commit here.
 *
 * `minAppVersion` is deliberately untouched. It is a claim about which API
 * members the code actually uses, so it moves when somebody has checked, never
 * as a side effect of a release.
 */
import { readFileSync, writeFileSync } from 'fs';

const targetVersion = process.env.npm_package_version;

/**
 * Tab-indented, with the trailing newline `.editorconfig` requires.
 * `JSON.stringify` ends at the closing brace, and without this every bump left
 * a no-newline-at-end-of-file diff for the next reader to wonder about.
 */
function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value, null, '\t')}\n`);
}

// read minAppVersion from manifest.json and bump version to target version
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeJson('manifest.json', manifest);

// update versions.json with target version and minAppVersion from manifest.json
// but only if the target version is not already in versions.json
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
if (!(targetVersion in versions)) {
	versions[targetVersion] = minAppVersion;
	writeJson('versions.json', versions);
}
