import { env } from 'node:process';

import browsersListToEsBuild from 'browserslist-to-esbuild';
import { Format, Options as TsupConfig } from 'tsup';

type Platform = 'browser' | 'node' | 'react-native';

type BuildOptions = {
    format: Format;
    platform: Platform;
};

const BROWSERSLIST_TARGETS = browsersListToEsBuild();

export function getBuildConfig(options: BuildOptions): TsupConfig {
    const { format, platform } = options;
    return {
        define: {
            __BROWSER__: `${platform === 'browser'}`,
            __ESM__: `${format === 'esm'}`,
            __NODEJS__: `${platform === 'node'}`,
            __REACTNATIVE__: `${platform === 'react-native'}`,
            __TEST__: 'false',
            __VERSION__: `"${env.npm_package_version}"`,
        },
        entry: [`./src/index.ts`],
        esbuildOptions(options, context) {
            if (context.format === 'iife') {
                options.target = BROWSERSLIST_TARGETS;
                options.minify = true;
            } else {
                options.define = {
                    ...options.define,
                    'process.env.NODE_ENV': 'process.env.NODE_ENV',
                };
            }
        },
        external: ['node:fs', 'node:path'],
        format,
        name: platform,
        outExtension({ format }) {
            const extension =
                format === 'iife' ? `.production.min.js` : `.${platform}.${format === 'cjs' ? 'cjs' : 'mjs'}`;
            return { js: extension };
        },
        platform: platform === 'node' ? 'node' : 'browser',
        publicDir: true,
        pure: ['process'],
        sourcemap: format !== 'iife',
        treeshake: {
            moduleSideEffects: id => {
                // This prevents tsup/Rollup from keeping bare `import 'fs'` in browser/RN builds.
                // @see https://github.com/anza-xyz/kit-plugins/pull/95
                const bare = id.startsWith('node:') ? id.slice(5) : id;
                return !['fs', 'path'].includes(bare);
            },
        },
    };
}

export function getPackageBuildConfigs(): TsupConfig[] {
    return [
        getBuildConfig({ format: 'cjs', platform: 'node' }),
        getBuildConfig({ format: 'esm', platform: 'node' }),
        getBuildConfig({ format: 'cjs', platform: 'browser' }),
        getBuildConfig({ format: 'esm', platform: 'browser' }),
        getBuildConfig({ format: 'esm', platform: 'react-native' }),
    ];
}
