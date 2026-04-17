import { type WalletPluginConfig } from '@solana/kit-plugin-wallet';
import { type ReactNode } from 'react';
/**
 * The role the connected wallet plays on the client.
 *
 * - `"signer"` (default) — wallet signs *and* pays fees (`client.payer` and
 *   `client.identity` both resolve to the wallet signer).
 * - `"payer"` — wallet pays fees only (`client.payer` resolves to the wallet).
 * - `"identity"` — wallet signs but a separate payer covers fees
 *   (`client.identity` resolves to the wallet; add a {@link PayerProvider}).
 * - `"none"` — wallet UI only. Neither `client.payer` nor `client.identity`
 *   is set; manual signer access via {@link useConnectedWallet}.
 */
export type WalletRole = 'identity' | 'none' | 'payer' | 'signer';
/**
 * Props for {@link WalletProvider}.
 *
 * Extends the wallet plugin's config shape (minus `chain`, which is read from
 * the enclosing {@link KitClientProvider}): `autoConnect`, `storage`,
 * `storageKey`, and `filter` are all accepted as props and forwarded to the
 * underlying plugin. Additions: `children` and `role`.
 */
export type WalletProviderProps = Omit<WalletPluginConfig, 'chain'> & {
    /** React children to render inside the provider. */
    children?: ReactNode;
    /**
     * The role the connected wallet plays on the client.
     *
     * @default 'signer'
     */
    role?: WalletRole;
};
/**
 * Installs one of the wallet plugins ({@link walletSigner},
 * {@link walletPayer}, {@link walletIdentity}, {@link walletWithoutSigner})
 * based on the `role` prop.
 *
 * Reads the chain from the enclosing {@link KitClientProvider} via
 * {@link useChain}. The default role of `"signer"` covers the common case
 * where the connected wallet pays for and signs transactions. Use `"payer"` /
 * `"identity"` / `"none"` for advanced setups (relayers, decoupled identity,
 * UI-only wallet management).
 *
 * @throws If no ancestor {@link KitClientProvider} is mounted.
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
 * @example Wallet is identity, relayer pays fees
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
 */
export declare function WalletProvider({ autoConnect, children, filter, role, storage, storageKey, }: WalletProviderProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=wallet-provider.d.ts.map