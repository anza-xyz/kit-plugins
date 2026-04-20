# `@solana/kit-react`

React bindings for [Solana Kit](https://github.com/anza-xyz/kit): providers, signer hooks, wallet hooks, and live on-chain data hooks.

`@solana/kit-react` is a thin layer over the framework-agnostic Kit plugins. You compose providers that mirror the plugin chain, and consume state via focused hooks (`useBalance`, `usePayer`, `useSendTransaction`, …) — no manual `useSyncExternalStore`, `AbortController`, or subscription plumbing.

The package exposes two entry points:

- `@solana/kit-react` — core providers and hooks (RPC, signer, live-data, transactions). Wallet-agnostic: read-only dashboards, keypair-driven bots, and server-side flows can depend on core alone.
- `@solana/kit-react/wallet` — `<WalletProvider>` and wallet hooks for apps that connect to a user wallet. Peer-depends on `@solana/kit-plugin-wallet` (declared optional, so apps that don't use wallet don't pull it in).

## Install

```sh
# Core — enough for read-only apps, bots, and server flows.
pnpm add @solana/kit-react @solana/kit @solana/kit-plugin-instruction-plan react

# Add the wallet plugin if your app connects to a user wallet.
pnpm add @solana/kit-plugin-wallet
```

## Quickstart

```tsx
import { KitClientProvider, RpcProvider, useBalance } from '@solana/kit-react';
import { useConnectedWallet, useConnectWallet, useWallets, WalletProvider } from '@solana/kit-react/wallet';

function App() {
    return (
        <KitClientProvider chain="solana:mainnet">
            <WalletProvider>
                <RpcProvider rpcUrl="https://api.mainnet-beta.solana.com">
                    <Dashboard />
                </RpcProvider>
            </WalletProvider>
        </KitClientProvider>
    );
}

function Dashboard() {
    const connected = useConnectedWallet();
    const { data: balance, isLoading } = useBalance(connected?.account.address ?? null);

    if (!connected) return <ConnectButton />;
    if (isLoading) return <span>Loading balance…</span>;
    return <span>Balance: {balance?.toString()} lamports</span>;
}

function ConnectButton() {
    const wallets = useWallets();
    const connect = useConnectWallet();
    return wallets.map(w => (
        <button key={w.name} onClick={() => connect(w)}>
            Connect {w.name}
        </button>
    ));
}
```

## Providers

Every `@solana/kit-react` tree starts with a `KitClientProvider` at the root — it creates the Kit client and publishes the chain. Every other provider maps to a Kit plugin, reads the client from context, and extends it via `.use()`. The nesting order of those providers is the plugin chain order.

### `KitClientProvider`

Root provider. Creates the base Kit client and sets the chain context read by `useChain()`. The `chain` prop accepts any `SolanaChain` (with literal autocomplete) and, as an escape hatch, any wallet-standard `IdentifierString` (`${string}:${string}`) for custom or non-Solana chains.

```tsx
<KitClientProvider chain="solana:mainnet">
    <WalletProvider autoConnect role="signer">
        <RpcProvider rpcUrl="…">
            <App />
        </RpcProvider>
    </WalletProvider>
</KitClientProvider>
```

For SSR, custom client factories, or sharing a client across trees, pass the pre-built client directly via the optional `client` prop. Ownership tracks the prop: when omitted, the provider creates and disposes the client for you; when provided, the caller owns the lifecycle.

```tsx
const client = createClient().use(solanaRpc({ rpcUrl })).use(telemetryPlugin());

<KitClientProvider chain="solana:mainnet" client={client}>
    <App />
</KitClientProvider>;
```

Don't mount a downstream provider whose plugin is already baked into the supplied client — a dev-mode warning flags this.

### `RpcProvider` / `LiteSvmProvider`

`RpcProvider` installs `solanaRpc` (the full RPC plugin chain: RPC, subscriptions, transaction planning, execution). Props extend `SolanaRpcConfig` from [`@solana/kit-plugin-rpc`](../kit-plugin-rpc/README.md) directly, so any option the plugin accepts (`rpcUrl`, `rpcSubscriptionsUrl`, `maxConcurrency`, `rpcConfig`, `rpcSubscriptionsConfig`, `skipPreflight`, `transactionConfig`) is available as a prop. Requires `client.payer` to be set by an ancestor — throws at render otherwise.

```tsx
<RpcProvider rpcUrl="https://api.mainnet-beta.solana.com" rpcSubscriptionsUrl="wss://api.mainnet-beta.solana.com" />
```

`LiteSvmProvider` is a drop-in replacement for tests — same capabilities, backed by a local LiteSVM instance.

#### Read-only apps

If your app doesn't send transactions — explorers, dashboards, on-chain watchers, server-side scripts — use `RpcReadOnlyProvider` instead of `RpcProvider`. It installs `client.rpc`, `client.rpcSubscriptions`, and `client.getMinimumBalance` without the transaction-planning / sending halves, so no `WalletProvider` or `PayerProvider` is needed upstream.

```tsx
import { KitClientProvider, RpcReadOnlyProvider } from '@solana/kit-react';

<KitClientProvider chain="solana:mainnet">
    <RpcReadOnlyProvider rpcUrl="https://api.mainnet-beta.solana.com">
        <Dashboard />
    </RpcReadOnlyProvider>
</KitClientProvider>;
```

`useBalance`, `useAccount`, `useTransactionConfirmation`, `useLiveQuery`, and `useSubscription` all work against this lighter stack; only the transaction hooks (`useSendTransaction`, `useSendTransactions`, `usePlanTransaction`, `usePlanTransactions`) require the full `RpcProvider`.

For more fine-grained read-only stacks (e.g. `client.rpc` only, no subscriptions), compose the individual plugins via `PluginProvider` and `solanaRpcConnection` / `solanaRpcSubscriptionsConnection` from [`@solana/kit-plugin-rpc`](../kit-plugin-rpc/README.md).

### `PayerProvider` / `IdentityProvider`

Set `client.payer` or `client.identity` from an explicit `TransactionSigner`. Use when the payer / identity is not the connected wallet.

```tsx
<KitClientProvider chain="solana:mainnet">
    <WalletProvider role="identity">
        <PayerProvider signer={relayerSigner}>
            <RpcProvider rpcUrl="…">
                <App />
            </RpcProvider>
        </PayerProvider>
    </WalletProvider>
</KitClientProvider>
```

### `PluginProvider`

Installs any Kit plugin without needing a plugin-specific React wrapper.

```tsx
<PluginProvider plugin={dasPlugin({ endpoint: '…' })}>
    <App />
</PluginProvider>

<PluginProvider plugins={[dasPlugin({ endpoint: '…' }), tokenPlugin(), memoPlugin()]}>
    <App />
</PluginProvider>
```

Plugin identity must be stable across renders — memoize it in the caller.

### `<WalletProvider>`

Ships under the `@solana/kit-react/wallet` entry. Installs a wallet plugin under the enclosing `<KitClientProvider>`; the `role` prop selects which plugin variant is installed:

| `role`                 | Plugin                | Sets `client.payer` | Sets `client.identity` |
| ---------------------- | --------------------- | ------------------- | ---------------------- |
| `"signer"` _(default)_ | `walletSigner`        | ✅                  | ✅                     |
| `"payer"`              | `walletPayer`         | ✅                  | —                      |
| `"identity"`           | `walletIdentity`      | —                   | ✅                     |
| `"none"`               | `walletWithoutSigner` | —                   | —                      |

Props: `role`, `autoConnect`, `storage`, `storageKey`, `filter` — all forwarded to the underlying plugin.

```tsx
import { WalletProvider } from '@solana/kit-react/wallet';

<WalletProvider autoConnect role="signer">
    <App />
</WalletProvider>;
```

See the [wallet section](#wallet-bindings) below for state / action hooks and the gotchas around `filter` / `storage` identity.

## Hooks

### Client access

| Hook                   | Returns                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `useClient<TClient>()` | The current Kit client (typed via type assertion).                                       |
| `useChain()`           | The configured `ChainIdentifier` (e.g. `'solana:devnet'`, or a custom IdentifierString). |

`useClient` is a power-user escape hatch. Prefer higher-level hooks when available.

### Signers

`usePayer()` / `useIdentity()` return the current `client.payer` / `client.identity`, or `null` when unavailable (e.g. wallet-backed and no wallet connected). Both throw a capability error if the relevant plugin isn't installed. They stay reactive against any plugin that advertises the `subscribeToPayer` / `subscribeToIdentity` convention — wallet plugins from `@solana/kit-plugin-wallet` install this, so the hooks re-render as the wallet connects / disconnects without `kit-react` importing from the wallet package at all.

```tsx
const payer = usePayer(); // TransactionSigner | null
if (!payer) return <ConnectButton />;
```

For direct access to the connected wallet's signer (gated on wallet connection), use `useWalletSigner()` from `@solana/kit-react/wallet`.

#### `subscribeTo<Capability>` convention

Plugin authors whose `payer` or `identity` is reactive should install a sibling `subscribeToPayer(listener): () => void` (or `subscribeToIdentity`) alongside the capability itself. `usePayer` / `useIdentity` subscribe to it via `useSyncExternalStore` and re-read the capability on every notification. Static plugins (like `PayerProvider`) don't need to install anything — the hook falls back to a no-op subscribe.

```typescript
// Expected shape, duck-typed by usePayer / useIdentity:
type ClientWithSubscribeToPayer = {
    readonly subscribeToPayer: (listener: () => void) => () => void;
};
```

### Live data

Named hooks for common RPC + subscription pairings. All use slot-based dedup so stale RPC responses never overwrite newer subscription notifications. Pass `null` for the address / signature to disable the query.

```tsx
const { data, error, isLoading } = useBalance(address);
const { data } = useAccount(address); // EncodedAccount | null
const { data } = useAccount(gameAddress, getGameCodec()); // Account<GameData> | null
const { data } = useTransactionConfirmation(signature);
```

For custom RPC + subscription combinations, use the generic hooks:

```tsx
const { data: slot } = useSubscription(() => client.rpcSubscriptions.slotNotifications(), [client]);

const { data: game } = useLiveQuery(
    () => ({
        rpcRequest: client.rpc.getAccountInfo(addr, { encoding: 'base64' }),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(addr, { encoding: 'base64' }),
        rpcValueMapper: v => (v ? parseGame(parseBase64RpcAccount(addr, v)) : null),
        rpcSubscriptionValueMapper: v => (v ? parseGame(parseBase64RpcAccount(addr, v)) : null),
    }),
    [client, addr],
);
```

### Transactions

`useSendTransaction` accepts the same inputs as `client.sendTransaction`: a raw instruction, an instruction plan, a transaction message, or a pre-built single-transaction plan.

```tsx
const { send, status, data, error, reset } = useSendTransaction();
await send(getTransferInstruction({ source, destination, amount }));

// With the fluent program client API
await send(client.system.instructions.transfer({ source, destination, amount }));
```

`useSendTransactions` is the multi-transaction variant.

#### Preview then send

`usePlanTransaction` / `usePlanTransactions` mirror the send hooks but stop after planning — useful when you want to show a confirmation modal with the computed fee / writable accounts / instruction summary before executing. The planned output feeds straight back into `useSendTransaction().send(...)`.

```tsx
const { send: plan, data: planned } = usePlanTransaction();
const { send: execute } = useSendTransaction();

await plan(getTransferInstruction({ source, destination, amount }));
// render a preview using `planned.message.instructions`, …
await execute(planned); // SingleTransactionPlan is valid sendTransaction input
```

### Generic async action

`useAction` wraps any async function with reactive status / data / error tracking. It's the building block behind `useSendTransaction` and is exported for custom flows (sign-then-send, partial signing, aggregator submission).

The wrapped function receives an `AbortSignal` as its first argument — thread it into your `fetch`/RPC options for real cancellation, or ignore it with `_signal`. When `send` is called again (or `reset()` runs) while a prior call is in flight, that prior call is aborted: its `await` rejects with `AbortError` and its outcome is never written to state. Callers should filter `AbortError` to avoid surfacing stale errors:

```tsx
try {
    await send(...);
} catch (err) {
    if ((err as Error).name === 'AbortError') return; // superseded by a newer call
    // handle real error
}
```

Example composition (sign-then-send):

```tsx
const { send: plan, data: message } = useAction((_signal, input: InstructionPlanInput) =>
    client.planTransaction(input),
);
const { send: sign, data: signed } = useAction((_signal, msg: TransactionMessage) =>
    signTransactionMessageWithSigners(msg),
);
const { send: sendSigned, status } = useAction((signal, tx: Transaction) =>
    sendAndConfirmTransaction(client.rpc, tx, { abortSignal: signal, commitment: 'confirmed' }),
);

await plan(getTransferInstruction({ source, destination, amount }));
await sign(message);
await sendSigned(signed);
```

Only the most recent in-flight call updates state — rapid successive clicks won't leak stale results.

### One-shot reads

Not provided. Plain React doesn't have a good data-fetching primitive, so delegate one-shots to your cache library of choice:

```tsx
// SWR
const { data } = useSWR(['epochInfo'], () => client.rpc.getEpochInfo().send());

// TanStack Query
const { data } = useQuery({
    queryKey: ['epochInfo'],
    queryFn: ({ signal }) => client.rpc.getEpochInfo().send({ abortSignal: signal }),
});
```

## Wallet bindings

Imported from `@solana/kit-react/wallet`. Peer-depends on `@solana/kit-plugin-wallet`; the peer dependency is declared optional, so apps that don't use wallet don't pull it in.

### State hooks

Granular hooks that each subscribe to a single slice of wallet state:

- `useWallets()` — all discovered wallets.
- `useWalletStatus()` — `'pending' | 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'reconnecting'`.
- `useConnectedWallet()` — the active `{ account, wallet }` or `null`.
- `useWalletSigner()` — the connected signer, or `null` for read-only wallets / when disconnected.
- `useWalletState()` — the full snapshot.

**Prefer the focused hooks** in components that only care about one slice. A wallet-discovery event won't re-render a component that only reads `useWalletStatus()`, and vice versa. Reach for `useWalletState()` when you genuinely want the one-object shape (debug panels, dev tools, components that need everything at once) — it re-renders on every state change, same as the focused hooks combined.

#### `useConnectedWallet` and `useWalletSigner` are deliberately separate

A connected wallet is not necessarily a signing wallet. Read-only (watch-only) wallets, or wallets that don't support the configured chain, surface as `useConnectedWallet() !== null && useWalletSigner() === null`. Splitting them keeps that contract in the types — a single combined `{ account, signer, wallet }` shape tempts callers into writing `connected.signer.signTransactions(...)` without a null check, which crashes silently on read-only wallets.

```tsx
function SendButton() {
    const connected = useConnectedWallet();
    const signer = useWalletSigner();

    if (!connected) return <ConnectButton />;
    if (!signer) return <span>This wallet is read-only — connect a signing wallet to send.</span>;
    // ... safe to call signer.signTransactions(...)
}
```

### Action hooks

Verb-first hooks that return stable function references:

- `useConnectWallet()` — `(wallet) => Promise<accounts>`.
- `useDisconnectWallet()` — `() => Promise<void>`.
- `useSelectAccount()` — `(account) => void`.
- `useSignMessage()` — `(message) => Promise<SignatureBytes>`.
- `useSignIn()` — `(wallet, input?) => Promise<SolanaSignInOutput>` (Sign In With Solana).

### Signer access

`usePayer` / `useIdentity` live in core (`@solana/kit-react`); they stay reactive against wallet changes via the `subscribeToPayer` / `subscribeToIdentity` convention that `@solana/kit-plugin-wallet` implements.

For flows that specifically need the connected wallet's signer (independent of the payer/identity roles), use `useWalletSigner()`.

### Signing transactions separately from sending

For the common end-to-end flow, reach for `useSendTransaction` from core — it routes through whichever signing capability the connected wallet supports (`solana:signAndSendTransaction` or `solana:signTransaction` + submit-to-RPC) without the caller having to care.

Some flows genuinely need a sign-only step — DeFi aggregators that submit the signed bytes to their own API, multi-sig coordination, transactions that go through a relayer. There's no named hook for this, by design; compose `useAction` with the relevant Kit signing function and guard on `useWalletSigner()`:

```tsx
import { useAction } from '@solana/kit-react';
import { useWalletSigner } from '@solana/kit-react/wallet';
import { signTransactionMessageWithSigners } from '@solana/kit';

function SignAndSubmit() {
    const signer = useWalletSigner();
    const {
        send: sign,
        status,
        error,
    } = useAction(async (signal, message: TransactionMessageWithFeePayerAndBlockhashLifetime) => {
        if (!signer) throw new Error('No signing wallet connected.');
        const signed = await signTransactionMessageWithSigners(message);
        return submitToAggregator(signed, { signal });
    });
    // …
}
```

Kit's signing functions cover the four input/output combinations (`signTransactionMessageWithSigners` / `partiallySignTransactionMessageWithSigners` / `signTransaction` / `partiallySignTransaction`) — use whichever fits the flow.

#### Wallet-feature caveat

**Sign-only is not portable across all wallets.** Some wallets — notably some mobile / MWA-style wallets and some hardware setups — only implement `solana:signAndSendTransaction` and refuse to hand back a signed transaction at all. Calling a sign-only Kit function against such a wallet's signer will throw.

If your flow genuinely requires sign-only, gate UI on the connected wallet's features:

```tsx
const connected = useConnectedWallet();
const canSignOnly = connected?.wallet.features.includes('solana:signTransaction') ?? false;

if (!canSignOnly) {
    return (
        <span>
            This wallet only supports sign-and-send. Connect a wallet that supports separate signing to continue.
        </span>
    );
}
```

Or filter such wallets out at `<WalletProvider filter={…}>` so they never reach the picker in the first place:

```tsx
const requireSeparateSigning = (w: UiWallet) => w.features.includes('solana:signTransaction');

<WalletProvider filter={requireSeparateSigning}>…</WalletProvider>;
```

Prefer the filter-at-the-top approach for apps that fundamentally require sign-only — it keeps the rest of the app from handling the degraded case.

### Gotchas

#### Keep `filter`, `storage`, and `storageKey` identity stable

`<WalletProvider>` rebuilds the underlying wallet plugin when any of `filter`, `storage`, or `storageKey` change identity. Rebuilding re-creates the wallet store, which tears down discovery and drops the active connection. For `filter` in particular — it's a function — inline-declaring it with `filter={(w) => …}` means a fresh identity on every render, which means _the wallet disconnects on every render_.

A dev-mode warning fires after two consecutive renders of identity churn on any of these props. To stay stable, either hoist to module scope or memoize:

```tsx
// ✅ Hoist to module scope (cleanest — identity is stable forever)
const requireSignAndSend = (w: UiWallet) => w.features.includes('solana:signAndSendTransaction');

function App() {
    return (
        <WalletProvider filter={requireSignAndSend}>
            <AppContent />
        </WalletProvider>
    );
}

// ✅ useMemo when the filter depends on render-time values
function App({ allowedNames }: { allowedNames: readonly string[] }) {
    const filter = useMemo(() => (w: UiWallet) => allowedNames.includes(w.name), [allowedNames]);
    return <WalletProvider filter={filter}>…</WalletProvider>;
}

// ❌ Inline arrow — fresh identity every render, wallet rebuilds constantly
<WalletProvider filter={w => w.features.includes('solana:signAndSendTransaction')}>…</WalletProvider>;
```

The same rule applies to `storage` (custom storage adapters) and `storageKey` if you compute it dynamically.

#### Don't mount `<WalletProvider>` on a client that already has a wallet plugin

If you passed a pre-built client to `<KitClientProvider client={…}>` that already calls `walletSigner()` / `walletPayer()` / etc., don't also mount `<WalletProvider>` below — the plugin gets installed twice and the two instances compete for `client.wallet`. The provider throws in both dev and prod when it detects a double-install; the fix is to drop either the bundled plugin or the provider.

## Third-party extensions

Any Kit plugin works with `kit-react` out of the box via `PluginProvider`. A plugin author can optionally ship typed convenience hooks, either with the bare `useClient<T>()` cast or — recommended — with `useClientCapability<T>()` which adds a runtime-checked narrowing so missing providers fail loudly at mount with a consistent error message:

```tsx
// @my-org/kit-react-das
import { useClientCapability } from '@solana/kit-react';
import type { DasClient } from '@my-org/kit-plugin-das';

export function useAsset(address: Address) {
    const client = useClientCapability<DasClient>({
        capability: 'das',
        hookName: 'useAsset',
        providerHint: 'Usually supplied by <DasProvider>.',
    });
    return useSWR(['das-asset', address], () => client.das.getAsset(address).send());
}
```

`capability` accepts a single key or an ordered list; each entry is asserted via `key in client` at runtime and included in the thrown error when absent. Consumers just import `useAsset` — they never need to touch `useClient` or know about the underlying plugin.

## Server-side rendering

`@solana/kit-react` is SSR-safe by default. You can mount every provider and call every hook during server render without firing network traffic or producing hydration mismatches.

- **Providers render cleanly on the server** — `KitClientProvider`, `RpcProvider`, `WalletProvider`, etc. all render without throwing. No side effects run until client-side hydration.
- **Live-data hooks are inert on the server.** `useBalance`, `useAccount`, `useTransactionConfirmation`, `useLiveQuery`, and `useSubscription` return `{ data: undefined, isLoading: true }` during SSR without issuing HTTP or opening WebSockets. The real fetch + subscription kicks in on the client. Design components for the loading state; hydration then swaps in real data as it arrives (just like any client-only fetch).

### Per-request clients

For frameworks that expect a fresh client per request (Next.js app router, Remix loaders), build the client outside React and pass it via `KitClientProvider`'s `client` prop — ownership stays with the caller, so the provider won't dispose it on unmount:

```tsx
// e.g. a Next.js server component wrapper
import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { KitClientProvider } from '@solana/kit-react';

export default function AppShell({ children }: { children: React.ReactNode }) {
    const client = createClient().use(solanaRpc({ rpcUrl: process.env.RPC_URL! }));
    return (
        <KitClientProvider chain="solana:mainnet" client={client}>
            {children}
        </KitClientProvider>
    );
}
```

## See also

- [`@solana/kit-plugin-wallet`](../kit-plugin-wallet/README.md)
- [`@solana/kit-plugin-rpc`](../kit-plugin-rpc/README.md)
- [`@solana/kit-plugin-instruction-plan`](../kit-plugin-instruction-plan/README.md)
- [`@solana/kit-plugin-litesvm`](../kit-plugin-litesvm/README.md)
