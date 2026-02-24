import { ClusterUrl, createEmptyClient, DefaultRpcSubscriptionsChannelConfig, TransactionSigner } from '@solana/kit';
import { airdrop } from '@solana/kit-plugin-airdrop';
import { planAndSendTransactions } from '@solana/kit-plugin-instruction-plan';
import { payer, payerOrGeneratedPayer } from '@solana/kit-plugin-payer';
import { localhostRpc, rpc, rpcTransactionPlanExecutor, rpcTransactionPlanner } from '@solana/kit-plugin-rpc';

/**
 * Creates a default RPC client with all essential plugins configured.
 *
 * This function sets up a client with RPC capabilities, payer configuration,
 * transaction planning and execution, and instruction plan sending functionality.
 * It's designed for production use with real Solana clusters.
 *
 * @param config - Configuration object containing the payer, URL, and optional RPC subscriptions config.
 * @returns A fully configured default client ready for transaction operations.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit-client-rpc';
 * import { generateKeyPairSigner } from '@solana/kit';
 *
 * const payer = await generateKeyPairSigner();
 * const client = createClient({
 *   url: 'https://api.mainnet-beta.solana.com',
 *   payer,
 * });
 *
 * // Use the client
 * const result = await client.sendTransaction([myInstruction]);
 * ```
 */
export function createClient<TClusterUrl extends ClusterUrl>(config: {
    payer: TransactionSigner;
    rpcSubscriptionsConfig?: DefaultRpcSubscriptionsChannelConfig<TClusterUrl>;
    url: TClusterUrl;
}) {
    return createEmptyClient()
        .use(rpc<TClusterUrl>(config.url, config.rpcSubscriptionsConfig))
        .use(payer(config.payer))
        .use(rpcTransactionPlanner())
        .use(rpcTransactionPlanExecutor())
        .use(planAndSendTransactions());
}

/**
 * Creates a default RPC client configured for localhost development.
 *
 * This function sets up a client connected to a local validator with airdrop
 * functionality, automatic payer generation (if not provided), and all essential
 * transaction capabilities. Perfect for local development and testing.
 *
 * @param config - Optional configuration object with an optional payer.
 * @returns A fully configured client ready for localhost development.
 *
 * @example
 * ```ts
 * import { createLocalClient } from '@solana/kit-client-rpc';
 *
 * // Creates a client with auto-generated and funded payer
 * const client = await createLocalClient();
 *
 * // Use the client
 * const result = await client.sendTransaction([myInstruction]);
 * console.log('Payer address:', client.payer.address);
 * ```
 *
 * @example
 * Using a custom payer.
 * ```ts
 * import { createLocalClient } from '@solana/kit-client-rpc';
 * import { generateKeyPairSigner } from '@solana/kit';
 *
 * const customPayer = await generateKeyPairSigner();
 * const client = await createLocalClient({ payer: customPayer });
 * ```
 */
export function createLocalClient(
    config: { payer?: TransactionSigner; rpcSubscriptionsConfig?: { url: string }; url?: string } = {},
) {
    return createEmptyClient()
        .use(localhostRpc(config.url, config.rpcSubscriptionsConfig))
        .use(airdrop())
        .use(payerOrGeneratedPayer(config.payer))
        .use(rpcTransactionPlanner())
        .use(rpcTransactionPlanExecutor())
        .use(planAndSendTransactions());
}
