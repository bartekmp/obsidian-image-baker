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
			.setName("Maximum file size to embed (KB)")
			.setDesc("Images larger than this are skipped. Use 0 for no limit.")
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
			.setDesc("How much Image Baker reports to the developer console.")
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
