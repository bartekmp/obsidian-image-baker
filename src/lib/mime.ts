/**
 * Image formats supported by Obsidian, mapped to their MIME types.
 * See https://help.obsidian.md/file-formats
 */
export const IMAGE_EXTENSION_TO_MIME: Readonly<Record<string, string>> = {
	avif: "image/avif",
	bmp: "image/bmp",
	gif: "image/gif",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	svg: "image/svg+xml",
	webp: "image/webp",
};

const MIME_TO_EXTENSION: Readonly<Record<string, string>> = {
	"image/avif": "avif",
	"image/bmp": "bmp",
	"image/gif": "gif",
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/svg+xml": "svg",
	"image/webp": "webp",
};

/** Returns the lowercased extension of a path, without the dot ("" if none). */
export function extensionFromPath(path: string): string {
	const name = path.split("/").pop() ?? "";
	const dot = name.lastIndexOf(".");
	if (dot <= 0 || dot === name.length - 1) {
		return "";
	}
	return name.slice(dot + 1).toLowerCase();
}

export function isImageExtension(extension: string): boolean {
	return extension.toLowerCase() in IMAGE_EXTENSION_TO_MIME;
}

export function isImagePath(path: string): boolean {
	return isImageExtension(extensionFromPath(path));
}

export function mimeFromExtension(extension: string): string | null {
	return IMAGE_EXTENSION_TO_MIME[extension.toLowerCase()] ?? null;
}

export function extensionFromMime(mime: string): string | null {
	return MIME_TO_EXTENSION[mime.toLowerCase()] ?? null;
}
