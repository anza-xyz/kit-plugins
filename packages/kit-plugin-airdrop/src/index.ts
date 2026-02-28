import { Address, airdropFactory, ClientWithAirdrop, Lamports } from '@solana/kit';

type LiteSVMClient = {
    svm: { airdrop: (address: Address, lamports: Lamports) => unknown };
};
type RpcClient = {
    rpc: Parameters<typeof airdropFactory>[0]['rpc'];
    rpcSubscriptions: Parameters<typeof airdropFactory>[0]['rpcSubscriptions'];
};

/**
 * A plugin that adds an `airdrop` method to the client.
 *
 * This will use the LiteSVM's internal airdrop method if the
 * client has LiteSVM installed. Otherwise, it will rely on the
 * `Rpc` and `RpcSubscriptions` clients to perform the airdrop.
 *
 * @deprecated Use `rpcAirdrop` from `@solana/kit-plugin-rpc` or
 * `litesvmAirdrop` from `@solana/kit-plugin-litesvm` instead.
 *
 * @example
 * RPC-based airdrop.
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { localhostRpc, rpcAirdrop } from '@solana/kit-plugin-rpc';
 *
 * const client = createEmptyClient()
 *     .use(localhostRpc())
 *     .use(rpcAirdrop());
 * ```
 *
 * @example
 * LiteSVM-based airdrop.
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { litesvm, litesvmAirdrop } from '@solana/kit-plugin-litesvm';
 *
 * const client = createEmptyClient()
 *     .use(litesvm())
 *     .use(litesvmAirdrop());
 * ```
 */
export function airdrop() {
    return <T extends LiteSVMClient | RpcClient>(client: T): ClientWithAirdrop & T => {
        if ('svm' in client) {
            return {
                ...client,
                airdrop: (address, amount) => {
                    client.svm.airdrop(address, amount);
                    return Promise.resolve();
                },
            } as ClientWithAirdrop & T;
        }
        const airdropInternal = airdropFactory({
            rpc: client.rpc,
            rpcSubscriptions: client.rpcSubscriptions,
        });
        return {
            ...client,
            airdrop: (address, amount, abortSignal) =>
                airdropInternal({ abortSignal, commitment: 'confirmed', lamports: amount, recipientAddress: address }),
        } as ClientWithAirdrop & T;
    };
}
