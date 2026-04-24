import type { TransactionSigner } from '@solana/kit';
import { identity, payer, signer } from '@solana/kit-plugin-signer';
import { type ReactNode, useMemo } from 'react';

import { PluginProvider } from './plugin-provider';

/**
 * Props for {@link PayerProvider}.
 */
export type PayerProviderProps = Readonly<{
    children?: ReactNode;
    /** Signer to install as `client.payer`. */
    payer: TransactionSigner;
}>;

/**
 * Installs a static signer as `client.payer` on the subtree.
 *
 * Wraps `kit-plugin-signer`'s `payer()` plugin. Use when the fee-payer is
 * not the connected wallet: a backend relayer, a test keypair, or a CLI
 * script.
 *
 * @param props - The payer signer and subtree.
 * @return A React element that re-publishes the extended client.
 *
 * @example
 * ```tsx
 * <PayerProvider payer={relayerSigner}>
 *     <RpcProvider rpcUrl={url}>{children}</RpcProvider>
 * </PayerProvider>
 * ```
 *
 * @see {@link SignerProvider}
 * @see {@link IdentityProvider}
 */
export function PayerProvider({ children, payer: payerArg }: PayerProviderProps) {
    const plugins = useMemo(() => [payer(payerArg)], [payerArg]);
    return <PluginProvider plugins={plugins}>{children}</PluginProvider>;
}

/**
 * Props for {@link IdentityProvider}.
 */
export type IdentityProviderProps = Readonly<{
    children?: ReactNode;
    /** Signer to install as `client.identity`. */
    identity: TransactionSigner;
}>;

/**
 * Installs a static signer as `client.identity` on the subtree.
 *
 * Wraps `kit-plugin-signer`'s `identity()` plugin.
 *
 * @param props - The identity signer and subtree.
 * @return A React element that re-publishes the extended client.
 *
 * @see {@link SignerProvider}
 * @see {@link PayerProvider}
 */
export function IdentityProvider({ children, identity: identityArg }: IdentityProviderProps) {
    const plugins = useMemo(() => [identity(identityArg)], [identityArg]);
    return <PluginProvider plugins={plugins}>{children}</PluginProvider>;
}

/**
 * Props for {@link SignerProvider}.
 */
export type SignerProviderProps = Readonly<{
    children?: ReactNode;
    /** Signer to install as both `client.payer` and `client.identity`. */
    signer: TransactionSigner;
}>;

/**
 * Installs a static signer as both `client.payer` and `client.identity`.
 *
 * Wraps `kit-plugin-signer`'s `signer()` plugin. Convenience for the
 * common case where one keypair both pays fees and acts as identity.
 *
 * @param props - The signer and subtree.
 * @return A React element that re-publishes the extended client.
 *
 * @example
 * ```tsx
 * <SignerProvider signer={mySigner}>
 *     <RpcProvider rpcUrl={url}>{children}</RpcProvider>
 * </SignerProvider>
 * ```
 *
 * @see {@link PayerProvider}
 * @see {@link IdentityProvider}
 */
export function SignerProvider({ children, signer: signerArg }: SignerProviderProps) {
    const plugins = useMemo(() => [signer(signerArg)], [signerArg]);
    return <PluginProvider plugins={plugins}>{children}</PluginProvider>;
}
