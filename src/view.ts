import { ItemView, type MarkdownView, type TFile, type WorkspaceLeaf } from "obsidian";
import { imagePathFromAlt } from "./lib/filename";
import {
	findEmbeddedImages,
	findImageFileLinks,
	type AnyImageLink,
	type EmbeddedImage,
	type ImageFileLink,
} from "./lib/markdown";
import type ImageBakerPlugin from "./main";

export const IMAGE_LIST_VIEW_TYPE = "image-baker-image-list";

export interface ImageListItem {
	label: string;
	kind: "wiki" | "markdown" | "embedded";
	/** Offset of the image link in the note content. */
	start: number;
	link: AnyImageLink;
}

/** Lists all images of a note in document order. */
export function listNoteImages(content: string): ImageListItem[] {
	const items: ImageListItem[] = [
		...findImageFileLinks(content).map((link) => ({
			label: link.kind === "wiki" ? link.linkpath : link.target,
			kind: link.kind,
			start: link.start,
			link,
		})),
		...findEmbeddedImages(content).map((image) => ({
			label: imagePathFromAlt(image.alt) ?? `Embedded image (${image.mime})`,
			kind: image.kind,
			start: image.start,
			link: image,
		})),
	];
	return items.sort((a, b) => a.start - b.start);
}

/**
 * Sidebar view listing the images of the active note. Clicking an entry
 * moves the editor cursor to the image and scrolls it into view.
 */
export class ImageListView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: ImageBakerPlugin,
	) {
		super(leaf);
	}

	override getViewType(): string {
		return IMAGE_LIST_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return "Note images";
	}

	override getIcon(): string {
		return "images";
	}

	override async onOpen(): Promise<void> {
		this.registerEvent(
			this.app.workspace.on("file-open", () => void this.refresh()),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file.path === this.app.workspace.getActiveFile()?.path) {
					void this.refresh();
				}
			}),
		);
		await this.refresh();
	}

	/** Increases on every refresh so stale async renders are discarded. */
	private refreshGeneration = 0;
	private items: ImageListItem[] = [];
	private currentFile: TFile | null = null;
	/** Multi-selection, keyed by each item's start offset. */
	private readonly selected = new Set<number>();

	async refresh(): Promise<void> {
		const generation = ++this.refreshGeneration;
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			this.currentFile = null;
			this.items = [];
			this.selected.clear();
			this.renderMessage("Open a note to list its images.");
			return;
		}

		const content = await this.app.vault.cachedRead(file);
		if (generation !== this.refreshGeneration) {
			return;
		}
		this.currentFile = file;
		this.items = listNoteImages(content);
		this.selected.clear();
		this.plugin.logger.debug(
			`Image list: ${this.items.length} image(s) in "${file.path}"`,
		);
		this.renderList();
	}

	private renderMessage(message: string): void {
		const container = this.contentEl;
		container.empty();
		container.createEl("p", { text: message, cls: "image-baker-empty" });
	}

	private renderList(): void {
		const file = this.currentFile;
		if (!file) {
			return;
		}
		if (this.items.length === 0) {
			this.renderMessage("No images in this note.");
			return;
		}
		const container = this.contentEl;
		container.empty();

		const toolbar = container.createEl("div", { cls: "image-baker-toolbar" });
		const selectFiles = toolbar.createEl("button", { text: "Select files" });
		selectFiles.onclick = (): void => this.selectGroup("file");
		const selectBaked = toolbar.createEl("button", { text: "Select baked" });
		selectBaked.onclick = (): void => this.selectGroup("embedded");
		const batch = this.batchAction();
		if (batch) {
			const button = toolbar.createEl("button", {
				text: batch.label,
				cls: "mod-cta image-baker-batch-action",
			});
			button.onclick = (): void => void this.convertSelected(batch.group);
		}

		const list = container.createEl("ul", { cls: "image-baker-list" });
		for (const item of this.items) {
			const entry = list.createEl("li", { cls: "image-baker-item" });
			const checkbox = entry.createEl("input", {
				cls: "image-baker-item-check",
				type: "checkbox",
			});
			checkbox.checked = this.selected.has(item.start);
			checkbox.onclick = (event): void => {
				event.stopPropagation();
				this.toggleSelection(item.start);
			};
			entry.createEl("span", {
				text: item.label,
				cls: "image-baker-item-label",
			});
			entry.createEl("span", {
				text: item.kind === "embedded" ? "baked" : "file",
				cls: "image-baker-item-badge",
			});
			const action = entry.createEl("button", {
				text: item.kind === "embedded" ? "Extract" : "Bake",
				cls: "image-baker-item-action",
			});
			action.onclick = (event): void => {
				event.stopPropagation();
				void this.convertItem(file, item);
			};
			entry.onclick = (): void => void this.revealImage(file, item.start);
		}
	}

	private toggleSelection(key: number): void {
		if (this.selected.has(key)) {
			this.selected.delete(key);
		} else {
			this.selected.add(key);
		}
		this.renderList();
	}

	private selectGroup(group: "file" | "embedded"): void {
		this.selected.clear();
		for (const item of this.items) {
			if ((item.kind === "embedded") === (group === "embedded")) {
				this.selected.add(item.start);
			}
		}
		this.renderList();
	}

	private selectedItems(): ImageListItem[] {
		return this.items.filter((item) => this.selected.has(item.start));
	}

	/** Batch button label/target, only when the selection is one type. */
	private batchAction(): { label: string; group: "file" | "embedded" } | null {
		const chosen = this.selectedItems();
		if (chosen.length === 0) {
			return null;
		}
		if (chosen.every((item) => item.kind === "embedded")) {
			return { label: `Extract ${chosen.length}`, group: "embedded" };
		}
		if (chosen.every((item) => item.kind !== "embedded")) {
			return { label: `Bake ${chosen.length}`, group: "file" };
		}
		return null;
	}

	private async convertSelected(group: "file" | "embedded"): Promise<void> {
		const file = this.currentFile;
		if (!file) {
			return;
		}
		const links = this.selectedItems().map((item) => item.link);
		if (group === "embedded") {
			await this.plugin.runExtract(
				file,
				links.filter((link): link is EmbeddedImage => link.kind === "embedded"),
			);
		} else {
			await this.plugin.runEmbed(
				file,
				links.filter((link): link is ImageFileLink => link.kind !== "embedded"),
			);
		}
		await this.refresh();
	}

	private async convertItem(file: TFile, item: ImageListItem): Promise<void> {
		if (item.link.kind === "embedded") {
			await this.plugin.runExtract(file, item.link);
		} else {
			await this.plugin.runEmbed(file, item.link);
		}
		await this.refresh();
	}

	private async revealImage(file: TFile, offset: number): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file, { active: true });
		const editor = (leaf.view as Partial<MarkdownView>).editor;
		if (!editor) {
			this.plugin.logger.warn(
				`Could not focus an editor for "${file.path}"`,
			);
			return;
		}
		const position = editor.offsetToPos(offset);
		editor.setCursor(position);
		editor.scrollIntoView({ from: position, to: position }, true);
		this.plugin.logger.debug(
			`Jumped to image at offset ${offset} in "${file.path}"`,
		);
	}
}
