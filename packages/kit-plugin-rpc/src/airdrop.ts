import { Address, airdropFactory, ClientWithAirdrop, Lamports } from '@solana/kit';

type RpcClient = {
    rpc: Parameters<typeof airdropFactory>[0]['rpc'];
    rpcSubscriptions: Parameters<typeof airdropFactory>[0]['rpcSubscriptions'];
};

/**
 * A plugin that adds an `airdrop` method to the client using the
 * RPC and RPC Subscriptions transports.
 *
 * The client must already have `rpc` and `rpcSubscriptions` installed
 * (e.g. via the {@link rpc} or {@link localhostRpc} plugins). A
 * TypeScript error is raised when a mainnet RPC is used because
 * airdrop methods are not available on mainnet.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { localhostRpc, rpcAirdrop } from '@solana/kit-plugin-rpc';
 *
 * const client = createEmptyClient()
 *     .use(localhostRpc())
 *     .use(rpcAirdrop());
 *
 * await client.airdrop(myAddress, lamports(1_000_000_000n));
 * ```
 *
 * @see {@link rpc}
 * @see {@link localhostRpc}
 */
export function rpcAirdrop() {
    return <T extends RpcClient>(client: T): ClientWithAirdrop & T => {
        const airdropInternal = airdropFactory({
            rpc: client.rpc,
            rpcSubscriptions: client.rpcSubscriptions,
        });
        return {
            ...client,
            airdrop: (address: Address, amount: Lamports, abortSignal?: AbortSignal) =>
                airdropInternal({
                    abortSignal,
                    commitment: 'confirmed',
                    lamports: amount,
                    recipientAddress: address,
                }),
        } as ClientWithAirdrop & T;
    };
}
