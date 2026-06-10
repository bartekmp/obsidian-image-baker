import { describe, expect, it } from "vitest";
import {
	generateImageFilename,
	imagePathFromAlt,
	matchExtensionToMime,
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

describe("imagePathFromAlt", () => {
	it("recovers an image file name", () => {
		expect(imagePathFromAlt("photo.png")).toBe("photo.png");
	});

	it("recovers a path with folders", () => {
		expect(imagePathFromAlt("pics/2026/my photo.png")).toBe(
			"pics/2026/my photo.png",
		);
	});

	it("rejects alt text that is not an image path", () => {
		expect(imagePathFromAlt("just a caption")).toBeNull();
		expect(imagePathFromAlt("document.pdf")).toBeNull();
		expect(imagePathFromAlt("")).toBeNull();
		expect(imagePathFromAlt("pics//photo.png")).toBeNull();
	});

	it("sanitizes hostile path segments", () => {
		expect(imagePathFromAlt('pi<cs/pho|to".png')).toBe("pics/photo.png");
	});
});

describe("matchExtensionToMime", () => {
	it("keeps names whose extension already matches", () => {
		expect(matchExtensionToMime("photo.png", "image/png")).toBe("photo.png");
		expect(matchExtensionToMime("photo.jpeg", "image/jpeg")).toBe("photo.jpeg");
		expect(matchExtensionToMime("photo.jpg", "IMAGE/JPEG")).toBe("photo.jpg");
	});

	it("replaces mismatched extensions", () => {
		expect(matchExtensionToMime("photo.png", "image/webp")).toBe("photo.webp");
		expect(matchExtensionToMime("a.b.png", "image/jpeg")).toBe("a.b.jpg");
	});

	it("appends an extension when the name has none", () => {
		expect(matchExtensionToMime("photo", "image/webp")).toBe("photo.webp");
	});

	it("keeps the name for unknown MIME types", () => {
		expect(matchExtensionToMime("photo.png", "image/tiff")).toBe("photo.png");
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
