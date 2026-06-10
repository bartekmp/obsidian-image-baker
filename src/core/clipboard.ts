import { base64ToBytes } from "../lib/base64";
import type { EmbeddedImage } from "../lib/markdown";
import { canvasReencode, type Reencoder } from "./optimize";

export type ClipboardImageWriter = (
	mime: string,
	bytes: Uint8Array<ArrayBuffer>,
) => Promise<void>;

/* v8 ignore start -- requires the browser clipboard; exercised in Obsidian */
export const systemClipboardWriter: ClipboardImageWriter = async (
	mime,
	bytes,
) => {
	const item = new ClipboardItem({
		[mime]: new Blob([bytes], { type: mime }),
	});
	await navigator.clipboard.write([item]);
};
/* v8 ignore stop */

/**
 * Copies a baked image to the system clipboard. Browsers only accept PNG
 * for image clipboard writes, so other formats are converted first.
 */
export async function copyEmbeddedImage(
	embed: EmbeddedImage,
	write: ClipboardImageWriter = systemClipboardWriter,
	reencode: Reencoder = canvasReencode,
): Promise<void> {
	const bytes = base64ToBytes(embed.base64);
	if (embed.mime === "image/png") {
		await write("image/png", bytes);
		return;
	}
	const png = await reencode(bytes, embed.mime, "image/png", 1, 0);
	if (!png) {
		throw new Error(`Cannot convert "${embed.mime}" for the clipboard`);
	}
	await write("image/png", png);
}
