import type { ClientWithTransactionPlanning, ClientWithTransactionSending } from '@solana/kit';
/** @internal Client asserted to have `sendTransaction`. */
export declare function useClientWithSendTransaction(hookName: string): Pick<ClientWithTransactionSending, 'sendTransaction'>;
/** @internal Client asserted to have `sendTransactions`. */
export declare function useClientWithSendTransactions(hookName: string): Pick<ClientWithTransactionSending, 'sendTransactions'>;
/** @internal Client asserted to have `planTransaction`. */
export declare function useClientWithPlanTransaction(hookName: string): Pick<ClientWithTransactionPlanning, 'planTransaction'>;
/** @internal Client asserted to have `planTransactions`. */
export declare function useClientWithPlanTransactions(hookName: string): Pick<ClientWithTransactionPlanning, 'planTransactions'>;
//# sourceMappingURL=sending-client.d.ts.map