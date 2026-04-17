import { defineConfig } from 'tsup';

import { getPackageBuildConfigs } from '../../tsup.config.base';

const EXTERNAL = ['react', 'react-dom'];

export default defineConfig(
    getPackageBuildConfigs().map(config => ({
        ...config,
        external: [...(config.external ?? []), ...EXTERNAL],
    })),
);
