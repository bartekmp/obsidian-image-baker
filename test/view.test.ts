import type { PluginManifest, WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { bytesToBase64 } from "../src/lib/base64";
import ImageBakerPlugin from "../src/main";
import { IMAGE_LIST_VIEW_TYPE, ImageListView, listNoteImages } from "../src/view";
import { FakeApp, FakeEditor, FakeLeaf, flushPromises, sampleBytes } from "./helpers";
import type { FakeElement } from "./mocks/obsidian";

function contentOf(view: ImageListView): FakeElement {
	return (view as unknown as { contentEl: FakeElement }).contentEl;
}

const manifest = { id: "image-baker", name: "Image Baker" } as unknown as PluginManifest;
const base64 = bytesToBase64(sampleBytes(16));

describe("listNoteImages", () => {
	it("lists file links and embeds in document order", () => {
		const content = [
			`![named.png](data:image/png;base64,${base64})`,
			"![[wiki.png|300]]",
			"![alt](pics/markdown.png)",
			`![just a caption](data:image/jpeg;base64,${base64})`,
		].join("\n");

		expect(listNoteImages(content)).toEqual([
			{ label: "named.png", kind: "embedded", start: 0 },
			{ label: "wiki.png", kind: "wiki", start: expect.any(Number) },
			{ label: "pics/markdown.png", kind: "markdown", start: expect.any(Number) },
			{ label: "Embedded image (image/jpeg)", kind: "embedded", start: expect.any(Number) },
		]);
	});

	it("returns an empty list for notes without images", () => {
		expect(listNoteImages("just text")).toEqual([]);
	});
});

describe("ImageListView", () => {
	let app: FakeApp;
	let plugin: ImageBakerPlugin;
	let view: ImageListView;

	beforeEach(async () => {
		app = new FakeApp();
		plugin = new ImageBakerPlugin(app.asApp(), manifest);
		await plugin.loadSettings();
		const leaf = new FakeLeaf(app);
		view = new ImageListView(leaf as unknown as WorkspaceLeaf, plugin);
	});

	function renderedTexts(tag: string): string[] {
		return contentOf(view).findAll(tag).map((el) => el.text);
	}

	it("describes itself", () => {
		expect(view.getViewType()).toBe(IMAGE_LIST_VIEW_TYPE);
		expect(view.getDisplayText()).toBe("Note images");
		expect(view.getIcon()).toBe("images");
	});

	it("shows an empty state when no note is active", async () => {
		await view.onOpen();
		expect(renderedTexts("p")).toEqual(["Open a note to list its images."]);
	});

	it("shows a message for notes without images", async () => {
		app.activeFile = app.vault.addNote("Trip.md", "no images here");
		await view.onOpen();
		expect(renderedTexts("p")).toEqual(["No images in this note."]);
	});

	it("lists the images of the active note with kind badges", async () => {
		app.activeFile = app.vault.addNote(
			"Trip.md",
			`![[photo.png]] and ![pic.png](data:image/png;base64,${base64})`,
		);
		await view.onOpen();

		expect(renderedTexts("li")).toHaveLength(2);
		expect(renderedTexts("span")).toEqual([
			"photo.png",
			"file",
			"pic.png",
			"baked",
		]);
	});

	it("refreshes when another file is opened", async () => {
		await view.onOpen();
		expect(renderedTexts("p")).toEqual(["Open a note to list its images."]);

		app.activeFile = app.vault.addNote("Trip.md", "![[photo.png]]");
		app.workspaceHandlers.get("file-open")?.();
		await flushPromises();

		expect(renderedTexts("span")).toEqual(["photo.png", "file"]);
	});

	it("refreshes when the active note's metadata changes", async () => {
		const note = app.vault.addNote("Trip.md", "![[photo.png]]");
		app.activeFile = note;
		await view.onOpen();

		app.vault.contents.set("Trip.md", "![[photo.png]] ![[new.png]]");
		const changed = app.metadataHandlers.get("changed") as (file: unknown) => void;
		changed(note);
		await flushPromises();

		expect(renderedTexts("li")).toHaveLength(2);
	});

	it("ignores metadata changes of inactive files", async () => {
		const note = app.vault.addNote("Trip.md", "![[photo.png]]");
		const other = app.vault.addNote("Other.md", "");
		app.activeFile = note;
		await view.onOpen();

		app.vault.contents.set("Trip.md", "![[photo.png]] ![[new.png]]");
		const changed = app.metadataHandlers.get("changed") as (file: unknown) => void;
		changed(other);
		await flushPromises();

		expect(renderedTexts("li")).toHaveLength(1);
	});

	it("jumps to the image position when an entry is clicked", async () => {
		const content = `start ![[photo.png]]`;
		app.activeFile = app.vault.addNote("Trip.md", content);
		const editor = new FakeEditor(content);
		app.centerLeaf.view = { editor };
		await view.onOpen();

		contentOf(view).findAll("li")[0]?.onclick?.({});
		await flushPromises();

		expect(app.centerLeaf.openedFiles.map((file) => file.path)).toEqual(["Trip.md"]);
		expect(editor.cursor).toEqual({ line: 0, ch: content.indexOf("![[") });
		expect(editor.scrolledTo).toEqual({
			from: { line: 0, ch: 6 },
			to: { line: 0, ch: 6 },
		});
	});

	it("logs a warning when no editor is available after opening", async () => {
		const content = "![[photo.png]]";
		app.activeFile = app.vault.addNote("Trip.md", content);
		app.centerLeaf.view = {};
		plugin.logger.setLevel("off");
		await view.onOpen();

		contentOf(view).findAll("li")[0]?.onclick?.({});
		await flushPromises();

		expect(app.centerLeaf.openedFiles).toHaveLength(1);
	});
});
