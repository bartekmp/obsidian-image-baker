import { isLogLevelName, type LogLevelName } from "./lib/logger";

export type LinkStyle = "wiki" | "markdown";

export interface ImageBakerSettings {
	/** Verbosity of event logging to the developer console. */
	logLevel: LogLevelName;
	/** Collapse Base64 payloads behind a size pill in the editor. */
	foldEmbeds: boolean;
	/** Embed images directly when they are pasted into a note. */
	embedOnPaste: boolean;
	/** Embed images directly when they are dropped into a note. */
	embedOnDrop: boolean;
	/** Move source image files to the trash after embedding them. */
	deleteSourceFiles: boolean;
	/** Link format used when extracting embedded images back to files. */
	linkStyle: LinkStyle;
	/** Images larger than this are not embedded. 0 disables the limit. */
	maxEmbedFileSizeKB: number;
	/** Re-encode images before embedding to shrink them. */
	optimizeImages: boolean;
	/** Target format when optimizing. */
	optimizeFormat: "webp" | "jpeg";
	/** Encoding quality (1-100) when optimizing. */
	optimizeQuality: number;
	/** Downscale images wider than this (px) when optimizing. 0 keeps size. */
	optimizeMaxWidth: number;
}

export const DEFAULT_SETTINGS: ImageBakerSettings = {
	logLevel: "warn",
	foldEmbeds: true,
	embedOnPaste: true,
	embedOnDrop: true,
	deleteSourceFiles: true,
	linkStyle: "wiki",
	maxEmbedFileSizeKB: 1024,
	optimizeImages: false,
	optimizeFormat: "webp",
	optimizeQuality: 75,
	optimizeMaxWidth: 0,
};

/** Merges persisted data with defaults, discarding anything malformed. */
export function normalizeSettings(raw: unknown): ImageBakerSettings {
	const settings = { ...DEFAULT_SETTINGS };
	if (typeof raw !== "object" || raw === null) {
		return settings;
	}
	const data = raw as Record<string, unknown>;
	if (isLogLevelName(data.logLevel)) {
		settings.logLevel = data.logLevel;
	}
	if (typeof data.foldEmbeds === "boolean") {
		settings.foldEmbeds = data.foldEmbeds;
	}
	if (typeof data.embedOnPaste === "boolean") {
		settings.embedOnPaste = data.embedOnPaste;
	}
	if (typeof data.embedOnDrop === "boolean") {
		settings.embedOnDrop = data.embedOnDrop;
	}
	if (typeof data.deleteSourceFiles === "boolean") {
		settings.deleteSourceFiles = data.deleteSourceFiles;
	}
	if (data.linkStyle === "wiki" || data.linkStyle === "markdown") {
		settings.linkStyle = data.linkStyle;
	}
	if (
		typeof data.maxEmbedFileSizeKB === "number" &&
		Number.isFinite(data.maxEmbedFileSizeKB) &&
		data.maxEmbedFileSizeKB >= 0
	) {
		settings.maxEmbedFileSizeKB = Math.floor(data.maxEmbedFileSizeKB);
	}
	if (typeof data.optimizeImages === "boolean") {
		settings.optimizeImages = data.optimizeImages;
	}
	if (data.optimizeFormat === "webp" || data.optimizeFormat === "jpeg") {
		settings.optimizeFormat = data.optimizeFormat;
	}
	if (
		typeof data.optimizeQuality === "number" &&
		Number.isFinite(data.optimizeQuality)
	) {
		settings.optimizeQuality = Math.min(
			100,
			Math.max(1, Math.round(data.optimizeQuality)),
		);
	}
	if (
		typeof data.optimizeMaxWidth === "number" &&
		Number.isFinite(data.optimizeMaxWidth) &&
		data.optimizeMaxWidth >= 0
	) {
		settings.optimizeMaxWidth = Math.floor(data.optimizeMaxWidth);
	}
	return settings;
}
