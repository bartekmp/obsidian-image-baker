import { isImagePath } from "./mime";

interface BaseLink {
	/** Offset of the first character of the link in the note content. */
	start: number;
	/** Offset just past the last character of the link. */
	end: number;
	/** The exact source text of the link. */
	raw: string;
	/** Display parameters carried after a pipe, e.g. ["300"] for a width. */
	params: string[];
}

/** An Obsidian wiki-style image embed: `![[photo.png|300]]`. */
export interface WikiImageLink extends BaseLink {
	kind: "wiki";
	linkpath: string;
}

/** A markdown image pointing at a vault file: `![alt|300](photo.png)`. */
export interface MarkdownImageLink extends BaseLink {
	kind: "markdown";
	alt: string;
	target: string;
}

/** A markdown image carrying an inline Base64 payload. */
export interface EmbeddedImage extends BaseLink {
	kind: "embedded";
	alt: string;
	mime: string;
	base64: string;
	/** Offset of the first character of the Base64 payload. */
	base64Start: number;
	/** Offset just past the last character of the Base64 payload. */
	base64End: number;
}

export type ImageFileLink = WikiImageLink | MarkdownImageLink;
export type AnyImageLink = ImageFileLink | EmbeddedImage;

export interface Replacement {
	start: number;
	end: number;
	text: string;
}

const WIKI_IMAGE_PATTERN = /!\[\[([^[\]\n]+)\]\]/g;
const MARKDOWN_IMAGE_PATTERN =
	/!\[([^[\]\n]*)\]\(\s*(<[^<>\n]*>|[^()\s]+)(?:\s+"[^"\n]*")?\s*\)/g;
const EMBEDDED_IMAGE_PATTERN =
	/!\[([^[\]\n]*)\]\(\s*data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+?)\s*\)/gid;
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Replaces fenced code blocks and inline code with whitespace of the same
 * length, so links inside code are never matched while offsets stay valid.
 */
export function maskCodeRegions(content: string): string {
	const blank = (match: string): string => match.replace(/[^\n]/g, " ");
	return content
		.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank)
		.replace(/`[^`\n]*`/g, blank);
}

function safeDecodeUriComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/** Finds wiki and markdown links that point at image files in the vault. */
export function findImageFileLinks(content: string): ImageFileLink[] {
	const masked = maskCodeRegions(content);
	const links: ImageFileLink[] = [];

	for (const match of masked.matchAll(WIKI_IMAGE_PATTERN)) {
		const [linkpath = "", ...params] = (match[1] ?? "").split("|");
		const target = linkpath.split("#")[0]?.trim() ?? "";
		if (!isImagePath(target)) {
			continue;
		}
		links.push({
			kind: "wiki",
			linkpath: target,
			params,
			start: match.index,
			end: match.index + match[0].length,
			raw: content.slice(match.index, match.index + match[0].length),
		});
	}

	for (const match of masked.matchAll(MARKDOWN_IMAGE_PATTERN)) {
		let target = match[2] ?? "";
		if (target.startsWith("<") && target.endsWith(">")) {
			target = target.slice(1, -1);
		}
		if (URI_SCHEME_PATTERN.test(target)) {
			continue;
		}
		target = safeDecodeUriComponent(target);
		if (!isImagePath(target)) {
			continue;
		}
		const [alt = "", ...params] = (match[1] ?? "").split("|");
		links.push({
			kind: "markdown",
			alt,
			target,
			params,
			start: match.index,
			end: match.index + match[0].length,
			raw: content.slice(match.index, match.index + match[0].length),
		});
	}

	return links.sort((a, b) => a.start - b.start);
}

/** Finds markdown images whose target is an inline Base64 data URI. */
export function findEmbeddedImages(content: string): EmbeddedImage[] {
	const masked = maskCodeRegions(content);
	const images: EmbeddedImage[] = [];

	for (const match of masked.matchAll(EMBEDDED_IMAGE_PATTERN)) {
		const mime = (match[2] ?? "").toLowerCase();
		if (!mime.startsWith("image/")) {
			continue;
		}
		const [alt = "", ...params] = (match[1] ?? "").split("|");
		const [base64Start, base64End] = match.indices?.[3] ?? [
			match.index,
			match.index,
		];
		images.push({
			kind: "embedded",
			alt,
			params,
			mime,
			base64: match[3] ?? "",
			base64Start,
			base64End,
			start: match.index,
			end: match.index + match[0].length,
			raw: content.slice(match.index, match.index + match[0].length),
		});
	}

	return images;
}

const DATA_URI_SRC_PATTERN =
	/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([\s\S]*)$/i;

/**
 * Finds the embedded image whose payload matches a rendered `src`
 * attribute, e.g. to map an image in reading view back to its markdown.
 */
export function findEmbedBySrc(
	content: string,
	src: string,
): EmbeddedImage | null {
	const match = DATA_URI_SRC_PATTERN.exec(src.trim());
	if (!match) {
		return null;
	}
	const mime = (match[1] ?? "").toLowerCase();
	const payload = (match[2] ?? "").replace(/\s+/g, "");
	return (
		findEmbeddedImages(content).find(
			(image) =>
				image.mime === mime &&
				image.base64.replace(/\s+/g, "") === payload,
		) ?? null
	);
}

/** Returns the image link (of any kind) covering the given offset, if any. */
export function findLinkAtOffset(
	content: string,
	offset: number,
): AnyImageLink | null {
	const all: AnyImageLink[] = [
		...findImageFileLinks(content),
		...findEmbeddedImages(content),
	];
	return all.find((link) => link.start <= offset && offset <= link.end) ?? null;
}

/** Applies non-overlapping replacements to content in a single pass. */
export function applyReplacements(
	content: string,
	replacements: Replacement[],
): string {
	const ordered = [...replacements].sort((a, b) => a.start - b.start);
	for (let i = 1; i < ordered.length; i++) {
		const previous = ordered[i - 1];
		const current = ordered[i];
		if (previous && current && current.start < previous.end) {
			throw new Error("Overlapping replacements are not allowed");
		}
	}
	let result = "";
	let cursor = 0;
	for (const { start, end, text } of ordered) {
		result += content.slice(cursor, start) + text;
		cursor = end;
	}
	return result + content.slice(cursor);
}

/**
 * Builds an inline embed. The original file name (plus display parameters)
 * is stored in the alt text so extraction can restore it later.
 */
export function buildEmbeddedImageMarkdown(
	filename: string,
	params: string[],
	mime: string,
	base64: string,
): string {
	const alt = [filename, ...params].join("|");
	return `![${alt}](data:${mime};base64,${base64})`;
}

function encodeMarkdownTarget(path: string): string {
	return encodeURI(path).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

/** Builds a link to an image file, in the requested style. */
export function buildImageFileLink(
	linkpath: string,
	params: string[],
	style: "wiki" | "markdown",
): string {
	if (style === "markdown") {
		return `![${params.join("|")}](${encodeMarkdownTarget(linkpath)})`;
	}
	const suffix = params.map((param) => `|${param}`).join("");
	return `![[${linkpath}${suffix}]]`;
}
