import solanaConfig from '@solana/eslint-config-solana';
import reactConfig from '@solana/eslint-config-solana/react';
import { defineConfig } from 'eslint/config';

export default defineConfig([
    { ignores: ['**/dist/**', '**/tsup.config.ts'] },
    { files: ['**/*.{ts,tsx}', '**/*.(c|m)?js'], extends: [solanaConfig] },
    {
        files: ['packages/kit-react/**/*.{ts,tsx}'],
        extends: [reactConfig],
        rules: {
            // Tell `exhaustive-deps` to inspect our custom hook factories.
            'react-hooks/exhaustive-deps': [
                'warn',
                { additionalHooks: '(useLiveStore|useLiveQuery|useSubscription)' },
            ],
        },
    },
]);
