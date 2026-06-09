import type { App, Editor, TFile } from "obsidian";
import { TFile as MockTFile, TFolder } from "./mocks/obsidian";

function makeFile(path: string, size: number): TFile {
	const file = new MockTFile();
	file.path = path;
	file.name = path.split("/").pop() ?? path;
	const dot = file.name.lastIndexOf(".");
	file.basename = dot > 0 ? file.name.slice(0, dot) : file.name;
	file.extension = dot > 0 ? file.name.slice(dot + 1) : "";
	file.stat = { size, ctime: 0, mtime: 0 };
	const parent = new TFolder();
	const slash = path.lastIndexOf("/");
	parent.path = slash === -1 ? "/" : path.slice(0, slash);
	file.parent = parent;
	return file as unknown as TFile;
}

export class FakeVault {
	files = new Map<string, TFile>();
	contents = new Map<string, string>();
	binaries = new Map<string, Uint8Array>();

	addNote(path: string, content: string): TFile {
		const file = makeFile(path, content.length);
		this.files.set(path, file);
		this.contents.set(path, content);
		return file;
	}

	addBinary(path: string, bytes: Uint8Array): TFile {
		const file = makeFile(path, bytes.length);
		this.files.set(path, file);
		this.binaries.set(path, bytes);
		return file;
	}

	read(file: TFile): Promise<string> {
		const content = this.contents.get(file.path);
		if (content === undefined) {
			return Promise.reject(new Error(`No such note: ${file.path}`));
		}
		return Promise.resolve(content);
	}

	readBinary(file: TFile): Promise<ArrayBuffer> {
		const bytes = this.binaries.get(file.path);
		if (!bytes) {
			return Promise.reject(new Error(`No such binary: ${file.path}`));
		}
		const copy = new Uint8Array(bytes);
		return Promise.resolve(copy.buffer);
	}

	process(file: TFile, transform: (data: string) => string): Promise<string> {
		const current = this.contents.get(file.path);
		if (current === undefined) {
			return Promise.reject(new Error(`No such note: ${file.path}`));
		}
		const next = transform(current);
		this.contents.set(file.path, next);
		return Promise.resolve(next);
	}

	createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
		if (this.files.has(path)) {
			return Promise.reject(new Error(`File already exists: ${path}`));
		}
		const file = this.addBinary(path, new Uint8Array(data));
		return Promise.resolve(file);
	}

	getAbstractFileByPath(path: string): TFile | null {
		return this.files.get(path) ?? null;
	}

	cachedRead(file: TFile): Promise<string> {
		return this.read(file);
	}
}

export class FakeLeaf {
	viewType = "";
	state: unknown = null;
	openedFiles: TFile[] = [];
	view: { editor?: FakeEditor } | null = null;

	constructor(public app: FakeApp) {}

	openFile(file: TFile, _options?: unknown): Promise<void> {
		this.openedFiles.push(file);
		this.app.activeFile = file;
		return Promise.resolve();
	}

	setViewState(state: { type: string }): Promise<void> {
		this.viewType = state.type;
		this.state = state;
		if (!this.app.viewLeaves.includes(this)) {
			this.app.viewLeaves.push(this);
		}
		return Promise.resolve();
	}
}

export interface FakeAppOptions {
	/** Simulate an older app without FileManager.getAvailablePathForAttachment. */
	attachmentApi?: boolean;
}

export class FakeApp {
	vault = new FakeVault();
	resolvedLinks: Record<string, Record<string, number>> = {};
	trashed: string[] = [];
	workspaceHandlers = new Map<string, (...args: never[]) => unknown>();
	metadataHandlers = new Map<string, (...args: never[]) => unknown>();
	activeFile: TFile | null = null;
	centerLeaf = new FakeLeaf(this);
	rightLeaf = new FakeLeaf(this);
	viewLeaves: FakeLeaf[] = [];
	revealedLeaves: unknown[] = [];

	metadataCache = {
		resolvedLinks: this.resolvedLinks,
		getFirstLinkpathDest: (linkpath: string, _source: string): TFile | null => {
			for (const [path, file] of this.vault.files) {
				if (path === linkpath || path.endsWith(`/${linkpath}`)) {
					return file;
				}
			}
			return null;
		},
		fileToLinktext: (file: TFile, _source: string): string => file.name,
		on: (name: string, handler: (...args: never[]) => unknown): unknown => {
			this.metadataHandlers.set(name, handler);
			return { event: name };
		},
	};

	fileManager: Record<string, unknown> = {
		trashFile: (file: TFile): Promise<void> => {
			this.trashed.push(file.path);
			this.vault.files.delete(file.path);
			this.vault.binaries.delete(file.path);
			this.vault.contents.delete(file.path);
			return Promise.resolve();
		},
		getAvailablePathForAttachment: (
			filename: string,
			sourcePath: string,
		): Promise<string> => Promise.resolve(this.availablePath(filename, sourcePath)),
	};

	workspace = {
		on: (name: string, handler: (...args: never[]) => unknown): unknown => {
			this.workspaceHandlers.set(name, handler);
			return { event: name };
		},
		getActiveFile: (): TFile | null => this.activeFile,
		getLeaf: (_newLeaf?: boolean): FakeLeaf => this.centerLeaf,
		getLeavesOfType: (type: string): FakeLeaf[] =>
			this.viewLeaves.filter((leaf) => leaf.viewType === type),
		getRightLeaf: (_split: boolean): FakeLeaf => this.rightLeaf,
		revealLeaf: (leaf: unknown): Promise<void> => {
			this.revealedLeaves.push(leaf);
			return Promise.resolve();
		},
		updateOptions: (): void => {
			this.optionsUpdates++;
		},
	};

	optionsUpdates = 0;

	constructor(options: FakeAppOptions = {}) {
		if (options.attachmentApi === false) {
			delete this.fileManager.getAvailablePathForAttachment;
		}
	}

	private availablePath(filename: string, sourcePath: string): string {
		const slash = sourcePath.lastIndexOf("/");
		const folder = slash === -1 ? "" : sourcePath.slice(0, slash + 1);
		const dot = filename.lastIndexOf(".");
		const base = filename.slice(0, dot);
		const extension = filename.slice(dot + 1);
		let candidate = `${folder}${filename}`;
		let counter = 1;
		while (this.vault.files.has(candidate)) {
			candidate = `${folder}${base} ${counter}.${extension}`;
			counter++;
		}
		return candidate;
	}

	asApp(): App {
		return this as unknown as App;
	}
}

export class FakeEditor {
	cursor: { line: number; ch: number } | null = null;
	scrolledTo: unknown = null;
	replaced: string[] = [];

	constructor(
		public content: string,
		public cursorOffset = 0,
	) {}

	getValue(): string {
		return this.content;
	}

	getCursor(): { line: number; ch: number } {
		return { line: 0, ch: this.cursorOffset };
	}

	posToOffset(pos: { line: number; ch: number }): number {
		return pos.ch;
	}

	offsetToPos(offset: number): { line: number; ch: number } {
		return { line: 0, ch: offset };
	}

	setCursor(pos: { line: number; ch: number }): void {
		this.cursor = pos;
	}

	scrollIntoView(range: unknown, _center?: boolean): void {
		this.scrolledTo = range;
	}

	replaceSelection(text: string): void {
		this.replaced.push(text);
	}

	asEditor(): Editor {
		return this as unknown as Editor;
	}
}

export function flushPromises(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

export function sampleBytes(length: number): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(length);
	for (let i = 0; i < length; i++) {
		bytes[i] = (i * 7 + 13) % 256;
	}
	return bytes;
}
