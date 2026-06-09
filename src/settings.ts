import { isLogLevelName, type LogLevelName } from "./lib/logger";

export type LinkStyle = "wiki" | "markdown";

export interface ImageBakerSettings {
	/** Verbosity of event logging to the developer console. */
	logLevel: LogLevelName;
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
}

export const DEFAULT_SETTINGS: ImageBakerSettings = {
	logLevel: "warn",
	embedOnPaste: true,
	embedOnDrop: true,
	deleteSourceFiles: true,
	linkStyle: "wiki",
	maxEmbedFileSizeKB: 0,
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
	return settings;
}
