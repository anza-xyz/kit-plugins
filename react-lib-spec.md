# RFC: `@solana/react-kit` — React Bindings for Kit

**Status:** Draft
**Package:** `@solana/react-kit`

## Summary

A React library that provides hooks and providers for building Solana dApps using Kit. The library is structured in layers: a zero-dependency core (beyond React and Kit), with optional adapters for SWR and TanStack Query.

The core library covers wallet integration, live on-chain data, and subscriptions. One-shot RPC reads are delegated to the consumer's choice of cache library (SWR, TanStack Query, or plain `fetch` + `useEffect`).

The Kit client is an implementation detail — consumers interact with providers and hooks, not plugins and clients directly. Power users can access the client for imperative use.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  @solana/react-kit/swr          (optional adapter)   │
│  @solana/react-kit/query        (optional adapter)   │
│  Generic bridges + mutation hooks                    │
├──────────────────────────────────────────────────────┤
│  @solana/react-kit              (core, zero deps)    │
│  Providers, wallet hooks, live data hooks            │
│  useSyncExternalStore for all reactive state         │
├──────────────────────────────────────────────────────┤
│  Kit plugins                    (framework-agnostic) │
│  walletWithoutSigner, walletPayer, walletIdentity,   │
│  walletSigner, solanaRpc, createReactiveStore...     │
└──────────────────────────────────────────────────────┘
```

### Principles

**The client is internal.** Consumers use providers and hooks. The plugin chain is built inside the provider — consumers configure it via props, not `.use()` calls.

**`useSyncExternalStore` for reactive state.** Wallet state, live queries, and subscriptions all use Kit's `subscribe`/`getState` contract, which maps directly to React's `useSyncExternalStore`. No polling, no `useEffect` + `setState`.

**Named hooks only where there's domain logic.** `useBalance` exists because it hides RPC + subscription pairing, slot dedup, and response mapping. `useGetEpochInfo` does not exist because it would be a one-liner wrapping `client.rpc.getEpochInfo().send()`. One-shot reads belong in the consumer's cache library.

**Adapters are thin.** The SWR and TanStack Query adapters provide a generic bridge from Kit's reactive stores into the cache library, plus mutation hooks. One-shot reads are just "use SWR/TanStack directly, see docs."

## Core Library (`@solana/react-kit`)

### Dependencies

```json
{
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "@solana/kit": "^6.x",
    "@solana/kit-plugin-instruction-plan": "^1.x",
    "@solana/kit-plugin-wallet": "^1.x"
  }
}
```

Zero dependencies beyond React and Kit plugins. No cache library required. `@solana/kit-plugin-instruction-plan` provides the `client.sendTransaction()` / `client.planTransaction()` methods used by `useSendTransaction` and `useAction` flows — the actual implementation comes from whichever RPC plugin is installed (`kit-plugin-rpc`, `kit-plugin-litesvm`, etc.).

> **Note:** `@solana/kit-plugin-wallet` is currently under development and not yet released. It will provide the `walletWithoutSigner`, `walletPayer`, `walletIdentity`, and `walletSigner` plugins used internally by this package.

### Providers

Each provider reads the client from context, extends it with `.use()`, and provides the new client. The nesting order is the plugin chain order — each provider maps to a Kit plugin. If no client exists in context, the outermost provider creates one with `createClient()`.

#### Common case

```tsx
import { WalletProvider, RpcProvider } from '@solana/react-kit';

function App() {
    return (
        <WalletProvider chain="solana:mainnet">
            <RpcProvider url="https://api.mainnet-beta.solana.com" wsUrl="wss://api.mainnet-beta.solana.com">
                <MyApp />
            </RpcProvider>
        </WalletProvider>
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

**`ChainProvider`** — pure context provider that stores a `SolanaChain` and creates the base client. Does not map to a plugin. Provides `useChain()`. `WalletProvider` renders a `ChainProvider` internally, so most apps don't need it explicitly. Use it directly when there's no `WalletProvider` (e.g. testing setups, server-side scripts):

```tsx
<ChainProvider chain="solana:devnet">
    <PayerProvider signer={testPayer}>
        <LiteSvmProvider>
            <App /> {/* useChain() returns "solana:devnet" */}
        </LiteSvmProvider>
    </PayerProvider>
</ChainProvider>
```

**`WalletProvider`** — wraps one of the wallet plugins. Renders a `ChainProvider` internally with the provided `chain` prop. Accepts an optional `role` prop that defaults to `"signer"` — the common case where the wallet both pays for and signs transactions. Other roles are available for advanced setups: `"payer"` (wallet pays fees only), `"identity"` (wallet signs but a relayer pays), or `"none"` (wallet UI only, manual signer access via `useConnectedWallet()`). These map to the `walletSigner`, `walletPayer`, `walletIdentity`, and `walletWithoutSigner` plugins respectively. Also accepts `autoConnect`, `storage`, `storageKey`, and `filter` props, forwarded to the underlying wallet plugin.

**`PayerProvider`** and **`IdentityProvider`** — set `client.payer` and `client.identity` respectively from an explicit signer. Use these when the payer or identity is not the connected wallet (e.g. a backend relayer, a different keypair).

**`RpcProvider`** — wraps `solanaRpc`. Asserts that `"payer" in client` at render time — if no ancestor provider has set a payer, it throws: *"RpcProvider requires a payer. Wrap it in a WalletProvider (with role 'signer' or 'payer') or a PayerProvider."*

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
import { WalletProvider, PayerProvider, RpcProvider } from '@solana/react-kit';

// Wallet is identity, relayer pays
<WalletProvider chain="solana:mainnet" role="identity">
    <PayerProvider signer={relayerSigner}>
        <RpcProvider url="https://..." wsUrl="wss://...">
            <App />
        </RpcProvider>
    </PayerProvider>
</WalletProvider>

// Wallet is UI only, payer and identity are explicit
<WalletProvider chain="solana:mainnet" role="none">
    <IdentityProvider signer={identitySigner}>
        <PayerProvider signer={relayerSigner}>
            <RpcProvider url="https://..." wsUrl="wss://...">
                <App />
            </RpcProvider>
        </PayerProvider>
    </IdentityProvider>
</WalletProvider>

// Testing with LiteSVM — no wallet, explicit chain
<ChainProvider chain="solana:devnet">
    <PayerProvider signer={testPayer}>
        <LiteSvmProvider>
            <App />
        </LiteSvmProvider>
    </PayerProvider>
</ChainProvider>
```

### Hooks

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
 * Returns the current chain identifier from context (e.g. "solana:mainnet").
 * Useful for chain-dependent logic such as constructing explorer URLs or
 * passing to createSignerFromWalletAccount.
 */
function useChain(): SolanaChain;
```

#### Wallet

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
 * Returns the connected account, signer, and wallet.
 */
function useConnectedWallet(): {
    readonly account: UiWalletAccount;
    readonly signer: WalletSigner | null;
    readonly wallet: UiWallet;
} | null;

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
 */
function useSignIn(): {
    (input?: SolanaSignInInput): Promise<SolanaSignInOutput>;
    (wallet: UiWallet, input?: SolanaSignInInput): Promise<SolanaSignInOutput>;
};
```

#### Getting a kit signer from a wallet account

For cases where you need a signer for an account other than the connected one (e.g. a different account within the same wallet, or multi-wallet flows), use `createSignerFromWalletAccount` from `@solana/wallet-account-signer` with any `UiWalletAccount`:

```typescript
const wallets = useWallets();
const chain = useChain();
const account = wallets[0]?.accounts[0];
const signer = useMemo(
    () => account ? createSignerFromWalletAccount(account, chain) : null,
    [account, chain],
);
```

`createSignerFromWalletAccount` returns a signer that implements `TransactionModifyingSigner`, `TransactionSendingSigner` (if the wallet supports `solana:signAndSendTransaction`), and `MessageSigner` (if the wallet supports `solana:signMessage`). No react-kit hook is needed here — this is a plain kit function.

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
    return useSyncExternalStore(
        client.wallet.subscribe,
        () => client.wallet.getState().connected,
    );
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
    /** The current value, or undefined if not yet loaded. */
    data: T | undefined;
    /** Error from the fetch or subscription, or undefined. */
    error: unknown;
    /** True when no data or error has arrived yet. */
    isLoading: boolean;
};

/**
 * Live SOL balance for an address.
 * Combines getBalance + accountNotifications with slot-based dedup.
 * Pass `null` to disable (e.g. when wallet is not connected).
 */
function useBalance(address: Address | null): LiveQueryResult<Lamports>;

/**
 * Live account for an address.
 * Combines getAccountInfo + accountNotifications with slot-based dedup.
 * When a decoder is provided, the account data is decoded and returned as
 * a typed Account<TData>. Without a decoder, returns the raw EncodedAccount.
 * Pass `null` to disable.
 */
function useAccount(address: Address | null): LiveQueryResult<EncodedAccount | null>;
function useAccount<TData extends object>(
    address: Address | null,
    decoder: Decoder<TData>,
): LiveQueryResult<Account<TData> | null>;

/**
 * Live transaction confirmation status.
 * Combines getSignatureStatuses + signatureNotifications with slot-based dedup.
 * Pass `null` to disable (e.g. before a transaction is sent).
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

Implementation sketch:

```tsx
function useBalance(address: Address | null): LiveQueryResult<Lamports> {
    const client = useClient();

    const store = useLiveStore(
        (signal) => {
            if (!address) return nullStore;
            return createReactiveStoreWithInitialValueAndSlotTracking({
                abortSignal: signal,
                rpcRequest: client.rpc.getBalance(address),
                rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address),
                rpcValueMapper: (response) => response.value,
                rpcSubscriptionValueMapper: (notification) => notification.lamports,
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
            if (!address) return nullStore;
            return createReactiveStoreWithInitialValueAndSlotTracking({
                abortSignal: signal,
                rpcRequest: client.rpc.getAccountInfo(address, { encoding: 'base64' }),
                rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address, { encoding: 'base64' }),
                rpcValueMapper: (response) => {
                    if (!response.value) return null;
                    const encoded = parseBase64RpcAccount(address, response.value);
                    return decoder ? decodeAccount(encoded, decoder) : encoded;
                },
                rpcSubscriptionValueMapper: (notification) => {
                    if (!notification.value) return null;
                    const encoded = parseBase64RpcAccount(address, notification.value);
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
            if (!signature) return nullStore;
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

Where `nullStore` is a static no-op store for disabled hooks, and `useLiveStore` is an internal helper that manages store creation, abort, and cleanup:

```typescript
/** Static store that never emits — used when a hook is disabled (null address/signature). */
const nullStore: ReactiveStore<any> = {
    getState: () => undefined,
    getError: () => undefined,
    subscribe: () => () => {},
};

function useLiveStore<T>(
    factory: (signal: AbortSignal) => ReactiveStore<T>,
    deps: DependencyList,
): ReactiveStore<T> {
    const storeRef = useRef<ReactiveStore<T>>();
    const abortRef = useRef<AbortController>();

    useMemo(() => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        storeRef.current = factory(controller.signal);
    }, deps);

    useEffect(() => () => abortRef.current?.abort(), []);

    return storeRef.current!;
}

function useLiveQueryResult<T>(store: ReactiveStore<T>): LiveQueryResult<T> {
    const data = useSyncExternalStore(store.subscribe, store.getState);
    const error = useSyncExternalStore(store.subscribe, store.getError);

    return useMemo(() => ({
        data: data?.value,
        error,
        isLoading: data === undefined && error === undefined,
    }), [data, error]);
}
```

#### Generic live query

For custom RPC + subscription combinations the named hooks don't cover:

```typescript
/**
 * Generic live query for any RPC + subscription pair.
 * Handles store creation, slot dedup, abort, and cleanup.
 */
function useLiveQuery<TRpcValue, TSubscriptionValue, T>(
    config: CreateReactiveStoreConfig<TRpcValue, TSubscriptionValue, T>,
    deps: DependencyList,
): LiveQueryResult<T>;
```

Usage:

```tsx
// Watch a custom program account
const { data: gameState } = useLiveQuery(
    {
        rpcRequest: client.rpc.getAccountInfo(gameAddress),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(gameAddress),
        rpcValueMapper: (v) => parseGameState(v.value),
        rpcSubscriptionValueMapper: (v) => parseGameState(v),
    },
    [client, gameAddress],
);
```

#### Subscriptions (no initial fetch)

For subscription-only data where there is no RPC fetch equivalent:

```typescript
/**
 * Subscribe to an RPC subscription. Returns the latest notification value.
 */
function useSubscription<T>(
    factory: (signal: AbortSignal) => PendingRpcSubscriptionsRequest<T>,
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
```

#### Sending transactions

Wraps `client.sendTransaction()` and `client.sendTransactions()` (from the instruction-plan plugin) with React async state tracking. These are the primary way to send transactions in react-kit — they handle the full plan → sign → send → confirm lifecycle.

```typescript
type ActionState<T> = {
    /** The send function. Stable reference. */
    send: (...args: any[]) => Promise<T>;
    /** Current status of the mutation. */
    status: 'idle' | 'sending' | 'success' | 'error';
    /** The result on success, or undefined. */
    data: T | undefined;
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
function useSendTransaction(): ActionState<SuccessfulSingleTransactionPlanResult>;

/**
 * Send one or more transactions. Accepts instructions, an instruction plan,
 * a transaction message, or a pre-built TransactionPlan.
 */
function useSendTransactions(): ActionState<TransactionPlanResult>;
```

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
            (input: Parameters<typeof client.sendTransaction>[0], config?: { abortSignal?: AbortSignal }) =>
                client.sendTransaction(input, config),
            [client],
        ),
    );
}

// useAction implementation (same as the public hook above).
function useAction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
): ActionState<TResult> {
    const [state, setState] = useState<{ status: string; data?: TResult; error?: unknown }>({ status: 'idle' });

    const send = useCallback(async (...args: TArgs) => {
        setState({ status: 'sending' });
        try {
            const data = await fn(...args);
            setState({ status: 'success', data });
            return data;
        } catch (error) {
            setState({ status: 'error', error });
            throw error;
        }
    }, [fn]);

    const reset = useCallback(() => setState({ status: 'idle' }), []);

    return useMemo(() => ({
        send,
        status: state.status as ActionState<TResult>['status'],
        data: state.data,
        error: state.error,
        reset,
    }), [send, state, reset]);
}
```

The `send` function accepts the same inputs as `client.sendTransaction()` — raw instructions, fluent program client instructions, instruction plans, or pre-built transaction messages. For imperative flows where you don't need React state tracking, you can also call `client.sendTransaction(...)` directly via `useClient()`.

#### Generic async action

`useAction` wraps any async function with status/data/error tracking. It's the building block behind `useSendTransaction`, and is exported for custom async flows like sign-then-send or partial signing.

```typescript
/**
 * Track the async state of a user-triggered action.
 * Returns a stable `send` function and reactive status/data/error.
 */
function useAction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
): {
    send: (...args: TArgs) => Promise<TResult>;
    status: 'idle' | 'sending' | 'success' | 'error';
    data: TResult | undefined;
    error: unknown;
    reset: () => void;
};
```

Usage — sign-then-send flow:

```tsx
const client = useClient();

// Step 1: Plan the transaction
const { send: plan, data: message } = useAction(
    (input: InstructionPlanInput) => client.planTransaction(input),
);

// Step 2: Sign (without sending)
const { send: sign, data: signed } = useAction(
    (msg: TransactionMessage) => signTransactionMessageWithSigners(msg),
);

// Step 3: Send the already-signed transaction
const { send: sendSigned, status } = useAction(
    (tx: Transaction) => sendAndConfirmTransaction(client.rpc, tx, { commitment: 'confirmed' }),
);

// In your UI:
await plan(getTransferInstruction({ source, destination, amount }));
// ... user reviews the planned message ...
await sign(message);
// ... user reviews the signed transaction ...
await sendSigned(signed);
```

Usage — DeFi aggregator flow (sign locally, submit to external API):

This pattern is common for swap aggregators, relayers, and any flow where a third-party service builds the transaction and handles submission. The wallet only signs — it doesn't send to the RPC.

```tsx
const connected = useConnectedWallet();
const base64Codec = useMemo(() => getBase64Codec(), []);

// Optional: track sub-phases for granular loading UI
const [phase, setPhase] = useState<'idle' | 'signing' | 'confirming'>('idle');

const { send: handleSwap, status, data: result, error } = useAction(
    async (order: { transaction: string; requestId: string }) => {
        // 1. Decode the pre-built transaction from the API
        setPhase('signing');
        const txBytes = base64Codec.encode(order.transaction);
        const [signed] = await connected.signer.signTransactions([
            getTransactionDecoder().decode(txBytes),
        ]);

        // 2. Submit signed transaction back to the API (not to the RPC)
        setPhase('confirming');
        const signedBase64 = base64Codec.decode(
            getTransactionEncoder().encode(signed),
        );
        return submitToAggregatorApi({ signedTransaction: signedBase64, requestId: order.requestId });
    },
);

// status: 'idle' | 'sending' | 'success' | 'error'
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

Any Kit plugin works with react-kit out of the box via `PluginProvider` — no React-specific wrapper needed from the plugin author. Plugin authors can optionally ship typed convenience hooks for better DX.

### Example: a DAS plugin package

A DAS package ships a Kit plugin and optionally convenience hooks:

**1. The kit plugin** (framework-agnostic, adds `client.das.*`):

```typescript
// @my-org/kit-plugin-das
export function dasPlugin(config: DasConfig): Plugin<{ das: DasClient }>;
```

**2. Usage with `PluginProvider`** — no React wrapper from the plugin author needed:

```tsx
import { PluginProvider, WalletProvider, RpcProvider } from '@solana/react-kit';
import { dasPlugin } from '@my-org/kit-plugin-das';

<WalletProvider chain="solana:mainnet">
    <PluginProvider plugin={dasPlugin({ endpoint: 'https://mainnet.helius-rpc.com/?api-key=...' })}>
        <RpcProvider url="..." wsUrl="...">
            <App />
        </RpcProvider>
    </PluginProvider>
</WalletProvider>
```

After `PluginProvider`, any `useClient()` call in the subtree returns the DAS-extended client at runtime.

**3. Optional typed convenience hooks:**

```typescript
// @my-org/react-kit-das
import { useClient } from '@solana/react-kit';
import type { DasClient } from '@my-org/kit-plugin-das';

export function useAsset(address: Address) {
    const client = useClient<DasClient>();
    return useSWR(['das-asset', address], () =>
        client.das.getAsset(address).send()
    );
}
```

Consumers just import `useAsset` — they never need to touch `useClient` or know about the underlying DAS plugin.

### `useClient` is generic for this reason

The `useClient` hook accepts an optional type parameter so third-party hook implementations can access their extended client type:

```typescript
function useClient<TClient extends Client = Client>(): TClient;
```

This is a type assertion, not an inference — it's the hook author's responsibility to ensure `DasProvider` (or equivalent) is present in the tree. The generic is intentionally an escape hatch, not the primary API.

## SWR Adapter (`@solana/react-kit/swr`)

### Dependencies

```json
{
  "peerDependencies": {
    "@solana/react-kit": "^1.x",
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

Since these hooks live under the `@solana/react-kit/swr` entry point, they use the same names as core — the import path disambiguates:

```typescript
import { useSendTransaction } from '@solana/react-kit/swr';
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
import { useSendTransaction } from '@solana/react-kit/swr';

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

## TanStack Query Adapter (`@solana/react-kit/query`)

### Dependencies

```json
{
  "peerDependencies": {
    "@solana/react-kit": "^1.x",
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

Since these hooks live under the `@solana/react-kit/query` entry point, they use the same names as core — the import path disambiguates:

```typescript
import { useSendTransaction } from '@solana/react-kit/query';
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
import { useSendTransaction } from '@solana/react-kit/query';

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
import { useClient } from '@solana/react-kit';
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
import { useClient } from '@solana/react-kit';
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

**Composable providers only.** Each provider maps to a Kit plugin. The nesting order is the plugin chain order. No bundle provider — one way to do things, no cliff when you need to customize. `PluginProvider` allows any Kit plugin to participate without shipping a React-specific wrapper.

**No dedicated transfer/token/stake hooks.** `useSendTransaction()` is generic — it accepts any instruction, instruction plan, or transaction message. Dedicated hooks like `useSolTransfer()` or `useSplToken()` would be thin wrappers that don't add meaningful logic. They can be built on top by higher-level libraries.

**Transaction confirmation is subscription-backed.** `useTransactionConfirmation` uses `signatureNotifications` + `getSignatureStatuses` with slot-based dedup, rather than polling. This fits the core's philosophy that named hooks earn their place by hiding RPC + subscription pairing.

**Library, not a plugin.** An alternative design would be a `react()` Kit plugin — `createClient().use(walletSigner()).use(solanaRpc()).use(react())` — which is appealing because it's the same `use()` API developers already know and makes the plugin chain explicit. However, React needs to own the client lifecycle: prop changes trigger client recreation (e.g. network switching), multiple provider trees need independent clients, cleanup on unmount must abort subscriptions and dispose resources, and SSR requires a fresh client per request. All of these require the client to be created and managed inside React, which means providers. The composable provider approach expresses the same plugin chain as nesting order — each provider calls `.use()` internally — so the composition model is identical, just adapted to React's lifecycle.

**Single chain per `WalletProvider`.** Each `WalletProvider` is scoped to one chain — discovery, connection, and signer creation all depend on it. Apps that need multiple chains (e.g. a mainnet trading section and a devnet testing section) use separate `WalletProvider`s, which means separate wallet connections. This is the correct behavior: a wallet that supports `solana:mainnet` may not support a different chain like `l2:mainnet`, so you can't safely share a connection across chains.

A future backward-compatible enhancement could enable opt-in state syncing between providers: if `WalletStorage` gained an optional `subscribe` method (matching the pattern used by Zustand's `persist` and TanStack Query's storage adapters), the plugin could react to external writes and auto-connect when a sibling provider connects. Both providers would still independently verify chain support — the shared storage just propagates the wallet selection, not the connection itself. Plain `localStorage` (no `subscribe`) would continue to work unchanged.

## Comparison with framework-kit

[`framework-kit`](https://github.com/solana-foundation/framework-kit) is a feature-complete React library for Solana built on a different architecture (`@solana/client` + Zustand + SWR). `react-kit` is not a replacement — it's a lower-level foundation that framework-kit (or similar libraries) could build on top of.

### What react-kit covers

All of framework-kit's core functionality is covered:

| Area | framework-kit | react-kit |
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

### Intentional gaps

These framework-kit features are omitted by design, not oversight:

- **Dedicated transfer/token/stake hooks** (`useSolTransfer`, `useSplToken`, `useWrapSol`, `useStake`) — covered by `useSendTransaction()` + the relevant instruction. Higher-level libraries can add these.
- **One-shot RPC hooks** (`useProgramAccounts`, `useLookupTable`, `useNonceAccount`, `useLatestBlockhash`, `useSimulateTransaction`) — delegated to the consumer's cache library (SWR or TanStack).
- **Wallet modal state** (`useWalletModalState`, `WalletConnectionManager`) — UI concern, left to consumer or UI libraries.
- **SWR query infrastructure** (`useSolanaRpcQuery`, query key scoping) — each cache library handles this natively.

### What react-kit adds

Features that framework-kit does not provide:

- **Cache-library agnostic** — SWR and TanStack adapters, not locked to one.
- **`useAccount` with decoder** — progressive disclosure of typed account decoding.
- **`useLiveQuery`** — generic subscription-backed queries for any RPC + subscription pair.
- **`useSubscription`** — raw subscription hook for subscription-only data.
- **`PluginProvider`** — any Kit plugin works without a React-specific wrapper.
- **`PayerProvider` / `IdentityProvider`** — separate payer and identity from wallet.
- **`LiteSvmProvider`** — drop-in testing provider backed by a local SVM.
- **Granular wallet hooks** — `useWallets()`, `useWalletStatus()`, `useConnectedWallet()` subscribe to only the slice they need.

### Comparison with connectorkit

[`connectorkit`](https://github.com/nicholasgasior/connectorkit) (`@solana/connector`) is a production wallet connection library with headless UI components, multi-transport support (WalletConnect, Mobile Wallet Adapter), legacy `@solana/web3.js` compatibility, and devtools. react-kit provides the core primitives that connectorkit could build on top of.

#### What react-kit covers

| Area | connectorkit | react-kit |
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

These are app-layer and transport-layer concerns that react-kit intentionally leaves to higher-level libraries:

- **Headless UI components** — `WalletListElement`, `BalanceElement`, `TokenListElement`, `TransactionHistoryElement`, `ClusterElement`, `AccountElement`, `DisconnectElement` (all render-prop based)
- **Multi-transport wallet support** — WalletConnect (QR codes, deep links) and Mobile Wallet Adapter alongside browser extensions, with branded connector IDs to distinguish transports to the same wallet
- **Legacy compatibility** — `createWalletAdapterCompat()` for `@solana/web3.js` transaction API
- **Token list / transaction history** — `useTokens()`, `useTransactions()` with shared query cache
- **Cluster management UI** — persistence, explorer URL resolution, formatted addresses, clipboard utils
- **Event system** — `wallet:connected`, `transaction:signed`, etc. for analytics
- **Error boundaries** — recoverable errors, retry logic, fallback UI
- **Devtools** — `@solana/connector-debugger` with transaction inspection

#### How connectorkit would build on react-kit

Connectorkit would wrap react-kit's providers and compose its hooks on top of react-kit's primitives:

```tsx
// Connectorkit disables plugin-level persistence and auto-connect,
// then implements its own with richer storage and reconnect logic.
function ConnectorProvider({ config, children }) {
    const [chain, setChain] = useState(config.initialCluster);

    return (
        <WalletProvider chain={chain} autoConnect={false} storage={null}>
            <ConnectorAutoConnect config={config}>
                {children}
            </ConnectorAutoConnect>
        </WalletProvider>
    );
}
```

Key integration points:

- **`storage: null`** disables all plugin-level reads and writes, giving connectorkit a clean slate for its own versioned storage (`connector-kit:v1:wallet`) that stores full connector IDs (e.g. `mwa:phantom` vs `wallet-standard:phantom`)
- **`autoConnect: false`** skips plugin auto-reconnect (status goes `'pending'` → `'disconnected'` immediately), so connectorkit controls the full state machine — its own 200ms delay, silent-first with interactive fallback, etc.
- **`useWallets()`**, **`useConnectWallet()`**, **`useConnectedWallet()`**, **`useWalletStatus()`** are the building blocks for connectorkit's hooks, wrapped with its own event emission, error recovery, and connector ID mapping
- **`PluginProvider`** can initialize WalletConnect or MWA as additional wallet-standard wallets before they're needed
- **`useClient()`** provides access for connectorkit's legacy adapter layer and transaction signing hooks

### Comparison with wallet-ui

[`wallet-ui`](https://github.com/nicholasgasior/wallet-ui) (`@wallet-ui/react`) is a simpler wallet library — a modern, Wallet-Standard-native replacement for the old wallet-adapter. It provides wallet connection hooks, account/cluster persistence, and headless UI components (dropdowns, modals, wallet lists) styled via data attributes and optional Tailwind CSS.

#### What react-kit covers

Wallet-UI has significant overlap with react-kit + kit-plugin-wallet. The core state management, wallet discovery, connection, and persistence are all handled:

| Area | wallet-ui | react-kit |
|------|----------|-----------|
| Wallet discovery | `useWalletUiWallets()` | `useWallets()` |
| Bundled wallet state | `useWalletUi()` | `useWallets()` + `useConnectedWallet()` + `useWalletStatus()` |
| Connect / disconnect | `useWalletUiWallet({ wallet })` | `useConnectWallet()` / `useDisconnectWallet()` |
| Selected account | `useWalletUiAccount()` | `useConnectedWallet()` |
| Transaction signer | `useWalletUiSigner({ account })` | `useConnectedWallet().signer` |
| Cluster selection | `useWalletUiCluster()` | `useChain()` + provider props |
| Account persistence | Nanostores persistent atom (`wallet-ui:account`) | kit-plugin-wallet storage (`kit-wallet`) |
| Cluster persistence | Nanostores persistent atom (`wallet-ui:cluster`) | Not in react-kit (app-layer concern) |

#### What wallet-ui adds on top

Wallet-UI's unique contribution is its **UI component layer** — react-kit provides no UI:

- **`WalletUiDropdown`** — connect/disconnect dropdown with wallet list
- **`WalletUiModal`** / **`WalletUiModalTrigger`** — wallet selection modal
- **`WalletUiList`** / **`WalletUiListButton`** — wallet list with icons
- **`WalletUiIcon`** / **`WalletUiLabel`** — wallet icon and name display
- **`WalletUiAccountGuard`** — conditional rendering based on connection status
- **`WalletUiClusterDropdown`** — cluster selector
- **`BaseDropdown`** / **`BaseModal`** — generic headless primitives (Zag.js)
- **`@wallet-ui/css`** / **`@wallet-ui/tailwind`** — optional Tailwind styling via `data-wu` attributes

#### How wallet-ui would build on react-kit

Wallet-UI is the simplest integration — its core state (Nanostores + contexts) maps directly to react-kit's hooks with no friction:

```tsx
// Wallet-UI's provider would wrap react-kit's WalletProvider
// and use its hooks instead of Nanostores for state.
function WalletUi({ config, children }) {
    return (
        <WalletProvider chain={config.clusters[0].id}>
            <WalletUiClusterContextProvider clusters={config.clusters}>
                {children}
            </WalletUiClusterContextProvider>
        </WalletProvider>
    );
}

// Wallet-UI's hooks become thin wrappers around react-kit
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

The plugin's built-in persistence (`walletName:address` format) matches what wallet-ui already stores, so wallet-ui can use it directly — no need to disable and reimplement like connectorkit. The UI components (dropdowns, modals, wallet lists) remain wallet-ui's value-add, now built on react-kit's hooks instead of its own state layer.

### Comparison with wallet-adapter

[`wallet-adapter`](https://github.com/anza-xyz/wallet-adapter) (`@solana/wallet-adapter-react`) is the most widely used wallet library in the Solana ecosystem. It's the API most React developers are currently familiar with. react-kit is not a drop-in replacement — it's built on Kit and wallet-standard instead of web3.js and the adapter pattern — but the mental model maps closely.

#### API mapping

| wallet-adapter | react-kit | Notes |
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
| `WalletProvider` | `WalletProvider` | Props-based config instead of adapter instances |
| `WalletModalProvider` / `useWalletModal` | Not provided | UI concern — use wallet-ui or connectorkit |
| `WalletMultiButton` | Not provided | UI concern |
| `useAnchorWallet()` | Not provided | Anchor-specific, buildable on `useConnectedWallet()` |
| Adapter packages (`PhantomWalletAdapter`, etc.) | Not needed | Wallet-standard handles discovery automatically |
| `onError` global handler | Not provided | Errors surface per-hook and via promise rejection — standard React patterns |

#### Key differences developers will notice

**No adapter pattern.** wallet-adapter requires importing and instantiating adapters per wallet (`new PhantomWalletAdapter()`). react-kit uses wallet-standard — wallets register themselves, no imports needed.

**No `select` + `connect` two-step.** wallet-adapter separates wallet selection from connection. react-kit's `useConnectWallet()` takes a `UiWallet` and connects in one call. The two-step pattern was an artifact of the adapter model where selection and connection were separate concerns.

**No `publicKey`.** wallet-adapter developers are used to `wallet.publicKey` as the primary identifier. In react-kit it's `useConnectedWallet()?.account.address` — a string `Address` instead of a `PublicKey` class. This is a Kit-wide change.

**Instructions, not transactions.** wallet-adapter's `sendTransaction` takes a pre-built `Transaction` + `Connection`. react-kit's `useSendTransaction` takes instructions — the plugin chain handles blockhash, fee payer, signing, sending, and confirmation. For cases that need manual transaction construction (sign-then-send, partial signing), `useAction` + Kit's signing primitives provide full control.

**No bundled UI.** wallet-adapter ships `WalletMultiButton` and modal components that were a common pain point — hard to customize and didn't match app design systems. react-kit is headless. UI comes from wallet-ui, connectorkit, or the app's own components.

**Granular hooks.** wallet-adapter puts everything on one `useWallet()` context — any wallet state change re-renders all consumers. react-kit splits into focused hooks (`useWallets`, `useWalletStatus`, `useConnectedWallet`, etc.) so components subscribe only to what they need.

**No global error handler.** wallet-adapter's `onError` prop was a second error channel alongside thrown errors, which caused confusion about which path errors take. react-kit uses standard React patterns: hook-level errors (`useBalance().error`), promise rejection (`await connect(wallet)` throws on failure), and Error Boundaries for unexpected failures.

### Before and after: Kit example React app

The [Kit example React app](https://github.com/anza-xyz/kit/tree/main/examples/react-app) is a complete wallet/transaction app built directly on `@solana/kit` and `@solana/react` — without any higher-level library. It demonstrates what developers must build today. Comparing it to react-kit shows the boilerplate that react-kit eliminates.

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

**With react-kit:**

```tsx
<WalletProvider chain="solana:devnet">
    <RpcProvider url="https://api.devnet.solana.com" wsUrl="wss://api.devnet.solana.com">
        <App />
    </RpcProvider>
</WalletProvider>
```

Chain context, RPC client creation, wallet persistence, and localStorage sync are handled by the providers and the underlying plugins.

#### Wallet connection UI

**Today** — ~100 lines of custom code: manually filter wallets by `StandardConnect` / `StandardDisconnect` features, build a menu with per-wallet submenus for account selection, compare accounts with `uiWalletAccountsAreSame()`, handle connect/disconnect errors, and manage a separate Sign In With Solana menu.

**With react-kit:**

```tsx
const wallets = useWallets();
const connect = useConnectWallet();
const disconnect = useDisconnectWallet();
const connected = useConnectedWallet();
// Build your UI with these — no feature filtering, account comparison, or state sync needed
```

#### Live balance

**Today** — a custom `balanceSubscribe` function (~40 lines) that manually creates a `createReactiveStoreWithInitialValueAndSlotTracking`, manages `AbortController` lifecycle, bridges into SWR via `useSWRSubscription`, and tracks seen errors with a `WeakSet` to avoid duplicate dialogs.

**With react-kit:**

```tsx
const { data: balance, error, isLoading } = useBalance(address);
```

#### Transaction sending

**Today** — three separate feature panels (sign & send, sign then send, partial sign), each 150–350 lines. Each manually: builds a form, converts SOL strings to lamports, fetches the latest blockhash, pipes together a transaction message with `setTransactionMessageFeePayerSigner` / `setTransactionMessageLifetimeUsingBlockhash` / `appendTransactionMessageInstruction`, manages a multi-state state machine (`'inputs-form-active' | 'creating-transaction' | 'ready-to-send' | 'sending-transaction'`), signs, sends, confirms, and manually calls `mutate()` to invalidate the SWR balance cache.

**With react-kit** — the common case (sign & send) is one line:

```tsx
const { send, status, data, error } = useSendTransaction();
await send(getTransferInstruction({ source, destination, amount }));
```

Sign-then-send and partial signing use `useAction` to track each step independently:

```tsx
const client = useClient();

// Plan → sign → review → send (three separate user-visible steps)
const { send: plan, data: message } = useAction(
    (input) => client.planTransaction(input),
);
const { send: sign, data: signed } = useAction(
    (msg) => signTransactionMessageWithSigners(msg),
);
const { send: sendSigned, status } = useAction(
    (tx) => sendAndConfirmTransaction(client.rpc, tx, { commitment: 'confirmed' }),
);

// Partial signing — sign with one signer, pass to another
const { send: partialSign, data: partiallySigned } = useAction(
    (msg) => partiallySignTransactionMessageWithSigners(msg),
);
```

Balance invalidation is handled by the adapter's mutation hooks (`invalidateKeys` / `revalidateKeys`).

#### Subscription management

**Today** — the slot indicator component (~50 lines) manually creates a reactive store from `rpcSubscriptions.slotNotifications().reactive()`, wires it into `useSyncExternalStore` with a custom subscribe/getSnapshot, and manages an `AbortController` in a `useEffect`.

**With react-kit:**

```tsx
const { data: slot } = useSubscription(
    (signal) => client.rpcSubscriptions.slotNotifications(),
    [client],
);
```

#### Summary

| Area | Kit example (today) | react-kit |
|------|-------------------|-----------|
| Provider setup | 3 custom contexts, localStorage sync, manual RPC creation | 2 providers |
| Wallet UI | ~100 lines, manual feature filtering | Hooks + your own UI |
| Balance | ~50 lines, SWR + reactive store + AbortController + WeakSet | `useBalance(address)` |
| Transaction (×3 types) | 150–350 lines each, manual state machines | `useSendTransaction()` |
| Subscriptions | Manual reactive store + useSyncExternalStore + AbortController | `useSubscription()` |
| Chain switching | Custom context + localStorage + URL resolution | Provider props |
| **Total custom code** | **~1,200 lines** | **Focus on app-specific logic** |

The Kit example app is well-written — the complexity is inherent to building on low-level primitives. react-kit absorbs that complexity into reusable hooks and providers so developers can focus on their app.