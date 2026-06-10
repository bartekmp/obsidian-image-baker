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
		// Sync the new version into manifest.json and versions.json.
		[
			"@semantic-release/exec",
			{ prepareCmd: "node version-bump.mjs ${nextRelease.version}" },
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
				// Obsidian installs read these three files straight off the release.
				assets: ["main.js", "manifest.json", "styles.css"],
			},
		],
	],
};
