# Kit Plugins ➤ Wallet

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugin-wallet.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugin-wallet.svg?style=flat&label=%40solana%2Fkit-plugin-wallet
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugin-wallet

This package provides a plugin that adds browser wallet support to your Kit clients using [wallet-standard](https://github.com/wallet-standard/wallet-standard). It handles wallet discovery, connection lifecycle, account selection, and signer creation — and syncs the connected wallet's signer to `client.payer` automatically.

## Installation

```sh
pnpm install @solana/kit-plugin-wallet
```

## `wallet` plugin

The wallet plugin adds a `client.wallet` namespace with all wallet state and actions, and wires the connected wallet's signer to `client.payer`.

### Setup

```ts
import { createEmptyClient } from '@solana/kit';
import { rpc } from '@solana/kit-plugin-rpc';
import { wallet } from '@solana/kit-plugin-wallet';

const client = createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(wallet({ chain: 'solana:mainnet' }));
```

Once a wallet is connected, `client.payer` resolves to the wallet's signer and you can pass it directly to transaction instructions:

```ts
import { getTransferSolInstruction } from '@solana-program/system';
import { lamports } from '@solana/kit';

// Read registered wallets
const selectedWallet = client.wallet.wallets[0];

// Connect a wallet
await client.wallet.connect(selectedWallet);

// client.payer is now the connected wallet's signer
await client.sendTransaction(
    getTransferSolInstruction({
        source: client.payer,
        destination: recipientAddress,
        amount: lamports(10_000_000n),
    }),
);
```

### Features

- `client.wallet.wallets` — All discovered wallets that support the configured chain.

    ```ts
    for (const w of client.wallet.wallets) {
        console.log(w.name, w.icon);
    }
    ```

- `client.wallet.connected` — The active connection (wallet, account, and signer), or `null` when disconnected.

    ```ts
    const { wallet, account, signer } = client.wallet.connected ?? {};
    console.log(account?.address);
    ```

- `client.wallet.status` — The current connection status: `'pending'`, `'disconnected'`, `'connecting'`, `'connected'`, `'disconnecting'`, or `'reconnecting'`.

- `client.wallet.connect(wallet)` — Connect to a wallet and select the first newly authorized account.

    ```ts
    const accounts = await client.wallet.connect(selectedWallet);
    ```

- `client.wallet.disconnect()` — Disconnect the active wallet.

- `client.wallet.selectAccount(account)` — Switch to a different account within an already-authorized wallet without reconnecting.

    ```ts
    client.wallet.selectAccount(selectedWallet);
    ```

- `client.wallet.signMessage(message)` — Sign a raw message with the connected account.

    ```ts
    const signature = await client.wallet.signMessage(new TextEncoder().encode('Hello'));
    ```

- `client.wallet.signIn(input?)` / `client.wallet.signIn(wallet, input?)` — Sign In With Solana (SIWS). The two-argument form connects the wallet implicitly.

    ```ts
    // Sign in with the already-connected wallet
    const output = await client.wallet.signIn({ domain: window.location.host });

    // Sign in and connect in one step
    const output = await client.wallet.signIn(selectedWallet, { domain: window.location.host });
    ```

### Framework integration

The plugin exposes `subscribe` and `getSnapshot` for binding wallet state to any UI framework.

**React** — use `useSyncExternalStore` for concurrent-mode-safe rendering:

```tsx
import { useSyncExternalStore } from 'react';

function useWalletState() {
    return useSyncExternalStore(client.wallet.subscribe, client.wallet.getSnapshot);
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
    const state = shallowRef(client.wallet.getSnapshot());
    onMounted(() => {
        const unsub = client.wallet.subscribe(() => {
            state.value = client.wallet.getSnapshot();
        });
        onUnmounted(unsub);
    });
    return state;
}
```

**Svelte** — wrap in a `readable` store:

```ts
import { readable } from 'svelte/store';

export const walletState = readable(client.wallet.getSnapshot(), set => {
    return client.wallet.subscribe(() => set(client.wallet.getSnapshot()));
});
```

### Persistence

By default the plugin uses `localStorage` to remember the last connected wallet and auto-reconnects on the next page load. Pass `storage: null` to disable, or provide a custom adapter (e.g. `sessionStorage` or an IndexedDB wrapper):

```ts
wallet({
    chain: 'solana:mainnet',
    storage: sessionStorage, // use session storage instead
    storageKey: 'my-app:wallet', // custom key (default: 'kit-wallet')
    autoConnect: false, // disable silent reconnect
});
```

### SSR / server-side rendering

The plugin is safe to include in a shared client that runs on both server and browser. On the server, `status` stays `'pending'` permanently, all actions throw `WalletNotConnectedError`, and no registry listeners or storage reads are made. In the browser the plugin initializes normally.

```ts
// This client chain works on both server and browser.
const client = createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(payer(serverKeypair))
    .use(wallet({ chain: 'solana:mainnet' }));

// Server: client.wallet.status === 'pending', client.payer === serverKeypair
// Browser: auto-connects, client.payer becomes the wallet signer
```

### Wallet discovery filtering

Use the `filter` option to restrict which wallets appear in `client.wallet.wallets`:

```ts
wallet({
    chain: 'solana:mainnet',
    // Only show wallets that support signAndSendTransaction
    filter: w => w.features.includes('solana:signAndSendTransaction'),
});
```

### Cleanup

The plugin implements `[Symbol.dispose]`, so it integrates with the `using` declaration or explicit disposal:

```ts
{
    using client = createEmptyClient().use(wallet({ chain: 'solana:mainnet' }));
    // registry listeners and storage subscriptions are cleaned up on scope exit
}
```
