# Kit Plugins ➤ Wallet

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugin-wallet.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugin-wallet.svg?style=flat&label=%40solana%2Fkit-plugin-wallet
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugin-wallet

This package provides plugins that add browser wallet support to your Kit clients using [wallet-standard](https://github.com/wallet-standard/wallet-standard). They handle wallet discovery, connection lifecycle, account selection, and signer creation.

Four plugin functions are exported — each adds a `client.wallet` namespace, but they differ in how the connected wallet's signer is exposed on the client:

| Plugin                | `client.payer` | `client.identity` | Use case                                                      |
| --------------------- | -------------- | ----------------- | ------------------------------------------------------------- |
| `walletSigner`        | wallet signer  | wallet signer     | Most dApps — wallet pays fees and signs as the user identity. |
| `walletPayer`         | wallet signer  | —                 | Wallet pays fees; identity is managed separately.             |
| `walletIdentity`      | —              | wallet signer     | Backend relayer pays fees; wallet provides user identity.     |
| `walletWithoutSigner` | —              | —                 | Wallet state only; payer and identity are managed separately. |

## Installation

```sh
pnpm install @solana/kit-plugin-wallet
```

## Quick start

```ts
import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { walletSigner } from '@solana/kit-plugin-wallet';
import { planAndSendTransactions } from '@solana/kit-plugin-instruction-plan';

const client = createClient()
    .use(walletSigner({ chain: 'solana:mainnet' }))
    .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(planAndSendTransactions());

// Read discovered wallets from state
const { wallets } = client.wallet.getState();

// Connect a wallet
await client.wallet.connect(wallets[0]);

// client.payer and client.identity are now the connected wallet's signer
await client.sendTransaction([myInstruction]);
```

## `walletSigner` plugin

Syncs the connected wallet's signer to both `client.payer` and `client.identity`. This is the most common choice for dApps where the user's wallet pays fees and signs as the transaction identity.

```ts
import { walletSigner } from '@solana/kit-plugin-wallet';

const client = createClient()
    .use(walletSigner({ chain: 'solana:mainnet' }))
    .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(planAndSendTransactions());
```

## `walletPayer` plugin

Syncs the connected wallet's signer to `client.payer` only. Use this when you need the wallet as the fee payer but don't need `client.identity`. For most dApps, prefer `walletSigner` which sets both.

```ts
import { walletPayer } from '@solana/kit-plugin-wallet';

const client = createClient()
    .use(walletPayer({ chain: 'solana:mainnet' }))
    .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(planAndSendTransactions());
```

## `walletIdentity` plugin

Syncs the connected wallet's signer to `client.identity` only. Use this when a separate payer (e.g. a backend relayer) pays transaction fees, but the user's wallet is needed as the identity signer.

```ts
import { payer } from '@solana/kit-plugin-signer';
import { walletIdentity } from '@solana/kit-plugin-wallet';

const client = createClient()
    .use(payer(relayerKeypair))
    .use(walletIdentity({ chain: 'solana:mainnet' }))
    .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(planAndSendTransactions());

// client.payer is always relayerKeypair
// client.identity is the connected wallet's signer
```

## `walletWithoutSigner` plugin

Adds `client.wallet` without setting `client.payer` or `client.identity`. Use this alongside separate `payer()` and/or `identity()` plugins, or when the wallet's signer is used explicitly in instructions.

```ts
import { payer } from '@solana/kit-plugin-signer';
import { walletWithoutSigner } from '@solana/kit-plugin-wallet';

const client = createClient()
    .use(payer(backendKeypair))
    .use(walletWithoutSigner({ chain: 'solana:mainnet' }))
    .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(planAndSendTransactions());

// client.payer is always backendKeypair
// client.wallet.getState().connected?.signer for manual use
```

## State and actions

All wallet state is accessed via `client.wallet.getState()`, which returns a referentially stable `WalletState` object (new reference only when something changes).

- **`getState().wallets`** — All discovered wallets that support the configured chain.

    ```ts
    const { wallets } = client.wallet.getState();
    for (const w of wallets) {
        console.log(w.name, w.icon);
    }
    ```

- **`getState().connected`** — The active connection (wallet, account, and signer), or `null` when disconnected.

    ```ts
    const { connected } = client.wallet.getState();
    console.log(connected?.account.address);
    ```

- **`getState().status`** — The current connection status: `'pending'`, `'disconnected'`, `'connecting'`, `'connected'`, `'disconnecting'`, or `'reconnecting'`.

- **`connect(wallet)`** — Connect to a wallet and select the first newly authorized account.

    ```ts
    const accounts = await client.wallet.connect(selectedWallet);
    ```

- **`disconnect()`** — Disconnect the active wallet.

- **`selectAccount(account)`** — Switch to a different account within an already-authorized wallet without reconnecting.

    ```ts
    client.wallet.selectAccount(accounts[0]);
    ```

- **`signMessage(message)`** — Sign a raw message with the connected account.

    ```ts
    const signature = await client.wallet.signMessage(new TextEncoder().encode('Hello'));
    ```

- **`signIn(wallet, input)`** — Sign In With Solana (SIWS-as-connect). Connects the wallet, calls `solana:signIn`, and sets up full connection state. Pass `{}` for `input` if no sign-in customization is needed. To sign in with the already-connected wallet, pass `getState().connected.wallet`.

    ```ts
    const output = await client.wallet.signIn(selectedWallet, { domain: window.location.host });
    ```

## Framework integration

The plugin exposes `subscribe` and `getState` for binding wallet state to any UI framework.

**React** — use `useSyncExternalStore` for concurrent-mode-safe rendering:

```tsx
import { useSyncExternalStore } from 'react';

function useWalletState() {
    return useSyncExternalStore(client.wallet.subscribe, client.wallet.getState);
}

function App() {
    const { wallets, connected, status } = useWalletState();

    if (status === 'pending') return null; // avoid flashing a connect button before auto-reconnect

    if (!connected) {
        return wallets.map(w => (
            <button key={w.name} onClick={() => client.wallet.connect(w)}>
                {w.name}
            </button>
        ));
    }

    return <p>Connected: {connected.account.address}</p>;
}
```

**Vue** — use a `shallowRef` composable:

```ts
import { onMounted, onUnmounted, shallowRef } from 'vue';

function useWalletState() {
    const state = shallowRef(client.wallet.getState());
    onMounted(() => {
        const unsub = client.wallet.subscribe(() => {
            state.value = client.wallet.getState();
        });
        onUnmounted(unsub);
    });
    return state;
}
```

**Svelte** — wrap in a `readable` store:

```ts
import { readable } from 'svelte/store';

export const walletState = readable(client.wallet.getState(), set => {
    return client.wallet.subscribe(() => set(client.wallet.getState()));
});
```

## Configuration

```ts
walletSigner({
    chain: 'solana:mainnet', // required
    storage: sessionStorage, // default: localStorage (null to disable)
    storageKey: 'my-app:wallet', // default: 'kit-wallet'
    autoConnect: false, // default: true (disable silent reconnect)
    filter: w => w.features.includes('solana:signAndSendTransaction'), // optional
});
```

## Persistence

By default the plugin uses `localStorage` to remember the last connected wallet and auto-reconnects on the next page load. Pass `storage: null` to disable, or provide a custom adapter (e.g. `sessionStorage` or an IndexedDB wrapper).

## SSR / server-side rendering

All four wallet plugins are safe to include in a shared client that runs on both server and browser. On the server, `status` stays `'pending'` permanently, all actions throw, and no registry listeners or storage reads are made. In the browser the plugin initializes normally.

```ts
const client = createClient()
    .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(walletSigner({ chain: 'solana:mainnet' }))
    .use(planAndSendTransactions());

// Server: status === 'pending', client.payer throws
// Browser: auto-connects, client.payer becomes the wallet signer
```

## Cleanup

The plugin implements `[Symbol.dispose]`, so it integrates with the `using` declaration or explicit disposal:

```ts
{
    using client = createClient().use(walletSigner({ chain: 'solana:mainnet' }));
    // registry listeners and storage subscriptions are cleaned up on scope exit
}
```

Or call `[Symbol.dispose]()` explicitly when you're done with the client:

```ts
const client = createClient().use(walletSigner({ chain: 'solana:mainnet' }));

// ... later, when the client is no longer needed
client[Symbol.dispose]();
```
