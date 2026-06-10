import {
	TFile,
	TFolder,
	normalizePath,
	type App,
	type FileManager,
} from "obsidian";
import { base64ToBytes, bytesToBase64 } from "../lib/base64";
import {
	generateImageFilename,
	imagePathFromAlt,
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
 * Maps each requested link to its closest occurrence in the current
 * content, so a duplicated link text converts exactly the requested
 * occurrences and not its twins elsewhere in the note.
 */
function pickOccurrences<T extends { raw: string; start: number }>(
	candidates: T[],
	wanted: readonly T[],
): T[] {
	const chosen = new Set<T>();
	for (const want of wanted) {
		const match = candidates
			.filter((candidate) => candidate.raw === want.raw && !chosen.has(candidate))
			.sort(
				(a, b) =>
					Math.abs(a.start - want.start) - Math.abs(b.start - want.start),
			)[0];
		if (match) {
			chosen.add(match);
		}
	}
	return [...chosen].sort((a, b) => a.start - b.start);
}

function asArray<T>(value: T | readonly T[] | undefined): T[] | null {
	if (value === undefined) {
		return null;
	}
	return Array.isArray(value) ? ([...value] as T[]) : [value as T];
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

function availablePathInFolder(
	app: App,
	folder: string,
	filename: string,
): string {
	const prefix = folder === "" || folder === "/" ? "" : `${folder}/`;
	const dot = filename.lastIndexOf(".");
	const base = filename.slice(0, dot);
	const extension = filename.slice(dot + 1);
	let candidate = normalizePath(`${prefix}${filename}`);
	let counter = 1;
	while (app.vault.getAbstractFileByPath(candidate)) {
		candidate = normalizePath(`${prefix}${base} ${counter}.${extension}`);
		counter++;
	}
	return candidate;
}

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
	return availablePathInFolder(app, note.parent?.path ?? "", filename);
}

/**
 * Where an extracted image should be written: its original folder when the
 * embed recorded one and it still exists, the attachment folder otherwise.
 */
async function extractionPath(
	app: App,
	storedPath: string | null,
	filename: string,
	note: TFile,
): Promise<string> {
	if (storedPath?.includes("/")) {
		const folder = storedPath.slice(0, storedPath.lastIndexOf("/"));
		if (app.vault.getAbstractFileByPath(folder) instanceof TFolder) {
			return availablePathInFolder(app, folder, filename);
		}
	}
	return availableAttachmentPath(app, filename, note);
}

/**
 * Converts image file links in a note into inline Base64 embeds.
 * When `only` is given, just those links are converted.
 */
export async function embedImages(
	app: App,
	note: TFile,
	settings: ImageBakerSettings,
	logger: Logger,
	only?: ImageFileLink | readonly ImageFileLink[],
	reencode: Reencoder = canvasReencode,
): Promise<EmbedReport> {
	const report: EmbedReport = {
		embedded: 0,
		skipped: 0,
		deleted: 0,
		failures: [],
	};
	const requested = asArray(only);
	const content = await app.vault.read(note);
	const links = requested ?? findImageFileLinks(content);
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
			// The full path is recorded so extraction can restore the file
			// to the folder it came from.
			let filename = file.path;
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
			const candidates = findImageFileLinks(data);
			const found = requested
				? pickOccurrences(
						candidates,
						requested.filter((link) => replacementByRaw.has(link.raw)),
					)
				: candidates.filter((link) => replacementByRaw.has(link.raw));
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
 * When `only` is given, just those embeds are converted.
 */
export async function extractImages(
	app: App,
	note: TFile,
	settings: ImageBakerSettings,
	logger: Logger,
	only?: EmbeddedImage | readonly EmbeddedImage[],
): Promise<ExtractReport> {
	const report: ExtractReport = {
		extracted: 0,
		createdPaths: [],
		failures: [],
	};
	const requested = asArray(only);
	const content = await app.vault.read(note);
	const images = requested ?? findEmbeddedImages(content);
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
		const storedPath = imagePathFromAlt(image.alt);
		const filename =
			storedPath?.split("/").pop() ??
			generateImageFilename(note.basename, index, extension);
		try {
			const bytes = base64ToBytes(image.base64);
			const path = await extractionPath(app, storedPath, filename, note);
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
			const candidates = findEmbeddedImages(data);
			const found = requested
				? pickOccurrences(
						candidates,
						requested.filter((image) => replacementByRaw.has(image.raw)),
					)
				: candidates.filter((image) => replacementByRaw.has(image.raw));
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

export interface FileEmbedReport {
	notes: number;
	embedded: number;
	deleted: boolean;
	failures: string[];
}

/**
 * Embeds every link to the given image across all notes that reference
 * it. The source file is trashed only once all notes are rewritten and
 * none of them still links to it.
 */
export async function embedFileAcrossNotes(
	app: App,
	image: TFile,
	settings: ImageBakerSettings,
	logger: Logger,
	reencode: Reencoder = canvasReencode,
): Promise<FileEmbedReport> {
	const report: FileEmbedReport = {
		notes: 0,
		embedded: 0,
		deleted: false,
		failures: [],
	};
	const notes: TFile[] = [];
	for (const [source, targets] of Object.entries(
		app.metadataCache.resolvedLinks,
	)) {
		if ((targets[image.path] ?? 0) > 0) {
			const note = app.vault.getAbstractFileByPath(source);
			if (note instanceof TFile) {
				notes.push(note);
			}
		}
	}

	// Deletion is decided once at the end; per-note deletion would consult
	// a metadata cache that has not re-indexed the rewritten notes yet.
	const keepSources = { ...settings, deleteSourceFiles: false };
	for (const note of notes) {
		const content = await app.vault.read(note);
		const links = findImageFileLinks(content).filter(
			(link) =>
				app.metadataCache.getFirstLinkpathDest(imageLinkTarget(link), note.path)
					?.path === image.path,
		);
		if (links.length === 0) {
			continue;
		}
		const sub = await embedImages(app, note, keepSources, logger, links, reencode);
		if (sub.embedded > 0) {
			report.notes++;
		}
		report.embedded += sub.embedded;
		report.failures.push(...sub.failures);
	}

	if (settings.deleteSourceFiles && report.embedded > 0) {
		let referenced = false;
		for (const note of notes) {
			if (await noteStillReferences(app, note, image.path)) {
				referenced = true;
				break;
			}
		}
		if (referenced) {
			logger.info(`Keeping "${image.path}": still referenced by a note`);
		} else {
			try {
				await app.fileManager.trashFile(image);
				report.deleted = true;
				logger.debug(`Trashed "${image.path}"`);
			} catch (error) {
				report.failures.push(`Failed to delete "${image.path}"`);
				logger.error(`Failed to delete "${image.path}"`, error);
			}
		}
	}

	return report;
}

export function formatFileEmbedReport(report: FileEmbedReport): string {
	if (report.notes === 0 && report.failures.length === 0) {
		return "No notes link to this image.";
	}
	const parts = [
		`Embedded ${plural(report.embedded, "link")} across ${plural(report.notes, "note")}`,
	];
	if (report.deleted) {
		parts.push("trashed the source file");
	}
	if (report.failures.length > 0) {
		parts.push(`${report.failures.length} failed`);
	}
	return `${parts.join(", ")}.`;
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
