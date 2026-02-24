# Agent Instructions

You are contributing to **Kit Plugins** (`@solana/kit-plugins`), a plugin library for [Solana Kit](https://github.com/anza-xyz/kit). Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for full project context including the monorepo structure, available scripts, and code standards.

## Code quality checklist

For every change you make, verify the following before presenting the changes to the user:

- **Docblocks**: All exported symbols (functions, types, interfaces, constants) must have JSDoc docblocks. Use the `/docblocks` skill for the full style guide.
- **Tests**: New features and bug fixes need tests. Tests use Vitest and run in three environments (Node.js, browser, React Native). Run `pnpm test:unit` in the relevant package directory to verify.
- **README**: When adding a new public API, add a section to the package's `README.md` following the existing structure. When modifying an existing API, keep the README in sync.
- **Umbrella package**: The umbrella package (`packages/kit-plugins`) re-exports everything from sub-packages via `export *`. If code in the umbrella (e.g. `defaults.ts`) duplicates logic that now exists in a sub-package, consolidate it by importing from the sub-package instead.
- **Guidelines**: When adding new packages, renaming public APIs, or changing the monorepo structure, check whether `CLAUDE.md` and `CONTRIBUTING.md` need updates to stay in sync (e.g. package tables, workflow descriptions, naming conventions).

## Shipping protocol

**Never commit, push, create branches, or create PRs without explicit user approval.**

Before any git operation that creates or modifies a commit, present the following to the user as a single review block:

1. **Changeset content** (if applicable) — the full `.changeset/*.md` file contents.
2. **Commit title** — a concise title for the commit.
3. **Commit/PR description** — a short description that explains what changed and why.

Wait for the user to approve or request changes before proceeding. This applies to:

- Creating commits or branches.
- Running `gt create`, `gt modify`, or `git commit`.
- Creating PRs via `gh pr create` or `gt submit`.
- Creating or modifying changeset files (present the content for review before writing).

## Git workflow

### Detect the user's tooling

Check if the user is using [Graphite](https://graphite.dev/) by looking for the `gt` CLI (`which gt`). Adapt the workflow accordingly.

### With Graphite (single commit per branch)

When creating a new PR:

```sh
gt create -am "Commit title" -m "Description body explaining what changed and why."
```

The first `-m` flag sets the commit title (first line). The second `-m` flag sets the commit body which Graphite uses as the PR description when the stack is submitted. Write the body as a concise flowing summary — avoid excessive blank lines.

When commit titles or descriptions contain backticks (e.g. for package names or code references), escape them with a backslash so the shell passes them through literally: `gt create -am "Align \`kit-plugins\` infrastructure"`.

When amending the current PR with additional changes:

```sh
gt modify -a
```

This amends the single commit on the current branch. Since Graphite uses a one-commit-per-branch model, always use `gt modify -a` for follow-up changes on the same PR rather than creating new commits.

### Without Graphite (standard Git)

Use standard `git add` and `git commit` workflows. Follow the same commit message conventions: concise title on the first line, blank line, then the description body.

## Changesets

Any PR that should trigger a package release must include a changeset. Use the `/changesets` skill to generate one, or create it manually following the format in [`CONTRIBUTING.md`](./CONTRIBUTING.md#changesets).

Key rules:

- Identify affected packages by mapping changed files to their nearest `package.json`.
- Choose the right bump level: `patch` for fixes, `minor` for features, `major` for breaking changes.
- While the project is pre-1.0, `minor` bumps may be treated as breaking.
- No changeset needed for: documentation-only changes, CI config, dev dependency updates, test-only changes.

## Available skills

This project includes the following skills in `.claude/skills/`. Use them when relevant:

| Skill      | Invocation                          | Description                                              |
| ---------- | ----------------------------------- | -------------------------------------------------------- |
| Changesets | `/changesets <patch\|minor\|major>` | Generate a changeset file with a proper changelog entry. |
| Docblocks  | `/docblocks [path] [--all]`         | Add missing docblocks to exported symbols.               |
| README     | `/readme [path]`                    | Create or update a README file.                          |

## CI expectations

Before presenting changes for review, verify locally:

- `pnpm lint` passes (ESLint + Prettier).
- `pnpm test` passes (type checking + unit tests across all environments).
- `pnpm build` succeeds and does not produce uncommitted changes in the working tree.

Running these in the relevant package directory (e.g. `pnpm test:unit` in `packages/kit-plugin-payer`) is sufficient for focused changes.
