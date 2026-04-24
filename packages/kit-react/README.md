# `@solana/kit-react`

React bindings for [Solana Kit](https://github.com/anza-xyz/kit). Providers compose a Kit client for the subtree; hooks expose live on-chain data, one-shot RPC reads, and transaction-sending flows through the same `{ data, error, status, ... }` vocabulary consumers already expect from `react-query` or `swr`.

The library is a thin bridge over Kit's reactive primitives — it does not reimplement state machines, fetch policies, or abort semantics. Every lifecycle concern (retry, supersede, stale-while-revalidate, slot dedup) lives in Kit and surfaces through `useSyncExternalStore`.

- **Composable providers.** Nest providers to build the Kit plugin chain — each maps to a Kit plugin, nesting order is plugin order.
- **Subscription-backed live data.** Reactive hooks combine an RPC fetch with a matching subscription and dedupe by slot — no polling, no stale-data flicker.
- **Cache-library agnostic.** Core hooks work on their own; follow-up packages will bridge into SWR and TanStack Query for apps that want shared caches.
- **Headless.** No UI. Wallet pickers, modals, and connect buttons belong in higher-level libraries.
- **SSR-safe.** Every hook returns a hydration-stable "not yet available" snapshot during server render; the live store kicks in on the client.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Providers](#providers)
- [Hooks](#hooks)
    - [One-shot reads](#one-shot-reads)
    - [Subscriptions](#subscriptions)
    - [Actions and transactions](#actions-and-transactions)
    - [Live data](#live-data)
    - [Signers](#signers)
    - [Client access](#client-access)
- [Return shapes](#return-shapes)
- [Common patterns](#common-patterns)

## Installation

```shell
pnpm add @solana/kit-react @solana/kit react
```

Optional peers — install only when you mount the matching provider:

```shell
pnpm add @solana/kit-plugin-signer          # for PayerProvider / IdentityProvider / SignerProvider
pnpm add @solana/kit-plugin-instruction-plan # for RpcProvider / LiteSvmProvider (transaction sending)
```

The library targets React 18 and 19, and ships Node, browser, and React Native bundles.

## Quick start

A read-only dashboard — just an RPC connection, no wallet or payer:

```tsx
import { address } from '@solana/kit';
import { KitClientProvider, RpcConnectionProvider, useBalance } from '@solana/kit-react';

function BalanceCard({ owner }: { owner: Address }) {
    const { data, status, error, retry } = useBalance(owner);
    if (status === 'loading') return <Spinner />;
    if (status === 'error') return <RetryButton onClick={retry} error={error} />;
    return <Lamports value={data} />;
}

export function App() {
    return (
        <KitClientProvider>
            <RpcConnectionProvider rpcUrl="https://api.mainnet-beta.solana.com">
                <BalanceCard owner={address('FnHyam9w4NZoWR6mKN1CuGBritdsEWZQa4Z4oawLZGxa')} />
            </RpcConnectionProvider>
        </KitClientProvider>
    );
}
```

Sending a transaction — requires a payer and a full RPC provider. Using a chain-specific provider (`SolanaDevnetRpcProvider`) also publishes the chain automatically:

```tsx
import { getTransferInstruction } from '@solana-program/system';
import { KitClientProvider, SignerProvider, SolanaDevnetRpcProvider, useSendTransaction } from '@solana/kit-react';

function Transfer({ source, destination, amount }: TransferProps) {
    const { send, isRunning, data, error, reset } = useSendTransaction();
    return (
        <>
            <button disabled={isRunning} onClick={() => send(getTransferInstruction({ source, destination, amount }))}>
                {isRunning ? 'Sending…' : 'Send'}
            </button>
            {error ? <ErrorBanner error={error} onDismiss={reset} /> : null}
            {data ? <Confirmation signature={data.context.signature} /> : null}
        </>
    );
}

export function App() {
    return (
        <KitClientProvider>
            <SignerProvider signer={mySigner}>
                <SolanaDevnetRpcProvider>
                    <Transfer {...props} />
                </SolanaDevnetRpcProvider>
            </SignerProvider>
        </KitClientProvider>
    );
}
```

## Providers

Every hook needs a [`KitClientProvider`](#kitclientprovider) ancestor. Everything else is additive — nesting order is the plugin chain order, and each provider maps to one Kit plugin.

### `KitClientProvider`

Root provider. Seeds a Kit client. Every other provider and hook needs one of these above it.

```tsx
<KitClientProvider>{children}</KitClientProvider>
```

Props:

- `client` _(optional)_ — a pre-built Kit client. When provided the provider uses it as-is and the caller owns disposal. When omitted the provider calls `createClient()` and disposes it on unmount.

Chain is handled separately — see [`ChainProvider`](#chainprovider) and the chain-specific RPC providers below. Calling `useChain()` when no ancestor has set a chain throws.

### `ChainProvider`

Publishes a `ChainIdentifier` to the subtree. Most apps never mount this directly — chain-specific RPC providers and wallet providers publish the chain implicitly. Use `ChainProvider` when you need to declare a chain without either, e.g. a custom RPC URL for a fork that wallets should still treat as mainnet.

```tsx
<ChainProvider chain="solana:mainnet">
    <RpcConnectionProvider rpcUrl="https://my-fork.example.com">{children}</RpcConnectionProvider>
</ChainProvider>
```

`"solana:mainnet"`, `"solana:devnet"`, and `"solana:testnet"` autocomplete; any other wallet-standard `${namespace}:${network}` string is accepted for L2s or non-Solana chains. A `ChainProvider` inside another chain context overrides it.

### `RpcConnectionProvider`

Installs `client.rpc` and `client.rpcSubscriptions`. The lightest provider — no payer required, no transaction sending. Right for explorers, dashboards, watchers, and server scripts.

```tsx
// subscriptions URL derived by default (rpcUrl with http→ws); override with `rpcSubscriptionsUrl`.
<RpcConnectionProvider rpcUrl="https://api.mainnet-beta.solana.com" />
```

### `RpcProvider`

Full transaction-capable stack: RPC, subscriptions, transaction planning, transaction execution. Requires a `client.payer` — mount a `SignerProvider`, `PayerProvider`, or wallet provider above.

```tsx
<SignerProvider signer={testSigner}>
    <RpcProvider rpcUrl="https://api.devnet.solana.com" chain="solana:devnet">
        {children}
    </RpcProvider>
</SignerProvider>
```

Accepts every field from `@solana/kit-plugin-rpc`'s `SolanaRpcConfig` — `rpcUrl`, `rpcSubscriptionsUrl`, `maxConcurrency`, `rpcConfig`, `rpcSubscriptionsConfig`, `skipPreflight`, `transactionConfig` — plus an optional `chain` that, when set, overrides the chain from any ancestor `KitClientProvider`.

### `SolanaMainnetRpcProvider`, `SolanaDevnetRpcProvider`, `SolanaLocalRpcProvider`

Chain-specific variants of `RpcProvider`. Each wraps the corresponding `solanaRpc` bundle plugin and implicitly publishes its cluster identifier via `useChain()` so wallet-aware descendants don't need a chain set at the root. Mainnet narrows the RPC type to `MainnetUrl`; devnet and local default their URLs and install `client.airdrop`.

```tsx
// No `chain` prop needed on KitClientProvider — the mainnet provider sets it.
<KitClientProvider>
    <SignerProvider signer={mySigner}>
        <SolanaMainnetRpcProvider rpcUrl="https://api.mainnet-beta.solana.com">{children}</SolanaMainnetRpcProvider>
    </SignerProvider>
</KitClientProvider>
```

Mainnet and devnet publish `"solana:mainnet"` / `"solana:devnet"`. Local doesn't publish a chain by default (no canonical CAIP-2 identifier for local validators); pass `chain` explicitly if wallet-aware descendants need it.

### `LiteSvmProvider`

Drop-in replacement for `RpcProvider` in tests and local dev — backed by an in-process LiteSVM instance instead of a remote node. Same capabilities, same requirement for an ancestor payer.

```tsx
<SignerProvider signer={testSigner}>
    <LiteSvmProvider>{children}</LiteSvmProvider>
</SignerProvider>
```

### `PayerProvider`, `IdentityProvider`, `SignerProvider`

Thin wrappers around `@solana/kit-plugin-signer`. Install a static signer on the client for flows that aren't wallet-backed (relayer, CLI script, test keypair).

```tsx
<PayerProvider payer={relayerSigner}>{children}</PayerProvider>       // sets client.payer
<IdentityProvider identity={userSigner}>{children}</IdentityProvider> // sets client.identity
<SignerProvider signer={signerForBoth}>{children}</SignerProvider>    // sets both (common case)
```

### `PluginProvider`

Escape hatch — installs an ordered list of Kit plugins in the subtree. Use when a plugin doesn't ship a purpose-built React provider:

```tsx
import { dasPlugin } from '@my-org/kit-plugin-das';
import { useMemo } from 'react';

function DasProvider({ endpoint, children }: { endpoint: string; children: ReactNode }) {
    const plugins = useMemo(() => [dasPlugin({ endpoint })], [endpoint]);
    return <PluginProvider plugins={plugins}>{children}</PluginProvider>;
}
```

The `plugins` array's reference identity drives when the provider rebuilds the client — memoize it, as above, so the subtree only rebuilds when a plugin config meaningfully changes. In development, the provider warns if the array identity churns on every render.

## Hooks

Every hook falls into one of five return shapes. Knowing the category tells you how to consume it without reading the signature — see [Return shapes](#return-shapes).

### One-shot reads

`useRequest` covers RPC calls without a subscription counterpart — `getEpochInfo`, `getLatestBlockhash`, `getTokenSupply`, etc. — or one-shot reads of values you don't need to subscribe to.

```tsx
const { data: epoch, error, refresh, isLoading } = useRequest(() => client.rpc.getEpochInfo(), [client]);

// Deps-driven: refetches when the address changes.
const { data: supply } = useRequest(() => client.rpc.getTokenSupply(mintAddress), [client, mintAddress]);

// Null to disable — no RPC fires, `status` reports `'disabled'`.
const { data } = useRequest(() => (address ? client.rpc.getAccountInfo(address) : null), [client, address]);
```

Auto-dispatches on mount and whenever `deps` change; `refresh()` re-fires manually with the current deps. During a re-fire `status` transitions to `retrying` with `data` still holding the prior value (stale-while-revalidate).

For imperative one-offs outside the render path, call the RPC directly via `useClient()`:

```tsx
const epoch = await client.rpc.getEpochInfo().send();
```

### Subscriptions

`useSubscription` exposes any subscription-only stream as `{ data, error, status, isLoading, retry, slot }` — the reactive live-value shape used throughout this library. Typically the factory returns a `PendingRpcSubscriptionsRequest`, but any object with a matching `.reactiveStore({ abortSignal })` method plugs in.

```tsx
// Slot feed — raw-value subscription.
const { data: slot, error, retry } = useSubscription(() => client.rpcSubscriptions.slotNotifications(), [client]);

// Logs feed, gated on a flag — null disables it, no WebSocket opens.
const { data } = useSubscription(
    () => (enabled ? client.rpcSubscriptions.logsNotifications(programId) : null),
    [client, programId, enabled],
);
```

`useSubscription` unwraps `SolanaRpcResponse<U>`-shaped notifications automatically: for account / program / signature feeds, `data` is the inner value and `slot` comes from `context.slot`; for raw-value feeds (slot, logs, roots) `data` is the notification as-is and `slot` is `undefined`. The return type reflects the unwrap at compile time.

### Actions and transactions

Every user-triggered async operation returns the same `ActionResult` shape: a fire-and-forget `send(...)` for UI event handlers, a promise-returning `sendAsync(...)` for imperative flows, plus `status` / `data` / `error` / `reset` to track progress. A second dispatch while the first is in flight aborts the first by firing its `AbortSignal` — the common "click twice, only the second submits" UX — so consumers don't have to debounce.

```tsx
// Send a single transaction. Input accepts instructions, instruction plans,
// pre-built transaction messages, or a SingleTransactionPlan.
const { send, status, isRunning, data, error, reset } = useSendTransaction();
// Fire-and-forget from an event handler — no promise to handle.
<button onClick={() => send(getTransferInstruction({ source, destination, amount }))}>Send</button>;

// Multi-transaction variant.
const { send: sendMany } = useSendTransactions();

// Plan a transaction without sending it — for preview-then-send UX.
const { sendAsync: plan } = usePlanTransaction();
const message = await plan(instructions);

// Generic async action — the building block behind the others.
const { send } = useAction(async (signal, payload: Uint8Array) => signer.signMessage(payload), [signer]);
```

The wrapped function receives an `AbortSignal` as its first argument — thread it into your `fetch` / RPC / wallet call so a supersede actually cancels the in-flight work. `reset()` returns the hook to `idle` and aborts any in-flight call.

`send(...)` is fire-and-forget: returns `undefined`, never throws, and failures surface on `error` / `status`. Prefer it from event handlers. Use `sendAsync(...)` when you need the resolved value or want to react to errors in control flow — filter supersede rejections with `isAbortError`:

```tsx
import { isAbortError } from '@solana/kit-react';

try {
    const result = await sendAsync(input);
    navigate(`/tx/${result.context.signature}`);
} catch (err) {
    if (isAbortError(err)) return; // superseded — the store already reflects the newer call
    throw err;
}
```

### Live data

Named hooks for the common RPC + subscription pairings. They return the same shape as [`useSubscription`](#subscriptions). Both a one-shot RPC fetch and an ongoing subscription feed into the same store; whichever emits first provides the initial value, and slot-based comparison ensures only the newest data wins regardless of arrival order — no stale-data flicker, no polling.

All three accept `null` to disable — the hook returns `status: 'disabled'`, `isLoading: false`, fires no RPC traffic, and closes any active subscription. Use this when the dependency the hook needs isn't ready yet (e.g. wallet not connected).

```tsx
// SOL balance — live.
const { data, status, error, retry, slot } = useBalance(address);

// Account data — raw encoded bytes or decoded. The `decoder` participates in
// the internal dep list, so memoize it (module-level constant or `useMemo`)
// rather than calling `getMintDecoder()` inline on every render — a dev-only
// warning fires after a few re-renders if you don't.
const MINT_DECODER = getMintDecoder();
const { data: raw } = useAccount(mintAddress);
const { data: decoded } = useAccount(mintAddress, MINT_DECODER);

// Transaction confirmation status — combines getSignatureStatuses + signatureNotifications.
const { data, status } = useTransactionConfirmation(signature, { commitment: 'confirmed' });
```

`data` is undefined while loading or when disabled; `retry()` re-opens the stream after an error (stable reference, safe as `onClick`); `slot` exposes the slot the current `data` was observed at — useful for "as of slot X" indicators and for coordinating a refetch with a just-sent transaction's slot.

For custom RPC + subscription pairs the named hooks don't cover, `useLiveData` returns the same shape for any spec you build:

```tsx
const { data } = useLiveData(
    () => ({
        rpcRequest: client.rpc.getAccountInfo(gameAddress),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(gameAddress),
        rpcValueMapper: v => parseGameState(v.value),
        rpcSubscriptionValueMapper: v => parseGameState(v),
    }),
    [client, gameAddress],
);
```

### Signers

```tsx
const payer = usePayer(); // TransactionSigner | null
const identity = useIdentity(); // TransactionSigner | null
```

Both return `null` when no signer is currently available (e.g. a wallet-backed payer with no wallet connected). Both throw if no payer/identity plugin is installed at all — that's a mount-time configuration bug, so it surfaces loudly.

These hooks are reactive if the installing plugin is — they re-render whenever the underlying signer changes.

### Client access

Escape hatches for imperative code or for hooks that aren't covered by the named surface.

```tsx
const client = useClient(); // raw Kit client — Client<object>
const client = useClient<ClientWithRpc>(); // caller-declared widening; pure cast, no runtime check
const chain = useChain(); // ChainIdentifier
```

`useClientCapability` is the same pattern with a runtime-checked missing-plugin error. Prefer it over `useClient<T>()` when writing hooks whose users should see an explicit "this hook needs `client.rpc`. Mount `<RpcConnectionProvider>`." message rather than a cryptic call-site crash:

```tsx
import type { ClientWithRpc, GetEpochInfoApi } from '@solana/kit';
import { useClientCapability, useRequest } from '@solana/kit-react';

export function useEpochInfo() {
    const client = useClientCapability<ClientWithRpc<GetEpochInfoApi>>({
        capability: 'rpc',
        hookName: 'useEpochInfo',
        providerHint: 'Mount <RpcProvider> or <RpcConnectionProvider>.',
    });
    return useRequest(() => client.rpc.getEpochInfo(), [client]);
}
```

## Return shapes

Every hook falls into one of these categories. They share vocabulary intentionally — `status`, `error`, `data` mean the same thing everywhere.

| Category       | Return shape                                                                             | Hooks                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| One-shot read  | `{ data, error, status, isLoading, refresh }`                                            | `useRequest`                                                                               |
| Live data      | `{ data, error, status, isLoading, retry, slot }`                                        | `useSubscription`, `useBalance`, `useAccount`, `useTransactionConfirmation`, `useLiveData` |
| Tracked action | `{ send, sendAsync, status, isIdle, isRunning, isSuccess, isError, data, error, reset }` | `useSendTransaction[s]`, `usePlanTransaction[s]`, `useAction`                              |
| Reactive value | `TransactionSigner \| null`                                                              | `usePayer`, `useIdentity`                                                                  |
| Context value  | Stable client / chain                                                                    | `useClient`, `useChain`                                                                    |

**Live-data `status`** — `loading` (no data yet) / `loaded` / `error` (failed, `data` still holds last known) / `retrying` (re-opening after error, `data` preserved) / `disabled` (null arg; no traffic). `isLoading` is `true` only in `loading` — `retrying` and `disabled` both report `false`, matching `react-query` / `swr` semantics.

**One-shot `status`** — same five values. `retrying` is the "re-dispatch after success" case, so UIs can show stale data with a "refreshing" overlay while `refresh()` is in flight.

**Action `status`** — `idle` / `running` / `success` / `error`. `send(...)` transitions to `running`, resolution transitions to `success` or `error`. `reset()` goes back to `idle`.

## Common patterns

### Disabling a query

Every data hook accepts `null` for the primary dependency as a "not ready yet" signal:

```tsx
const wallet = useConnectedWallet();
const { data: balance } = useBalance(wallet?.account.address ?? null);
// balance is undefined; status is 'disabled'; no RPC traffic fires.
```

Mirror this in your own hooks built on `useLiveData` / `useSubscription` / `useRequest` — return `null` from the factory to disable. It matches the cache-library convention where a `null` key means "skip".

### Retry and refresh

`retry()` (live data) and `refresh()` (one-shot) are stable-identity functions on the return value. Pass them straight to an event handler — no `useCallback` wrapper needed:

```tsx
const { error, retry } = useBalance(address);
if (error) return <button onClick={retry}>Reconnect</button>;

const { error, refresh } = useRequest(() => client.rpc.getEpochInfo(), [client]);
if (error) return <button onClick={refresh}>Retry</button>;
```

Retry on live data is end-to-end: Kit's store tears down the broken subscription, optionally re-runs the initial fetch, transitions through `retrying` with `data` preserved, and settles to `loaded` or `error`.

### Abort and supersede

For action hooks, the wrapped function's first argument is an `AbortSignal`. Thread it into `fetch`, RPC calls, or any async work that supports cancellation so a second `send` actually cancels the first:

```tsx
const { send } = useAction(
    async (signal, order: Order) => {
        const signed = await signer.signTransactions([order.tx]);
        return fetch(order.submitUrl, { body: signed, signal }).then(r => r.json());
    },
    [signer],
);
```

A superseded call's promise rejects with an `AbortError`. Use `isAbortError(err)` to distinguish it from real failures when you `await sendAsync(...)` — the fire-and-forget `send(...)` swallows them.

### Errors

Kit throws `SolanaError` with stable codes; hooks surface those errors through `error` as `unknown`. Narrow in render branches:

```tsx
import { isSolanaError, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR } from '@solana/kit';

const { error, retry } = useBalance(address);
if (isSolanaError(error, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR)) {
    return (
        <div>
            RPC unreachable. <button onClick={retry}>Retry</button>
        </div>
    );
}
```

Errors pass through unchanged — no re-wrapping — so the same narrowing code works from UI down to lower layers.

### SSR

Reactive hooks return `{ status: 'loading', data: undefined, isLoading: true }` on the server: no HTTP, no WebSocket, no auto-dispatch. The live store kicks in on first client render and hydration matches cleanly. The library does not prefetch on the server — on-chain state moves fast enough that any prefetched value usually mismatches the first client snapshot.
