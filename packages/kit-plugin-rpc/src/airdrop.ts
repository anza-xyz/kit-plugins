import { Address, airdropFactory, ClientWithAirdrop, extendClient, Lamports } from '@solana/kit';

type RpcClient = {
    rpc: Parameters<typeof airdropFactory>[0]['rpc'];
    rpcSubscriptions: Parameters<typeof airdropFactory>[0]['rpcSubscriptions'];
};

/**
 * A plugin that adds an `airdrop` method to the client using the
 * RPC and RPC Subscriptions transports.
 *
 * The client must already have `rpc` and `rpcSubscriptions` installed
 * (e.g. via {@link solanaRpcConnection} and {@link solanaRpcSubscriptionsConnection}).
 * A TypeScript error is raised when a mainnet RPC is used because
 * airdrop methods are not available on mainnet.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { solanaRpcConnection, solanaRpcSubscriptionsConnection, rpcAirdrop } from '@solana/kit-plugin-rpc';
 *
 * const client = createClient()
 *     .use(solanaRpcConnection('http://127.0.0.1:8899'))
 *     .use(solanaRpcSubscriptionsConnection('ws://127.0.0.1:8900'))
 *     .use(rpcAirdrop());
 *
 * await client.airdrop(myAddress, lamports(1_000_000_000n));
 * ```
 *
 * @see {@link solanaRpcConnection}
 * @see {@link solanaRpcSubscriptionsConnection}
 */
export function rpcAirdrop() {
    return <T extends RpcClient>(client: T) => {
        const airdropInternal = airdropFactory({ rpc: client.rpc, rpcSubscriptions: client.rpcSubscriptions });
        return extendClient(client, <ClientWithAirdrop>{
            airdrop: (address: Address, amount: Lamports, abortSignal?: AbortSignal) =>
                airdropInternal({ abortSignal, commitment: 'confirmed', lamports: amount, recipientAddress: address }),
        });
    };
}
