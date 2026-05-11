import { defineConfig } from 'oxlint';

import solanaConfig from '@solana-config/oxc/oxlint';

export default defineConfig({
    extends: [solanaConfig],
    ignorePatterns: [
        // Universal patterns mirroring what `@solana/eslint-config-solana` ignored globally.
        // Oxlint already respects `.gitignore`, but these remain as a safety net for projects
        // that don't gitignore their build outputs.
        '**/dist/',
        '**/lib/',
        '**/*.json',
        // Repo-specific: tsup config files are at each package root and aren't part of the
        // type-checked source set.
        '**/tsup.config.ts',
    ],
    options: {
        typeAware: true,
    },
});
