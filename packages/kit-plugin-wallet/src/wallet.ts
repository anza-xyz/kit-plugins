import { type ClientWithPayer, extendClient, withCleanup } from '@solana/kit';

import { createWalletStore } from './store';
import type { ClientWithWallet, WalletPluginConfig } from './types';

/**
 * A framework-agnostic Kit plugin that manages wallet discovery, connection
 * lifecycle, and signer creation using wallet-standard.
 *
 * Adds the `wallet` namespace to the client without touching `client.payer`.
 * Use this alongside the `payer()` plugin for backend signers, or when the
 * wallet's signer is used explicitly in instructions rather than as the
 * default payer. To set `client.payer` dynamically from the connected wallet,
 * use {@link walletAsPayer} instead.
 *
 * **SSR-safe.** Can be included in a shared client chain that runs on both
 * server and browser. On the server, status stays `'pending'`, actions throw
 * `SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED)`, and no registry listeners or storage reads
 * are made.
 *
 * ```ts
 * const client = createEmptyClient()
 *   .use(rpc('https://api.mainnet-beta.solana.com'))
 *   .use(payer(backendKeypair))
 *   .use(wallet({ chain: 'solana:mainnet' }))
 *   .use(planAndSendTransactions());
 *
 * // client.payer is always backendKeypair (wallet plugin does not touch it)
 * // client.wallet.getState().connected?.signer for manual use
 * ```
 *
 * @param config - Plugin configuration.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { rpc } from '@solana/kit-plugin-rpc';
 * import { wallet } from '@solana/kit-plugin-wallet';
 *
 * const client = createEmptyClient()
 *   .use(rpc('https://api.mainnet-beta.solana.com'))
 *   .use(wallet({ chain: 'solana:mainnet' }));
 *
 * // Connect a wallet
 * await client.wallet.connect(uiWallet);
 *
 * // Subscribe to state changes (React)
 * const state = useSyncExternalStore(client.wallet.subscribe, client.wallet.getState);
 * ```
 *
 * @see {@link walletAsPayer}
 * @see {@link WalletPluginConfig}
 * @see {@link ClientWithWallet}
 */
export function wallet(config: WalletPluginConfig) {
    return <T extends object>(client: T): ClientWithWallet & Disposable & Omit<T, 'wallet'> => {
        const store = createWalletStore(config);

        return withCleanup(
            extendClient(client, {
                wallet: store,
            }),
            () => store[Symbol.dispose](),
        ) as ClientWithWallet & Disposable & Omit<T, 'wallet'>;
    };
}

/**
 * A framework-agnostic Kit plugin that manages wallet discovery, connection
 * lifecycle, and signer creation using wallet-standard — and syncs the
 * connected wallet's signer to `client.payer` via a dynamic getter.
 *
 * When a signing-capable wallet is connected, `client.payer` returns the
 * wallet signer. When disconnected or when the wallet is read-only,
 * `client.payer` is `undefined`. Use the base {@link wallet} plugin instead
 * if you need `client.payer` to be controlled by a separate `payer()` plugin.
 *
 * **SSR-safe.** Can be included in a shared client chain that runs on both
 * server and browser. On the server, status stays `'pending'`, `client.payer`
 * is `undefined`, and no registry listeners or storage reads are made.
 *
 * ```ts
 * const client = createEmptyClient()
 *   .use(rpc('https://api.mainnet-beta.solana.com'))
 *   .use(walletAsPayer({ chain: 'solana:mainnet' }))
 *   .use(planAndSendTransactions());
 *
 * // Server: status === 'pending', client.payer === undefined
 * // Browser: auto-connect fires, client.payer becomes the wallet signer
 * ```
 *
 * @param config - Plugin configuration.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { rpc } from '@solana/kit-plugin-rpc';
 * import { walletAsPayer } from '@solana/kit-plugin-wallet';
 *
 * const client = createEmptyClient()
 *   .use(rpc('https://api.mainnet-beta.solana.com'))
 *   .use(walletAsPayer({ chain: 'solana:mainnet' }));
 *
 * // Connect a wallet
 * await client.wallet.connect(uiWallet);
 * // client.payer now returns the wallet signer
 * ```
 *
 * @see {@link wallet}
 * @see {@link WalletPluginConfig}
 * @see {@link ClientWithWallet & ClientWithPayer}
 */
export function walletAsPayer(config: WalletPluginConfig) {
    return <T extends object>(client: T): ClientWithWallet & ClientWithPayer & Disposable & Omit<T, 'payer' | 'wallet'> => {
        const store = createWalletStore(config);

        // Build an additions object with a dynamic payer getter. The getter
        // must be part of the additions passed to extendClient (not defined
        // after the fact) because extendClient freezes the result.
        const additions = {
            wallet: store,
        };

        Object.defineProperty(additions, 'payer', {
            configurable: true,
            enumerable: true,
            get() {
                // map null signer -> undefined payer, to match `client.payer` type
                return store.getState().connected?.signer ?? undefined;
            },
        });

        return withCleanup(extendClient(client, additions), () =>
            store[Symbol.dispose](),
        ) as unknown as ClientWithWallet & ClientWithPayer & Disposable & Omit<T, 'payer' | 'wallet'>;
    };
}
