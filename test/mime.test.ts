import { describe, expect, it } from "vitest";
import {
	extensionFromMime,
	extensionFromPath,
	isImageExtension,
	isImagePath,
	mimeFromExtension,
} from "../src/lib/mime";

describe("extensionFromPath", () => {
	it("returns the lowercased extension", () => {
		expect(extensionFromPath("photo.PNG")).toBe("png");
		expect(extensionFromPath("dir/photo.jpeg")).toBe("jpeg");
	});

	it("only considers the file name segment", () => {
		expect(extensionFromPath("dir.v2/readme")).toBe("");
	});

	it("returns an empty string for missing or degenerate extensions", () => {
		expect(extensionFromPath("noext")).toBe("");
		expect(extensionFromPath(".hidden")).toBe("");
		expect(extensionFromPath("trailing.")).toBe("");
	});
});

describe("isImageExtension / isImagePath", () => {
	it("accepts all Obsidian-supported image formats", () => {
		for (const extension of ["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]) {
			expect(isImageExtension(extension)).toBe(true);
		}
	});

	it("is case-insensitive", () => {
		expect(isImageExtension("PNG")).toBe(true);
		expect(isImagePath("a/B.JPG")).toBe(true);
	});

	it("rejects non-image formats", () => {
		expect(isImageExtension("md")).toBe(false);
		expect(isImageExtension("pdf")).toBe(false);
		expect(isImagePath("note.md")).toBe(false);
	});
});

describe("mimeFromExtension", () => {
	it("maps extensions to MIME types", () => {
		expect(mimeFromExtension("png")).toBe("image/png");
		expect(mimeFromExtension("jpg")).toBe("image/jpeg");
		expect(mimeFromExtension("jpeg")).toBe("image/jpeg");
		expect(mimeFromExtension("svg")).toBe("image/svg+xml");
	});

	it("returns null for unknown extensions", () => {
		expect(mimeFromExtension("tiff")).toBeNull();
	});
});

describe("extensionFromMime", () => {
	it("maps MIME types back to extensions", () => {
		expect(extensionFromMime("image/png")).toBe("png");
		expect(extensionFromMime("image/jpeg")).toBe("jpg");
		expect(extensionFromMime("IMAGE/WEBP")).toBe("webp");
	});

	it("returns null for unknown MIME types", () => {
		expect(extensionFromMime("image/tiff")).toBeNull();
		expect(extensionFromMime("application/pdf")).toBeNull();
	});
});
