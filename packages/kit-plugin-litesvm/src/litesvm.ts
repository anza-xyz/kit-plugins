import { LiteSVM } from '@loris-sandbox/litesvm-kit';
import {
    AccountInfoBase,
    AccountInfoWithBase64EncodedData,
    Address,
    Base64EncodedBytes,
    GetAccountInfoApi,
    getBase64Decoder,
    GetLatestBlockhashApi,
    GetMultipleAccountsApi,
    MaybeEncodedAccount,
    PendingRpcRequest,
    Rpc,
    SolanaRpcResponse,
} from '@solana/kit';

// Re-export the LiteSVM type to make the `litesvm` plugin type-portable.
export type { LiteSVM } from '@loris-sandbox/litesvm-kit';

/**
 * The RPC API methods available on a LiteSVM-backed client.
 *
 * This type represents the subset of Solana RPC methods that
 * the LiteSVM plugin can serve locally. Use it with
 * `ClientWithRpc<LiteSvmRpcApi>` to type a client that provides
 * this RPC interface.
 *
 * @example
 * ```ts
 * import type { LiteSvmRpcApi } from '@solana/kit-plugin-litesvm';
 * import type { ClientWithRpc } from '@solana/kit';
 *
 * function doSomething(client: ClientWithRpc<LiteSvmRpcApi>) {
 *     const accountInfo = await client.rpc.getAccountInfo(myAddress).send();
 * }
 * ```
 */
export type LiteSvmRpcApi = GetAccountInfoApi & GetLatestBlockhashApi & GetMultipleAccountsApi;

/**
 * A Kit plugin that adds LiteSVM functionality to your client.
 *
 * This plugin starts a new LiteSVM instance within your Kit client,
 * allowing you to simulate Solana programs and accounts locally.
 * Additionally, it derives a small RPC subset that interacts with the
 * LiteSVM instance instead of making network requests.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { litesvm } from '@solana/kit-plugin-litesvm';
 *
 * // Install the LiteSVM plugin.
 * const client = createEmptyClient().use(litesvm());
 *
 * // Use LiteSVM to set up accounts and programs.
 * client.svm.setAccount(myAccount);
 * client.svm.addProgramFromFile(myProgramAddress, 'my_program.so');
 *
 * // Make some RPC calls.
 * const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
 * ```
 */
export function litesvm() {
    return <T extends object>(client: T) => {
        const svm = new LiteSVM();
        const rpc = createRpcFromSvm(svm);
        return { ...client, rpc, svm };
    };
}

type Encoding = 'base58' | 'base64' | 'base64+zstd' | 'jsonParsed';

function createRpcFromSvm(svm: LiteSVM): Rpc<LiteSvmRpcApi> {
    const base64Decoder = getBase64Decoder();
    const convertMaybeEncodedAccount = (
        account: MaybeEncodedAccount,
    ): (AccountInfoBase & AccountInfoWithBase64EncodedData) | null => {
        if (!account.exists) return null;
        return {
            data: [base64Decoder.decode(account.data) as Base64EncodedBytes, 'base64'] as const,
            executable: account.executable,
            lamports: account.lamports,
            owner: account.programAddress,
            space: account.space,
        };
    };

    return {
        getAccountInfo: (address: Address, config?: { encoding?: Encoding }) => {
            assertEncodingIsBase64(config?.encoding);
            const response = convertMaybeEncodedAccount(svm.getAccount(address));
            return wrapInPendingRpcRequest(wrapInSolanaRpcResponse(response));
        },
        getLatestBlockhash: () => {
            const response = { blockhash: svm.latestBlockhash(), lastValidBlockHeight: 0n };
            return wrapInPendingRpcRequest(wrapInSolanaRpcResponse(response));
        },
        getMultipleAccounts: (addresses: readonly Address[], config?: { encoding?: Encoding }) => {
            assertEncodingIsBase64(config?.encoding);
            const response = addresses.map(address => convertMaybeEncodedAccount(svm.getAccount(address)));
            return wrapInPendingRpcRequest(wrapInSolanaRpcResponse(response));
        },
    } as Rpc<LiteSvmRpcApi>;
}

function wrapInPendingRpcRequest<T>(response: T): PendingRpcRequest<T> {
    return { send: () => Promise.resolve(response) };
}

function wrapInSolanaRpcResponse<T>(value: T): SolanaRpcResponse<T> {
    return { context: { slot: 0n }, value };
}

function assertEncodingIsBase64(encoding: Encoding | undefined) {
    if (encoding && encoding !== 'base64') {
        throw new Error(`Please use 'base64' encoding when using LiteSVM RPC. Requested encoding: ${encoding}`);
    }
}
