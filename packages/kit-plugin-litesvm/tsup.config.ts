import { defineConfig } from 'tsup';

import { getPackageBuildConfigs } from '../../tsup.config.base';

export default defineConfig(
    getPackageBuildConfigs().map(config => ({
        ...config,
        // Here we use a stubbed entry point for browser/react-native builds
        // because LiteSVM relies on Node.js APIs and cannot run in those environments.
        entry: config.name === 'node' ? ['./src/index.ts'] : ['./src/index.browser.ts'],
    })),
);
