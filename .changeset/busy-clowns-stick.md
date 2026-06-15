---
'@solana/kit-plugin-wallet': minor
---

Add `@solana/kit-plugin-wallet`: a framework-agnostic bridge between [wallet-standard](https://github.com/wallet-standard/wallet-standard) and Kit. It handles wallet discovery, the full connection lifecycle, account selection, and signer creation, and exposes a subscribable state object you can bind to any UI framework. When a wallet is connected, its signer (by default) flows straight into `client.payer` and/or `client.identity`, so the rest of your client chain (e.g. `planAndSendTransactions`) works without any wallet-specific wiring.

```ts
import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { walletSigner } from '@solana/kit-plugin-wallet';
import { planAndSendTransactions } from '@solana/kit-plugin-instruction-plan';

const client = createClient()
    .use(walletSigner({ chain: 'solana:mainnet' }))
    .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(planAndSendTransactions());

// Read discovered wallets and connect one
const { wallets } = client.wallet.getState();
await client.wallet.connect(wallets[0]);

// client.payer and client.identity are now the connected wallet's signer
await client.sendTransaction([myInstruction]);
```

### Four entrypoints

Each plugin adds the same `client.wallet` namespace; they differ only in how the connected wallet's signer is exposed on the client:

| Plugin                | `client.payer` | `client.identity` | Use case                                                      |
| --------------------- | -------------- | ----------------- | ------------------------------------------------------------- |
| `walletSigner`        | wallet signer  | wallet signer     | Most dApps — wallet pays fees and signs as the user identity. |
| `walletPayer`         | wallet signer  | —                 | Wallet pays fees; identity is managed separately.             |
| `walletIdentity`      | —              | wallet signer     | Backend relayer pays fees; wallet provides user identity.     |
| `walletWithoutSigner` | —              | —                 | Wallet state only; payer and identity are managed separately. |

### What's included

- **Wallet discovery.** `getState().wallets` lists every discovered wallet that supports the configured `chain`, kept in sync as wallets register and unregister. An optional `filter` narrows the set further (e.g. only wallets supporting `solana:signAndSendTransaction`).
- **Connection lifecycle.** `connect`, `disconnect`, `selectAccount`, `signMessage`, and `signIn` (Sign In With Solana). Connecting to a new wallet keeps the current one connected until the new connection succeeds, so a declined prompt or unavailable wallet never logs the user out of the wallet they already had.
- **Newest-action-wins concurrency.** Overlapping actions (e.g. an accidental double-click) are resolved deterministically: the newest request owns the connection and superseded calls reject with a `DOMException` whose `name` is `'AbortError'`, which you can ignore like any aborted operation.
- **Auto-connect persistence.** The last connected wallet and account are remembered (via `localStorage` by default) and silently reconnected on the next page load. Provide any `storage` adapter (e.g. `sessionStorage`), a custom `storageKey`, or `storage: null` / `autoConnect: false` to opt out.
- **Subscribable state for any framework.** `client.wallet.subscribe` + `getState` return a referentially stable snapshot (a new reference only when something changes), ready for React's `useSyncExternalStore`, a Vue `shallowRef`, a Svelte `readable`, or any other binding.
- **SSR- and React-Native-safe.** Safe to include in a client chain shared between server and browser. On the server (and in React Native) the plugin is an inert stub: `status` stays `'pending'`, actions throw, and no registry listeners or storage reads happen. It initializes normally in the browser.
- **Deterministic cleanup.** Implements `[Symbol.dispose]`, so registry listeners and storage subscriptions are torn down with a `using` declaration or an explicit `client[Symbol.dispose]()`.

### React example

Note that we are working on React hooks across Kit and the Plugins, but this is what is enabled without any extra hooks. Other frameworks can integrate in a similar way.

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

See the package README for per-framework integration snippets (React, Vue, Svelte), full configuration options, and the persistence, SSR, and cleanup details.
