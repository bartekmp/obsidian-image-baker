import {
	Notice,
	Plugin,
	type Editor,
	type MarkdownFileInfo,
	type MarkdownView,
	type Menu,
	type TFile,
} from "obsidian";
import {
	embedImages,
	extractImages,
	formatEmbedReport,
	formatExtractReport,
} from "./core/converter";
import { Logger } from "./lib/logger";
import {
	findLinkAtOffset,
	type AnyImageLink,
	type EmbeddedImage,
	type ImageFileLink,
} from "./lib/markdown";
import { normalizeSettings, type ImageBakerSettings } from "./settings";
import { ImageBakerSettingTab } from "./settings-tab";

export default class ImageBakerPlugin extends Plugin {
	override settings: ImageBakerSettings = normalizeSettings(null);
	readonly logger = new Logger("Image Baker");

	override async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new ImageBakerSettingTab(this.app, this));

		this.addCommand({
			id: "embed-all-images",
			name: "Embed all images in the current note",
			editorCheckCallback: (checking, _editor, info) =>
				this.runOnNote(checking, info, (file) => this.embedAll(file)),
		});

		this.addCommand({
			id: "extract-all-images",
			name: "Extract all embedded images to files",
			editorCheckCallback: (checking, _editor, info) =>
				this.runOnNote(checking, info, (file) => this.extractAll(file)),
		});

		this.addCommand({
			id: "embed-image-at-cursor",
			name: "Embed image under cursor",
			editorCheckCallback: (checking, editor, info) =>
				this.runOnLink(
					checking,
					editor,
					info,
					(link): link is ImageFileLink => link.kind !== "embedded",
					(file, link) => this.embedOne(file, link),
				),
		});

		this.addCommand({
			id: "extract-image-at-cursor",
			name: "Extract image under cursor",
			editorCheckCallback: (checking, editor, info) =>
				this.runOnLink(
					checking,
					editor,
					info,
					(link): link is EmbeddedImage => link.kind === "embedded",
					(file, link) => this.extractOne(file, link),
				),
		});

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, info) => {
				this.populateEditorMenu(menu, editor, info);
			}),
		);

		this.logger.debug("Plugin loaded");
	}

	override onunload(): void {
		this.logger.debug("Plugin unloaded");
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
		this.logger.setLevel(this.settings.logLevel);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.logger.setLevel(this.settings.logLevel);
	}

	private linkAtCursor(editor: Editor): AnyImageLink | null {
		return findLinkAtOffset(
			editor.getValue(),
			editor.posToOffset(editor.getCursor()),
		);
	}

	private runOnNote(
		checking: boolean,
		info: MarkdownView | MarkdownFileInfo,
		action: (file: TFile) => Promise<void>,
	): boolean {
		const file = info.file;
		if (!file) {
			return false;
		}
		if (!checking) {
			void action(file);
		}
		return true;
	}

	private runOnLink<T extends AnyImageLink>(
		checking: boolean,
		editor: Editor,
		info: MarkdownView | MarkdownFileInfo,
		matches: (link: AnyImageLink) => link is T,
		action: (file: TFile, link: T) => Promise<void>,
	): boolean {
		const file = info.file;
		if (!file) {
			return false;
		}
		const link = this.linkAtCursor(editor);
		if (!link || !matches(link)) {
			return false;
		}
		if (!checking) {
			void action(file, link);
		}
		return true;
	}

	private populateEditorMenu(
		menu: Menu,
		editor: Editor,
		info: MarkdownView | MarkdownFileInfo,
	): void {
		const file = info.file;
		if (!file) {
			return;
		}
		const link = this.linkAtCursor(editor);
		if (!link) {
			return;
		}
		if (link.kind === "embedded") {
			menu.addItem((item) =>
				item
					.setTitle("Extract image to file")
					.setIcon("image-down")
					.onClick(() => void this.extractOne(file, link)),
			);
		} else {
			menu.addItem((item) =>
				item
					.setTitle("Embed image into note")
					.setIcon("image-plus")
					.onClick(() => void this.embedOne(file, link)),
			);
		}
	}

	private async embedAll(file: TFile): Promise<void> {
		try {
			const report = await embedImages(
				this.app,
				file,
				this.settings,
				this.logger,
			);
			new Notice(formatEmbedReport(report));
		} catch (error) {
			this.reportFailure("Failed to embed images", error);
		}
	}

	private async embedOne(file: TFile, link: ImageFileLink): Promise<void> {
		try {
			const report = await embedImages(
				this.app,
				file,
				this.settings,
				this.logger,
				link,
			);
			new Notice(formatEmbedReport(report));
		} catch (error) {
			this.reportFailure("Failed to embed image", error);
		}
	}

	private async extractAll(file: TFile): Promise<void> {
		try {
			const report = await extractImages(
				this.app,
				file,
				this.settings,
				this.logger,
			);
			new Notice(formatExtractReport(report));
		} catch (error) {
			this.reportFailure("Failed to extract images", error);
		}
	}

	private async extractOne(file: TFile, link: EmbeddedImage): Promise<void> {
		try {
			const report = await extractImages(
				this.app,
				file,
				this.settings,
				this.logger,
				link,
			);
			new Notice(formatExtractReport(report));
		} catch (error) {
			this.reportFailure("Failed to extract image", error);
		}
	}

	private reportFailure(message: string, error: unknown): void {
		this.logger.error(message, error);
		new Notice(`Image Baker: ${message.toLowerCase()}. Check the developer console for details.`);
	}
}
