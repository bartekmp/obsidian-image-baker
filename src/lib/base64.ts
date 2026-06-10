const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

/** Encodes raw bytes as a Base64 string. */
export function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

/**
 * Decodes a Base64 string into raw bytes. Whitespace is tolerated.
 * Throws on malformed input.
 */
export function base64ToBytes(base64: string): Uint8Array {
	const cleaned = base64.replace(/\s+/g, "");
	if (cleaned.length % 4 !== 0 || !BASE64_PATTERN.test(cleaned)) {
		throw new Error("Malformed Base64 payload");
	}
	const binary = atob(cleaned);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
