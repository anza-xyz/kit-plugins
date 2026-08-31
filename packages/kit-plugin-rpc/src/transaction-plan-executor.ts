import {
    assertIsTransactionWithBlockhashLifetime,
    ClientWithRpc,
    ClientWithRpcSubscriptions,
    ClientWithTransactionPlanning,
    createTransactionPlanExecutor,
    createTransactionPlanExecutorWithConcurrentLeaves,
    estimateAndSetResourceLimitsFactory,
    estimateResourceLimitsFactory,
    GetEpochInfoApi,
    GetLatestBlockhashApi,
    GetSignatureStatusesApi,
    getSignatureFromTransaction,
    isSolanaError,
    partiallySignTransactionMessageWithSigners,
    pipe,
    ResourceLimitsEstimate,
    SendableTransaction,
    sendAndConfirmTransactionFactory,
    SendTransactionApi,
    setTransactionMessageLifetimeUsingBlockhash,
    Signature,
    SignatureNotificationsApi,
    signTransactionMessageWithSigners,
    SimulateTransactionApi,
    SlotNotificationsApi,
    SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_RESOURCE_LIMITS,
    Transaction,
    TransactionMessage,
    TransactionMessageWithBlockhashLifetime,
    TransactionMessageWithFeePayer,
    TransactionPlanExecutor,
    TransactionPlanExecutorConfig,
    TransactionWithinSizeLimit,
    TransactionWithLifetime,
    Base64EncodedWireTransaction,
    getBase64EncodedWireTransaction,
} from '@solana/kit';
import {
    transactionPlanExecutor,
    transactionPlanSendingExecutor,
    transactionPlanSigningExecutor,
} from '@solana/kit-plugin-instruction-plan';

/**
 * A plugin that adds `sendTransaction` and `sendTransactions` to the client
 * using a default transaction plan executor backed by RPC.
 *
 * The executor handles resource limit estimation (compute units and, for
 * version 1 transactions, the loaded accounts data size), transaction signing,
 * and sending via RPC. A concurrency limit can be set to avoid hitting rate
 * limits when sending many transactions in parallel.
 *
 * Since sending goes through the client's planning functions,
 * {@link rpcTransactionPlanner} — or another `transactionPlanner` plugin — must
 * be installed first.
 *
 * @param config - Optional configuration for the executor.
 * @returns A plugin that adds `client.sendTransaction` and `client.sendTransactions`.
 * @throws If the client has no `rpc` or no `rpcSubscriptions` set, or no
 * transaction planning functions set.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { solanaRpcConnection, rpcTransactionPlanner, rpcTransactionPlanSendingExecutor } from '@solana/kit-plugin-rpc';
 * import { generatedPayer } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient()
 *     .use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
 *     .use(generatedPayer())
 *     .use(rpcTransactionPlanner())
 *     .use(rpcTransactionPlanSendingExecutor());
 * ```
 *
 * @see {@link rpcTransactionPlanner}
 */
export function rpcTransactionPlanSendingExecutor(config: RpcTransactionPlanExecutorConfig = {}) {
    return <
        T extends ClientWithRpc<
            GetEpochInfoApi &
                GetLatestBlockhashApi &
                GetSignatureStatusesApi &
                SendTransactionApi &
                SimulateTransactionApi
        > &
            ClientWithRpcSubscriptions<SignatureNotificationsApi & SlotNotificationsApi> &
            ClientWithTransactionPlanning,
    >(
        client: T,
    ) => transactionPlanSendingExecutor(createSendingExecutor(client, config))(client);
}

/**
 * A plugin that adds `signTransaction` and `signTransactions` to the client
 * using a transaction plan executor backed by RPC.
 *
 * The executor fetches a blockhash, estimates resource limits when needed, and
 * partially signs every transaction in the plan. Transaction plan execution
 * constraints are ignored during signing, while transaction preparation and
 * signing respect `maxConcurrency`.
 *
 * Since signing goes through the client's planning functions,
 * {@link rpcTransactionPlanner} or another `transactionPlanner` plugin must be
 * installed first.
 *
 * @param config - Optional configuration for the signing executor.
 * @returns A plugin that adds `client.signTransaction` and `client.signTransactions`.
 * @throws If the client has no RPC or no transaction planning functions set.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { rpcTransactionPlanSigningExecutor, rpcTransactionPlanner, solanaRpcConnection } from '@solana/kit-plugin-rpc';
 * import { generatedPayer } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient()
 *     .use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
 *     .use(generatedPayer())
 *     .use(rpcTransactionPlanner())
 *     .use(rpcTransactionPlanSigningExecutor());
 *
 * const result = await client.signTransactions(myInstructionPlan);
 * ```
 *
 * @see {@link rpcTransactionPlanner}
 * @see {@link rpcTransactionPlanSendingExecutor}
 */
export function rpcTransactionPlanSigningExecutor(config: RpcTransactionPlanSigningExecutorConfig = {}) {
    return <T extends ClientWithRpc<GetLatestBlockhashApi & SimulateTransactionApi> & ClientWithTransactionPlanning>(
        client: T,
    ) => transactionPlanSigningExecutor(createSigningExecutor(client, config))(client);
}

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
 * @deprecated Use {@link rpcTransactionPlanSendingExecutor} instead, which
 * installs `sendTransaction` and `sendTransactions` alongside the executor. This
 * plugin only sets the deprecated `transactionPlanExecutor` field.
 *
 * ```ts
 * // Before
 * const client = await createClient()
 *     .use(rpcTransactionPlanner())
 *     .use(rpcTransactionPlanExecutor())
 *     .use(planAndSendTransactions());
 *
 * // After
 * const client = await createClient()
 *     .use(rpcTransactionPlanner())
 *     .use(rpcTransactionPlanSendingExecutor());
 * ```
 */
export function rpcTransactionPlanExecutor(config: RpcTransactionPlanExecutorConfig = {}) {
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
    ) => transactionPlanExecutor(createSendingExecutor(client, config))(client);
}

/**
 * Configuration for {@link rpcTransactionPlanSendingExecutor}.
 *
 * @see {@link rpcTransactionPlanSendingExecutor}
 */
export type RpcTransactionPlanExecutorConfig = {
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
     * estimation was needed) or estimation is disabled, preflight runs as the
     * only simulation.
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
};

/**
 * Configuration for {@link rpcTransactionPlanSigningExecutor}.
 *
 * Signing uses the same resource limit estimation options as
 * {@link rpcTransactionPlanSendingExecutor}, but it has no preflight behavior
 * because transactions are not sent.
 *
 * @see {@link rpcTransactionPlanSigningExecutor}
 */
export type RpcTransactionPlanSigningExecutorConfig = {
    /**
     * Whether to estimate and set resource limits by simulating each transaction
     * before signing. Defaults to `true`.
     */
    estimateResourceLimits?: boolean;
    /**
     * Maps estimated compute unit consumption to the limit set on the
     * transaction. The result is capped at 1,400,000 compute units.
     */
    getComputeUnitLimitFromEstimate?: (estimatedComputeUnits: number) => number;
    /**
     * The maximum number of transactions prepared and signed concurrently
     * across all calls to this signing executor. Defaults to 10.
     */
    maxConcurrency?: number;
};

/**
 * The context carried by transaction plan results from
 * {@link rpcTransactionPlanSendingExecutor}.
 *
 * The executor records the planned message once its blockhash lifetime and
 * resource limits are set, then the fully signed transaction, then the
 * signature it was sent under, so a successful result carries all three.
 *
 * @remarks
 * These properties are only guaranteed on successful results. The context is
 * filled in as execution progresses, so a transaction that fails or is canceled
 * part way through carries only what was recorded before it stopped.
 *
 * @example
 * Annotating a result produced by the executor.
 * ```ts
 * import { SuccessfulSingleTransactionPlanResult } from '@solana/kit';
 * import { RpcSendContext } from '@solana/kit-plugin-rpc';
 *
 * function logSentTransaction(result: SuccessfulSingleTransactionPlanResult<RpcSendContext>) {
 *     console.log(`Sent ${result.context.signature}, size: ${result.context.transaction.messageBytes.length} bytes`);
 * }
 * ```
 *
 * @see {@link rpcTransactionPlanSendingExecutor}
 */
export type RpcSendContext = {
    message: TransactionMessage & TransactionMessageWithFeePayer & TransactionMessageWithBlockhashLifetime;
    signature: Signature;
    transaction: SendableTransaction & Transaction & TransactionWithLifetime;
};

/**
 * The context carried by transaction plan results from
 * {@link rpcTransactionPlanSigningExecutor}.
 *
 * The executor records the transaction message after setting its blockhash and
 * resource limits, plus the transaction after applying every available signer
 * and its Base64-encoded wire representation. The signature is present when
 * the fee payer signed, even if other required signatures are still missing.
 *
 * @remarks
 * These properties are only guaranteed on successful results. Failed and
 * canceled results carry the values recorded before signing stopped.
 *
 * @example
 * ```ts
 * import { SuccessfulSingleTransactionPlanResult } from '@solana/kit';
 * import { RpcSignContext } from '@solana/kit-plugin-rpc';
 *
 * function inspectSignedTransaction(result: SuccessfulSingleTransactionPlanResult<RpcSignContext>) {
 *     console.log(result.context.transactionBase64);
 * }
 * ```
 *
 * @see {@link rpcTransactionPlanSigningExecutor}
 */
export type RpcSignContext = {
    message: TransactionMessage & TransactionMessageWithFeePayer & TransactionMessageWithBlockhashLifetime;
    signature?: Signature;
    transaction: Transaction & TransactionWithinSizeLimit & TransactionWithLifetime;
    transactionBase64: Base64EncodedWireTransaction;
};

type LatestBlockhashResponse = ReturnType<GetLatestBlockhashApi['getLatestBlockhash']>;

/**
 * Creates the transaction plan executor installed by
 * {@link rpcTransactionPlanSendingExecutor}, which signs and sends planned
 * transaction messages using the client's RPC and RPC Subscriptions.
 */
function createSendingExecutor(
    client: ClientWithRpc<
        GetEpochInfoApi & GetLatestBlockhashApi & GetSignatureStatusesApi & SendTransactionApi & SimulateTransactionApi
    > &
        ClientWithRpcSubscriptions<SignatureNotificationsApi & SlotNotificationsApi>,
    config: RpcTransactionPlanExecutorConfig,
): TransactionPlanExecutor<RpcSendContext> {
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
    const shouldEstimateResourceLimits = config.estimateResourceLimits ?? true;
    const getComputeUnitLimitFromEstimate =
        config.getComputeUnitLimitFromEstimate ?? getDefaultComputeUnitLimitFromEstimate;
    const skipPreflight = config.skipPreflight ?? false;

    return createTransactionPlanExecutor<RpcSendContext>({
        executeTransactionMessage: limitFunction(async (context, transactionMessage, executorConfig) => {
            const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send(executorConfig);

            // `estimateAndSetResourceLimits` only invokes our estimator when a
            // resource limit actually needs estimating, so this flag tells us
            // whether an estimation simulation was performed. When it was, we
            // skip the redundant preflight simulation while sending.
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

            const signedTransaction = await pipe(
                transactionMessage,
                tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
                tx => (context.message = tx),
                // Skip the estimation step entirely when disabled, so the
                // message is sent with exactly the resource limits it carries.
                async tx =>
                    shouldEstimateResourceLimits ? await estimateAndSetResourceLimits(tx, executorConfig) : tx,
                async tx => (context.message = await tx),
                async tx => await signTransactionMessageWithSigners(await tx, executorConfig),
                async tx => (context.transaction = await tx),
            );
            assertIsTransactionWithBlockhashLifetime(signedTransaction);
            const signature = getSignatureFromTransaction(signedTransaction);
            context.signature = signature;
            await sendAndConfirmTransaction(signedTransaction, {
                commitment: 'confirmed',
                skipPreflight: skipPreflight || didSimulateToEstimate,
                ...executorConfig,
            });
            return context as RpcSendContext;
        }, config.maxConcurrency ?? 10),
    } satisfies TransactionPlanExecutorConfig<RpcSendContext>);
}

/** Creates the transaction plan executor installed by {@link rpcTransactionPlanSigningExecutor}. */
function createSigningExecutor(
    client: ClientWithRpc<GetLatestBlockhashApi & SimulateTransactionApi>,
    config: RpcTransactionPlanSigningExecutorConfig,
): TransactionPlanExecutor<RpcSignContext> {
    if (!client.rpc) {
        throw new Error(
            'An RPC instance is required on the client to create the RPC transaction plan signing executor. ' +
                'Please add the RPC plugin to your client before using this plugin.',
        );
    }

    const shouldEstimateResourceLimits = config.estimateResourceLimits ?? true;
    const getComputeUnitLimitFromEstimate =
        config.getComputeUnitLimitFromEstimate ?? getDefaultComputeUnitLimitFromEstimate;
    const estimateResourceLimits = estimateResourceLimitsFactory({ rpc: client.rpc });
    const estimateAndSetResourceLimits = estimateAndSetResourceLimitsFactory(
        bufferAndRecoverResourceLimits(
            estimateResourceLimits,
            getComputeUnitLimitFromEstimate,
            /* skipPreflight */ false,
        ),
    );

    const executeTransactionMessage = limitFunction(
        async (
            context: Partial<RpcSignContext>,
            transactionMessage: TransactionMessage & TransactionMessageWithFeePayer,
            executorConfig: NonNullable<Parameters<TransactionPlanExecutor<RpcSignContext>>[1]>,
            getLatestBlockhashPromise: () => Promise<LatestBlockhashResponse>,
        ) => {
            // The executor has already reported this leaf as failed if the signal
            // aborted while this call was waiting for a concurrency slot, so bail
            // out before making orphaned RPC requests on its behalf.
            executorConfig.abortSignal?.throwIfAborted();
            // Fetch lazily so plans without leaves do not make an orphaned RPC request.
            const { value: latestBlockhash } = await getLatestBlockhashPromise();
            let message = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, transactionMessage);
            context.message = message;
            if (shouldEstimateResourceLimits) {
                message = await estimateAndSetResourceLimits(message, executorConfig);
                context.message = message;
            }

            const transaction = await partiallySignTransactionMessageWithSigners(message, executorConfig);
            context.transaction = transaction;
            const transactionBase64 = getBase64EncodedWireTransaction(transaction);
            context.transactionBase64 = transactionBase64;
            const signature = Object.values(transaction.signatures)[0]
                ? getSignatureFromTransaction(transaction)
                : undefined;
            if (signature) {
                context.signature = signature;
            }
            return {
                ...(signature ? { signature } : {}),
                message,
                transaction,
                transactionBase64,
            };
        },
        config.maxConcurrency ?? 10,
    );

    return async (transactionPlan, executorConfig = {}) => {
        let latestBlockhashPromise: Promise<LatestBlockhashResponse> | undefined;
        const getLatestBlockhashPromise = () =>
            (latestBlockhashPromise ??= client.rpc.getLatestBlockhash().send(executorConfig));
        const executor = createTransactionPlanExecutorWithConcurrentLeaves<RpcSignContext>({
            executeTransactionMessage: (context, transactionMessage) =>
                executeTransactionMessage(context, transactionMessage, executorConfig, getLatestBlockhashPromise),
        });
        return await executor(transactionPlan, executorConfig);
    };
}

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
 * optional. When provided, it is invoked exactly once after a simulation has
 * produced limits (i.e. not on a non-recoverable failure).
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
 * @param onSimulate - Optionally called once a simulation has been performed and an estimate produced.
 * @returns An estimator that applies a compute unit buffer and recovery behaviour.
 */
function bufferAndRecoverResourceLimits(
    estimateResourceLimits: ReturnType<typeof estimateResourceLimitsFactory>,
    getComputeUnitLimitFromEstimate: (estimatedComputeUnits: number) => number,
    skipPreflight: boolean,
    onSimulate?: () => void,
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
        // continuing, so signal it. A non-recoverable failure throws
        // above and never gets here.
        onSimulate?.();

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
