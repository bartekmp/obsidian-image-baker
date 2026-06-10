import { ItemView, type MarkdownView, type TFile, type WorkspaceLeaf } from "obsidian";
import { imagePathFromAlt } from "./lib/filename";
import { findEmbeddedImages, findImageFileLinks } from "./lib/markdown";
import type ImageBakerPlugin from "./main";

export const IMAGE_LIST_VIEW_TYPE = "image-baker-image-list";

export interface ImageListItem {
	label: string;
	kind: "wiki" | "markdown" | "embedded";
	/** Offset of the image link in the note content. */
	start: number;
}

/** Lists all images of a note in document order. */
export function listNoteImages(content: string): ImageListItem[] {
	const items: ImageListItem[] = [
		...findImageFileLinks(content).map((link) => ({
			label: link.kind === "wiki" ? link.linkpath : link.target,
			kind: link.kind,
			start: link.start,
		})),
		...findEmbeddedImages(content).map((image) => ({
			label: imagePathFromAlt(image.alt) ?? `Embedded image (${image.mime})`,
			kind: image.kind,
			start: image.start,
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

	async refresh(): Promise<void> {
		const generation = ++this.refreshGeneration;
		const container = this.contentEl;
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			container.empty();
			container.createEl("p", {
				text: "Open a note to list its images.",
				cls: "image-baker-empty",
			});
			return;
		}

		const content = await this.app.vault.cachedRead(file);
		if (generation !== this.refreshGeneration) {
			return;
		}
		container.empty();
		const items = listNoteImages(content);
		this.plugin.logger.debug(
			`Image list: ${items.length} image(s) in "${file.path}"`,
		);
		if (items.length === 0) {
			container.createEl("p", {
				text: "No images in this note.",
				cls: "image-baker-empty",
			});
			return;
		}

		const list = container.createEl("ul", { cls: "image-baker-list" });
		for (const item of items) {
			const entry = list.createEl("li", { cls: "image-baker-item" });
			entry.createEl("span", {
				text: item.label,
				cls: "image-baker-item-label",
			});
			entry.createEl("span", {
				text: item.kind === "embedded" ? "baked" : "file",
				cls: "image-baker-item-badge",
			});
			entry.onclick = (): void => void this.revealImage(file, item.start);
		}
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
