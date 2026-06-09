// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
	approximateBase64Bytes,
	foldRanges,
	formatByteSize,
	imageFoldExtension,
} from "../src/editor/fold";

const PAYLOAD = "QUJDREVGR0g=";
const EMBED = `![photo.png](data:image/png;base64,${PAYLOAD})`;

describe("approximateBase64Bytes", () => {
	it("estimates the decoded size", () => {
		expect(approximateBase64Bytes(12)).toBe(9);
		expect(approximateBase64Bytes(0)).toBe(0);
	});
});

describe("formatByteSize", () => {
	it("formats bytes, kilobytes, and megabytes", () => {
		expect(formatByteSize(512)).toBe("512 B");
		expect(formatByteSize(145_000)).toBe("142 KB");
		expect(formatByteSize(3_400_000)).toBe("3.2 MB");
	});
});

describe("foldRanges", () => {
	it("returns the payload range with a size label", () => {
		const text = `before ${EMBED} after`;
		const ranges = foldRanges(text, []);
		expect(ranges).toHaveLength(1);
		const range = ranges[0];
		expect(text.slice(range?.start, range?.end)).toBe(PAYLOAD);
		expect(range?.label).toBe("9 B");
	});

	it("keeps payloads expanded while a selection touches them", () => {
		const text = EMBED;
		const payloadStart = text.indexOf(PAYLOAD);
		expect(
			foldRanges(text, [{ from: payloadStart + 2, to: payloadStart + 2 }]),
		).toHaveLength(0);
		expect(foldRanges(text, [{ from: 0, to: 2 }])).toHaveLength(1);
	});

	it("applies the offset to both range and selection comparisons", () => {
		const ranges = foldRanges(EMBED, [], 100);
		expect(ranges[0]?.start).toBe(100 + EMBED.indexOf(PAYLOAD));
	});

	it("ignores notes without embeds", () => {
		expect(foldRanges("plain ![[a.png]] text", [])).toHaveLength(0);
	});
});

describe("imageFoldExtension in an editor", () => {
	function makeView(doc: string): EditorView {
		const state = EditorState.create({
			doc,
			extensions: [imageFoldExtension()],
		});
		return new EditorView({ state, parent: document.body });
	}

	it("renders a fold pill over the Base64 payload", () => {
		const view = makeView(`note ${EMBED}`);
		try {
			const pill = view.dom.querySelector(".image-baker-fold");
			expect(pill).not.toBeNull();
			expect(pill?.textContent).toBe("base64 · 9 B");
			expect(view.dom.textContent).not.toContain(PAYLOAD);
		} finally {
			view.destroy();
		}
	});

	it("expands the payload when the cursor moves into it", () => {
		const view = makeView(EMBED);
		try {
			view.dispatch({
				selection: { anchor: EMBED.indexOf(PAYLOAD) + 1 },
			});
			expect(view.dom.querySelector(".image-baker-fold")).toBeNull();
			expect(view.dom.textContent).toContain(PAYLOAD);
		} finally {
			view.destroy();
		}
	});

	it("folds again when the cursor leaves the payload", () => {
		const view = makeView(EMBED);
		try {
			view.dispatch({ selection: { anchor: EMBED.indexOf(PAYLOAD) + 1 } });
			view.dispatch({ selection: { anchor: 0 } });
			expect(view.dom.querySelector(".image-baker-fold")).not.toBeNull();
		} finally {
			view.destroy();
		}
	});
});
