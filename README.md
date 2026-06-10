# Image Baker 🍞

[![CI](https://github.com/bartekmp/obsidian-image-baker/actions/workflows/ci.yml/badge.svg)](https://github.com/bartekmp/obsidian-image-baker/actions/workflows/ci.yml)

An [Obsidian](https://obsidian.md) plugin that **bakes images into your notes** as self-contained
Base64 embeds — and un-bakes them back into regular vault files whenever you want.

Anchored images normally live as separate attachment files that clutter your vault, break when
notes are moved or shared, and get orphaned when notes are deleted. Image Baker inlines them into
the note itself, so the image exists only in the context of the note that uses it. A baked note is
fully portable: one markdown file carries its own images anywhere.

The conversion is **fully reversible**: the original file name and display parameters (such as
`|300` sizing) are recorded in the embed, so extraction restores them exactly; images without a
recoverable name inherit the parent note's name (`My note image 1.png`).

## Features

### Getting images in

- **Paste** a screenshot from the clipboard or **drag and drop** an image from another window or
  folder — it is baked straight into the note, no attachment file is ever created. Dropped files
  keep their real name; pasted screenshots get a clean `<note name> <timestamp>.png` name. If a
  transfer contains anything that is not a supported image within the size limit, Image Baker
  stands back and Obsidian handles it normally.
- **Convert existing images**: wiki embeds (`![[photo.png|300]]`) and markdown images
  (`![alt](photo.png)`) are converted in place — per image, per note, or in bulk.
- **Optional optimization**: re-encode images to WebP or JPEG (configurable quality, optional
  max-width downscaling) as they are baked in, typically shrinking screenshots several-fold. The
  optimized version is only used when it is actually smaller; SVG and GIF are never re-encoded.

### Getting images out

- **Extract** any embed back into a vault file — original name, sizing, *and folder* restored
  (the embed records where the file came from; the attachment folder is only a fallback), name
  collisions resolved automatically, identical duplicate embeds extracted to a single file.
- **Copy to clipboard** — copy a baked image's pixels back out (converted to PNG, the only
  image format clipboards accept) for use in any other app, without touching the note.
- Works from the command palette, the editor context menu, the reading-view context menu, or in
  bulk across the vault.

### Working with baked notes

- **Collapsed embed data** — in the editor, the long Base64 text is folded behind a small
  `base64 · 142 KB` pill; click it to expand, move the cursor away to fold it again.
- **Image list sidebar** — a right-sidebar view (ribbon button 🖼 or a command) lists every image
  of the active note with a file/baked badge and a one-click *Bake*/*Extract* button per image;
  clicking an entry jumps the editor to that image.
- **Context menus everywhere** — right-click a rendered image in Live Preview or reading view,
  an image link in source mode, or an image file in the file explorer (*Embed image into notes
  that use it* — converts every note that links it, then trashes the file once nothing
  references it).
- **Click-to-select** — clicking or right-clicking a rendered image selects its markdown, so the
  *Embed/Extract/Copy selected image* commands and menu actions apply to it directly.

### Commands

- *Embed all images in the current note* / *Extract all embedded images to files*
- *Embed selected image* / *Extract selected image* / *Copy selected image to clipboard* —
  apply to the image under the cursor or the one selected by clicking it
- *Embed images in selection* / *Extract images in selection* — convert exactly the images
  inside the current text selection, even when the same link appears elsewhere in the note.
- *Embed images across vault or folder* / *Extract embedded images across vault or folder* —
  batch dialogs show a dry-run summary first ("Found 214 embeddable images (~38 MB) in 96
  notes."), report progress note by note, and can be aborted mid-run.
- *Show image list for the current note*

### Safe by design

- Source files are **moved to the trash, never hard-deleted**, and only when no other note — and
  no other spot in the same note — still references them. Deletion can be turned off entirely.
- Notes are modified atomically; image links inside code blocks and inline code are ignored.
- Oversized images are skipped (1 MB by default, configurable) instead of silently bloating notes.

### Settings

| Setting | Default | Description |
| --- | --- | --- |
| Collapse embedded image data | on | Fold Base64 payloads behind a size pill |
| Embed images on paste | on | Bake pasted images straight into the note |
| Embed images on drop | on | Bake dragged-in images straight into the note |
| Delete source files after embedding | on | Trash the original file once baked in |
| Maximum file size to embed (KB) | 1024 | Skip images larger than this (0 = no limit) |
| Optimize images before embedding | off | Re-encode images while baking them in |
| Optimized format / quality / max width | WebP / 75 / 0 | Target encoding for optimization |
| Extracted link style | Wikilink | `![[image.png]]` or `![](image.png)` |
| Log level | Warnings | Event logging: Off, Errors, Warnings, Info, Debug |

All operations are logged to the developer console (`Ctrl`/`Cmd`+`Shift`+`I`) at the configured
level. The plugin works on desktop and mobile and can be toggled at any time under
**Settings → Community plugins**.

## Known limitations

- **Base64 embeds make notes larger** — roughly 33 % over the raw image size. The size limit and
  the optimization setting are there to keep this under control.
- **Bases / card views don't render baked images.** Obsidian's database-style views ignore
  data-URI images. This is inherent to inlining and applies to every plugin using this approach;
  extract the image back to a file if you need it there.
- **Publishing baked notes depends on the renderer.** Obsidian renders data-URI images
  everywhere, but some external markdown renderers strip them — GitHub notably does. If a note
  is headed for such a platform, run *Extract all embedded images to files* on a copy first.
- **Excalidraw and Canvas are out of scope.** Both store image references in JSON, not markdown.
- **Mobile paste is untested.** The paste/drop handling uses only cross-platform editor events,
  but has not yet been verified on a phone or tablet.

## Installation

### From the community plugin list

Once accepted into the community catalog: **Settings → Community plugins → Browse**, search for
"Image Baker".

### With BRAT

Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin and add
`bartekmp/obsidian-image-baker` as a beta plugin.

### Manual

Download `main.js`, `manifest.json`, and `styles.css` from the
[latest release](https://github.com/bartekmp/obsidian-image-baker/releases) and place them in
`<your vault>/.obsidian/plugins/image-baker/`, then enable the plugin in
**Settings → Community plugins**.

## Developing

### Prerequisites

- [Node.js](https://nodejs.org) 22 or newer
- npm 10 or newer

### Building

```bash
git clone https://github.com/bartekmp/obsidian-image-baker.git
cd obsidian-image-baker
npm ci
npm run build        # production build → main.js
npm run dev          # watch mode with inline source maps
```

For live testing, clone the repository into
`<test vault>/.obsidian/plugins/image-baker/` (always use a dedicated development vault) and
reload the plugin after each rebuild.

### Quality checks

```bash
npm run lint           # ESLint (type-checked rules)
npm run typecheck      # tsc --noEmit
npm test               # Vitest unit tests
npm run test:coverage  # tests with coverage thresholds enforced
```

Coverage thresholds (90 % lines / functions / statements, 85 % branches) are enforced by the
test suite. Editor-facing code is tested against a real CodeMirror `EditorView`.

### Continuous integration

- **GitHub Actions** (`.github/workflows/ci.yml`) runs all four checks and builds the plugin on
  every push and pull request; commit messages are checked with commitlint on pull requests.
- A **Jenkinsfile** is included for self-hosted CI; it mirrors the GitHub pipeline and
  additionally archives a ready-to-deploy `image-baker-<version>.zip` artifact.

### Releasing

The project follows [Semantic Versioning](https://semver.org). See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full branch, commit, and release conventions.

```bash
npm version patch|minor|major   # bumps package.json, manifest.json, versions.json + tags
git push --follow-tags
```

Pushing the version tag (e.g. `1.2.3` — no `v` prefix, per Obsidian convention) triggers the
release workflow, which re-runs all checks and publishes a GitHub release with `main.js`,
`manifest.json`, and `styles.css` attached.

## License

[MIT](LICENSE)
