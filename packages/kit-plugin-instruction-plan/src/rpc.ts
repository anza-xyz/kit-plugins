import {
    appendTransactionMessageInstruction,
    assertIsTransactionWithBlockhashLifetime,
    createTransactionMessage,
    createTransactionPlanExecutor,
    createTransactionPlanner,
    GetEpochInfoApi,
    GetLatestBlockhashApi,
    GetSignatureStatusesApi,
    isSolanaError,
    MicroLamports,
    pipe,
    Rpc,
    RpcSubscriptions,
    sendAndConfirmTransactionFactory,
    SendTransactionApi,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    SignatureNotificationsApi,
    signTransactionMessageWithSigners,
    SimulateTransactionApi,
    SlotNotificationsApi,
    SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_COMPUTE_LIMIT,
    TransactionPlanExecutorConfig,
    TransactionSigner,
    unwrapSimulationError,
} from '@solana/kit';
import {
    estimateComputeUnitLimitFactory,
    fillProvisorySetComputeUnitLimitInstruction,
    findSetComputeUnitLimitInstructionIndexAndUnits,
    getSetComputeUnitPriceInstruction,
    MAX_COMPUTE_UNIT_LIMIT,
    PROVISORY_COMPUTE_UNIT_LIMIT,
    updateOrAppendSetComputeUnitLimitInstruction,
} from '@solana-program/compute-budget';

/**
 * A plugin that provides a default transactionPlanner and transactionPlanExecutor
 * using existing RPC and RPC Subscriptions instances on the client.
 *
 * It requires a payer to be provided either in the config or set on the client.
 *
 * A concurrency limit can also be set to limit the number of concurrent
 * executions of the transaction plan executor. This can be useful to avoid
 * hitting rate limits on the RPC provider when sending many transactions in parallel.
 *
 * @param config - Optional configuration for the planner and executor.
 * @returns A plugin that adds `transactionPlanner` and `transactionPlanExecutor` to the client.
 *
 * @example
 * ```ts
 * import { createEmptyClient, createTransactionPlanner } from '@solana/kit';
 * import { transactionPlanner } from '@solana/kit-plugins';
 *
 * // Install the RPC instruction plan plugin and its requirements.
 * const client = await createEmptyClient()
 *     .use(rpc("https://api.mainnet-beta.solana.com"));
 *     .use(generatedPayer());
 *     .use(defaultTransactionPlannerAndExecutorFromRpc());
 *
 * // Use the transaction planner and executor.
 * const transactionPlan = await client.transactionPlanner(myInstructionPlan);
 * const transactionPlanResult = await client.transactionPlanExecutor(myTransactionPlan);
 * ```
 */
export function defaultTransactionPlannerAndExecutorFromRpc(
    config: {
        /**
         * The maximum number of concurrent executions allowed.
         * Defaults to 10.
         */
        maxConcurrency?: number;
        /**
         * The transaction signer who will pay for the transaction fees.
         * Defaults to the client's payer or throws if not present.
         */
        payer?: TransactionSigner;
        /**
         * The priority fees to be set on the transaction in micro lamports per compute unit.
         * Defaults to using no priority fees.
         */
        priorityFees?: MicroLamports;
        /**
         * Whether to skip the preflight simulation when sending transactions.
         *
         * When `false` (default), preflight is skipped only if a compute unit
         * estimation simulation was already performed for that transaction.
         * If the transaction has an explicit compute unit limit (i.e. no
         * estimation was needed), preflight runs as the only simulation.
         *
         * When `true`, preflight is always skipped and the transaction is sent
         * directly to the validator. Additionally, if the compute unit estimation
         * simulation fails, the consumed units from the failed simulation are used
         * to set the compute unit limit so the transaction still reaches the
         * validator. This is useful for debugging failed transactions in an explorer.
         *
         * Defaults to `false`.
         */
        skipPreflight?: boolean;
    } = {},
) {
    return <
        T extends {
            payer?: TransactionSigner;
            rpc: Rpc<
                GetEpochInfoApi &
                    GetLatestBlockhashApi &
                    GetSignatureStatusesApi &
                    SendTransactionApi &
                    SimulateTransactionApi
            >;
            rpcSubscriptions: RpcSubscriptions<SignatureNotificationsApi & SlotNotificationsApi>;
        },
    >(
        client: T,
    ) => {
        if (!client.rpc || !client.rpcSubscriptions) {
            throw new Error(
                'A RPC instance with subscriptions is required on the client to create a default transaction planner and executor. ' +
                    'Please add the RPC plugin to your client before using this plugin.',
            );
        }

        const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({
            rpc: client.rpc,
            rpcSubscriptions: client.rpcSubscriptions,
        });
        const estimateCULimit = estimateComputeUnitLimitFactory({ rpc: client.rpc });

        const payer = config.payer ?? client.payer;
        if (!payer) {
            throw new Error(
                'A payer is required to create the default transaction planner and executor. ' +
                    'Please provide one in the config of this plugin or on the client under `payer`.',
            );
        }

        const transactionPlanner = createTransactionPlanner({
            createTransactionMessage: () => {
                return pipe(
                    createTransactionMessage({ version: 0 }),
                    tx => setTransactionMessageFeePayerSigner(payer, tx),
                    tx => fillProvisorySetComputeUnitLimitInstruction(tx),
                    tx =>
                        config.priorityFees
                            ? appendTransactionMessageInstruction(
                                  getSetComputeUnitPriceInstruction({ microLamports: config.priorityFees }),
                                  tx,
                              )
                            : tx,
                );
            },
        });

        const transactionPlanExecutor = createTransactionPlanExecutor({
            executeTransactionMessage: limitFunction(async (context, transactionMessage, executorConfig) => {
                try {
                    const needsCuEstimation = needsComputeUnitEstimation(transactionMessage);
                    const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send(executorConfig);
                    const signedTransaction = await pipe(
                        setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, transactionMessage),
                        tx => (context.message = tx),
                        async tx =>
                            needsCuEstimation
                                ? await estimateAndSetComputeUnitLimit(
                                      tx,
                                      estimateCULimit,
                                      config.skipPreflight ?? false,
                                      executorConfig,
                                  )
                                : tx,
                        async tx => (context.message = await tx),
                        async tx => await signTransactionMessageWithSigners(await tx, executorConfig),
                        async tx => (context.transaction = await tx),
                    );
                    assertIsTransactionWithBlockhashLifetime(signedTransaction);
                    await sendAndConfirmTransaction(signedTransaction, {
                        commitment: 'confirmed',
                        skipPreflight: config.skipPreflight || needsCuEstimation,
                        ...executorConfig,
                    });
                    return signedTransaction;
                } catch (error) {
                    throw unwrapSimulationError(error);
                }
            }, config.maxConcurrency ?? 10),
        } as TransactionPlanExecutorConfig);

        return { ...client, transactionPlanExecutor, transactionPlanner };
    };
}

/**
 * Checks whether a transaction message needs compute unit estimation.
 *
 * Estimation is needed when the transaction has no `SetComputeUnitLimit`
 * instruction, or when it has a provisory (`0`) or maximum (`1,400,000`)
 * compute unit limit.
 *
 * @param transactionMessage - The transaction message to check.
 * @returns `true` if the transaction needs compute unit estimation, `false` otherwise.
 */
function needsComputeUnitEstimation(
    transactionMessage: Parameters<typeof findSetComputeUnitLimitInstructionIndexAndUnits>[0],
): boolean {
    const details = findSetComputeUnitLimitInstructionIndexAndUnits(transactionMessage);
    return !details || details.units === PROVISORY_COMPUTE_UNIT_LIMIT || details.units === MAX_COMPUTE_UNIT_LIMIT;
}

/**
 * Estimates the compute unit limit for a transaction message via simulation
 * and sets the result on the message with a 10% buffer.
 *
 * When `skipPreflight` is `true` and the estimation simulation fails, the consumed
 * units from the failed simulation are used so the transaction can still reach the
 * validator for debugging purposes.
 *
 * @param transactionMessage - The transaction message to estimate and set the compute unit limit on.
 * @param estimateCULimit - A function that estimates the compute unit limit via simulation.
 * @param skipPreflight - Whether to recover from failed simulations using consumed units.
 * @param config - Optional configuration forwarded to the estimator (e.g. abort signal).
 * @returns The updated transaction message with the estimated compute unit limit.
 */
async function estimateAndSetComputeUnitLimit<
    TMessage extends Parameters<typeof updateOrAppendSetComputeUnitLimitInstruction>[1],
>(
    transactionMessage: TMessage,
    estimateCULimit: (tx: TMessage, config?: { abortSignal?: AbortSignal }) => Promise<number>,
    skipPreflight: boolean,
    config?: { abortSignal?: AbortSignal },
) {
    let estimatedUnits;
    try {
        estimatedUnits = await estimateCULimit(transactionMessage, config);
    } catch (error) {
        if (
            skipPreflight &&
            isSolanaError(error, SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_COMPUTE_LIMIT)
        ) {
            // Use consumed units from the failed simulation so the
            // transaction can still reach the validator for debugging.
            estimatedUnits = error.context.unitsConsumed;
        } else {
            throw error;
        }
    }

    // Multiply the simulated limit by 1.1 to add a 10% buffer.
    const units = Math.ceil(estimatedUnits * 1.1);
    return updateOrAppendSetComputeUnitLimitInstruction(units, transactionMessage);
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
