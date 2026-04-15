# Kit Plugins ➤ Wallet

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugin-wallet.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugin-wallet.svg?style=flat&label=%40solana%2Fkit-plugin-wallet
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugin-wallet

This package provides a plugin that adds browser wallet support to your Kit clients using [wallet-standard](https://github.com/wallet-standard/wallet-standard). It handles wallet discovery, connection lifecycle, account selection, and signer creation.

Two plugin functions are exported:

- **`wallet()`** — adds a `client.wallet` namespace with state and actions, without touching `client.payer`.
- **`walletAsPayer()`** — same as `wallet()`, but also syncs the connected wallet's signer to `client.payer` via a dynamic getter.

## Installation

```sh
pnpm install @solana/kit-plugin-wallet
```

## Quick start

```ts
import { createEmptyClient } from '@solana/kit';
import { rpc } from '@solana/kit-plugin-rpc';
import { walletAsPayer } from '@solana/kit-plugin-wallet';

const client = createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(walletAsPayer({ chain: 'solana:mainnet' }));

// Read discovered wallets from state
const { wallets } = client.wallet.getState();

// Connect a wallet
await client.wallet.connect(wallets[0]);

// client.payer is now the connected wallet's signer
```

## `wallet` plugin

Adds `client.wallet` without touching `client.payer`. Use this alongside the `payer()` plugin for backend signers, or when the wallet's signer is used explicitly in instructions.

```ts
import { wallet } from '@solana/kit-plugin-wallet';

const client = createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(payer(backendKeypair))
    .use(wallet({ chain: 'solana:mainnet' }));

// client.payer is always backendKeypair
// client.wallet.getState().connected?.signer for manual use
```

## `walletAsPayer` plugin

Adds `client.wallet` and overrides `client.payer` with a dynamic getter. When a signing-capable wallet is connected, `client.payer` returns the wallet signer. When disconnected or read-only, `client.payer` is `undefined`.

```ts
import { walletAsPayer } from '@solana/kit-plugin-wallet';

const client = createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(walletAsPayer({ chain: 'solana:mainnet' }));

await client.wallet.connect(selectedWallet);
// client.payer === client.wallet.getState().connected?.signer
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

- **`signIn(input?)`** / **`signIn(wallet, input?)`** — Sign In With Solana (SIWS). The two-argument form connects the wallet implicitly.

    ```ts
    // Sign in with the already-connected wallet
    const output = await client.wallet.signIn({ domain: window.location.host });

    // Sign in and connect in one step
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
wallet({
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

Both `wallet` and `walletAsPayer` are safe to include in a shared client that runs on both server and browser. On the server, `status` stays `'pending'` permanently, all actions throw a `SolanaError` with code `SOLANA_ERROR__WALLET__NOT_CONNECTED`, and no registry listeners or storage reads are made. In the browser the plugin initializes normally.

```ts
const client = createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(walletAsPayer({ chain: 'solana:mainnet' }));

// Server: status === 'pending', client.payer === undefined
// Browser: auto-connects, client.payer becomes the wallet signer
```

## Cleanup

The plugin implements `[Symbol.dispose]`, so it integrates with the `using` declaration or explicit disposal:

```ts
{
    using client = createEmptyClient().use(wallet({ chain: 'solana:mainnet' }));
    // registry listeners and storage subscriptions are cleaned up on scope exit
}
```
