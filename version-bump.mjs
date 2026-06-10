import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const targetVersion = process.argv[2] ?? process.env.npm_package_version;
if (!targetVersion) {
	throw new Error(
		"No version given; pass it as an argument or run this through `npm version`.",
	);
}

// Sync the npm package version into the Obsidian manifest.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

// Record which minimum app version this release requires.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
