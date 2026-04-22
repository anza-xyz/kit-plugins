# RFC: `@solana/kit-react` — React Bindings for Kit

**Status:** Draft
**Package:** `@solana/kit-react`

## Contents

- [Summary](#summary)
- [Prerequisites](#prerequisites)
    - [In `@solana/subscribable`](#in-solanasubscribable)
    - [In `@solana/rpc-subscriptions-spec`](#in-solanarpc-subscriptions-spec)
    - [In `@solana/rpc-spec`](#in-solanarpc-spec)
    - [In `@solana/kit`](#in-solanakit)
    - [In `@solana/kit-plugin-rpc`](#in-solanakit-plugin-rpc)
    - [In `@solana/kit-plugin-wallet`](#in-solanakit-plugin-wallet)
    - [Errors](#errors)
- [Architecture](#architecture)
    - [Principles](#principles)
- [Core Library (`@solana/kit-react`)](#core-library-solanakit-react)
    - [Dependencies](#dependencies)
    - [Providers](#providers)
        - [Common case](#common-case)
        - [Provider reference](#provider-reference)
        - [Advanced examples](#advanced-examples)
    - [Hooks](#hooks)
        - [Client access](#client-access)
        - [Wallet](#wallet)
        - [Signer access](#signer-access)
        - [Getting a kit signer from a wallet account](#getting-a-kit-signer-from-a-wallet-account)
        - [Live data (subscription-backed)](#live-data-subscription-backed)
        - [Generic live data (`useLiveData`)](#generic-live-data-uselivedata)
        - [Subscriptions (no initial fetch)](#subscriptions-no-initial-fetch)
        - [One-shot requests (`useRequest`)](#one-shot-requests-userequest)
        - [Sending transactions](#sending-transactions)
        - [Generic async action](#generic-async-action)
        - [One-shot reads](#one-shot-reads)
- [Third-party extensions](#third-party-extensions)
    - [Example: a DAS plugin package](#example-a-das-plugin-package)
    - [`useClientCapability` — runtime-checked third-party hooks](#useclientcapability--runtime-checked-third-party-hooks)
    - [`useClient<T>()` vs. `useClientCapability<T>()`](#useclientt-vs-useclientcapabilityt)
- [SWR Adapter (`@solana/kit-react/swr`)](#swr-adapter-solanakit-reactswr)
    - [Dependencies](#dependencies-1)
    - [Naming convention](#naming-convention)
    - [Generic bridge](#generic-bridge)
    - [Subscription-only bridge](#subscription-only-bridge)
    - [Mutation hooks](#mutation-hooks)
    - [Generic action bridge](#generic-action-bridge)
    - [One-shot reads](#one-shot-reads-1)
- [TanStack Query Adapter (`@solana/kit-react/query`)](#tanstack-query-adapter-solanakit-reactquery)
    - [Dependencies](#dependencies-2)
    - [Naming convention](#naming-convention-1)
    - [Generic bridge](#generic-bridge-1)
    - [Subscription-only bridge](#subscription-only-bridge-1)
    - [Mutation hooks](#mutation-hooks-1)
    - [Generic action bridge](#generic-action-bridge-1)
    - [One-shot reads](#one-shot-reads-2)
- [What Each Layer Provides](#what-each-layer-provides)
- [Design Decisions](#design-decisions)
- [Future directions](#future-directions)
    - [Promote the `subscribeTo<Capability>` producer-side helper to kit-core](#promote-the-subscribetocapability-producer-side-helper-to-kit-core)
    - [Batched live-query hook](#batched-live-query-hook)
    - [Observe external writes to `WalletStorage`](#observe-external-writes-to-walletstorage)
- [Appendix: Comparisons](#appendix-comparisons)
    - [framework-kit](#framework-kit)
    - [connectorkit](#connectorkit)
    - [wallet-ui](#wallet-ui)
    - [wallet-adapter](#wallet-adapter)
    - [Before and after: Kit example React app](#before-and-after-kit-example-react-app)

## Summary

A React library for building Solana dApps using Kit. The library ships as a single package (`@solana/kit-react`) with a wallet-agnostic core entry and three optional subpaths: `@solana/kit-react/wallet` for the `WalletProvider` and wallet hooks, `@solana/kit-react/swr` and `@solana/kit-react/query` for cache-library adapters. Each subpath declares its runtime peer dependency as optional, so apps that don't use wallet (or SWR, or TanStack Query) don't pull those packages in.

Core covers live on-chain data, one-shot RPC reads, transaction sending, and signer access. The wallet subpath adds wallet discovery, connection lifecycle, and wallet-specific hooks. The cache-library adapters provide bridges for apps that want to integrate kit-react's reactive state with SWR or TanStack Query (cache dedupe, persistence, devtools).

The Kit client is an implementation detail — consumers interact with providers and hooks, not plugins and clients directly. Power users can access the client for imperative use.

This spec assumes a set of Kit and plugin changes have landed, described in [Prerequisites](#prerequisites). Those changes carry the framework-agnostic state machines, abort semantics, and reactive primitives that the React bindings consume. The React layer reduces to `useSyncExternalStore` glue over Kit primitives plus render-ergonomic conveniences — no state machine, fetch policy, or async lifecycle logic lives in kit-react that doesn't belong one layer down.

## Prerequisites

These changes must land in Kit and kit-plugins before this spec can be implemented cleanly. They're not React-specific — every reactive UI framework (Vue, Svelte, Solid) benefits from the same primitives — so they belong in Kit rather than in per-framework bindings.

### In `@solana/subscribable`

Two reactive store types covering the two categories of async operations. Both expose `subscribe(listener): () => void` plus a snapshot accessor returning the full `{ status, data, error }` state. The accessor name is asymmetric for now: `ReactiveStreamStore` exposes `getUnifiedState()` (its legacy `getState()` returns only the value and is deprecated), while `ReactiveActionStore` exposes `getState()` directly. Both will converge on `getState()` returning the unified snapshot in a later breaking change; the asymmetry is accepted in the meantime to avoid a breaking Kit release.

**`ReactiveStreamStore<T>`** — for long-lived connections that emit multiple values (RPC subscriptions, and the RPC-fetch + subscription hybrid used by named hooks). Lifecycle `loading | loaded | error | retrying`. `retry()` re-establishes a broken connection, preserving the last known value as stale data during `retrying`. Replaces the prior `ReactiveStore<T>` type — the single generic store splits into the two specialized types below, no backwards-compat alias needed since `ReactiveStore` was not yet widely consumed.

Note CM: Already have this as `ReactiveStore`. [Open PR](https://github.com/anza-xyz/kit/pull/1552) adds retry + status + getUnifiedState. Will rename to `ReactiveStreamStore`

**`ReactiveActionStore<TArgs, T>`** — for invocation-based async operations (user-triggered actions, and also one-shot RPC reads when auto-dispatched by the consumer). Lifecycle `idle | running | success | error`. `dispatch(...args)` invokes the operation; a second dispatch while a first is in flight aborts the first via its `abortSignal` — "click twice, only the second submits." Stale-while-revalidate: during `running` after a previous `success`, `data` retains the old value so consumers can render stale data with an overlay.

Note CM: [Open PR](https://github.com/anza-xyz/kit/pull/1550), will rename from `ActionStore`

**`createReactiveActionStore<TArgs, T>(operation: (signal: AbortSignal, ...args: TArgs) => Promise<T>): ReactiveActionStore<TArgs, T>`** — factory for action stores. Kit primitive; every framework's action-hook implementation ≈ `useSyncExternalStore(store.subscribe, store.getState)` plus a bridge wrapping `dispatch` / `reset`.

Note CM: [Open PR](https://github.com/anza-xyz/kit/pull/1550)

### In `@solana/rpc-subscriptions-spec`

**`PendingRpcSubscriptionsRequest<T>.reactiveStore({ abortSignal }): ReactiveStreamStore<T>`** — synchronous method returning a ready-to-consume reactive store for a subscription. Internally delegates to `createReactiveStoreFromDataPublisherFactory` so `retry()` can re-open the WebSocket without losing subscribers. The `loading` state covers the transport-setup window; setup failures surface as `status: 'error'`.

The previous async `.reactive(): Promise<ReactiveStore<T>>` is either renamed to `.reactiveStore()` as a breaking change, or `.reactiveStore()` is added as the sync replacement with `.reactive()` deprecated. Either is fine; the spec uses the sync name.

Note CM: [Open PR](https://github.com/anza-xyz/kit/pull/1553)

### In `@solana/rpc-spec`

**`PendingRpcRequest<T>.reactiveStore(): ReactiveActionStore<[], T>`** — synchronous method returning an action store that auto-dispatches on creation, then fires a fresh RPC call per subsequent dispatch. Construction semantics parallel `PendingRpcSubscriptionsRequest.reactiveStore()` — calling `.reactiveStore()` means "I want this live now"; callers who want a build-now-dispatch-later store drop to `createReactiveActionStore(signal => this.send({ abortSignal: signal }))` directly. `ReactiveActionStore` itself stays neutral on initiation — only `.reactiveStore()` commits to eager dispatch.

Precondition: `PendingRpcRequest` must be multi-dispatch — each dispatch re-invokes the transport. (Confirmed already the case.)

SSR rule: bindings must not call `.reactiveStore()` on the server, same as for `PendingRpcSubscriptionsRequest`. Auto-dispatch means creating the store is a side-effecting operation; server-side prefetch, if wanted, uses the imperative `.send()` path directly.

No store-level `abortSignal` argument (unlike `PendingRpcSubscriptionsRequest.reactiveStore({ abortSignal })`) — the per-dispatch signal from `createReactiveActionStore`'s operation handles supersede, and an in-flight HTTP request completes on its own without leaking resources. A WebSocket does leak if left open, which is why subscriptions need a lifetime anchor; RPC reads don't.

Note CM: TODO

### In `@solana/kit`

**`createReactiveStoreWithInitialValueAndSlotTracking<T>(...): ReactiveStreamStore<SolanaRpcResponse<T>>`** — returns the new specialized stream store type with `retry()` support. `retry()` re-runs both the initial RPC fetch and the subscription. No change to API surface needed

Note CM: Part of [Open PR](https://github.com/anza-xyz/kit/pull/1552)

### In `@solana/kit-plugin-rpc`

**`solanaRpcConnection` plugin.** A single plugin that installs both `client.rpc` and `client.rpcSubscriptions`, configured from `{ rpcUrl, rpcSubscriptionsUrl }`. Replaces the previous pairing of `solanaRpcConnection` + `solanaRpcSubscriptionsConnection` for the common case, and supersedes `solanaRpcReadOnly` (which also installed `getMinimumBalance`; that helper is trivially reconstructable via `PluginProvider` when needed). kit-react's `RpcConnectionProvider` wraps this plugin directly.

Note CM: [Open PR](https://github.com/anza-xyz/kit-plugins/pull/201), known breaking change

### In `@solana/kit-plugin-wallet`

**Signal-aware operations.** `client.wallet.connect`, `.disconnect`, `.signMessage`, and `.signIn` accept an `abortSignal` and internally wrap the wallet-standard calls with `getAbortablePromise(promise, signal)`. Reason: kit-react's action-store hooks use double-click-supersede by aborting the in-flight signal; without signal plumbing on the wallet plugin's operations, `useConnectWallet` / `useSignMessage` etc. would silently complete the original call in the background after the store's state had already moved on.

Caveat: the wallet-standard spec doesn't accept abort signals today, so `getAbortablePromise` cancels the *await* but not the underlying wallet call. Practical consequence: a double-click on Connect may briefly show two wallet popups. Most wallets de-dupe these; documenting the limitation is enough for now. When wallet-standard adds signal support, this becomes end-to-end cancellation automatically.

Note CM: TODO on wallet-plugin, on [open PR](https://github.com/anza-xyz/kit-plugins/pull/191)

Note CM: TODO wallet-standard proposal to add signals, backward compatible/optional. Orthogonal to this work, not blocking

**`subscribeToPayer` / `subscribeToIdentity` publish points.** The `walletSigner` / `walletPayer` / `walletIdentity` plugins install a sibling `subscribeTo<Capability>(listener): () => void` function alongside each reactive capability they set on the client. kit-react's `usePayer` / `useIdentity` subscribe to these. The wallet plugin is currently the only reactive signer source; if a second reactive plugin appears (e.g. a relayer that rotates `payer`), the convention extends cleanly.

Note CM: ClientWithSubscribeToPayer/Identity interfaces merged in Kit (not released yet)

Note CM: TODO add to wallet-plugin, on [open PR](https://github.com/anza-xyz/kit-plugins/pull/191)

### Errors

Kit throws `SolanaError` with narrowable codes; the wallet plugin throws `WalletStandardError` with the same pattern. kit-react propagates errors through `LiveQueryResult.error` / `ActionState.error` as `unknown`; consumers narrow via `isSolanaError(e, SOLANA_ERROR__...)` and `isWalletStandardError(e, ...)` in their render branches. No new Kit work for this — just a documentation pattern in kit-react's error-handling examples.

---

With these in place, kit-react is ~300 lines of bridge code. The rest of this spec describes that bridge — what the providers look like, what each hook returns, how the pieces compose.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  @solana/kit-react/swr          (optional subpath)   │
│  @solana/kit-react/query        (optional subpath)   │
│  Generic bridges + cache integration                 │
├──────────────────────────────────────────────────────┤
│  @solana/kit-react/wallet       (optional subpath)   │
│  WalletProvider, wallet hooks                        │
├──────────────────────────────────────────────────────┤
│  @solana/kit-react              (core entry)         │
│  KitClientProvider, RPC / payer / identity providers │
│  Live-data, RPC-read, action, and signer hooks       │
│  useSyncExternalStore bridge to Kit stores           │
├──────────────────────────────────────────────────────┤
│  Kit + plugins                  (framework-agnostic) │
│  ReactiveStreamStore / ReactiveActionStore           │
│  createReactiveActionStore, .reactiveStore() on pendings,    │
│  walletSigner / walletPayer / walletIdentity / …     │
└──────────────────────────────────────────────────────┘
```

Subpaths keep the core wallet-agnostic: apps that don't use a user wallet (read-only dashboards, keypair-driven bots, server flows) can depend on `@solana/kit-react` alone without installing `@solana/kit-plugin-wallet` — the subpath's peer dependency is declared optional, tree-shaking keeps the wallet code out of the core bundle, and the TypeScript surface only surfaces wallet names to code that imports from `/wallet`. Signer hooks (`usePayer`, `useIdentity`) live in core and stay reactive against wallet-installed signers via the [`subscribeTo<Capability>` convention](#subscribetocapability-convention) — no type-level dependency on the wallet subpath.

A single-package layout (rather than a sibling `@solana/kit-react-wallet` package) is intentional. React bindings share a `ClientContext`, a React peer dep, and a shared type surface (`LiveQueryResult`, `ActionState`, `ChainIdentifier`) — splitting them across packages multiplies the "two copies of the same lib in the dep tree" failure mode without corresponding benefit. Kit's runtime plugins split cleanly because they don't share mutable singletons; React bindings don't, so they follow the ecosystem norm (wagmi, TanStack, Redux, Apollo) and consolidate with subpath exports.

### Principles

**Library, not a plugin.** A single `react()` Kit plugin is tempting — it would keep the familiar `.use()` API — but React needs to own the client lifecycle (prop-driven recreation for network switching, per-subtree clients, unmount cleanup that aborts subscriptions, per-request clients in SSR). All of that forces the client to be created and managed inside React, which means providers. The composable provider approach expresses the same plugin chain as nesting order — each provider calls `.use()` internally — so the composition model is identical, just adapted to React's lifecycle.

**The client is internal.** Consumers use providers and hooks. The plugin chain is built inside the provider — consumers configure it via props, not `.use()` calls.

**`useSyncExternalStore` for all reactive state.** Wallet state, live queries, RPC reads, actions — every reactive hook in the library is a bridge from a Kit-side store (`ReactiveStreamStore`, `ReactiveActionStore`, or the wallet plugin's subscribe/getState contract) into `useSyncExternalStore`. No polling, no `useEffect` + `setState`, no hand-rolled state machines in the hook layer.

**Kit owns the state machines.** Lifecycle enums (`loading | loaded | error | retrying` for streams, `idle | running | success | error` for actions), abort semantics (double-click supersede on actions, retry-as-reconnection on streams), and stale-while-revalidate behavior all live in Kit primitives. kit-react exposes them through `useSyncExternalStore`; it does not reimplement them. This keeps the React layer thin and the behavior consistent with any future Vue / Svelte / Solid binding.

**Named hooks only where there's domain logic.** `useBalance` exists because it hides RPC + subscription pairing, slot dedup, and response mapping. `useGetEpochInfo` does not exist because it would be a one-liner wrapping `client.rpc.getEpochInfo()`. For one-off reads without domain logic, callers use `useRequest` (the generic bridge for any `.reactiveStore()`-backed pending, including RPC calls) or reach into `client.rpc.*` directly through the escape-hatch `useClient()`.

**Adapters integrate, they don't replace.** The SWR and TanStack Query adapters bridge kit-react's reactive state into those libraries' cache layers (dedupe across components, persistence, devtools, Suspense modes) and expose mutation hooks that play with cache invalidation. One-shot reads no longer *require* a cache library — `useRequest` covers them natively — but apps that want shared cache semantics across many components can opt in.

## Core Library (`@solana/kit-react`)

### Dependencies

```json
{
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "@solana/kit": "^6.x",
    "@solana/kit-plugin-instruction-plan": "^1.x",
    "@solana/kit-plugin-signer": "^1.x",
    "@solana/kit-plugin-wallet": "^1.x"
  },
  "peerDependenciesMeta": {
    "@solana/kit-plugin-instruction-plan": { "optional": true },
    "@solana/kit-plugin-signer": { "optional": true },
    "@solana/kit-plugin-wallet": { "optional": true }
  }
}
```

`@solana/kit-plugin-wallet` is an **optional** peer dependency — required only if you import from `@solana/kit-react/wallet`. Apps that don't use wallet (read-only dashboards, bots, server flows) install the other peers and skip it. `@solana/kit-plugin-signer` is also optional — required only if you mount `PayerProvider`, `IdentityProvider`, or `SignerProvider` (i.e. you install a static signer that isn't wallet-backed). `@solana/kit-plugin-instruction-plan` is optional too — required only if you mount `RpcProvider` or `LiteSvmProvider` (i.e. you send transactions). Apps that only read chain state via `RpcConnectionProvider` can skip it. The plugin provides the `client.sendTransaction()` / `client.planTransaction()` methods used by `useSendTransaction` and `useAction` flows — the actual implementation comes from whichever RPC plugin is installed (`kit-plugin-rpc`, `kit-plugin-litesvm`, etc.).

The SWR and TanStack Query adapters follow the same pattern: `swr` and `@tanstack/react-query` are declared as optional peer dependencies, pulled in only when their respective subpath is imported.

> **Note:** `@solana/kit-plugin-wallet` is currently under development and not yet released. It provides the `walletWithoutSigner`, `walletPayer`, `walletIdentity`, and `walletSigner` plugins that `WalletProvider` installs.

### Providers

`KitClientProvider` is the root — every `@solana/kit-react` hook needs one as an ancestor. Most apps mount a single instance at the top of the tree, but multi-chain apps can mount several (e.g. a mainnet trading section and a devnet testing section as siblings, each with its own chain and client — see [Single chain per `KitClientProvider`](#design-choices)). It creates the base Kit client and publishes the configured chain. Every other provider (`WalletProvider`, `PayerProvider`, `RpcProvider`, …) reads the client from context, extends it with `.use()`, and provides the new client to its subtree. The nesting order of those providers is the plugin chain order — each maps to a Kit plugin.

#### Common case

```tsx
import { KitClientProvider, RpcProvider } from '@solana/kit-react';
import { WalletProvider } from '@solana/kit-react/wallet';

function App() {
    return (
        <KitClientProvider chain="solana:mainnet">
            <WalletProvider>
                <RpcProvider rpcUrl="https://api.mainnet-beta.solana.com" rpcSubscriptionsUrl="wss://api.mainnet-beta.solana.com">
                    <MyApp />
                </RpcProvider>
            </WalletProvider>
        </KitClientProvider>
    );
}
```

Internally builds:

```typescript
createClient()
    .use(walletSigner({ chain, autoConnect, storage, storageKey, filter }))
    .use(solanaRpc({ rpcUrl, rpcSubscriptionsUrl: wsUrl }));
```

#### Provider reference

**`KitClientProvider`** — root provider. Seeds the client context with a Kit client and publishes the configured chain for `useChain()`. By default creates a fresh client via `createClient()` and disposes it on unmount; power users can pass their own via the optional `client` prop (for SSR, custom client factories, or shared clients across multiple trees — lifecycle then belongs to the caller). Does not map to a plugin — it's the base that every other provider composes on top of. Every `@solana/kit-react` hook must have a `KitClientProvider` ancestor; the nearest one wins, so sibling trees can target different chains independently:

```tsx
<KitClientProvider chain="solana:devnet">
    <PayerProvider signer={testPayer}>
        <LiteSvmProvider>
            <App /> {/* useChain() returns "solana:devnet" */}
        </LiteSvmProvider>
    </PayerProvider>
</KitClientProvider>
```

The `chain` prop accepts any `SolanaChain` (with autocomplete) and — as an escape hatch — any wallet-standard `IdentifierString` (`${string}:${string}`) for custom or L2 chains. The Solana literals remain in the autocomplete list thanks to the `T | (IdentifierString & {})` union pattern.

The optional `client` prop lets you build the plugin chain outside React:

```tsx
const client = createClient()
    .use(solanaRpc({ rpcUrl: 'https://...' }))
    .use(telemetryPlugin());

<KitClientProvider chain="solana:mainnet" client={client}>
    <App />
</KitClientProvider>
```

Ownership switches with the prop: when omitted, `KitClientProvider` calls `client[Symbol.dispose]()` on unmount; when provided, the caller owns disposal. Pre-built clients with baked-in plugins should not also mount the matching React provider (e.g. a client built with `walletSigner()` shouldn't have `<WalletProvider>` below it) — in development, the double-installing provider emits a `console.warn`.

**`WalletProvider`** *(from `@solana/kit-react/wallet`)* — wraps one of the wallet plugins. Reads the chain from the enclosing `KitClientProvider` via context. Accepts an optional `role` prop that defaults to `"signer"` — the common case where the wallet both pays for and signs transactions. Other roles are available for advanced setups: `"payer"` (wallet pays fees only), `"identity"` (wallet signs but a relayer pays), or `"none"` (wallet UI only, manual signer access via `useConnectedWallet()`). These map to the `walletSigner`, `walletPayer`, `walletIdentity`, and `walletWithoutSigner` plugins respectively. Also accepts `autoConnect`, `storage`, `storageKey`, and `filter` props, forwarded to the underlying wallet plugin.

**`PayerProvider`**, **`IdentityProvider`**, and **`SignerProvider`** — wrap the `payer()`, `identity()`, and `signer()` plugins from `@solana/kit-plugin-signer`. `PayerProvider` sets `client.payer`; `IdentityProvider` sets `client.identity`; `SignerProvider` sets both from a single signer (the common case where one keypair both pays fees and acts as identity). Use these when the signer is not the connected wallet — e.g. a backend relayer, a test keypair, or a CLI script.

**`RpcProvider`** — wraps `solanaRpc` (the full RPC chain: RPC, subscriptions, transaction planning, execution). Its props extend `SolanaRpcConfig` from `@solana/kit-plugin-rpc` directly (`rpcUrl`, `rpcSubscriptionsUrl`, `maxConcurrency`, `rpcConfig`, `rpcSubscriptionsConfig`, `skipPreflight`, `transactionConfig`) so the provider surface stays zero-drift with the plugin. Asserts that `"payer" in client` at render time — if no ancestor provider has set a payer, it throws a message that also points at the connection-only escape path below.

*Apps that don't send transactions* (explorers, dashboards, watchers, server-side scripts) should use `RpcConnectionProvider` instead of `RpcProvider`. It wraps `solanaRpcConnection` — `client.rpc` and `client.rpcSubscriptions` — without the transaction-planning / sending halves, so no `WalletProvider` / `PayerProvider` is required:

```tsx
import { KitClientProvider, RpcConnectionProvider } from '@solana/kit-react';

<KitClientProvider chain="solana:mainnet">
    <RpcConnectionProvider rpcUrl="https://api.mainnet-beta.solana.com">
        <Dashboard />
    </RpcConnectionProvider>
</KitClientProvider>;
```

`useBalance`, `useAccount`, `useTransactionConfirmation`, `useLiveData`, `useSubscription`, and `useRequest` all work against this lighter stack; only the transaction-sending and transaction-planning hooks need the full `RpcProvider`. The name reflects what the provider installs (`solanaRpcConnection`) rather than claiming "read-only" — `client.rpc.sendTransaction` and `client.rpc.requestAirdrop` remain reachable for callers who wire them up manually; the provider simply omits the higher-level transaction APIs. For more granular stacks (e.g. RPC only, no subscriptions) drop to `PluginProvider` with a hand-picked plugin list.

**`LiteSvmProvider`** — wraps `litesvm`. Drop-in replacement for `RpcProvider` in test/dev environments. Provides the same client capabilities (RPC, transaction planning, execution) backed by a local LiteSVM instance instead of a remote RPC node. There is no lighter connection-only counterpart today (no `LiteSvmConnectionProvider`) — LiteSVM is primarily a transaction-execution harness, so the connection-only slice hasn't been needed. If a use case appears, the plugin can be split along the same lines as `solanaRpc` / `solanaRpcConnection`.

**`PluginProvider`** — generic provider for installing an ordered list of Kit plugins without needing a plugin-specific React wrapper. Accepts a single `plugins` prop; for the one-plugin case, pass a one-element array:

```tsx
// Single plugin
<PluginProvider plugins={[dasPlugin({ endpoint: '...' })]}>

// Multiple plugins (ordered)
<PluginProvider plugins={[
    dasPlugin({ endpoint: '...' }),
    tokenPlugin(),
    memoPlugin(),
]}>
```

Internally applies each plugin via `client.use()`. This means any Kit plugin is usable in the React tree without the plugin author shipping a React provider — they only need to ship convenience hooks if they want to.

#### Advanced examples

```tsx
import { KitClientProvider, PayerProvider, RpcProvider } from '@solana/kit-react';
import { WalletProvider } from '@solana/kit-react/wallet';

// Wallet is identity, relayer pays
<KitClientProvider chain="solana:mainnet">
    <WalletProvider role="identity">
        <PayerProvider signer={relayerSigner}>
            <RpcProvider rpcUrl="https://..." rpcSubscriptionsUrl="wss://...">
                <App />
            </RpcProvider>
        </PayerProvider>
    </WalletProvider>
</KitClientProvider>

// Wallet is UI only, payer and identity are explicit
<KitClientProvider chain="solana:mainnet">
    <WalletProvider role="none">
        <IdentityProvider signer={identitySigner}>
            <PayerProvider signer={relayerSigner}>
                <RpcProvider rpcUrl="https://..." rpcSubscriptionsUrl="wss://...">
                    <App />
                </RpcProvider>
            </PayerProvider>
        </IdentityProvider>
    </WalletProvider>
</KitClientProvider>

// Testing with LiteSVM — no wallet, explicit chain
<KitClientProvider chain="solana:devnet">
    <PayerProvider signer={testPayer}>
        <LiteSvmProvider>
            <App />
        </LiteSvmProvider>
    </PayerProvider>
</KitClientProvider>

// Custom chain identifier (escape hatch for L2s or non-Solana chains)
<KitClientProvider chain="l2:mainnet">
    <PluginProvider plugins={[customChainPlugin()]}>
        <App />
    </PluginProvider>
</KitClientProvider>
```

### Hooks

Hooks in this library fall into six return-shape categories. Knowing which category a hook belongs to tells you how to consume it without having to read its signature:

| Category        | Return shape                                                                    | Backed by                          | Examples                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live data       | `{ data, error, status, isLoading, retry, slot }` (reactive, read-only)         | `ReactiveStreamStore`              | `useBalance`, `useAccount`, `useTransactionConfirmation`, `useLiveData`, `useSubscription`                                                                                                         |
| One-shot read   | `{ data, error, status, isLoading, refresh }` (reactive, read-only)             | `ReactiveActionStore` (auto-dispatched) | `useRequest`                                                                                                                                                                                       |
| Tracked action  | `{ send, status, isIdle, isRunning, isSuccess, isError, data, error, reset }` (async) | `ReactiveActionStore`              | `useSendTransaction`, `useSendTransactions`, `usePlanTransaction`, `usePlanTransactions`, `useAction`; `useConnectWallet`, `useDisconnectWallet`, `useSignMessage`, `useSignIn` *(from `@solana/kit-react/wallet`)* |
| Bare callback   | `(args) => result` (stable fn)                                                  | Plugin method                      | `useSelectAccount` *(from `@solana/kit-react/wallet`; synchronous — local account switch, no async lifecycle)*                                                                                     |
| Context value   | Raw value (stable per provider)                                                 | React context                      | `useClient`, `useChain`                                                                                                                                                                            |
| Reactive value  | Raw value (reactive, read-only)                                                 | `subscribe` / `getState` on plugin | `usePayer`, `useIdentity`; `useWallets`, `useWalletStatus`, `useConnectedWallet`, `useWalletSigner`, `useWalletState` *(from `@solana/kit-react/wallet`)*                                          |

Live-data and one-shot-read hooks share the `loading / loaded / error / retrying / disabled` read vocabulary; `useRequest` maps the underlying action-store states (`idle / running / success / error`) onto it — see [One-shot requests](#one-shot-requests-userequest) for the mapping. The distinction at the render layer is the extra `slot` field on live-data and `refresh` vs. `retry` affordance. Every user-triggered async action — wallet connect, sign, send — returns the same `ActionState` shape. Context values (`useClient`, `useChain`) are stable for the lifetime of the nearest provider. Reactive values are live snapshots of plugin-owned state (wallet identity, payer, identity) that update when the underlying store emits. Bare callback is a single-member category by design: `useSelectAccount` is the only wallet operation with no async lifecycle to track (it's a local state switch between already-authorized accounts), so an `ActionState` wrapper would be inventing a state machine that never ticks.

#### Client access

```typescript
/**
 * The React context that holds the Kit client.
 * Exported for third-party providers that need to extend the client
 * (see Third-party extensions). Most consumers use hooks instead.
 */
const ClientContext: React.Context<Client>;

/**
 * Access the raw Kit client from context.
 *
 * Defaults to the base `Client` shape. Callers who know a specific plugin
 * is installed can widen the type via the generic — same escape-hatch
 * pattern as `useChain<T>()`. Pure cast, no runtime capability check;
 * use {@link useClientCapability} when you also want the missing-plugin
 * error to surface at mount.
 *
 * Power-user escape hatch for imperative use; most consumers reach for a
 * named hook (`useBalance`, `useRequest`, …) instead.
 */
function useClient<TClient extends object = object>(): Client<TClient>;

/**
 * The wallet-standard chain identifier accepted by `KitClientProvider`.
 *
 * Unions `SolanaChain` (autocompletes "solana:mainnet" / "solana:devnet" /
 * "solana:testnet") with wallet-standard's `IdentifierString` as an escape
 * hatch for custom or non-Solana chains. The `& {}` preserves literal
 * autocomplete — TypeScript won't collapse the literals into the wider
 * template type.
 */
type ChainIdentifier = SolanaChain | (IdentifierString & {});

/**
 * Returns the current chain identifier from context.
 *
 * Defaults to the narrow `SolanaChain` literal union — callers get
 * autocomplete and no cast for the 99% case. Power users who opted into
 * a custom chain at the root widen the return type via the generic (same
 * escape-hatch pattern as `useClient<T>()`).
 */
function useChain<T extends IdentifierString = SolanaChain>(): T;
```

#### Wallet

*All wallet hooks are exported from the `@solana/kit-react/wallet` subpath, not the core `@solana/kit-react` entry.*

##### State hooks

Wallet state is split into focused hooks so components subscribe only to the slice they need. A wallet discovery event won't re-render components that only care about the connected account, and vice versa.

```typescript
/**
 * All discovered wallets for the configured chain.
 * Use this to build wallet-picker UIs.
 */
function useWallets(): readonly UiWallet[];

/**
 * The current connection status.
 * Use for conditional rendering (e.g. show connect button vs account info).
 */
function useWalletStatus(): WalletStatus;

/**
 * The active wallet connection, or `null` when disconnected.
 *
 * Returns only the account + wallet identity. The associated signer lives
 * behind {@link useWalletSigner} because a connected wallet may still be
 * read-only (no signer) and splitting keeps that contract visible in the
 * types — a single `{account, signer, wallet}` shape invites callers to
 * write `connected.signer.signTransactions(...)` without a null check,
 * which crashes silently on read-only / watch-only wallets.
 *
 * The projection is memoized so that signer-only changes upstream (e.g. the
 * wallet recreating its signer after a `change` event) do not re-render
 * consumers of this hook.
 */
function useConnectedWallet(): {
    readonly account: UiWalletAccount;
    readonly wallet: UiWallet;
} | null;

/**
 * The connected wallet's signer, or `null` when disconnected or when the
 * active account is read-only (watch-only wallet, or a wallet that
 * doesn't support the configured chain).
 *
 * Separate from {@link useConnectedWallet} so the null case is visible in
 * the type: `connected !== null` does not imply `signer !== null`.
 */
function useWalletSigner(): WalletSigner | null;

/**
 * Full wallet state. Convenience hook when you need everything —
 * prefer the focused hooks above for performance-sensitive components.
 */
function useWalletState(): WalletState;
```

##### Action hooks

The four async wallet actions (`useConnectWallet`, `useDisconnectWallet`, `useSignMessage`, `useSignIn`) return the same `ActionState` shape as `useSendTransaction` — `send` plus reactive `status` / booleans / `data` / `error` / `reset`. Fire-and-forget is the common case (render from `isRunning` / `error`); callers that `await send(...)` to read the resolved value filter supersedes with `isAbortError`. `useSelectAccount` stays a bare callback because it's synchronous — local state switch, no async lifecycle.

```typescript
/**
 * Connect to a wallet. Tracked action — returns the same `ActionState`
 * shape as `useSendTransaction`. `send(wallet)` resolves to the accounts
 * the wallet authorized. Calling `send` again while a prior connect is in
 * flight aborts the first — good default for double-click on "Connect".
 */
function useConnectWallet(): ActionState<[wallet: UiWallet], readonly UiWalletAccount[]>;

/**
 * Disconnect the active wallet. Tracked action. No-ops if nothing is
 * connected.
 */
function useDisconnectWallet(): ActionState<[], void>;

/**
 * Select a different account within the connected wallet. Stable function
 * reference. Synchronous by design — selecting between already-authorized
 * accounts is a local state switch, not a round-trip to the wallet — so
 * there's no `ActionState` wrapping (nothing async to track).
 */
function useSelectAccount(): (account: UiWalletAccount) => void;

/**
 * Sign a message with the connected wallet. Tracked action.
 */
function useSignMessage(): ActionState<[message: Uint8Array], SignatureBytes>;

/**
 * Sign In With Solana. Tracked action.
 *
 * Takes the target wallet explicitly — pass `useConnectedWallet()?.wallet` to
 * sign in with the currently-connected wallet, or any `UiWallet` from
 * `useWallets()` for a fresh SIWS-as-connect flow. Matches the underlying
 * plugin's `client.wallet.signIn(wallet, input)` shape.
 */
function useSignIn(): ActionState<[wallet: UiWallet, input?: SolanaSignInInput], SolanaSignInOutput>;
```

#### Signer access

Two hooks for reading the signers installed on the client by the payer / identity / wallet plugins. Both return `null` when unavailable (e.g. wallet-backed signer with no wallet connected) and throw a capability error if the relevant plugin isn't installed at all. When the installed plugin is reactive (e.g. a wallet plugin that reassigns `client.payer` as the wallet connects and disconnects), the hooks re-render on change without having to name the specific plugin — see [`subscribeTo<Capability>` convention](#subscribetocapability-convention) below.

```typescript
/**
 * Returns the current fee payer (`client.payer`), or `null` if unavailable.
 * Wallet-backed via `<WalletProvider role="signer" | "payer">` — reactive.
 * Static via `<PayerProvider signer={…}>` or `<SignerProvider signer={…}>` — always returns the signer.
 */
function usePayer(): TransactionSigner | null;

/**
 * Returns the current identity (`client.identity`), or `null` if unavailable.
 * Same reactivity semantics as `usePayer`.
 */
function useIdentity(): TransactionSigner | null;
```

For flows that specifically need the connected wallet's signer (rather than the logical payer/identity), use {@link useWalletSigner} — returns the wallet signer directly, or `null` when disconnected or when the active account is read-only.

##### `subscribeTo<Capability>` convention

`usePayer` and `useIdentity` are capability-agnostic: they don't know (or care) which plugin installed `client.payer` or `client.identity`. To stay reactive without naming a specific plugin, they duck-type on a convention: a plugin whose capability can change over time installs a sibling `subscribeTo<Capability>(listener): () => void` function alongside the capability itself. The hook subscribes to it via `useSyncExternalStore` and re-reads the capability on every notification.

```typescript
// Expected shape, duck-typed by usePayer / useIdentity:
type ClientWithSubscribeToPayer = {
    readonly subscribeToPayer: (listener: () => void) => () => void;
};
type ClientWithSubscribeToIdentity = {
    readonly subscribeToIdentity: (listener: () => void) => () => void;
};
```

Plugins that participate today:

- **`walletSigner`** installs both `subscribeToPayer` and `subscribeToIdentity`, forwarded from the wallet store's `subscribe`.
- **`walletPayer`** installs `subscribeToPayer` only.
- **`walletIdentity`** installs `subscribeToIdentity` only.
- **`walletWithoutSigner`** installs neither — it doesn't set `payer` or `identity`.
- **`payer`** / **`identity`** / **`signer`** *(from `@solana/kit-plugin-signer`, installed by `PayerProvider` / `IdentityProvider` / `SignerProvider`)* install neither — the signer is fixed for the lifetime of the provider, so there is no change to observe.

Static plugins without the subscribe hook still work fine: the hook falls back to a no-op subscribe and just reads the capability once per render. Consumers can ignore this detail entirely — it's only relevant for plugin authors whose capability is reactive and who want `usePayer` / `useIdentity` to stay in sync.

The shape is a Kit-level convention — `ClientWithSubscribeToPayer` and `ClientWithSubscribeToIdentity` are exported from `@solana/kit`, so any reactive framework binding (Vue, Svelte, Solid) or direct client consumer can observe it without depending on kit-react. kit-react just provides the `useSyncExternalStore` bridge. See [Future directions](#future-directions) for the option of promoting the *producer-side* machinery (listener registry, notify helper) into a shared kit-core helper once a second reactive plugin appears.

##### Reading capabilities whose getters may throw

Wallet-backed payer / identity plugins expose `client.payer` and `client.identity` as getters that **throw** when the wallet is disconnected (there is no signer to return; `undefined` would be a type lie). `useSyncExternalStore` propagates an exception from `getSnapshot` by unmounting the subtree, so the hook can't read the getter directly.

Both `usePayer` and `useIdentity` read through a small `readOptional` helper that coerces thrown getters to `null`:

```typescript
function readOptional<T>(read: () => T): NonNullable<T> | null {
    try {
        return read() ?? null;
    } catch {
        return null;
    }
}

function usePayer(): TransactionSigner | null {
    const client = useClient<Partial<ClientWithPayer> & SubscribeToCapability<'payer'>>();
    const getSnapshot = () => readOptional(() => client.payer);
    const payer = useSyncExternalStore(client.subscribeToPayer ?? NOOP_SUBSCRIBE, getSnapshot, getSnapshot);
    if (!('payer' in client)) throwMissingCapability('usePayer', '`client.payer`', '…');
    return payer;
}
```

This is load-bearing for wallet-backed flows: without the swallow, mounting `<WalletProvider>` before a wallet connects would crash the subtree on first render. The swallow is specifically for the "present but unavailable" state — the outer `'payer' in client` check still throws loudly when no payer plugin is installed at all, so missing-provider bugs are not hidden.

This is also why `usePayer` / `useIdentity` can't route through `useClientCapability` like the other capability hooks — that helper returns a narrowed client whose `payer` / `identity` would be read via the throwing getter; the `readOptional` wrapper needs to sit between the read and the caller, so we do the `'payer' in client` assertion manually.

#### Getting a kit signer from a wallet account

For cases where you need a signer for an account other than the connected one (e.g. a different account within the same wallet, or multi-wallet flows), use `createSignerFromWalletAccount` from `@solana/wallet-account-signer` with any `UiWalletAccount`:

```typescript
const wallets = useWallets();
const chain = useChain();
const account = wallets[0]?.accounts[0];
const signer = useMemo(
    () => (account ? createSignerFromWalletAccount(account, chain) : null),
    [account, chain],
);
```

`createSignerFromWalletAccount` returns a signer that implements `TransactionModifyingSigner`, `TransactionSendingSigner` (if the wallet supports `solana:signAndSendTransaction`), and `MessageSigner` (if the wallet supports `solana:signMessage`). No kit-react hook is needed here — this is a plain kit function.

> This is the one place the spec asks you to reach for a React primitive (`useMemo`) rather than consume a named hook. It's intentional: a named hook here would be a trivial wrapper with no domain logic to hide, matching the [one-shot read policy](#one-shot-reads). `useMemo` is the right tool when you need a per-account signer derived from inputs that are already reactive (`useWallets` + `useChain`).

Implementation:

```tsx
// Shared helper: every wallet hook needs `client.wallet`, so route through
// `useClientCapability` to get both the typed narrowing and a loud error if
// the wallet plugin isn't installed.
function useWalletClient(hookName: string) {
    return useClientCapability<ClientWithWallet>({
        capability: 'wallet',
        hookName,
        providerHint: 'Mount <WalletProvider> or install `kit-plugin-wallet`.',
    });
}

function useWallets(): readonly UiWallet[] {
    const client = useWalletClient('useWallets');
    return useSyncExternalStore(
        client.wallet.subscribe,
        () => client.wallet.getState().wallets,
    );
}

function useWalletStatus(): WalletStatus {
    const client = useWalletClient('useWalletStatus');
    return useSyncExternalStore(
        client.wallet.subscribe,
        () => client.wallet.getState().status,
    );
}

function useConnectedWallet() {
    const client = useWalletClient('useConnectedWallet');
    // Project {account, wallet} out of the snapshot, memoizing across calls so
    // signer-only changes upstream don't re-render consumers of this hook.
    const lastRef = useRef<{ account: UiWalletAccount; wallet: UiWallet } | null>(null);
    const getSnapshot = () => {
        const connected = client.wallet.getState().connected;
        if (connected === null) return (lastRef.current = null);
        const prev = lastRef.current;
        if (prev && prev.account === connected.account && prev.wallet === connected.wallet) {
            return prev;
        }
        return (lastRef.current = { account: connected.account, wallet: connected.wallet });
    };
    return useSyncExternalStore(client.wallet.subscribe, getSnapshot, getSnapshot);
}

function useWalletSigner() {
    const client = useWalletClient('useWalletSigner');
    const getSnapshot = () => client.wallet.getState().connected?.signer ?? null;
    return useSyncExternalStore(client.wallet.subscribe, getSnapshot, getSnapshot);
}

function useWalletState(): WalletState {
    const client = useWalletClient('useWalletState');
    return useSyncExternalStore(client.wallet.subscribe, client.wallet.getState);
}

function useConnectWallet() {
    const client = useWalletClient('useConnectWallet');
    return useAction(
        (signal, wallet: UiWallet) => client.wallet.connect(wallet, { abortSignal: signal }),
        [client],
    );
}

function useDisconnectWallet() {
    const client = useWalletClient('useDisconnectWallet');
    return useAction(
        (signal) => client.wallet.disconnect({ abortSignal: signal }),
        [client],
    );
}

function useSignMessage() {
    const client = useWalletClient('useSignMessage');
    return useAction(
        (signal, message: Uint8Array) => client.wallet.signMessage(message, { abortSignal: signal }),
        [client],
    );
}

function useSignIn() {
    const client = useWalletClient('useSignIn');
    return useAction(
        (signal, wallet: UiWallet, input?: SolanaSignInInput) =>
            client.wallet.signIn(wallet, input, { abortSignal: signal }),
        [client],
    );
}

function useSelectAccount() {
    const client = useWalletClient('useSelectAccount');
    // Synchronous — no ActionState wrapping.
    return useCallback(
        (account: UiWalletAccount) => client.wallet.selectAccount(account),
        [client],
    );
}
```

#### Live data (subscription-backed)

Named hooks for common RPC + subscription pairings. These use Kit's `createReactiveStoreWithInitialValueAndSlotTracking` internally and expose the result via `useSyncExternalStore`.

```typescript
type LiveQueryResult<T> = {
    /**
     * The current value. `undefined` while loading or when disabled. On `error`
     * and `retrying` holds the last known value (if one ever arrived) so UIs
     * can show stale data with a loading / error overlay rather than flashing
     * to blank.
     */
    data: T | undefined;
    /** Error from the fetch or subscription, or undefined. */
    error: unknown;
    /**
     * The lifecycle status, drawn from Kit's `ReactiveState<T>` plus a kit-react
     * `'disabled'` variant for null-gated queries:
     *
     * - `loading`: active, no data or error has arrived yet.
     * - `loaded`: data has arrived and the stream is healthy.
     * - `error`: the fetch or subscription failed; `data` holds the last known value.
     * - `retrying`: `retry()` was called after an error; `data` holds the stale
     *   value while a fresh connection is being established.
     * - `disabled`: the query is intentionally off (null arg).
     *
     * Prefer branching on `status` when your UI needs to distinguish
     * `retrying` (show stale data with an overlay) from `loading` (show a
     * spinner). Use `isLoading` for the simple spinner case.
     */
    status: 'loading' | 'loaded' | 'error' | 'retrying' | 'disabled';
    /**
     * Convenience shorthand for `status === 'loading'`. **A disabled query
     * (null arg) reports `false`** — matching react-query / SWR semantics when
     * the key is `null`, so callers can render an empty state instead of a
     * forever-loading spinner. `retrying` also reports `false` because `data`
     * still holds the last known value — check `status === 'retrying'`
     * explicitly if you want to reflect it in your UI.
     */
    isLoading: boolean;
    /**
     * Re-open the stream after an error. No-op unless `status === 'error'`.
     * Stable reference — safe to pass directly to `onClick` handlers or to
     * include in effect deps.
     *
     * Retry is end-to-end: on error, the store tears down the subscription
     * (and, for named hooks, re-runs the initial RPC fetch), transitions to
     * `status: 'retrying'` preserving `data`, and returns to `loaded` once a
     * fresh value arrives. If the retry itself fails, the store transitions
     * back to `error` with the new reason.
     */
    retry: () => void;
    /**
     * The slot `data` was observed at. `undefined` while loading, disabled, on
     * server render, or when only an error has arrived. Drawn from the same
     * snapshot as `data`, so the two always correspond: a later subscription
     * notification at a higher slot updates both in the same commit. Useful
     * for "as of slot X" freshness indicators, coordinating a refetch with a
     * just-sent transaction's slot, and stale-data detection.
     *
     * For `useSubscription`, populated when the subscription emits
     * `SolanaRpcResponse`-shaped notifications (e.g. `accountNotifications`,
     * `programNotifications`) and `undefined` for subscriptions that emit
     * raw values (e.g. `slotNotifications`, `logsNotifications`). The
     * envelope is unwrapped on the way out, so `data` is always the inner
     * value regardless of shape.
     */
    slot: Slot | undefined;
};

/**
 * Live SOL balance for an address.
 * Combines getBalance + accountNotifications with slot-based dedup.
 * Pass `null` to disable (e.g. when wallet is not connected). A disabled
 * query reports `{ status: 'disabled', data: undefined, isLoading: false }`.
 */
function useBalance(address: Address | null): LiveQueryResult<Lamports>;

/**
 * Live account for an address.
 * Combines getAccountInfo + accountNotifications with slot-based dedup.
 * When a decoder is provided, the account data is decoded and returned as
 * a typed `MaybeAccount<TData>`. Without a decoder, returns the raw
 * `MaybeEncodedAccount`. Both are Kit's "fetched account that may or may
 * not exist on-chain" discriminated union — `exists: true` narrows to an
 * `Account` / `EncodedAccount` with data, `exists: false` keeps the
 * address for the missing-account case.
 * Pass `null` to disable — a disabled query reports `status: 'disabled'`.
 */
function useAccount(address: Address | null): LiveQueryResult<MaybeEncodedAccount>;
function useAccount<TData extends object>(
    address: Address | null,
    decoder: Decoder<TData>,
): LiveQueryResult<MaybeAccount<TData>>;

/**
 * Live transaction confirmation status.
 * Combines getSignatureStatuses + signatureNotifications with slot-based dedup.
 * Pass `null` to disable (e.g. before a transaction is sent) — a disabled
 * query reports `status: 'disabled'`.
 */
function useTransactionConfirmation(
    signature: Signature | null,
    options?: { commitment?: Commitment },
): LiveQueryResult<{
    err: TransactionError | null;
    confirmationStatus: Commitment | null;
}>;
```

**Lifecycle states.** Five distinct cases map to five distinct `status` values, so callers can tell them apart without extra props:

- **Disabled (null arg)** — the query is intentionally off. `status: 'disabled'`, `isLoading: false`. Render an empty state.
- **Active, no data yet** — the query is running, waiting for the first value. `status: 'loading'`, `isLoading: true`. Render a spinner.
- **Active, healthy** — data has arrived. `status: 'loaded'`, `isLoading: false`.
- **Errored** — the fetch or subscription failed. `status: 'error'`, `isLoading: false`, `data` holds the last known value (if any). Call `retry()` to re-open.
- **Retrying** — `retry()` was called after an error. `status: 'retrying'`, `isLoading: false`, `data` still holds the stale value. Branch on `status === 'retrying'` if you want a distinct UI from a cold `loading` state.
- **Server render** — the query is inert on the server (no HTTP / WebSocket); from the consumer's perspective the value is still "pending", so the hook reports `status: 'loading'` and hydration matches the first client render before the real store kicks in.

Internally this is two static "empty" stores, not one: `disabledLiveStore` is tagged so `useLiveQueryResult` maps it to `status: 'disabled'`, while `nullLiveStore` (used on server builds) isn't, so the same snapshot shows `status: 'loading'`. Collapsing them would force the caller to pick a single meaning for "empty", which only one of the cases wants.

Implementation sketch:

```tsx
// Shared helper: every live-data hook needs `client.rpc` + `client.rpcSubscriptions`.
// Route through `useClientCapability` so mounting one of these hooks without an
// `RpcProvider` / `RpcConnectionProvider` ancestor fails loud at mount.
function useRequestConnectionClient(hookName: string) {
    return useClientCapability<ClientWithRpc & ClientWithRpcSubscriptions>({
        capability: ['rpc', 'rpcSubscriptions'],
        hookName,
        providerHint: 'Mount <RpcProvider> or <RpcConnectionProvider>.',
    });
}

// Each named hook is paired with a framework-agnostic live-data builder.
// The builder produces a LiveDataSpec<T> — the RPC request, subscription
// request, and two mappers — without any React or abort-signal plumbing.
// useBalance / useLiveSwr / useLiveQuery all consume the same spec, so
// the choice of cache layer is orthogonal to the choice of data source.

type LiveDataSpec<TRpcValue, TSubscriptionValue, T> = Omit<
    CreateReactiveStoreConfig<TRpcValue, TSubscriptionValue, T>,
    'abortSignal'
>;

function createBalanceLiveData(
    client: ClientWithRpc & ClientWithRpcSubscriptions,
    address: Address,
): LiveDataSpec<Lamports, { lamports: Lamports }, Lamports> {
    return {
        rpcRequest: client.rpc.getBalance(address),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address),
        // The factory unwraps the `SolanaRpcResponse` envelope before
        // handing it to the mapper, so `value` here is already
        // `Lamports`, not `{ value: Lamports, ... }`.
        rpcValueMapper: (lamports) => lamports,
        rpcSubscriptionValueMapper: ({ lamports }) => lamports,
    };
}

function createAccountLiveData<TData extends object>(
    client: ClientWithRpc & ClientWithRpcSubscriptions,
    address: Address,
    decoder?: Decoder<TData>,
): LiveDataSpec<unknown, unknown, MaybeEncodedAccount | MaybeAccount<TData>> {
    // parseBase64RpcAccount returns a MaybeEncodedAccount when its input
    // may be null — the missing-account case becomes
    // `{ address, exists: false }` rather than a raw `null`.
    const mapValue = (value: unknown) => {
        const encoded = parseBase64RpcAccount(address, value);
        return decoder ? decodeAccount(encoded, decoder) : encoded;
    };
    return {
        rpcRequest: client.rpc.getAccountInfo(address, { encoding: 'base64' }),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address, { encoding: 'base64' }),
        rpcValueMapper: mapValue,
        rpcSubscriptionValueMapper: mapValue,
    };
}

function createTransactionConfirmationLiveData(
    client: ClientWithRpc & ClientWithRpcSubscriptions,
    signature: Signature,
    commitment: Commitment,
): LiveDataSpec<unknown, unknown, TransactionConfirmationStatus> {
    return {
        rpcRequest: client.rpc.getSignatureStatuses([signature]),
        rpcSubscriptionRequest: client.rpcSubscriptions.signatureNotifications(signature, { commitment }),
        rpcValueMapper: (statuses) => {
            const status = statuses[0];
            return status
                ? { err: status.err, confirmationStatus: status.confirmationStatus }
                : { err: null, confirmationStatus: null };
        },
        rpcSubscriptionValueMapper: (notification) => ({
            err: notification.err,
            confirmationStatus: commitment,
        }),
    };
}

// The named hooks are thin wrappers: they resolve the client, gate on a
// null argument, and delegate to the builder.

function useBalance(address: Address | null): LiveQueryResult<Lamports> {
    const client = useRequestConnectionClient('useBalance');
    return useLiveData(
        () => (address ? createBalanceLiveData(client, address) : null),
        [client, address],
    );
}

function useAccount<TData extends object>(
    address: Address | null,
    decoder?: Decoder<TData>,
): LiveQueryResult<MaybeEncodedAccount | MaybeAccount<TData>> {
    const client = useRequestConnectionClient('useAccount');
    return useLiveData(
        () => (address ? createAccountLiveData(client, address, decoder) : null),
        [client, address, decoder],
    );
}

function useTransactionConfirmation(
    signature: Signature | null,
    options?: { commitment?: Commitment },
): LiveQueryResult<TransactionConfirmationStatus> {
    const client = useRequestConnectionClient('useTransactionConfirmation');
    const commitment = options?.commitment ?? 'confirmed';
    return useLiveData(
        () => (signature ? createTransactionConfirmationLiveData(client, signature, commitment) : null),
        [client, signature, commitment],
    );
}
```

Where the two static "empty" stores (`disabledLiveStore` for user-initiated disable, `nullLiveStore` for server render) and `useLiveStore` are internal helpers:

```typescript
const LOADING_STATE: ReactiveState<never> = Object.freeze({
    data: undefined,
    error: undefined,
    status: 'loading',
});

const NOOP_UNSUBSCRIBE = () => {};
const NOOP_RETRY = () => {};

/**
 * Static store that never emits. `useLiveQueryResult` surfaces its `loading`
 * status so SSR matches the first client render, and the real store kicks in
 * once the client mounts.
 */
function nullLiveStore<T>(): ReactiveStreamStore<T> {
    return {
        getError: () => undefined,
        getState: () => undefined,
        getUnifiedState: () => LOADING_STATE,
        retry: NOOP_RETRY,
        subscribe: () => NOOP_UNSUBSCRIBE,
    };
}

/**
 * Static store tagged as "disabled". `useLiveQueryResult` detects the tag and
 * maps it to `status: 'disabled'` — matches react-query / SWR semantics when
 * the key is `null`, so disabled queries don't render forever-loading UI.
 */
const DISABLED = Symbol('DisabledLiveStore');

function disabledLiveStore<T>(): ReactiveStreamStore<T> & { readonly [DISABLED]: true } {
    return {
        [DISABLED]: true,
        getError: () => undefined,
        getState: () => undefined,
        getUnifiedState: () => LOADING_STATE, // ignored — the tag takes precedence at the bridge
        retry: NOOP_RETRY,
        subscribe: () => NOOP_UNSUBSCRIBE,
    };
}

// `useLiveStore` is generic over both stream and action store shapes — both
// implement the ReactiveStore interface (subscribe + getUnifiedState) so the
// lifecycle management (abort on dep change / unmount) is identical.
function useLiveStore<TStore extends { subscribe: (cb: () => void) => () => void }>(
    factory: (signal: AbortSignal) => TStore,
    deps: DependencyList,
): TStore {
    const abortRef = useRef<AbortController | null>(null);

    // The SSR branch lives inside the memo (not as an early return) so the
    // hook sequence stays identical between server and client.
    const store = useMemo(() => {
        if (!__BROWSER__ && !__REACTNATIVE__) return nullLiveStore() as unknown as TStore;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        return factory(controller.signal);
    }, deps);

    useEffect(() => () => abortRef.current?.abort(), []);

    return store;
}

/**
 * Bridge for named hooks whose stores come from
 * `createReactiveStoreWithInitialValueAndSlotTracking` and therefore hold
 * `SolanaRpcResponse<T>` envelopes (value + slot context).
 */
function useLiveQueryResult<T>(
    store: ReactiveStreamStore<SolanaRpcResponse<T>>,
): LiveQueryResult<T> {
    // Kit guarantees `getUnifiedState()` returns a stable reference per update,
    // so one subscription is enough (vs. the old shape which needed two).
    const state = useSyncExternalStore(store.subscribe, store.getUnifiedState);
    const disabled = (store as { [DISABLED]?: true })[DISABLED] === true;

    return useMemo(() => {
        if (disabled) {
            return {
                data: undefined,
                error: undefined,
                isLoading: false,
                retry: NOOP_RETRY,
                slot: undefined,
                status: 'disabled',
            };
        }
        return {
            data: state.data?.value,
            error: state.error,
            isLoading: state.status === 'loading',
            retry: store.retry,
            // Pulled from the same snapshot as `data` so the two always agree.
            slot: state.data?.context.slot,
            status: state.status,
        };
    }, [state, disabled, store.retry]);
}

/**
 * Bridge for `useSubscription`. The store comes straight from `.reactiveStore()`
 * on a pending subscription request. Each notification is duck-typed for
 * Kit's `SolanaRpcResponse` envelope: when present, `data` is unwrapped to
 * the inner value and `slot` is lifted from `context.slot`; when absent,
 * the notification passes through as-is with `slot: undefined`.
 */
function useSubscriptionResult<T>(
    store: ReactiveStreamStore<T>,
): LiveQueryResult<UnwrapRpcResponse<T>> {
    const state = useSyncExternalStore(store.subscribe, store.getUnifiedState);
    const disabled = (store as { [DISABLED]?: true })[DISABLED] === true;

    return useMemo(() => {
        if (disabled) {
            return {
                data: undefined,
                error: undefined,
                isLoading: false,
                retry: NOOP_RETRY,
                slot: undefined,
                status: 'disabled',
            };
        }
        const { data, slot } = splitRpcResponse(state.data);
        return {
            data,
            error: state.error,
            isLoading: state.status === 'loading',
            retry: store.retry,
            slot,
            status: state.status,
        };
    }, [state, disabled, store.retry]);
}

// Duck-type the `SolanaRpcResponse` envelope — `{ context: { slot }, value }` —
// and split it into `{ data, slot }`. Anything else passes through.
function splitRpcResponse<T>(
    notification: T | undefined,
): { data: UnwrapRpcResponse<T> | undefined; slot: Slot | undefined } {
    if (
        notification != null &&
        typeof notification === 'object' &&
        'context' in notification &&
        'value' in notification
    ) {
        const envelope = notification as SolanaRpcResponse<unknown>;
        return { data: envelope.value as UnwrapRpcResponse<T>, slot: envelope.context.slot };
    }
    return { data: notification as UnwrapRpcResponse<T> | undefined, slot: undefined };
}
```

`retry()` is end-to-end because Kit's reactive stores own the full stream lifecycle: `createReactiveStoreWithInitialValueAndSlotTracking` and `PendingRpcSubscriptionsRequest.reactiveStore()` both return stores built on `createReactiveStoreFromDataPublisherFactory`, which takes a `() => Promise<DataPublisher>` and re-invokes it on each retry. The React bridge is pure passthrough — `LiveQueryResult.retry` is `store.retry` with stable identity, safe to pass straight to an `onClick` handler.

#### Generic live data (`useLiveData`)

For custom RPC + subscription combinations the named hooks don't cover:

```typescript
/**
 * Generic live-data hook for any RPC + subscription pair.
 * Handles store creation, slot dedup, abort, and cleanup.
 *
 * The builder function runs when `deps` change and returns a
 * `LiveDataSpec<T>` — the RPC request, subscription request, and the two
 * mappers that unify their value shapes. Return `null` to disable the
 * query (matches the null-gate convention used by `useBalance`,
 * `useAccount`, etc.). Abort signal plumbing is handled internally.
 *
 * ESLint's `react-hooks/exhaustive-deps` rule can trace which values the
 * builder captures and warn when any are missing from `deps` — add
 * `'useLiveData'` to your project's `exhaustive-deps` `additionalHooks`
 * setting to opt in.
 */
function useLiveData<TRpcValue, TSubscriptionValue, T>(
    buildSpec: () => LiveDataSpec<TRpcValue, TSubscriptionValue, T> | null,
    deps: DependencyList,
): LiveQueryResult<T>;
```

Usage:

```tsx
// Using a stock builder — equivalent to `useBalance(address)`:
const { data: balance } = useLiveData(
    () => (address ? createBalanceLiveData(client, address) : null),
    [client, address],
);

// Inline for a custom program account:
const { data: gameState } = useLiveData(
    () => ({
        rpcRequest: client.rpc.getAccountInfo(gameAddress),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(gameAddress),
        rpcValueMapper: (v) => parseGameState(v.value),
        rpcSubscriptionValueMapper: (v) => parseGameState(v),
    }),
    [client, gameAddress],
);
```

Third-party plugins are expected to ship their own `create<Feature>LiveData(client, ...args)` builders alongside the plugin. The builder has no React dependency, so the same function works with `useLiveData`, `useLiveSwr`, and `useLiveQuery` — the cache layer is the caller's choice, not the plugin author's.

#### Subscriptions (no initial fetch)

For subscription-only data where there is no RPC fetch equivalent:

```typescript
/**
 * Unwraps `SolanaRpcResponse<U>` → `U` at the type level, so subscriptions
 * that emit slot-stamped notifications surface `U` as `data` (the slot
 * moves to the top-level `slot` field). Non-envelope subscriptions pass
 * through unchanged.
 */
type UnwrapRpcResponse<T> = T extends SolanaRpcResponse<infer U> ? U : T;

/**
 * Anything that produces a `ReactiveStreamStore<T>` via
 * `.reactiveStore({ abortSignal })`. `PendingRpcSubscriptionsRequest<T>`
 * satisfies this by design; plugin-authored streaming-request objects that
 * follow the same convention plug in without modification.
 */
type ReactiveStreamSource<T> = {
    reactiveStore(options: { abortSignal: AbortSignal }): ReactiveStreamStore<T>;
};

/**
 * Subscribe to a stream. Returns the latest notification in the same
 * `LiveQueryResult` shape as the named hooks.
 *
 * Accepts any object with `.reactiveStore({ abortSignal })` — typically
 * `PendingRpcSubscriptionsRequest`, but plugin-authored streaming objects
 * that follow the same convention work too.
 *
 * When the stream emits `SolanaRpcResponse<U>`-shaped notifications
 * (`accountNotifications`, `programNotifications`, etc.), the envelope is
 * unwrapped: `data` is the inner value `U` and `slot` is populated from
 * `context.slot`. For streams that emit raw values (`slotNotifications`,
 * `logsNotifications`, etc.), `data` is the notification as-is and `slot`
 * is `undefined`.
 *
 * Return `null` from the factory to disable — matches the null-gate
 * convention used by `useBalance` / `useAccount` /
 * `useTransactionConfirmation`. A disabled subscription fires no RPC
 * traffic and reports `status: 'disabled'`.
 */
function useSubscription<T>(
    factory: (signal: AbortSignal) => ReactiveStreamSource<T> | null,
    deps: DependencyList,
): LiveQueryResult<UnwrapRpcResponse<T>>;
```

Usage:

```tsx
const { data: logs, status } = useSubscription(
    (signal) => client.rpcSubscriptions.logsNotifications(programId),
    [client, programId],
);

const { data: slot, error, retry } = useSubscription(
    (signal) => client.rpcSubscriptions.slotNotifications(),
    [client],
);
if (error) return <button onClick={retry}>Reconnect slot feed</button>;

// Gated on a feature flag
const { data: enabledLogs } = useSubscription(
    (signal) => enabled ? client.rpcSubscriptions.logsNotifications(programId) : null,
    [client, programId, enabled],
);
```

Implementation:

```tsx
function useSubscription<T>(
    factory: (signal: AbortSignal) => ReactiveStreamSource<T> | null,
    deps: DependencyList,
): LiveQueryResult<UnwrapRpcResponse<T>> {
    const store = useLiveStore<ReactiveStreamStore<T>>(
        (signal) => {
            const pending = factory(signal);
            if (pending == null) return disabledLiveStore<T>();
            // `.reactiveStore()` returns synchronously — transport setup
            // happens inside the store, which starts in `status: 'loading'`
            // and transitions when the WebSocket resolves. Setup failures
            // surface as `status: 'error'`, recoverable via `retry()`.
            return pending.reactiveStore({ abortSignal: signal });
        },
        deps,
    );
    return useSubscriptionResult(store);
}
```

`useSubscription` shares the same `useLiveStore` + bridge pipeline as the named hooks. The bridge (`useSubscriptionResult`, defined [earlier](#live-data-subscription-backed)) inspects each notification at runtime: subscriptions that emit `SolanaRpcResponse<U>` (`accountNotifications`, `programNotifications`, `signatureNotifications`, …) are unwrapped so `data` is the inner value and `slot` comes from `context.slot`; subscriptions that emit raw values (`slotNotifications`, `logsNotifications`, `rootNotifications`, …) pass through as-is with `slot` undefined. The `UnwrapRpcResponse<T>` conditional type keeps the return type aligned with the runtime behavior, so callers never have to reach for `data.context.slot` or `data.value` themselves.

> **Why sync `.reactiveStore()` and not async `.reactive()`?** The async form returns `Promise<ReactiveStreamStore<T>>`, which forces every consumer to invent a second state machine on top of the store's own `loading | loaded | error | retrying` — "waiting for the promise" vs. "waiting for the first notification" — and leaves no place to put `retry()` during transport-setup failures (no store exists yet). The sync form delegates transport setup to `createReactiveStoreFromDataPublisherFactory` inside Kit, so the store is usable immediately and setup failures surface through the store's existing `error` state with `retry()` working out of the box.

#### One-shot requests (`useRequest`)

For RPC calls that don't have a subscription counterpart — `getEpochInfo`, `getMinimumBalanceForRentExemption`, `getLatestBlockhash`, `getRecentPerformanceSamples`, etc. — or for cases where you want a one-shot read of a value that `useAccount` / `useBalance` would otherwise subscribe to.

Backed by `ReactiveActionStore` via `PendingRpcRequest.reactiveStore()` ([Prerequisites](#prerequisites)): each mount creates the store and fires the request eagerly (the `.reactiveStore()` method auto-dispatches on creation), deps change rebuilds the store with a fresh dispatch (auto-aborting any in-flight predecessor), and consumers get a `refresh()` function to re-fire manually.

```typescript
/** The state returned by {@link useRequest}. */
type RequestResult<T> = {
    /**
     * The current value, or `undefined` while loading or when disabled. On
     * `error`, holds the last successful value (if any) so UIs can show
     * stale data with an error banner rather than flashing to blank.
     */
    data: T | undefined;
    /** Error from the RPC call, or undefined. */
    error: unknown;
    /**
     * Lifecycle status:
     * - `loading`: first call in flight, no data yet.
     * - `loaded`: call succeeded.
     * - `error`: call failed. `retry()` re-fires.
     * - `retrying`: re-fire after an error; `data` still holds stale value.
     * - `disabled`: factory returned `null`.
     */
    status: 'loading' | 'loaded' | 'error' | 'retrying' | 'disabled';
    /** Convenience shorthand for `status === 'loading'`. */
    isLoading: boolean;
    /**
     * Re-fire the RPC call with the current deps. Stable reference. Safe to
     * pass to an onClick handler or put in effect deps. Call this when the
     * user explicitly requests a refresh, or to retry after an error.
     *
     * Note: unlike live-data hooks (which expose a separate `retry()` for
     * the error path), `useRequest` collapses both affordances under
     * `refresh` — there's only one re-dispatch mechanism on an action
     * store, and distinguishing "user-initiated refresh" from "error
     * recovery" at the API level would be a naming split without a
     * behavioural one.
     */
    refresh: () => void;
};

/**
 * Anything that produces a `ReactiveActionStore<[], T>` via `.reactiveStore()`.
 * `PendingRpcRequest<T>` satisfies this by design; plugin authors whose
 * pending-request objects expose the same method plug in without
 * modification. This duck-type is the orthogonality boundary — `useRequest`
 * doesn't know or care where the pending came from.
 */
type ReactiveActionSource<T> = {
    reactiveStore(): ReactiveActionStore<[], T>;
};

/**
 * Fire a one-shot request on mount and whenever `deps` change. Returns
 * reactive state tracking the call's lifecycle.
 *
 * Accepts any object with `.reactiveStore()` — typically `PendingRpcRequest`,
 * but plugin-authored pending objects that follow the same convention work
 * too (e.g. a DAS client's `getAsset(address)`).
 *
 * Return `null` from `factory` to disable — matches the null-gate convention
 * used by `useBalance` / `useAccount`.
 */
function useRequest<T>(
    factory: (signal: AbortSignal) => ReactiveActionSource<T> | null,
    deps: DependencyList,
): RequestResult<T>;
```

Usage:

```tsx
// Fetch epoch info on mount; refresh on user click.
const { data: epoch, error, refresh } = useRequest(
    () => client.rpc.getEpochInfo(),
    [client],
);
if (error) return <button onClick={refresh}>Retry</button>;

// Deps-driven: refetch when the address changes.
const { data: supply } = useRequest(
    () => client.rpc.getTokenSupply(mintAddress),
    [client, mintAddress],
);

// Conditional (disabled when inputs aren't ready).
const { data: account } = useRequest(
    () => address ? client.rpc.getAccountInfo(address) : null,
    [client, address],
);
```

Implementation:

```tsx
function useRequest<T>(
    factory: (signal: AbortSignal) => ReactiveActionSource<T> | null,
    deps: DependencyList,
): RequestResult<T> {
    const store = useLiveStore<ReactiveActionStore<[], T>>(
        (signal) => {
            const pending = factory(signal);
            if (pending == null) return disabledActionStore<T>();
            // `.reactiveStore()` auto-dispatches on creation — see
            // [Prerequisites](#prerequisites). The hook doesn't need a
            // separate useEffect to fire the initial request.
            return pending.reactiveStore();
        },
        deps,
    );

    return useRequestResult(store);
}
```

The bridge maps the action-store's `idle | running | success | error` to the read shape above:

- action `running` with no prior data → read `loading` (the auto-dispatch from `.reactiveStore()` fires at construction, so there's no pre-dispatch idle state to expose).
- action `idle` from `disabledActionStore` → read `disabled`.
- action `running` with prior data (re-dispatch via `refresh()`) → read `retrying` (same "stale-while-revalidate" UX as stream stores).
- action `success` → read `loaded`.
- action `error` → read `error`.
- `refresh()` wraps `store.dispatch()` — re-fires the RPC manually.

> **Why does `.reactiveStore()` auto-dispatch when `ReactiveActionStore` is neutral on initiation?** The primitive stays neutral — `useSendTransaction` and custom `useAction` flows build their own action stores via `createReactiveActionStore(fn)` and dispatch on user input. Only the `.reactiveStore()` convenience method on `PendingRpcRequest` / `PendingRpcSubscriptionsRequest` commits to eager dispatch, because calling `.reactiveStore()` semantically means "I want this live now" (same reasoning as subscriptions). Consumers who want build-now-dispatch-later drop one layer to `createReactiveActionStore`.

#### Sending transactions

Wraps `client.sendTransaction()` and `client.sendTransactions()` (from the instruction-plan plugin) with React async state tracking. These are the primary way to send transactions in kit-react — they handle the full plan → sign → send → confirm lifecycle.

```typescript
type ActionState<TArgs extends unknown[], TResult> = {
    /** The send function. Stable reference. */
    send: (...args: TArgs) => Promise<TResult>;
    /**
     * The current lifecycle status as a discriminated string. The
     * `isIdle` / `isRunning` / `isSuccess` / `isError` booleans below are
     * derived from this — pick whichever reads better at the call site.
     */
    status: 'idle' | 'running' | 'success' | 'error';
    /** `true` when `status === 'idle'`. */
    isIdle: boolean;
    /** `true` when `status === 'running'` — a send is in flight. */
    isRunning: boolean;
    /** `true` when `status === 'success'`. */
    isSuccess: boolean;
    /** `true` when `status === 'error'`. */
    isError: boolean;
    /** The result on success, or undefined. */
    data: TResult | undefined;
    /** The error on failure, or undefined. */
    error: unknown;
    /** Reset state back to idle. Stable reference. */
    reset: () => void;
};

/**
 * Send a single transaction. Accepts instructions, an instruction plan,
 * a transaction message, or a pre-built SingleTransactionPlan.
 * Asserts that the plan contains exactly one transaction.
 */
function useSendTransaction(): ActionState<
    Parameters<ClientWithTransactionSending['sendTransaction']>,
    SuccessfulSingleTransactionPlanResult
>;

/**
 * Send one or more transactions. Accepts instructions, an instruction plan,
 * a transaction message, or a pre-built TransactionPlan.
 */
function useSendTransactions(): ActionState<
    Parameters<ClientWithTransactionSending['sendTransactions']>,
    TransactionPlanResult
>;

/**
 * Plan a single transaction without sending it. Same input shape as
 * useSendTransaction; returns the planned transaction message. Useful for
 * preview-then-send UX (confirmation modal showing fee / writable accounts).
 * The planned output feeds straight back into useSendTransaction.
 */
function usePlanTransaction(): ActionState<
    Parameters<ClientWithTransactionPlanning['planTransaction']>,
    SingleTransactionPlan['message']
>;

/**
 * Plan one or more transactions without sending them. Multi-transaction
 * variant of usePlanTransaction.
 */
function usePlanTransactions(): ActionState<
    Parameters<ClientWithTransactionPlanning['planTransactions']>,
    TransactionPlan
>;
```

`ActionState` is generic over both the argument tuple and the result so callers get full autocomplete on `send(...)` — the argument positions match whichever Kit method the hook wraps.

Each hook asserts only the single capability it calls (`planTransaction`, `planTransactions`, `sendTransaction`, `sendTransactions`) so the React layer stays aligned with Kit's granular plugin model — a plugin that installs just `planTransaction` is enough to use `usePlanTransaction`.

Usage:

```tsx
const { send, status, data, error } = useSendTransaction();

// Send instructions directly
await send(getTransferInstruction({ source, destination, amount }));

// Send using the fluent program client API
await send(client.system.instructions.transfer({ source, destination, amount }));

// Send an instruction plan
await send(sequentialInstructionPlan([ixA, ixB]));
```

Implementation:

```tsx
function useSendTransaction() {
    const client = useClientCapability<ClientWithSendTransaction>({
        capability: 'sendTransaction',
        hookName: 'useSendTransaction',
        providerHint: 'Mount <RpcProvider> or <LiteSvmProvider> (or another provider that installs transaction execution).',
    });
    return useAction(
        (signal, input: Parameters<typeof client.sendTransaction>[0], config?: Config) =>
            client.sendTransaction(input, { ...config, abortSignal: signal }),
        [client],
    );
}

// useAction bridges Kit's ReactiveActionStore into React.
function useAction<TArgs extends unknown[], TResult>(
    fn: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>,
    deps: DependencyList,
): ActionState<TArgs, TResult> {
    // Latest-ref keeps the store's operation calling the newest closure
    // without rebuilding the store on every render. Store identity stays
    // stable for the hook's lifetime unless deps change.
    const fnRef = useRef(fn);
    useEffect(() => { fnRef.current = fn; });

    const store = useMemo(
        () => createReactiveActionStore<TArgs, TResult>(
            (signal, ...args) => fnRef.current(signal, ...args),
        ),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `fnRef` decouples deps from the store
        deps,
    );

    const snapshot = useSyncExternalStore(store.subscribe, store.getState);

    return useMemo(
        () => ({
            send: store.dispatch,
            status: snapshot.status,
            isIdle: snapshot.status === 'idle',
            isRunning: snapshot.status === 'running',
            isSuccess: snapshot.status === 'success',
            isError: snapshot.status === 'error',
            data: snapshot.data,
            error: snapshot.error,
            reset: store.reset,
        }),
        [snapshot, store],
    );
}
```

The state machine, abort-on-supersede, and stale-while-revalidate semantics live in `createReactiveActionStore` — the React hook is a ~20-line bridge adding `is*` convenience booleans and a stable `send` alias for `dispatch`.

The `send` function accepts the same inputs as `client.sendTransaction()` — raw instructions, fluent program client instructions, instruction plans, or pre-built transaction messages. For imperative flows where you don't need React state tracking, you can also call `client.sendTransaction(...)` directly via `useClient()`.

#### Generic async action

`useAction` wraps any async function with status/data/error tracking. It's the building block behind `useSendTransaction`, and is exported for custom async flows like sign-then-send or partial signing. Backed by `createReactiveActionStore` ([Prerequisites](#prerequisites)) — the state machine, supersede semantics, and stale-while-revalidate behavior all live in the Kit primitive.

```typescript
/**
 * Track the async state of a user-triggered action.
 * Returns a stable `send` function and reactive status/data/error.
 *
 * The wrapped function receives an `AbortSignal` as its first argument —
 * thread it into your `fetch` / RPC / wallet call for true cancellation.
 * Calling `send` while a prior call is in flight (or calling `reset()`)
 * aborts the prior call's signal: its `await` rejects with `AbortError`
 * and its outcome is never written to state.
 *
 * `deps` captures the values `fn` closes over (client, chain, signer).
 * Pass to `react-hooks/exhaustive-deps` via `additionalHooks` to lint.
 */
function useAction<TArgs extends unknown[], TResult>(
    fn: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>,
    deps: DependencyList,
): ActionState<TArgs, TResult>;
```

See [`ActionState`](#sending-transactions) above for the full return shape — including the `status` discriminated string and the `isIdle` / `isRunning` / `isSuccess` / `isError` booleans derived from it.

Fire-and-forget is the common case — call `send(...)` from an event handler and render from `status` / `data` / `error`. The hook's reactive state tracks the newest call, so a superseded call's rejection is never observed. Only flows that `await send(...)` to read the resolved value (e.g. navigate on success, post signed bytes to an API) need to filter supersedes; kit-react exports `isAbortError` as the one-liner:

```tsx
import { isAbortError } from '@solana/kit-react';

try {
    const result = await send(...);
    navigate(`/tx/${result.signature}`);
} catch (err) {
    if (isAbortError(err)) return; // superseded — state reflects the newer call
    // handle real error
}
```

Usage — sign-then-send flow:

```tsx
const client = useClient();

// Step 1: Plan the transaction
const { send: plan, data: message } = useAction(
    (_signal, input: InstructionPlanInput) => client.planTransaction(input),
);

// Step 2: Sign (without sending)
const { send: sign, data: signed } = useAction(
    (_signal, msg: TransactionMessage) => signTransactionMessageWithSigners(msg),
);

// Step 3: Send the already-signed transaction
const { send: sendSigned, status } = useAction(
    (signal, tx: Transaction) =>
        sendAndConfirmTransaction(client.rpc, tx, { abortSignal: signal, commitment: 'confirmed' }),
);

// In your UI:
await plan(getTransferInstruction({ source, destination, amount }));
// ... user reviews the planned message ...
await sign(message);
// ... user reviews the signed transaction ...
await sendSigned(signed);
```

Usage — DeFi aggregator flow (sign locally, submit to external API):

This pattern is common for swap aggregators, relayers, and any flow where a third-party service builds the transaction and handles submission. The wallet only signs — it doesn't send to the RPC. Passing the signal through to `fetch` means a rapid second click actually cancels the first submission, not just the outer await:

```tsx
const signer = useWalletSigner();
const base64Codec = useMemo(() => getBase64Codec(), []);

// Optional: track sub-phases for granular loading UI
const [phase, setPhase] = useState<'idle' | 'signing' | 'confirming'>('idle');

const { send: handleSwap, status, data: result, error } = useAction(
    async (signal, order: { transaction: string; requestId: string }) => {
        if (!signer) throw new Error('Connect a signing wallet to continue.');
        // 1. Decode the pre-built transaction from the API
        setPhase('signing');
        const txBytes = base64Codec.encode(order.transaction);
        const [signed] = await signer.signTransactions([
            getTransactionDecoder().decode(txBytes),
        ]);

        // 2. Submit signed transaction back to the API (not to the RPC)
        setPhase('confirming');
        const signedBase64 = base64Codec.decode(
            getTransactionEncoder().encode(signed),
        );
        return submitToAggregatorApi(
            { signedTransaction: signedBase64, requestId: order.requestId },
            { signal },
        );
    },
);

// status: 'idle' | 'running' | 'success' | 'error'
// phase: 'signing' | 'confirming' (granular sub-state for loading UI)
// result: API response on success
// error: rejection or API error
```

`useAction` handles the state machine (idle → sending → success/error). The `phase` useState is an optional app-specific detail for distinguishing "waiting for wallet popup" from "waiting for API confirmation" in the UI — it doesn't affect `useAction`'s lifecycle.

#### One-shot reads

Covered by **`useRequest`** — see [the one-shot requests section](#one-shot-requests-userequest) earlier. Auto-dispatches on mount / deps change, returns `{ data, error, status, isLoading, refresh }`, backed by `PendingRpcRequest.reactiveStore()` (a `ReactiveActionStore`) from [Prerequisites](#prerequisites).

```typescript
const { data: epoch, error, refresh } = useRequest(
    () => client.rpc.getEpochInfo(),
    [client],
);
```

When you want shared cache semantics across many components (dedupe, persistence, devtools, Suspense), opt into `useRequestSwr` or `useRequestQuery` from the [SWR](#swr-adapter-solanakit-reactswr) or [TanStack Query](#tanstack-query-adapter-solanakit-reactquery) adapters — same underlying Kit primitive, routed through the cache library.

For imperative one-offs (outside the render path), call the pending request directly:

```typescript
const client = useClient();
const epochInfo = await client.rpc.getEpochInfo().send();
```

## Third-party extensions

Any Kit plugin works with kit-react out of the box via `PluginProvider` — no React-specific wrapper needed from the plugin author. Plugin authors can optionally ship typed convenience hooks for better DX.

### Example: a DAS plugin package

A DAS package ships a Kit plugin and optionally convenience hooks:

**1. The kit plugin** (framework-agnostic, adds `client.das.*`):

```typescript
// @my-org/kit-plugin-das
export function dasPlugin(config: DasConfig): Plugin<{ das: DasClient }>;
```

**2. Usage with `PluginProvider`** — no React wrapper from the plugin author needed:

```tsx
import { KitClientProvider, PluginProvider, WalletProvider, RpcProvider } from '@solana/kit-react';
import { dasPlugin } from '@my-org/kit-plugin-das';

<KitClientProvider chain="solana:mainnet">
    <WalletProvider>
        <PluginProvider plugins={[dasPlugin({ endpoint: 'https://mainnet.helius-rpc.com/?api-key=...' })]}>
            <RpcProvider rpcUrl="..." rpcSubscriptionsUrl="...">
                <App />
            </RpcProvider>
        </PluginProvider>
    </WalletProvider>
</KitClientProvider>
```

After `PluginProvider`, any `useClient()` call in the subtree returns the DAS-extended client at runtime.

**3. Optional typed convenience hooks:**

```typescript
// @my-org/kit-react-das
import { useClientCapability, useRequest } from '@solana/kit-react';
import type { DasClient } from '@my-org/kit-plugin-das';

export function useAsset(address: Address) {
    const client = useClientCapability<DasClient>({
        capability: 'das',
        hookName: 'useAsset',
        providerHint: 'Usually supplied by <DasProvider>.',
    });
    return useRequest(() => client.das.getAsset(address), [client, address]);
}
```

Consumers just import `useAsset` — they never need to touch `useClient` or know about the underlying DAS plugin.

Note the choice of primitive. Plugins and cache libraries are **orthogonal axes of extensibility**: a plugin author shouldn't assume their users have installed SWR or TanStack Query, so the reference convenience hook is built on kit-react's native primitives (`useRequest` for one-shot reads, `useLiveData` / `useSubscription` for streams). That gives every consumer a working hook out of the box. Plugin authors who want to offer cache-integrated variants too can ship them under their own subpaths (`@my-org/kit-react-das/swr`, `.../query`) that peer-depend on the relevant cache library — the same pattern kit-react itself uses for its adapters. End users then pick the cache layer independently of which plugins they've installed.

### `useClientCapability` — runtime-checked third-party hooks

Core hooks like `useBalance` / `useSendTransaction` don't just cast the client with `useClient<T>()` — they also assert the required capabilities are installed and throw a consistently-formatted error when they aren't. That machinery is exported as `useClientCapability` so third-party hook authors get the same DX for free:

```typescript
function useClientCapability<TClient extends object>(options: {
    /** Single key or ordered list — each is checked via `key in client`. */
    capability: string | readonly string[];
    /** Hook name used as the subject of the error. */
    hookName: string;
    /** Free-text "how to fix" hint appended to the error. */
    providerHint: string;
}): Client<TClient>;
```

The TypeScript narrowing is still a caller-declared cast (same as `useClient<T>()`), but the runtime check makes the missing-provider failure loud at mount rather than deferring to a cryptic call-site crash. This is the recommended path for hook authors who want their users to see "useAsset() requires `client.das`. Usually supplied by `<DasProvider>`" rather than "Cannot read properties of undefined".

### `useClient<T>()` vs. `useClientCapability<T>()`

`useClient<T>()` (shown in [Client access](#client-access)) is a pure cast — no runtime check. Use it when you specifically don't want the runtime check (e.g. testing code inspecting the raw client, or a hook that tolerates missing capabilities). In production hooks that depend on a specific plugin being installed, reach for `useClientCapability` first so the missing-provider failure surfaces at mount with a typed message instead of a cryptic crash at the call site.

## SWR Adapter (`@solana/kit-react/swr`)

### Dependencies

```json
{
  "peerDependencies": {
    "@solana/kit-react": "^1.x",
    "swr": "^2.x"
  }
}
```

### Naming convention

Every hook in this adapter carries the `Swr` suffix (e.g. `useLiveSwr`, `useRequestSwr`, `useSendTransactionSwr`). The suffix makes the cache backing visible at every call site, avoids collisions with core hook names, and stays greppable. The [TanStack adapter](#tanstack-query-adapter-solanakit-reactquery) uses the `Query` suffix the same way.

### Generic bridge

Bridges a `LiveDataSpec<T>` (the same shape consumed by `useLiveData` and the stock live-data builders) into SWR's cache via `useSWRSubscription`:

```typescript
/**
 * Bridge a `LiveDataSpec<T>` into SWR's cache via `useSWRSubscription`.
 * Manages subscription lifecycle and error propagation.
 *
 * `spec` is the same framework-agnostic shape consumed by `useLiveData`
 * and `useLiveQuery`, so the stock live-data builders
 * (`createBalanceLiveData`, `createAccountLiveData`, …) and plugin-author
 * builders plug in directly. Pass `null` as the key to disable.
 */
function useLiveSwr<T>(
    key: SWRKey | null,
    spec: LiveDataSpec<unknown, unknown, T>,
): SWRResponse<T>;
```

Usage:

```tsx
// Route `useBalance`'s data source through SWR — every component reading
// `['balance', address]` dedupes into one subscription and participates
// in SWR's cache invalidation / devtools / persistence.
const { data: balance, error, isLoading } = useLiveSwr(
    ['balance', address],
    createBalanceLiveData(client, address),
);

// Custom live data — same bridge, arbitrary RPC + subscription pair.
const { data: gameState } = useLiveSwr(
    ['gameState', gameAddress],
    {
        rpcRequest: client.rpc.getAccountInfo(gameAddress),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(gameAddress),
        rpcValueMapper: (v) => parseGameState(v.value),
        rpcSubscriptionValueMapper: (v) => parseGameState(v),
    },
);
```

### Subscription-only bridge

For streams without an RPC fetch counterpart, `useSubscriptionSwr` routes a `ReactiveStreamSource<T>` (same duck-type consumed by core's `useSubscription`) through SWR's cache. Subscriptions don't have meaningful initial-fetch or persistence semantics — the cache win is dedup across components and devtools visibility into which streams are active. Envelope unwrapping matches core's `useSubscription`.

```typescript
/**
 * Bridge a `ReactiveStreamSource<T>` into SWR's cache via
 * `useSWRSubscription`. `SolanaRpcResponse`-shaped notifications are
 * unwrapped the same way as core's `useSubscription` — `data` is the
 * inner value.
 */
function useSubscriptionSwr<T>(
    key: SWRKey | null,
    source: ReactiveStreamSource<T>,
): SWRResponse<UnwrapRpcResponse<T>>;
```

Usage:

```tsx
const { data: slot } = useSubscriptionSwr(
    ['slot'],
    client.rpcSubscriptions.slotNotifications(),
);
```

### Mutation hooks

Same underlying `client.sendTransaction()` / `client.sendTransactions()` as core, but wired through SWR's `useSWRMutation` for cache revalidation. Distinct names from core's `useSendTransaction` / `useSendTransactions` — the return shape is SWR's, not kit-react's `ActionState`.

```typescript
/**
 * Send a single transaction with SWR mutation support.
 * Revalidates the provided keys on success.
 */
function useSendTransactionSwr(options?: {
    revalidateKeys?: SWRKey[];
}): SWRMutationResponse<SuccessfulSingleTransactionPlanResult>;

/**
 * Send one or more transactions with SWR mutation support.
 */
function useSendTransactionsSwr(options?: {
    revalidateKeys?: SWRKey[];
}): SWRMutationResponse<TransactionPlanResult>;
```

Usage:

```tsx
import { useSendTransactionSwr } from '@solana/kit-react/swr';

const { trigger, isMutating, error } = useSendTransactionSwr({
    revalidateKeys: [['balance', sourceAddress]],
});

await trigger(getTransferInstruction({ source, destination, amount }));
// SWR automatically revalidates the balance query after success
```

Implementation:

```tsx
import { useClientCapability } from '@solana/kit-react';
import useSWRMutation from 'swr/mutation';

function useSendTransactionSwr(options?: { revalidateKeys?: SWRKey[] }) {
    const client = useClientCapability<ClientWithSendTransaction>({
        capability: 'sendTransaction',
        hookName: 'useSendTransactionSwr',
        providerHint: 'Mount <RpcProvider> or <LiteSvmProvider>.',
    });

    return useSWRMutation(
        'sendTransaction',
        (_key, { arg }: { arg: Parameters<typeof client.sendTransaction>[0] }) =>
            client.sendTransaction(arg),
        {
            onSuccess() {
                options?.revalidateKeys?.forEach((key) => mutate(key));
            },
        },
    );
}
```

The adapter is thin — it delegates entirely to `client.sendTransaction()` and wires up `useSWRMutation`'s lifecycle around it.

### Generic action bridge

`useActionSwr` mirrors core's `useAction` but routes through `useSWRMutation`, so the operation's lifecycle plugs into SWR's cache invalidation and devtools. Useful for custom mutations (wallet sign flows, off-chain API calls, compound sign-then-send) where you want cache-library integration without reaching past kit-react's API.

```typescript
/**
 * Bridge any async operation into SWR's mutation primitive. The generic
 * counterpart to `useSendTransactionSwr`.
 */
function useActionSwr<TArgs extends unknown[], TResult>(
    key: SWRKey,
    fn: (...args: TArgs) => Promise<TResult>,
    options?: { revalidateKeys?: SWRKey[] },
): SWRMutationResponse<TResult, unknown, SWRKey, TArgs>;
```

Usage:

```tsx
const { trigger, isMutating } = useActionSwr(
    'sign-payload',
    async (payload: Uint8Array) => signer.signMessage(payload),
    { revalidateKeys: [['session']] },
);
```

### One-shot reads

Core provides `useRequest` for one-shot requests. Use `useRequestSwr` when you want SWR's cache (shared across components, persistence, Suspense mode):

```typescript
// Core — no cache sharing, per-hook state
const { data } = useRequest(() => client.rpc.getEpochInfo(), [client]);

// SWR-backed — cache hits across components, persistence, Suspense
const { data } = useRequestSwr(['epochInfo'], () => client.rpc.getEpochInfo());
```

## TanStack Query Adapter (`@solana/kit-react/query`)

### Dependencies

```json
{
  "peerDependencies": {
    "@solana/kit-react": "^1.x",
    "@tanstack/react-query": "^5.x"
  }
}
```

### Naming convention

Every hook in this adapter carries the `Query` suffix (e.g. `useLiveQuery`, `useRequestQuery`, `useSendTransactionQuery`). Matches TanStack Query's own ecosystem vocabulary (`useQuery`, `useInfiniteQuery`, `useSuspenseQuery` are all named with `Query`) and avoids collisions with core hook names — core's generic live-data hook is `useLiveData`, not `useLiveQuery`.

### Generic bridge

Bridges a `LiveDataSpec<T>` into TanStack Query's cache — initial fetch via `queryFn`, ongoing updates pushed via `queryClient.setQueryData`. Same spec shape as `useLiveData` / `useLiveSwr`:

```typescript
/**
 * Bridge a `LiveDataSpec<T>` into TanStack Query's cache.
 * Initial fetch via queryFn, ongoing updates via subscription → setQueryData.
 *
 * `spec` is the same framework-agnostic shape consumed by `useLiveData`
 * and `useLiveSwr`, so the stock live-data builders
 * (`createBalanceLiveData`, `createAccountLiveData`, …) and plugin-author
 * builders plug in directly.
 */
function useLiveQuery<T>(
    key: QueryKey,
    spec: LiveDataSpec<unknown, unknown, T>,
    options?: UseQueryOptions,
): UseQueryResult<T>;
```

Usage:

```tsx
// Route `useBalance`'s data source through TanStack Query — every
// component reading `['balance', address]` dedupes into one subscription
// and participates in TanStack's cache invalidation / devtools /
// Suspense.
const { data: balance, error, isLoading } = useLiveQuery(
    ['balance', address],
    createBalanceLiveData(client, address),
);

// Custom live data — same bridge, arbitrary RPC + subscription pair.
const { data: gameState } = useLiveQuery(
    ['gameState', gameAddress],
    {
        rpcRequest: client.rpc.getAccountInfo(gameAddress),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(gameAddress),
        rpcValueMapper: (v) => parseGameState(v.value),
        rpcSubscriptionValueMapper: (v) => parseGameState(v),
    },
);
```

### Subscription-only bridge

For streams without an RPC fetch counterpart, `useSubscriptionQuery` routes a `ReactiveStreamSource<T>` through TanStack's cache. The subscription pushes updates via `queryClient.setQueryData` — same dedup / devtools benefits as `useLiveQuery`, just without an initial `queryFn` fetch (the first value arrives from the first notification). Envelope unwrapping matches core's `useSubscription`.

```typescript
/**
 * Bridge a `ReactiveStreamSource<T>` into TanStack Query's cache.
 * `SolanaRpcResponse`-shaped notifications are unwrapped the same way
 * as core's `useSubscription`.
 */
function useSubscriptionQuery<T>(
    key: QueryKey,
    source: ReactiveStreamSource<T>,
    options?: UseQueryOptions,
): UseQueryResult<UnwrapRpcResponse<T>>;
```

Usage:

```tsx
const { data: slot } = useSubscriptionQuery(
    ['slot'],
    client.rpcSubscriptions.slotNotifications(),
);
```

### Mutation hooks

Same underlying `client.sendTransaction()` / `client.sendTransactions()` as core, wired through TanStack's `useMutation` for automatic cache invalidation, optimistic updates, and devtools visibility. Distinct names from core's — the return shape is TanStack's `UseMutationResult`, not kit-react's `ActionState`.

```typescript
/**
 * Send a single transaction with TanStack mutation support.
 * Invalidates the provided query keys on success.
 */
function useSendTransactionQuery(options?: {
    onSuccess?: (result: SuccessfulSingleTransactionPlanResult) => void;
    invalidateKeys?: QueryKey[];
}): UseMutationResult<SuccessfulSingleTransactionPlanResult>;

/**
 * Send one or more transactions with TanStack mutation support.
 */
function useSendTransactionsQuery(options?: {
    onSuccess?: (result: TransactionPlanResult) => void;
    invalidateKeys?: QueryKey[];
}): UseMutationResult<TransactionPlanResult>;
```

Usage:

```tsx
import { useSendTransactionQuery } from '@solana/kit-react/query';

const { mutateAsync, isPending, error } = useSendTransactionQuery({
    invalidateKeys: [['balance', sourceAddress]],
    onSuccess(result) {
        console.log('Confirmed:', result.signature);
    },
});

// Pass an instruction — the hook calls client.sendTransaction() internally
await mutateAsync(getTransferInstruction({ source, destination, amount }));

// Fluent program client API works too — pass the instruction, not .sendTransaction()
await mutateAsync(client.system.instructions.transfer({ source, destination, amount }));

// TanStack automatically invalidates the balance query after success
```

Implementation:

```tsx
import { useClientCapability } from '@solana/kit-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

function useSendTransactionQuery(options?: {
    onSuccess?: (result: SuccessfulSingleTransactionPlanResult) => void;
    invalidateKeys?: QueryKey[];
}) {
    const client = useClientCapability<ClientWithSendTransaction>({
        capability: 'sendTransaction',
        hookName: 'useSendTransactionQuery',
        providerHint: 'Mount <RpcProvider> or <LiteSvmProvider>.',
    });
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: Parameters<typeof client.sendTransaction>[0]) =>
            client.sendTransaction(input),
        onSuccess(result) {
            options?.onSuccess?.(result);
            options?.invalidateKeys?.forEach((key) =>
                queryClient.invalidateQueries({ queryKey: key }),
            );
        },
    });
}
```

The adapter is thin — it delegates entirely to `client.sendTransaction()` and wires up `useMutation`'s lifecycle around it.

### Generic action bridge

`useActionQuery` mirrors core's `useAction` but routes through TanStack's `useMutation`, so the operation plugs into cache invalidation, optimistic updates, and devtools. The generic counterpart to `useSendTransactionQuery`.

```typescript
/**
 * Bridge any async operation into TanStack's mutation primitive.
 */
function useActionQuery<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options?: {
        onSuccess?: (result: TResult) => void;
        invalidateKeys?: QueryKey[];
    },
): UseMutationResult<TResult, unknown, TArgs>;
```

Usage:

```tsx
const { mutateAsync, isPending } = useActionQuery(
    async (payload: Uint8Array) => signer.signMessage(payload),
    { invalidateKeys: [['session']] },
);
```

### One-shot reads

Core provides `useRequest`. Use `useRequestQuery` when you want TanStack's cache (dedupe, Suspense, devtools, invalidation):

```typescript
// Core — no cache sharing, per-hook state
const { data } = useRequest(() => client.rpc.getEpochInfo(), [client]);

// TanStack-backed — shared cache, Suspense-capable, devtools-visible
const { data } = useRequestQuery(['epochInfo'], () => client.rpc.getEpochInfo());
```

## What Each Layer Provides

| Feature | Core | SWR Adapter | TanStack Adapter |
|---------|------|-------------|------------------|
| Providers | ✅ | — | — |
| Wallet hooks | ✅ (`@solana/kit-react/wallet` subpath) | — | — |
| `useBalance`, `useAccount` | ✅ (ReactiveStreamStore → useSyncExternalStore) | ✅ (SWR cache) | ✅ (TanStack cache) |
| Generic live data | `useLiveData` | `useLiveSwr` | `useLiveQuery` |
| Subscription-only bridge | `useSubscription` | `useSubscriptionSwr` | `useSubscriptionQuery` |
| One-shot reads | `useRequest` (ReactiveActionStore, auto-dispatched) | `useRequestSwr` (SWR cache) | `useRequestQuery` (TanStack cache) |
| Send transactions | `useSendTransaction` / `useSendTransactions` (ActionState) | `useSendTransactionSwr` / `useSendTransactionsSwr` (SWR mutation) | `useSendTransactionQuery` / `useSendTransactionsQuery` (TanStack mutation) |
| Generic action bridge | `useAction` | `useActionSwr` | `useActionQuery` |
| Suspense | — | ✅ | ✅ |
| Devtools | — | ✅ | ✅ |
| Cross-component dedup | — (each hook has its own store; lift into context to share) | SWR built-in (by key) | TanStack built-in (by query key) |

## Design Decisions

**Headless by design — no UI.** kit-react ships providers, hooks, and reactive state primitives; it does not ship buttons, modals, wallet pickers, connect flows, or any other rendered components. Wallet-standard discovery and the `walletSigner` plugin are the deepest this library goes — the app (or a higher-level UI library like wallet-ui, connectorkit, or a framework-kit-style opinionated bundle) owns how that state is presented. Rationale: UI is where apps differ most, and a kit-react modal would compete with every downstream library that wants to own the visual layer, while solving a problem the hooks already solve at a lower level. Keeping kit-react headless lets UI libraries build on top instead of around, and lets teams with design-system constraints skip kit-react's opinions without giving up the state machinery.

**Client is an implementation detail.** Consumers use providers and hooks. `useClient()` is an escape hatch for power users, not the primary API. This matches how wagmi hides its core under React hooks.

**No per-RPC-method hooks.** Kit has dozens of RPC methods. Wrapping each in a hook adds maintenance surface without adding logic — `useRequest(() => client.rpc.getEpochInfo(), [client])` is the generic escape hatch and reads cleanly at the call site. A dedicated `useGetEpochInfo()` would save exactly the body of that factory function, at the cost of a ~50-hook surface to maintain in lockstep with Kit's RPC spec.

**Named hooks only for live data.** `useBalance` and `useAccount` earn their existence by hiding the RPC + subscription pairing, slot dedup, and response mapping. These are Solana-specific domain knowledge that developers shouldn't need to figure out. `useAccount` additionally hides the RPC encoding format and the `parseBase64RpcAccount` bridge between raw RPC responses and Kit's `Account` type, and progressively discloses decoding via an optional `decoder` argument.

**One-shot reads in core via `useRequest`.** Earlier drafts delegated one-shot reads entirely to SWR / TanStack on the reasoning that "plain React doesn't have a good data-fetching primitive." Once Kit ships `PendingRpcRequest.reactiveStore(): ReactiveActionStore` with eager auto-dispatch on creation, that reasoning stops applying — the primitive exists, one layer down. `useRequest` bridges the action store into `useSyncExternalStore` and surfaces `{ data, error, status, refresh }` with the same stale-while-revalidate semantics that the subscription hooks give. Consumers who want shared cache / Suspense / devtools still opt into the SWR / TanStack adapters; those who don't get a first-class read hook without pulling in a cache library.

**Read shape vs. send shape — `useRequest` vs. `useAction`.** Two separate hooks rather than one with a flag, because the two use cases want different affordances: `useRequest` consumes an eager-dispatching `.reactiveStore()` and returns a read-oriented shape (`data`, `refresh`); `useAction` wraps any async function via `createReactiveActionStore` (neutral on initiation) and returns a send-oriented shape (`send`, `reset`, `isIdle`). Both wrap `ReactiveActionStore` internally, but collapsing them into one hook would force every caller to choose which half to ignore at every site. Plugin authors whose pending objects expose `.reactiveStore(): ReactiveActionStore` plug straight into `useRequest` via the `ReactiveActionSource<T>` duck-type; anything else (a user-triggered operation, a custom async call) reaches for `useAction`.

**Duck-typed orthogonality boundaries.** The generic hooks (`useRequest`, `useSubscription`, `useLiveData`, `useLiveSwr`, `useLiveQuery`) all accept the smallest possible input shape: `ReactiveActionSource<T>` (anything with `.reactiveStore(): ReactiveActionStore<[], T>`), `ReactiveStreamSource<T>` (anything with `.reactiveStore({ abortSignal }): ReactiveStreamStore<T>`), or `LiveDataSpec<T>` (the RPC + subscription + mappers, minus signal). Kit's `PendingRpcRequest` / `PendingRpcSubscriptionsRequest` satisfy these by design, but so does any plugin-authored pending object that follows the same convention — no patching kit-react, no registering types, no wrapper layer. This is the same pattern used by `subscribeTo<Capability>`: the framework layer publishes a duck-type; the plugin layer conforms.

**Adapters integrate, not replace.** The SWR and TanStack adapters bridge kit-react's reactive stores into those libraries' cache layers — `useSWRSubscription` for streams, `setQueryData` for live updates, `useSWRMutation` / `useMutation` for sends — plus `useRequestSwr` / `useRequestQuery` for cache-backed one-shot reads. They don't re-implement the Kit-side state machines; they pipe `subscribe` / `getUnifiedState` (streams) / `getState` + `dispatch` (actions) into the cache library's existing APIs.

**Plugin React hooks are optional.** Any Kit plugin works with kit-react through `PluginProvider` + core's generic hooks: `useRequest(() => client.myPlugin.foo())`, `useLiveData(...)`, `useSubscription(...)`, `useAction(...)`, or the `useClient()` escape hatch for anything else. Plugin authors don't need to ship React bindings for their plugin to be usable — core provides enough primitives for consumers to build whatever hook shape they need against any plugin. Typed convenience hooks (see [Third-party extensions](#third-party-extensions)) are a DX upgrade, not a prerequisite — they let plugin authors reduce boilerplate and attach a stable error story via `useClientCapability`, but the consumer-facing functionality is available the moment the plugin is installed.

**`{ data, error, status, retry }` rather than Suspense / Error Boundaries.** Live-data hooks return a reactive snapshot shape (mirroring Kit's `ReactiveState<T>` with an added `'disabled'` variant) instead of suspending or throwing.

*Subscriptions can't suspend.* Suspense's contract is "throw a promise that eventually resolves or rejects" — one-shot — and subscriptions don't fit that model: they never "resolve" in Suspense's sense, they keep emitting updates. `useSyncExternalStore` is the React-team-supplied primitive for this class of state and is deliberately incompatible with Suspense. The rest of the ecosystem makes the same call: TanStack Query's `useSuspenseQuery` only wraps one-shot fetches; its subscription path uses `{ data, isLoading, error }`. Consumers who specifically want Suspense for one-shot RPC reads opt in via the SWR / TanStack adapters, both of which have Suspense modes — kit-react owns the live-data primitives that fundamentally can't suspend.

*Mutations can't suspend either.* You can't throw a promise from an event handler, and every mutation primitive in the ecosystem (TanStack's `useMutation`, SWR's `useSWRMutation`) returns the same `{ status, data, error }` shape. `useSendTransaction` / `useAction` follow that convention.

*Error Boundaries remain a valid backstop, but not the primary error channel.* Boundaries catch *unexpected* errors (bugs, crashes) and remain useful above the tree. Expected errors (RPC down, signature rejected, wallet disconnected mid-fetch) usually need specific UI branches ("Try again", "Switch RPC", "Reconnect") — returning `error` + `retry()` reactively lets the component branch on the error shape and recover in-place without remounting.

**First-class retry.** Every live-data hook returns a `retry()` function drawn from the underlying `ReactiveStore.retry` — stable identity, safe as an `onClick`. Retry is end-to-end: Kit's stores tear down the broken stream, transition through `status: 'retrying'` preserving the last known `data`, re-open the WebSocket (and for named hooks, re-run the initial RPC fetch), and return to `loaded` or `error` as appropriate. The React bridge adds no layer on top — consumers writing `<button onClick={retry}>Retry</button>` get correct behavior without a `useCallback` wrapper or external state.

**SSR-safe by default.** Every provider renders on the server without throwing, and every hook returns a hydration-stable "not yet available" snapshot during SSR. The wallet plugin explicitly ships a server stub (`status === 'pending'`, empty `wallets`, throwing actions) so its first render matches on both server and client. The reactive hooks (`useBalance`, `useAccount`, `useTransactionConfirmation`, `useLiveQuery`, `useSubscription`, `useRequest`) skip the reactive-store factory entirely on non-browser builds — they return `{ status: 'loading', data: undefined, isLoading: true }` without firing HTTP or opening WebSockets, then the real store kicks in on the client. This skip is load-bearing for `useRequest`: `PendingRpcRequest.reactiveStore()` auto-dispatches on creation (same semantics as `PendingRpcSubscriptionsRequest.reactiveStore()`), so not calling it on the server is what prevents a server-side fetch. Action hooks (`useSendTransaction`, `useAction`, the wallet action hooks) are already safe: they build action stores via `createReactiveActionStore(fn)` directly (which stays neutral on initiation), so nothing fires until `dispatch()` is called, which doesn't happen during SSR since it's event-triggered. We deliberately don't prefetch on the server even though we could: on-chain state moves fast enough that any prefetched value would usually mismatch the first client snapshot, and the hydration failure is worse than an extra loading flicker. For per-request clients (Next.js app router, Remix), `KitClientProvider`'s `client` prop accepts a pre-built client whose lifecycle the caller owns.

**Errors are surfaced as `unknown`, narrowed with Kit helpers.** Kit throws `SolanaError` with stable error codes; the wallet plugin throws `WalletStandardError` with the same pattern. Hooks propagate errors through `LiveQueryResult.error` / `ActionState.error` / `RequestResult.error` as `unknown`, and consumers narrow in render branches via `isSolanaError(e, SOLANA_ERROR__WALLET__USER_REJECTED)` / `isWalletStandardError(e, ...)`:

```tsx
const { error, retry } = useBalance(address);
if (error) {
    if (isSolanaError(error, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR)) {
        return <div>RPC unreachable. <button onClick={retry}>Retry</button></div>;
    }
    return <div>Unexpected error.</div>;
}
```

kit-react doesn't re-wrap or coerce errors — the original `SolanaError` / `WalletStandardError` passes through so code narrowing against Kit's error codes works uniformly across the library and downstream of it.

**Composable providers only.** A single `KitClientProvider` at the root creates the client and publishes the chain. Every other provider maps to a Kit plugin, and their nesting order is the plugin chain order. No bundle provider — one way to do things, no cliff when you need to customize. `PluginProvider` allows any Kit plugin to participate without shipping a React-specific wrapper.

**Explicit root, not implicit.** An earlier draft had `WalletProvider` lazily create the client and chain context when no ancestor was present, so the common case could skip a provider. In practice that made the provider hierarchy harder to reason about — debugging "where did this client come from?" meant tracing which wrapper silently created it. Making `KitClientProvider` a required explicit root costs one extra line in the common case and makes the client's origin obvious.

**`ChainIdentifier`, not just `SolanaChain`.** The chain prop on `KitClientProvider` accepts `SolanaChain | (IdentifierString & {})`. Known Solana chains (`"solana:mainnet"`, etc.) autocomplete as literals; any other wallet-standard-shaped identifier (`${string}:${string}`) is accepted as an escape hatch for custom chains and L2s. The `& {}` is the canonical TS trick for preserving literal autocomplete alongside a wider string-template type.

**No dedicated transfer/token/stake hooks.** `useSendTransaction()` is generic — it accepts any instruction, instruction plan, or transaction message. Dedicated hooks like `useSolTransfer()` or `useSplToken()` would be thin wrappers that don't add meaningful logic. They can be built on top by higher-level libraries.

**Transaction confirmation is subscription-backed.** `useTransactionConfirmation` uses `signatureNotifications` + `getSignatureStatuses` with slot-based dedup, rather than polling. This fits the core's philosophy that named hooks earn their place by hiding RPC + subscription pairing.

**Signer hooks duck-type on a per-capability subscribe convention, not on wallet state.** Earlier drafts had `usePayer` / `useIdentity` reach for `client.wallet.subscribe` directly to stay reactive. That coupled core signer hooks to the wallet plugin's type — a smell, since any reactive plugin (not just wallet) could install a dynamic `payer` or `identity`. The current design instead defines a per-capability subscribe convention: whoever installs `client.payer` can optionally install `client.subscribeToPayer(listener)` alongside it (same for `identity`). The hook observes that sibling if present, otherwise falls back to a no-op subscribe. This keeps the core hooks wallet-agnostic, supports future reactive plugins for free, and is a much smaller surface than a global `client.subscribe` primitive (which would force every reactive plugin to share one bus and cause over-rendering). Static plugins like `payer()` / `identity()` / `signer()` (mounted via `PayerProvider` / `IdentityProvider` / `SignerProvider`) participate implicitly by not installing a subscribe hook — the value never changes, so nothing needs to fire.

**Single chain per `KitClientProvider`.** Each `KitClientProvider` is scoped to one chain — discovery, connection, and signer creation all depend on it. Apps that need multiple chains (e.g. a mainnet trading section and a devnet testing section) use separate `KitClientProvider`s, which means separate clients and separate wallet connections. This is the correct behavior: a wallet that supports `solana:mainnet` may not support a different chain like `l2:mainnet`, so you can't safely share a connection across chains.

## Future directions

Items explicitly considered during design and deferred. None are blocking, but each has a concrete motivation that may trigger revisiting.

### Promote the `subscribeTo<Capability>` producer-side helper to kit-core

The consumer-facing shape (see [Signer access](#signer-access)) already lives in Kit — `ClientWithSubscribeToPayer` / `ClientWithSubscribeToIdentity` are exported from `@solana/kit`, and kit-react's `usePayer` / `useIdentity` duck-type against them. What's *not* yet shared is the **producer-side** machinery every reactive plugin needs to install a `subscribeTo<Capability>` hook: a listener registry, unsubscribe idempotency, and safe iteration during notify. Today `kit-plugin-wallet` hand-rolls this by forwarding its internal wallet store's `subscribe`; a second reactive plugin would have to re-derive the same ~20 lines of glue around `@solana/subscribable`'s existing `DataPublisher` / `ReactiveStore` primitives.

If a second reactive plugin appears (e.g. a relayer plugin whose `payer` rotates), graduate the producer-side helper to kit-core:

```typescript
// Speculative kit-core API
function createCapabilityChangeNotifier(): {
    subscribe: (listener: () => void) => () => void;
    notify: () => void;
};
```

Until then, producers re-implement ad-hoc; consumers already have the types they need.

### Batched live-query hook

A hook like `useBalances([addr1, addr2, addr3])` that subscribes to multiple accounts in one call (analogous to wagmi's `useContracts`) is a common ask. It's deferred, not rejected.

Solana's `accountSubscribe` RPC method is one-at-a-time — there's no WebSocket-level batching to exploit. But a batched hook would still offer two things a fan-out of `useBalance` can't:

1. **Rules-of-hooks ergonomics.** `useBalance` inside a `.map()` over a dynamic list is illegal. A batched hook makes variable-length lists expressible.
2. **Batched initial read.** `getMultipleAccounts` fetches up to 100 accounts in one RPC call. A batched hook could seed N per-account stores from a single initial fetch, then fan out to N `accountSubscribe` calls for live updates.

The upstream primitive (`createReactiveStoreWithInitialValueAndSlotTracking` in `@solana/kit`) is 1:1 by design — one RPC request + one subscription → one store. A batched hook needs either a new upstream primitive (e.g. `createReactiveStoreWithBatchedInitialValuesAndSlotTracking`) or a variant of the existing one that accepts a pre-fetched initial value instead of performing the fetch itself.

Deferred until there's a concrete use case. The rules-of-hooks argument is the stronger motivator — revisit when someone hits it.

### Observe external writes to `WalletStorage`

The wallet plugin's storage layer is write-through today: it persists the active wallet selection, but doesn't watch for external writes. If `WalletStorage` gained an optional `subscribe` method (matching the pattern used by Zustand's `persist` and TanStack Query's storage adapters), the plugin could react to cross-tab writes or sibling-provider changes and reconcile its in-memory state without a reload. Two motivating cases:

1. **Cross-tab sync.** User connects in tab A; tab B picks up the selection without the user re-prompting.
2. **Sibling-provider sync within one app.** Two `KitClientProvider`s in the same tree sharing a storage key could propagate wallet selection across them (each still verifies chain support independently — storage propagates the selection, not the connection).

Plain `localStorage` (no `subscribe`) would continue to work unchanged — callers opt in by supplying a storage adapter that exposes `subscribe`. Deferred until a concrete product use case appears; both motivators are nice-to-have, neither is blocking.

## Appendix: Comparisons

The rest of this document compares `kit-react` with the existing React libraries in the Solana ecosystem and with the hand-rolled primitives the [Kit example React app](https://github.com/anza-xyz/kit/tree/main/examples/react-app) uses today. The detail here is for reviewers who want to understand exactly what this proposal does and doesn't cover relative to the tools developers already know. It's not required reading to understand the design.

### framework-kit

[`framework-kit`](https://github.com/solana-foundation/framework-kit) is a feature-complete React library for Solana built on a different architecture (`@solana/client` + Zustand + SWR). `kit-react` is not a replacement — it's a lower-level foundation that framework-kit (or similar libraries) could build on top of.

#### What kit-react covers

All of framework-kit's core functionality is covered:

| Area | framework-kit | kit-react |
|------|--------------|-----------|
| Wallet connection | `useWallet`, `useWalletSession`, `useConnectWallet`, `useDisconnectWallet` | `useWalletStatus`, `useConnectedWallet`, `useConnectWallet`, `useDisconnectWallet` |
| Wallet discovery | Via `autoDiscover()` + connectors | `useWallets()` (wallet-standard via plugin) |
| Auto-connect | `SolanaProvider` walletPersistence config | `WalletProvider` props (delegated to kit-plugin-wallet) |
| Balance | `useBalance()` (SWR polling) | `useBalance()` (subscription-backed) |
| Account data | `useAccount()` | `useAccount()` with optional decoder |
| Send transaction | `useSendTransaction()` | `useSendTransaction()` |
| Signature tracking | `useSignatureStatus()` + `useWaitForSignature()` | `useTransactionConfirmation()` (unified, subscription-backed) |
| Chain/cluster | `useClusterState()`, `useClusterStatus()` | `useChain()` + provider props |
| Client access | `useClientStore(selector)` | `useClient()` |

#### Intentional gaps

These framework-kit features are omitted by design, not oversight:

- **Dedicated transfer/token/stake hooks** (`useSolTransfer`, `useSplToken`, `useWrapSol`, `useStake`) — covered by `useSendTransaction()` + the relevant instruction. Higher-level libraries can add these.
- **Per-method one-shot RPC hooks** (`useProgramAccounts`, `useLookupTable`, `useNonceAccount`, `useLatestBlockhash`, `useSimulateTransaction`) — covered generically by `useRequest(() => client.rpc.X(...), deps)` rather than one named hook per RPC method. Avoids the maintenance surface of dozens of thin wrappers and stays aligned with Kit's granular RPC surface.
- **Wallet modal state** (`useWalletModalState`, `WalletConnectionManager`) — UI concern, left to consumer or UI libraries.
- **SWR query infrastructure** (`useSolanaRpcQuery`, query key scoping) — each cache library handles this natively.

#### What kit-react adds

Features that framework-kit does not provide:

- **Cache-library agnostic** — SWR and TanStack adapters, not locked to one.
- **`useAccount` with decoder** — progressive disclosure of typed account decoding.
- **`useLiveData`** — generic subscription-backed queries for any RPC + subscription pair.
- **`useSubscription`** — raw subscription hook for subscription-only data.
- **`PluginProvider`** — any Kit plugin works without a React-specific wrapper.
- **`PayerProvider` / `IdentityProvider` / `SignerProvider`** — separate payer, identity, or both from wallet (backed by `@solana/kit-plugin-signer`).
- **`KitClientProvider`** — explicit root that creates the Kit client and publishes the chain, so the provider hierarchy is traceable without hidden wrappers.
- **`LiteSvmProvider`** — drop-in testing provider backed by a local SVM.
- **Granular wallet hooks** — `useWallets()`, `useWalletStatus()`, `useConnectedWallet()` subscribe to only the slice they need.

### connectorkit

[`connectorkit`](https://github.com/nicholasgasior/connectorkit) (`@solana/connector`) is a production wallet connection library with headless UI components, multi-transport support (WalletConnect, Mobile Wallet Adapter), legacy `@solana/web3.js` compatibility, and devtools. kit-react provides the core primitives that connectorkit could build on top of.

#### What kit-react covers

| Area | connectorkit | kit-react |
|------|-------------|-----------|
| Wallet discovery | `useWalletConnectors()` (connector metadata) | `useWallets()` (UiWallet objects) |
| Wallet status | `useWallet()` (discriminated union) | `useWalletStatus()` + `useConnectedWallet()` |
| Connect / disconnect | `useConnectWallet()` / `useDisconnectWallet()` | `useConnectWallet()` / `useDisconnectWallet()` |
| Auto-connect | Config-driven, 200ms delay, silent-first | `WalletProvider` `autoConnect` prop (plugin-level) |
| Balance | `useBalance()` (polling + cache) | `useBalance()` (subscription-backed) |
| Sign message | Via `signer.signMessage()` | `useSignMessage()` |
| Sign In With Solana | Not built-in | `useSignIn()` |
| Transaction sending | `useTransactionSigner()` / `useKitTransactionSigner()` | `useSendTransaction()` (instruction-plan lifecycle) |
| Chain/cluster | `useCluster()` with persistence + UI | `useChain()` + provider props |
| Client access | `useConnectorClient()` | `useClient()` |

#### What connectorkit adds on top

These are app-layer and transport-layer concerns that kit-react intentionally leaves to higher-level libraries:

- **Headless UI components** — `WalletListElement`, `BalanceElement`, `TokenListElement`, `TransactionHistoryElement`, `ClusterElement`, `AccountElement`, `DisconnectElement` (all render-prop based)
- **Multi-transport wallet support** — WalletConnect (QR codes, deep links) and Mobile Wallet Adapter alongside browser extensions, with branded connector IDs to distinguish transports to the same wallet
- **Legacy compatibility** — `createWalletAdapterCompat()` for `@solana/web3.js` transaction API
- **Token list / transaction history** — `useTokens()`, `useTransactions()` with shared query cache
- **Cluster management UI** — persistence, explorer URL resolution, formatted addresses, clipboard utils
- **Event system** — `wallet:connected`, `transaction:signed`, etc. for analytics
- **Error boundaries** — recoverable errors, retry logic, fallback UI
- **Devtools** — `@solana/connector-debugger` with transaction inspection

#### How connectorkit would build on kit-react

Connectorkit would wrap kit-react's providers and compose its hooks on top of kit-react's primitives:

```tsx
// Connectorkit disables plugin-level persistence and auto-connect,
// then implements its own with richer storage and reconnect logic.
function ConnectorProvider({ config, children }) {
    const [chain, setChain] = useState(config.initialCluster);

    return (
        <KitClientProvider chain={chain}>
            <WalletProvider autoConnect={false} storage={null}>
                <ConnectorAutoConnect config={config}>
                    {children}
                </ConnectorAutoConnect>
            </WalletProvider>
        </KitClientProvider>
    );
}
```

Key integration points:

- **`storage: null`** disables all plugin-level reads and writes, giving connectorkit a clean slate for its own versioned storage (`connector-kit:v1:wallet`) that stores full connector IDs (e.g. `mwa:phantom` vs `wallet-standard:phantom`)
- **`autoConnect: false`** skips plugin auto-reconnect (status goes `'pending'` → `'disconnected'` immediately), so connectorkit controls the full state machine — its own 200ms delay, silent-first with interactive fallback, etc.
- **`useWallets()`**, **`useConnectWallet()`**, **`useConnectedWallet()`**, **`useWalletStatus()`** are the building blocks for connectorkit's hooks, wrapped with its own event emission, error recovery, and connector ID mapping
- **`PluginProvider`** can initialize WalletConnect or MWA as additional wallet-standard wallets before they're needed
- **`useClient()`** provides access for connectorkit's legacy adapter layer and transaction signing hooks

### wallet-ui

[`wallet-ui`](https://github.com/nicholasgasior/wallet-ui) (`@wallet-ui/react`) is a simpler wallet library — a modern, Wallet-Standard-native replacement for the old wallet-adapter. It provides wallet connection hooks, account/cluster persistence, and headless UI components (dropdowns, modals, wallet lists) styled via data attributes and optional Tailwind CSS.

#### What kit-react covers

Wallet-UI has significant overlap with kit-react + kit-plugin-wallet. The core state management, wallet discovery, connection, and persistence are all handled:

| Area | wallet-ui | kit-react |
|------|----------|-----------|
| Wallet discovery | `useWalletUiWallets()` | `useWallets()` |
| Bundled wallet state | `useWalletUi()` | `useWallets()` + `useConnectedWallet()` + `useWalletStatus()` |
| Connect / disconnect | `useWalletUiWallet({ wallet })` | `useConnectWallet()` / `useDisconnectWallet()` |
| Selected account | `useWalletUiAccount()` | `useConnectedWallet()` |
| Transaction signer | `useWalletUiSigner({ account })` | `useConnectedWallet().signer` |
| Cluster selection | `useWalletUiCluster()` | `useChain()` + provider props |
| Account persistence | Nanostores persistent atom (`wallet-ui:account`) | kit-plugin-wallet storage (`kit-wallet`) |
| Cluster persistence | Nanostores persistent atom (`wallet-ui:cluster`) | Not in kit-react (app-layer concern) |

#### What wallet-ui adds on top

Wallet-UI's unique contribution is its **UI component layer** — kit-react provides no UI:

- **`WalletUiDropdown`** — connect/disconnect dropdown with wallet list
- **`WalletUiModal`** / **`WalletUiModalTrigger`** — wallet selection modal
- **`WalletUiList`** / **`WalletUiListButton`** — wallet list with icons
- **`WalletUiIcon`** / **`WalletUiLabel`** — wallet icon and name display
- **`WalletUiAccountGuard`** — conditional rendering based on connection status
- **`WalletUiClusterDropdown`** — cluster selector
- **`BaseDropdown`** / **`BaseModal`** — generic headless primitives (Zag.js)
- **`@wallet-ui/css`** / **`@wallet-ui/tailwind`** — optional Tailwind styling via `data-wu` attributes

#### How wallet-ui would build on kit-react

Wallet-UI is the simplest integration — its core state (Nanostores + contexts) maps directly to kit-react's hooks with no friction:

```tsx
// Wallet-UI's provider would wrap kit-react's KitClientProvider + WalletProvider
// and use its hooks instead of Nanostores for state.
function WalletUi({ config, children }) {
    return (
        <KitClientProvider chain={config.clusters[0].id}>
            <WalletProvider>
                <WalletUiClusterContextProvider clusters={config.clusters}>
                    {children}
                </WalletUiClusterContextProvider>
            </WalletProvider>
        </KitClientProvider>
    );
}

// Wallet-UI's hooks become thin wrappers around kit-react
function useWalletUi() {
    const wallets = useWallets();
    const connected = useConnectedWallet();
    const status = useWalletStatus();
    const connect = useConnectWallet();
    const disconnect = useDisconnectWallet();

    return {
        wallets,
        wallet: connected?.wallet,
        account: connected?.account,
        connected: status === 'connected',
        connect: (account: UiWalletAccount) => connect(account.wallet),
        disconnect,
    };
}
```

The plugin's built-in persistence (`walletName:address` format) matches what wallet-ui already stores, so wallet-ui can use it directly — no need to disable and reimplement like connectorkit. The UI components (dropdowns, modals, wallet lists) remain wallet-ui's value-add, now built on kit-react's hooks instead of its own state layer.

### wallet-adapter

[`wallet-adapter`](https://github.com/anza-xyz/wallet-adapter) (`@solana/wallet-adapter-react`) is the most widely used wallet library in the Solana ecosystem. It's the API most React developers are currently familiar with. kit-react is not a drop-in replacement — it's built on Kit and wallet-standard instead of web3.js and the adapter pattern — but the mental model maps closely.

#### API mapping

| wallet-adapter | kit-react | Notes |
|---|---|---|
| `useWallet().wallets` | `useWallets()` | `UiWallet[]` (wallet-standard) instead of `Wallet[]` (adapter wrapper) |
| `useWallet().wallet` | `useConnectedWallet()?.wallet` | |
| `useWallet().publicKey` | `useConnectedWallet()?.account.address` | `Address` (string) instead of `PublicKey` (class) |
| `useWallet().connected` | `useWalletStatus() === 'connected'` | |
| `useWallet().connecting` | `useWalletStatus() === 'connecting'` | |
| `useWallet().select(name)` + `connect()` | `useConnectWallet()(wallet)` | One step instead of two |
| `useWallet().disconnect()` | `useDisconnectWallet()` | |
| `useWallet().sendTransaction(tx, conn)` | `useSendTransaction().send(instruction)` | Takes instructions, not pre-built transactions |
| `useWallet().signTransaction` | `useConnectedWallet()?.signer` + Kit signing | Or `useAction()` for state tracking |
| `useWallet().signAllTransactions` | `useConnectedWallet()?.signer` + Kit signing | |
| `useWallet().signMessage` | `useSignMessage()` | |
| `useWallet().signIn` | `useSignIn()` | |
| `useConnection().connection` | `useClient().rpc` | Kit client instead of web3.js `Connection` |
| `ConnectionProvider` | `RpcProvider` | |
| (implicit in `WalletProvider`) | `KitClientProvider` | Explicit root owning the client + chain |
| `WalletProvider` | `WalletProvider` | Props-based config instead of adapter instances |
| `WalletModalProvider` / `useWalletModal` | Not provided | UI concern — use wallet-ui or connectorkit |
| `WalletMultiButton` | Not provided | UI concern |
| `useAnchorWallet()` | Not provided | Anchor-specific, buildable on `useConnectedWallet()` |
| Adapter packages (`PhantomWalletAdapter`, etc.) | Not needed | Wallet-standard handles discovery automatically |
| `onError` global handler | Not provided | Errors surface per-hook and via promise rejection — standard React patterns |

#### Key differences developers will notice

**Wallet-standard only.** wallet-adapter supports both the legacy adapter pattern (`new PhantomWalletAdapter()`) and wallet-standard; adapters are optional but the escape hatch is still there for wallets that haven't migrated. kit-react only supports wallet-standard — wallets register themselves, no per-wallet imports, and no legacy adapter fallback. The ecosystem has moved: all major wallets ship wallet-standard support, so the simpler surface is the right tradeoff.

**No `select` + `connect` two-step.** wallet-adapter separates wallet selection from connection. kit-react's `useConnectWallet()` takes a `UiWallet` and connects in one call. The two-step pattern was an artifact of the adapter model where selection and connection were separate concerns.

**No `publicKey`.** wallet-adapter developers are used to `wallet.publicKey` as the primary identifier. In kit-react it's `useConnectedWallet()?.account.address` — a string `Address` instead of a `PublicKey` class. This is a Kit-wide change.

**Instructions, not transactions.** wallet-adapter's `sendTransaction` takes a pre-built `Transaction` + `Connection`. kit-react's `useSendTransaction` takes instructions — the plugin chain handles blockhash, fee payer, signing, sending, and confirmation. For cases that need manual transaction construction (sign-then-send, partial signing), `useAction` + Kit's signing primitives provide full control.

**No bundled UI.** wallet-adapter ships `WalletMultiButton` and modal components that were a common pain point — hard to customize and didn't match app design systems. kit-react is headless. UI comes from wallet-ui, connectorkit, or the app's own components.

**Granular hooks.** wallet-adapter puts everything on one `useWallet()` context — any wallet state change re-renders all consumers. kit-react splits into focused hooks (`useWallets`, `useWalletStatus`, `useConnectedWallet`, etc.) so components subscribe only to what they need. This is a tradeoff: wallet-adapter's one-hook API is easier for newcomers to learn (one import, one object, shallow surface), while granular hooks add a discoverability cost in exchange for finer re-render control. Apps that only render a connect button will barely notice the win; apps with many wallet-aware components (portfolio views, multi-account flows, per-account subscriptions) benefit substantially. `useWalletState()` is provided for callers who explicitly want the one-object shape.

**No global error handler.** wallet-adapter's `onError` prop was a second error channel alongside thrown errors, which caused confusion about which path errors take. kit-react uses standard React patterns: hook-level errors (`useBalance().error`), promise rejection (`await connect(wallet)` throws on failure), and Error Boundaries for unexpected failures.

### Before and after: Kit example React app

The [Kit example React app](https://github.com/anza-xyz/kit/tree/main/examples/react-app) is a complete wallet/transaction app built directly on `@solana/kit` and `@solana/react` — without any higher-level library. It demonstrates what developers must build today. Comparing it to kit-react shows the boilerplate that kit-react eliminates.

#### Provider setup

**Today** — three hand-built contexts stacked together:

```tsx
// ChainContextProvider: localStorage persistence, URL resolution per chain, fallback handling
// RpcContextProvider: manual createSolanaRpc() + createSolanaRpcSubscriptions(), useMemo
// SelectedWalletAccountContextProvider: localStorage sync object, wallet filtering

<ChainContextProvider>
    <SelectedWalletAccountContextProvider stateSync={stateSync}>
        <RpcContextProvider>
            <App />
        </RpcContextProvider>
    </SelectedWalletAccountContextProvider>
</ChainContextProvider>
```

**With kit-react:**

```tsx
<KitClientProvider chain="solana:devnet">
    <WalletProvider>
        <RpcProvider rpcUrl="https://api.devnet.solana.com" rpcSubscriptionsUrl="wss://api.devnet.solana.com">
            <App />
        </RpcProvider>
    </WalletProvider>
</KitClientProvider>
```

Chain context, RPC client creation, wallet persistence, and localStorage sync are handled by the providers and the underlying plugins.

#### Wallet connection UI

**Today** — ~100 lines of custom code: manually filter wallets by `StandardConnect` / `StandardDisconnect` features, build a menu with per-wallet submenus for account selection, compare accounts with `uiWalletAccountsAreSame()`, handle connect/disconnect errors, and manage a separate Sign In With Solana menu.

**With kit-react:**

```tsx
const wallets = useWallets();
const connect = useConnectWallet();
const disconnect = useDisconnectWallet();
const connected = useConnectedWallet();
// Build your UI with these — no feature filtering, account comparison, or state sync needed
```

#### Live balance

**Today** — a custom `balanceSubscribe` function (~40 lines) that manually creates a `createReactiveStoreWithInitialValueAndSlotTracking` (a `ReactiveStreamStore`), manages `AbortController` lifecycle, bridges into SWR via `useSWRSubscription`, and tracks seen errors with a `WeakSet` to avoid duplicate dialogs.

**With kit-react:**

```tsx
const { data: balance, error, isLoading } = useBalance(address);
```

#### Transaction sending

**Today** — three separate feature panels (sign & send, sign then send, partial sign), each 150–350 lines. Each manually: builds a form, converts SOL strings to lamports, fetches the latest blockhash, pipes together a transaction message with `setTransactionMessageFeePayerSigner` / `setTransactionMessageLifetimeUsingBlockhash` / `appendTransactionMessageInstruction`, manages a multi-state state machine (`'inputs-form-active' | 'creating-transaction' | 'ready-to-send' | 'sending-transaction'`), signs, sends, confirms, and manually calls `mutate()` to invalidate the SWR balance cache.

**With kit-react** — the common case (sign & send) is one line:

```tsx
const { send, status, data, error } = useSendTransaction();
await send(getTransferInstruction({ source, destination, amount }));
```

Sign-then-send and partial signing use `useAction` to track each step independently:

```tsx
const client = useClient();

// Plan → sign → review → send (three separate user-visible steps)
const { send: plan, data: message } = useAction(
    (_signal, input) => client.planTransaction(input),
);
const { send: sign, data: signed } = useAction(
    (_signal, msg) => signTransactionMessageWithSigners(msg),
);
const { send: sendSigned, status } = useAction(
    (signal, tx) => sendAndConfirmTransaction(client.rpc, tx, { abortSignal: signal, commitment: 'confirmed' }),
);

// Partial signing — sign with one signer, pass to another
const { send: partialSign, data: partiallySigned } = useAction(
    (_signal, msg) => partiallySignTransactionMessageWithSigners(msg),
);
```

Balance invalidation is handled by the adapter's mutation hooks (`invalidateKeys` / `revalidateKeys`).

#### Subscription management

**Today** — the slot indicator component (~50 lines) manually creates a reactive store from `rpcSubscriptions.slotNotifications().reactiveStore()`, wires it into `useSyncExternalStore` with a custom subscribe/getSnapshot, and manages an `AbortController` in a `useEffect`.

**With kit-react:**

```tsx
const { data: slot } = useSubscription(
    (signal) => client.rpcSubscriptions.slotNotifications(),
    [client],
);
```

#### Summary

| Area | Kit example (today) | kit-react |
|------|-------------------|-----------|
| Provider setup | 3 custom contexts, localStorage sync, manual RPC creation | 3 providers (`KitClientProvider` + `WalletProvider` + `RpcProvider`) |
| Wallet UI | ~100 lines, manual feature filtering | Hooks + your own UI |
| Balance | ~50 lines, SWR + reactive store + AbortController + WeakSet | `useBalance(address)` |
| Transaction (×3 types) | 150–350 lines each, manual state machines | `useSendTransaction()` |
| Subscriptions | Manual reactive store + useSyncExternalStore + AbortController | `useSubscription()` |
| Chain switching | Custom context + localStorage + URL resolution | Provider props |
| **Total custom code** | **~1,200 lines** | **Focus on app-specific logic** |

The Kit example app is well-written — the complexity is inherent to building on low-level primitives. kit-react absorbs that complexity into reusable hooks and providers so developers can focus on their app.