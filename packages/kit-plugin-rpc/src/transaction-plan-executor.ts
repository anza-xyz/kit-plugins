import {
    assertIsTransactionWithBlockhashLifetime,
    ClientWithRpc,
    ClientWithRpcSubscriptions,
    createTransactionPlanExecutor,
    extendClient,
    ExtendedClient,
    GetEpochInfoApi,
    GetLatestBlockhashApi,
    GetSignatureStatusesApi,
    Rpc,
    RpcSubscriptions,
    sendAndConfirmTransactionFactory,
    SendTransactionApi,
    SignatureNotificationsApi,
    signTransactionMessageWithSigners,
    SimulateTransactionApi,
    SlotNotificationsApi,
    TransactionPlanExecutor,
    TransactionPlanExecutorWithTransactions,
} from '@solana/kit';

import {
    limitFunction,
    PrepareTransactionMessageConfig,
    prepareTransactionMessageFactory,
} from './prepare-transaction-message';

/**
 * Configuration for {@link createRpcTransactionSendingExecutor}.
 */
export type RpcTransactionSendingExecutorConfig = PrepareTransactionMessageConfig & {
    /** The maximum number of concurrent executions allowed. Defaults to 10. */
    maxConcurrency?: number;
    /** The RPC used to fetch blockhashes, simulate, and send transactions. */
    rpc: Rpc<
        GetEpochInfoApi & GetLatestBlockhashApi & GetSignatureStatusesApi & SendTransactionApi & SimulateTransactionApi
    >;
    /** The RPC Subscriptions used to confirm transactions. */
    rpcSubscriptions: RpcSubscriptions<SignatureNotificationsApi & SlotNotificationsApi>;
};

/**
 * Creates a transaction plan executor that signs transactions and sends them via RPC.
 *
 * The executor assigns the transaction lifetime, estimates and sets resource limits by
 * simulating, signs, then sends and confirms. A concurrency limit avoids hitting rate
 * limits when sending many transactions in parallel.
 *
 * @param config - Configuration for the executor.
 * @return A transaction plan executor whose results carry their transactions.
 *
 * @example
 * ```ts
 * const transactionSendingExecutor = createRpcTransactionSendingExecutor({
 *     rpc: client.rpc,
 *     rpcSubscriptions: client.rpcSubscriptions,
 * });
 * ```
 *
 * @see {@link createRpcTransactionSigningExecutor}
 */
export function createRpcTransactionSendingExecutor(
    config: RpcTransactionSendingExecutorConfig,
): TransactionPlanExecutorWithTransactions {
    const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({
        rpc: config.rpc,
        rpcSubscriptions: config.rpcSubscriptions,
    });
    const prepareTransactionMessage = prepareTransactionMessageFactory(config.rpc, config);
    const skipPreflight = config.skipPreflight ?? false;

    return createTransactionPlanExecutor({
        executeTransactionMessage: limitFunction(async (context, transactionMessage, executorConfig) => {
            const { didSimulateToEstimate, message } = await prepareTransactionMessage(
                context,
                transactionMessage,
                executorConfig,
            );
            // This is not how the transaction reaches a successful result — Kit's
            // `successfulSingleTransactionPlanResultFromTransaction` builds that context
            // itself from the transaction we return below. What this assignment buys is
            // the failure path: `traverseSingle`'s catch block reads `context.transaction`
            // to recover a signature for a failed leaf when `context.signature` is unset,
            // so a transaction that signs successfully and then fails to broadcast still
            // reports its signature.
            const signedTransaction = (context.transaction = await signTransactionMessageWithSigners(
                message,
                executorConfig,
            ));
            assertIsTransactionWithBlockhashLifetime(signedTransaction);
            await sendAndConfirmTransaction(signedTransaction, {
                commitment: 'confirmed',
                skipPreflight: skipPreflight || didSimulateToEstimate,
                ...executorConfig,
            });
            return signedTransaction;
        }, config.maxConcurrency ?? 10),
    });
}

/**
 * A client carrying the deprecated `transactionPlanExecutor` property.
 */
export type ClientWithDeprecatedTransactionPlanExecutor = {
    /**
     * @deprecated Build executors with {@link createRpcTransactionSendingExecutor} and pass
     * them to `transactionSending` instead of reading them off the client.
     */
    transactionPlanExecutor: TransactionPlanExecutor;
};

/**
 * A plugin that provides a default transaction plan executor using RPC.
 *
 * @deprecated Use {@link createRpcTransactionSendingExecutor} and pass the executor
 * explicitly to `transactionSending`. Now that signing and sending are separate
 * capabilities, naming one executor `transactionPlanExecutor` wrongly implies it is the
 * only one.
 *
 * ```ts
 * // Before: this plugin put the executor on the client, and `planAndSendTransactions`
 * // read it back off.
 * const client = await createClient()
 *     .use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
 *     .use(generatedPayer())
 *     .use(rpcTransactionPlanner())
 *     .use(rpcTransactionPlanExecutor())
 *     .use(planAndSendTransactions());
 *
 * // After: build the executor yourself and hand it to `transactionSending`.
 * const clientWithPlanner = await createClient()
 *     .use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
 *     .use(generatedPayer())
 *     .use(rpcTransactionPlanner());
 *
 * const transactionPlanner = clientWithPlanner.transactionPlanner;
 * const client = clientWithPlanner.use(transactionPlanning({ transactionPlanner })).use(
 *     transactionSending({
 *         transactionPlanner,
 *         transactionSendingExecutor: createRpcTransactionSendingExecutor({
 *             rpc: clientWithPlanner.rpc,
 *             rpcSubscriptions: clientWithPlanner.rpcSubscriptions,
 *         }),
 *     }),
 * );
 * ```
 *
 * If you want the whole bundle rather than the individual pieces, {@link solanaRpc}
 * already composes the planner, both executors and all three capability plugins.
 */
export function rpcTransactionPlanExecutor(
    config: Omit<RpcTransactionSendingExecutorConfig, 'rpc' | 'rpcSubscriptions'> = {},
) {
    return <
        T extends ClientWithRpc<
            GetEpochInfoApi &
                GetLatestBlockhashApi &
                GetSignatureStatusesApi &
                SendTransactionApi &
                SimulateTransactionApi
        > &
            ClientWithRpcSubscriptions<SignatureNotificationsApi & SlotNotificationsApi>,
    >(
        client: T,
    ): ExtendedClient<T, ClientWithDeprecatedTransactionPlanExecutor> => {
        if (!client.rpc || !client.rpcSubscriptions) {
            throw new Error(
                'An RPC instance with subscriptions is required on the client to create the RPC transaction plan executor. ' +
                    'Please add the RPC plugin to your client before using this plugin.',
            );
        }
        return extendClient(client, {
            transactionPlanExecutor: createRpcTransactionSendingExecutor({
                ...config,
                rpc: client.rpc,
                rpcSubscriptions: client.rpcSubscriptions,
            }),
        });
    };
}
