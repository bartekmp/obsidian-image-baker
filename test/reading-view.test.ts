// @vitest-environment happy-dom
import type { PluginManifest } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { bytesToBase64 } from "../src/lib/base64";
import ImageBakerPlugin from "../src/main";
import { FakeApp, flushPromises, sampleBytes } from "./helpers";
import {
	Menu as MockMenu,
	Notice as MockNotice,
	Plugin as MockPlugin,
} from "./mocks/obsidian";

const manifest = { id: "image-baker", name: "Image Baker" } as unknown as PluginManifest;
const bytes = sampleBytes(32);
const base64 = bytesToBase64(bytes);

describe("reading view context menu", () => {
	let app: FakeApp;
	let plugin: ImageBakerPlugin;

	function renderEmbeddedImage(src: string, sourcePath: string): HTMLImageElement {
		const container = document.createElement("div");
		const img = document.createElement("img");
		img.setAttribute("src", src);
		container.appendChild(img);
		const processor = (plugin as unknown as MockPlugin)
			.markdownPostProcessors[0];
		processor?.(container, { sourcePath });
		return img;
	}

	beforeEach(async () => {
		MockMenu.reset();
		MockNotice.reset();
		app = new FakeApp();
		plugin = new ImageBakerPlugin(app.asApp(), manifest);
		await plugin.onload();
	});

	it("registers a markdown post-processor", () => {
		expect(
			(plugin as unknown as MockPlugin).markdownPostProcessors,
		).toHaveLength(1);
	});

	it("extracts a baked image from the reading view menu", async () => {
		const src = `data:image/png;base64,${base64}`;
		app.vault.addNote("Trip.md", `![photo.png](${src})`);
		const img = renderEmbeddedImage(src, "Trip.md");

		img.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
		const menu = MockMenu.instances[0];
		expect(menu?.items.map((item) => item.title)).toEqual([
			"Extract image to file",
			"Copy image",
			"Reset size",
		]);

		menu?.items[0]?.clickHandler?.();
		await flushPromises();

		expect(app.vault.contents.get("Trip.md")).toBe("![[photo.png]]");
		expect(app.vault.binaries.get("photo.png")).toEqual(bytes);
	});

	it("copies a baked image from the reading view menu", async () => {
		const src = `data:image/png;base64,${base64}`;
		app.vault.addNote("Trip.md", `![photo.png](${src})`);
		const written: string[] = [];
		plugin.clipboardWriter = (mime): Promise<void> => {
			written.push(mime);
			return Promise.resolve();
		};
		const img = renderEmbeddedImage(src, "Trip.md");

		img.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
		MockMenu.instances[0]?.items[1]?.clickHandler?.();
		await flushPromises();

		expect(written).toEqual(["image/png"]);
		expect(MockNotice.messages).toEqual(["Image copied to clipboard."]);
		expect(app.vault.contents.get("Trip.md")).toBe(`![photo.png](${src})`);
	});

	it("ignores images that are not data URIs", () => {
		app.vault.addNote("Trip.md", "![](https://example.com/x.png)");
		const img = renderEmbeddedImage("https://example.com/x.png", "Trip.md");

		img.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));

		expect(MockMenu.instances).toHaveLength(0);
	});

	it("resets the size of a baked image", async () => {
		const src = `data:image/png;base64,${base64}`;
		app.vault.addNote("Trip.md", `![photo.png|300](${src})`);
		const img = renderEmbeddedImage(src, "Trip.md");

		img.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
		MockMenu.instances[0]?.items[2]?.clickHandler?.();
		await flushPromises();

		expect(app.vault.contents.get("Trip.md")).toBe(`![photo.png](${src})`);
	});

	it("notifies when the rendered image no longer matches the note", async () => {
		const src = `data:image/png;base64,${base64}`;
		app.vault.addNote("Trip.md", "the embed was edited away");
		const img = renderEmbeddedImage(src, "Trip.md");
		plugin.logger.setLevel("off");

		img.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
		MockMenu.instances[0]?.items[0]?.clickHandler?.();
		await flushPromises();

		expect(MockNotice.messages).toEqual([
			"Could not locate this embedded image in the note.",
		]);
	});
});
