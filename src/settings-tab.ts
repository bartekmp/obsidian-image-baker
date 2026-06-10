import { PluginSettingTab, Setting, type App } from "obsidian";
import { LOG_LEVELS, isLogLevelName, type LogLevelName } from "./lib/logger";
import type ImageBakerPlugin from "./main";

const LOG_LEVEL_LABELS: Record<LogLevelName, string> = {
	off: "Off",
	error: "Errors only",
	warn: "Warnings",
	info: "Info",
	debug: "Debug (verbose)",
};

export class ImageBakerSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ImageBakerPlugin,
	) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Collapse embedded image data")
			.setDesc(
				"Fold the long base64 text of baked images behind a small size pill in the editor. Click a pill to expand it.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.foldEmbeds)
					.onChange(async (value) => {
						this.plugin.settings.foldEmbeds = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Embed images on paste")
			.setDesc(
				"Bake pasted images such as screenshots directly into the note instead of creating attachment files.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.embedOnPaste)
					.onChange(async (value) => {
						this.plugin.settings.embedOnPaste = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Embed images on drop")
			.setDesc(
				"Bake images dragged into the note directly into it instead of creating attachment files.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.embedOnDrop)
					.onChange(async (value) => {
						this.plugin.settings.embedOnDrop = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Delete source files after embedding")
			.setDesc(
				"Move the original image file to the trash once it is baked into a note. Files still referenced by other notes are always kept.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.deleteSourceFiles)
					.onChange(async (value) => {
						this.plugin.settings.deleteSourceFiles = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Maximum file size to embed")
			.setDesc(
				"In kilobytes. Images larger than this are skipped. Use 0 for no limit.",
			)
			.addText((text) =>
				text
					.setPlaceholder("0")
					.setValue(String(this.plugin.settings.maxEmbedFileSizeKB))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (Number.isFinite(parsed) && parsed >= 0) {
							this.plugin.settings.maxEmbedFileSizeKB = Math.floor(parsed);
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Optimize images before embedding")
			.setDesc(
				"Re-encode images to a smaller format when baking them in. The original is only replaced when the result is actually smaller. SVG and GIF files are never re-encoded.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.optimizeImages)
					.onChange(async (value) => {
						this.plugin.settings.optimizeImages = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Optimized format")
			.setDesc("Target format for optimized images.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ webp: "WebP", jpeg: "JPEG" })
					.setValue(this.plugin.settings.optimizeFormat)
					.onChange(async (value) => {
						this.plugin.settings.optimizeFormat =
							value === "jpeg" ? "jpeg" : "webp";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Optimized quality")
			.setDesc("Encoding quality for optimized images (1-100).")
			.addSlider((slider) =>
				slider
					.setLimits(1, 100, 1)
					.setValue(this.plugin.settings.optimizeQuality)
					.onChange(async (value) => {
						this.plugin.settings.optimizeQuality = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Maximum image width when optimizing (px)")
			.setDesc(
				"Downscale wider images to this width before embedding. Use 0 to keep the original size.",
			)
			.addText((text) =>
				text
					.setPlaceholder("0")
					.setValue(String(this.plugin.settings.optimizeMaxWidth))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (Number.isFinite(parsed) && parsed >= 0) {
							this.plugin.settings.optimizeMaxWidth = Math.floor(parsed);
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Extracted link style")
			.setDesc(
				"Link format used when an embedded image is extracted back to a file.",
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ wiki: "Wikilink", markdown: "Markdown link" })
					.setValue(this.plugin.settings.linkStyle)
					.onChange(async (value) => {
						this.plugin.settings.linkStyle =
							value === "markdown" ? "markdown" : "wiki";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Log level")
			.setDesc("How much the plugin reports to the developer console.")
			.addDropdown((dropdown) => {
				for (const level of LOG_LEVELS) {
					dropdown.addOption(level, LOG_LEVEL_LABELS[level]);
				}
				dropdown
					.setValue(this.plugin.settings.logLevel)
					.onChange(async (value) => {
						if (isLogLevelName(value)) {
							this.plugin.settings.logLevel = value;
							await this.plugin.saveSettings();
						}
					});
			});
	}
}
