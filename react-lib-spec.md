# RFC: `@solana/kit-react` — React Bindings for Kit

**Status:** Draft
**Package:** `@solana/kit-react`

## Summary

A React library for building Solana dApps using Kit. The library is structured in layers: a wallet-agnostic core (`@solana/kit-react`) for client, chain, RPC, signer, and live-data plumbing, and a companion wallet package (`@solana/kit-react-wallet`) for the `WalletProvider` and wallet hooks. Optional SWR and TanStack Query adapters sit on top.

Core covers live on-chain data, transaction sending, and signer access. `kit-react-wallet` adds wallet discovery, connection lifecycle, and wallet-specific hooks. One-shot RPC reads are delegated to the consumer's choice of cache library (SWR, TanStack Query, or plain `fetch` + `useEffect`).

The Kit client is an implementation detail — consumers interact with providers and hooks, not plugins and clients directly. Power users can access the client for imperative use.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  @solana/kit-react/swr          (optional adapter)   │
│  @solana/kit-react/query        (optional adapter)   │
│  Generic bridges + mutation hooks                    │
├──────────────────────────────────────────────────────┤
│  @solana/kit-react-wallet       (wallet bindings)    │
│  WalletProvider, wallet hooks                        │
├──────────────────────────────────────────────────────┤
│  @solana/kit-react              (core)               │
│  KitClientProvider, RPC / payer / identity providers │
│  Signer hooks, live data hooks, action hooks         │
│  useSyncExternalStore for all reactive state         │
├──────────────────────────────────────────────────────┤
│  Kit plugins                    (framework-agnostic) │
│  walletWithoutSigner, walletPayer, walletIdentity,   │
│  walletSigner, solanaRpc, createReactiveStore...     │
└──────────────────────────────────────────────────────┘
```

The split keeps the core wallet-agnostic: apps that don't use a user wallet (read-only dashboards, keypair-driven bots, server flows) can depend on `kit-react` alone without pulling in wallet-standard transitively. Wallet adapters (MWA, WalletConnect, privy, …) peer-depend on `kit-react-wallet`, not core, so the dependency graph matches reality: `adapter → wallet → core`. Signer hooks (`usePayer`, `useIdentity`) live in core and stay reactive against wallet-installed signers via the [`subscribeTo<Capability>` convention](#subscribetocapability-convention) — no type-level dependency on the wallet package.

### Principles

**Library, not a plugin.** A single `react()` Kit plugin is tempting — it would keep the familiar `.use()` API — but React needs to own the client lifecycle (prop-driven recreation for network switching, per-subtree clients, unmount cleanup that aborts subscriptions, per-request clients in SSR). All of that forces the client to be created and managed inside React, which means providers. The composable provider approach expresses the same plugin chain as nesting order — each provider calls `.use()` internally — so the composition model is identical, just adapted to React's lifecycle.

**The client is internal.** Consumers use providers and hooks. The plugin chain is built inside the provider — consumers configure it via props, not `.use()` calls.

**`useSyncExternalStore` for reactive state.** Wallet state, live queries, and subscriptions all use Kit's `subscribe`/`getState` contract, which maps directly to React's `useSyncExternalStore`. No polling, no `useEffect` + `setState`.

**Named hooks only where there's domain logic.** `useBalance` exists because it hides RPC + subscription pairing, slot dedup, and response mapping. `useGetEpochInfo` does not exist because it would be a one-liner wrapping `client.rpc.getEpochInfo().send()`. One-shot reads belong in the consumer's cache library.

**Adapters are thin.** The SWR and TanStack Query adapters provide a generic bridge from Kit's reactive stores into the cache library, plus mutation hooks. One-shot reads are just "use SWR/TanStack directly, see docs."

## Core Library (`@solana/kit-react`)

### Dependencies

```json
{
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "@solana/kit": "^6.x",
    "@solana/kit-plugin-instruction-plan": "^1.x"
  }
}
```

No dependency on `@solana/kit-plugin-wallet` or wallet-standard — apps without a user wallet can depend on core alone. `@solana/kit-plugin-instruction-plan` provides the `client.sendTransaction()` / `client.planTransaction()` methods used by `useSendTransaction` and `useAction` flows — the actual implementation comes from whichever RPC plugin is installed (`kit-plugin-rpc`, `kit-plugin-litesvm`, etc.).

Apps that need wallet connection also depend on the companion wallet package:

```json
{
  "peerDependencies": {
    "@solana/kit-react-wallet": "^1.x",
    "@solana/kit-plugin-wallet": "^1.x"
  }
}
```

See the [wallet package](#wallet-package-solanakit-react-wallet) section for its API.

> **Note:** `@solana/kit-plugin-wallet` is currently under development and not yet released. It provides the `walletWithoutSigner`, `walletPayer`, `walletIdentity`, and `walletSigner` plugins that `WalletProvider` installs.

### Providers

`KitClientProvider` is the root — every app mounts it once, at the top of the tree. It creates the base Kit client and publishes the configured chain. Every other provider (`WalletProvider`, `PayerProvider`, `RpcProvider`, …) reads the client from context, extends it with `.use()`, and provides the new client to its subtree. The nesting order of those providers is the plugin chain order — each maps to a Kit plugin.

#### Common case

```tsx
import { KitClientProvider, RpcProvider } from '@solana/kit-react';
import { WalletProvider } from '@solana/kit-react-wallet';

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

**`KitClientProvider`** — root provider. Seeds the client context with a Kit client and publishes the configured chain for `useChain()`. By default creates a fresh client via `createClient()` and disposes it on unmount; power users can pass their own via the optional `client` prop (for SSR, custom client factories, or shared clients across multiple trees — lifecycle then belongs to the caller). Does not map to a plugin — it's the base that every other provider composes on top of. Every `@solana/kit-react` tree must have exactly one `KitClientProvider` ancestor:

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

**`WalletProvider`** *(from `@solana/kit-react-wallet`)* — wraps one of the wallet plugins. Reads the chain from the enclosing `KitClientProvider` via context. Accepts an optional `role` prop that defaults to `"signer"` — the common case where the wallet both pays for and signs transactions. Other roles are available for advanced setups: `"payer"` (wallet pays fees only), `"identity"` (wallet signs but a relayer pays), or `"none"` (wallet UI only, manual signer access via `useConnectedWallet()`). These map to the `walletSigner`, `walletPayer`, `walletIdentity`, and `walletWithoutSigner` plugins respectively. Also accepts `autoConnect`, `storage`, `storageKey`, and `filter` props, forwarded to the underlying wallet plugin.

**`PayerProvider`** and **`IdentityProvider`** — set `client.payer` and `client.identity` respectively from an explicit signer. Use these when the payer or identity is not the connected wallet (e.g. a backend relayer, a different keypair).

**`RpcProvider`** — wraps `solanaRpc` (the full RPC chain: RPC, subscriptions, transaction planning, execution). Its props extend `SolanaRpcConfig` from `@solana/kit-plugin-rpc` directly (`rpcUrl`, `rpcSubscriptionsUrl`, `priorityFees`, `maxConcurrency`, `rpcConfig`, `rpcSubscriptionsConfig`, `skipPreflight`) so the provider surface stays zero-drift with the plugin. Asserts that `"payer" in client` at render time — if no ancestor provider has set a payer, it throws a message that also points at the read-only escape path below.

*Read-only apps* that don't send transactions (explorers, dashboards, watchers, server-side scripts) should use `RpcReadOnlyProvider` instead of `RpcProvider`. It wraps `solanaRpcReadOnly` — `client.rpc`, `client.rpcSubscriptions`, and `client.getMinimumBalance` — without the transaction-planning / sending halves, so no `WalletProvider` / `PayerProvider` is required:

```tsx
import { KitClientProvider, RpcReadOnlyProvider } from '@solana/kit-react';

<KitClientProvider chain="solana:mainnet">
    <RpcReadOnlyProvider rpcUrl="https://api.mainnet-beta.solana.com">
        <Dashboard />
    </RpcReadOnlyProvider>
</KitClientProvider>;
```

`useBalance`, `useAccount`, `useTransactionConfirmation`, `useLiveQuery`, and `useSubscription` all work against this lighter stack; only the transaction-sending and transaction-planning hooks need the full `RpcProvider`. For more granular stacks (e.g. RPC only, no subscriptions) drop to `PluginProvider` + `solanaRpcConnection` / `solanaRpcSubscriptionsConnection`.

**`LiteSvmProvider`** — wraps `litesvm`. Drop-in replacement for `RpcProvider` in test/dev environments. Provides the same client capabilities (RPC, transaction planning, execution) backed by a local LiteSVM instance instead of a remote RPC node.

**`PluginProvider`** — generic provider for installing any Kit plugin(s) without needing a plugin-specific React wrapper. Accepts a single plugin or an array:

```tsx
// Single plugin
<PluginProvider plugin={dasPlugin({ endpoint: '...' })}>

// Multiple plugins
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
import { WalletProvider } from '@solana/kit-react-wallet';

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
    <PluginProvider plugin={customChainPlugin()}>
        <App />
    </PluginProvider>
</KitClientProvider>
```

### Hooks

Hooks in this library fall into four return-shape categories. Knowing which category a hook belongs to tells you how to consume it without having to read its signature:

| Category        | Return shape                                       | Examples                                                                                                                                                                                           |
| --------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live data       | `{ data, error, isLoading }` (reactive, read-only) | `useBalance`, `useAccount`, `useTransactionConfirmation`, `useLiveQuery`                                                                                                                           |
| Tracked action  | `{ send, status, data, error, reset }` (async)     | `useSendTransaction`, `useSendTransactions`, `useAction`                                                                                                                                           |
| Bare callback   | `(args) => Promise<result>` (stable fn)            | `useConnectWallet`, `useDisconnectWallet`, `useSelectAccount`, `useSignMessage`, `useSignIn` (all from `@solana/kit-react-wallet`)                                                                 |
| Reactive value  | Raw value (reactive, read-only)                    | `useClient`, `useChain`, `usePayer`, `useIdentity`, `useWallets`, `useWalletStatus`, `useConnectedWallet`, `useWalletSigner`, `useWalletState`                                                     |

The variance is intentional — each shape matches a distinct semantic class. Live-data hooks return `isLoading` because they fetch. Tracked actions return `status` because they model an async lifecycle with state. Bare callbacks return a function because they're fire-and-forget (callers can wrap them in `useAction` when they want status tracking). Reactive-value hooks return the value directly because the null vs available case is the only state worth exposing.

> **Looking for wallet hooks?** `useWallets`, `useWalletStatus`, `useConnectedWallet`, `useWalletSigner`, `useWalletState`, `useConnectWallet`, `useDisconnectWallet`, `useSelectAccount`, `useSignMessage`, and `useSignIn` live in `@solana/kit-react-wallet`. Import them from there.

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
 * Power-user escape hatch for imperative use.
 */
function useClient(): Client;

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

*All wallet hooks are exported from `@solana/kit-react-wallet`, not `@solana/kit-react`.*

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

All action hooks return stable function references (verb-first naming, consistent with `useSendTransaction`).

```typescript
/**
 * Connect to a wallet. Stable function reference.
 */
function useConnectWallet(): (wallet: UiWallet) => Promise<readonly UiWalletAccount[]>;

/**
 * Disconnect the active wallet. Stable function reference.
 */
function useDisconnectWallet(): () => Promise<void>;

/**
 * Select a different account within the connected wallet.
 * Stable function reference.
 */
function useSelectAccount(): (account: UiWalletAccount) => void;

/**
 * Sign a message with the connected wallet.
 * Stable function reference.
 */
function useSignMessage(): (message: Uint8Array) => Promise<SignatureBytes>;

/**
 * Sign In With Solana. Stable function reference.
 *
 * Takes the target wallet explicitly — pass `useConnectedWallet()?.wallet` to
 * sign in with the currently-connected wallet, or any `UiWallet` from
 * `useWallets()` for a fresh SIWS-as-connect flow. Matches the underlying
 * plugin's `client.wallet.signIn(wallet, input)` shape.
 */
function useSignIn(): (wallet: UiWallet, input?: SolanaSignInInput) => Promise<SolanaSignInOutput>;
```

#### Signer access

Two hooks for reading the signers installed on the client by the payer / identity / wallet plugins. Both return `null` when unavailable (e.g. wallet-backed signer with no wallet connected) and throw a capability error if the relevant plugin isn't installed at all. When the installed plugin is reactive (e.g. a wallet plugin that reassigns `client.payer` as the wallet connects and disconnects), the hooks re-render on change without having to name the specific plugin — see [`subscribeTo<Capability>` convention](#subscribetocapability-convention) below.

```typescript
/**
 * Returns the current fee payer (`client.payer`), or `null` if unavailable.
 * Wallet-backed via `<WalletProvider role="signer" | "payer">` — reactive.
 * Static via `<PayerProvider signer={…}>` — always returns the signer.
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
- **`PayerProvider`** / **`IdentityProvider`** (static) install neither — the signer is fixed for the lifetime of the provider, so there is no change to observe.

Static plugins without the subscribe hook still work fine: the hook falls back to a no-op subscribe and just reads the capability once per render. Consumers can ignore this detail entirely — it's only relevant for plugin authors whose capability is reactive and who want `usePayer` / `useIdentity` to stay in sync.

This is currently a kit-react convention. See [Future directions](#future-directions) for the option of promoting it to a shared kit-core helper once a second reactive consumer (Vue, Svelte, …) or a second reactive plugin appears.

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
function useWallets(): readonly UiWallet[] {
    const client = useClient();
    return useSyncExternalStore(
        client.wallet.subscribe,
        () => client.wallet.getState().wallets,
    );
}

function useWalletStatus(): WalletStatus {
    const client = useClient();
    return useSyncExternalStore(
        client.wallet.subscribe,
        () => client.wallet.getState().status,
    );
}

function useConnectedWallet() {
    const client = useClient();
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
    const client = useClient();
    const getSnapshot = () => client.wallet.getState().connected?.signer ?? null;
    return useSyncExternalStore(client.wallet.subscribe, getSnapshot, getSnapshot);
}

function useWalletState(): WalletState {
    const client = useClient();
    return useSyncExternalStore(client.wallet.subscribe, client.wallet.getState);
}

function useConnectWallet() {
    const client = useClient();
    return useCallback(
        (wallet: UiWallet) => client.wallet.connect(wallet),
        [client],
    );
}
```

#### Live data (subscription-backed)

Named hooks for common RPC + subscription pairings. These use Kit's `createReactiveStoreWithInitialValueAndSlotTracking` internally and expose the result via `useSyncExternalStore`.

```typescript
type LiveQueryResult<T> = {
    /** The current value, or undefined while loading or when disabled. */
    data: T | undefined;
    /** Error from the fetch or subscription, or undefined. */
    error: unknown;
    /**
     * True when the query is active and no data or error has arrived yet.
     * **A disabled query (null arg) reports `false`** — matching react-query /
     * SWR semantics when the key is `null`, so callers can render an empty
     * state instead of a forever-loading spinner.
     */
    isLoading: boolean;
    /**
     * The slot `data` was observed at. `undefined` while loading, disabled, on
     * server render, or when only an error has arrived. Drawn from the same
     * snapshot as `data`, so the two always correspond: a later subscription
     * notification at a higher slot updates both in the same commit. Useful
     * for "as of slot X" freshness indicators, coordinating a refetch with a
     * just-sent transaction's slot, and stale-data detection.
     */
    slot: Slot | undefined;
};

/**
 * Live SOL balance for an address.
 * Combines getBalance + accountNotifications with slot-based dedup.
 * Pass `null` to disable (e.g. when wallet is not connected). A disabled
 * query reports `{ data: undefined, error: undefined, isLoading: false }`.
 */
function useBalance(address: Address | null): LiveQueryResult<Lamports>;

/**
 * Live account for an address.
 * Combines getAccountInfo + accountNotifications with slot-based dedup.
 * When a decoder is provided, the account data is decoded and returned as
 * a typed Account<TData>. Without a decoder, returns the raw EncodedAccount.
 * Pass `null` to disable — a disabled query reports `isLoading: false`.
 */
function useAccount(address: Address | null): LiveQueryResult<EncodedAccount | null>;
function useAccount<TData extends object>(
    address: Address | null,
    decoder: Decoder<TData>,
): LiveQueryResult<Account<TData> | null>;

/**
 * Live transaction confirmation status.
 * Combines getSignatureStatuses + signatureNotifications with slot-based dedup.
 * Pass `null` to disable (e.g. before a transaction is sent) — a disabled
 * query reports `isLoading: false`.
 */
function useTransactionConfirmation(
    signature: Signature | null,
    options?: { commitment?: Commitment },
): LiveQueryResult<{
    err: TransactionError | null;
    confirmationStatus: Commitment | null;
    confirmations: bigint | null;
}>;
```

**Disabled vs. loading vs. server render.** Three distinct cases produce three distinct `isLoading` values, so callers can tell them apart without extra props:

- **Disabled (null arg)** — the query is intentionally off. `isLoading: false`. Render an empty state.
- **Active, no data yet** — the query is running, waiting for the first value. `isLoading: true`. Render a spinner.
- **Server render** — the query is inert on the server (no HTTP / WebSocket); from the consumer's perspective the value is still "pending", so the hook reports `isLoading: true` and hydration matches the first client render before the real store kicks in.

Internally this is two static "empty" stores, not one: `disabledLiveStore` is tagged so `useLiveQueryResult` can report `isLoading: false`, while `nullLiveStore` (used on server builds) isn't, so the same snapshot shows `isLoading: true`. Collapsing them would force the caller to pick a single meaning for "empty", which only one of the three cases wants.

Implementation sketch:

```tsx
function useBalance(address: Address | null): LiveQueryResult<Lamports> {
    const client = useClient();

    const store = useLiveStore(
        (signal) => {
            if (!address) return disabledLiveStore<Lamports>();
            return createReactiveStoreWithInitialValueAndSlotTracking({
                abortSignal: signal,
                rpcRequest: client.rpc.getBalance(address),
                rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address),
                // The factory unwraps the `SolanaRpcResponse` envelope before
                // handing it to the mapper, so `value` here is already
                // `Lamports`, not `{ value: Lamports, ... }`.
                rpcValueMapper: (lamports) => lamports,
                rpcSubscriptionValueMapper: ({ lamports }) => lamports,
            });
        },
        [client, address],
    );

    return useLiveQueryResult(store);
}

function useAccount<TData extends object>(
    address: Address | null,
    decoder?: Decoder<TData>,
): LiveQueryResult<EncodedAccount | Account<TData> | null> {
    const client = useClient();

    const store = useLiveStore(
        (signal) => {
            if (!address) return disabledLiveStore<Account<TData> | EncodedAccount | null>();
            return createReactiveStoreWithInitialValueAndSlotTracking({
                abortSignal: signal,
                rpcRequest: client.rpc.getAccountInfo(address, { encoding: 'base64' }),
                rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address, { encoding: 'base64' }),
                rpcValueMapper: (value) => {
                    if (!value) return null;
                    const encoded = parseBase64RpcAccount(address, value);
                    return decoder ? decodeAccount(encoded, decoder) : encoded;
                },
                rpcSubscriptionValueMapper: (value) => {
                    if (!value) return null;
                    const encoded = parseBase64RpcAccount(address, value);
                    return decoder ? decodeAccount(encoded, decoder) : encoded;
                },
            });
        },
        [client, address, decoder],
    );

    return useLiveQueryResult(store);
}

function useTransactionConfirmation(
    signature: Signature | null,
    options?: { commitment?: Commitment },
): LiveQueryResult<{ err: TransactionError | null; confirmationStatus: Commitment | null; confirmations: bigint | null }> {
    const client = useClient();
    const commitment = options?.commitment ?? 'confirmed';

    const store = useLiveStore(
        (signal) => {
            if (!signature) return disabledLiveStore<TransactionConfirmationStatus>();
            return createReactiveStoreWithInitialValueAndSlotTracking({
                abortSignal: signal,
                rpcRequest: client.rpc.getSignatureStatuses([signature]),
                rpcSubscriptionRequest: client.rpcSubscriptions
                    .signatureNotifications(signature, { commitment }),
                rpcValueMapper: (statuses) => {
                    const status = statuses[0];
                    return status
                        ? { err: status.err, confirmationStatus: status.confirmationStatus, confirmations: status.confirmations }
                        : { err: null, confirmationStatus: null, confirmations: null };
                },
                rpcSubscriptionValueMapper: (notification) => ({
                    err: notification.err,
                    confirmationStatus: commitment,
                    confirmations: null,
                }),
            });
        },
        [client, signature, commitment],
    );

    return useLiveQueryResult(store);
}
```

Where the two static "empty" stores (`disabledLiveStore` for user-initiated disable, `nullLiveStore` for server render) and `useLiveStore` are internal helpers:

```typescript
/**
 * Static store that never emits. `useLiveQueryResult` reports `isLoading: true`
 * so SSR matches the first client render (loading), and the real store kicks
 * in once the client mounts.
 */
function nullLiveStore<T>(): ReactiveStore<T> {
    return {
        getState: () => undefined,
        getError: () => undefined,
        subscribe: () => () => {},
    };
}

/**
 * Static store tagged as "disabled". `useLiveQueryResult` detects the tag and
 * reports `isLoading: false` — matches react-query / SWR semantics when the
 * key is `null`, so disabled queries don't render forever-loading UI.
 */
const DISABLED = Symbol('DisabledLiveStore');

function disabledLiveStore<T>(): ReactiveStore<T> & { readonly [DISABLED]: true } {
    return {
        [DISABLED]: true,
        getState: () => undefined,
        getError: () => undefined,
        subscribe: () => () => {},
    };
}

function useLiveStore<T>(
    factory: (signal: AbortSignal) => ReactiveStore<T>,
    deps: DependencyList,
): ReactiveStore<T> {
    const abortRef = useRef<AbortController | null>(null);

    // The SSR branch lives inside the memo (not as an early return) so the
    // hook sequence stays identical between server and client.
    const store = useMemo(() => {
        if (!__BROWSER__ && !__REACTNATIVE__) return nullLiveStore<T>();
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        return factory(controller.signal);
    }, deps);

    useEffect(() => () => abortRef.current?.abort(), []);

    return store;
}

function useLiveQueryResult<T>(store: ReactiveStore<T>): LiveQueryResult<T> {
    const data = useSyncExternalStore(store.subscribe, store.getState);
    const error = useSyncExternalStore(store.subscribe, store.getError);
    const disabled = (store as { [DISABLED]?: true })[DISABLED] === true;

    return useMemo(() => ({
        data: data?.value,
        error,
        isLoading: !disabled && data === undefined && error === undefined,
        // Pulled from the same snapshot as `data` so the two always agree.
        slot: data?.context.slot,
    }), [data, error, disabled]);
}
```

#### Generic live query

For custom RPC + subscription combinations the named hooks don't cover:

```typescript
/**
 * Generic live query for any RPC + subscription pair.
 * Handles store creation, slot dedup, abort, and cleanup.
 *
 * The factory function is called when `deps` change, so ESLint's
 * `react-hooks/exhaustive-deps` rule can trace which values are captured
 * and warn when any are missing from `deps`. Add `'useLiveQuery'` to your
 * project's `exhaustive-deps` `additionalHooks` setting to opt in.
 */
function useLiveQuery<TRpcValue, TSubscriptionValue, T>(
    factory: () => CreateReactiveStoreConfig<TRpcValue, TSubscriptionValue, T>,
    deps: DependencyList,
): LiveQueryResult<T>;
```

Usage:

```tsx
// Watch a custom program account
const { data: gameState } = useLiveQuery(
    () => ({
        rpcRequest: client.rpc.getAccountInfo(gameAddress),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(gameAddress),
        rpcValueMapper: (v) => parseGameState(v.value),
        rpcSubscriptionValueMapper: (v) => parseGameState(v),
    }),
    [client, gameAddress],
);
```

#### Subscriptions (no initial fetch)

For subscription-only data where there is no RPC fetch equivalent:

```typescript
/**
 * Subscribe to an RPC subscription. Returns the latest notification value.
 *
 * Return `null` from the factory to disable — matches the null-gate
 * convention used by `useBalance` / `useAccount` /
 * `useTransactionConfirmation`. A disabled subscription fires no RPC
 * traffic and leaves `data` / `error` undefined.
 */
function useSubscription<T>(
    factory: (signal: AbortSignal) => PendingRpcSubscriptionsRequest<T> | null,
    deps: DependencyList,
): { data: T | undefined; error: unknown };
```

Usage:

```tsx
const { data: logs } = useSubscription(
    (signal) => client.rpcSubscriptions.logsNotifications(programId),
    [client, programId],
);

const { data: slot } = useSubscription(
    (signal) => client.rpcSubscriptions.slotNotifications(),
    [client],
);

// Gated on a feature flag
const { data: enabledLogs } = useSubscription(
    (signal) => enabled ? client.rpcSubscriptions.logsNotifications(programId) : null,
    [client, programId, enabled],
);
```

#### Sending transactions

Wraps `client.sendTransaction()` and `client.sendTransactions()` (from the instruction-plan plugin) with React async state tracking. These are the primary way to send transactions in kit-react — they handle the full plan → sign → send → confirm lifecycle.

```typescript
type ActionState<TArgs extends unknown[], TResult> = {
    /** The send function. Stable reference. */
    send: (...args: TArgs) => Promise<TResult>;
    /** Current status of the mutation. */
    status: 'idle' | 'running' | 'success' | 'error';
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
await send(instructionPlan('sequential', [ixA, ixB]));
```

Implementation:

```tsx
function useSendTransaction() {
    const client = useClient();
    return useAction(
        useCallback(
            (signal: AbortSignal, input: Parameters<typeof client.sendTransaction>[0], config?: Config) =>
                client.sendTransaction(input, { ...config, abortSignal: signal }),
            [client],
        ),
    );
}

// useAction implementation (abridged — see source for full details).
function useAction<TArgs extends unknown[], TResult>(
    fn: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>,
): ActionState<TArgs, TResult> {
    const [state, setState] = useState<{ status: string; data?: TResult; error?: unknown }>({ status: 'idle' });
    const currentControllerRef = useRef<AbortController | null>(null);

    // Latest-ref keeps `send` stable across renders while always invoking the
    // newest closure. The ref is updated in a post-commit effect (rather than
    // during render) so a discarded concurrent render can't leave the ref
    // pointing at a closure that captured never-committed props / context.
    // `send` only runs from event handlers (post-commit), so the one-render
    // lag is not observable in practice.
    const fnRef = useRef(fn);
    useEffect(() => { fnRef.current = fn; });

    const send = useCallback(async (...args: TArgs) => {
        // Abort any in-flight call — stale awaits reject with AbortError.
        currentControllerRef.current?.abort();
        const controller = new AbortController();
        currentControllerRef.current = controller;

        setState({ status: 'running' });
        try {
            const data = await getAbortablePromise(fnRef.current(controller.signal, ...args), controller.signal);
            if (!controller.signal.aborted) setState({ status: 'success', data });
            return data;
        } catch (error) {
            if (!controller.signal.aborted) setState({ status: 'error', error });
            throw error;
        }
    }, []); // stable — no `fn` dep thanks to the latest-ref above

    const reset = useCallback(() => {
        currentControllerRef.current?.abort();
        setState({ status: 'idle' });
    }, []);

    return useMemo(() => ({ send, status: state.status, data: state.data, error: state.error, reset }),
        [send, state, reset]);
}
```

The `send` function accepts the same inputs as `client.sendTransaction()` — raw instructions, fluent program client instructions, instruction plans, or pre-built transaction messages. For imperative flows where you don't need React state tracking, you can also call `client.sendTransaction(...)` directly via `useClient()`.

#### Generic async action

`useAction` wraps any async function with status/data/error tracking. It's the building block behind `useSendTransaction`, and is exported for custom async flows like sign-then-send or partial signing.

```typescript
/**
 * Track the async state of a user-triggered action.
 * Returns a stable `send` function and reactive status/data/error.
 *
 * The wrapped function receives an `AbortSignal` as its first argument —
 * thread it into your `fetch` / RPC for true cancellation, or ignore it.
 * Calling `send` while a prior call is in flight (or calling `reset()`)
 * aborts the prior call: its `await` rejects with `AbortError` and its
 * outcome is never written to state.
 */
function useAction<TArgs extends unknown[], TResult>(
    fn: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>,
): {
    send: (...args: TArgs) => Promise<TResult>;
    status: 'idle' | 'running' | 'success' | 'error';
    data: TResult | undefined;
    error: unknown;
    reset: () => void;
};
```

Callers that `await send(...)` should filter `AbortError` so a superseded call's rejection doesn't surface as an error in the UI:

```tsx
try {
    await send(...);
} catch (err) {
    if ((err as Error).name === 'AbortError') return; // superseded by newer call
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

**Not provided.** One-shot RPC reads are best handled by the consumer's cache library:

```typescript
// SWR
const { data } = useSWR(['epochInfo'], () => client.rpc.getEpochInfo().send());

// TanStack Query
const { data } = useQuery({
    queryKey: ['epochInfo'],
    queryFn: () => client.rpc.getEpochInfo().send(),
});

// Plain React (imperative)
const epochInfo = await client.rpc.getEpochInfo().send();
```

Providing a generic `useRpcQuery` hook would be fighting against React's lack of a good data-fetching primitive. Cache libraries already solve this well.

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
        <PluginProvider plugin={dasPlugin({ endpoint: 'https://mainnet.helius-rpc.com/?api-key=...' })}>
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
import { useClientCapability } from '@solana/kit-react';
import type { DasClient } from '@my-org/kit-plugin-das';

export function useAsset(address: Address) {
    const client = useClientCapability<DasClient>({
        capability: 'das',
        hookName: 'useAsset',
        providerHint: 'Usually supplied by <DasProvider>.',
    });
    return useSWR(['das-asset', address], () =>
        client.das.getAsset(address).send()
    );
}
```

Consumers just import `useAsset` — they never need to touch `useClient` or know about the underlying DAS plugin.

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

### `useClient` is generic for advanced cases

`useClient` still accepts a type parameter for the rare case where you want a bare cast without a capability check:

```typescript
function useClient<TClient extends object = object>(): Client<TClient>;
```

Use this when you specifically don't want the runtime check (e.g. testing code inspecting the raw client) — in production hooks, reach for `useClientCapability` first.

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

### Generic bridge

Bridges any Kit reactive store into SWR's cache via `useSWRSubscription`:

```typescript
/**
 * Bridge a Kit reactive store into SWR.
 * Manages subscription lifecycle and error propagation.
 */
function useLiveSwr<T>(
    key: SWRKey,
    config: CreateReactiveStoreConfig,
): SWRResponse<T>;
```

Usage:

```tsx
// Custom live query via SWR
const { data, error, isLoading } = useLiveSwr(
    ['gameState', gameAddress],
    {
        rpcRequest: client.rpc.getAccountInfo(gameAddress),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(gameAddress),
        rpcValueMapper: (v) => parseGameState(v.value),
        rpcSubscriptionValueMapper: (v) => parseGameState(v),
    },
);
```

### Mutation hooks

Same API as core's `useSendTransaction` / `useSendTransactions`, but backed by SWR's `useSWRMutation`. The key difference is cache integration — you can automatically revalidate SWR queries after a successful transaction (e.g. refetch balances after a transfer).

Since these hooks live under the `@solana/kit-react/swr` entry point, they use the same names as core — the import path disambiguates:

```typescript
import { useSendTransaction } from '@solana/kit-react/swr';
```

```typescript
/**
 * Send a single transaction with SWR mutation support.
 * Revalidates the provided keys on success.
 */
function useSendTransaction(options?: {
    revalidateKeys?: SWRKey[];
}): SWRMutationResponse<SuccessfulSingleTransactionPlanResult>;

/**
 * Send one or more transactions with SWR mutation support.
 */
function useSendTransactions(options?: {
    revalidateKeys?: SWRKey[];
}): SWRMutationResponse<TransactionPlanResult>;
```

Usage:

```tsx
import { useSendTransaction } from '@solana/kit-react/swr';

const { trigger, isMutating, error } = useSendTransaction({
    revalidateKeys: [['balance', sourceAddress]],
});

await trigger(getTransferInstruction({ source, destination, amount }));
// SWR automatically revalidates the balance query after success
```

### One-shot reads

Not provided — use SWR directly:

```typescript
const { data } = useSWR(['epochInfo'], () => client.rpc.getEpochInfo().send());
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

### Generic bridge

Bridges a Kit reactive store into TanStack Query's cache. Subscription pushes updates via `queryClient.setQueryData`:

```typescript
/**
 * Bridge a Kit reactive store into TanStack Query.
 * Initial fetch via queryFn, ongoing updates via subscription → setQueryData.
 */
function useLiveQuery<T>(
    key: QueryKey,
    config: CreateReactiveStoreConfig,
    options?: UseQueryOptions,
): UseQueryResult<T>;
```

### Mutation hooks

Same API as core's `useSendTransaction` / `useSendTransactions`, but backed by TanStack's `useMutation`. The key differences are automatic cache invalidation, optimistic updates, and visibility in TanStack devtools.

Since these hooks live under the `@solana/kit-react/query` entry point, they use the same names as core — the import path disambiguates:

```typescript
import { useSendTransaction } from '@solana/kit-react/query';
```

```typescript
/**
 * Send a single transaction with TanStack mutation support.
 * Invalidates the provided query keys on success.
 */
function useSendTransaction(options?: {
    onSuccess?: (result: SuccessfulSingleTransactionPlanResult) => void;
    invalidateKeys?: QueryKey[];
}): UseMutationResult<SuccessfulSingleTransactionPlanResult>;

/**
 * Send one or more transactions with TanStack mutation support.
 */
function useSendTransactions(options?: {
    onSuccess?: (result: TransactionPlanResult) => void;
    invalidateKeys?: QueryKey[];
}): UseMutationResult<TransactionPlanResult>;
```

Usage:

```tsx
import { useSendTransaction } from '@solana/kit-react/query';

const { mutateAsync, isPending, error } = useSendTransaction({
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
import { useClient } from '@solana/kit-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

function useSendTransaction(options?: {
    onSuccess?: (result: SuccessfulSingleTransactionPlanResult) => void;
    invalidateKeys?: QueryKey[];
}) {
    const client = useClient();
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

The SWR adapter follows the same pattern with `useSWRMutation`:

```tsx
import { useClient } from '@solana/kit-react';
import useSWRMutation from 'swr/mutation';

function useSendTransaction(options?: { revalidateKeys?: SWRKey[] }) {
    const client = useClient();

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

Both adapters are thin — they delegate entirely to `client.sendTransaction()` and just wire up the cache library's mutation lifecycle around it.

### One-shot reads

Not provided — use TanStack Query directly:

```typescript
const { data } = useQuery({
    queryKey: ['epochInfo'],
    queryFn: ({ signal }) => client.rpc.getEpochInfo().send({ abortSignal: signal }),
});
```

## What Each Layer Provides

| Feature | Core | SWR Adapter | TanStack Adapter |
|---------|------|-------------|------------------|
| Providers | ✅ | — | — |
| Wallet hooks | ✅ | — | — |
| `useBalance`, `useAccount` | ✅ (useSyncExternalStore) | ✅ (SWR cache) | ✅ (TanStack cache) |
| `useLiveQuery` (generic) | ✅ | ✅ (useSWRSubscription) | ✅ (setQueryData) |
| `useSubscription` | ✅ | — | — |
| One-shot reads | Use cache lib directly | useSWR | useQuery |
| Mutations (`useSendTransaction`) | ✅ (async state tracking) | useSWRMutation + revalidation | useMutation + invalidation |
| `useAction` (generic) | ✅ | — | — |
| Suspense | — | — | ✅ |
| Devtools | — | — | ✅ |
| Cache dedup | Store cache (by address) | SWR built-in | TanStack built-in |

## Design Decisions

**Client is an implementation detail.** Consumers use providers and hooks. `useClient()` is an escape hatch for power users, not the primary API. This matches how wagmi hides its core under React hooks.

**No per-RPC-method hooks.** Kit has dozens of RPC methods. Wrapping each in a hook adds maintenance surface without adding logic. `client.rpc.getEpochInfo().send()` is already ergonomic — adding `useGetEpochInfo()` would hide one line.

**Named hooks only for live data.** `useBalance` and `useAccount` earn their existence by hiding the RPC + subscription pairing, slot dedup, and response mapping. These are Solana-specific domain knowledge that developers shouldn't need to figure out. `useAccount` additionally hides the RPC encoding format and the `parseBase64RpcAccount` bridge between raw RPC responses and Kit's `Account` type, and progressively discloses decoding via an optional `decoder` argument.

**No one-shot read hook in core.** Plain React doesn't have a good data-fetching primitive — `useEffect` + `useState` + memoization is inherently clunky. Rather than build a mediocre version, we delegate to SWR/TanStack which already solve this well.

**Adapters bridge, not wrap.** The SWR and TanStack adapters provide a generic bridge from Kit's reactive store into the cache library. They don't re-implement the subscription logic — they just pipe `subscribe`/`getState`/`getError` into the cache library's subscription API.

**SSR-safe by default.** Every provider renders on the server without throwing, and every hook returns a hydration-stable "not yet available" snapshot during SSR. The wallet plugin explicitly ships a server stub (`status === 'pending'`, empty `wallets`, throwing actions) so its first render matches on both server and client. The live-data hooks (`useBalance`, `useAccount`, `useTransactionConfirmation`, `useLiveQuery`, `useSubscription`) skip the reactive-store factory entirely on non-browser builds — they return `{ data: undefined, isLoading: true }` without firing HTTP or opening WebSockets, then the real store kicks in on the client. We deliberately don't prefetch on the server even though we could: on-chain state moves fast enough that any prefetched value would usually mismatch the first client snapshot, and the hydration failure is worse than an extra loading flicker. For per-request clients (Next.js app router, Remix), `KitClientProvider`'s `client` prop accepts a pre-built client whose lifecycle the caller owns.

**Composable providers only.** A single `KitClientProvider` at the root creates the client and publishes the chain. Every other provider maps to a Kit plugin, and their nesting order is the plugin chain order. No bundle provider — one way to do things, no cliff when you need to customize. `PluginProvider` allows any Kit plugin to participate without shipping a React-specific wrapper.

**Explicit root, not implicit.** An earlier draft had `WalletProvider` lazily create the client and chain context when no ancestor was present, so the common case could skip a provider. In practice that made the provider hierarchy harder to reason about — debugging "where did this client come from?" meant tracing which wrapper silently created it. Making `KitClientProvider` a required explicit root costs one extra line in the common case and makes the client's origin obvious.

**`ChainIdentifier`, not just `SolanaChain`.** The chain prop on `KitClientProvider` accepts `SolanaChain | (IdentifierString & {})`. Known Solana chains (`"solana:mainnet"`, etc.) autocomplete as literals; any other wallet-standard-shaped identifier (`${string}:${string}`) is accepted as an escape hatch for custom chains and L2s. The `& {}` is the canonical TS trick for preserving literal autocomplete alongside a wider string-template type.

**No dedicated transfer/token/stake hooks.** `useSendTransaction()` is generic — it accepts any instruction, instruction plan, or transaction message. Dedicated hooks like `useSolTransfer()` or `useSplToken()` would be thin wrappers that don't add meaningful logic. They can be built on top by higher-level libraries.

**Transaction confirmation is subscription-backed.** `useTransactionConfirmation` uses `signatureNotifications` + `getSignatureStatuses` with slot-based dedup, rather than polling. This fits the core's philosophy that named hooks earn their place by hiding RPC + subscription pairing.

**Signer hooks duck-type on a per-capability subscribe convention, not on wallet state.** Earlier drafts had `usePayer` / `useIdentity` reach for `client.wallet.subscribe` directly to stay reactive. That coupled core signer hooks to the wallet plugin's type — a smell, since any reactive plugin (not just wallet) could install a dynamic `payer` or `identity`. The current design instead defines a per-capability subscribe convention: whoever installs `client.payer` can optionally install `client.subscribeToPayer(listener)` alongside it (same for `identity`). The hook observes that sibling if present, otherwise falls back to a no-op subscribe. This keeps the core hooks wallet-agnostic, supports future reactive plugins for free, and is a much smaller surface than a global `client.subscribe` primitive (which would force every reactive plugin to share one bus and cause over-rendering). Static plugins like `PayerProvider` participate implicitly by not installing a subscribe hook — the value never changes, so nothing needs to fire.

**Single chain per `KitClientProvider`.** Each `KitClientProvider` is scoped to one chain — discovery, connection, and signer creation all depend on it. Apps that need multiple chains (e.g. a mainnet trading section and a devnet testing section) use separate `KitClientProvider`s, which means separate clients and separate wallet connections. This is the correct behavior: a wallet that supports `solana:mainnet` may not support a different chain like `l2:mainnet`, so you can't safely share a connection across chains.

A future backward-compatible enhancement could enable opt-in state syncing between providers: if `WalletStorage` gained an optional `subscribe` method (matching the pattern used by Zustand's `persist` and TanStack Query's storage adapters), the plugin could react to external writes and auto-connect when a sibling provider connects. Both providers would still independently verify chain support — the shared storage just propagates the wallet selection, not the connection itself. Plain `localStorage` (no `subscribe`) would continue to work unchanged.

## Future directions

Items explicitly considered during design and deferred. None are blocking, but each has a concrete motivation that may trigger revisiting.

### Promote `subscribeTo<Capability>` to kit-core

The per-capability subscribe convention (see [Signer access](#signer-access)) currently lives in kit-react and is implemented by kit-plugin-wallet. The convention itself is framework-agnostic — any reactive framework (Vue's `shallowRef`, Svelte stores, Solid's `from()`) would want the same hook. The framework-side bridge is inherently framework-specific and not shareable, but the producer-side machinery (listener registry, unsubscribe idempotency, safe iteration during notify) is repeatable and ~20 lines of glue around `@solana/subscribable`'s existing `DataPublisher` / `ReactiveStore` primitives.

If a second reactive plugin appears (e.g. a relayer plugin whose `payer` rotates) or a second framework integration lands (Vue / Svelte bindings), graduate the convention to a kit-core helper:

```typescript
// Speculative kit-core API
function createCapabilityChangeNotifier(): {
    subscribe: (listener: () => void) => () => void;
    notify: () => void;
};
```

Until then, the convention stays documented here and re-implemented ad-hoc by kit-plugin-wallet. Callers don't need to know about the helper either way — they consume the `subscribeTo<Capability>` shape.

### Batched live-query hook

A hook like `useBalances([addr1, addr2, addr3])` that subscribes to multiple accounts in one call (analogous to wagmi's `useContracts`) is a common ask. It's deferred, not rejected.

Solana's `accountSubscribe` RPC method is one-at-a-time — there's no WebSocket-level batching to exploit. But a batched hook would still offer two things a fan-out of `useBalance` can't:

1. **Rules-of-hooks ergonomics.** `useBalance` inside a `.map()` over a dynamic list is illegal. A batched hook makes variable-length lists expressible.
2. **Batched initial read.** `getMultipleAccounts` fetches up to 100 accounts in one RPC call. A batched hook could seed N per-account stores from a single initial fetch, then fan out to N `accountSubscribe` calls for live updates.

The upstream primitive (`createReactiveStoreWithInitialValueAndSlotTracking` in `@solana/kit`) is 1:1 by design — one RPC request + one subscription → one store. A batched hook needs either a new upstream primitive (e.g. `createReactiveStoreWithBatchedInitialValuesAndSlotTracking`) or a variant of the existing one that accepts a pre-fetched initial value instead of performing the fetch itself.

Deferred until there's a concrete use case. The rules-of-hooks argument is the stronger motivator — revisit when someone hits it.

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
- **One-shot RPC hooks** (`useProgramAccounts`, `useLookupTable`, `useNonceAccount`, `useLatestBlockhash`, `useSimulateTransaction`) — delegated to the consumer's cache library (SWR or TanStack).
- **Wallet modal state** (`useWalletModalState`, `WalletConnectionManager`) — UI concern, left to consumer or UI libraries.
- **SWR query infrastructure** (`useSolanaRpcQuery`, query key scoping) — each cache library handles this natively.

#### What kit-react adds

Features that framework-kit does not provide:

- **Cache-library agnostic** — SWR and TanStack adapters, not locked to one.
- **`useAccount` with decoder** — progressive disclosure of typed account decoding.
- **`useLiveQuery`** — generic subscription-backed queries for any RPC + subscription pair.
- **`useSubscription`** — raw subscription hook for subscription-only data.
- **`PluginProvider`** — any Kit plugin works without a React-specific wrapper.
- **`PayerProvider` / `IdentityProvider`** — separate payer and identity from wallet.
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

**No adapter pattern.** wallet-adapter requires importing and instantiating adapters per wallet (`new PhantomWalletAdapter()`). kit-react uses wallet-standard — wallets register themselves, no imports needed.

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

**Today** — a custom `balanceSubscribe` function (~40 lines) that manually creates a `createReactiveStoreWithInitialValueAndSlotTracking`, manages `AbortController` lifecycle, bridges into SWR via `useSWRSubscription`, and tracks seen errors with a `WeakSet` to avoid duplicate dialogs.

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

**Today** — the slot indicator component (~50 lines) manually creates a reactive store from `rpcSubscriptions.slotNotifications().reactive()`, wires it into `useSyncExternalStore` with a custom subscribe/getSnapshot, and manages an `AbortController` in a `useEffect`.

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