import type { Client, ClientWithPayer } from '@solana/kit';
import { litesvm } from '@solana/kit-plugin-litesvm';
import { type ReactNode, useMemo } from 'react';

import { ClientContext, useClient } from '../client-context';

/** Props for {@link LiteSvmProvider}. */
export type LiteSvmProviderProps = {
    children?: ReactNode;
};

/**
 * Drop-in replacement for {@link RpcProvider} in test and development
 * environments. Installs the `litesvm()` plugin chain which provides the same
 * client capabilities (`rpc`, transaction planning, `sendTransaction(s)`)
 * backed by a local LiteSVM instance instead of a remote RPC node.
 *
 * Requires `client.payer` to be set by an ancestor provider.
 *
 * @throws If no ancestor provider has set `client.payer`.
 *
 * @example
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
export function LiteSvmProvider({ children }: LiteSvmProviderProps) {
    const parent = useClient();
    if (!('payer' in parent)) {
        throw new Error(
            "LiteSvmProvider requires a payer. Wrap it in a WalletProvider (with role 'signer' or 'payer') or a PayerProvider.",
        );
    }
    const client = useMemo(() => (parent as Client<ClientWithPayer>).use(litesvm()) as Client<object>, [parent]);
    return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}
