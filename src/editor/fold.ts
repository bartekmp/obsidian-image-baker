import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	type DecorationSet,
	type ViewUpdate,
} from "@codemirror/view";
import { approximateBase64Bytes, formatByteSize } from "../lib/bytes";
import { findEmbeddedImages } from "../lib/markdown";

export { approximateBase64Bytes, formatByteSize };

export interface SelectionLike {
	from: number;
	to: number;
}

export interface FoldRange {
	start: number;
	end: number;
	label: string;
}

/**
 * Computes the Base64 payload ranges of `text` that should be folded.
 * Payloads touched by a selection stay expanded so they remain editable;
 * clicking a fold pill moves the cursor into the payload to expand it.
 */
export function foldRanges(
	text: string,
	selections: readonly SelectionLike[],
	offset = 0,
): FoldRange[] {
	const ranges: FoldRange[] = [];
	for (const image of findEmbeddedImages(text)) {
		const start = offset + image.base64Start;
		const end = offset + image.base64End;
		if (start >= end) {
			continue;
		}
		const touched = selections.some(
			(selection) => selection.from <= end && selection.to >= start,
		);
		if (touched) {
			continue;
		}
		const payloadLength = image.base64.replace(/\s+/g, "").length;
		ranges.push({
			start,
			end,
			label: formatByteSize(approximateBase64Bytes(payloadLength)),
		});
	}
	return ranges;
}

class Base64FoldWidget extends WidgetType {
	constructor(
		private readonly label: string,
		private readonly position: number,
	) {
		super();
	}

	override eq(other: Base64FoldWidget): boolean {
		return other.label === this.label && other.position === this.position;
	}

	override toDOM(view: EditorView): HTMLElement {
		const pill = document.createElement("span");
		pill.className = "image-baker-fold";
		pill.textContent = `base64 · ${this.label}`;
		pill.setAttribute("title", "Click to expand the embedded image data");
		pill.onmousedown = (event): void => {
			event.preventDefault();
			view.dispatch({ selection: { anchor: this.position } });
		};
		return pill;
	}
}

function buildDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const selections: SelectionLike[] = view.state.selection.ranges.map(
		(range) => ({ from: range.from, to: range.to }),
	);
	let lastEnd = -1;
	for (const visible of view.visibleRanges) {
		// Extend to whole lines so a payload is never scanned in half.
		const from = view.state.doc.lineAt(visible.from).from;
		const to = view.state.doc.lineAt(visible.to).to;
		const text = view.state.doc.sliceString(from, to);
		for (const range of foldRanges(text, selections, from)) {
			if (range.start <= lastEnd) {
				continue;
			}
			lastEnd = range.end;
			builder.add(
				range.start,
				range.end,
				Decoration.replace({
					widget: new Base64FoldWidget(range.label, range.start),
				}),
			);
		}
	}
	return builder.finish();
}

/**
 * Editor extension that folds inline Base64 image payloads behind a small
 * pill showing the approximate image size.
 */
export function imageFoldExtension(): Extension {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view);
			}

			update(update: ViewUpdate): void {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet
				) {
					this.decorations = buildDecorations(update.view);
				}
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}
