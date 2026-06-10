import type { App, TFile } from "obsidian";
import { approximateBase64Bytes, formatByteSize } from "../lib/bytes";
import type { Logger } from "../lib/logger";
import {
	findEmbeddedImages,
	findImageFileLinks,
	imageLinkTarget,
} from "../lib/markdown";
import { mimeFromExtension } from "../lib/mime";
import { plural } from "../lib/text";
import type { ImageBakerSettings } from "../settings";
import { embedImages, extractImages } from "./converter";

export type BatchDirection = "embed" | "extract";

/** Dry-run summary of what a batch operation would touch. */
export interface BatchPlan {
	notes: number;
	images: number;
	bytes: number;
	files: TFile[];
}

export interface BatchResult {
	processedNotes: number;
	images: number;
	deleted: number;
	failures: string[];
	aborted: boolean;
}

/** Markdown files within the given folder (null or "/" means the vault). */
export function notesInScope(app: App, folder: string | null): TFile[] {
	const all = app.vault.getMarkdownFiles();
	if (!folder || folder === "/") {
		return all;
	}
	const prefix = folder.endsWith("/") ? folder : `${folder}/`;
	return all.filter((file) => file.path.startsWith(prefix));
}

/** Scans the given notes without modifying anything. */
export async function planBatch(
	app: App,
	files: readonly TFile[],
	direction: BatchDirection,
	settings: ImageBakerSettings,
): Promise<BatchPlan> {
	const plan: BatchPlan = { notes: 0, images: 0, bytes: 0, files: [] };
	for (const file of files) {
		const content = await app.vault.cachedRead(file);
		let count = 0;
		let bytes = 0;
		if (direction === "embed") {
			for (const link of findImageFileLinks(content)) {
				const image = app.metadataCache.getFirstLinkpathDest(
					imageLinkTarget(link),
					file.path,
				);
				if (!image || !mimeFromExtension(image.extension)) {
					continue;
				}
				if (
					settings.maxEmbedFileSizeKB > 0 &&
					image.stat.size > settings.maxEmbedFileSizeKB * 1024
				) {
					continue;
				}
				count++;
				bytes += image.stat.size;
			}
		} else {
			for (const image of findEmbeddedImages(content)) {
				count++;
				bytes += approximateBase64Bytes(
					image.base64.replace(/\s+/g, "").length,
				);
			}
		}
		if (count > 0) {
			plan.notes++;
			plan.images += count;
			plan.bytes += bytes;
			plan.files.push(file);
		}
	}
	return plan;
}

/**
 * Runs the batch conversion note by note, reporting progress after each
 * note and stopping between notes when `isAborted` flips to true.
 */
export async function runBatch(
	app: App,
	files: readonly TFile[],
	direction: BatchDirection,
	settings: ImageBakerSettings,
	logger: Logger,
	onProgress: (done: number, total: number) => void,
	isAborted: () => boolean,
): Promise<BatchResult> {
	const result: BatchResult = {
		processedNotes: 0,
		images: 0,
		deleted: 0,
		failures: [],
		aborted: false,
	};
	for (const [index, file] of files.entries()) {
		if (isAborted()) {
			result.aborted = true;
			break;
		}
		try {
			if (direction === "embed") {
				const report = await embedImages(app, file, settings, logger);
				result.images += report.embedded;
				result.deleted += report.deleted;
				result.failures.push(...report.failures);
			} else {
				const report = await extractImages(app, file, settings, logger);
				result.images += report.extracted;
				result.failures.push(...report.failures);
			}
			result.processedNotes++;
		} catch (error) {
			result.failures.push(`Failed to process "${file.path}"`);
			logger.error(`Batch processing failed for "${file.path}"`, error);
		}
		onProgress(index + 1, files.length);
	}
	return result;
}

export function formatBatchPlan(
	plan: BatchPlan,
	direction: BatchDirection,
): string {
	if (plan.images === 0) {
		return direction === "embed"
			? "No embeddable images found in this scope."
			: "No embedded images found in this scope.";
	}
	const what = direction === "embed" ? "embeddable" : "embedded";
	return `Found ${plural(plan.images, `${what} image`)} (~${formatByteSize(plan.bytes)}) in ${plural(plan.notes, "note")}.`;
}

export function formatBatchResult(
	result: BatchResult,
	direction: BatchDirection,
): string {
	const verb = direction === "embed" ? "Embedded" : "Extracted";
	const parts = [
		`${verb} ${plural(result.images, "image")} across ${plural(result.processedNotes, "note")}`,
	];
	if (result.deleted > 0) {
		parts.push(`trashed ${plural(result.deleted, "source file")}`);
	}
	if (result.failures.length > 0) {
		parts.push(`${result.failures.length} failed`);
	}
	return `${parts.join(", ")}${result.aborted ? " (aborted)" : ""}.`;
}
