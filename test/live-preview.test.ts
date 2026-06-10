// @vitest-environment happy-dom
import type { PluginManifest } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { bytesToBase64 } from "../src/lib/base64";
import ImageBakerPlugin from "../src/main";
import { FakeApp, FakeEditor, sampleBytes } from "./helpers";
import { Plugin as MockPlugin } from "./mocks/obsidian";

const manifest = { id: "image-baker", name: "Image Baker" } as unknown as PluginManifest;
const base64 = bytesToBase64(sampleBytes(16));

describe("right-clicking rendered images in Live Preview", () => {
	let app: FakeApp;
	let plugin: ImageBakerPlugin;

	function fireContextMenu(img: HTMLImageElement): void {
		const handler = (plugin as unknown as MockPlugin).domEvents.find(
			(event) => event.type === "contextmenu",
		)?.handler;
		handler?.({ target: img });
	}

	function editorImage(src: string): HTMLImageElement {
		const editorEl = document.createElement("div");
		editorEl.className = "cm-content";
		const img = document.createElement("img");
		img.setAttribute("src", src);
		editorEl.appendChild(img);
		document.body.appendChild(editorEl);
		return img;
	}

	beforeEach(async () => {
		document.body.innerHTML = "";
		app = new FakeApp();
		plugin = new ImageBakerPlugin(app.asApp(), manifest);
		await plugin.onload();
	});

	it("selects the markdown of a clicked baked image", () => {
		const content = `text ![photo.png](data:image/png;base64,${base64})`;
		const note = app.vault.addNote("Trip.md", content);
		const editor = new FakeEditor(content);
		app.workspace.activeEditor = { editor: editor.asEditor(), file: note };

		fireContextMenu(editorImage(`data:image/png;base64,${base64}`));

		expect(editor.selectionRange).toEqual({
			from: content.indexOf("!["),
			to: content.length,
		});
	});

	it("selects the markdown of a clicked file image via its resource path", () => {
		app.vault.addBinary("pics/photo.png", sampleBytes(8));
		const content = "before ![[photo.png]] after";
		const note = app.vault.addNote("Trip.md", content);
		const editor = new FakeEditor(content);
		app.workspace.activeEditor = { editor: editor.asEditor(), file: note };

		fireContextMenu(editorImage("app://vault/pics/photo.png?1"));

		expect(editor.selectionRange).toEqual({
			from: content.indexOf("![["),
			to: content.indexOf("]]") + 2,
		});
	});

	it("ignores images outside the editor", () => {
		const content = `![photo.png](data:image/png;base64,${base64})`;
		const note = app.vault.addNote("Trip.md", content);
		const editor = new FakeEditor(content);
		app.workspace.activeEditor = { editor: editor.asEditor(), file: note };

		const img = document.createElement("img");
		img.setAttribute("src", `data:image/png;base64,${base64}`);
		document.body.appendChild(img);
		fireContextMenu(img);

		expect(editor.selectionRange).toBeNull();
	});

	it("leaves the selection alone for unmatched sources", () => {
		const content = "no images here";
		const note = app.vault.addNote("Trip.md", content);
		const editor = new FakeEditor(content);
		app.workspace.activeEditor = { editor: editor.asEditor(), file: note };

		fireContextMenu(editorImage("app://vault/unknown.png?1"));

		expect(editor.selectionRange).toBeNull();
	});
});
