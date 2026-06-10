import { normalizePath, type App, type FileManager, type TFile } from "obsidian";
import { base64ToBytes, bytesToBase64 } from "../lib/base64";
import {
	filenameFromAlt,
	generateImageFilename,
	matchExtensionToMime,
} from "../lib/filename";
import type { Logger } from "../lib/logger";
import {
	applyReplacements,
	buildEmbeddedImageMarkdown,
	buildImageFileLink,
	findEmbeddedImages,
	findImageFileLinks,
	imageLinkTarget,
	type EmbeddedImage,
	type ImageFileLink,
} from "../lib/markdown";
import { plural } from "../lib/text";
import { extensionFromMime, mimeFromExtension } from "../lib/mime";
import type { ImageBakerSettings } from "../settings";
import { canvasReencode, optimizeImage, type Reencoder } from "./optimize";

export interface EmbedReport {
	embedded: number;
	skipped: number;
	deleted: number;
	failures: string[];
}

export interface ExtractReport {
	extracted: number;
	createdPaths: string[];
	failures: string[];
}

/**
 * Picks the occurrence closest to where the requested link was originally
 * found, in case the note contains the same link text more than once.
 */
function closestByRaw<T extends { raw: string; start: number }>(
	links: T[],
	only: T,
): T[] {
	return links
		.filter((link) => link.raw === only.raw)
		.sort(
			(a, b) =>
				Math.abs(a.start - only.start) - Math.abs(b.start - only.start),
		)
		.slice(0, 1);
}

function externalReferenceCount(
	app: App,
	targetPath: string,
	ownPath: string,
): number {
	let count = 0;
	for (const [source, targets] of Object.entries(
		app.metadataCache.resolvedLinks,
	)) {
		if (source === ownPath) {
			continue;
		}
		count += targets[targetPath] ?? 0;
	}
	return count;
}

async function noteStillReferences(
	app: App,
	note: TFile,
	targetPath: string,
): Promise<boolean> {
	const content = await app.vault.read(note);
	return findImageFileLinks(content).some(
		(link) =>
			app.metadataCache.getFirstLinkpathDest(imageLinkTarget(link), note.path)
				?.path === targetPath,
	);
}

type AttachmentPathResolver = FileManager & {
	getAvailablePathForAttachment?: (
		filename: string,
		sourcePath: string,
	) => Promise<string>;
};

async function availableAttachmentPath(
	app: App,
	filename: string,
	note: TFile,
): Promise<string> {
	const fileManager = app.fileManager as AttachmentPathResolver;
	if (typeof fileManager.getAvailablePathForAttachment === "function") {
		return normalizePath(
			await fileManager.getAvailablePathForAttachment(filename, note.path),
		);
	}
	// Fallback for older app versions: next to the note, deduplicated name.
	const folder =
		note.parent && note.parent.path !== "/" ? `${note.parent.path}/` : "";
	const dot = filename.lastIndexOf(".");
	const base = filename.slice(0, dot);
	const extension = filename.slice(dot + 1);
	let candidate = normalizePath(`${folder}${filename}`);
	let counter = 1;
	while (app.vault.getAbstractFileByPath(candidate)) {
		candidate = normalizePath(`${folder}${base} ${counter}.${extension}`);
		counter++;
	}
	return candidate;
}

/**
 * Converts image file links in a note into inline Base64 embeds.
 * When `only` is given, just that link is converted.
 */
export async function embedImages(
	app: App,
	note: TFile,
	settings: ImageBakerSettings,
	logger: Logger,
	only?: ImageFileLink,
	reencode: Reencoder = canvasReencode,
): Promise<EmbedReport> {
	const report: EmbedReport = {
		embedded: 0,
		skipped: 0,
		deleted: 0,
		failures: [],
	};
	const content = await app.vault.read(note);
	const links = only ? [only] : findImageFileLinks(content);
	const replacementByRaw = new Map<string, string>();
	const sources = new Map<string, TFile>();

	for (const link of links) {
		if (replacementByRaw.has(link.raw)) {
			continue;
		}
		const target = imageLinkTarget(link);
		const file = app.metadataCache.getFirstLinkpathDest(target, note.path);
		if (!file) {
			report.failures.push(`Could not resolve "${target}"`);
			logger.warn(`Could not resolve image link "${target}" in "${note.path}"`);
			continue;
		}
		const mime = mimeFromExtension(file.extension);
		if (!mime) {
			report.skipped++;
			logger.info(`Skipping "${file.path}": not a supported image format`);
			continue;
		}
		if (
			settings.maxEmbedFileSizeKB > 0 &&
			file.stat.size > settings.maxEmbedFileSizeKB * 1024
		) {
			report.skipped++;
			logger.info(
				`Skipping "${file.path}": larger than ${settings.maxEmbedFileSizeKB} KB`,
			);
			continue;
		}
		try {
			const data = await app.vault.readBinary(file);
			let payload = new Uint8Array(data);
			let payloadMime = mime;
			let filename = file.name;
			const optimized = await optimizeImage(
				payload,
				payloadMime,
				settings,
				reencode,
			);
			if (optimized.changed) {
				logger.debug(
					`Optimized "${file.path}": ${payload.length} -> ${optimized.bytes.length} bytes (${optimized.mime})`,
				);
				payload = optimized.bytes;
				payloadMime = optimized.mime;
				filename = matchExtensionToMime(filename, payloadMime);
			}
			const base64 = bytesToBase64(payload);
			replacementByRaw.set(
				link.raw,
				buildEmbeddedImageMarkdown(filename, link.params, payloadMime, base64),
			);
			sources.set(file.path, file);
			report.embedded++;
			logger.debug(`Embedded "${file.path}" (${payload.length} bytes)`);
		} catch (error) {
			report.failures.push(`Failed to read "${file.path}"`);
			logger.error(`Failed to read "${file.path}"`, error);
		}
	}

	if (replacementByRaw.size > 0) {
		await app.vault.process(note, (data) => {
			const found = only
				? closestByRaw(findImageFileLinks(data), only)
				: findImageFileLinks(data).filter((link) =>
						replacementByRaw.has(link.raw),
					);
			return applyReplacements(
				data,
				found.map((link) => ({
					start: link.start,
					end: link.end,
					text: replacementByRaw.get(link.raw) ?? link.raw,
				})),
			);
		});
	}

	if (settings.deleteSourceFiles) {
		for (const file of sources.values()) {
			if (externalReferenceCount(app, file.path, note.path) > 0) {
				logger.info(`Keeping "${file.path}": referenced by other notes`);
				continue;
			}
			if (await noteStillReferences(app, note, file.path)) {
				logger.info(`Keeping "${file.path}": still referenced in this note`);
				continue;
			}
			try {
				await app.fileManager.trashFile(file);
				report.deleted++;
				logger.debug(`Trashed "${file.path}"`);
			} catch (error) {
				report.failures.push(`Failed to delete "${file.path}"`);
				logger.error(`Failed to delete "${file.path}"`, error);
			}
		}
	}

	return report;
}

/**
 * Converts inline Base64 embeds in a note back into vault files, restoring
 * the original file name when it is recoverable from the alt text, or
 * deriving one from the note's name otherwise.
 * When `only` is given, just that embed is converted.
 */
export async function extractImages(
	app: App,
	note: TFile,
	settings: ImageBakerSettings,
	logger: Logger,
	only?: EmbeddedImage,
): Promise<ExtractReport> {
	const report: ExtractReport = {
		extracted: 0,
		createdPaths: [],
		failures: [],
	};
	const content = await app.vault.read(note);
	const images = only ? [only] : findEmbeddedImages(content);
	const replacementByRaw = new Map<string, string>();
	let index = 1;

	for (const image of images) {
		if (replacementByRaw.has(image.raw)) {
			continue;
		}
		const extension = extensionFromMime(image.mime);
		if (!extension) {
			report.failures.push(`Unsupported image type "${image.mime}"`);
			logger.warn(`Unsupported embedded image type "${image.mime}"`);
			continue;
		}
		const filename =
			filenameFromAlt(image.alt) ??
			generateImageFilename(note.basename, index, extension);
		try {
			const bytes = base64ToBytes(image.base64);
			const path = await availableAttachmentPath(app, filename, note);
			const created = await app.vault.createBinary(path, bytes.buffer);
			const linkpath =
				settings.linkStyle === "wiki"
					? app.metadataCache.fileToLinktext(created, note.path)
					: created.path;
			replacementByRaw.set(
				image.raw,
				buildImageFileLink(linkpath, image.params, settings.linkStyle),
			);
			report.extracted++;
			report.createdPaths.push(created.path);
			index++;
			logger.debug(`Extracted "${created.path}" (${bytes.length} bytes)`);
		} catch (error) {
			report.failures.push(`Failed to extract "${filename}"`);
			logger.error(`Failed to extract "${filename}" in "${note.path}"`, error);
		}
	}

	if (replacementByRaw.size > 0) {
		await app.vault.process(note, (data) => {
			const found = only
				? closestByRaw(findEmbeddedImages(data), only)
				: findEmbeddedImages(data).filter((image) =>
						replacementByRaw.has(image.raw),
					);
			return applyReplacements(
				data,
				found.map((image) => ({
					start: image.start,
					end: image.end,
					text: replacementByRaw.get(image.raw) ?? image.raw,
				})),
			);
		});
	}

	return report;
}

export function formatEmbedReport(report: EmbedReport): string {
	if (
		report.embedded === 0 &&
		report.skipped === 0 &&
		report.failures.length === 0
	) {
		return "No embeddable images found in this note.";
	}
	const parts = [`Embedded ${plural(report.embedded, "image")}`];
	if (report.deleted > 0) {
		parts.push(`trashed ${plural(report.deleted, "source file")}`);
	}
	if (report.skipped > 0) {
		parts.push(`skipped ${report.skipped}`);
	}
	if (report.failures.length > 0) {
		parts.push(`${report.failures.length} failed`);
	}
	return `${parts.join(", ")}.`;
}

export function formatExtractReport(report: ExtractReport): string {
	if (report.extracted === 0 && report.failures.length === 0) {
		return "No embedded images found in this note.";
	}
	const parts = [`Extracted ${plural(report.extracted, "image")}`];
	if (report.failures.length > 0) {
		parts.push(`${report.failures.length} failed`);
	}
	return `${parts.join(", ")}.`;
}
