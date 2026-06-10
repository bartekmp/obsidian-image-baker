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

		const items = listNoteImages(content);
		expect(items.map(({ label, kind }) => ({ label, kind }))).toEqual([
			{ label: "named.png", kind: "embedded" },
			{ label: "wiki.png", kind: "wiki" },
			{ label: "pics/markdown.png", kind: "markdown" },
			{ label: "Embedded image (image/jpeg)", kind: "embedded" },
		]);
		expect(items.every((item) => item.link.kind === item.kind)).toBe(true);
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

	function buttonByText(text: string): FakeElement {
		const button = contentOf(view)
			.findAll("button")
			.find((el) => el.text === text);
		if (!button) {
			throw new Error(`No button labeled "${text}"`);
		}
		return button;
	}

	const clickEvent = { stopPropagation: (): void => undefined };

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

	it("renders the toolbar and a convert button per item", async () => {
		app.activeFile = app.vault.addNote(
			"Trip.md",
			`![[photo.png]] and ![pic.png](data:image/png;base64,${base64})`,
		);
		await view.onOpen();

		expect(renderedTexts("button")).toEqual([
			"Select files",
			"Select baked",
			"Bake",
			"Extract",
		]);
	});

	it("bakes a file image from its button without navigating", async () => {
		app.vault.addBinary("photo.png", sampleBytes(8));
		app.activeFile = app.vault.addNote("Trip.md", "![[photo.png]]");
		await view.onOpen();

		buttonByText("Bake").onclick?.(clickEvent);
		await flushPromises();

		expect(app.vault.contents.get("Trip.md")).toContain("data:image/png;base64,");
		expect(app.centerLeaf.openedFiles).toHaveLength(0);
		expect(renderedTexts("button")).toContain("Extract");
	});

	it("extracts a baked image from its button", async () => {
		app.activeFile = app.vault.addNote(
			"Trip.md",
			`![photo.png](data:image/png;base64,${base64})`,
		);
		await view.onOpen();

		buttonByText("Extract").onclick?.(clickEvent);
		await flushPromises();

		expect(app.vault.contents.get("Trip.md")).toBe("![[photo.png]]");
		expect(renderedTexts("button")).toContain("Bake");
	});

	it("selects all baked images and batch-extracts them", async () => {
		app.activeFile = app.vault.addNote(
			"Trip.md",
			`![[file.png]] ![a.png](data:image/png;base64,${base64}) ![b.png](data:image/png;base64,${base64})`,
		);
		await view.onOpen();

		buttonByText("Select baked").onclick?.(clickEvent);
		expect(
			contentOf(view)
				.findAll("input")
				.map((box) => box.checked),
		).toEqual([false, true, true]);

		buttonByText("Extract 2").onclick?.(clickEvent);
		await flushPromises();

		const content = app.vault.contents.get("Trip.md") ?? "";
		expect(content).toBe("![[file.png]] ![[a.png]] ![[b.png]]");
	});

	it("selects all file images and batch-bakes them", async () => {
		app.vault.addBinary("a.png", sampleBytes(8));
		app.vault.addBinary("b.png", sampleBytes(8));
		app.activeFile = app.vault.addNote("Trip.md", "![[a.png]] ![[b.png]]");
		await view.onOpen();

		buttonByText("Select files").onclick?.(clickEvent);
		buttonByText("Bake 2").onclick?.(clickEvent);
		await flushPromises();

		const content = app.vault.contents.get("Trip.md") ?? "";
		expect(content.match(/data:image\/png;base64,/g)).toHaveLength(2);
	});

	it("offers no batch action for a mixed selection", async () => {
		app.activeFile = app.vault.addNote(
			"Trip.md",
			`![[file.png]] ![a.png](data:image/png;base64,${base64})`,
		);
		await view.onOpen();

		const boxes = contentOf(view).findAll("input");
		boxes[0]?.onclick?.(clickEvent);
		contentOf(view).findAll("input")[1]?.onclick?.(clickEvent);

		const buttons = renderedTexts("button");
		expect(buttons).not.toContain("Bake 2");
		expect(buttons.some((text) => /^(Bake|Extract) \d/.test(text))).toBe(false);
	});

	it("toggles a single checkbox into a batch action", async () => {
		app.vault.addBinary("a.png", sampleBytes(8));
		app.activeFile = app.vault.addNote("Trip.md", "![[a.png]]");
		await view.onOpen();

		contentOf(view).findAll("input")[0]?.onclick?.(clickEvent);
		expect(renderedTexts("button")).toContain("Bake 1");

		contentOf(view).findAll("input")[0]?.onclick?.(clickEvent);
		expect(renderedTexts("button")).not.toContain("Bake 1");
	});

	it("renders once when refreshes overlap", async () => {
		app.activeFile = app.vault.addNote("Trip.md", "![[photo.png]]");
		await view.onOpen();

		void view.refresh();
		void view.refresh();
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
