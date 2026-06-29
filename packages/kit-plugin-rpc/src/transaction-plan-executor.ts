import {
    assertIsTransactionWithBlockhashLifetime,
    ClientWithRpc,
    ClientWithRpcSubscriptions,
    createTransactionPlanExecutor,
    estimateAndSetResourceLimitsFactory,
    estimateResourceLimitsFactory,
    extendClient,
    GetEpochInfoApi,
    GetLatestBlockhashApi,
    GetSignatureStatusesApi,
    isSolanaError,
    pipe,
    ResourceLimitsEstimate,
    sendAndConfirmTransactionFactory,
    SendTransactionApi,
    setTransactionMessageLifetimeUsingBlockhash,
    SignatureNotificationsApi,
    signTransactionMessageWithSigners,
    SimulateTransactionApi,
    SlotNotificationsApi,
    SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_RESOURCE_LIMITS,
    TransactionPlanExecutorConfig,
} from '@solana/kit';

import { type ResourceLimitEstimationMode, shouldEstimateResourceLimits } from './resource-limit-estimation';

/**
 * A plugin that provides a default transaction plan executor using RPC.
 *
 * The executor handles resource limit estimation (compute units and, for
 * version 1 transactions, the loaded accounts data size), transaction signing,
 * and sending via RPC. A concurrency limit can be set to avoid hitting rate
 * limits when sending many transactions in parallel.
 *
 * @param config - Optional configuration for the executor.
 * @returns A plugin that adds `transactionPlanExecutor` to the client.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { solanaRpcConnection, rpcTransactionPlanner, rpcTransactionPlanExecutor } from '@solana/kit-plugin-rpc';
 * import { generatedPayer } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient()
 *     .use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
 *     .use(generatedPayer())
 *     .use(rpcTransactionPlanner())
 *     .use(rpcTransactionPlanExecutor());
 * ```
 */
export function rpcTransactionPlanExecutor(
    config: {
        /**
         * The maximum number of concurrent executions allowed.
         * Defaults to 10.
         */
        maxConcurrency?: number;
        /**
         * Whether to skip the preflight simulation when sending transactions.
         *
         * When `false` (default), preflight is skipped only if a resource limit
         * estimation simulation was already performed for that transaction.
         * If every applicable resource limit is already explicitly set (i.e. no
         * estimation was needed), preflight runs as the only simulation.
         *
         * When `true`, preflight is always skipped and the transaction is sent
         * directly to the validator. Additionally, if the resource limit estimation
         * simulation fails, the consumed resources from the failed simulation are
         * used to set the limits so the transaction still reaches the validator.
         * This is useful for debugging failed transactions in an explorer.
         *
         * Defaults to `false`.
         */
        skipPreflight?: boolean;
        /**
         * Whether to estimate and set missing resource limits before sending.
         * Set to `none` for transactions where injecting a compute-budget
         * instruction can push the message over the size limit.
         *
         * Defaults to `estimate`.
         */
        resourceLimitEstimation?: ResourceLimitEstimationMode;
    } = {},
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
    ) => {
        if (!client.rpc || !client.rpcSubscriptions) {
            throw new Error(
                'An RPC instance with subscriptions is required on the client to create the RPC transaction plan executor. ' +
                    'Please add the RPC plugin to your client before using this plugin.',
            );
        }

        const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({
            rpc: client.rpc,
            rpcSubscriptions: client.rpcSubscriptions,
        });
        const estimateResourceLimits = estimateResourceLimitsFactory({ rpc: client.rpc });
        const skipPreflight = config.skipPreflight ?? false;
        const shouldEstimateResources = shouldEstimateResourceLimits(config.resourceLimitEstimation);

        const transactionPlanExecutor = createTransactionPlanExecutor({
            executeTransactionMessage: limitFunction(async (context, transactionMessage, executorConfig) => {
                const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send(executorConfig);

                // `estimateAndSetResourceLimits` only invokes our estimator when a
                // resource limit actually needs estimating, so this flag tells us
                // whether an estimation simulation was performed. When it was, we
                // skip the redundant preflight simulation while sending.
                let didSimulateToEstimate = false;
                const estimateAndSetResourceLimits = estimateAndSetResourceLimitsFactory(
                    bufferAndRecoverResourceLimits(estimateResourceLimits, skipPreflight, () => {
                        didSimulateToEstimate = true;
                    }),
                );

                const signedTransaction = await pipe(
                    transactionMessage,
                    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
                    tx => (context.message = tx),
                    async tx => (shouldEstimateResources ? await estimateAndSetResourceLimits(tx, executorConfig) : tx),
                    async tx => (context.message = await tx),
                    async tx => await signTransactionMessageWithSigners(await tx, executorConfig),
                    async tx => (context.transaction = await tx),
                );
                assertIsTransactionWithBlockhashLifetime(signedTransaction);
                await sendAndConfirmTransaction(signedTransaction, {
                    commitment: 'confirmed',
                    skipPreflight: skipPreflight || didSimulateToEstimate,
                    ...executorConfig,
                });
                return signedTransaction;
            }, config.maxConcurrency ?? 10),
        } satisfies TransactionPlanExecutorConfig);

        return extendClient(client, { transactionPlanExecutor });
    };
}

/**
 * Wraps a resource limit estimator to add a 10% compute unit buffer and,
 * optionally, recover from failed estimation simulations.
 *
 * The returned estimator is intended to be passed to
 * {@link estimateAndSetResourceLimitsFactory}, which only calls it when a
 * resource limit actually needs estimating. The `onSimulate` callback is
 * therefore invoked exactly once an estimation simulation has been performed
 * and we are proceeding to send (i.e. not on a non-recoverable failure).
 *
 * A 10% buffer is applied to the compute unit limit only, to account for
 * variations between simulation and execution.
 *
 * When `skipPreflight` is `true` and the estimation simulation fails, the
 * consumed resources from the failed simulation are used so the transaction
 * can still reach the validator for debugging purposes.
 *
 * @param estimateResourceLimits - The underlying estimator, typically created by
 *   {@link estimateResourceLimitsFactory}.
 * @param skipPreflight - Whether to recover from failed simulations using consumed resources.
 * @param onSimulate - Called once a simulation has been performed and an estimate produced.
 * @returns An estimator that applies a compute unit buffer and recovery behaviour.
 */
function bufferAndRecoverResourceLimits(
    estimateResourceLimits: ReturnType<typeof estimateResourceLimitsFactory>,
    skipPreflight: boolean,
    onSimulate: () => void,
): ReturnType<typeof estimateResourceLimitsFactory> {
    return async (transactionMessage, config) => {
        let estimate: ResourceLimitsEstimate<typeof transactionMessage>;
        try {
            estimate = await estimateResourceLimits(transactionMessage, config);
        } catch (error) {
            if (
                skipPreflight &&
                isSolanaError(error, SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_RESOURCE_LIMITS)
            ) {
                // Use the consumed resources from the failed simulation so the
                // transaction can still reach the validator for debugging.
                // The unitsConsumed field is a raw bigint from the RPC response,
                // so we downcast it to a u32 number, capping at 4_294_967_295.
                const bigintUnits = error.context.unitsConsumed ?? 0n;
                const computeUnitLimit = bigintUnits > 4_294_967_295n ? 4_294_967_295 : Number(bigintUnits);
                estimate = (
                    error.context.loadedAccountsDataSize == null
                        ? { computeUnitLimit }
                        : { computeUnitLimit, loadedAccountsDataSizeLimit: error.context.loadedAccountsDataSize }
                ) as ResourceLimitsEstimate<typeof transactionMessage>;
            } else {
                throw error;
            }
        }

        // Reaching this point means a simulation was performed (either it
        // succeeded, or it failed and we recovered from it) and we are
        // proceeding to send, so signal it. A non-recoverable failure throws
        // above and never gets here.
        onSimulate();

        // Multiply the estimated compute unit limit by 1.1 to add a 10% buffer.
        return {
            ...estimate,
            computeUnitLimit: Math.ceil(estimate.computeUnitLimit * 1.1),
        } as ResourceLimitsEstimate<typeof transactionMessage>;
    };
}

/**
 * Limits the number of concurrent executions of an asynchronous function.
 *
 * This utility creates a wrapper around an async function that enforces
 * a maximum concurrency limit. When the limit is reached, additional
 * calls are queued and executed when capacity becomes available.
 *
 * @param fn - The asynchronous function to be limited.
 * @param maxConcurrency - The maximum number of concurrent executions allowed.
 * @returns A new function that enforces the concurrency limit.
 *
 * @example
 * ```ts
 * const limitedFetchData = limitFunction(fetchData, 2);
 *
 * // Only 2 fetchData calls will run concurrently.
 * const results = await Promise.all([
 *   limitedFetchData('url1'),
 *   limitedFetchData('url2'),
 *   limitedFetchData('url1'), // This will wait until one of the previous calls completes.
 * ]);
 * ```
 */
function limitFunction<TArguments extends unknown[], TReturnType>(
    fn: (...args: TArguments) => PromiseLike<TReturnType>,
    maxConcurrency: number,
): (...args: TArguments) => Promise<TReturnType> {
    let running = 0;
    const queue: Array<{
        args: TArguments;
        reject: (reason?: unknown) => void;
        resolve: (value: TReturnType) => void;
    }> = [];

    function process() {
        // Do nothing if we're still running at max concurrency
        // or if there's nothing left to process.
        if (running >= maxConcurrency || queue.length === 0) return;

        running++;
        const { args, resolve, reject } = queue.shift()!;

        Promise.resolve(fn(...args))
            .then(resolve)
            .catch(reject)
            .finally(() => {
                running--;
                process();
            });
    }

    return function (...args) {
        return new Promise((resolve, reject) => {
            queue.push({ args, reject, resolve });
            process();
        });
    };
}
