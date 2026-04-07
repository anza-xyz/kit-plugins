import { defineConfig, mergeConfig } from 'vitest/config';
import { getVitestConfig } from '../../vitest.config.base.mjs';

function withWalletMocks(config: ReturnType<typeof getVitestConfig>) {
    return mergeConfig(config, {
        test: {
            setupFiles: ['./test/_setup.ts'],
        },
    });
}

export default defineConfig({
    test: {
        projects: [
            withWalletMocks(getVitestConfig('browser')),
            withWalletMocks(getVitestConfig('node')),
            withWalletMocks(getVitestConfig('react-native')),
        ],
    },
});
