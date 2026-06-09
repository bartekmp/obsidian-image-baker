import { isImagePath } from "./mime";

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
