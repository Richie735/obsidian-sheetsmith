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

/*
 * The version comes from npm's environment, so running this file directly is
 * the one way to use it wrong — and it used to fail silently and destructively.
 * With `npm_package_version` unset, `manifest.version = undefined` makes
 * `JSON.stringify` **drop the key entirely**, so the manifest lost the field
 * Obsidian identifies the release by; and the guard below it did not catch the
 * case either, because `undefined in versions` is false, so `versions.json`
 * gained a key literally named `undefined`. Exit code 0, no output, both
 * release-critical files corrupted.
 *
 * Checked rather than defaulted: there is no safe value to assume here. A
 * wrong version in `manifest.json` is a release nobody can install, so
 * stopping is the only correct answer.
 */
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
if (targetVersion === undefined || targetVersion === '') {
	console.error(
		'version-bump: no version to apply.\n' +
			'This reads npm_package_version, which npm sets and a bare `node` run does not.\n' +
			'Edit "version" in package.json, then run: npm run version',
	);
	process.exit(1);
}
if (!SEMVER.test(targetVersion)) {
	console.error(
		`version-bump: "${targetVersion}" is not a version Obsidian accepts.\n` +
			'It must be exactly x.y.z, digits only, with no leading "v" and no suffix.\n' +
			'Fix "version" in package.json, then run: npm run version',
	);
	process.exit(1);
}

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
