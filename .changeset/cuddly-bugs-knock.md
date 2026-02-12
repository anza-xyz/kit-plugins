---
'@solana/kit-plugin-litesvm': patch
---

Routes `@solana/kit-plugin-litesvm` to a browser/react-native stub that throws on use while keeping the current LiteSVM implementation in node builds. This is to prevent LiteSVM from being included in browser and react-native bundles as it cannot run in those environments.
