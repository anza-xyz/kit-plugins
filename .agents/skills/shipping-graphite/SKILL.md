---
name: shipping-graphite
description: Shipping workflow using Graphite CLI. Provides guidance for committing, branching, and creating PRs with Graphite's single-commit-per-branch model.
---

# Ship Code Using Graphite

Guidance for shipping code using the [Graphite](https://graphite.dev/) CLI (`gt`). This skill teaches the agent how to create commits, branches, and PRs using Graphite's single-commit-per-branch model.

## Key Rules

- NEVER commit, push, create branches, or create PRs without explicit user approval.
- Before any git operation that creates or modifies a commit, present a review block containing: changeset content (if applicable), commit title, and commit/PR description. ALWAYS wait for approval.
- Present changeset file contents for review before writing them.
- Use `gt create -am "Title" -m "Description body"` for new PRs. The first `-m` sets the commit title; the second sets the PR description.
- Use `gt modify -a` to amend the current branch with follow-up changes (NEVER create additional commits on the same branch).
- ALWAYS escape backticks in commit messages with backslashes for shell compatibility (e.g. `"Update \`my-package\` config"`).

## Guidelines

### Creating a New PR

Use `gt create` to create a new branch with a single commit:

```sh
gt create -am "Commit title" -m "Description body explaining what changed and why."
```

- The first `-m` flag sets the commit title (first line of the commit message).
- The second `-m` flag sets the commit body, which Graphite uses as the PR description when the stack is submitted.
- Write the body as a concise flowing summary. Avoid excessive blank lines.
- If a `.github/PULL_REQUEST_TEMPLATE.md` exists, use it as a guide for structuring the PR description. Fill in sections that are relevant and omit sections that don't apply (e.g. don't add "Fixes #" if there's no related issue).

### Amending an Existing PR

When making follow-up changes to the current branch, ALWAYS amend rather than creating new commits:

```sh
gt modify -a
```

This amends the single commit on the current branch. Since Graphite uses a one-commit-per-branch model, ALWAYS use `gt modify -a` for follow-up changes on the same PR.

### Submitting PRs

After creating or modifying branches, submit the stack:

```sh
gt submit
```

This creates or updates PRs for all branches in the current stack.

### Shell Escaping

When commit titles or descriptions contain backticks (e.g. for package names or code references), escape them with a backslash so the shell passes them through literally:

```sh
gt create -am "Align \`kit-plugins\` infrastructure" -m "This PR updates the shared config."
```

### Review Block Format

Before any git operation, present this review block and wait for approval:

1. **Changeset content** (if applicable) — the full changeset file contents.
2. **Commit title** — a concise title for the commit.
3. **Commit/PR description** — a short description that explains what changed and why.
