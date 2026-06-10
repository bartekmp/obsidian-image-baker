// @vitest-environment happy-dom
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
			"embed-images-in-selection",
			"extract-images-in-selection",
			"copy-image-at-cursor",
			"batch-embed-images",
			"batch-extract-images",
			"show-image-list",
		]);
		expect(mock.settingTabs).toHaveLength(1);
		expect(app.workspaceHandlers.has("editor-menu")).toBe(true);
		expect(app.workspaceHandlers.has("editor-paste")).toBe(true);
		expect(app.workspaceHandlers.has("editor-drop")).toBe(true);
		expect(Object.keys(mock.views)).toEqual([IMAGE_LIST_VIEW_TYPE]);
		expect(mock.ribbonIcons.map((icon) => icon.icon)).toEqual(["images"]);
	});

	it("registers the fold extension and rebuilds it on settings changes", async () => {
		expect(mock.registeredEditorExtensions.length).toBe(1);
		const registered = mock.registeredEditorExtensions[0] as unknown[];
		expect(registered.length).toBe(1);

		plugin.settings.foldEmbeds = false;
		await plugin.saveSettings();
		expect(registered.length).toBe(0);
		expect(app.optionsUpdates).toBe(1);

		plugin.settings.foldEmbeds = true;
		await plugin.saveSettings();
		expect(registered.length).toBe(1);
		expect(app.optionsUpdates).toBe(2);
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

	it("treats a selection covering an image as the selected image", async () => {
		app.vault.addBinary("a.png", bytes);
		const content = "text ![[a.png]] more";
		const note = app.vault.addNote("Trip.md", content);
		const editor = new FakeEditor(content);
		// Clicking a rendered image selects its whole markdown range.
		editor.selectionRange = {
			from: content.indexOf("![["),
			to: content.indexOf("]]") + 2,
		};

		const applicable = command("embed-image-at-cursor").editorCheckCallback?.(
			false,
			editor.asEditor(),
			asInfo(note),
		);
		await flushPromises();

		expect(applicable).toBe(true);
		expect(app.vault.contents.get("Trip.md")).toContain("data:image/png;base64,");
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

	it("embeds only the images inside the selection", async () => {
		app.vault.addBinary("a.png", bytes);
		app.vault.addBinary("b.png", bytes);
		const content = "![[a.png]] ![[b.png]]";
		const note = app.vault.addNote("Trip.md", content);
		const editor = new FakeEditor(content);
		editor.selectionRange = { from: 0, to: 10 };

		const applicable = command("embed-images-in-selection").editorCheckCallback?.(
			false,
			editor.asEditor(),
			asInfo(note),
		);
		await flushPromises();

		expect(applicable).toBe(true);
		const updated = app.vault.contents.get("Trip.md") ?? "";
		expect(updated).toContain("![[b.png]]");
		expect(updated).toContain(`![a.png](data:image/png;base64,${base64})`);
	});

	it("extracts only the embeds inside the selection", async () => {
		const embed = `![a.png](data:image/png;base64,${base64})`;
		const content = `${embed} and ${embed}`;
		const note = app.vault.addNote("Trip.md", content);
		const editor = new FakeEditor(content);
		editor.selectionRange = { from: 0, to: embed.length };

		command("extract-images-in-selection").editorCheckCallback?.(
			false,
			editor.asEditor(),
			asInfo(note),
		);
		await flushPromises();

		const updated = app.vault.contents.get("Trip.md") ?? "";
		expect(updated.startsWith("![[a.png]] and ")).toBe(true);
		expect(updated).toContain("data:image/png;base64,");
	});

	it("disables the selection commands without a matching selection", () => {
		const content = "![[a.png]] text";
		const note = app.vault.addNote("Trip.md", content);
		const collapsed = new FakeEditor(content, 3);
		const overText = new FakeEditor(content);
		overText.selectionRange = { from: 11, to: 15 };

		const embedCommand = command("embed-images-in-selection").editorCheckCallback;
		expect(embedCommand?.(true, collapsed.asEditor(), asInfo(note))).toBe(false);
		expect(embedCommand?.(true, overText.asEditor(), asInfo(note))).toBe(false);
	});

	it("copies the embed under the cursor to the clipboard", async () => {
		const content = `![photo.png](data:image/png;base64,${base64})`;
		const note = app.vault.addNote("Trip.md", content);
		const written: { mime: string; bytes: Uint8Array }[] = [];
		plugin.clipboardWriter = (mime, payload): Promise<void> => {
			written.push({ mime, bytes: payload });
			return Promise.resolve();
		};
		const editor = new FakeEditor(content, content.indexOf("base64,"));

		const applicable = command("copy-image-at-cursor").editorCheckCallback?.(
			false,
			editor.asEditor(),
			asInfo(note),
		);
		await flushPromises();

		expect(applicable).toBe(true);
		expect(written).toEqual([{ mime: "image/png", bytes }]);
		expect(MockNotice.messages).toEqual(["Image copied to clipboard."]);
		expect(app.vault.contents.get("Trip.md")).toBe(content);
	});

	it("offers extract and copy in the editor context menu on an embed", () => {
		const content = `![photo.png](data:image/png;base64,${base64})`;
		const note = app.vault.addNote("Trip.md", content);
		const handler = app.workspaceHandlers.get("editor-menu") as (
			...args: unknown[]
		) => void;
		const menu = new MockMenu();

		handler(
			menu,
			new FakeEditor(content, content.indexOf("base64,")).asEditor(),
			asInfo(note),
		);

		expect(menu.items.map((item) => item.title)).toEqual([
			"Extract image to file",
			"Copy image to clipboard",
		]);
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

		expect(menu.items[0]?.title).toBe("Extract image to file");
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

	function makeTransferEvent(
		files: File[],
		kind: "clipboardData" | "dataTransfer",
	): { defaultPrevented: boolean; preventDefault: () => void } & Record<
		string,
		unknown
	> {
		const evt = {
			defaultPrevented: false,
			preventDefault(): void {
				evt.defaultPrevented = true;
			},
			[kind]: { files },
		};
		return evt;
	}

	function fireTransfer(
		event: "editor-paste" | "editor-drop",
		evt: unknown,
		editor: FakeEditor,
		note: TFile,
	): void {
		const handler = app.workspaceHandlers.get(event) as (
			...args: unknown[]
		) => void;
		handler(evt, editor.asEditor(), asInfo(note));
	}

	it("bakes a pasted screenshot directly into the note", async () => {
		const note = app.vault.addNote("Trip.md", "");
		const editor = new FakeEditor("");
		const file = new File([sampleBytes(16)], "image.png", { type: "image/png" });
		const evt = makeTransferEvent([file], "clipboardData");

		fireTransfer("editor-paste", evt, editor, note);
		await flushPromises();

		expect(evt.defaultPrevented).toBe(true);
		expect(editor.replaced).toHaveLength(1);
		expect(editor.replaced[0]).toMatch(
			/^!\[Trip \d{8}-\d{6}\.png\]\(data:image\/png;base64,/,
		);
		expect(MockNotice.messages).toEqual(["Embedded 1 image into the note."]);
	});

	it("keeps the original name of dropped image files", async () => {
		const note = app.vault.addNote("Trip.md", "");
		const editor = new FakeEditor("");
		const file = new File([sampleBytes(16)], "diagram.png", { type: "image/png" });
		const evt = makeTransferEvent([file], "dataTransfer");

		fireTransfer("editor-drop", evt, editor, note);
		await flushPromises();

		expect(evt.defaultPrevented).toBe(true);
		expect(editor.replaced[0]).toContain("![diagram.png](data:image/png;base64,");
	});

	it("leaves pasting to Obsidian when disabled in settings", async () => {
		plugin.settings.embedOnPaste = false;
		const note = app.vault.addNote("Trip.md", "");
		const editor = new FakeEditor("");
		const file = new File([sampleBytes(16)], "image.png", { type: "image/png" });
		const evt = makeTransferEvent([file], "clipboardData");

		fireTransfer("editor-paste", evt, editor, note);
		await flushPromises();

		expect(evt.defaultPrevented).toBe(false);
		expect(editor.replaced).toHaveLength(0);
	});

	it("leaves non-image and oversized transfers to Obsidian", async () => {
		plugin.settings.maxEmbedFileSizeKB = 1;
		plugin.logger.setLevel("off");
		const note = app.vault.addNote("Trip.md", "");
		const editor = new FakeEditor("");
		const pdf = new File([sampleBytes(8)], "doc.pdf", { type: "application/pdf" });
		const big = new File([sampleBytes(2048)], "big.png", { type: "image/png" });

		const pdfEvt = makeTransferEvent([pdf], "clipboardData");
		fireTransfer("editor-paste", pdfEvt, editor, note);
		const bigEvt = makeTransferEvent([big], "dataTransfer");
		fireTransfer("editor-drop", bigEvt, editor, note);
		await flushPromises();

		expect(pdfEvt.defaultPrevented).toBe(false);
		expect(bigEvt.defaultPrevented).toBe(false);
		expect(editor.replaced).toHaveLength(0);
	});

	it("offers embedding from the file explorer menu for images only", () => {
		const handler = app.workspaceHandlers.get("file-menu") as (
			...args: unknown[]
		) => void;
		const image = app.vault.addBinary("photo.png", bytes);
		const note = app.vault.addNote("One.md", "![[photo.png]]");

		const imageMenu = new MockMenu();
		handler(imageMenu, image);
		const noteMenu = new MockMenu();
		handler(noteMenu, note);

		expect(imageMenu.items.map((item) => item.title)).toEqual([
			"Embed image into notes that use it",
		]);
		expect(noteMenu.items).toHaveLength(0);
	});

	it("embeds a file into its notes from the file explorer menu", async () => {
		const handler = app.workspaceHandlers.get("file-menu") as (
			...args: unknown[]
		) => void;
		const image = app.vault.addBinary("photo.png", bytes);
		app.vault.addNote("One.md", "![[photo.png]]");
		app.resolvedLinks["One.md"] = { "photo.png": 1 };

		const menu = new MockMenu();
		handler(menu, image);
		menu.items[0]?.clickHandler?.();
		await flushPromises();

		expect(app.vault.contents.get("One.md")).toContain("data:image/png;base64,");
		expect(MockNotice.messages).toEqual([
			"Embedded 1 link across 1 note, trashed the source file.",
		]);
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
