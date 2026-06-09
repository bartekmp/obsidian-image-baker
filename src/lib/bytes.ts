/** Approximate decoded size of a Base64 payload of the given length. */
export function approximateBase64Bytes(payloadLength: number): number {
	return Math.floor((payloadLength * 3) / 4);
}

export function formatByteSize(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${Math.round(bytes / 1024)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
