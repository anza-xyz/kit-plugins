import { type Client, createClient } from '@solana/kit';
import type { SolanaChain } from '@solana/wallet-standard-chains';
import type { IdentifierString } from '@wallet-standard/base';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

import { throwMissingProvider } from './internal/errors';

/**
 * Wallet-standard chain identifier published by {@link KitClientProvider}.
 *
 * Unions {@link SolanaChain} (so `"solana:mainnet"`, `"solana:devnet"`, and
 * `"solana:testnet"` show up in autocomplete) with wallet-standard's
 * {@link IdentifierString} (`${string}:${string}`) as an escape hatch for
 * custom chains or L2s. The `& {}` intersection is the canonical TypeScript
 * trick for preserving literal autocomplete alongside a wider template
 * literal type — without it, TS would collapse the union down to the wider
 * template type and the literal suggestions would be lost.
 */
export type ChainIdentifier = SolanaChain | (IdentifierString & {});

/**
 * The React context that holds the Kit client.
 *
 * Exposed so third-party providers can read and extend the client from their
 * own hooks (see the "Third-party extensions" section of the README). Most
 * consumers should use {@link useClient} rather than reading the context
 * directly.
 */
export const ClientContext = createContext<Client<object> | null>(null);
ClientContext.displayName = 'ClientContext';

/**
 * The React context that holds the current chain identifier.
 *
 * Set by {@link KitClientProvider} at the root of the tree. Read via
 * {@link useChain}.
 */
export const ChainContext = createContext<ChainIdentifier | null>(null);
ChainContext.displayName = 'ChainContext';

/**
 * Access the raw Kit client from context.
 *
 * Power-user escape hatch for imperative use. Most app code should use the
 * higher-level hooks (e.g. {@link useBalance}, {@link useSendTransaction}).
 *
 * The generic type parameter is a type assertion — it is the hook caller's
 * responsibility to ensure that the appropriate providers are mounted so that
 * the client satisfies `TClient` at runtime.
 *
 * @typeParam TClient - The expected shape of the client after all ancestor
 *   providers have applied their plugins.
 * @throws If no ancestor {@link KitClientProvider} is mounted.
 *
 * @example
 * ```tsx
 * const client = useClient();
 * const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
 * ```
 *
 * @example With a custom plugin's extended type
 * ```tsx
 * import type { DasClient } from '@my-org/kit-plugin-das';
 *
 * function useAsset(address: Address) {
 *     const client = useClient<DasClient>();
 *     return useSWR(['das-asset', address], () => client.das.getAsset(address).send());
 * }
 * ```
 */
export function useClient<TClient extends object = object>(): Client<TClient> {
    const client = useContext(ClientContext);
    if (client === null) {
        throwMissingProvider('useClient', 'KitClientProvider');
    }
    return client as Client<TClient>;
}

/**
 * Returns the current chain identifier from context.
 *
 * Defaults to returning a {@link SolanaChain} — the narrow literal union that
 * covers the 99% case and gives callers autocomplete without a cast. Power
 * users who opted into the {@link ChainIdentifier} escape hatch at the root
 * can widen the return type via the generic parameter (e.g.
 * `useChain<IdentifierString>()` for the fully-wide wallet-standard type, or
 * `useChain<'l2:mainnet' | 'solana:mainnet'>()` for a custom narrow union).
 *
 * The generic is a type assertion, not inference — same pattern as
 * {@link useClient}. It is the caller's responsibility to make sure the chain
 * actually provided to {@link KitClientProvider} matches `T` at runtime.
 *
 * @typeParam T - The chain type the caller expects. Defaults to `SolanaChain`.
 * @throws If no ancestor {@link KitClientProvider} is mounted.
 *
 * @example
 * ```tsx
 * const chain = useChain(); // SolanaChain — autocompletes 'solana:mainnet' etc.
 * ```
 *
 * @example Widening for a custom chain
 * ```tsx
 * const chain = useChain<IdentifierString>(); // accepts 'l2:mainnet' too
 * ```
 */
export function useChain<T extends IdentifierString = SolanaChain>(): T {
    const chain = useContext(ChainContext);
    if (chain === null) {
        throwMissingProvider('useChain', 'KitClientProvider');
    }
    return chain as T;
}

/** Props for {@link KitClientProvider}. */
export type KitClientProviderProps = {
    /**
     * The chain this subtree targets, e.g. `'solana:mainnet'`.
     *
     * Accepts any {@link SolanaChain} (with literal autocomplete) and, as an
     * escape hatch, any wallet-standard {@link IdentifierString} shape
     * (`${string}:${string}`) for custom chains or non-Solana L2s.
     */
    chain: ChainIdentifier;
    /** React children to render inside the provider. */
    children?: ReactNode;
};

/**
 * Root provider for a `@solana/kit-react` tree.
 *
 * Seeds the client context with a fresh Kit client via `createClient()` and
 * publishes the configured chain for {@link useChain}. Every other provider
 * in the library ({@link WalletProvider}, {@link PayerProvider},
 * {@link RpcProvider}, …) composes on top of this one via `.use()`, so every
 * app must mount a `KitClientProvider` at the top of its tree.
 *
 * @example Common case
 * ```tsx
 * <KitClientProvider chain="solana:mainnet">
 *     <WalletProvider>
 *         <RpcProvider url="https://api.mainnet-beta.solana.com">
 *             <App />
 *         </RpcProvider>
 *     </WalletProvider>
 * </KitClientProvider>
 * ```
 *
 * @example Testing setup with no wallet
 * ```tsx
 * <KitClientProvider chain="solana:devnet">
 *     <PayerProvider signer={testPayer}>
 *         <LiteSvmProvider>
 *             <App />
 *         </LiteSvmProvider>
 *     </PayerProvider>
 * </KitClientProvider>
 * ```
 */
export function KitClientProvider({ chain, children }: KitClientProviderProps) {
    const client = useMemo(() => createClient(), []);
    return (
        <ChainContext.Provider value={chain}>
            <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
        </ChainContext.Provider>
    );
}
