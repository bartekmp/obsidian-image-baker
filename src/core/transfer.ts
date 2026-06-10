import { bytesToBase64 } from "../lib/base64";
import { matchExtensionToMime, sanitizeFilename } from "../lib/filename";
import { buildEmbeddedImageMarkdown } from "../lib/markdown";
import { extensionFromMime, isImagePath } from "../lib/mime";
import type { ImageBakerSettings } from "../settings";
import { canvasReencode, optimizeImage, type Reencoder } from "./optimize";

/** Structural subset of the DOM File used here, kept small for testing. */
export interface TransferFile {
	name: string;
	type: string;
	size: number;
	arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * Placeholder names that clipboard managers and screenshot tools assign;
 * these carry no information worth restoring on extraction.
 */
const GENERIC_NAME_PATTERN =
	/^(image|pasted ?image|unknown|untitled|screenshot)( ?\d*)?\.[a-z0-9]+$/i;

/**
 * Decides whether a paste/drop should be intercepted and baked into the
 * note. Conservative on purpose: every transferred file must be a
 * supported image within the size limit, otherwise the whole transfer is
 * left to Obsidian's default handling so nothing is half-processed.
 */
export function shouldEmbedTransfer(
	files: readonly TransferFile[],
	settings: ImageBakerSettings,
): boolean {
	if (files.length === 0) {
		return false;
	}
	return files.every((file) => {
		if (!file.type.toLowerCase().startsWith("image/")) {
			return false;
		}
		if (extensionFromMime(file.type) === null) {
			return false;
		}
		if (
			settings.maxEmbedFileSizeKB > 0 &&
			file.size > settings.maxEmbedFileSizeKB * 1024
		) {
			return false;
		}
		return true;
	});
}

function timestampSlug(date: Date): string {
	const pad = (value: number): string => String(value).padStart(2, "0");
	return (
		`${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
		`-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
	);
}

/**
 * Picks the file name recorded in the embed: the original name when it is
 * meaningful (e.g. a dropped file), otherwise a timestamped name derived
 * from the parent note (e.g. a pasted screenshot).
 */
export function transferFilename(
	originalName: string,
	noteBasename: string,
	mime: string,
	now: Date,
	index = 0,
	total = 1,
): string {
	const sanitized = sanitizeFilename(originalName);
	if (
		sanitized !== "" &&
		isImagePath(sanitized) &&
		!GENERIC_NAME_PATTERN.test(sanitized)
	) {
		return sanitized;
	}
	const extension = extensionFromMime(mime) ?? "png";
	const base = sanitizeFilename(noteBasename) || "image";
	const suffix = total > 1 ? ` ${index + 1}` : "";
	return `${base} ${timestampSlug(now)}${suffix}.${extension}`;
}

/**
 * Builds the markdown embeds for transferred images, one per line. The
 * note's folder is recorded in the alt text, so a later extraction
 * places the file next to the note instead of in the vault root.
 */
export async function buildTransferEmbeds(
	files: readonly TransferFile[],
	noteBasename: string,
	noteFolder: string,
	settings: ImageBakerSettings,
	now = new Date(),
	reencode: Reencoder = canvasReencode,
): Promise<string> {
	const prefix = noteFolder !== "" && noteFolder !== "/" ? `${noteFolder}/` : "";
	const parts: string[] = [];
	for (const [index, file] of files.entries()) {
		let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
		let mime = file.type.toLowerCase();
		const optimized = await optimizeImage(bytes, mime, settings, reencode);
		if (optimized.changed) {
			bytes = optimized.bytes;
			mime = optimized.mime;
		}
		const name = matchExtensionToMime(
			transferFilename(file.name, noteBasename, mime, now, index, files.length),
			mime,
		);
		parts.push(
			buildEmbeddedImageMarkdown(
				`${prefix}${name}`,
				[],
				mime,
				bytesToBase64(bytes),
			),
		);
	}
	return parts.join("\n");
}
