import {
    BaseTransactionPlanResultContext,
    estimateAndSetResourceLimitsFactory,
    estimateResourceLimitsFactory,
    GetLatestBlockhashApi,
    isSolanaError,
    pipe,
    ResourceLimitsEstimate,
    Rpc,
    setTransactionMessageLifetimeUsingBlockhash,
    SimulateTransactionApi,
    SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_RESOURCE_LIMITS,
    TransactionMessage,
    TransactionMessageWithFeePayer,
} from '@solana/kit';

/**
 * The minimum compute unit buffer added on top of the estimate by
 * {@link getDefaultComputeUnitLimitFromEstimate}.
 *
 * This value (300) reserves headroom that covers, at minimum, the two Compute
 * Budget instructions the executor prepends to the transaction (a
 * `SetComputeUnitLimit` and a `SetComputeUnitPrice`), each of which consumes a
 * fixed 150 compute units as builtin instructions.
 */
const MIN_COMPUTE_UNIT_BUFFER = 300;
/** The maximum compute unit limit allowed per transaction. */
const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;
/** The estimated compute units at which the default margin reaches its floor. */
const COMPUTE_UNIT_MARGIN_CAP = 500_000;
/** The margin added to low compute unit estimates (10%). */
const MAX_COMPUTE_UNIT_MARGIN = 0.1;
/** The margin added to compute unit estimates at or above the cap (2%). */
const MIN_COMPUTE_UNIT_MARGIN = 0.02;

/**
 * The default function used to derive a compute unit limit from an estimate.
 *
 * It adds a buffer on top of the estimate that is the greater of a fixed
 * minimum ({@link MIN_COMPUTE_UNIT_BUFFER}) and a margin that decays linearly
 * from {@link MAX_COMPUTE_UNIT_MARGIN} at low estimates to
 * {@link MIN_COMPUTE_UNIT_MARGIN} at {@link COMPUTE_UNIT_MARGIN_CAP} compute
 * units and above. This guarantees a meaningful cushion for cheap transactions
 * while keeping the overhead small for expensive ones, accounting for variation
 * between simulation and execution.
 *
 * @param estimatedComputeUnits - The compute units consumed during simulation.
 * @returns The compute unit limit to set on the transaction.
 */
function getDefaultComputeUnitLimitFromEstimate(estimatedComputeUnits: number): number {
    const progress = Math.min(estimatedComputeUnits / COMPUTE_UNIT_MARGIN_CAP, 1);
    const margin = MAX_COMPUTE_UNIT_MARGIN - (MAX_COMPUTE_UNIT_MARGIN - MIN_COMPUTE_UNIT_MARGIN) * progress;
    // Compute the extra units separately and round them up before adding, so we
    // avoid floating-point artefacts from multiplying by `1 + margin` directly.
    const extraComputeUnits = Math.ceil(estimatedComputeUnits * margin);
    return estimatedComputeUnits + Math.max(MIN_COMPUTE_UNIT_BUFFER, extraComputeUnits);
}

/**
 * Wraps a resource limit estimator to buffer the estimated compute unit limit
 * and, optionally, recover from failed estimation simulations.
 *
 * The returned estimator is intended to be passed to
 * {@link estimateAndSetResourceLimitsFactory}, which only calls it when a
 * resource limit actually needs estimating. The `onSimulate` callback is
 * therefore invoked exactly once an estimation simulation has been performed
 * and we are proceeding to send (i.e. not on a non-recoverable failure).
 *
 * The `getComputeUnitLimitFromEstimate` function is applied to the compute unit
 * limit only, to account for variations between simulation and execution. It is
 * applied on both the success path and the recovery path, and its result is
 * rounded up to an integer and capped at {@link MAX_COMPUTE_UNIT_LIMIT} (the
 * per-transaction maximum).
 *
 * When `skipPreflight` is `true` and the estimation simulation fails, the
 * consumed resources from the failed simulation are used so the transaction
 * can still reach the validator for debugging purposes.
 *
 * @param estimateResourceLimits - The underlying estimator, typically created by
 *   {@link estimateResourceLimitsFactory}.
 * @param getComputeUnitLimitFromEstimate - Maps the estimated compute units to the limit to set.
 * @param skipPreflight - Whether to recover from failed simulations using consumed resources.
 * @param onSimulate - Called once a simulation has been performed and an estimate produced.
 * @returns An estimator that applies a compute unit buffer and recovery behaviour.
 */
function bufferAndRecoverResourceLimits(
    estimateResourceLimits: ReturnType<typeof estimateResourceLimitsFactory>,
    getComputeUnitLimitFromEstimate: (estimatedComputeUnits: number) => number,
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

        // Apply the compute unit buffer to the estimated compute unit limit,
        // rounding up to an integer and capping at the per-transaction maximum.
        return {
            ...estimate,
            computeUnitLimit: Math.min(
                MAX_COMPUTE_UNIT_LIMIT,
                Math.ceil(getComputeUnitLimitFromEstimate(estimate.computeUnitLimit)),
            ),
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
export function limitFunction<TArguments extends unknown[], TReturnType>(
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

/**
 * Configuration shared by the transaction preparation step of both RPC executors.
 */
export type PrepareTransactionMessageConfig = {
    /**
     * Whether to estimate and set resource limits (the compute unit limit
     * and, for version 1 transactions, the loaded accounts data size limit)
     * by simulating the transaction before sending.
     *
     * When `true` (default), any resource limit that is still provisory or
     * unset is estimated via a simulation and replaced with the estimated
     * value (with a compute unit buffer applied via
     * `getComputeUnitLimitFromEstimate`). When `false`, no estimation
     * simulation is performed and the message is sent with exactly the
     * resource limits it already carries.
     *
     * This should match the `estimateResourceLimits` option passed to
     * {@link rpcTransactionPlanner}, which controls whether provisory limits
     * are reserved in the first place. {@link solanaRpc} keeps them in sync
     * automatically.
     *
     * Defaults to `true`.
     */
    estimateResourceLimits?: boolean;
    /**
     * Maps the estimated compute unit consumption from simulation to the
     * compute unit limit to set on the transaction, adding headroom to
     * account for variation between simulation and execution.
     *
     * By default, a function is used that adds a buffer on top of the
     * estimate of at least 300 compute units, or a margin that decays
     * linearly from 10% at low estimates to 2% at 500,000 compute units and
     * above, whichever is greater.
     *
     * The returned value is always capped at 1,400,000, the maximum number of
     * compute units allowed per transaction.
     *
     * @param estimatedComputeUnits - The compute units consumed during simulation.
     * @returns The compute unit limit to set on the transaction.
     */
    getComputeUnitLimitFromEstimate?: (estimatedComputeUnits: number) => number;
    /**
     * Whether to skip the preflight simulation when sending transactions.
     *
     * When `false` (default), preflight is skipped only if a resource limit
     * estimation simulation was already performed for that transaction.
     * If every applicable resource limit is already explicitly set (i.e. no
     * estimation was needed) or estimation is disabled, preflight runs as the
     * only simulation.
     *
     * When `true`, preflight is always skipped and the transaction is sent
     * directly to the validator. Additionally, if the resource limit estimation
     * simulation fails, the consumed resources from the failed simulation are
     * used to set the limits so the transaction still reaches the validator.
     * This is useful for debugging failed transactions in an explorer.
     *
     * The signing executor never sends, so preflight-skipping does not apply to it;
     * only the failed-estimation-simulation recovery behaviour described above does.
     *
     * Defaults to `false`.
     */
    skipPreflight?: boolean;
};

/**
 * Creates the step both RPC transaction plan executors share: it assigns the transaction
 * lifetime from the latest blockhash and, unless disabled, estimates and sets resource
 * limits, recording the message on the context as it progresses.
 *
 * It deliberately stops short of signing, because that is the one thing the two executors
 * do differently — the signing executor signs partially, since it must not guarantee a
 * fully signed transaction, while the sending executor signs fully because it has to send.
 *
 * @param rpc - The RPC used to fetch the blockhash and to simulate for estimation.
 * @param config - Estimation and preflight configuration.
 * @return A function that prepares a transaction message for signing.
 */
export function prepareTransactionMessageFactory(
    rpc: Rpc<GetLatestBlockhashApi & SimulateTransactionApi>,
    config: PrepareTransactionMessageConfig,
) {
    const estimateResourceLimits = estimateResourceLimitsFactory({ rpc });
    const shouldEstimateResourceLimits = config.estimateResourceLimits ?? true;
    const getComputeUnitLimitFromEstimate =
        config.getComputeUnitLimitFromEstimate ?? getDefaultComputeUnitLimitFromEstimate;
    const skipPreflight = config.skipPreflight ?? false;

    return async (
        context: BaseTransactionPlanResultContext,
        transactionMessage: TransactionMessage & TransactionMessageWithFeePayer,
        executorConfig?: { abortSignal?: AbortSignal },
    ): Promise<{
        didSimulateToEstimate: boolean;
        message: TransactionMessage & TransactionMessageWithFeePayer;
    }> => {
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send(executorConfig);

        // `estimateAndSetResourceLimits` only invokes our estimator when a
        // resource limit actually needs estimating, so this flag tells us
        // whether an estimation simulation was performed. When it was, the
        // sending executor skips the redundant preflight simulation.
        let didSimulateToEstimate = false;
        const estimateAndSetResourceLimits = estimateAndSetResourceLimitsFactory(
            bufferAndRecoverResourceLimits(
                estimateResourceLimits,
                getComputeUnitLimitFromEstimate,
                skipPreflight,
                () => {
                    didSimulateToEstimate = true;
                },
            ),
        );

        const message = await pipe(
            transactionMessage,
            tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
            tx => (context.message = tx),
            // Skip the estimation step entirely when disabled, so the message is
            // used with exactly the resource limits it carries.
            async tx => (shouldEstimateResourceLimits ? await estimateAndSetResourceLimits(tx, executorConfig) : tx),
            async tx => (context.message = await tx),
        );

        return { didSimulateToEstimate, message };
    };
}
