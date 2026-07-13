import {
    type ClientWithIdentity,
    type ClientWithPayer,
    type ClientWithSubscribeToIdentity,
    type ClientWithSubscribeToPayer,
    extendClient,
    SOLANA_ERROR__WALLET__NO_SIGNER_CONNECTED,
    SOLANA_ERROR__WALLET__SIGNER_NOT_AVAILABLE,
    SolanaError,
    withCleanup,
} from '@solana/kit';

import { createWalletStore } from './store';
import type { ClientWithWallet, WalletPluginConfig } from './types';

// -- Internal helpers ---------------------------------------------------------

function defineSignerGetter(
    additions: Record<string, unknown>,
    property: string,
    store: ReturnType<typeof createWalletStore>,
): void {
    Object.defineProperty(additions, property, {
        configurable: true,
        // Non-enumerable on purpose: this getter throws when no signer is connected, so we
        // don't want things like Object.entries to read it.
        enumerable: false,
        get() {
            const state = store.getState();
            if (!state.connected) {
                throw new SolanaError(SOLANA_ERROR__WALLET__NO_SIGNER_CONNECTED, { status: state.status });
            }
            if (!state.connected.signer) {
                throw new SolanaError(SOLANA_ERROR__WALLET__SIGNER_NOT_AVAILABLE);
            }
            return state.connected.signer;
        },
    });
}

type SignerProperties = 'payer' | 'identity';

// Maps each signer capability to the Kit-convention reactive hook installed
// alongside it (`@solana/plugin-interfaces`). A plugin whose `client.payer` /
// `client.identity` is dynamic installs the matching `subscribeTo*` function
// so reactive consumers can observe changes without naming this plugin.
const SUBSCRIBE_PROPERTY: Record<SignerProperties, 'subscribeToIdentity' | 'subscribeToPayer'> = {
    identity: 'subscribeToIdentity',
    payer: 'subscribeToPayer',
};

function createPlugin<TAdditions extends ClientWithWallet>(
    config: WalletPluginConfig,
    signerProperties: SignerProperties[],
) {
    return <T extends object & { wallet?: never }>(client: T): Disposable & Omit<T, keyof TAdditions> & TAdditions => {
        if ('wallet' in client) {
            throw new Error(
                'Only one wallet plugin can be used per client. ' +
                    'Use walletSigner, walletPayer, walletIdentity, or walletWithoutSigner — not multiple.',
            );
        }

        const store = createWalletStore(config);

        const additions: Record<string, unknown> = { wallet: store };
        for (const prop of signerProperties) {
            defineSignerGetter(additions, prop, store);
            additions[SUBSCRIBE_PROPERTY[prop]] = store.subscribeSigner;
        }

        return withCleanup(extendClient(client, additions), () => store[Symbol.dispose]()) as unknown as Disposable &
            Omit<T, keyof TAdditions> &
            TAdditions;
    };
}

// -- Public API ---------------------------------------------------------------

/**
 * A framework-agnostic Kit plugin that manages wallet discovery, connection
 * lifecycle, and signer creation using wallet-standard — and syncs the
 * connected wallet's signer to both `client.payer` and `client.identity`.
 *
 * This is the most common entrypoint for dApps. When a signing-capable
 * wallet is connected, `client.payer` and `client.identity` both return the
 * wallet signer. When disconnected or read-only, accessing either throws.
 *
 * Because the signer is dynamic, both `client.subscribeToPayer` and
 * `client.subscribeToIdentity` are installed so reactive consumers can observe
 * changes (the Kit reactive-capability convention).
 *
 * **SSR-safe.** Can be included in a shared client chain that runs on both
 * server and browser.
 *
 * ```ts
 * const client = createClient()
 *   .use(walletSigner({ chain: 'solana:mainnet' }))
 *   .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
 *   .use(planAndSendTransactions());
 * ```
 *
 * @param config - Plugin configuration.
 *
 * @see {@link walletPayer}
 * @see {@link walletIdentity}
 * @see {@link walletWithoutSigner}
 * @see {@link WalletPluginConfig}
 */
export function walletSigner(config: WalletPluginConfig) {
    return createPlugin<
        ClientWithIdentity &
            ClientWithPayer &
            ClientWithSubscribeToIdentity &
            ClientWithSubscribeToPayer &
            ClientWithWallet
    >(config, ['payer', 'identity']);
}

/**
 * A framework-agnostic Kit plugin that manages wallet discovery, connection
 * lifecycle, and signer creation using wallet-standard — and syncs the
 * connected wallet's signer to `client.identity`.
 *
 * Use this when `client.payer` is controlled by a separate `payer()` plugin
 * (e.g. a backend relayer pays fees, but the user's wallet is the identity).
 *
 * Because the signer is dynamic, `client.subscribeToIdentity` is installed so
 * reactive consumers can observe changes (the Kit reactive-capability convention).
 *
 * **SSR-safe.** Can be included in a shared client chain that runs on both
 * server and browser.
 *
 * ```ts
 * const client = createClient()
 *   .use(payer(relayerKeypair))
 *   .use(walletIdentity({ chain: 'solana:mainnet' }))
 *   .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
 *   .use(planAndSendTransactions());
 * ```
 *
 * @param config - Plugin configuration.
 *
 * @see {@link walletSigner}
 * @see {@link walletPayer}
 * @see {@link walletWithoutSigner}
 * @see {@link WalletPluginConfig}
 */
export function walletIdentity(config: WalletPluginConfig) {
    return createPlugin<ClientWithIdentity & ClientWithSubscribeToIdentity & ClientWithWallet>(config, ['identity']);
}

/**
 * A framework-agnostic Kit plugin that manages wallet discovery, connection
 * lifecycle, and signer creation using wallet-standard — and syncs the
 * connected wallet's signer to `client.payer`.
 *
 * Use this when you need the wallet as the fee payer but don't need
 * `client.identity`. For most dApps, prefer {@link walletSigner} which
 * sets both.
 *
 * Because the signer is dynamic, `client.subscribeToPayer` is installed so
 * reactive consumers can observe changes (the Kit reactive-capability convention).
 *
 * **SSR-safe.** Can be included in a shared client chain that runs on both
 * server and browser.
 *
 * ```ts
 * const client = createClient()
 *   .use(walletPayer({ chain: 'solana:mainnet' }))
 *   .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
 *   .use(planAndSendTransactions());
 * ```
 *
 * @param config - Plugin configuration.
 *
 * @see {@link walletSigner}
 * @see {@link walletIdentity}
 * @see {@link walletWithoutSigner}
 * @see {@link WalletPluginConfig}
 */
export function walletPayer(config: WalletPluginConfig) {
    return createPlugin<ClientWithPayer & ClientWithSubscribeToPayer & ClientWithWallet>(config, ['payer']);
}

/**
 * A framework-agnostic Kit plugin that manages wallet discovery, connection
 * lifecycle, and signer creation using wallet-standard.
 *
 * Adds the `wallet` namespace to the client without setting `client.payer`
 * or `client.identity`. Use this alongside separate `payer()` and/or
 * `identity()` plugins, or when the wallet's signer is used explicitly in
 * instructions. For most dApps, prefer {@link walletSigner} instead.
 *
 * **SSR-safe.** Can be included in a shared client chain that runs on both
 * server and browser.
 *
 * ```ts
 * const client = createClient()
 *   .use(payer(backendKeypair))
 *   .use(walletWithoutSigner({ chain: 'solana:mainnet' }))
 *   .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
 *   .use(planAndSendTransactions());
 *
 * // client.payer is always backendKeypair
 * // client.wallet.getState().connected?.signer for manual use
 * ```
 *
 * @param config - Plugin configuration.
 *
 * @see {@link walletSigner}
 * @see {@link walletPayer}
 * @see {@link walletIdentity}
 * @see {@link WalletPluginConfig}
 */
export function walletWithoutSigner(config: WalletPluginConfig) {
    return createPlugin<ClientWithWallet>(config, []);
}
