import type { TransactionSigner } from '@solana/kit';
/**
 * Returns the current fee payer (`client.payer`), or `null` when a
 * wallet-backed payer has no wallet connected.
 *
 * - Wallet-backed (`<WalletProvider role="signer" | "payer">`): reactive —
 *   subscribes via `client.subscribeToPayer` and returns the current wallet
 *   signer, or `null` while disconnected / for read-only wallets.
 * - Static (`<PayerProvider signer={…}>`): returns the provided signer.
 *
 * @throws If no ancestor provider installs `client.payer` (capability error).
 *
 * @example
 * ```tsx
 * const payer = usePayer();
 * if (!payer) return <ConnectButton />;
 * const tx = buildTransaction({ payer });
 * ```
 *
 * @see {@link useIdentity}
 * @see `useConnectedWallet` (from `@solana/kit-react-wallet`) — returns the
 *   wallet signer directly for flows where you want to gate rendering on the
 *   full wallet connection.
 */
export declare function usePayer(): TransactionSigner | null;
/**
 * Returns the current identity (`client.identity`), or `null` when a
 * wallet-backed identity has no wallet connected.
 *
 * - Wallet-backed (`<WalletProvider role="signer" | "identity">`): reactive —
 *   subscribes via `client.subscribeToIdentity` and returns the current
 *   wallet signer, or `null` while disconnected / for read-only wallets.
 * - Static (`<IdentityProvider signer={…}>`): returns the provided signer.
 *
 * @throws If no ancestor provider installs `client.identity` (capability
 *   error).
 *
 * @example
 * ```tsx
 * const identity = useIdentity();
 * if (!identity) return null;
 * const authority = identity.address;
 * ```
 *
 * @see {@link usePayer}
 */
export declare function useIdentity(): TransactionSigner | null;
//# sourceMappingURL=signers.d.ts.map