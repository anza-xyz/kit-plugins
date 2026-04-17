import {
    walletIdentity,
    walletPayer,
    type WalletPluginConfig,
    walletSigner,
    walletWithoutSigner,
} from '@solana/kit-plugin-wallet';
import { PluginProvider, useChain, useClient } from '@solana/kit-react';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';

/** @internal Threshold for the dev-only prop-churn warning (matches `PluginProvider`). */
const CHURN_WARNING_THRESHOLD = 2;

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
    const parent = useClient();

    // Warn in dev when a wallet plugin is already installed on the client.
    // Common cause: a pre-built client was passed to `KitClientProvider` with
    // `walletSigner()` (or similar) baked in, and then `<WalletProvider>` is
    // also mounted below — the plugin gets installed twice and the two
    // instances compete for the same `client.wallet` namespace. Also triggers
    // for intentional `PluginProvider({ plugin: walletSigner(...) })`
    // stacks that nest `<WalletProvider>` underneath.
    const hasWallet = 'wallet' in parent;
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production' && hasWallet) {
            console.warn(
                '<WalletProvider>: a wallet plugin is already installed on the client (detected `client.wallet`). ' +
                    'Mounting WalletProvider on top of a client that already has a wallet plugin ' +
                    'installs it twice and may produce inconsistent state. Either drop the <WalletProvider>, ' +
                    'or build a KitClientProvider `client` without the baked-in wallet plugin.',
            );
        }
    }, [hasWallet]);

    // Dev-only: warn when `filter` / `storage` / `storageKey` prop identity
    // changes across renders. Any of these churning rebuilds the plugin,
    // which re-creates the wallet store (tearing down discovery + the active
    // connection) on every render. One render's change is noise; sustained
    // churn (common cause: inline `filter={(w) => …}`) is almost always a
    // missing `useMemo` or a function literal that should be hoisted.
    // Matches `PluginProvider`'s pattern so one render of legitimate change
    // doesn't trigger a false positive.
    const previousPropsRef = useRef<{
        filter?: WalletPluginConfig['filter'];
        storage?: WalletPluginConfig['storage'];
        storageKey?: WalletPluginConfig['storageKey'];
    } | null>(null);
    const churnCountRef = useRef(0);
    const warnedRef = useRef(false);
    useEffect(() => {
        if (process.env.NODE_ENV === 'production') return;
        const previous = previousPropsRef.current;
        previousPropsRef.current = { filter, storage, storageKey };
        if (previous === null) return;

        const changed: string[] = [];
        if (previous.filter !== filter) changed.push('filter');
        if (previous.storage !== storage) changed.push('storage');
        if (previous.storageKey !== storageKey) changed.push('storageKey');

        if (changed.length === 0) {
            churnCountRef.current = 0;
            return;
        }

        churnCountRef.current++;
        if (churnCountRef.current >= CHURN_WARNING_THRESHOLD && !warnedRef.current) {
            warnedRef.current = true;
            const label = changed.map(p => `\`${p}\``).join(', ');
            console.warn(
                `<WalletProvider>: prop ${changed.length === 1 ? 'identity for' : 'identities for'} ${label} ` +
                    'is changing across renders. Wrap in useMemo or hoist to module scope — otherwise the ' +
                    'wallet plugin is rebuilt on every render, which re-creates the wallet store and tears ' +
                    'down discovery / the active connection.',
            );
        }
    });

    const plugin = useMemo(() => {
        const config: WalletPluginConfig = { autoConnect, chain, filter, storage, storageKey };
        switch (role) {
            case 'identity':
                return walletIdentity(config);
            case 'none':
                return walletWithoutSigner(config);
            case 'payer':
                return walletPayer(config);
            case 'signer':
                return walletSigner(config);
        }
    }, [role, chain, autoConnect, storage, storageKey, filter]);
    return <PluginProvider plugin={plugin}>{children}</PluginProvider>;
}
