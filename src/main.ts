import type { Extension } from "@codemirror/state";
import {
	Menu,
	Notice,
	Plugin,
	TFile,
	type Editor,
	type MarkdownFileInfo,
	type MarkdownView,
} from "obsidian";
import { imageFoldExtension } from "./editor/fold";
import {
	embedFileAcrossNotes,
	embedImages,
	extractImages,
	formatEmbedReport,
	formatExtractReport,
	formatFileEmbedReport,
} from "./core/converter";
import {
	copyEmbeddedImage,
	systemClipboardWriter,
	type ClipboardImageWriter,
} from "./core/clipboard";
import { buildTransferEmbeds, shouldEmbedTransfer } from "./core/transfer";
import { Logger } from "./lib/logger";
import {
	findEmbedBySrc,
	findEmbeddedImages,
	findImageFileLinks,
	imageLinkTarget,
	type AnyImageLink,
	type EmbeddedImage,
	type ImageFileLink,
} from "./lib/markdown";
import { isImagePath } from "./lib/mime";
import { normalizeSettings, type ImageBakerSettings } from "./settings";
import { ImageBakerSettingTab } from "./settings-tab";
import { BatchModal } from "./ui/batch-modal";
import { IMAGE_LIST_VIEW_TYPE, ImageListView } from "./view";

export default class ImageBakerPlugin extends Plugin {
	override settings: ImageBakerSettings = normalizeSettings(null);
	readonly logger = new Logger("Image Baker");
	/** Injection point for tests; the system clipboard otherwise. */
	clipboardWriter: ClipboardImageWriter = systemClipboardWriter;
	private readonly editorExtensions: Extension[] = [];

	override async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new ImageBakerSettingTab(this.app, this));
		this.applyEditorExtensions();
		this.registerEditorExtension(this.editorExtensions);
		this.registerView(
			IMAGE_LIST_VIEW_TYPE,
			(leaf) => new ImageListView(leaf, this),
		);
		this.addRibbonIcon("images", "Open note image list", () =>
			void this.activateImageListView(),
		);

		this.addCommand({
			id: "embed-all-images",
			name: "Embed all images in the current note",
			editorCheckCallback: (checking, _editor, info) =>
				this.runOnNote(checking, info, (file) => this.runEmbed(file)),
		});

		this.addCommand({
			id: "extract-all-images",
			name: "Extract all embedded images to files",
			editorCheckCallback: (checking, _editor, info) =>
				this.runOnNote(checking, info, (file) => this.runExtract(file)),
		});

		this.addCommand({
			id: "embed-image-at-cursor",
			name: "Embed selected image",
			editorCheckCallback: (checking, editor, info) =>
				this.runOnLink(
					checking,
					editor,
					info,
					(link): link is ImageFileLink => link.kind !== "embedded",
					(file, link) => this.runEmbed(file, link),
				),
		});

		this.addCommand({
			id: "extract-image-at-cursor",
			name: "Extract selected image",
			editorCheckCallback: (checking, editor, info) =>
				this.runOnLink(
					checking,
					editor,
					info,
					(link): link is EmbeddedImage => link.kind === "embedded",
					(file, link) => this.runExtract(file, link),
				),
		});

		this.addCommand({
			id: "embed-images-in-selection",
			name: "Embed images in selection",
			editorCheckCallback: (checking, editor, info) =>
				this.runOnSelection(
					checking,
					editor,
					info,
					(link): link is ImageFileLink => link.kind !== "embedded",
					(file, links) => this.runEmbed(file, links),
				),
		});

		this.addCommand({
			id: "extract-images-in-selection",
			name: "Extract images in selection",
			editorCheckCallback: (checking, editor, info) =>
				this.runOnSelection(
					checking,
					editor,
					info,
					(link): link is EmbeddedImage => link.kind === "embedded",
					(file, links) => this.runExtract(file, links),
				),
		});

		this.addCommand({
			id: "copy-image-at-cursor",
			name: "Copy selected image to clipboard",
			editorCheckCallback: (checking, editor, info) =>
				this.runOnLink(
					checking,
					editor,
					info,
					(link): link is EmbeddedImage => link.kind === "embedded",
					(_file, link) => this.copyEmbed(link),
				),
		});

		this.addCommand({
			id: "batch-embed-images",
			name: "Embed images across vault or folder",
			callback: () => {
				new BatchModal(this.app, this, "embed").open();
			},
		});

		this.addCommand({
			id: "batch-extract-images",
			name: "Extract embedded images across vault or folder",
			callback: () => {
				new BatchModal(this.app, this, "extract").open();
			},
		});

		this.addCommand({
			id: "show-image-list",
			name: "Show image list for the current note",
			callback: () => void this.activateImageListView(),
		});

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, info) => {
				this.populateEditorMenu(menu, editor, info);
			}),
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && isImagePath(file.path)) {
					menu.addItem((item) =>
						item
							.setTitle("Embed image into notes that use it")
							.setIcon("image-plus")
							.onClick(() => void this.embedFileEverywhere(file)),
					);
				}
			}),
		);

		this.registerMarkdownPostProcessor((element, context) => {
			this.attachReadingViewMenus(element, context.sourcePath);
		});

		this.registerDomEvent(
			document,
			"contextmenu",
			(evt) => this.selectClickedImage(evt),
			{ capture: true },
		);

		this.registerEvent(
			this.app.workspace.on("editor-paste", (evt, editor, info) => {
				this.handleTransfer(
					evt,
					evt.clipboardData,
					editor,
					info,
					this.settings.embedOnPaste,
				);
			}),
		);

		this.registerEvent(
			this.app.workspace.on("editor-drop", (evt, editor, info) => {
				this.handleTransfer(
					evt,
					evt.dataTransfer,
					editor,
					info,
					this.settings.embedOnDrop,
				);
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
		this.applyEditorExtensions();
		this.app.workspace.updateOptions();
	}

	/** Rebuilds the in-place extension list so toggles apply immediately. */
	private applyEditorExtensions(): void {
		this.editorExtensions.length = 0;
		if (this.settings.foldEmbeds) {
			this.editorExtensions.push(imageFoldExtension());
		}
	}

	async activateImageListView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(IMAGE_LIST_VIEW_TYPE)[0];
		if (existing) {
			await this.app.workspace.revealLeaf(existing);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) {
			this.logger.warn("Could not create a sidebar leaf for the image list");
			return;
		}
		await leaf.setViewState({ type: IMAGE_LIST_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	/**
	 * The image link under the cursor, or — when there is a selection, as
	 * after clicking a rendered image — the first link it overlaps.
	 */
	private selectedLink(editor: Editor): AnyImageLink | null {
		const content = editor.getValue();
		const from = editor.posToOffset(editor.getCursor("from"));
		const to = editor.posToOffset(editor.getCursor("to"));
		const links: AnyImageLink[] = [
			...findImageFileLinks(content),
			...findEmbeddedImages(content),
		];
		if (from === to) {
			return links.find((link) => link.start <= from && from <= link.end) ?? null;
		}
		return links.find((link) => link.start < to && link.end > from) ?? null;
	}

	/**
	 * Right-clicking a rendered image in Live Preview selects its markdown
	 * first, so the editor context menu offers the conversion actions and
	 * the "selected image" commands apply to it.
	 */
	private selectClickedImage(evt: MouseEvent): void {
		const target = evt.target;
		if (!(target instanceof HTMLImageElement) || !target.closest(".cm-content")) {
			return;
		}
		const info = this.app.workspace.activeEditor;
		const editor = info?.editor;
		const file = info?.file;
		if (!editor || !file) {
			return;
		}
		const link = this.linkForRenderedImage(
			editor.getValue(),
			target.getAttribute("src") ?? "",
			file,
		);
		if (!link) {
			return;
		}
		editor.setSelection(
			editor.offsetToPos(link.start),
			editor.offsetToPos(link.end),
		);
	}

	private linkForRenderedImage(
		content: string,
		src: string,
		file: TFile,
	): AnyImageLink | null {
		if (src.startsWith("data:image/")) {
			return findEmbedBySrc(content, src);
		}
		const cleanSrc = src.split("?")[0];
		return (
			findImageFileLinks(content).find((link) => {
				const resolved = this.app.metadataCache.getFirstLinkpathDest(
					imageLinkTarget(link),
					file.path,
				);
				return (
					resolved !== null &&
					this.app.vault.getResourcePath(resolved).split("?")[0] === cleanSrc
				);
			}) ?? null
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
		const link = this.selectedLink(editor);
		if (!link || !matches(link)) {
			return false;
		}
		if (!checking) {
			void action(file, link);
		}
		return true;
	}

	/** Image links lying entirely within the current selection. */
	private linksInSelection(editor: Editor): AnyImageLink[] {
		const from = editor.posToOffset(editor.getCursor("from"));
		const to = editor.posToOffset(editor.getCursor("to"));
		if (from === to) {
			return [];
		}
		const content = editor.getValue();
		return [
			...findImageFileLinks(content),
			...findEmbeddedImages(content),
		].filter((link) => link.start >= from && link.end <= to);
	}

	private runOnSelection<T extends AnyImageLink>(
		checking: boolean,
		editor: Editor,
		info: MarkdownView | MarkdownFileInfo,
		matches: (link: AnyImageLink) => link is T,
		action: (file: TFile, links: T[]) => Promise<void>,
	): boolean {
		const file = info.file;
		if (!file) {
			return false;
		}
		const links = this.linksInSelection(editor).filter(matches);
		if (links.length === 0) {
			return false;
		}
		if (!checking) {
			void action(file, links);
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
		const link = this.selectedLink(editor);
		if (!link) {
			return;
		}
		if (link.kind === "embedded") {
			menu.addItem((item) =>
				item
					.setTitle("Extract image to file")
					.setIcon("image-down")
					.onClick(() => void this.runExtract(file, link)),
			);
			menu.addItem((item) =>
				item
					.setTitle("Copy image to clipboard")
					.setIcon("copy")
					.onClick(() => void this.copyEmbed(link)),
			);
		} else {
			menu.addItem((item) =>
				item
					.setTitle("Embed image into note")
					.setIcon("image-plus")
					.onClick(() => void this.runEmbed(file, link)),
			);
		}
	}

	private handleTransfer(
		evt: ClipboardEvent | DragEvent,
		data: DataTransfer | null,
		editor: Editor,
		info: MarkdownView | MarkdownFileInfo,
		enabled: boolean,
	): void {
		if (!enabled || evt.defaultPrevented) {
			return;
		}
		const note = info.file;
		if (!note) {
			return;
		}
		const files = Array.from(data?.files ?? []);
		if (!shouldEmbedTransfer(files, this.settings)) {
			if (files.length > 0) {
				this.logger.info(
					"Leaving transferred files to Obsidian (unsupported type or above the size limit)",
				);
			}
			return;
		}
		evt.preventDefault();
		void this.embedTransferred(files, editor, note);
	}

	private async embedTransferred(
		files: File[],
		editor: Editor,
		note: TFile,
	): Promise<void> {
		try {
			const markdown = await buildTransferEmbeds(
				files,
				note.basename,
				this.settings,
			);
			editor.replaceSelection(markdown);
			this.logger.debug(
				`Embedded ${files.length} transferred image(s) into "${note.path}"`,
			);
			new Notice(
				files.length === 1
					? "Embedded 1 image into the note."
					: `Embedded ${files.length} images into the note.`,
			);
		} catch (error) {
			this.reportFailure("Failed to embed transferred images", error);
		}
	}

	/** Offers "Extract image to file" on baked images in reading view. */
	private attachReadingViewMenus(element: HTMLElement, sourcePath: string): void {
		const images = element.querySelectorAll<HTMLImageElement>(
			'img[src^="data:image/"]',
		);
		for (const img of Array.from(images)) {
			img.addEventListener("contextmenu", (event) => {
				event.preventDefault();
				const src = img.getAttribute("src") ?? "";
				const menu = new Menu();
				menu.addItem((item) =>
					item
						.setTitle("Extract image to file")
						.setIcon("image-down")
						.onClick(() =>
							void this.withEmbedBySrc(sourcePath, src, (file, embed) =>
								this.runExtract(file, embed),
							),
						),
				);
				menu.addItem((item) =>
					item
						.setTitle("Copy image to clipboard")
						.setIcon("copy")
						.onClick(() =>
							void this.withEmbedBySrc(sourcePath, src, (_file, embed) =>
								this.copyEmbed(embed),
							),
						),
				);
				menu.showAtMouseEvent(event);
			});
		}
	}

	/** Resolves a rendered data-URI back to its embed, then acts on it. */
	private async withEmbedBySrc(
		sourcePath: string,
		src: string,
		action: (file: TFile, embed: EmbeddedImage) => Promise<void>,
	): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) {
			this.logger.warn(`No note found at "${sourcePath}"`);
			return;
		}
		const embed = findEmbedBySrc(await this.app.vault.read(file), src);
		if (!embed) {
			this.logger.warn(`Could not match a rendered image in "${sourcePath}"`);
			new Notice("Could not locate this embedded image in the note.");
			return;
		}
		await action(file, embed);
	}

	private async embedFileEverywhere(image: TFile): Promise<void> {
		try {
			const report = await embedFileAcrossNotes(
				this.app,
				image,
				this.settings,
				this.logger,
			);
			new Notice(formatFileEmbedReport(report));
		} catch (error) {
			this.reportFailure("Failed to embed image", error);
		}
	}

	private async copyEmbed(embed: EmbeddedImage): Promise<void> {
		try {
			await copyEmbeddedImage(embed, this.clipboardWriter);
			new Notice("Image copied to clipboard.");
		} catch (error) {
			this.reportFailure("Failed to copy image", error);
		}
	}

	async runEmbed(
		file: TFile,
		links?: ImageFileLink | ImageFileLink[],
	): Promise<void> {
		try {
			const report = await embedImages(
				this.app,
				file,
				this.settings,
				this.logger,
				links,
			);
			new Notice(formatEmbedReport(report));
		} catch (error) {
			this.reportFailure("Failed to embed images", error);
		}
	}

	async runExtract(
		file: TFile,
		links?: EmbeddedImage | EmbeddedImage[],
	): Promise<void> {
		try {
			const report = await extractImages(
				this.app,
				file,
				this.settings,
				this.logger,
				links,
			);
			new Notice(formatExtractReport(report));
		} catch (error) {
			this.reportFailure("Failed to extract images", error);
		}
	}

	private reportFailure(message: string, error: unknown): void {
		this.logger.error(message, error);
		new Notice(`Image Baker: ${message.toLowerCase()}. Check the developer console for details.`);
	}
}
