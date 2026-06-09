import type { MarkdownFileInfo, PluginManifest, TFile } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { bytesToBase64 } from "../src/lib/base64";
import ImageBakerPlugin from "../src/main";
import { IMAGE_LIST_VIEW_TYPE, ImageListView } from "../src/view";
import { FakeApp, FakeEditor, FakeLeaf, flushPromises, sampleBytes } from "./helpers";
import {
	Menu as MockMenu,
	Notice as MockNotice,
	Plugin as MockPlugin,
	TFile as MockTFile,
	type RegisteredCommand,
} from "./mocks/obsidian";

const manifest = { id: "image-baker", name: "Image Baker" } as unknown as PluginManifest;
const bytes = sampleBytes(32);
const base64 = bytesToBase64(bytes);

function asInfo(file: TFile | null): MarkdownFileInfo {
	return { file } as unknown as MarkdownFileInfo;
}

describe("ImageBakerPlugin", () => {
	let app: FakeApp;
	let plugin: ImageBakerPlugin;
	let mock: MockPlugin;

	function command(id: string): RegisteredCommand {
		const found = mock.commands.find((candidate) => candidate.id === id);
		if (!found) {
			throw new Error(`No command "${id}"`);
		}
		return found;
	}

	beforeEach(async () => {
		MockNotice.reset();
		app = new FakeApp();
		plugin = new ImageBakerPlugin(app.asApp(), manifest);
		mock = plugin as unknown as MockPlugin;
		await plugin.onload();
	});

	it("registers commands, views, the settings tab, and the editor menu hook", () => {
		expect(mock.commands.map((registered) => registered.id)).toEqual([
			"embed-all-images",
			"extract-all-images",
			"embed-image-at-cursor",
			"extract-image-at-cursor",
			"show-image-list",
		]);
		expect(mock.settingTabs).toHaveLength(1);
		expect(app.workspaceHandlers.has("editor-menu")).toBe(true);
		expect(Object.keys(mock.views)).toEqual([IMAGE_LIST_VIEW_TYPE]);
		expect(mock.ribbonIcons.map((icon) => icon.icon)).toEqual(["images"]);
	});

	it("creates image list views through the registered factory", () => {
		const factory = mock.views[IMAGE_LIST_VIEW_TYPE];
		const view = factory?.(new FakeLeaf(app));
		expect(view).toBeInstanceOf(ImageListView);
	});

	it("opens the image list in the right sidebar", async () => {
		mock.ribbonIcons[0]?.callback();
		await flushPromises();

		expect(app.rightLeaf.viewType).toBe(IMAGE_LIST_VIEW_TYPE);
		expect(app.revealedLeaves).toEqual([app.rightLeaf]);
	});

	it("reveals the existing image list view instead of creating another", async () => {
		await plugin.activateImageListView();
		command("show-image-list").callback?.();
		await flushPromises();

		expect(app.viewLeaves).toHaveLength(1);
		expect(app.revealedLeaves).toEqual([app.rightLeaf, app.rightLeaf]);
	});

	it("applies persisted settings on load", async () => {
		const fresh = new ImageBakerPlugin(app.asApp(), manifest);
		(fresh as unknown as MockPlugin).__setStoredData({ logLevel: "debug" });
		await fresh.onload();
		expect(fresh.settings.logLevel).toBe("debug");
		expect(fresh.logger.getLevel()).toBe("debug");
	});

	it("embeds all images through the command", async () => {
		app.vault.addBinary("photo.png", bytes);
		const note = app.vault.addNote("Trip.md", "![[photo.png]]");
		const editor = new FakeEditor("![[photo.png]]").asEditor();

		const applicable = command("embed-all-images").editorCheckCallback?.(
			false,
			editor,
			asInfo(note),
		);
		await flushPromises();

		expect(applicable).toBe(true);
		expect(app.vault.contents.get("Trip.md")).toBe(
			`![photo.png](data:image/png;base64,${base64})`,
		);
		expect(MockNotice.messages).toEqual([
			"Embedded 1 image, trashed 1 source file.",
		]);
	});

	it("extracts all images through the command", async () => {
		const note = app.vault.addNote(
			"Trip.md",
			`![photo.png](data:image/png;base64,${base64})`,
		);
		const editor = new FakeEditor("").asEditor();

		command("extract-all-images").editorCheckCallback?.(
			false,
			editor,
			asInfo(note),
		);
		await flushPromises();

		expect(app.vault.contents.get("Trip.md")).toBe("![[photo.png]]");
		expect(MockNotice.messages).toEqual(["Extracted 1 image."]);
	});

	it("is unavailable without an active note file", () => {
		const editor = new FakeEditor("").asEditor();
		for (const id of [
			"embed-all-images",
			"extract-all-images",
			"embed-image-at-cursor",
			"extract-image-at-cursor",
		]) {
			expect(command(id).editorCheckCallback?.(true, editor, asInfo(null))).toBe(
				false,
			);
		}
	});

	it("gates the cursor commands on the link under the cursor", () => {
		const note = app.vault.addNote(
			"Trip.md",
			`![[a.png]] ![b.png](data:image/png;base64,${base64})`,
		);
		const content = app.vault.contents.get("Trip.md") ?? "";
		const onFileLink = new FakeEditor(content, 3).asEditor();
		const onEmbed = new FakeEditor(content, content.indexOf("base64,")).asEditor();
		const onNothing = new FakeEditor(`x ${content}`, 0).asEditor();
		const info = asInfo(note);

		const embedCommand = command("embed-image-at-cursor").editorCheckCallback;
		const extractCommand = command("extract-image-at-cursor").editorCheckCallback;

		expect(embedCommand?.(true, onFileLink, info)).toBe(true);
		expect(embedCommand?.(true, onEmbed, info)).toBe(false);
		expect(extractCommand?.(true, onEmbed, info)).toBe(true);
		expect(extractCommand?.(true, onFileLink, info)).toBe(false);
		expect(embedCommand?.(true, onNothing, info)).toBe(false);
	});

	it("embeds a single image from the cursor command", async () => {
		app.vault.addBinary("a.png", bytes);
		app.vault.addBinary("b.png", bytes);
		const note = app.vault.addNote("Trip.md", "![[a.png]] ![[b.png]]");
		const editor = new FakeEditor("![[a.png]] ![[b.png]]", 13).asEditor();

		command("embed-image-at-cursor").editorCheckCallback?.(
			false,
			editor,
			asInfo(note),
		);
		await flushPromises();

		const content = app.vault.contents.get("Trip.md") ?? "";
		expect(content).toContain("![[a.png]]");
		expect(content).toContain(`![b.png](data:image/png;base64,${base64})`);
	});

	it("offers an embed action in the editor context menu on a file link", async () => {
		app.vault.addBinary("photo.png", bytes);
		const note = app.vault.addNote("Trip.md", "![[photo.png]]");
		const handler = app.workspaceHandlers.get("editor-menu");
		const menu = new MockMenu();

		(handler as (...args: unknown[]) => void)(
			menu,
			new FakeEditor("![[photo.png]]", 4).asEditor(),
			asInfo(note),
		);

		expect(menu.items.map((item) => item.title)).toEqual([
			"Embed image into note",
		]);
		menu.items[0]?.clickHandler?.();
		await flushPromises();
		expect(app.vault.contents.get("Trip.md")).toContain("data:image/png;base64,");
	});

	it("offers an extract action in the editor context menu on an embed", async () => {
		const content = `![photo.png](data:image/png;base64,${base64})`;
		const note = app.vault.addNote("Trip.md", content);
		const handler = app.workspaceHandlers.get("editor-menu");
		const menu = new MockMenu();

		(handler as (...args: unknown[]) => void)(
			menu,
			new FakeEditor(content, content.indexOf("base64,")).asEditor(),
			asInfo(note),
		);

		expect(menu.items.map((item) => item.title)).toEqual([
			"Extract image to file",
		]);
		menu.items[0]?.clickHandler?.();
		await flushPromises();
		expect(app.vault.contents.get("Trip.md")).toBe("![[photo.png]]");
	});

	it("adds no menu items away from links or without a file", () => {
		const handler = app.workspaceHandlers.get("editor-menu") as (
			...args: unknown[]
		) => void;
		const note = app.vault.addNote("Trip.md", "plain text");

		const menu = new MockMenu();
		handler(menu, new FakeEditor("plain text", 2).asEditor(), asInfo(note));
		handler(menu, new FakeEditor("![[a.png]]", 2).asEditor(), asInfo(null));

		expect(menu.items).toHaveLength(0);
	});

	it("reports failures with a notice instead of throwing", async () => {
		plugin.logger.setLevel("off");
		const orphan = new MockTFile();
		orphan.path = "Ghost.md";
		const editor = new FakeEditor("").asEditor();

		command("embed-all-images").editorCheckCallback?.(
			false,
			editor,
			asInfo(orphan as unknown as TFile),
		);
		await flushPromises();

		expect(MockNotice.messages).toEqual([
			"Image Baker: failed to embed images. Check the developer console for details.",
		]);
	});
});
