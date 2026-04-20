import type { TransactionSigner } from '@solana/kit';
import { identity, payer } from '@solana/kit-plugin-signer';
import { type ReactNode, useMemo } from 'react';

import { useIdentityChurnWarning } from '../dev-warnings';
import { PluginProvider } from './plugin-provider';

/** Props for {@link PayerProvider}. */
export type PayerProviderProps = {
    children?: ReactNode;
    /** The signer that will pay transaction fees and storage costs. */
    signer: TransactionSigner;
};

/**
 * Sets `client.payer` from an explicit {@link TransactionSigner}.
 *
 * Use when the payer is not the connected wallet — for example, a backend
 * relayer, a locally-generated keypair for tests, or a different wallet than
 * the one acting as identity.
 *
 * @example
 * ```tsx
 * <KitClientProvider chain="solana:mainnet">
 *     <WalletProvider role="identity">
 *         <PayerProvider signer={relayerSigner}>
 *             <RpcProvider url="..." wsUrl="...">
 *                 <App />
 *             </RpcProvider>
 *         </PayerProvider>
 *     </WalletProvider>
 * </KitClientProvider>
 * ```
 *
 * @see {@link IdentityProvider}
 */
export function PayerProvider({ children, signer }: PayerProviderProps) {
    const plugin = useMemo(() => payer(signer), [signer]);
    useIdentityChurnWarning({
        consequence: 'the payer plugin is rebuilt every render, replacing `client.payer` on each render.',
        props: { signer },
        providerName: '<PayerProvider>',
    });
    return <PluginProvider plugin={plugin}>{children}</PluginProvider>;
}

/** Props for {@link IdentityProvider}. */
export type IdentityProviderProps = {
    children?: ReactNode;
    /** The signer representing the app's identity (e.g. program authority). */
    signer: TransactionSigner;
};

/**
 * Sets `client.identity` from an explicit {@link TransactionSigner}.
 *
 * Use when the identity is not the connected wallet — for example, a
 * program-owned signer, a test keypair, or a separate identity from the payer.
 *
 * @see {@link PayerProvider}
 */
export function IdentityProvider({ children, signer }: IdentityProviderProps) {
    const plugin = useMemo(() => identity(signer), [signer]);
    useIdentityChurnWarning({
        consequence: 'the identity plugin is rebuilt every render, replacing `client.identity` on each render.',
        props: { signer },
        providerName: '<IdentityProvider>',
    });
    return <PluginProvider plugin={plugin}>{children}</PluginProvider>;
}
