import { toArrayBuffer } from "../lib/bytes";
import type { ImageBakerSettings } from "../settings";

/**
 * Formats that can be safely re-encoded through a canvas. SVG (vector),
 * GIF (animation), and AVIF are left untouched.
 */
const OPTIMIZABLE_MIMES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/bmp",
]);

/**
 * Re-encodes image bytes to the target format/quality, downscaling to
 * `maxWidth` when it is positive. Returns null when re-encoding is not
 * possible. `quality` is in the 0..1 range.
 */
export type Reencoder = (
	bytes: Uint8Array,
	sourceMime: string,
	targetMime: string,
	quality: number,
	maxWidth: number,
) => Promise<Uint8Array | null>;

export interface OptimizedImage {
	bytes: Uint8Array;
	mime: string;
	changed: boolean;
}

/* v8 ignore start -- requires a browser canvas; exercised inside Obsidian */
export const canvasReencode: Reencoder = async (
	bytes,
	sourceMime,
	targetMime,
	quality,
	maxWidth,
) => {
	const bitmap = await createImageBitmap(
		new Blob([toArrayBuffer(bytes)], { type: sourceMime }),
	);
	try {
		const scale =
			maxWidth > 0 && bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
		const canvas = activeDocument.createElement("canvas");
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		const context = canvas.getContext("2d");
		if (!context) {
			return null;
		}
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, targetMime, quality),
		);
		// toBlob silently falls back to PNG for unsupported formats.
		if (!blob || blob.type !== targetMime) {
			return null;
		}
		return new Uint8Array(await blob.arrayBuffer());
	} finally {
		bitmap.close();
	}
};
/* v8 ignore stop */

/**
 * Optionally re-encodes an image before it is baked into a note. The
 * result is only accepted when it is actually smaller than the original;
 * any re-encoding failure falls back to the unchanged input.
 */
export async function optimizeImage(
	bytes: Uint8Array,
	mime: string,
	settings: ImageBakerSettings,
	reencode: Reencoder = canvasReencode,
): Promise<OptimizedImage> {
	const source = mime.toLowerCase();
	const unchanged: OptimizedImage = { bytes, mime: source, changed: false };
	if (!settings.optimizeImages || !OPTIMIZABLE_MIMES.has(source)) {
		return unchanged;
	}
	const target =
		settings.optimizeFormat === "jpeg" ? "image/jpeg" : "image/webp";
	const quality =
		Math.min(100, Math.max(1, settings.optimizeQuality)) / 100;
	let optimized: Uint8Array | null;
	try {
		optimized = await reencode(
			bytes,
			source,
			target,
			quality,
			settings.optimizeMaxWidth,
		);
	} catch {
		optimized = null;
	}
	if (!optimized || optimized.length >= bytes.length) {
		return unchanged;
	}
	return { bytes: optimized, mime: target, changed: true };
}
