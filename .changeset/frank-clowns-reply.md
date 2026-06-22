---
'@solana/kit-plugin-litesvm': patch
---

Require `litesvm@^1.2.0`. The underlying `litesvm` dependency was bumped from `1.1.0` to `1.2.0` without an accompanying changeset, so the `0.12.0` release left `@solana/kit-plugin-litesvm` behind at `0.10.0`. This republishes the package so the updated `litesvm` range reaches consumers.
