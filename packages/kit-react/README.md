# `@solana/kit-react`

React bindings for [Solana Kit](https://github.com/anza-xyz/kit): providers, wallet hooks, and live on-chain data hooks.

`@solana/kit-react` is a thin layer over the framework-agnostic Kit plugins. You compose providers that mirror the plugin chain, and consume state via focused hooks (`useBalance`, `useConnectedWallet`, `useSendTransaction`, …) — no manual `useSyncExternalStore`, `AbortController`, or subscription plumbing.

## Install

```sh
pnpm add @solana/kit-react @solana/kit @solana/kit-plugin-wallet @solana/kit-plugin-instruction-plan react
```

## Quickstart

```tsx
import { KitClientProvider, WalletProvider, RpcProvider, useBalance, useConnectedWallet } from '@solana/kit-react';

function App() {
    return (
        <KitClientProvider chain="solana:mainnet">
            <WalletProvider>
                <RpcProvider url="https://api.mainnet-beta.solana.com">
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
```

## Providers

Every `@solana/kit-react` tree starts with a `KitClientProvider` at the root — it creates the Kit client and publishes the chain. Every other provider maps to a Kit plugin, reads the client from context, and extends it via `.use()`. The nesting order of those providers is the plugin chain order.

### `KitClientProvider`

Root provider. Creates the base Kit client and sets the chain context read by `useChain()`. The `chain` prop accepts any `SolanaChain` (with literal autocomplete) and, as an escape hatch, any wallet-standard `IdentifierString` (`${string}:${string}`) for custom or non-Solana chains.

```tsx
<KitClientProvider chain="solana:mainnet">
    <WalletProvider autoConnect role="signer">
        <RpcProvider url="…">
            <App />
        </RpcProvider>
    </WalletProvider>
</KitClientProvider>
```

### `WalletProvider`

Installs one of the [wallet plugins](../kit-plugin-wallet/README.md) — `walletSigner` (default), `walletPayer`, `walletIdentity`, or `walletWithoutSigner` — based on the `role` prop. Reads the chain from the enclosing `KitClientProvider`.

| Role         | Plugin                | Sets                               | Use when …                                          |
| ------------ | --------------------- | ---------------------------------- | --------------------------------------------------- |
| `"signer"`   | `walletSigner`        | `client.payer` + `client.identity` | Default — wallet both pays and signs                |
| `"payer"`    | `walletPayer`         | `client.payer`                     | Wallet pays fees but no `client.identity` is needed |
| `"identity"` | `walletIdentity`      | `client.identity`                  | A relayer (via `PayerProvider`) covers fees         |
| `"none"`     | `walletWithoutSigner` | (nothing; UI-only)                 | Manual signer access via `useConnectedWallet()`     |

### `RpcProvider` / `LiteSvmProvider`

`RpcProvider` installs `solanaRpc` (the full RPC plugin chain: RPC, subscriptions, transaction planning, execution). Requires `client.payer` to be set by an ancestor — throws at render otherwise.

```tsx
<RpcProvider url="https://api.mainnet-beta.solana.com" wsUrl="wss://api.mainnet-beta.solana.com" />
```

`LiteSvmProvider` is a drop-in replacement for tests — same capabilities, backed by a local LiteSVM instance.

### `PayerProvider` / `IdentityProvider`

Set `client.payer` or `client.identity` from an explicit `TransactionSigner`. Use when the payer / identity is not the connected wallet.

```tsx
<KitClientProvider chain="solana:mainnet">
    <WalletProvider role="identity">
        <PayerProvider signer={relayerSigner}>
            <RpcProvider url="…">
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

## Hooks

### Client access

| Hook                   | Returns                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `useClient<TClient>()` | The current Kit client (typed via type assertion).                                       |
| `useChain()`           | The configured `ChainIdentifier` (e.g. `'solana:devnet'`, or a custom IdentifierString). |

`useClient` is a power-user escape hatch. Prefer higher-level hooks when available.

### Wallet

State hooks (each subscribes only to its own slice for fine-grained re-rendering):

| Hook                   | Returns                                            |
| ---------------------- | -------------------------------------------------- |
| `useWallets()`         | `readonly UiWallet[]` — all discovered wallets.    |
| `useWalletStatus()`    | `'pending' \| 'disconnected' \| 'connecting' \| …` |
| `useConnectedWallet()` | `{ account, signer, wallet } \| null`.             |
| `useWalletState()`     | Full snapshot (prefer the focused hooks for perf). |

Action hooks return stable functions:

```tsx
const connect = useConnectWallet(); // (wallet) => Promise<readonly UiWalletAccount[]>
const disconnect = useDisconnectWallet(); // () => Promise<void>
const selectAccount = useSelectAccount(); // (account) => void
const signMessage = useSignMessage(); // (message: Uint8Array) => Promise<SignatureBytes>
const signIn = useSignIn(); // (wallet, input?) => Promise<SolanaSignInOutput>
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
    {
        rpcRequest: client.rpc.getAccountInfo(addr, { encoding: 'base64' }),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(addr, { encoding: 'base64' }),
        rpcValueMapper: v => (v ? parseGame(parseBase64RpcAccount(addr, v)) : null),
        rpcSubscriptionValueMapper: v => (v ? parseGame(parseBase64RpcAccount(addr, v)) : null),
    },
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

### Generic async action

`useAction` wraps any async function with reactive status / data / error tracking. It's the building block behind `useSendTransaction` and is exported for custom flows (sign-then-send, partial signing, aggregator submission):

```tsx
const { send: plan, data: message } = useAction(input => client.planTransaction(input));
const { send: sign, data: signed } = useAction(msg => signTransactionMessageWithSigners(msg));
const { send: sendSigned, status } = useAction(tx =>
    sendAndConfirmTransaction(client.rpc, tx, { commitment: 'confirmed' }),
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

## Third-party extensions

Any Kit plugin works with `kit-react` out of the box via `PluginProvider`. A plugin author can optionally ship typed convenience hooks:

```tsx
// @my-org/kit-react-das
import { useClient } from '@solana/kit-react';
import type { DasClient } from '@my-org/kit-plugin-das';

export function useAsset(address: Address) {
    const client = useClient<DasClient>();
    return useSWR(['das-asset', address], () => client.das.getAsset(address).send());
}
```

Consumers just import `useAsset` — they never need to touch `useClient` or know about the underlying plugin.

## See also

- [`@solana/kit-plugin-wallet`](../kit-plugin-wallet/README.md)
- [`@solana/kit-plugin-rpc`](../kit-plugin-rpc/README.md)
- [`@solana/kit-plugin-instruction-plan`](../kit-plugin-instruction-plan/README.md)
- [`@solana/kit-plugin-litesvm`](../kit-plugin-litesvm/README.md)
