# Contributing to Image Baker

## Workflow

`main` is always releasable. All work happens on short-lived branches that are merged via pull
request once CI passes.

## Branch names

Branches must match:

```
^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)/[a-z0-9][a-z0-9._-]*$
```

Examples: `feat/context-menu`, `fix/svg-mime-type`, `docs/readme-badges`.

## Commit messages

Commits follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) and
are checked by commitlint in CI:

```
<type>(<optional scope>): <subject>

<optional body>

<optional footer>
```

- Allowed types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`,
  `style`, `test`.
- The header is at most **72 characters**, written in the imperative mood, lower-case, with no
  trailing period (`feat: add size limit setting`).
- Breaking changes carry a `!` after the type/scope (`feat!: drop legacy attachment API`) and a
  `BREAKING CHANGE:` footer explaining the migration.
- Body lines wrap at 100 characters.

You can check your commits locally before pushing:

```bash
npx commitlint --from origin/main --to HEAD --verbose
```

## Versioning

The project follows [Semantic Versioning 2.0.0](https://semver.org):

| Change | Version bump |
| --- | --- |
| `fix`, `perf`, dependency/internal changes | patch |
| `feat` (backwards-compatible) | minor |
| Any commit with `BREAKING CHANGE` | major |

While the major version is `0`, minor releases may contain breaking changes (per SemVer §4).

## Releasing

1. Make sure `main` is green and the changelog is up to date.
2. Run `npm version patch|minor|major`. This updates `package.json`, syncs `manifest.json` and
   `versions.json` (via `version-bump.mjs`), commits, and creates a tag named after the bare
   version number (no `v` prefix — required by Obsidian).
3. Push with `git push --follow-tags`. The release workflow builds the plugin, re-runs all
   checks, and publishes a GitHub release with `main.js` and `manifest.json` attached.

## Quality bar

Every pull request must pass:

- `npm run lint` — ESLint with type-checked rules
- `npm run typecheck` — strict TypeScript
- `npm run test:coverage` — unit tests with enforced coverage thresholds
- `npm run build` — production bundle

New features must come with unit tests.
