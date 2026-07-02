import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';

import { getVitestConfig } from '../../vitest.config.base.mjs';

const excludeReactTests = { test: { exclude: [...configDefaults.exclude, '**/*.react.test.tsx'] } };

export default defineConfig({
    test: {
        projects: [
            getVitestConfig('browser'),
            mergeConfig(getVitestConfig('node'), excludeReactTests),
            mergeConfig(getVitestConfig('react-native'), excludeReactTests),
        ],
    },
});
