import { defineConfig } from 'tsup';

import { getPackageBuildConfigs } from '../../tsup.config.base';

const EXTERNAL = ['react', 'react-dom'];
const ENTRIES = ['./src/index.ts', './src/wallet/index.ts'];

export default defineConfig(
    getPackageBuildConfigs().map(config => ({
        ...config,
        entry: ENTRIES,
        external: [...(config.external ?? []), ...EXTERNAL],
    })),
);
