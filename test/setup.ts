// Obsidian exposes `activeDocument` (the document of the focused window)
// as a runtime global; mirror the test DOM onto it. Node-environment test
// files have no document and never touch it.
if (typeof document !== "undefined") {
	(globalThis as { activeDocument?: Document }).activeDocument = document;
}
