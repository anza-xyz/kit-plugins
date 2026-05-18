const oxlint = require('oxlint');
const solanaConfig = require('@solana-config/oxc/oxlint');

module.exports = oxlint.defineConfig({
    extends: [solanaConfig],
    ignorePatterns: ['**/dist/', '**/lib/', '**/*.json', '**/tsup.config.ts'],
    options: { typeAware: true },
});
