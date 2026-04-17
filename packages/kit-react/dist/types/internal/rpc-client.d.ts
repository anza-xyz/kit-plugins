import type { ClientWithRpc, ClientWithRpcSubscriptions, SolanaRpcApi, SolanaRpcSubscriptionsApi } from '@solana/kit';
/** @internal The subset of client capabilities needed by live-data hooks. */
export type SolanaRpcClient = ClientWithRpc<SolanaRpcApi> & ClientWithRpcSubscriptions<SolanaRpcSubscriptionsApi>;
/**
 * @internal
 * Returns the client and asserts that it has both `rpc` and `rpcSubscriptions`.
 */
export declare function useRpcClient(hookName: string): SolanaRpcClient;
//# sourceMappingURL=rpc-client.d.ts.map