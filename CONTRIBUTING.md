# Contributing to Kit Plugins

Thank you for your interest in contributing to Kit Plugins! This guide covers everything you need to get started.

> **AI agents**: See [`CLAUDE.md`](./CLAUDE.md) for agent-specific workflow instructions.

## Project structure

This is a monorepo managed with [pnpm](https://pnpm.io/) and [Turborepo](https://turbo.build/). It contains the following packages:

| Package                                                                         | Description                                   |
| ------------------------------------------------------------------------------- | --------------------------------------------- |
| [`@solana/kit-plugins`](./packages/kit-plugins)                                 | Umbrella package that re-exports all plugins. |
| [`@solana/kit-client-rpc`](./packages/kit-client-rpc)                           | Pre-configured RPC client factory.            |
| [`@solana/kit-client-litesvm`](./packages/kit-client-litesvm)                   | Pre-configured LiteSVM client factory.        |
| [`@solana/kit-plugin-rpc`](./packages/kit-plugin-rpc)                           | RPC connection plugins.                       |
| [`@solana/kit-plugin-payer`](./packages/kit-plugin-payer)                       | Transaction fee payer plugins.                |
| [`@solana/kit-plugin-airdrop`](./packages/kit-plugin-airdrop)                   | SOL airdrop plugin.                           |
| [`@solana/kit-plugin-litesvm`](./packages/kit-plugin-litesvm)                   | LiteSVM support plugin.                       |
| [`@solana/kit-plugin-instruction-plan`](./packages/kit-plugin-instruction-plan) | Transaction planning and execution plugins.   |

The umbrella package (`@solana/kit-plugins`) re-exports everything from the individual plugin packages via `export *` statements. When you add a new export to a sub-package, it is automatically available through the umbrella package. The `kit-client-*` client factory functions are also re-exported from the umbrella with `@deprecated` tags — consumers should import them from their dedicated packages instead.

## Getting started

```sh
# Clone the repository.
git clone https://github.com/anza-xyz/kit-plugins.git
cd kit-plugins

# Install dependencies.
pnpm install

# Build all packages.
pnpm build

# Run all tests.
pnpm test

# Run linting.
pnpm lint
```

### Useful per-package commands

You can also run commands within individual packages:

```sh
# Run unit tests for a specific package.
pnpm test:unit --filter @solana/kit-plugin-payer

# Or navigate to the package directory.
cd packages/kit-plugin-payer
pnpm test:unit   # Unit tests only.
pnpm test:types  # Type checking only.
pnpm build       # Build only this package.
pnpm lint        # Lint only this package.
```

## Code standards

### Docblocks

All exported symbols (functions, types, interfaces, constants) must have JSDoc docblocks. Follow these key conventions:

- Start with a concise one or two line summary.
- Include `@param` tags for all parameters and `@returns` for return values.
- Include at least one `@example` section with realistic, concise TypeScript code.
- Use `{@link ...}` to reference related items and `@see` for related documentation.

For the full style guide with examples, see [`.claude/skills/docblocks/SKILL.md`](./.claude/skills/docblocks/SKILL.md).

### Tests

Every new feature or bug fix should include tests. This project uses [Vitest](https://vitest.dev/) and runs tests across three environments: **Node.js**, **browser**, and **React Native**.

- Write tests in `test/` within the relevant package.
- Use `vi.fn()` for mocks, `expectTypeOf` for type assertions.
- Run `pnpm test:unit` in the package directory to verify.

### README

When adding a new public API to a package, update that package's `README.md` with a new section following the existing structure (description, installation example, features). When modifying an existing API, keep the README in sync. See the existing READMEs for the expected format, or use the [`.claude/skills/readme/SKILL.md`](./.claude/skills/readme/SKILL.md) guide.

### Umbrella package

When modifying exports in a `kit-plugin-*` sub-package, the umbrella package picks them up automatically via `export *`. The `kit-client-*` client factory functions are re-exported separately with `@deprecated` tags in `defaults.ts` — new client factories should live in their own `kit-client-*` package rather than in the umbrella.

## Pull request workflow

This project uses [Graphite](https://graphite.dev/) for stacked PRs with a **single commit per branch** model. If you are not using Graphite, standard Git workflows are fine.

### Graphite workflow

```sh
# Create a new PR (single commit).
gt create -am "Commit title"

# Amend the current PR with new changes.
gt modify -a

# Submit the stack for review.
gt submit
```

The commit message body is used as the PR description by Graphite, so write it as a concise summary that explains what changed and why. Keep it as a single flowing paragraph or short list — avoid excessive blank lines.

### PR description guidelines

- Explain the changes in a few concise sentences focused on what matters to a reviewer.
- Don't get creative with headers — use them sparingly and only when the PR has clearly distinct sections.
- Include code examples when they genuinely clarify the change or illustrate a new API feature usage. Not all PRs need them.
- Don't repeat the full changeset content — the PR description should complement it, not duplicate it.

## Changesets

Any PR that should trigger a new package release must include a [changeset](https://github.com/changesets/changesets). Changesets live in `.changeset/` and describe which packages are affected and at what bump level.

### When to add a changeset

- **New feature**: `minor` bump (or `patch` for small additions).
- **Bug fix**: `patch` bump.
- **Breaking change**: `major` bump. Note that while the project is pre-1.0, `minor` bumps are treated as breaking.
- **No changeset needed**: Documentation-only changes, CI config, dev dependency updates, test-only changes.

### Changeset format

```md
---
'@solana/kit-plugin-payer': minor
'@solana/kit-plugins': minor
---

Add `payerOrGeneratedPayer` plugin that uses an explicit payer when provided, or generates a new one funded with 100 SOL via airdrop as a fallback.
```

### Changelog guidelines

- Write 1-3 concise sentences.
- Start with a verb: "Add", "Remove", "Replace", "Fix", "Update".
- Focus on what changed from the user's perspective.
- Mention renamed or removed APIs explicitly.
- For breaking changes, add a `**BREAKING CHANGES**` section with migration instructions.

For the full changeset guide, see [`.claude/skills/changesets/SKILL.md`](./.claude/skills/changesets/SKILL.md).

## CI

The CI pipeline runs on every pull request and checks:

1. **Linting** (`pnpm lint`) — ESLint and Prettier.
2. **Tests** (`pnpm test`) — Type checking, tree-shakability, and unit tests across all environments.
3. **Clean working directory** — Build artifacts must not produce uncommitted changes.

Merging to `main` with a changeset triggers an automated release via the [changesets GitHub action](https://github.com/changesets/action).
