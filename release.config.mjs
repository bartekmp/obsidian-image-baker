// Automated releases driven by conventional commits on main:
// fix -> patch, feat -> minor, BREAKING CHANGE -> major. Anything else
// (docs, chore, refactor, ...) does not release.
//
// Obsidian expects release tags WITHOUT a "v" prefix, hence tagFormat.
export default {
	branches: ["main"],
	tagFormat: "${version}",
	plugins: [
		"@semantic-release/commit-analyzer",
		"@semantic-release/release-notes-generator",
		["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],
		// Bumps package.json/package-lock.json; nothing is published to npm.
		["@semantic-release/npm", { npmPublish: false }],
		// Sync the new version into manifest.json and versions.json, then
		// package the plugin bundle. The zip is built here (not in the
		// workflow) so it contains the bumped manifest.
		[
			"@semantic-release/exec",
			{
				prepareCmd:
					"node version-bump.mjs ${nextRelease.version} && " +
					"rm -rf dist && mkdir -p dist/image-baker && " +
					"cp main.js manifest.json styles.css dist/image-baker && " +
					"cd dist && zip -r image-baker-${nextRelease.version}.zip image-baker",
			},
		],
		[
			"@semantic-release/git",
			{
				assets: [
					"package.json",
					"package-lock.json",
					"manifest.json",
					"versions.json",
					"CHANGELOG.md",
				],
				message:
					"chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
			},
		],
		[
			"@semantic-release/github",
			{
				// The zip is the convenient manual install (unzip into
				// <vault>/.obsidian/plugins/); the three loose files are what
				// the Obsidian community catalog and BRAT installers expect.
				assets: [
					"dist/image-baker-*.zip",
					"main.js",
					"manifest.json",
					"styles.css",
				],
				// No release announcement comments on PRs/issues; they need
				// extra PAT permissions and are noise on a solo repo anyway.
				successComment: false,
				failComment: false,
				failTitle: false,
			},
		],
	],
};
