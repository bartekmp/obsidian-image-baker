import { Modal, Notice, Setting, type App } from "obsidian";
import {
	formatBatchPlan,
	formatBatchResult,
	notesInScope,
	planBatch,
	runBatch,
	type BatchDirection,
	type BatchPlan,
} from "../core/batch";
import type ImageBakerPlugin from "../main";

type BatchScope = "vault" | "folder";

/**
 * Batch conversion dialog: shows a dry-run summary for the chosen scope,
 * runs the conversion with live progress, and can be aborted between notes.
 */
export class BatchModal extends Modal {
	private batchScope: BatchScope = "vault";
	private plan: BatchPlan | null = null;
	private aborted = false;
	private running = false;
	private summaryEl!: HTMLElement;
	private progressEl!: HTMLElement;
	private runButton!: HTMLElement;

	constructor(
		app: App,
		private readonly plugin: ImageBakerPlugin,
		private readonly direction: BatchDirection,
	) {
		super(app);
	}

	override onOpen(): void {
		this.titleEl.setText(
			this.direction === "embed"
				? "Bake images into notes"
				: "Extract embedded images to files",
		);
		this.render();
		void this.refreshPlan();
	}

	private activeFolder(): string | null {
		const file = this.app.workspace.getActiveFile();
		return file?.parent && file.parent.path !== "/" ? file.parent.path : null;
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		const folder = this.activeFolder();
		new Setting(contentEl)
			.setName("Scope")
			.setDesc("Which notes to scan and convert.")
			.addDropdown((dropdown) => {
				dropdown.addOption("vault", "Entire vault");
				if (folder) {
					dropdown.addOption("folder", `Current folder (${folder})`);
				}
				dropdown.setValue(this.batchScope).onChange((value) => {
					this.batchScope = value === "folder" ? "folder" : "vault";
					void this.refreshPlan();
				});
			});

		this.summaryEl = contentEl.createEl("p", {
			text: "Scanning…",
			cls: "image-baker-batch-summary",
		});
		this.progressEl = contentEl.createEl("p", {
			cls: "image-baker-batch-progress",
		});

		const buttons = contentEl.createEl("div", {
			cls: "modal-button-container",
		});
		this.runButton = buttons.createEl("button", {
			text: this.direction === "embed" ? "Bake images" : "Extract images",
			cls: "mod-cta",
		});
		this.runButton.onclick = (): void => void this.run();
		const cancel = buttons.createEl("button", { text: "Cancel" });
		cancel.onclick = (): void => {
			this.aborted = true;
			this.close();
		};
	}

	private async refreshPlan(): Promise<void> {
		if (this.running) {
			return;
		}
		const folder = this.batchScope === "folder" ? this.activeFolder() : null;
		this.summaryEl.setText("Scanning…");
		this.plan = await planBatch(
			this.app,
			notesInScope(this.app, folder),
			this.direction,
			this.plugin.settings,
		);
		this.summaryEl.setText(formatBatchPlan(this.plan, this.direction));
	}

	private async run(): Promise<void> {
		if (this.running || !this.plan || this.plan.files.length === 0) {
			return;
		}
		this.running = true;
		this.runButton.setText("Abort");
		this.runButton.onclick = (): void => {
			this.aborted = true;
		};
		const result = await runBatch(
			this.app,
			this.plan.files,
			this.direction,
			this.plugin.settings,
			this.plugin.logger,
			(done, total) => this.progressEl.setText(`Processing note ${done}/${total}…`),
			() => this.aborted,
		);
		new Notice(formatBatchResult(result, this.direction));
		this.close();
	}
}
