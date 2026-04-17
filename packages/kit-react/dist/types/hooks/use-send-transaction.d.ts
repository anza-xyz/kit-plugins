import type { ClientWithTransactionSending } from '@solana/kit';
import { type ActionState } from './use-action';
type SendTransactionFn = ClientWithTransactionSending['sendTransaction'];
type SendTransactionsFn = ClientWithTransactionSending['sendTransactions'];
/** Reactive state returned by {@link useSendTransaction}. */
export type UseSendTransactionState = ActionState<Parameters<SendTransactionFn>, Awaited<ReturnType<SendTransactionFn>>>;
/** Reactive state returned by {@link useSendTransactions}. */
export type UseSendTransactionsState = ActionState<Parameters<SendTransactionsFn>, Awaited<ReturnType<SendTransactionsFn>>>;
/**
 * Send a single transaction, tracking the plan → sign → send → confirm
 * lifecycle with reactive status / data / error state.
 *
 * The returned `send` accepts the same inputs as `client.sendTransaction`:
 * a raw instruction, an instruction plan, a transaction message, or a
 * pre-built single-transaction plan. Asserts at runtime that the resulting
 * plan contains exactly one successful transaction.
 *
 * Calling `send` again while a previous transaction is in flight aborts the
 * prior call — the hook-managed `AbortSignal` is threaded into
 * `client.sendTransaction`'s config so the underlying RPC request is
 * cancelled, not just the outer await. See {@link useAction} for abort
 * semantics.
 *
 * Requires an ancestor provider that installs `client.sendTransaction`
 * (e.g. {@link RpcProvider} or {@link LiteSvmProvider}).
 *
 * @throws If no ancestor provider installs `client.sendTransaction`.
 *
 * @example
 * ```tsx
 * const { send, status, data, error } = useSendTransaction();
 * await send(getTransferInstruction({ source, destination, amount }));
 * ```
 *
 * @see {@link useSendTransactions}
 * @see {@link usePlanTransaction} — pairs with `useSendTransaction` for
 *   preview-then-send UX.
 * @see {@link useAction}
 */
export declare function useSendTransaction(): UseSendTransactionState;
/**
 * Send one or more transactions, tracking the lifecycle with reactive state.
 *
 * Accepts the same inputs as `client.sendTransactions`: a single instruction,
 * an instruction plan, or a pre-built multi-transaction plan. Returns the
 * full `TransactionPlanResult` (including any failures) rather than asserting
 * success.
 *
 * The hook-managed `AbortSignal` is threaded into
 * `client.sendTransactions`'s config, so calling `send` again while the
 * prior batch is in flight cancels the underlying work. See {@link useAction}
 * for abort semantics.
 *
 * @throws If no ancestor provider installs `client.sendTransactions`.
 *
 * @see {@link useSendTransaction}
 * @see {@link usePlanTransactions}
 */
export declare function useSendTransactions(): UseSendTransactionsState;
export {};
//# sourceMappingURL=use-send-transaction.d.ts.map