/**
 * Minimal mock of the `obsidian` module for unit tests. The vitest config
 * aliases `obsidian` to this file, so plugin code under test runs against
 * these implementations while tsc still type-checks against the real API.
 */

export class TFolder {
	path = "";
	name = "";
}

export class TFile {
	path = "";
	name = "";
	basename = "";
	extension = "";
	parent: TFolder | null = null;
	stat = { size: 0, ctime: 0, mtime: 0 };
}

export class Notice {
	static messages: string[] = [];

	constructor(message: string) {
		Notice.messages.push(message);
	}

	static reset(): void {
		Notice.messages = [];
	}
}

export interface RegisteredCommand {
	id: string;
	name: string;
	callback?: () => unknown;
	editorCheckCallback?: (
		checking: boolean,
		editor: unknown,
		info: unknown,
	) => boolean;
}

export class FakeElement {
	text: string;
	cls: string;
	children: FakeElement[] = [];
	onclick: ((event: unknown) => unknown) | null = null;

	constructor(
		public tag: string,
		options?: { text?: string; cls?: string },
	) {
		this.text = options?.text ?? "";
		this.cls = options?.cls ?? "";
	}

	empty(): void {
		this.children = [];
	}

	setText(text: string): void {
		this.text = text;
	}

	createEl(tag: string, options?: { text?: string; cls?: string }): FakeElement {
		const child = new FakeElement(tag, options);
		this.children.push(child);
		return child;
	}

	/** Returns all descendants with the given tag, in document order. */
	findAll(tag: string): FakeElement[] {
		const found: FakeElement[] = [];
		for (const child of this.children) {
			if (child.tag === tag) {
				found.push(child);
			}
			found.push(...child.findAll(tag));
		}
		return found;
	}
}

export class Plugin {
	app: unknown;
	manifest: unknown;
	commands: RegisteredCommand[] = [];
	settingTabs: unknown[] = [];
	registeredEvents: unknown[] = [];
	views: Record<string, (leaf: unknown) => unknown> = {};
	ribbonIcons: { icon: string; title: string; callback: () => unknown }[] = [];
	private storedData: unknown = null;

	constructor(app: unknown, manifest: unknown) {
		this.app = app;
		this.manifest = manifest;
	}

	addCommand(command: RegisteredCommand): RegisteredCommand {
		this.commands.push(command);
		return command;
	}

	addSettingTab(tab: unknown): void {
		this.settingTabs.push(tab);
	}

	registerEvent(eventRef: unknown): void {
		this.registeredEvents.push(eventRef);
	}

	registerView(type: string, factory: (leaf: unknown) => unknown): void {
		this.views[type] = factory;
	}

	registeredEditorExtensions: unknown[] = [];

	registerEditorExtension(extension: unknown): void {
		this.registeredEditorExtensions.push(extension);
	}

	markdownPostProcessors: ((element: unknown, context: unknown) => unknown)[] =
		[];

	registerMarkdownPostProcessor(
		processor: (element: unknown, context: unknown) => unknown,
	): unknown {
		this.markdownPostProcessors.push(processor);
		return processor;
	}

	domEvents: { type: string; handler: (evt: unknown) => unknown }[] = [];

	registerDomEvent(
		_el: unknown,
		type: string,
		handler: (evt: unknown) => unknown,
		_options?: unknown,
	): void {
		this.domEvents.push({ type, handler });
	}

	addRibbonIcon(
		icon: string,
		title: string,
		callback: () => unknown,
	): FakeElement {
		this.ribbonIcons.push({ icon, title, callback });
		return new FakeElement("div");
	}

	loadData(): Promise<unknown> {
		return Promise.resolve(this.storedData);
	}

	saveData(data: unknown): Promise<void> {
		this.storedData = data;
		return Promise.resolve();
	}

	__setStoredData(data: unknown): void {
		this.storedData = data;
	}

	__getStoredData(): unknown {
		return this.storedData;
	}
}

export class Modal {
	app: unknown;
	contentEl = new FakeElement("div");
	titleEl = new FakeElement("div");
	closed = false;

	constructor(app: unknown) {
		this.app = app;
	}

	open(): void {
		(this as { onOpen?: () => void }).onOpen?.();
	}

	close(): void {
		this.closed = true;
		(this as { onClose?: () => void }).onClose?.();
	}
}

export class ItemView {
	app: unknown;
	leaf: unknown;
	contentEl = new FakeElement("div");
	registeredEvents: unknown[] = [];

	constructor(leaf: unknown) {
		this.leaf = leaf;
		this.app = (leaf as { app?: unknown } | null)?.app;
	}

	registerEvent(eventRef: unknown): void {
		this.registeredEvents.push(eventRef);
	}
}

export class PluginSettingTab {
	app: unknown;
	plugin: unknown;
	containerEl = { empty: (): void => undefined };

	constructor(app: unknown, plugin: unknown) {
		this.app = app;
		this.plugin = plugin;
	}
}

export class DropdownComponent {
	options: Record<string, string> = {};
	value = "";
	changeHandler: ((value: string) => unknown) | null = null;

	addOption(key: string, label: string): this {
		this.options[key] = label;
		return this;
	}

	addOptions(options: Record<string, string>): this {
		Object.assign(this.options, options);
		return this;
	}

	setValue(value: string): this {
		this.value = value;
		return this;
	}

	onChange(handler: (value: string) => unknown): this {
		this.changeHandler = handler;
		return this;
	}

	async __change(value: string): Promise<void> {
		this.value = value;
		await this.changeHandler?.(value);
	}
}

export class ToggleComponent {
	value = false;
	changeHandler: ((value: boolean) => unknown) | null = null;

	setValue(value: boolean): this {
		this.value = value;
		return this;
	}

	onChange(handler: (value: boolean) => unknown): this {
		this.changeHandler = handler;
		return this;
	}

	async __change(value: boolean): Promise<void> {
		this.value = value;
		await this.changeHandler?.(value);
	}
}

export class TextComponent {
	value = "";
	placeholder = "";
	changeHandler: ((value: string) => unknown) | null = null;

	setPlaceholder(placeholder: string): this {
		this.placeholder = placeholder;
		return this;
	}

	setValue(value: string): this {
		this.value = value;
		return this;
	}

	onChange(handler: (value: string) => unknown): this {
		this.changeHandler = handler;
		return this;
	}

	async __change(value: string): Promise<void> {
		this.value = value;
		await this.changeHandler?.(value);
	}
}

export class SliderComponent {
	value = 0;
	limits: number[] = [];
	dynamicTooltip = false;
	changeHandler: ((value: number) => unknown) | null = null;

	setLimits(min: number, max: number, step: number): this {
		this.limits = [min, max, step];
		return this;
	}

	setDynamicTooltip(): this {
		this.dynamicTooltip = true;
		return this;
	}

	setValue(value: number): this {
		this.value = value;
		return this;
	}

	onChange(handler: (value: number) => unknown): this {
		this.changeHandler = handler;
		return this;
	}

	async __change(value: number): Promise<void> {
		this.value = value;
		await this.changeHandler?.(value);
	}
}

export class Setting {
	static instances: Setting[] = [];

	name = "";
	desc = "";
	dropdowns: DropdownComponent[] = [];
	toggles: ToggleComponent[] = [];
	texts: TextComponent[] = [];
	sliders: SliderComponent[] = [];

	constructor(public containerEl: unknown) {
		Setting.instances.push(this);
	}

	static reset(): void {
		Setting.instances = [];
	}

	setName(name: string): this {
		this.name = name;
		return this;
	}

	setDesc(desc: string): this {
		this.desc = desc;
		return this;
	}

	addDropdown(configure: (dropdown: DropdownComponent) => unknown): this {
		const dropdown = new DropdownComponent();
		this.dropdowns.push(dropdown);
		configure(dropdown);
		return this;
	}

	addToggle(configure: (toggle: ToggleComponent) => unknown): this {
		const toggle = new ToggleComponent();
		this.toggles.push(toggle);
		configure(toggle);
		return this;
	}

	addText(configure: (text: TextComponent) => unknown): this {
		const text = new TextComponent();
		this.texts.push(text);
		configure(text);
		return this;
	}

	addSlider(configure: (slider: SliderComponent) => unknown): this {
		const slider = new SliderComponent();
		this.sliders.push(slider);
		configure(slider);
		return this;
	}
}

export class MenuItem {
	title = "";
	icon = "";
	section = "";
	clickHandler: (() => unknown) | null = null;

	setSection(section: string): this {
		this.section = section;
		return this;
	}

	setTitle(title: string): this {
		this.title = title;
		return this;
	}

	setIcon(icon: string): this {
		this.icon = icon;
		return this;
	}

	onClick(handler: () => unknown): this {
		this.clickHandler = handler;
		return this;
	}
}

export class Menu {
	static instances: Menu[] = [];

	items: MenuItem[] = [];
	shownAt: unknown = null;

	constructor() {
		Menu.instances.push(this);
	}

	static reset(): void {
		Menu.instances = [];
	}

	addItem(configure: (item: MenuItem) => unknown): this {
		const item = new MenuItem();
		this.items.push(item);
		configure(item);
		return this;
	}

	showAtMouseEvent(event: unknown): this {
		this.shownAt = event;
		return this;
	}
}

export function normalizePath(path: string): string {
	let result = path.replace(/\\/g, "/").replace(/\/+/g, "/");
	if (result.startsWith("/")) {
		result = result.slice(1);
	}
	if (result.endsWith("/")) {
		result = result.slice(0, -1);
	}
	return result;
}
