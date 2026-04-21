import {
    walletIdentity,
    walletPayer,
    type WalletPluginConfig,
    walletSigner,
    walletWithoutSigner,
} from '@solana/kit-plugin-wallet';
import { type ReactNode, useMemo } from 'react';

import { useChain } from '../client-context';
import { useIdentityChurnWarning } from '../dev-warnings';
import { PluginProvider } from '../providers/plugin-provider';
import { useParentWithoutWallet } from './internal/parent-assertions';

/**
 * The role the connected wallet plays on the client.
 *
 * - `"signer"` (default) — wallet signs *and* pays fees (`client.payer` and
 *   `client.identity` both resolve to the wallet signer).
 * - `"payer"` — wallet pays fees only (`client.payer` resolves to the wallet).
 * - `"identity"` — wallet signs but a separate payer covers fees
 *   (`client.identity` resolves to the wallet; add a `PayerProvider`).
 * - `"none"` — wallet UI only. Neither `client.payer` nor `client.identity`
 *   is set; manual signer access via {@link useConnectedWallet}.
 */
export type WalletRole = 'identity' | 'none' | 'payer' | 'signer';

/**
 * Props for {@link WalletProvider}.
 *
 * Extends the wallet plugin's config shape (minus `chain`, which is read from
 * the enclosing `KitClientProvider`): `autoConnect`, `storage`, `storageKey`,
 * and `filter` are all accepted as props and forwarded to the underlying
 * plugin. Additions: `children` and `role`.
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
 * Reads the chain from the enclosing `KitClientProvider` via `useChain`. The
 * default role of `"signer"` covers the common case where the connected
 * wallet pays for and signs transactions. Use `"payer"` / `"identity"` /
 * `"none"` for advanced setups (relayers, decoupled identity, UI-only wallet
 * management).
 *
 * **Prop identity matters.** `filter`, `storage`, and `storageKey` are part
 * of the plugin config — a new identity on any of them rebuilds the plugin,
 * which re-creates the wallet store and tears down discovery / the active
 * connection. Keep `filter` stable by memoizing it (`useMemo`) or hoisting
 * it to module scope. A dev-mode warning flags sustained churn.
 *
 * @throws If no ancestor `KitClientProvider` is mounted.
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
 * @example Stable `filter` (hoisted to module scope)
 * ```tsx
 * import type { UiWallet } from '@wallet-standard/ui';
 *
 * // Module scope — stable identity across renders.
 * const requireSignAndSend = (w: UiWallet) =>
 *     w.features.includes('solana:signAndSendTransaction');
 *
 * function App() {
 *     return (
 *         <KitClientProvider chain="solana:mainnet">
 *             <WalletProvider filter={requireSignAndSend}>
 *                 <App />
 *             </WalletProvider>
 *         </KitClientProvider>
 *     );
 * }
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
export function WalletProvider({
    autoConnect,
    children,
    filter,
    role = 'signer',
    storage,
    storageKey,
}: WalletProviderProps) {
    const chain = useChain();
    // Refuse to double-install. Common cause: a pre-built client passed to
    // `KitClientProvider` already has `walletSigner()` (or similar) baked in,
    // and then `<WalletProvider>` is also mounted below — two plugin
    // instances would compete for the same `client.wallet` namespace (two
    // discovery listeners, two storage reads, inconsistent state). Also
    // catches `<PluginProvider plugins={[walletSigner(...)]}>` stacks with
    // `<WalletProvider>` nested underneath. Throwing (vs short-circuiting)
    // keeps React's normal "inner provider shadows outer" mental model — a
    // silent skip would ignore the inner's `storageKey` / `filter` / `storage`
    // without warning.
    useParentWithoutWallet();

    // Dev-only: warn when `filter` / `storage` / `storageKey` prop identity
    // changes across renders. Any of these churning rebuilds the plugin,
    // which re-creates the wallet store (tearing down discovery + the active
    // connection) on every render. One render's change is noise; sustained
    // churn (common cause: inline `filter={(w) => …}`) is almost always a
    // missing `useMemo` or a function literal that should be hoisted.
    useIdentityChurnWarning({
        consequence:
            'the wallet plugin is rebuilt on every render, which re-creates the wallet store and tears down discovery / the active connection.',
        props: { filter, storage, storageKey },
        providerName: '<WalletProvider>',
    });

    // Deps list the five individual props that feed `config` rather than
    // `config` itself — `config` is constructed fresh inside the memo body on
    // every render, so including it would defeat the memoization. Keep the
    // deps array in sync with the `WalletPluginConfig` fields above.
    const plugins = useMemo(() => {
        const config: WalletPluginConfig = { autoConnect, chain, filter, storage, storageKey };
        switch (role) {
            case 'identity':
                return [walletIdentity(config)];
            case 'none':
                return [walletWithoutSigner(config)];
            case 'payer':
                return [walletPayer(config)];
            case 'signer':
                return [walletSigner(config)];
        }
    }, [role, chain, autoConnect, storage, storageKey, filter]);
    return <PluginProvider plugins={plugins}>{children}</PluginProvider>;
}
