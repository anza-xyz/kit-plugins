#!/usr/bin/env node
// Guards against publishing a package whose built entry points import files that
// were not included in the npm tarball. This happens when a build emits shared
// chunks (e.g. tsup code-splitting across multiple entries) but the package's
// `files` allow-list only matches the entry files, so the chunks silently drop
// out of the published tarball and every ESM consumer fails to resolve them.
// @see https://github.com/anza-xyz/kit-plugins — the `@solana/kit-plugin-wallet@0.13.0` incident.
//
// Usage: node scripts/assert-publishable-dist.mjs [packageDir]
// Runs against the current working directory by default.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { argv, cwd, exit } from 'node:process';

const packageDir = resolve(argv[2] ?? cwd());

/** Ask npm which files this package would actually publish. */
function getPublishedFiles() {
    const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
        cwd: packageDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });
    // `npm pack --json` paths are package-root-relative, POSIX-separated, no `package/` prefix.
    return new Set(JSON.parse(output)[0].files.map(f => f.path));
}

/** Extract every relative (`./` or `../`) module specifier referenced by a JS module. */
function getRelativeSpecifiers(code) {
    const specifiers = new Set();
    // Matches: import/export ... from '…', bare `import '…'`, dynamic import('…'), and require('…').
    const patterns = [
        /(?:\bimport\b|\bexport\b)[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
        /\bimport\s*['"]([^'"]+)['"]/g,
        /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const pattern of patterns) {
        for (const [, specifier] of code.matchAll(pattern)) {
            if (specifier.startsWith('.')) {
                specifiers.add(specifier);
            }
        }
    }
    return specifiers;
}

/** Resolve a relative specifier (from `fromFile`) to a package-root-relative POSIX path, or null. */
function resolveSpecifier(fromFile, specifier) {
    const base = resolve(packageDir, dirname(fromFile), specifier);
    // tsup emits explicit extensions, but tolerate extensionless specifiers just in case.
    const candidates = [
        base,
        `${base}.mjs`,
        `${base}.cjs`,
        `${base}.js`,
        join(base, 'index.mjs'),
        join(base, 'index.cjs'),
        join(base, 'index.js'),
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return relative(packageDir, candidate).split(/[\\/]/).join(posix.sep);
        }
    }
    return null;
}

const published = getPublishedFiles();
const jsEntryPoints = [...published].filter(p => /\.(mjs|cjs|js)$/.test(p));

const problems = [];
for (const entry of jsEntryPoints) {
    const absEntry = join(packageDir, entry);
    if (!existsSync(absEntry)) {
        continue; // published but not on disk — a separate `files`/build mismatch, not our concern here
    }
    const code = readFileSync(absEntry, 'utf8');
    for (const specifier of getRelativeSpecifiers(code)) {
        const resolved = resolveSpecifier(entry, specifier);
        if (resolved == null) {
            problems.push(`${entry} imports "${specifier}", which does not resolve to any file on disk`);
        } else if (!published.has(resolved)) {
            problems.push(`${entry} imports "${specifier}" (→ ${resolved}), which is NOT in the published tarball`);
        }
    }
}

if (problems.length > 0) {
    console.error(`✗ ${relative(cwd(), packageDir) || '.'}: published entry points reference unpublished files:\n`);
    for (const problem of problems) {
        console.error(`  - ${problem}`);
    }
    console.error(`\nEvery relative import in a published entry point must itself be published. Check the`);
    console.error(`package's "files" field and the build's code-splitting settings.`);
    exit(1);
}

console.log(
    `✓ ${relative(cwd(), packageDir) || '.'}: all ${jsEntryPoints.length} published entry points are self-contained.`,
);
