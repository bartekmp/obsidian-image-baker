import { describe, expect, it } from "vitest";
import {
	applyReplacements,
	buildEmbeddedImageMarkdown,
	buildImageFileLink,
	findEmbeddedImages,
	findImageFileLinks,
	findLinkAtOffset,
	maskCodeRegions,
} from "../src/lib/markdown";

const DATA_URI = "data:image/png;base64,SGVsbG8=";

describe("maskCodeRegions", () => {
	it("blanks fenced code blocks while preserving length and newlines", () => {
		const content = "a\n```\n![[x.png]]\n```\nb";
		const masked = maskCodeRegions(content);
		expect(masked.length).toBe(content.length);
		expect(masked).not.toContain("x.png");
		expect(masked.split("\n").length).toBe(content.split("\n").length);
	});

	it("blanks inline code", () => {
		const masked = maskCodeRegions("see `![[x.png]]` here");
		expect(masked).not.toContain("x.png");
		expect(masked).toContain("see");
	});
});

describe("findImageFileLinks", () => {
	it("finds wiki image embeds", () => {
		const links = findImageFileLinks("before ![[photo.png]] after");
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({
			kind: "wiki",
			linkpath: "photo.png",
			params: [],
			raw: "![[photo.png]]",
			start: 7,
			end: 21,
		});
	});

	it("captures display parameters after pipes", () => {
		const links = findImageFileLinks("![[photo.png|300|center]]");
		expect(links[0]).toMatchObject({
			linkpath: "photo.png",
			params: ["300", "center"],
		});
	});

	it("ignores wiki embeds of non-image files", () => {
		expect(findImageFileLinks("![[Other note]] ![[doc.pdf]]")).toHaveLength(0);
	});

	it("finds markdown image links and decodes their targets", () => {
		const links = findImageFileLinks("![cat](pics/my%20cat.png)");
		expect(links[0]).toMatchObject({
			kind: "markdown",
			alt: "cat",
			target: "pics/my cat.png",
		});
	});

	it("supports angle-bracketed targets and titles", () => {
		const links = findImageFileLinks('![a](<pics/my cat.png> "title")');
		expect(links[0]).toMatchObject({ target: "pics/my cat.png" });
	});

	it("parses size parameters in markdown alt text", () => {
		const links = findImageFileLinks("![cat|300](cat.png)");
		expect(links[0]).toMatchObject({ alt: "cat", params: ["300"] });
	});

	it("ignores remote and data targets", () => {
		const content =
			"![r](https://example.com/x.png) ![d](data:image/png;base64,AAAA)";
		expect(findImageFileLinks(content)).toHaveLength(0);
	});

	it("ignores links inside code regions", () => {
		const content = "```\n![[a.png]]\n```\nand `![[b.png]]` only ![[c.png]]";
		const links = findImageFileLinks(content);
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({ linkpath: "c.png" });
	});

	it("returns links sorted by position", () => {
		const content = "![md](a.png) then ![[b.png]]";
		const links = findImageFileLinks(content);
		expect(links.map((link) => link.kind)).toEqual(["markdown", "wiki"]);
	});
});

describe("findEmbeddedImages", () => {
	it("finds Base64 image embeds", () => {
		const images = findEmbeddedImages(`x ![photo.png](${DATA_URI}) y`);
		expect(images).toHaveLength(1);
		expect(images[0]).toMatchObject({
			kind: "embedded",
			alt: "photo.png",
			mime: "image/png",
			base64: "SGVsbG8=",
		});
	});

	it("captures display parameters from the alt text", () => {
		const images = findEmbeddedImages(`![photo.png|300](${DATA_URI})`);
		expect(images[0]).toMatchObject({ alt: "photo.png", params: ["300"] });
	});

	it("ignores non-image data URIs", () => {
		expect(
			findEmbeddedImages("![f](data:application/pdf;base64,AAAA)"),
		).toHaveLength(0);
	});

	it("ignores embeds inside code regions", () => {
		expect(findEmbeddedImages(`\`![a](${DATA_URI})\``)).toHaveLength(0);
	});
});

describe("findLinkAtOffset", () => {
	const content = `start ![[file.png]] mid ![pic.png](${DATA_URI}) end`;

	it("returns the file link covering the offset", () => {
		const link = findLinkAtOffset(content, content.indexOf("file.png"));
		expect(link).toMatchObject({ kind: "wiki", linkpath: "file.png" });
	});

	it("returns the embedded image covering the offset", () => {
		const link = findLinkAtOffset(content, content.indexOf("base64"));
		expect(link).toMatchObject({ kind: "embedded", alt: "pic.png" });
	});

	it("returns null when the offset is outside any link", () => {
		expect(findLinkAtOffset(content, 0)).toBeNull();
	});
});

describe("applyReplacements", () => {
	it("applies multiple replacements regardless of input order", () => {
		const content = "one two three";
		const result = applyReplacements(content, [
			{ start: 8, end: 13, text: "3" },
			{ start: 0, end: 3, text: "1" },
		]);
		expect(result).toBe("1 two 3");
	});

	it("returns the content untouched for an empty list", () => {
		expect(applyReplacements("abc", [])).toBe("abc");
	});

	it("rejects overlapping replacements", () => {
		expect(() =>
			applyReplacements("abcdef", [
				{ start: 0, end: 4, text: "x" },
				{ start: 2, end: 6, text: "y" },
			]),
		).toThrow("Overlapping");
	});
});

describe("builders", () => {
	it("builds an embedded image with the file name in the alt text", () => {
		expect(buildEmbeddedImageMarkdown("photo.png", [], "image/png", "AAAA")).toBe(
			"![photo.png](data:image/png;base64,AAAA)",
		);
	});

	it("keeps display parameters in the alt text", () => {
		expect(
			buildEmbeddedImageMarkdown("photo.png", ["300"], "image/png", "AAAA"),
		).toBe("![photo.png|300](data:image/png;base64,AAAA)");
	});

	it("builds wiki links with parameters", () => {
		expect(buildImageFileLink("photo.png", ["300"], "wiki")).toBe(
			"![[photo.png|300]]",
		);
	});

	it("builds markdown links with encoded targets", () => {
		expect(buildImageFileLink("my pics (new)/cat.png", [], "markdown")).toBe(
			"![](my%20pics%20%28new%29/cat.png)",
		);
	});

	it("round-trips through the parser", () => {
		const built = buildEmbeddedImageMarkdown("a.png", ["200"], "image/png", "QUJD");
		const parsed = findEmbeddedImages(built);
		expect(parsed[0]).toMatchObject({
			alt: "a.png",
			params: ["200"],
			base64: "QUJD",
		});
	});
});
