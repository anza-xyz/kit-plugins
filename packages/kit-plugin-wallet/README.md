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

    A successful call resolves only once the wallet is connected; any failure rejects. Connecting to a different wallet keeps the current one connected until the new connection succeeds — so if the attempt fails (the user declines the prompt, the wallet authorizes no accounts, or it becomes unavailable), the previous connection is left untouched rather than torn down. The same holds for `signIn`, which rejects rather than resolving with its sign-in output when the connection can't be established. While the attempt is in flight, `status` is `'connecting'` but `getState().connected` still describes the existing connection.

    If another `connect` or `signIn` starts before this one resolves (e.g. an accidental double-click), the newer request wins and owns the connection — the superseded call rejects with a `DOMException` whose `name` is `'AbortError'`. Ignore it the way you'd ignore any aborted operation:

    ```ts
    try {
        await client.wallet.connect(selectedWallet);
    } catch (e) {
        if ((e as Error).name !== 'AbortError') throw e; // a real failure
    }
    ```

- **`disconnect(wallet?)`** — Disconnects an authorized wallet. If `wallet` is not provided, disconnects the active wallet.

- **`selectAccount(account)`** — Switch to a different account within any already-authorized wallet without reconnecting.

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

## React hooks

The `@solana/kit-plugin-wallet/react` subpath exposes hooks for reading wallet state and driving wallet actions from React components. Install the optional peer dependencies (`react` and [`@solana/react`](https://www.npmjs.com/package/@solana/react)). Every hook takes your wallet-enabled `client` — a client built with a wallet plugin such as `walletSigner()` — as its first argument.

The **state** hooks subscribe via `useSyncExternalStore`, each to a single slice of `WalletState`, so a component only re-renders when the slice it reads changes:

| Hook                 | Returns                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `useWalletStatus`    | The current `WalletStatus`.                                                      |
| `useConnectedWallet` | The active connection (`{ account, signer, wallet }`) or null.                   |
| `useWallets`         | The discovered wallets for the client's chain.                                   |
| `useIsWalletReady`   | `false` while the initial warm-up is in progress (`'pending'`/`'reconnecting'`). |

The **action** hooks wrap the async wallet actions with `useAction` from `@solana/react`, returning its result (`dispatch`, `dispatchAsync`, `data`, `error`, `status`, `isRunning`, `reset`, …). The hook manages the `AbortSignal` internally, so an in-flight call is aborted when a newer one is dispatched:

| Hook               | Wraps                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| `useConnect`       | `client.wallet.connect` — `dispatch(wallet)`                              |
| `useDisconnect`    | `client.wallet.disconnect` — `dispatch()`                                 |
| `useSignIn`        | `client.wallet.signIn` — `dispatch(wallet, input)`                        |
| `useSignMessage`   | `client.wallet.signMessage` — `dispatch(message)`                         |
| `useSelectAccount` | `client.wallet.selectAccount` — returns the synchronous callback directly |

Each component receives the `client` and passes it to the hooks it uses:

```tsx
import type { ClientWithWallet } from '@solana/kit-plugin-wallet';
import { useConnect, useConnectedWallet, useWallets, useWalletStatus } from '@solana/kit-plugin-wallet/react';

function WalletButton({ client }: { client: ClientWithWallet }) {
    const status = useWalletStatus(client);
    const wallets = useWallets(client);
    const connected = useConnectedWallet(client);
    const { dispatch: connect, isRunning } = useConnect(client);

    if (status === 'pending') return null; // avoid flashing UI before auto-reconnect resolves

    if (connected) return <p>Connected: {connected.account.address}</p>;

    return wallets.map(wallet => (
        <button key={wallet.name} disabled={isRunning} onClick={() => connect(wallet)}>
            Connect {wallet.name}
        </button>
    ));
}
```

### Gating UI on the initial warm-up

A freshly built client runs a silent auto-reconnect on mount, briefly passing through `'pending'` and `'reconnecting'` before it settles. If you render wallet-dependent UI immediately, a persisted wallet flashes "disconnected" for a frame before it reconnects. `useIsWalletReady` reports `false` for the duration of that warm-up and `true` once it settles, so you can hold back the wallet-dependent parts while painting the rest of the app:

```tsx
import type { ClientWithWallet } from '@solana/kit-plugin-wallet';
import { useIsWalletReady, WalletReadyGate } from '@solana/kit-plugin-wallet/react';

// Hide a whole subtree until the connection settles:
function App({ client }: { client: ClientWithWallet }) {
    return (
        <WalletReadyGate client={client} fallback={<Spinner />}>
            <WalletDependentUI />
        </WalletReadyGate>
    );
}

// Or read the boolean directly for finer control (e.g. disabling a button):
function ConnectButton({ client }: { client: ClientWithWallet }) {
    const isReady = useIsWalletReady(client);
    return <button disabled={!isReady}>Connect</button>;
}
```

`WalletReadyGate` is a thin wrapper over `useIsWalletReady`. Its props are shaped like React's `<Suspense fallback>`, but it is synchronous — it renders `fallback` directly off the reactive status rather than suspending, so it needs no `<Suspense>` ancestor. Both gate on the same warm-up set as `whenReady()` below, so they stay in sync — and like `whenReady()`, they ignore user-initiated `'connecting'` / `'disconnecting'`. To genuinely suspend a subtree, throw the Suspense-safe `whenReady()` promise from your own component instead.

### Advanced: seamless client swaps with `whenReady()`

> Most apps don't need this. It only matters if you **rebuild the client at runtime** — for example, to change chain — since each wallet plugin is bound to a single chain.

Every freshly built client runs a silent auto-reconnect that briefly passes through the `'pending'` and `'reconnecting'` statuses. If you publish the new client as soon as you build it, the UI may flash that reconnecting state on every switch. `client.wallet.whenReady()` returns a promise that resolves once the status has left `'pending'` / `'reconnecting'`, so you can build the new client, wait for it to settle, and only then swap it in — keeping the previous client live until the new one is ready:

```ts
import { createClient } from '@solana/kit';
import { walletSigner } from '@solana/kit-plugin-wallet';

// On a chain switch, hold the previous client until the rebuilt one is ready:
const next = createClient().use(walletSigner({ chain }));
await next.wallet.whenReady();
swapInClient(next); // publish `next`, then dispose the client it replaced
```

`whenReady()` deliberately does **not** wait for user-initiated `connect` / `disconnect` / `signIn` (those pass through `'connecting'` / `'disconnecting'`), so it only ever blocks on the initial warm-up — a normal connect stays interactive.

Disposing a client mid-warm-up settles its status to `'disconnected'` and resolves any pending `whenReady()` promise — a superseded client never leaves an `await` hanging. Check `getState()` after awaiting if you need to tell a ready connection from a disposed (or never-connected) client.

## Framework integration

The plugin exposes `subscribe` and `getState` for binding wallet state to any UI framework. To gate UI on the initial auto-reconnect warm-up without React, pass `getState().status` through `isWalletWarmingUp` — the same predicate that backs `whenReady()` and the [React readiness helpers](#gating-ui-on-the-initial-warm-up), so all three stay in sync:

```ts
import { isWalletWarmingUp } from '@solana/kit-plugin-wallet';

client.wallet.subscribe(() => {
    const { status } = client.wallet.getState();
    setLoading(isWalletWarmingUp(status)); // true while 'pending' / 'reconnecting'
});
```

**React** — prefer the ready-made [React hooks](#react-hooks) above; they wrap the pattern below. To bind state manually (e.g. to read the whole snapshot at once), use `useSyncExternalStore` for concurrent-mode-safe rendering:

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

### Reactivity: observing `payer` / `identity`

Because the connected wallet's signer is dynamic, the plugins follow Kit's
reactive-capability convention. The variants that set `client.payer` /
`client.identity` also install a sibling `subscribeToPayer` /
`subscribeToIdentity` function, so reactive consumers can observe signer
changes without naming the wallet plugin:

```ts
const client = createClient().use(walletSigner({ chain: 'solana:mainnet' }));

const unsubscribe = client.subscribeToPayer(() => {
    // Re-read the current value; it may now throw if disconnected.
    console.log('payer is now', client.payer);
});
```

`walletSigner` installs both hooks, `walletPayer` installs `subscribeToPayer`,
`walletIdentity` installs `subscribeToIdentity`, and `walletWithoutSigner`
installs neither. The listener fires on connect, account switch, and
disconnect. For the full
wallet state (including the discovered-wallet list), use
`client.wallet.subscribe` instead.

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

React Native is treated the same way as the server: wallet-standard browser discovery is not available, so the plugin returns the same inert stub (`status` stays `'pending'`, actions throw). Native wallet integration would need a different discovery mechanism and is out of scope for this plugin.

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
