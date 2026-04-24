import { litesvm, type LiteSvmConfig } from '@solana/kit-plugin-litesvm';
import { type ReactNode, useMemo } from 'react';

import { useClient } from '../client-context';
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
    const client = useClient<{ payer?: unknown }>();
    if (!('payer' in client)) {
        throw new Error(
            '<LiteSvmProvider> requires a payer on the client. Mount a <WalletProvider>, <PayerProvider>, or <SignerProvider> above it.',
        );
    }
    const plugins = useMemo(() => [litesvm(config as LiteSvmConfig)], [config.transactionConfig]);
    return <PluginProvider plugins={plugins}>{children}</PluginProvider>;
}
