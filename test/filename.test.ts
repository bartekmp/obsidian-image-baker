import { describe, expect, it } from "vitest";
import {
	filenameFromAlt,
	generateImageFilename,
	sanitizeFilename,
} from "../src/lib/filename";

describe("sanitizeFilename", () => {
	it("keeps ordinary names intact", () => {
		expect(sanitizeFilename("My photo 1.png")).toBe("My photo 1.png");
	});

	it("strips characters that are invalid in vault paths", () => {
		expect(sanitizeFilename('a<b>:c"d/e\\f|g?h*i.png')).toBe("abcdefghi.png");
	});

	it("collapses whitespace and trims", () => {
		expect(sanitizeFilename("  a   b.png  ")).toBe("a b.png");
	});

	it("removes leading dots", () => {
		expect(sanitizeFilename("..hidden.png")).toBe("hidden.png");
	});
});

describe("filenameFromAlt", () => {
	it("recovers an image file name", () => {
		expect(filenameFromAlt("photo.png")).toBe("photo.png");
	});

	it("rejects alt text that is not an image file name", () => {
		expect(filenameFromAlt("just a caption")).toBeNull();
		expect(filenameFromAlt("document.pdf")).toBeNull();
		expect(filenameFromAlt("")).toBeNull();
	});
});

describe("generateImageFilename", () => {
	it("inherits the parent note's base name", () => {
		expect(generateImageFilename("Trip to Oslo", 2, "png")).toBe(
			"Trip to Oslo image 2.png",
		);
	});

	it("falls back to a generic name when the note name sanitizes away", () => {
		expect(generateImageFilename("???", 1, "jpg")).toBe("image image 1.jpg");
	});
});
