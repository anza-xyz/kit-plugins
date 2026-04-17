# `@solana/kit-react-wallet`

React bindings for [`@solana/kit-plugin-wallet`](../kit-plugin-wallet): the `WalletProvider` component and the wallet hooks that read from / act on a connected wallet.

Sits on top of [`@solana/kit-react`](../kit-react), which owns the client, chain context, RPC and signer providers. Use `kit-react-wallet` whenever your app needs a user wallet; skip it for read-only dashboards, bots with keypair signers, or server-side flows.

## Installation

```sh
pnpm add @solana/kit-react @solana/kit-react-wallet @solana/kit @solana/kit-plugin-wallet
```

## Usage

```tsx
import { KitClientProvider, RpcProvider } from '@solana/kit-react';
import { WalletProvider, useConnectedWallet, useConnectWallet, useWallets } from '@solana/kit-react-wallet';

function App() {
    return (
        <KitClientProvider chain="solana:mainnet">
            <WalletProvider>
                <RpcProvider
                    rpcUrl="https://api.mainnet-beta.solana.com"
                    rpcSubscriptionsUrl="wss://api.mainnet-beta.solana.com"
                >
                    <Connect />
                </RpcProvider>
            </WalletProvider>
        </KitClientProvider>
    );
}

function Connect() {
    const wallets = useWallets();
    const connect = useConnectWallet();
    const connected = useConnectedWallet();

    if (connected) return <span>Connected: {connected.account.address}</span>;
    return wallets.map(w => (
        <button key={w.name} onClick={() => connect(w)}>
            Connect {w.name}
        </button>
    ));
}
```

## API

### `<WalletProvider>`

Installs a wallet plugin under the enclosing `<KitClientProvider>`. The `role` prop selects which plugin variant is installed:

| `role`                 | Plugin                | Sets `client.payer` | Sets `client.identity` |
| ---------------------- | --------------------- | ------------------- | ---------------------- |
| `"signer"` _(default)_ | `walletSigner`        | ✅                  | ✅                     |
| `"payer"`              | `walletPayer`         | ✅                  | —                      |
| `"identity"`           | `walletIdentity`      | —                   | ✅                     |
| `"none"`               | `walletWithoutSigner` | —                   | —                      |

Props: `role`, `autoConnect`, `storage`, `storageKey`, `filter` — all forwarded to the underlying plugin.

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

`usePayer` / `useIdentity` live in [`@solana/kit-react`](../kit-react); they stay reactive against wallet changes via the `subscribeToPayer` / `subscribeToIdentity` convention that `@solana/kit-plugin-wallet` implements. Import them from `@solana/kit-react`.

For flows that specifically need the connected wallet's signer (independent of the payer/identity roles), use `useWalletSigner()`.

## Gotchas

### Keep `filter`, `storage`, and `storageKey` identity stable

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

### Don't mount `<WalletProvider>` on a client that already has a wallet plugin

If you passed a pre-built client to `<KitClientProvider client={…}>` that already calls `walletSigner()` / `walletPayer()` / etc., don't also mount `<WalletProvider>` below — the plugin gets installed twice and the two instances compete for `client.wallet`. A dev-mode warning flags this; the fix is to drop either the bundled plugin or the provider.
