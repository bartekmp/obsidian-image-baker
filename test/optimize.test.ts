import { describe, expect, it, vi } from "vitest";
import { optimizeImage, type Reencoder } from "../src/core/optimize";
import { DEFAULT_SETTINGS, type ImageBakerSettings } from "../src/settings";
import { sampleBytes } from "./helpers";

const bytes = sampleBytes(100);

function makeSettings(
	overrides: Partial<ImageBakerSettings> = {},
): ImageBakerSettings {
	return { ...DEFAULT_SETTINGS, optimizeImages: true, ...overrides };
}

function reencoderReturning(result: Uint8Array<ArrayBuffer> | null): Reencoder {
	return vi.fn<Reencoder>().mockResolvedValue(result);
}

describe("optimizeImage", () => {
	it("does nothing when optimization is disabled", async () => {
		const reencode = reencoderReturning(sampleBytes(10));
		const result = await optimizeImage(
			bytes,
			"image/png",
			makeSettings({ optimizeImages: false }),
			reencode,
		);
		expect(result).toEqual({ bytes, mime: "image/png", changed: false });
		expect(reencode).not.toHaveBeenCalled();
	});

	it("never re-encodes SVG, GIF, or AVIF", async () => {
		const reencode = reencoderReturning(sampleBytes(10));
		for (const mime of ["image/svg+xml", "image/gif", "image/avif"]) {
			const result = await optimizeImage(bytes, mime, makeSettings(), reencode);
			expect(result.changed).toBe(false);
		}
		expect(reencode).not.toHaveBeenCalled();
	});

	it("accepts a smaller re-encoded image with the target MIME type", async () => {
		const smaller = sampleBytes(40);
		const result = await optimizeImage(
			bytes,
			"image/PNG",
			makeSettings(),
			reencoderReturning(smaller),
		);
		expect(result).toEqual({ bytes: smaller, mime: "image/webp", changed: true });
	});

	it("targets JPEG when configured", async () => {
		const reencode = reencoderReturning(sampleBytes(40));
		const result = await optimizeImage(
			bytes,
			"image/png",
			makeSettings({ optimizeFormat: "jpeg" }),
			reencode,
		);
		expect(result.mime).toBe("image/jpeg");
		expect(reencode).toHaveBeenCalledWith(
			bytes,
			"image/png",
			"image/jpeg",
			0.75,
			0,
		);
	});

	it("clamps the quality into the 0..1 range and forwards the max width", async () => {
		const reencode = reencoderReturning(sampleBytes(40));
		await optimizeImage(
			bytes,
			"image/png",
			makeSettings({ optimizeQuality: 250, optimizeMaxWidth: 800 }),
			reencode,
		);
		expect(reencode).toHaveBeenCalledWith(
			bytes,
			"image/png",
			"image/webp",
			1,
			800,
		);
	});

	it("rejects results that are not smaller", async () => {
		const result = await optimizeImage(
			bytes,
			"image/png",
			makeSettings(),
			reencoderReturning(sampleBytes(100)),
		);
		expect(result).toEqual({ bytes, mime: "image/png", changed: false });
	});

	it("falls back to the original when re-encoding returns nothing", async () => {
		const result = await optimizeImage(
			bytes,
			"image/png",
			makeSettings(),
			reencoderReturning(null),
		);
		expect(result.changed).toBe(false);
	});

	it("falls back to the original when re-encoding throws", async () => {
		const reencode = vi
			.fn<Reencoder>()
			.mockRejectedValue(new Error("decode failed"));
		const result = await optimizeImage(
			bytes,
			"image/png",
			makeSettings(),
			reencode,
		);
		expect(result).toEqual({ bytes, mime: "image/png", changed: false });
	});
});
