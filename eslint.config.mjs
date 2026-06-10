import js from "@eslint/js";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["main.js", "node_modules/", "coverage/"],
	},
	js.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	// The obsidianmd/* rules the community plugin review runs, scoped to
	// the plugin sources (the full recommended preset would re-add its own
	// copies of the eslint and typescript-eslint baselines).
	{
		files: ["src/**/*.ts"],
		plugins: { obsidianmd },
		rules: Object.fromEntries(
			obsidianmd.configs.recommended
				.flatMap((config) => Object.entries(config.rules ?? {}))
				.filter(([name]) => name.startsWith("obsidianmd/")),
		),
	},
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["*.mjs"],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
		},
	},
	{
		files: ["**/*.mjs"],
		...tseslint.configs.disableTypeChecked,
	},
	{
		files: ["test/**/*.ts"],
		rules: {
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/unbound-method": "off",
		},
	},
);
