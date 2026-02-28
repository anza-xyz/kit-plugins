import { Address, ClientWithAirdrop, getBase58Decoder, Lamports, signature as toSignature } from '@solana/kit';

import { getSolanaErrorFromLiteSvmFailure, isFailedTransaction } from './transaction-error';

type LiteSVMClient = {
    svm: { airdrop: (address: Address, lamports: Lamports) => unknown };
};

/**
 * A plugin that adds an `airdrop` method to the client using the
 * underlying LiteSVM instance.
 *
 * The client must already have a `svm` property installed (e.g. via
 * the {@link litesvm} plugin). The airdrop is executed synchronously
 * against the in-process SVM and the resulting transaction signature
 * is returned.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { litesvm, litesvmAirdrop } from '@solana/kit-plugin-litesvm';
 *
 * const client = createEmptyClient()
 *     .use(litesvm())
 *     .use(litesvmAirdrop());
 *
 * await client.airdrop(myAddress, lamports(1_000_000_000n));
 * ```
 *
 * @see {@link litesvm}
 */
export function litesvmAirdrop() {
    return <T extends LiteSVMClient>(client: T): ClientWithAirdrop & T => {
        const base58Decoder = getBase58Decoder();
        return {
            ...client,
            airdrop: (address: Address, amount: Lamports) => {
                const result = client.svm.airdrop(address, amount);
                if (result == null) {
                    throw new Error(`Airdrop to ${address} failed: returned null`);
                }
                if (isFailedTransaction(result)) {
                    throw getSolanaErrorFromLiteSvmFailure(result);
                }
                const sig = toSignature(base58Decoder.decode((result as { signature: () => Uint8Array }).signature()));
                return Promise.resolve(sig);
            },
        } as ClientWithAirdrop & T;
    };
}
