import { defineConfig } from 'vitest/config';

import { getVitestConfig } from '../../vitest.config.base.mts';

export default defineConfig({
    test: {
        projects: [getVitestConfig('browser'), getVitestConfig('node'), getVitestConfig('react-native')],
    },
});
