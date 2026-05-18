const oxfmt = require('oxfmt');
const solanaFmt = require('@solana-config/oxc/oxfmt');

module.exports = oxfmt.defineConfig({
    ...solanaFmt,
    ignorePatterns: [
        '**/dist/',
        '**/lib/',
        '.agents/',
        'skills-lock.json',
        '.changeset/',
        '.github/workflows/PULL_REQUEST_TEMPLATE.md',
        'CHANGELOG.md',
    ],
});
