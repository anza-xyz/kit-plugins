import type { Client } from '@solana/kit';
import { createContext, type ReactNode, useContext } from 'react';

import { usePromise } from './internal/use-promise';

/**
 * Known Solana chain identifiers following the wallet-standard / CAIP-2
 * `namespace:reference` convention. Prefer one of these literals so that
 * TypeScript autocompletes the correct value at call sites.
 */
export type SolanaChain = 'solana:mainnet' | 'solana:devnet' | 'solana:testnet';

/**
 * Wallet-standard / CAIP-2 namespaced chain identifier
 * (`namespace:reference`, e.g. `'solana:mainnet'`, `'eip155:1'`). Inlined
 * here so this package doesn't need a runtime dep on
 * `@wallet-standard/base` for a type-only import.
 */
type ChainIdentifierString = `${string}:${string}`;

/**
 * Chain identifier accepted by {@link KitClientProvider}. Solana literals
 * autocomplete; the intersection with `ChainIdentifierString & {}`
 * preserves those literals while still accepting any `${string}:${string}`
 * identifier for custom or non-Solana chains.
 */
export type ChainIdentifier = SolanaChain | (ChainIdentifierString & {});

/**
 * React context carrying the Kit client.
 *
 * Exposed so advanced consumers can compose on top of an existing context.
 * Most callers should reach for {@link useClient} or a named hook instead.
 *
 * @see {@link useClient}
 */
export const ClientContext = createContext<Client<object> | null>(null);
ClientContext.displayName = 'KitClientContext';

/**
 * React context carrying the chain identifier configured on the nearest
 * {@link KitClientProvider}.
 *
 * @see {@link useChain}
 */
export const ChainContext = createContext<ChainIdentifier | null>(null);
ChainContext.displayName = 'KitChainContext';

/**
 * Props for {@link KitClientProvider}.
 */
export type KitClientProviderProps = Readonly<{
    /**
     * A Kit client, or a promise resolving to one. When a promise is
     * passed, the provider suspends via the nearest `<Suspense>` boundary
     * until it resolves (React 19's `use(promise)` on 19, a thrown-promise
     * shim on 18). The promise must be stable across renders — wrap it in
     * `useMemo` or hoist it to module scope.
     */
    client: Client<object> | Promise<Client<object>>;
    /**
     * Optional chain identifier to publish to the subtree. Wallet-aware
     * descendants read it via {@link useChain}.
     */
    chain?: ChainIdentifier;
    children?: ReactNode;
}>;

/**
 * Root provider for `@solana/kit-react`.
 *
 * Publishes a caller-owned Kit client to the subtree. Every hook in this
 * library requires a {@link KitClientProvider} ancestor. The client is
 * built outside React via `createClient().use(...)`; pass the result (or a
 * `Promise` of one when any installed plugin is async) as the `client`
 * prop. The provider itself does no composition, lifecycle management, or
 * disposal — that all belongs to the caller.
 *
 * When `client` is a promise, the provider suspends until it resolves, so
 * a `<Suspense>` boundary must be mounted above.
 *
 * @param props - The Kit client (sync or async), optional chain, and children.
 * @return A React element that publishes the Kit client to its subtree.
 *
 * @example
 * ```tsx
 * import { createClient } from '@solana/kit';
 * import { solanaMainnetRpc } from '@solana/kit-plugin-rpc';
 * import { walletSigner } from '@solana/kit-plugin-wallet';
 * import { KitClientProvider } from '@solana/kit-react';
 *
 * const client = createClient()
 *     .use(walletSigner({ chain: 'solana:mainnet' }))
 *     .use(solanaMainnetRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
 *
 * export function App() {
 *     return (
 *         <KitClientProvider client={client} chain="solana:mainnet">
 *             <Shell />
 *         </KitClientProvider>
 *     );
 * }
 * ```
 *
 * @see {@link useClient}
 * @see {@link useChain}
 */
export function KitClientProvider({ chain, children, client }: KitClientProviderProps) {
    const resolved = isPromiseLike(client) ? usePromise(client) : client;
    const tree = <ClientContext.Provider value={resolved}>{children}</ClientContext.Provider>;
    return chain ? <ChainContext.Provider value={chain}>{tree}</ChainContext.Provider> : tree;
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
    if (value instanceof Promise) return true;
    // Handle realm-crossing promises (a `Promise` instantiated in a different
    // global, e.g. an iframe or a test runner that swaps globalThis) by
    // duck-typing the `.then` method as a fallback. A plain Kit client is an
    // object built via `extendClient`, which never installs `then`, so this
    // is unambiguous in practice.
    return typeof (value as { then?: unknown }).then === 'function';
}

/**
 * Reads the Kit client from context.
 *
 * Defaults to the base `Client<object>` shape. Callers who know specific
 * plugins are installed can widen via the generic argument, matching the
 * escape-hatch pattern used by {@link useChain}.
 *
 * @typeParam TClient - The client shape to widen the return to. Defaults to `object`.
 * @return The Kit client cast to `Client<TClient>`.
 * @throws An `Error` if no {@link KitClientProvider} ancestor is present.
 *
 * @example
 * ```tsx
 * const client = useClient<ClientWithRpc<SolanaRpcApi>>();
 * const epoch = await client.rpc.getEpochInfo().send();
 * ```
 *
 * @see {@link useClientCapability}
 * @see {@link useChain}
 */
export function useClient<TClient extends object = object>(): Client<TClient> {
    const client = useContext(ClientContext);
    if (client === null) {
        throw new Error('useClient() must be called inside a <KitClientProvider>.');
    }
    return client as Client<TClient>;
}

/**
 * Reads the chain identifier from context.
 *
 * The chain is published by the nearest {@link KitClientProvider} via its
 * `chain` prop. Wallet-aware code reaches for this; plain read paths that
 * don't care about cluster can ignore it.
 *
 * @typeParam T - Widen the return type when your provider is configured
 *                with a custom chain identifier. Defaults to the narrow
 *                {@link SolanaChain} union so callers get autocomplete.
 * @return The chain identifier published by {@link KitClientProvider}.
 * @throws An `Error` if no chain has been published.
 *
 * @example
 * ```tsx
 * const chain = useChain();
 * // chain is 'solana:mainnet' | 'solana:devnet' | 'solana:testnet'
 * ```
 */
export function useChain<T extends ChainIdentifierString = SolanaChain>(): T {
    const chain = useContext(ChainContext);
    if (chain === null) {
        throw new Error('useChain() requires a chain to be set via the `chain` prop on <KitClientProvider>.');
    }
    return chain as T;
}
