import {
	extensionFromMime,
	extensionFromPath,
	isImagePath,
	mimeFromExtension,
} from "./mime";

// eslint-disable-next-line no-control-regex
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/** Strips characters that are not allowed in vault file names. */
export function sanitizeFilename(name: string): string {
	return name
		.replace(INVALID_FILENAME_CHARS, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^\.+/, "");
}

/**
 * Recovers an image file name from the alt text of an embedded image.
 * Returns null when the alt text does not look like an image file name.
 */
export function filenameFromAlt(alt: string): string | null {
	const sanitized = sanitizeFilename(alt);
	if (sanitized === "" || !isImagePath(sanitized)) {
		return null;
	}
	return sanitized;
}

/**
 * Aligns a file name's extension with the given MIME type, e.g. after an
 * image was re-encoded to another format. Names whose extension already
 * matches the MIME type (including jpg/jpeg aliases) are kept as-is.
 */
export function matchExtensionToMime(filename: string, mime: string): string {
	const normalizedMime = mime.toLowerCase();
	if (mimeFromExtension(extensionFromPath(filename)) === normalizedMime) {
		return filename;
	}
	const extension = extensionFromMime(normalizedMime);
	if (!extension) {
		return filename;
	}
	const dot = filename.lastIndexOf(".");
	return dot > 0
		? `${filename.slice(0, dot + 1)}${extension}`
		: `${filename}.${extension}`;
}

/**
 * Builds a file name for an extracted image that has no recoverable name,
 * inheriting the parent note's base name.
 */
export function generateImageFilename(
	noteBasename: string,
	index: number,
	extension: string,
): string {
	const base = sanitizeFilename(noteBasename) || "image";
	return `${base} image ${index}.${extension}`;
}
