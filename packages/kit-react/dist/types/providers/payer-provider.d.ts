import type { TransactionSigner } from '@solana/kit';
import { type ReactNode } from 'react';
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
export declare function PayerProvider({ children, signer }: PayerProviderProps): import("react/jsx-runtime").JSX.Element;
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
export declare function IdentityProvider({ children, signer }: IdentityProviderProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=payer-provider.d.ts.map