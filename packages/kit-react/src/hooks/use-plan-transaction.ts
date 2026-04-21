import type { ClientWithTransactionPlanning } from '@solana/kit';
import { useCallback } from 'react';

import { useClientWithPlanTransaction, useClientWithPlanTransactions } from '../internal/sending-client';
import { type ActionState, useAction } from './use-action';

type PlanTransactionFn = ClientWithTransactionPlanning['planTransaction'];
type PlanTransactionsFn = ClientWithTransactionPlanning['planTransactions'];

/** Reactive state returned by {@link usePlanTransaction}. */
export type UsePlanTransactionState = ActionState<
    Parameters<PlanTransactionFn>,
    Awaited<ReturnType<PlanTransactionFn>>
>;

/** Reactive state returned by {@link usePlanTransactions}. */
export type UsePlanTransactionsState = ActionState<
    Parameters<PlanTransactionsFn>,
    Awaited<ReturnType<PlanTransactionsFn>>
>;

/**
 * Plan a single transaction without sending it. Returns the planned
 * transaction message — the same input shape that {@link useSendTransaction}
 * accepts — wrapped in {@link useAction} state tracking.
 *
 * Useful for preview-then-send UX: plan the transaction, show the user the
 * fee / writable accounts / instruction summary, and only call
 * `useSendTransaction().send(planned)` once they confirm.
 *
 * The hook-managed `AbortSignal` is threaded into `client.planTransaction`'s
 * config, so calling `send` again or calling `reset()` cancels any pending
 * planning work. Fire-and-forget callers read the planned message from
 * `data` on the next render — only flows that `await send(...)` need to
 * filter with {@link isAbortError}. See {@link useAction} for full abort
 * semantics.
 *
 * @throws If no ancestor provider installs `client.planTransaction`.
 *
 * @example Preview then send — read state from render
 * ```tsx
 * const { send: plan, data: planned, isRunning: isPlanning } = usePlanTransaction();
 * const { send: execute, isSuccess: didSend } = useSendTransaction();
 *
 * return (
 *     <>
 *         <button onClick={() => plan(getTransferInstruction({ source, destination, amount }))}>
 *             Preview
 *         </button>
 *         {isPlanning && <Spinner />}
 *         {planned && (
 *             <ConfirmModal plan={planned} onConfirm={() => execute(planned)} />
 *         )}
 *         {didSend && <span>Sent!</span>}
 *     </>
 * );
 * ```
 *
 * @see {@link usePlanTransactions} — multi-transaction variant.
 * @see {@link useSendTransaction} — pairs with this hook to execute the plan.
 * @see {@link useAction}
 * @see {@link isAbortError}
 */
export function usePlanTransaction(): UsePlanTransactionState {
    const client = useClientWithPlanTransaction('usePlanTransaction');
    const fn = useCallback(
        (
            signal: AbortSignal,
            input: Parameters<PlanTransactionFn>[0],
            config?: Parameters<PlanTransactionFn>[1],
        ): ReturnType<PlanTransactionFn> => client.planTransaction(input, { ...config, abortSignal: signal }),
        [client],
    );
    return useAction(fn);
}

/**
 * Plan one or more transactions without sending them. Same relationship to
 * {@link useSendTransactions} as {@link usePlanTransaction} has to
 * {@link useSendTransaction}: it returns the full multi-transaction plan so
 * callers can preview splitting / ordering before executing.
 *
 * Calling `send` again while planning is in flight aborts the prior call;
 * `reset()` does the same. Fire-and-forget callers read state from render —
 * only flows that `await send(...)` need the {@link isAbortError} filter;
 * see {@link usePlanTransaction}'s example for the idiomatic shape, and
 * {@link useAction} for full abort semantics.
 *
 * @throws If no ancestor provider installs `client.planTransactions`.
 *
 * @see {@link usePlanTransaction}
 * @see {@link useSendTransactions}
 */
export function usePlanTransactions(): UsePlanTransactionsState {
    const client = useClientWithPlanTransactions('usePlanTransactions');
    const fn = useCallback(
        (
            signal: AbortSignal,
            input: Parameters<PlanTransactionsFn>[0],
            config?: Parameters<PlanTransactionsFn>[1],
        ): ReturnType<PlanTransactionsFn> => client.planTransactions(input, { ...config, abortSignal: signal }),
        [client],
    );
    return useAction(fn);
}
