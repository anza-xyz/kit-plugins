---
'@solana/kit-plugin-wallet': patch
---

Fix the published package being unusable from any ESM consumer. Because the package builds two entry points (`.` and `./react`) in a single tsup build, tsup's default ESM code-splitting hoisted their shared code into `chunk-*.mjs` files. The package's `files` allow-list only matches the entry files (`dist/index.*`, `dist/react/index.*`), so those chunks were never included in the published tarball, and every entry point's `import './chunk-*.mjs'` failed to resolve (`UNRESOLVED_IMPORT` / `ERR_MODULE_NOT_FOUND`). Code-splitting is now disabled in the shared build config so each entry point is self-contained and the published `files` set is complete.
