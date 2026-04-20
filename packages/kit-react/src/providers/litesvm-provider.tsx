import type { Client } from '@solana/kit';
import { litesvm } from '@solana/kit-plugin-litesvm';
import { type ReactNode, useMemo } from 'react';

import { ClientContext } from '../client-context';
import { useParentWithPayer } from '../internal/parent-assertions';

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
    const parent = useParentWithPayer('LiteSvmProvider');
    const client = useMemo(() => parent.use(litesvm()) as Client<object>, [parent]);
    return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}
