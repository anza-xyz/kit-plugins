---
'@solana/kit-client-rpc': patch
'@solana/kit-plugin-rpc': patch
---

The `createClient` and `createLocalClient` factory functions now accept `skipPreflight`, `maxConcurrency`, and `priorityFees` options, forwarding them to the underlying transaction plan executor and planner plugins. A shared `ClientConfig` type is also exported for use in consumer code. The `localhostRpc` plugin now accepts the full `DefaultRpcSubscriptionsChannelConfig` options instead of only `{ url: string }`.
