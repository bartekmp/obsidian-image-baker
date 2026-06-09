import type { PluginManifest } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { bytesToBase64 } from "../src/lib/base64";
import ImageBakerPlugin from "../src/main";
import { BatchModal } from "../src/ui/batch-modal";
import { FakeApp, flushPromises, sampleBytes } from "./helpers";
import {
	Notice as MockNotice,
	Setting as MockSetting,
	type FakeElement,
	type Modal as MockModal,
} from "./mocks/obsidian";

const manifest = { id: "image-baker", name: "Image Baker" } as unknown as PluginManifest;
const bytes = sampleBytes(64);
const base64 = bytesToBase64(bytes);

function contentOf(modal: BatchModal): FakeElement {
	return (modal as unknown as MockModal).contentEl;
}

function summaryOf(modal: BatchModal): string {
	return (
		contentOf(modal)
			.findAll("p")
			.find((el) => el.cls.includes("summary"))?.text ?? ""
	);
}

function buttonOf(modal: BatchModal, label: string): FakeElement {
	const button = contentOf(modal)
		.findAll("button")
		.find((el) => el.text === label);
	if (!button) {
		throw new Error(`No button labeled "${label}"`);
	}
	return button;
}

describe("BatchModal", () => {
	let app: FakeApp;
	let plugin: ImageBakerPlugin;

	beforeEach(async () => {
		MockSetting.reset();
		MockNotice.reset();
		app = new FakeApp();
		plugin = new ImageBakerPlugin(app.asApp(), manifest);
		await plugin.loadSettings();
	});

	it("shows a dry-run summary on open", async () => {
		app.vault.addBinary("pics/a.png", bytes);
		app.vault.addNote("pics/One.md", "![[a.png]]");
		const modal = new BatchModal(app.asApp(), plugin, "embed");

		modal.open();
		await flushPromises();

		expect(summaryOf(modal)).toBe("Found 1 embeddable image (~64 B) in 1 note.");
	});

	it("offers a folder scope only when the active note sits in a folder", async () => {
		app.vault.addNote("Root.md", "");
		app.activeFile = app.vault.files.get("Root.md") ?? null;
		const modal = new BatchModal(app.asApp(), plugin, "embed");
		modal.open();
		await flushPromises();

		const scope = MockSetting.instances.find((s) => s.name === "Scope");
		expect(Object.keys(scope?.dropdowns[0]?.options ?? {})).toEqual(["vault"]);
	});

	it("rescans when the scope changes to the current folder", async () => {
		app.vault.addBinary("journal/a.png", bytes);
		app.vault.addBinary("b.png", bytes);
		const note = app.vault.addNote("journal/One.md", "![[a.png]]");
		app.vault.addNote("Two.md", "![[b.png]]");
		app.activeFile = note;
		const modal = new BatchModal(app.asApp(), plugin, "embed");
		modal.open();
		await flushPromises();
		expect(summaryOf(modal)).toContain("2 embeddable images");

		const scope = MockSetting.instances.find((s) => s.name === "Scope");
		await scope?.dropdowns[0]?.__change("folder");
		await flushPromises();

		expect(summaryOf(modal)).toBe("Found 1 embeddable image (~64 B) in 1 note.");
	});

	it("runs the conversion, notifies, and closes", async () => {
		app.vault.addBinary("a.png", bytes);
		app.vault.addNote("One.md", "![[a.png]]");
		const modal = new BatchModal(app.asApp(), plugin, "embed");
		modal.open();
		await flushPromises();

		buttonOf(modal, "Bake images").onclick?.({});
		await flushPromises();

		expect(app.vault.contents.get("One.md")).toContain("data:image/png;base64,");
		expect(MockNotice.messages).toEqual([
			"Embedded 1 image across 1 note, trashed 1 source file.",
		]);
		expect((modal as unknown as MockModal).closed).toBe(true);
	});

	it("extracts in the extract direction", async () => {
		app.vault.addNote("One.md", `![a.png](data:image/png;base64,${base64})`);
		const modal = new BatchModal(app.asApp(), plugin, "extract");
		modal.open();
		await flushPromises();

		buttonOf(modal, "Extract images").onclick?.({});
		await flushPromises();

		expect(app.vault.contents.get("One.md")).toBe("![[a.png]]");
		expect(MockNotice.messages).toEqual(["Extracted 1 image across 1 note."]);
	});

	it("does nothing when the plan is empty", async () => {
		app.vault.addNote("One.md", "no images");
		const modal = new BatchModal(app.asApp(), plugin, "embed");
		modal.open();
		await flushPromises();

		buttonOf(modal, "Bake images").onclick?.({});
		await flushPromises();

		expect(MockNotice.messages).toEqual([]);
		expect((modal as unknown as MockModal).closed).toBe(false);
	});

	it("closes without converting when cancelled", async () => {
		app.vault.addBinary("a.png", bytes);
		app.vault.addNote("One.md", "![[a.png]]");
		const modal = new BatchModal(app.asApp(), plugin, "embed");
		modal.open();
		await flushPromises();

		buttonOf(modal, "Cancel").onclick?.({});

		expect((modal as unknown as MockModal).closed).toBe(true);
		expect(app.vault.contents.get("One.md")).toBe("![[a.png]]");
	});
});
