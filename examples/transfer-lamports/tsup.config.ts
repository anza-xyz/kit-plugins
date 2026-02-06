import { defineConfig } from 'tsup';

import { getBuildConfig } from '../../tsup.config.base';

export default defineConfig([getBuildConfig({ format: 'esm', platform: 'node' })]);
