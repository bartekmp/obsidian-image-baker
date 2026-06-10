## [1.0.1](https://github.com/bartekmp/obsidian-image-baker/compare/1.0.0...1.0.1) (2026-06-10)


### Bug Fixes

* adjust the release artifacts ([9cda15a](https://github.com/bartekmp/obsidian-image-baker/commit/9cda15a49dcb1578005cdeced9d276cb8f168f81))

# 1.0.0 (2026-06-10)


### Bug Fixes

* discard stale sidebar refreshes ([946cf41](https://github.com/bartekmp/obsidian-image-baker/commit/946cf41cb00dcac5d8003e895e71b4ee7f88d1b7))
* drop jenkins option requiring the timestamper plugin ([5a1f855](https://github.com/bartekmp/obsidian-image-baker/commit/5a1f8558892af51e396b88acf3a3747053337c93))
* extract pasted images next to their note ([b63746a](https://github.com/bartekmp/obsidian-image-baker/commit/b63746a46f4289da04b9b3e95de0c1e3cef6544f))
* place and surface image menu actions correctly ([39fbb3d](https://github.com/bartekmp/obsidian-image-baker/commit/39fbb3d56b9211494c3b1f1c2358a2e633c11efe))


### Features

* act on the image selected in the editor ([1aa1b31](https://github.com/bartekmp/obsidian-image-baker/commit/1aa1b318a3c4bfdbaa87e1be19b00de5058f7550))
* add batch embed and extract across vault or folder ([025456b](https://github.com/bartekmp/obsidian-image-baker/commit/025456b83c6e77cd598eb26a22265db836af60ca))
* add convert buttons to the image list sidebar ([df0fd20](https://github.com/bartekmp/obsidian-image-baker/commit/df0fd2010f784fd6a627822065d8792af0ce2d00))
* add image embed and extract engine ([318953b](https://github.com/bartekmp/obsidian-image-baker/commit/318953bbc54c6a04d99e7e1c648840f95c58376a))
* add image list sidebar view ([5e95716](https://github.com/bartekmp/obsidian-image-baker/commit/5e957168e19c87aae86b2397fc0d853ad12534bb))
* add plugin commands, context menu, and settings tab ([a75851f](https://github.com/bartekmp/obsidian-image-baker/commit/a75851f51b435f4b2e9a1c306f3bcd25f43d2a0d))
* add selection scope and clipboard menu entries ([85a2444](https://github.com/bartekmp/obsidian-image-baker/commit/85a244482db4e1d64797c3973347e50b4187adda))
* bake images directly on paste and drop ([982c2c8](https://github.com/bartekmp/obsidian-image-baker/commit/982c2c842279232e32a374f82d67d679a5f94baf))
* copy baked images to the clipboard ([734611f](https://github.com/bartekmp/obsidian-image-baker/commit/734611fc37017a95cb983e6416aafb9305ba63dc))
* default the embed size limit to 1 MB ([d3d9b4a](https://github.com/bartekmp/obsidian-image-baker/commit/d3d9b4a8fcacd613e8e82fe4d76ca211e9f9525a))
* delete a baked image from its context menu ([ef26999](https://github.com/bartekmp/obsidian-image-baker/commit/ef2699940b3af432ff5ad71ef531d3eb26945bf7))
* embed an image from the file explorer menu ([27cdbf5](https://github.com/bartekmp/obsidian-image-baker/commit/27cdbf50400381586608443b4a695152680c3592))
* embed or extract a note's images from the file explorer ([8e27602](https://github.com/bartekmp/obsidian-image-baker/commit/8e276025e736bd5e9048cad946e05cde139a2c82))
* extract baked images from the reading view menu ([799b161](https://github.com/bartekmp/obsidian-image-baker/commit/799b161a8f2576298a25a4afd2ce877710e687ac))
* fold embedded image data behind a size pill ([4902ecc](https://github.com/bartekmp/obsidian-image-baker/commit/4902ecc464ebefd498bb5364bb2262be23759df7))
* multi-select and batch convert in the image sidebar ([7008a7d](https://github.com/bartekmp/obsidian-image-baker/commit/7008a7d2cfc64e3547a09dcbb11f8168d43eb031))
* optionally optimize images before embedding ([4e69720](https://github.com/bartekmp/obsidian-image-baker/commit/4e69720bac7c7df5a489918153d072122a3c46f3))
* restore extracted images to their original folder ([b4db614](https://github.com/bartekmp/obsidian-image-baker/commit/b4db614acf81f5f03c98a1ab9fc5d9f8559dab8e))
* setup 1.0.0 release ([5eb7d8c](https://github.com/bartekmp/obsidian-image-baker/commit/5eb7d8c0e79632076459fb439a8457395541d74b))

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
  image under the cursor, embed/extract only the images inside the current selection, and
  copy the baked image under the cursor to the clipboard.
- "Copy image to clipboard" on baked images in the editor and reading-view context menus
  (non-PNG embeds are converted to PNG for the clipboard).
- Editor context menu actions on image links and embeds, and an "Extract image to file"
  context menu on rendered images in reading view.
- Right-clicking a rendered image in Live Preview selects its markdown, making the context
  menu and "selected image" commands apply to it directly.
- File explorer context menu: embed an image into every note that links it, trashing the
  source only when nothing references it anymore; notes offer embed/extract of all their
  images without opening them.
- Bake/Extract buttons on each entry of the image list sidebar, plus multi-select with
  "Select files"/"Select baked" shortcuts and a batch convert button for same-type selections.
- Right-clicking a baked image shows extract/copy/reset-size/delete actions (replacing
  Obsidian's non-extensible widget menu); the file-explorer entry sits with the action group
  instead of after "Delete".
- Pasted and dropped images record the note's folder, so extracting them later places the
  file next to the note instead of the vault root.
- Extraction restores images to the folder they were embedded from (recorded in the embed),
  falling back to the attachment folder when it no longer exists.
- Image list sidebar view (ribbon button and command) showing every image of the active note;
  clicking an entry jumps the editor to that image.
- Optional trashing of source files after embedding, guarded against files that are still
  referenced elsewhere.
- Configurable maximum embed size (default 1 MB, 0 disables the limit), extracted link
  style, and event log level.

[Unreleased]: https://github.com/bartekmp/obsidian-image-baker/compare/0.1.0...HEAD
[0.1.0]: https://github.com/bartekmp/obsidian-image-baker/releases/tag/0.1.0
