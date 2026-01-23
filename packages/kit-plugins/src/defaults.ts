import {
    ClusterUrl,
    createEmptyClient,
    DefaultRpcSubscriptionsChannelConfig,
    lamports,
    TransactionSigner,
} from '@solana/kit';
import { airdrop, AirdropFunction } from '@solana/kit-plugin-airdrop';
import {
    defaultTransactionPlannerAndExecutorFromLitesvm,
    defaultTransactionPlannerAndExecutorFromRpc,
    sendTransactions,
} from '@solana/kit-plugin-instruction-plan';
import { litesvm } from '@solana/kit-plugin-litesvm';
import { generatedPayerWithSol, payer } from '@solana/kit-plugin-payer';
import { localhostRpc, rpc } from '@solana/kit-plugin-rpc';

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
 * import { createDefaultRpcClient } from '@solana/kit-plugins';
 * import { generateKeyPairSigner } from '@solana/kit';
 *
 * const payer = await generateKeyPairSigner();
 * const client = createDefaultRpcClient({
 *   url: 'https://api.mainnet-beta.solana.com',
 *   payer,
 * });
 *
 * // Use the client
 * const result = await client.sendTransaction([myInstruction]);
 * ```
 */
export function createDefaultRpcClient<TClusterUrl extends ClusterUrl>(config: {
    payer: TransactionSigner;
    rpcSubscriptionsConfig?: DefaultRpcSubscriptionsChannelConfig<TClusterUrl>;
    url: TClusterUrl;
}) {
    return createEmptyClient()
        .use(rpc<TClusterUrl>(config.url, config.rpcSubscriptionsConfig))
        .use(payer(config.payer))
        .use(defaultTransactionPlannerAndExecutorFromRpc())
        .use(sendTransactions());
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
 * import { createDefaultLocalhostRpcClient } from '@solana/kit-plugins';
 *
 * // Creates a client with auto-generated and funded payer
 * const client = await createDefaultLocalhostRpcClient();
 *
 * // Use the client
 * const result = await client.sendTransaction([myInstruction]);
 * console.log('Payer address:', client.payer.address);
 * ```
 *
 * @example
 * Using a custom payer.
 * ```ts
 * import { createDefaultLocalhostRpcClient } from '@solana/kit-plugins';
 * import { generateKeyPairSigner } from '@solana/kit';
 *
 * const customPayer = await generateKeyPairSigner();
 * const client = await createDefaultLocalhostRpcClient({ payer: customPayer });
 * ```
 */
export function createDefaultLocalhostRpcClient(
    config: { payer?: TransactionSigner; rpcSubscriptionsConfig?: { url: string }; url?: string } = {},
) {
    return createEmptyClient()
        .use(localhostRpc(config.url, config.rpcSubscriptionsConfig))
        .use(airdrop())
        .use(payerOrGeneratedPayer(config.payer))
        .use(defaultTransactionPlannerAndExecutorFromRpc())
        .use(sendTransactions());
}

/**
 * Creates a default LiteSVM client for local blockchain simulation.
 *
 * This function sets up a client with an embedded LiteSVM instance for fast
 * local blockchain simulation, airdrop functionality, automatic payer generation
 * (if not provided), and all essential transaction capabilities. Ideal for testing
 * and development without requiring a live network connection.
 *
 * @param config - Optional configuration object with an optional payer.
 * @returns A fully configured client ready for local blockchain simulation.
 *
 * @example
 * ```ts
 * import { createDefaultLiteSVMClient } from '@solana/kit-plugins';
 *
 * // Creates a client with auto-generated and funded payer
 * const client = await createDefaultLiteSVMClient();
 *
 * // Set up accounts and programs
 * client.svm.setAccount(myAccount);
 * client.svm.addProgramFromFile(myProgramAddress, 'program.so');
 *
 * // Use the client
 * const result = await client.sendTransaction([myInstruction]);
 * ```
 *
 * @example
 * Using a custom payer.
 * ```ts
 * import { createDefaultLiteSVMClient } from '@solana/kit-plugins';
 * import { generateKeyPairSigner } from '@solana/kit';
 *
 * const customPayer = await generateKeyPairSigner();
 * const client = await createDefaultLiteSVMClient({ payer: customPayer });
 * ```
 */
export function createDefaultLiteSVMClient(config: { payer?: TransactionSigner } = {}) {
    return createEmptyClient()
        .use(litesvm())
        .use(airdrop())
        .use(payerOrGeneratedPayer(config.payer))
        .use(defaultTransactionPlannerAndExecutorFromLitesvm())
        .use(sendTransactions());
}

/**
 * Helper function that uses the provided payer if any,
 * otherwise generates a new payer and funds it with 100 SOL.
 */
function payerOrGeneratedPayer(explicitPayer: TransactionSigner | undefined) {
    return <T extends { airdrop: AirdropFunction }>(client: T): Promise<T & { payer: TransactionSigner }> => {
        if (explicitPayer) {
            return Promise.resolve(payer(explicitPayer)(client));
        }
        return generatedPayerWithSol(lamports(100_000_000_000n))(client);
    };
}
