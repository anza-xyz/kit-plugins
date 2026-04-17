import type { ClientWithTransactionPlanning } from '@solana/kit';
import { type ActionState } from './use-action';
type PlanTransactionFn = ClientWithTransactionPlanning['planTransaction'];
type PlanTransactionsFn = ClientWithTransactionPlanning['planTransactions'];
/** Reactive state returned by {@link usePlanTransaction}. */
export type UsePlanTransactionState = ActionState<Parameters<PlanTransactionFn>, Awaited<ReturnType<PlanTransactionFn>>>;
/** Reactive state returned by {@link usePlanTransactions}. */
export type UsePlanTransactionsState = ActionState<Parameters<PlanTransactionsFn>, Awaited<ReturnType<PlanTransactionsFn>>>;
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
 * planning work. See {@link useAction} for abort semantics.
 *
 * @throws If no ancestor provider installs `client.planTransaction`.
 *
 * @example Preview then send
 * ```tsx
 * const { send: plan, data: planned, status: planStatus } = usePlanTransaction();
 * const { send: execute, status: sendStatus } = useSendTransaction();
 *
 * await plan(getTransferInstruction({ source, destination, amount }));
 * // ... user reviews `planned` in a confirmation modal ...
 * await execute(planned); // SingleTransactionPlan feeds straight into sendTransaction
 * ```
 *
 * @see {@link usePlanTransactions} — multi-transaction variant.
 * @see {@link useSendTransaction} — pairs with this hook to execute the plan.
 * @see {@link useAction}
 */
export declare function usePlanTransaction(): UsePlanTransactionState;
/**
 * Plan one or more transactions without sending them. Same relationship to
 * {@link useSendTransactions} as {@link usePlanTransaction} has to
 * {@link useSendTransaction}: it returns the full multi-transaction plan so
 * callers can preview splitting / ordering before executing.
 *
 * @throws If no ancestor provider installs `client.planTransactions`.
 *
 * @see {@link usePlanTransaction}
 * @see {@link useSendTransactions}
 */
export declare function usePlanTransactions(): UsePlanTransactionsState;
export {};
//# sourceMappingURL=use-plan-transaction.d.ts.map