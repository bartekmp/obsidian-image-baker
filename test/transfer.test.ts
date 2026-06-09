import { describe, expect, it } from "vitest";
import {
	buildTransferEmbeds,
	shouldEmbedTransfer,
	transferFilename,
	type TransferFile,
} from "../src/core/transfer";
import { bytesToBase64 } from "../src/lib/base64";
import { DEFAULT_SETTINGS, type ImageBakerSettings } from "../src/settings";
import { sampleBytes } from "./helpers";

const NOW = new Date(2026, 5, 9, 14, 30, 5);

function makeTransferFile(
	name: string,
	type: string,
	bytes: Uint8Array = sampleBytes(8),
): TransferFile {
	return {
		name,
		type,
		size: bytes.length,
		arrayBuffer: (): Promise<ArrayBuffer> =>
			Promise.resolve(new Uint8Array(bytes).buffer),
	};
}

function makeSettings(
	overrides: Partial<ImageBakerSettings> = {},
): ImageBakerSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("shouldEmbedTransfer", () => {
	it("rejects empty transfers", () => {
		expect(shouldEmbedTransfer([], makeSettings())).toBe(false);
	});

	it("accepts supported images", () => {
		const files = [
			makeTransferFile("a.png", "image/png"),
			makeTransferFile("b.jpg", "image/jpeg"),
		];
		expect(shouldEmbedTransfer(files, makeSettings())).toBe(true);
	});

	it("rejects the whole transfer when any file is not an image", () => {
		const files = [
			makeTransferFile("a.png", "image/png"),
			makeTransferFile("doc.pdf", "application/pdf"),
		];
		expect(shouldEmbedTransfer(files, makeSettings())).toBe(false);
	});

	it("rejects unsupported image formats", () => {
		expect(
			shouldEmbedTransfer(
				[makeTransferFile("a.tiff", "image/tiff")],
				makeSettings(),
			),
		).toBe(false);
	});

	it("rejects the whole transfer when any file is above the size limit", () => {
		const files = [
			makeTransferFile("small.png", "image/png", sampleBytes(100)),
			makeTransferFile("big.png", "image/png", sampleBytes(2048)),
		];
		expect(
			shouldEmbedTransfer(files, makeSettings({ maxEmbedFileSizeKB: 1 })),
		).toBe(false);
		expect(shouldEmbedTransfer(files, makeSettings())).toBe(true);
	});
});

describe("transferFilename", () => {
	it("keeps meaningful original names", () => {
		expect(transferFilename("holiday photo.png", "Trip", "image/png", NOW)).toBe(
			"holiday photo.png",
		);
	});

	it("replaces generic clipboard names with a note-derived timestamp name", () => {
		expect(transferFilename("image.png", "Trip", "image/png", NOW)).toBe(
			"Trip 20260609-143005.png",
		);
		expect(transferFilename("Pasted image 3.png", "Trip", "image/png", NOW)).toBe(
			"Trip 20260609-143005.png",
		);
	});

	it("generates a name when the original is missing or not an image name", () => {
		expect(transferFilename("", "Trip", "image/jpeg", NOW)).toBe(
			"Trip 20260609-143005.jpg",
		);
		expect(transferFilename("clipboard", "Trip", "image/png", NOW)).toBe(
			"Trip 20260609-143005.png",
		);
	});

	it("numbers generated names within multi-file transfers", () => {
		expect(transferFilename("image.png", "Trip", "image/png", NOW, 1, 3)).toBe(
			"Trip 20260609-143005 2.png",
		);
	});

	it("sanitizes hostile original names", () => {
		expect(transferFilename('a<b>:"|?.png', "Trip", "image/png", NOW)).toBe(
			"ab.png",
		);
	});
});

describe("buildTransferEmbeds", () => {
	it("builds one embed per file, one per line", async () => {
		const bytes = sampleBytes(16);
		const files = [
			makeTransferFile("photo.png", "image/png", bytes),
			makeTransferFile("image.png", "image/png", bytes),
		];

		const markdown = await buildTransferEmbeds(files, "Trip", NOW);
		const lines = markdown.split("\n");

		expect(lines).toEqual([
			`![photo.png](data:image/png;base64,${bytesToBase64(bytes)})`,
			`![Trip 20260609-143005 2.png](data:image/png;base64,${bytesToBase64(bytes)})`,
		]);
	});

	it("normalizes MIME casing", async () => {
		const markdown = await buildTransferEmbeds(
			[makeTransferFile("a.png", "IMAGE/PNG")],
			"Trip",
			NOW,
		);
		expect(markdown).toContain("data:image/png;base64,");
	});
});
