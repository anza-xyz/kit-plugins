import { litesvm, type LiteSvmConfig } from '@solana/kit-plugin-litesvm';
import { type ReactNode, useMemo } from 'react';

import { useClientCapability } from '../client-capability';
import { PluginProvider } from './plugin-provider';

/**
 * Props for {@link LiteSvmProvider}. Extends `LiteSvmConfig` from
 * `@solana/kit-plugin-litesvm`.
 */
export type LiteSvmProviderProps = Readonly<
    LiteSvmConfig & {
        children?: ReactNode;
    }
>;

/**
 * Drop-in replacement for {@link RpcProvider} in test or dev environments.
 *
 * Provides RPC, transaction planning, and execution backed by a local
 * LiteSVM instance instead of a remote RPC node. Requires an ancestor
 * provider that installs a `client.payer`.
 *
 * @param props - `LiteSvmConfig` fields plus children.
 * @return A React element that re-publishes the extended client.
 * @throws An `Error` at mount if no `client.payer` is present on the
 *         enclosing client.
 *
 * @example
 * ```tsx
 * <SignerProvider signer={testSigner}>
 *     <LiteSvmProvider>
 *         <App />
 *     </LiteSvmProvider>
 * </SignerProvider>
 * ```
 *
 * @see {@link RpcProvider}
 */
export function LiteSvmProvider({ children, ...config }: LiteSvmProviderProps) {
    useClientCapability({
        capability: 'payer',
        hookName: '<LiteSvmProvider>',
        providerHint: 'Mount a <WalletProvider>, <PayerProvider>, or <SignerProvider> above it.',
    });
    // `satisfies Record<keyof LiteSvmConfig, unknown>` guards against drift:
    // if Kit adds a field to `LiteSvmConfig`, TypeScript flags the missing
    // key here instead of the provider silently failing to rebuild on it.
    const depsByKey = {
        transactionConfig: config.transactionConfig,
    } satisfies Record<keyof LiteSvmConfig, unknown>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const plugins = useMemo(() => [litesvm(config as LiteSvmConfig)], Object.values(depsByKey));
    return <PluginProvider plugins={plugins}>{children}</PluginProvider>;
}
