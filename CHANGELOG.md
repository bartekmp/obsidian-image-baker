# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-09

### Added

- Embed wiki and markdown image links as inline Base64 data URIs, preserving display parameters
  and recording the original file name for later restoration.
- Batch conversion across the vault or the current folder, with a dry-run summary,
  per-note progress, and an abort button.
- Optional image optimization while baking: re-encode to WebP or JPEG with configurable
  quality and max width, applied only when the result is smaller (SVG/GIF excluded).
- Collapse the Base64 payload of baked images behind a size pill in the editor (click to
  expand, toggleable in settings).
- Bake images directly on paste (e.g. clipboard screenshots) and drag-and-drop, keeping the
  dropped file's name or deriving a timestamped name from the note; transfers with unsupported
  or oversized content fall through to Obsidian's default handling.
- Extract inline Base64 images back into vault files, restoring the recorded file name or
  deriving one from the parent note.
- Command palette commands: embed/extract all images in the current note, embed/extract the
  image under the cursor.
- Editor context menu actions on image links and embeds, and an "Extract image to file"
  context menu on rendered images in reading view.
- Image list sidebar view (ribbon button and command) showing every image of the active note;
  clicking an entry jumps the editor to that image.
- Optional trashing of source files after embedding, guarded against files that are still
  referenced elsewhere.
- Configurable maximum embed size (default 1 MB, 0 disables the limit), extracted link
  style, and event log level.

[Unreleased]: https://github.com/bartekmp/obsidian-image-baker/compare/0.1.0...HEAD
[0.1.0]: https://github.com/bartekmp/obsidian-image-baker/releases/tag/0.1.0
