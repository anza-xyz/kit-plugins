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
 * @example
 * RPC-based airdrop.
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { airdrop, localhostRpc } from '@solana/kit-plugins';
 *
 * // Install the airdrop plugin using a localhost RPC.
 * const client = createEmptyClient()
 *     .use(localhostRpc())
 *     .use(airdrop());
 *
 * // Use the airdrop method.
 * client.airdrop(myAddress, lamports(1_000_000_000n));
 * ```
 *
 * @example
 * LiteSVM-based airdrop.
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { airdrop, litesvm } from '@solana/kit-plugins';
 *
 * // Install the airdrop plugin using a LiteSVM instance.
 * const client = createEmptyClient()
 *     .use(litesvm())
 *     .use(airdrop());
 *
 * // Use the airdrop method.
 * client.airdrop(myAddress, lamports(1_000_000_000n));
 * ```
 *
 * @see {@link AirdropFunction}
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
