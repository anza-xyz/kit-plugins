import { defineConfig } from 'tsup';

import { getPackageBuildConfigs } from '../../tsup.config.base';

export default defineConfig(getPackageBuildConfigs({ entry: ['./src/index.ts', './src/react/index.ts'] }));
