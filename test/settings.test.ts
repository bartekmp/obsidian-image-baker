import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings";

describe("normalizeSettings", () => {
	it("returns defaults for missing data", () => {
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
	});

	it("does not share state with the defaults object", () => {
		const settings = normalizeSettings(null);
		settings.logLevel = "debug";
		expect(DEFAULT_SETTINGS.logLevel).toBe("warn");
	});

	it("keeps valid persisted values", () => {
		const settings = normalizeSettings({
			logLevel: "debug",
			foldEmbeds: false,
			embedOnPaste: false,
			embedOnDrop: false,
			deleteSourceFiles: false,
			linkStyle: "markdown",
			maxEmbedFileSizeKB: 512,
			optimizeImages: true,
			optimizeFormat: "jpeg",
			optimizeQuality: 60,
			optimizeMaxWidth: 1200,
		});
		expect(settings).toEqual({
			logLevel: "debug",
			foldEmbeds: false,
			embedOnPaste: false,
			embedOnDrop: false,
			deleteSourceFiles: false,
			linkStyle: "markdown",
			maxEmbedFileSizeKB: 512,
			optimizeImages: true,
			optimizeFormat: "jpeg",
			optimizeQuality: 60,
			optimizeMaxWidth: 1200,
		});
	});

	it("merges partial data with defaults", () => {
		const settings = normalizeSettings({ logLevel: "info" });
		expect(settings.logLevel).toBe("info");
		expect(settings.deleteSourceFiles).toBe(DEFAULT_SETTINGS.deleteSourceFiles);
		expect(settings.linkStyle).toBe(DEFAULT_SETTINGS.linkStyle);
	});

	it("discards malformed values", () => {
		const settings = normalizeSettings({
			logLevel: "verbose",
			foldEmbeds: "yes",
			embedOnPaste: "yes",
			embedOnDrop: 1,
			deleteSourceFiles: "yes",
			linkStyle: "html",
			maxEmbedFileSizeKB: -5,
			optimizeImages: "always",
			optimizeFormat: "png",
			optimizeQuality: "high",
			optimizeMaxWidth: -100,
		});
		expect(settings).toEqual(DEFAULT_SETTINGS);
	});

	it("clamps and rounds the optimization quality", () => {
		expect(normalizeSettings({ optimizeQuality: 250 }).optimizeQuality).toBe(100);
		expect(normalizeSettings({ optimizeQuality: 0 }).optimizeQuality).toBe(1);
		expect(normalizeSettings({ optimizeQuality: 79.6 }).optimizeQuality).toBe(80);
	});

	it("floors fractional size limits", () => {
		expect(normalizeSettings({ maxEmbedFileSizeKB: 12.9 }).maxEmbedFileSizeKB).toBe(12);
	});

	it("discards non-finite size limits", () => {
		expect(normalizeSettings({ maxEmbedFileSizeKB: Infinity }).maxEmbedFileSizeKB).toBe(1024);
		expect(normalizeSettings({ maxEmbedFileSizeKB: NaN }).maxEmbedFileSizeKB).toBe(1024);
	});

	it("defaults the size limit to 1 MB", () => {
		expect(DEFAULT_SETTINGS.maxEmbedFileSizeKB).toBe(1024);
	});
});
