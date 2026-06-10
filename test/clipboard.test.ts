import { describe, expect, it, vi } from "vitest";
import { copyEmbeddedImage, type ClipboardImageWriter } from "../src/core/clipboard";
import type { Reencoder } from "../src/core/optimize";
import { bytesToBase64 } from "../src/lib/base64";
import { findEmbeddedImages, type EmbeddedImage } from "../src/lib/markdown";
import { sampleBytes } from "./helpers";

const bytes = sampleBytes(24);

function makeEmbed(mime: string): EmbeddedImage {
	const embed = findEmbeddedImages(
		`![photo](data:${mime};base64,${bytesToBase64(bytes)})`,
	)[0];
	if (!embed) {
		throw new Error("Failed to build test embed");
	}
	return embed;
}

describe("copyEmbeddedImage", () => {
	it("writes PNG embeds to the clipboard directly", async () => {
		const write = vi.fn<ClipboardImageWriter>().mockResolvedValue();
		const reencode = vi.fn<Reencoder>();

		await copyEmbeddedImage(makeEmbed("image/png"), write, reencode);

		expect(write).toHaveBeenCalledWith("image/png", bytes);
		expect(reencode).not.toHaveBeenCalled();
	});

	it("converts non-PNG embeds to PNG before writing", async () => {
		const converted = sampleBytes(10);
		const write = vi.fn<ClipboardImageWriter>().mockResolvedValue();
		const reencode = vi.fn<Reencoder>().mockResolvedValue(converted);

		await copyEmbeddedImage(makeEmbed("image/webp"), write, reencode);

		expect(reencode).toHaveBeenCalledWith(bytes, "image/webp", "image/png", 1, 0);
		expect(write).toHaveBeenCalledWith("image/png", converted);
	});

	it("throws when conversion is not possible", async () => {
		const write = vi.fn<ClipboardImageWriter>();
		const reencode = vi.fn<Reencoder>().mockResolvedValue(null);

		await expect(
			copyEmbeddedImage(makeEmbed("image/svg+xml"), write, reencode),
		).rejects.toThrow('Cannot convert "image/svg+xml"');
		expect(write).not.toHaveBeenCalled();
	});
});
