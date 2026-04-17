import { type Client } from '@solana/kit';
import type { SolanaChain } from '@solana/wallet-standard-chains';
import type { IdentifierString } from '@wallet-standard/base';
import { type ReactNode } from 'react';
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
export declare const ClientContext: import("react").Context<Client<object> | null>;
/**
 * The React context that holds the current chain identifier.
 *
 * Set by {@link KitClientProvider} at the root of the tree. Read via
 * {@link useChain}.
 */
export declare const ChainContext: import("react").Context<ChainIdentifier | null>;
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
export declare function useClient<TClient extends object = object>(): Client<TClient>;
/**
 * Returns the current chain identifier from context.
 *
 * Typically a {@link SolanaChain} such as `"solana:mainnet"`, but the return
 * type widens to {@link ChainIdentifier} to cover the custom-chain escape
 * hatch on {@link KitClientProvider}. Useful for chain-dependent logic such as
 * constructing explorer URLs or passing to `createSignerFromWalletAccount`.
 *
 * @throws If no ancestor {@link KitClientProvider} is mounted.
 *
 * @example
 * ```tsx
 * const chain = useChain(); // 'solana:mainnet'
 * ```
 */
export declare function useChain(): ChainIdentifier;
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
export declare function KitClientProvider({ chain, children }: KitClientProviderProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=client-context.d.ts.map