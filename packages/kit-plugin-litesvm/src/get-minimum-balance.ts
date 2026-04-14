import {
    BASE_ACCOUNT_SIZE,
    ClientWithGetMinimumBalance,
    extendClient,
    GetMinimumBalanceConfig,
    lamports,
} from '@solana/kit';

type LiteSVMClient = {
    svm: { minimumBalanceForRentExemption: (dataLen: bigint) => bigint };
};

/**
 * A plugin that adds a `getMinimumBalance` method to the client using the
 * underlying LiteSVM instance.
 *
 * The client must already have a `svm` property installed (e.g. via
 * the {@link litesvmConnection} plugin). The balance is computed synchronously
 * against the in-process SVM.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { litesvmConnection, litesvmGetMinimumBalance } from '@solana/kit-plugin-litesvm';
 *
 * const client = createClient()
 *     .use(litesvmConnection())
 *     .use(litesvmGetMinimumBalance());
 *
 * const balance = await client.getMinimumBalance(100);
 * ```
 *
 * @see {@link litesvmConnection}
 */
export function litesvmGetMinimumBalance() {
    return <T extends LiteSVMClient>(client: T) => {
        return extendClient(client, <ClientWithGetMinimumBalance>{
            getMinimumBalance: (space: number, config?: GetMinimumBalanceConfig) => {
                if (config?.withoutHeader) {
                    const headerBalance = client.svm.minimumBalanceForRentExemption(0n);
                    const lamportsPerByte = headerBalance / BigInt(BASE_ACCOUNT_SIZE);
                    return Promise.resolve(lamports(lamportsPerByte * BigInt(space)));
                }
                return Promise.resolve(lamports(client.svm.minimumBalanceForRentExemption(BigInt(space))));
            },
        });
    };
}
