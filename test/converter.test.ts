import { beforeEach, describe, expect, it } from "vitest";
import {
	embedImages,
	extractImages,
	formatEmbedReport,
	formatExtractReport,
} from "../src/core/converter";
import { bytesToBase64 } from "../src/lib/base64";
import { Logger } from "../src/lib/logger";
import { findEmbeddedImages, findImageFileLinks } from "../src/lib/markdown";
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

describe("embedImages", () => {
	let app: FakeApp;

	beforeEach(() => {
		app = new FakeApp();
	});

	it("replaces a wiki link with a Base64 embed carrying the file name", async () => {
		app.vault.addBinary("pics/photo.png", bytes);
		const note = app.vault.addNote("notes/Trip.md", "before ![[photo.png]] after");

		const report = await embedImages(app.asApp(), note, makeSettings(), logger);

		expect(report).toMatchObject({ embedded: 1, skipped: 0, failures: [] });
		expect(app.vault.contents.get("notes/Trip.md")).toBe(
			`before ![photo.png](data:image/png;base64,${base64}) after`,
		);
	});

	it("preserves display parameters", async () => {
		app.vault.addBinary("photo.png", bytes);
		const note = app.vault.addNote("Trip.md", "![[photo.png|300]]");

		await embedImages(app.asApp(), note, makeSettings(), logger);

		expect(app.vault.contents.get("Trip.md")).toBe(
			`![photo.png|300](data:image/png;base64,${base64})`,
		);
	});

	it("embeds markdown links with encoded targets", async () => {
		app.vault.addBinary("pics/my cat.jpg", bytes);
		const note = app.vault.addNote("Trip.md", "![cat](pics/my%20cat.png) x ![cat](pics/my%20cat.jpg)");

		const report = await embedImages(app.asApp(), note, makeSettings(), logger);

		expect(report.embedded).toBe(1);
		expect(app.vault.contents.get("Trip.md")).toContain(
			`![my cat.jpg](data:image/jpeg;base64,${base64})`,
		);
	});

	it("trashes the source file when nothing else references it", async () => {
		app.vault.addBinary("photo.png", bytes);
		const note = app.vault.addNote("Trip.md", "![[photo.png]]");

		const report = await embedImages(app.asApp(), note, makeSettings(), logger);

		expect(report.deleted).toBe(1);
		expect(app.trashed).toEqual(["photo.png"]);
	});

	it("keeps the source file when other notes reference it", async () => {
		app.vault.addBinary("photo.png", bytes);
		const note = app.vault.addNote("Trip.md", "![[photo.png]]");
		app.resolvedLinks["Other.md"] = { "photo.png": 1 };

		const report = await embedImages(app.asApp(), note, makeSettings(), logger);

		expect(report).toMatchObject({ embedded: 1, deleted: 0 });
		expect(app.trashed).toEqual([]);
	});

	it("keeps the source file when deletion is disabled", async () => {
		app.vault.addBinary("photo.png", bytes);
		const note = app.vault.addNote("Trip.md", "![[photo.png]]");

		const report = await embedImages(
			app.asApp(),
			note,
			makeSettings({ deleteSourceFiles: false }),
			logger,
		);

		expect(report.deleted).toBe(0);
		expect(app.trashed).toEqual([]);
	});

	it("keeps the source file when the note still references it elsewhere", async () => {
		app.vault.addBinary("photo.png", bytes);
		const note = app.vault.addNote(
			"Trip.md",
			"![[photo.png]] and also ```\nnothing\n``` ![[photo.png|100]]",
		);
		const link = findImageFileLinks(await app.vault.read(note))[0];

		const report = await embedImages(app.asApp(), note, makeSettings(), logger, link);

		expect(report.deleted).toBe(0);
		expect(app.trashed).toEqual([]);
		expect(app.vault.contents.get("Trip.md")).toContain("![[photo.png|100]]");
	});

	it("records a failure for unresolved links", async () => {
		const note = app.vault.addNote("Trip.md", "![[missing.png]]");

		const report = await embedImages(app.asApp(), note, makeSettings(), logger);

		expect(report.embedded).toBe(0);
		expect(report.failures).toEqual(['Could not resolve "missing.png"']);
		expect(app.vault.contents.get("Trip.md")).toBe("![[missing.png]]");
	});

	it("skips files above the configured size limit", async () => {
		app.vault.addBinary("big.png", sampleBytes(2048));
		const note = app.vault.addNote("Trip.md", "![[big.png]]");

		const report = await embedImages(
			app.asApp(),
			note,
			makeSettings({ maxEmbedFileSizeKB: 1 }),
			logger,
		);

		expect(report).toMatchObject({ embedded: 0, skipped: 1 });
		expect(app.vault.contents.get("Trip.md")).toBe("![[big.png]]");
	});

	it("embeds only the requested link when one is given", async () => {
		app.vault.addBinary("a.png", bytes);
		app.vault.addBinary("b.png", bytes);
		const note = app.vault.addNote("Trip.md", "![[a.png]] ![[b.png]]");
		const second = findImageFileLinks(await app.vault.read(note))[1];

		const report = await embedImages(
			app.asApp(),
			note,
			makeSettings(),
			logger,
			second,
		);

		expect(report.embedded).toBe(1);
		const content = app.vault.contents.get("Trip.md") ?? "";
		expect(content).toContain("![[a.png]]");
		expect(content).toContain(`![b.png](data:image/png;base64,${base64})`);
		expect(app.trashed).toEqual(["b.png"]);
	});

	it("replaces duplicate links once each and counts the image once", async () => {
		app.vault.addBinary("photo.png", bytes);
		const note = app.vault.addNote("Trip.md", "![[photo.png]] ![[photo.png]]");

		const report = await embedImages(app.asApp(), note, makeSettings(), logger);

		expect(report.embedded).toBe(1);
		const content = app.vault.contents.get("Trip.md") ?? "";
		expect(content.match(/data:image\/png;base64,/g)).toHaveLength(2);
		expect(app.trashed).toEqual(["photo.png"]);
	});

	it("ignores links inside code blocks", async () => {
		app.vault.addBinary("photo.png", bytes);
		const note = app.vault.addNote("Trip.md", "```\n![[photo.png]]\n```");

		const report = await embedImages(app.asApp(), note, makeSettings(), logger);

		expect(report.embedded).toBe(0);
		expect(app.vault.contents.get("Trip.md")).toBe("```\n![[photo.png]]\n```");
	});

	it("records a failure when the binary cannot be read", async () => {
		const broken = app.vault.addNote("Trip.md", "![[photo.png]]");
		// Register the image file without binary content to force a read error.
		app.vault.files.set("photo.png", app.vault.addBinary("tmp.png", bytes));
		const file = app.vault.files.get("photo.png");
		if (file) {
			file.path = "photo.png";
			file.name = "photo.png";
			file.extension = "png";
		}

		const report = await embedImages(app.asApp(), broken, makeSettings(), logger);

		expect(report.failures).toHaveLength(1);
		expect(report.failures[0]).toContain("Failed to read");
	});
});

describe("extractImages", () => {
	let app: FakeApp;

	beforeEach(() => {
		app = new FakeApp();
	});

	it("restores the original file name from the alt text", async () => {
		const note = app.vault.addNote(
			"notes/Trip.md",
			`![photo.png](data:image/png;base64,${base64})`,
		);

		const report = await extractImages(app.asApp(), note, makeSettings(), logger);

		expect(report).toMatchObject({
			extracted: 1,
			createdPaths: ["notes/photo.png"],
			failures: [],
		});
		expect(app.vault.binaries.get("notes/photo.png")).toEqual(bytes);
		expect(app.vault.contents.get("notes/Trip.md")).toBe("![[photo.png]]");
	});

	it("preserves display parameters on the restored link", async () => {
		const note = app.vault.addNote(
			"Trip.md",
			`![photo.png|300](data:image/png;base64,${base64})`,
		);

		await extractImages(app.asApp(), note, makeSettings(), logger);

		expect(app.vault.contents.get("Trip.md")).toBe("![[photo.png|300]]");
	});

	it("derives a name from the parent note when the alt is not a file name", async () => {
		const note = app.vault.addNote(
			"notes/Trip to Oslo.md",
			`![just a caption](data:image/jpeg;base64,${base64})`,
		);

		const report = await extractImages(app.asApp(), note, makeSettings(), logger);

		expect(report.createdPaths).toEqual(["notes/Trip to Oslo image 1.jpg"]);
	});

	it("deduplicates file names that already exist", async () => {
		app.vault.addBinary("notes/photo.png", sampleBytes(3));
		const note = app.vault.addNote(
			"notes/Trip.md",
			`![photo.png](data:image/png;base64,${base64})`,
		);

		const report = await extractImages(app.asApp(), note, makeSettings(), logger);

		expect(report.createdPaths).toEqual(["notes/photo 1.png"]);
		expect(app.vault.contents.get("notes/Trip.md")).toBe("![[photo 1.png]]");
	});

	it("uses markdown links when configured", async () => {
		const note = app.vault.addNote(
			"my notes/Trip.md",
			`![photo.png|300](data:image/png;base64,${base64})`,
		);

		await extractImages(
			app.asApp(),
			note,
			makeSettings({ linkStyle: "markdown" }),
			logger,
		);

		expect(app.vault.contents.get("my notes/Trip.md")).toBe(
			"![300](my%20notes/photo.png)",
		);
	});

	it("falls back to the note's folder when the attachment API is missing", async () => {
		app = new FakeApp({ attachmentApi: false });
		app.vault.addBinary("notes/photo.png", sampleBytes(3));
		const note = app.vault.addNote(
			"notes/Trip.md",
			`![photo.png](data:image/png;base64,${base64})`,
		);

		const report = await extractImages(app.asApp(), note, makeSettings(), logger);

		expect(report.createdPaths).toEqual(["notes/photo 1.png"]);
	});

	it("records a failure for unsupported image types", async () => {
		const note = app.vault.addNote(
			"Trip.md",
			`![x](data:image/tiff;base64,${base64})`,
		);

		const report = await extractImages(app.asApp(), note, makeSettings(), logger);

		expect(report.extracted).toBe(0);
		expect(report.failures).toEqual(['Unsupported image type "image/tiff"']);
	});

	it("records a failure for malformed Base64 and leaves the embed in place", async () => {
		const content = "![photo.png](data:image/png;base64,AAA)";
		const note = app.vault.addNote("Trip.md", content);

		const report = await extractImages(app.asApp(), note, makeSettings(), logger);

		expect(report.extracted).toBe(0);
		expect(report.failures).toHaveLength(1);
		expect(app.vault.contents.get("Trip.md")).toBe(content);
	});

	it("extracts only the requested embed when one is given", async () => {
		const note = app.vault.addNote(
			"Trip.md",
			`![a.png](data:image/png;base64,${base64}) ![b.png](data:image/png;base64,${base64})`,
		);
		const second = findEmbeddedImages(await app.vault.read(note))[1];

		const report = await extractImages(
			app.asApp(),
			note,
			makeSettings(),
			logger,
			second,
		);

		expect(report.createdPaths).toEqual(["b.png"]);
		const content = app.vault.contents.get("Trip.md") ?? "";
		expect(content).toContain("![a.png](data:image/png;base64,");
		expect(content).toContain("![[b.png]]");
	});

	it("creates one file for identical duplicate embeds", async () => {
		const note = app.vault.addNote(
			"Trip.md",
			`![a.png](data:image/png;base64,${base64}) ![a.png](data:image/png;base64,${base64})`,
		);

		const report = await extractImages(app.asApp(), note, makeSettings(), logger);

		expect(report.extracted).toBe(1);
		expect(app.vault.contents.get("Trip.md")).toBe("![[a.png]] ![[a.png]]");
	});
});

describe("round trip", () => {
	it("embedding then extracting restores the file name and bytes", async () => {
		const app = new FakeApp();
		app.vault.addBinary("pics/photo.png", bytes);
		const note = app.vault.addNote("pics/Trip.md", "![[photo.png|450]]");
		const settings = makeSettings();

		await embedImages(app.asApp(), note, settings, logger);
		expect(app.vault.files.has("pics/photo.png")).toBe(false);

		await extractImages(app.asApp(), note, settings, logger);
		expect(app.vault.binaries.get("pics/photo.png")).toEqual(bytes);
		expect(app.vault.contents.get("pics/Trip.md")).toBe("![[photo.png|450]]");
	});
});

describe("report formatting", () => {
	it("describes an empty embed run", () => {
		expect(
			formatEmbedReport({ embedded: 0, skipped: 0, deleted: 0, failures: [] }),
		).toBe("No embeddable images found in this note.");
	});

	it("describes a full embed run", () => {
		expect(
			formatEmbedReport({
				embedded: 2,
				skipped: 1,
				deleted: 1,
				failures: ["x"],
			}),
		).toBe("Embedded 2 images, trashed 1 source file, skipped 1, 1 failed.");
	});

	it("uses singular forms", () => {
		expect(
			formatEmbedReport({ embedded: 1, skipped: 0, deleted: 0, failures: [] }),
		).toBe("Embedded 1 image.");
	});

	it("describes an empty extract run", () => {
		expect(formatExtractReport({ extracted: 0, createdPaths: [], failures: [] })).toBe(
			"No embedded images found in this note.",
		);
	});

	it("describes an extract run with failures", () => {
		expect(
			formatExtractReport({
				extracted: 3,
				createdPaths: ["a", "b", "c"],
				failures: ["x"],
			}),
		).toBe("Extracted 3 images, 1 failed.");
	});
});
