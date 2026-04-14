import {
    BASE_ACCOUNT_SIZE,
    ClientWithGetMinimumBalance,
    ClientWithRpc,
    extendClient,
    GetMinimumBalanceConfig,
    GetMinimumBalanceForRentExemptionApi,
    lamports,
} from '@solana/kit';

/**
 * A plugin that adds a `getMinimumBalance` method to the client using
 * the `getMinimumBalanceForRentExemption` RPC method.
 *
 * The client must already have `rpc` installed (e.g. via the {@link rpc}
 * or {@link localhostRpc} plugins).
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { rpc, rpcGetMinimumBalance } from '@solana/kit-plugin-rpc';
 *
 * const client = createClient()
 *     .use(rpc('https://api.mainnet-beta.solana.com'))
 *     .use(rpcGetMinimumBalance());
 *
 * const balance = await client.getMinimumBalance(100);
 * ```
 *
 * @see {@link rpc}
 * @see {@link localhostRpc}
 */
export function rpcGetMinimumBalance() {
    return <T extends ClientWithRpc<GetMinimumBalanceForRentExemptionApi>>(client: T) => {
        return extendClient(client, <ClientWithGetMinimumBalance>{
            getMinimumBalance: async (space: number, config?: GetMinimumBalanceConfig) => {
                if (config?.withoutHeader) {
                    const headerBalance = await client.rpc.getMinimumBalanceForRentExemption(0n).send();
                    const lamportsPerByte = BigInt(headerBalance) / BigInt(BASE_ACCOUNT_SIZE);
                    return lamports(lamportsPerByte * BigInt(space));
                }
                return await client.rpc.getMinimumBalanceForRentExemption(BigInt(space)).send();
            },
        });
    };
}
