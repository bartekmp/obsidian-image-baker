# Image Baker 🍞

[![CI](https://github.com/bartekmp/obsidian-image-baker/actions/workflows/ci.yml/badge.svg)](https://github.com/bartekmp/obsidian-image-baker/actions/workflows/ci.yml)

An [Obsidian](https://obsidian.md) plugin that **bakes images into your notes** as self-contained
Base64 embeds — and un-bakes them back into regular vault files whenever you want.

Anchored images normally live as separate attachment files that clutter your vault, break when
moved, and get orphaned when notes are deleted. Image Baker inlines them into the note itself, so
the image exists only in the context of the note that uses it. The conversion is fully reversible:
extraction restores the original file name (recorded during baking) or derives one from the parent
note.

## Features

- **Embed images** — convert wiki embeds (`![[photo.png|300]]`) and markdown images
  (`![alt](photo.png)`) into inline Base64 data URIs. No attachment file remains in the vault.
- **Paste & drop baking** — paste a screenshot from the clipboard, or drag an image in from
  another window or folder, and it is baked straight into the note — no attachment file is ever
  created. Dropped files keep their real name; pasted screenshots get a clean
  `<note name> <timestamp>.png` name. If a transfer contains anything that is not a supported
  image within the size limit, Image Baker stands back and lets Obsidian handle it normally.
- **Extract images** — convert inline Base64 embeds back into vault files. The original file name
  and display parameters (such as `|300` sizing) are restored from the embed; images without a
  recoverable name inherit the parent note's name (`My note image 1.png`).
- **Context menu integration** — right-click on an image link or embed in the editor to bake or
  un-bake just that image.
- **Optional image optimization** — re-encode images to WebP or JPEG (configurable quality,
  optional max width downscaling) as they are baked in, typically shrinking screenshots
  several-fold. The optimized version is only used when it is actually smaller; SVG and GIF are
  never re-encoded. Off by default.
- **Collapsed embed data** — in the editor, the long Base64 text of a baked image is folded
  behind a small `base64 · 142 KB` pill; click it to expand, move the cursor away to fold it
  again. Toggleable in settings.
- **Batch conversion** — bake or extract across the entire vault or the current folder. The
  dialog shows a dry-run summary first ("Found 214 embeddable images (~38 MB) in 96 notes."),
  reports progress note by note, and can be aborted mid-run.
- **Image list sidebar** — a right-sidebar view (ribbon button 🖼 or the *Show image list*
  command) lists every image in the active note with a file/baked badge; clicking an entry jumps
  the editor straight to that image.
- **Commands** — available from the command palette for the active note:
  - *Embed all images in the current note*
  - *Extract all embedded images to files*
  - *Embed image under cursor*
  - *Extract image under cursor*
  - *Embed images across vault or folder*
  - *Extract embedded images across vault or folder*
  - *Show image list for the current note*
- **Safe by design**:
  - Source files are moved to the trash (never hard-deleted), and only when no other note —
    and no other spot in the same note — still references them. This can be turned off entirely.
  - Notes are modified atomically; links inside code blocks and inline code are ignored.
  - Identical duplicate embeds are extracted to a single file.
- **Configurable** via the settings tab:

  | Setting | Default | Description |
  | --- | --- | --- |
  | Collapse embedded image data | on | Fold Base64 payloads behind a size pill |
  | Embed images on paste | on | Bake pasted images straight into the note |
  | Embed images on drop | on | Bake dragged-in images straight into the note |
  | Delete source files after embedding | on | Trash the original file once baked in |
  | Maximum file size to embed (KB) | 0 (no limit) | Skip images larger than this |
  | Optimize images before embedding | off | Re-encode images while baking them in |
  | Optimized format / quality / max width | WebP / 75 / 0 | Target encoding for optimization |
  | Extracted link style | Wikilink | `![[image.png]]` or `![](image.png)` |
  | Log level | Warnings | Event logging verbosity: Off, Errors, Warnings, Info, Debug |
- **Event logging** — all operations are logged to the developer console
  (`Ctrl`/`Cmd`+`Shift`+`I`) at the configured level.
- Works on desktop and mobile. Like any plugin, it can be toggled on and off at any time under
  **Settings → Community plugins**.

## A note on embedded image size

Base64 encoding makes notes roughly 33 % larger than the original image file, and very large
inline images can slow down the editor. The *maximum file size* setting lets you guard against
accidentally baking in huge files.

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

All four checks run in CI for every push and pull request. Coverage thresholds (90 % lines /
functions / statements, 85 % branches) are enforced by the test suite.

### Releasing

The project follows [Semantic Versioning](https://semver.org). See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full branch, commit, and release conventions.

```bash
npm version patch|minor|major   # bumps package.json, manifest.json, versions.json + tags
git push --follow-tags
```

Pushing the version tag (e.g. `1.2.3` — no `v` prefix, per Obsidian convention) triggers the
release workflow, which builds the plugin and attaches `main.js` and `manifest.json` to a GitHub
release.

## License

[MIT](LICENSE)
