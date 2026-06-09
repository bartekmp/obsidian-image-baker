import type { PluginManifest } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import ImageBakerPlugin from "../src/main";
import { ImageBakerSettingTab } from "../src/settings-tab";
import { FakeApp } from "./helpers";
import { Plugin as MockPlugin, Setting as MockSetting } from "./mocks/obsidian";

const manifest = { id: "image-baker", name: "Image Baker" } as unknown as PluginManifest;

function findSetting(name: string): MockSetting {
	const setting = MockSetting.instances.find((instance) => instance.name === name);
	if (!setting) {
		throw new Error(`No setting named "${name}"`);
	}
	return setting;
}

describe("ImageBakerSettingTab", () => {
	let app: FakeApp;
	let plugin: ImageBakerPlugin;
	let tab: ImageBakerSettingTab;

	beforeEach(async () => {
		MockSetting.reset();
		app = new FakeApp();
		plugin = new ImageBakerPlugin(app.asApp(), manifest);
		await plugin.loadSettings();
		tab = new ImageBakerSettingTab(app.asApp(), plugin);
		tab.display();
	});

	it("renders all settings", () => {
		expect(MockSetting.instances.map((setting) => setting.name)).toEqual([
			"Delete source files after embedding",
			"Maximum file size to embed (KB)",
			"Extracted link style",
			"Log level",
		]);
	});

	it("persists the delete-source-files toggle", async () => {
		const toggle = findSetting("Delete source files after embedding").toggles[0];
		expect(toggle?.value).toBe(true);

		await toggle?.__change(false);

		expect(plugin.settings.deleteSourceFiles).toBe(false);
		const stored = (plugin as unknown as MockPlugin).__getStoredData();
		expect(stored).toMatchObject({ deleteSourceFiles: false });
	});

	it("persists a valid size limit and floors it", async () => {
		const text = findSetting("Maximum file size to embed (KB)").texts[0];

		await text?.__change("256.7");

		expect(plugin.settings.maxEmbedFileSizeKB).toBe(256);
	});

	it("ignores invalid size limits", async () => {
		const text = findSetting("Maximum file size to embed (KB)").texts[0];

		await text?.__change("-3");
		await text?.__change("abc");

		expect(plugin.settings.maxEmbedFileSizeKB).toBe(0);
		expect((plugin as unknown as MockPlugin).__getStoredData()).toBeNull();
	});

	it("persists the link style", async () => {
		const dropdown = findSetting("Extracted link style").dropdowns[0];
		expect(dropdown?.value).toBe("wiki");

		await dropdown?.__change("markdown");

		expect(plugin.settings.linkStyle).toBe("markdown");
	});

	it("offers every log level and applies changes to the logger", async () => {
		const dropdown = findSetting("Log level").dropdowns[0];
		expect(Object.keys(dropdown?.options ?? {})).toEqual([
			"off",
			"error",
			"warn",
			"info",
			"debug",
		]);

		await dropdown?.__change("debug");

		expect(plugin.settings.logLevel).toBe("debug");
		expect(plugin.logger.getLevel()).toBe("debug");
	});

	it("ignores unknown log levels", async () => {
		const dropdown = findSetting("Log level").dropdowns[0];

		await dropdown?.__change("verbose");

		expect(plugin.settings.logLevel).toBe("warn");
	});
});
