import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	formatBatchPlan,
	formatBatchResult,
	notesInScope,
	planBatch,
	runBatch,
} from "../src/core/batch";
import { bytesToBase64 } from "../src/lib/base64";
import { Logger } from "../src/lib/logger";
import { DEFAULT_SETTINGS, type ImageBakerSettings } from "../src/settings";
import { FakeApp, sampleBytes } from "./helpers";

const logger = new Logger("test", "off");
const bytes = sampleBytes(64);
const base64 = bytesToBase64(bytes);

function makeSettings(
	overrides: Partial<ImageBakerSettings> = {},
): ImageBakerSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("notesInScope", () => {
	let app: FakeApp;

	beforeEach(() => {
		app = new FakeApp();
		app.vault.addNote("Root.md", "");
		app.vault.addNote("journal/A.md", "");
		app.vault.addNote("journal/deep/B.md", "");
		app.vault.addNote("journals/C.md", "");
		app.vault.addBinary("journal/pic.png", bytes);
	});

	it("returns every markdown file for the vault scope", () => {
		expect(notesInScope(app.asApp(), null).map((f) => f.path)).toEqual([
			"Root.md",
			"journal/A.md",
			"journal/deep/B.md",
			"journals/C.md",
		]);
	});

	it("filters by folder prefix without matching sibling folders", () => {
		expect(notesInScope(app.asApp(), "journal").map((f) => f.path)).toEqual([
			"journal/A.md",
			"journal/deep/B.md",
		]);
	});

	it("treats the root folder as the whole vault", () => {
		expect(notesInScope(app.asApp(), "/")).toHaveLength(4);
	});
});

describe("planBatch", () => {
	let app: FakeApp;

	beforeEach(() => {
		app = new FakeApp();
	});

	it("plans embeddable images with their sizes", async () => {
		app.vault.addBinary("a.png", sampleBytes(100));
		app.vault.addBinary("b.png", sampleBytes(50));
		app.vault.addNote("One.md", "![[a.png]] ![[missing.png]]");
		app.vault.addNote("Two.md", "![[b.png]] and text");
		app.vault.addNote("Empty.md", "no images");

		const plan = await planBatch(
			app.asApp(),
			app.vault.getMarkdownFiles(),
			"embed",
			makeSettings(),
		);

		expect(plan).toMatchObject({ notes: 2, images: 2, bytes: 150 });
		expect(plan.files.map((f) => f.path)).toEqual(["One.md", "Two.md"]);
	});

	it("excludes oversized images from the embed plan", async () => {
		app.vault.addBinary("big.png", sampleBytes(4096));
		app.vault.addNote("One.md", "![[big.png]]");

		const plan = await planBatch(
			app.asApp(),
			app.vault.getMarkdownFiles(),
			"embed",
			makeSettings({ maxEmbedFileSizeKB: 1 }),
		);

		expect(plan).toMatchObject({ notes: 0, images: 0 });
	});

	it("plans embedded images with approximate sizes for extraction", async () => {
		app.vault.addNote(
			"One.md",
			`![a.png](data:image/png;base64,${base64}) ![b.png](data:image/png;base64,${base64})`,
		);

		const plan = await planBatch(
			app.asApp(),
			app.vault.getMarkdownFiles(),
			"extract",
			makeSettings(),
		);

		expect(plan).toMatchObject({ notes: 1, images: 2 });
		expect(plan.bytes).toBeGreaterThan(100);
	});
});

describe("runBatch", () => {
	let app: FakeApp;

	beforeEach(() => {
		app = new FakeApp();
	});

	it("embeds across notes and reports progress", async () => {
		app.vault.addBinary("a.png", bytes);
		app.vault.addBinary("b.png", bytes);
		app.vault.addNote("One.md", "![[a.png]]");
		app.vault.addNote("Two.md", "![[b.png]]");
		const onProgress = vi.fn();

		const result = await runBatch(
			app.asApp(),
			app.vault.getMarkdownFiles(),
			"embed",
			makeSettings(),
			logger,
			onProgress,
			() => false,
		);

		expect(result).toMatchObject({
			processedNotes: 2,
			images: 2,
			deleted: 2,
			aborted: false,
		});
		expect(onProgress.mock.calls).toEqual([
			[1, 2],
			[2, 2],
		]);
		expect(app.vault.contents.get("One.md")).toContain("data:image/png;base64,");
	});

	it("extracts across notes", async () => {
		app.vault.addNote("One.md", `![a.png](data:image/png;base64,${base64})`);

		const result = await runBatch(
			app.asApp(),
			app.vault.getMarkdownFiles(),
			"extract",
			makeSettings(),
			logger,
			() => undefined,
			() => false,
		);

		expect(result).toMatchObject({ processedNotes: 1, images: 1 });
		expect(app.vault.contents.get("One.md")).toBe("![[a.png]]");
	});

	it("stops between notes when aborted", async () => {
		app.vault.addBinary("a.png", bytes);
		app.vault.addBinary("b.png", bytes);
		app.vault.addNote("One.md", "![[a.png]]");
		app.vault.addNote("Two.md", "![[b.png]]");
		let processed = 0;

		const result = await runBatch(
			app.asApp(),
			app.vault.getMarkdownFiles(),
			"embed",
			makeSettings(),
			logger,
			() => processed++,
			() => processed >= 1,
		);

		expect(result.aborted).toBe(true);
		expect(result.processedNotes).toBe(1);
		expect(app.vault.contents.get("Two.md")).toBe("![[b.png]]");
	});

	it("records a failure and continues when a note cannot be processed", async () => {
		const broken = app.vault.addNote("Broken.md", "x");
		app.vault.contents.delete("Broken.md");
		app.vault.addBinary("a.png", bytes);
		app.vault.addNote("Good.md", "![[a.png]]");

		const result = await runBatch(
			app.asApp(),
			[broken, ...app.vault.getMarkdownFiles().filter((f) => f.path === "Good.md")],
			"embed",
			makeSettings(),
			logger,
			() => undefined,
			() => false,
		);

		expect(result.processedNotes).toBe(1);
		expect(result.images).toBe(1);
		expect(result.failures).toEqual(['Failed to process "Broken.md"']);
	});
});

describe("formatting", () => {
	it("formats plans", () => {
		expect(
			formatBatchPlan({ notes: 2, images: 3, bytes: 150_000, files: [] }, "embed"),
		).toBe("Found 3 embeddable images (~146 KB) in 2 notes.");
		expect(
			formatBatchPlan({ notes: 0, images: 0, bytes: 0, files: [] }, "extract"),
		).toBe("No embedded images found in this scope.");
	});

	it("formats results", () => {
		expect(
			formatBatchResult(
				{ processedNotes: 2, images: 3, deleted: 2, failures: [], aborted: false },
				"embed",
			),
		).toBe("Embedded 3 images across 2 notes, trashed 2 source files.");
		expect(
			formatBatchResult(
				{ processedNotes: 1, images: 1, deleted: 0, failures: ["x"], aborted: true },
				"extract",
			),
		).toBe("Extracted 1 image across 1 note, 1 failed (aborted).");
	});
});
