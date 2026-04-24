import type { Client } from '@solana/kit';
import { createClient } from '@solana/kit';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

import { useDisposeOnUnmount } from './internal/dispose';

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
 * Chain identifier accepted by {@link ChainProvider} and the
 * chain-specific RPC providers. Solana literals autocomplete; the
 * intersection with `ChainIdentifierString & {}` preserves those literals
 * while still accepting any `${string}:${string}` identifier for custom
 * or non-Solana chains.
 */
export type ChainIdentifier = SolanaChain | (ChainIdentifierString & {});

/**
 * React context carrying the Kit client.
 *
 * Exposed so that third-party providers can compose on top of an existing
 * context. Most consumers should reach for {@link useClient} or a named
 * hook instead.
 *
 * @see {@link useClient}
 */
export const ClientContext = createContext<Client<object> | null>(null);
ClientContext.displayName = 'KitClientContext';

/**
 * React context carrying the chain identifier configured on the nearest
 * {@link KitClientProvider}.
 *
 * Consumers should prefer {@link useChain}.
 *
 * @see {@link useChain}
 */
export const ChainContext = createContext<ChainIdentifier | null>(null);
ChainContext.displayName = 'KitChainContext';

/**
 * Props for {@link KitClientProvider}.
 */
export type KitClientProviderProps = Readonly<{
    children?: ReactNode;
    /**
     * Optional pre-built Kit client. When omitted, a fresh `createClient()`
     * is used and disposed on unmount. When provided, the caller owns
     * disposal — the provider does not call `Symbol.dispose`.
     */
    client?: Client<object>;
}>;

/**
 * Root provider for `@solana/kit-react`.
 *
 * Seeds a Kit client into context. Every hook in this library requires a
 * {@link KitClientProvider} ancestor.
 *
 * Chain is a separate concern, published by chain-specific RPC providers
 * (e.g. {@link SolanaMainnetRpcProvider}), wallet providers, or — when
 * neither applies — an explicit {@link ChainProvider}. Wallet-aware code
 * reads it via {@link useChain}, which throws if no ancestor has set it.
 *
 * @param props - Optional pre-built client and children.
 * @return A React element that publishes the Kit client to its subtree.
 *
 * @example
 * ```tsx
 * <KitClientProvider>
 *     <SolanaMainnetRpcProvider rpcUrl="https://api.mainnet-beta.solana.com">
 *         <App />
 *     </SolanaMainnetRpcProvider>
 * </KitClientProvider>
 * ```
 *
 * @see {@link useClient}
 * @see {@link ChainProvider}
 * @see {@link useChain}
 */
export function KitClientProvider({ children, client: providedClient }: KitClientProviderProps) {
    const ownedClient = useMemo(() => {
        if (providedClient) return null;
        return createClient();
    }, [providedClient]);
    const client = providedClient ?? ownedClient;
    useDisposeOnUnmount(client ?? {}, ownedClient != null);
    // `client` is always defined at this point — `ownedClient` is created
    // in the `useMemo` whenever `providedClient` is null.
    return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

/**
 * Props for {@link ChainProvider}.
 */
export type ChainProviderProps = Readonly<{
    /** The chain identifier to publish to the subtree. */
    chain: ChainIdentifier;
    children?: ReactNode;
}>;

/**
 * Publishes a chain identifier to the subtree.
 *
 * Most apps never need this directly. Chain-specific RPC providers such
 * as {@link SolanaMainnetRpcProvider} publish their cluster implicitly,
 * and wallet providers publish the connected wallet's chain. Mount
 * `ChainProvider` only when you need to declare a chain without either —
 * e.g. a custom RPC URL for a fork that wallets should still treat as
 * mainnet, or a read-only app that wants chain metadata for UI.
 *
 * When mounted, `ChainProvider` overrides any chain set by an ancestor.
 *
 * @param props - The chain identifier and children.
 * @return A React element that publishes the chain to its subtree.
 *
 * @example
 * ```tsx
 * <ChainProvider chain="solana:mainnet">
 *     <RpcConnectionProvider rpcUrl="https://my-fork.example.com">
 *         <App />
 *     </RpcConnectionProvider>
 * </ChainProvider>
 * ```
 *
 * @see {@link useChain}
 */
export function ChainProvider({ chain, children }: ChainProviderProps) {
    return <ChainContext.Provider value={chain}>{children}</ChainContext.Provider>;
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
 * Chain is published by chain-specific providers such as
 * `<SolanaMainnetRpcProvider>`, by wallet providers, or by an explicit
 * {@link ChainProvider}. If nothing has published a chain, this throws —
 * reaching for chain outside wallet-aware code is a programmer error,
 * not a runtime branch.
 *
 * @typeParam T - Widen the return type when your provider is configured
 *                with a custom chain identifier. Defaults to the narrow
 *                {@link SolanaChain} union so callers get autocomplete.
 * @return The chain identifier published by the nearest provider.
 * @throws An `Error` if no chain has been published by any ancestor.
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
        throw new Error(
            'useChain() requires a chain to be set. Mount a chain-specific provider such as <SolanaMainnetRpcProvider>, a wallet provider, or <ChainProvider>.',
        );
    }
    return chain as T;
}
