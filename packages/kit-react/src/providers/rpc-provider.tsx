import type { ClusterUrl } from '@solana/kit';
import type { SolanaRpcConfig } from '@solana/kit-plugin-rpc';
import { solanaDevnetRpc, solanaLocalRpc, solanaMainnetRpc, solanaRpc } from '@solana/kit-plugin-rpc';
import { type ReactNode, useMemo } from 'react';

import { useClientCapability } from '../client-capability';
import { ChainContext, type ChainIdentifier } from '../client-context';
import { type AnyPlugin, PluginProvider } from './plugin-provider';

const PAYER_HINT =
    'Mount a <WalletProvider>, <PayerProvider>, or <SignerProvider> above it, or switch to <RpcConnectionProvider> if you are not sending transactions.';

/**
 * Memoizes a single-plugin array keyed on every `SolanaRpcConfig` field, so
 * the four providers below share one canonical dep list instead of each
 * hand-spelling the same seven keys.
 *
 * @internal
 */
function useRpcConfigPlugin(build: () => AnyPlugin, config: Partial<SolanaRpcConfig<string>>): readonly AnyPlugin[] {
    // `build` closes over `config`, which is the only churn source the
    // providers care about — the explicit key list below tracks it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(
        () => [build()],
        [
            config.rpcUrl,
            config.rpcSubscriptionsUrl,
            config.maxConcurrency,
            config.rpcConfig,
            config.rpcSubscriptionsConfig,
            config.skipPreflight,
            config.transactionConfig,
        ],
    );
}

/**
 * Props for {@link RpcProvider}. Extends `SolanaRpcConfig` from
 * `@solana/kit-plugin-rpc` so the provider surface stays zero-drift with
 * the underlying plugin.
 */
export type RpcProviderProps = Readonly<
    SolanaRpcConfig<ClusterUrl> & {
        /**
         * Optional chain identifier to publish to the subtree. When set,
         * overrides any chain set by an ancestor {@link KitClientProvider}.
         */
        chain?: ChainIdentifier;
        children?: ReactNode;
    }
>;

/**
 * Full transaction-capable RPC provider.
 *
 * Installs `client.rpc`, `client.rpcSubscriptions`,
 * `client.planTransaction[s]`, and `client.sendTransaction[s]`. Requires
 * a `client.payer` to already be installed by an ancestor provider
 * (e.g. {@link PayerProvider}, {@link SignerProvider}, or a wallet
 * provider that installs a payer). For apps that only read chain state,
 * use {@link RpcConnectionProvider}, which doesn't require a payer.
 *
 * @param props - `SolanaRpcConfig` fields, optional chain override, and children.
 * @return A React element that re-publishes the extended client.
 * @throws An `Error` at mount if no `client.payer` is present on the
 *         enclosing client.
 *
 * @example
 * ```tsx
 * <SignerProvider signer={mySigner}>
 *     <RpcProvider rpcUrl="https://api.devnet.solana.com">
 *         <App />
 *     </RpcProvider>
 * </SignerProvider>
 * ```
 *
 * @see {@link RpcConnectionProvider}
 * @see {@link LiteSvmProvider}
 * @see {@link SolanaMainnetRpcProvider}
 * @see {@link SolanaDevnetRpcProvider}
 * @see {@link SolanaLocalRpcProvider}
 */
export function RpcProvider({ chain, children, ...config }: RpcProviderProps) {
    useClientCapability({
        capability: 'payer',
        hookName: '<RpcProvider>',
        providerHint: PAYER_HINT,
    });
    const plugins = useRpcConfigPlugin(() => solanaRpc(config as SolanaRpcConfig<ClusterUrl>), config);
    const tree = <PluginProvider plugins={plugins}>{children}</PluginProvider>;
    return chain ? <ChainContext.Provider value={chain}>{tree}</ChainContext.Provider> : tree;
}

/**
 * Props for {@link SolanaMainnetRpcProvider}.
 */
export type SolanaMainnetRpcProviderProps = Readonly<
    SolanaRpcConfig<string> & {
        children?: ReactNode;
    }
>;

/**
 * Mainnet-specific transaction-capable RPC provider.
 *
 * Thin wrapper around {@link RpcProvider} that sets up a mainnet RPC via
 * `solanaMainnetRpc` and implicitly publishes `chain='solana:mainnet'` to
 * the subtree — so wallet-aware descendants can read {@link useChain}
 * without the root provider having to redeclare the cluster.
 *
 * @param props - `SolanaRpcConfig` fields plus children.
 * @return A React element that re-publishes the extended client and chain.
 *
 * @example
 * ```tsx
 * <KitClientProvider>
 *     <SignerProvider signer={mySigner}>
 *         <SolanaMainnetRpcProvider rpcUrl="https://api.mainnet-beta.solana.com">
 *             <App />
 *         </SolanaMainnetRpcProvider>
 *     </SignerProvider>
 * </KitClientProvider>
 * ```
 *
 * @see {@link RpcProvider}
 * @see {@link SolanaDevnetRpcProvider}
 * @see {@link SolanaLocalRpcProvider}
 */
export function SolanaMainnetRpcProvider({ children, ...config }: SolanaMainnetRpcProviderProps) {
    useClientCapability({
        capability: 'payer',
        hookName: '<SolanaMainnetRpcProvider>',
        providerHint: PAYER_HINT,
    });
    const plugins = useRpcConfigPlugin(() => solanaMainnetRpc(config), config);
    return (
        <ChainContext.Provider value="solana:mainnet">
            <PluginProvider plugins={plugins}>{children}</PluginProvider>
        </ChainContext.Provider>
    );
}

/**
 * Props for {@link SolanaDevnetRpcProvider}.
 */
export type SolanaDevnetRpcProviderProps = Readonly<
    Partial<SolanaRpcConfig<string>> & {
        children?: ReactNode;
    }
>;

/**
 * Devnet-specific transaction-capable RPC provider with airdrop support.
 *
 * Thin wrapper around `solanaDevnetRpc`. Defaults `rpcUrl` to
 * `https://api.devnet.solana.com`, installs `client.airdrop`, and
 * implicitly publishes `chain='solana:devnet'` to the subtree.
 *
 * @param props - Optional `SolanaRpcConfig` fields and children.
 * @return A React element that re-publishes the extended client and chain.
 *
 * @example
 * ```tsx
 * <KitClientProvider>
 *     <SignerProvider signer={mySigner}>
 *         <SolanaDevnetRpcProvider>
 *             <App />
 *         </SolanaDevnetRpcProvider>
 *     </SignerProvider>
 * </KitClientProvider>
 * ```
 *
 * @see {@link RpcProvider}
 * @see {@link SolanaMainnetRpcProvider}
 * @see {@link SolanaLocalRpcProvider}
 */
export function SolanaDevnetRpcProvider({ children, ...config }: SolanaDevnetRpcProviderProps) {
    useClientCapability({
        capability: 'payer',
        hookName: '<SolanaDevnetRpcProvider>',
        providerHint: PAYER_HINT,
    });
    const plugins = useRpcConfigPlugin(() => solanaDevnetRpc(config), config);
    return (
        <ChainContext.Provider value="solana:devnet">
            <PluginProvider plugins={plugins}>{children}</PluginProvider>
        </ChainContext.Provider>
    );
}

/**
 * Props for {@link SolanaLocalRpcProvider}.
 */
export type SolanaLocalRpcProviderProps = Readonly<
    Partial<SolanaRpcConfig<string>> & {
        /**
         * Optional chain identifier to publish to the subtree. Local
         * validators have no canonical CAIP-2 identifier, so this
         * provider does not set chain by default. Pass it explicitly
         * when wallet-aware descendants need it (commonly
         * `solana:devnet` for local testing against devnet-like
         * behavior).
         */
        chain?: ChainIdentifier;
        children?: ReactNode;
    }
>;

/**
 * Local validator transaction-capable RPC provider with airdrop support.
 *
 * Thin wrapper around `solanaLocalRpc`. Defaults URLs to
 * `http://127.0.0.1:8899` and `ws://127.0.0.1:8900`, and installs
 * `client.airdrop`. Unlike the mainnet and devnet variants, this
 * provider does not set chain implicitly — local validators have no
 * canonical identifier, so pass `chain` explicitly if wallet-aware
 * descendants need it.
 *
 * @param props - Optional `SolanaRpcConfig` fields, optional chain, and children.
 * @return A React element that re-publishes the extended client.
 *
 * @example
 * ```tsx
 * <KitClientProvider>
 *     <SignerProvider signer={mySigner}>
 *         <SolanaLocalRpcProvider>
 *             <App />
 *         </SolanaLocalRpcProvider>
 *     </SignerProvider>
 * </KitClientProvider>
 * ```
 *
 * @see {@link RpcProvider}
 * @see {@link SolanaMainnetRpcProvider}
 * @see {@link SolanaDevnetRpcProvider}
 */
export function SolanaLocalRpcProvider({ chain, children, ...config }: SolanaLocalRpcProviderProps) {
    useClientCapability({
        capability: 'payer',
        hookName: '<SolanaLocalRpcProvider>',
        providerHint: PAYER_HINT,
    });
    const plugins = useRpcConfigPlugin(() => solanaLocalRpc(config), config);
    const tree = <PluginProvider plugins={plugins}>{children}</PluginProvider>;
    return chain ? <ChainContext.Provider value={chain}>{tree}</ChainContext.Provider> : tree;
}
