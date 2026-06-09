import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64 } from "../src/lib/base64";
import { sampleBytes } from "./helpers";

describe("bytesToBase64", () => {
	it("encodes a known vector", () => {
		expect(bytesToBase64(new TextEncoder().encode("Hello"))).toBe("SGVsbG8=");
	});

	it("encodes an empty buffer", () => {
		expect(bytesToBase64(new Uint8Array(0))).toBe("");
	});

	it("handles buffers larger than one encoding chunk", () => {
		const bytes = sampleBytes(0x8000 * 2 + 17);
		expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
	});
});

describe("base64ToBytes", () => {
	it("decodes a known vector", () => {
		expect(new TextDecoder().decode(base64ToBytes("SGVsbG8="))).toBe("Hello");
	});

	it("round-trips arbitrary bytes", () => {
		const bytes = sampleBytes(1023);
		expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
	});

	it("tolerates embedded whitespace", () => {
		expect(new TextDecoder().decode(base64ToBytes("SGVs\nbG8="))).toBe("Hello");
	});

	it("rejects malformed payloads", () => {
		expect(() => base64ToBytes("not valid!")).toThrow("Malformed Base64");
		expect(() => base64ToBytes("abc")).toThrow("Malformed Base64");
	});
});
