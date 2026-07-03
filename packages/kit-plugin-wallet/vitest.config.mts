import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';

import { getVitestConfig } from '../../vitest.config.base.mjs';

function withWalletMocks(config: ReturnType<typeof getVitestConfig>) {
    return mergeConfig(config, {
        test: {
            setupFiles: ['./test/_setup.ts'],
        },
    });
}

// React hook tests need a DOM (`renderHook` → `react-dom`), so they run only in the browser
// (happy-dom) project and are excluded from the node and react-native projects.
const excludeReactTests = { test: { exclude: [...configDefaults.exclude, '**/*.react.test.tsx'] } };

export default defineConfig({
    test: {
        projects: [
            withWalletMocks(getVitestConfig('browser')),
            mergeConfig(withWalletMocks(getVitestConfig('node')), excludeReactTests),
            mergeConfig(withWalletMocks(getVitestConfig('react-native')), excludeReactTests),
        ],
    },
});
