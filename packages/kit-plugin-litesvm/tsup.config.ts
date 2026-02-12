import { defineConfig } from 'tsup';

import { getPackageBuildConfigs } from '../../tsup.config.base';

export default defineConfig(
    getPackageBuildConfigs().map(config => ({
        ...config,
        // Here we use a stubbed entry point for browser/react-native builds
        // because LiteSVM relies on Node.js APIs and cannot run in those environments.
        entry: config.name === 'node' ? ['./src/index.ts'] : ['./src/index.browser.ts'],
        esbuildOptions(options, context) {
            // Force the entry name to be `index` so that browser/react-native
            // builds keep the same naming convention (e.g. `index.browser.mjs`).
            config.esbuildOptions?.(options, context);
            options.entryNames = 'index';
        },
    })),
);
