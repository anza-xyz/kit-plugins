import {
    appendTransactionMessageInstruction,
    assertIsTransactionWithBlockhashLifetime,
    createTransactionMessage,
    createTransactionPlanExecutor,
    createTransactionPlanner,
    GetEpochInfoApi,
    GetLatestBlockhashApi,
    GetSignatureStatusesApi,
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
    TransactionPlanExecutorConfig,
    TransactionSigner,
    unwrapSimulationError,
} from '@solana/kit';
import {
    estimateAndUpdateProvisoryComputeUnitLimitFactory,
    estimateComputeUnitLimitFactory,
    fillProvisorySetComputeUnitLimitInstruction,
    getSetComputeUnitPriceInstruction,
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
        const estimateAndSetCULimit = estimateAndUpdateProvisoryComputeUnitLimitFactory(
            // We multiply the simulated limit by 1.1 to add a 10% buffer.
            async (...args) => Math.ceil((await estimateCULimit(...args)) * 1.1),
        );

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
            executeTransactionMessage: limitFunction(async (context, transactionMessage, config) => {
                try {
                    const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send(config);
                    const signedTransaction = await pipe(
                        transactionMessage,
                        tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
                        tx => (context.message = tx),
                        async tx => await estimateAndSetCULimit(tx, config),
                        async tx => (context.message = await tx),
                        async tx => await signTransactionMessageWithSigners(await tx, config),
                    );

                    context.transaction = signedTransaction;
                    assertIsTransactionWithBlockhashLifetime(signedTransaction);
                    await sendAndConfirmTransaction(signedTransaction, {
                        commitment: 'confirmed',
                        skipPreflight: true,
                        ...config,
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
