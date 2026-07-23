import {
    AccountInfoBase,
    AccountInfoWithBase64EncodedData,
    Address,
    Base64EncodedBytes,
    createJsonRpcApi,
    createRpc,
    DataSlice,
    EncodedAccount,
    GetAccountInfoApi,
    GetBalanceApi,
    getBase58Decoder,
    getBase58Encoder,
    getBase64Decoder,
    getBase64Encoder,
    GetEpochScheduleApi,
    GetLatestBlockhashApi,
    GetMinimumBalanceForRentExemptionApi,
    GetMultipleAccountsApi,
    GetProgramAccountsApi,
    GetProgramAccountsDatasizeFilter,
    GetProgramAccountsMemcmpFilter,
    GetSlotApi,
    Lamports,
    lamports,
    MaybeEncodedAccount,
    ReadonlyUint8Array,
    RequestAirdropApi,
    Rpc,
    RpcResponse,
    RpcTransport,
    signature as toSignature,
    SolanaRpcResponse,
} from '@solana/kit';
import type { LiteSVM } from 'litesvm';

import { getSolanaErrorFromLiteSvmFailure, isFailedTransaction } from './transaction-error';

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
export type LiteSvmRpcApi = GetAccountInfoApi &
    GetBalanceApi &
    GetEpochScheduleApi &
    GetLatestBlockhashApi &
    GetMinimumBalanceForRentExemptionApi &
    GetMultipleAccountsApi &
    GetProgramAccountsApi &
    GetSlotApi &
    RequestAirdropApi;

type Encoding = 'base58' | 'base64' | 'base64+zstd' | 'jsonParsed';

/**
 * Creates a Kit {@link Rpc} that delegates to a LiteSVM instance instead
 * of making network requests.
 *
 * The returned RPC supports a subset of the Solana JSON-RPC API. Each
 * method call is resolved synchronously against the in-process SVM and
 * wrapped in a `PendingRpcRequest` for API compatibility.
 *
 * @param svm - The LiteSVM instance to read from.
 * @returns An {@link Rpc} implementing {@link LiteSvmRpcApi}.
 *
 * @example
 * ```ts
 * import { LiteSVM } from 'litesvm';
 * import { createRpcFromSvm } from '@solana/kit-plugin-litesvm';
 *
 * const svm = new LiteSVM();
 * const rpc = createRpcFromSvm(svm);
 * const { value: balance } = await rpc.getBalance(myAddress).send();
 * ```
 */
export function createRpcFromSvm(svm: LiteSVM): Rpc<LiteSvmRpcApi> {
    const base58Decoder = getBase58Decoder();
    const base64Decoder = getBase64Decoder();
    const encodeAccountBase64 = (
        account: EncodedAccount,
        dataSlice?: DataSlice,
    ): AccountInfoBase & AccountInfoWithBase64EncodedData => {
        const data = dataSlice ? sliceData(account.data, dataSlice) : account.data;
        return {
            data: [base64Decoder.decode(data) as Base64EncodedBytes, 'base64'] as const,
            executable: account.executable,
            lamports: account.lamports,
            owner: account.programAddress,
            space: account.space,
        };
    };
    const convertMaybeEncodedAccount = (
        account: MaybeEncodedAccount,
    ): (AccountInfoBase & AccountInfoWithBase64EncodedData) | null => {
        return account.exists ? encodeAccountBase64(account) : null;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supportedApi: Record<keyof LiteSvmRpcApi, (...args: any[]) => unknown> = {
        getAccountInfo: (address: Address, config?: { encoding?: Encoding }) => {
            assertEncodingIsBase64(config?.encoding);
            const response = convertMaybeEncodedAccount(svm.getAccount(address));
            return withContext(response, svm.getClock().slot);
        },
        getBalance: (address: Address) => {
            const response = svm.getBalance(address) ?? lamports(0n);
            return withContext(response, svm.getClock().slot);
        },
        getEpochSchedule: () => {
            const schedule = svm.getEpochSchedule();
            return {
                firstNormalEpoch: schedule.firstNormalEpoch,
                firstNormalSlot: schedule.firstNormalSlot,
                leaderScheduleSlotOffset: schedule.leaderScheduleSlotOffset,
                slotsPerEpoch: schedule.slotsPerEpoch,
                warmup: schedule.warmup,
            };
        },
        getLatestBlockhash: () => {
            const response = { blockhash: svm.latestBlockhash(), lastValidBlockHeight: 0n };
            return withContext(response, svm.getClock().slot);
        },
        getMinimumBalanceForRentExemption: (size: bigint) => {
            return lamports(svm.minimumBalanceForRentExemption(size));
        },
        getMultipleAccounts: (addresses: readonly Address[], config?: { encoding?: Encoding }) => {
            assertEncodingIsBase64(config?.encoding);
            const response = addresses.map(address => convertMaybeEncodedAccount(svm.getAccount(address)));
            return withContext(response, svm.getClock().slot);
        },
        getProgramAccounts: (programId: Address, config?: GetProgramAccountsConfig) => {
            assertEncodingIsBase64(config?.encoding);
            const filters = config?.filters ?? [];
            const value = svm
                .getProgramAccounts(programId)
                .filter(account => matchesGetProgramAccountsFilters(account.data, filters))
                .map(account => ({
                    account: encodeAccountBase64(account, config?.dataSlice),
                    pubkey: account.address,
                }));
            return config?.withContext ? withContext(value, svm.getClock().slot) : value;
        },
        getSlot: () => {
            return svm.getClock().slot;
        },
        requestAirdrop: (recipientAddress: Address, amount: Lamports) => {
            const result = svm.airdrop(recipientAddress, amount);
            if (result == null) {
                throw new Error(`Airdrop to ${recipientAddress} failed: returned null`);
            }
            if (isFailedTransaction(result)) {
                throw getSolanaErrorFromLiteSvmFailure(result);
            }
            return toSignature(base58Decoder.decode(result.signature()));
        },
    };

    return createRpc({
        api: createJsonRpcApi<LiteSvmRpcApi>(),
        transport: <TResponse>({ payload }: Parameters<RpcTransport>[0]): Promise<RpcResponse<TResponse>> => {
            const method = (payload as { method: keyof LiteSvmRpcApi }).method;
            const params = (payload as { params: unknown[] }).params;

            if (method in supportedApi) {
                return Promise.resolve(supportedApi[method](...params) as TResponse);
            }

            throw new Error(`Unsupported RPC method for LiteSVM client: ${method}`);
        },
    });
}

function withContext<T>(value: T, slot: bigint): SolanaRpcResponse<T> {
    return { context: { slot }, value };
}

function assertEncodingIsBase64(encoding: Encoding | undefined) {
    if (encoding && encoding !== 'base64') {
        throw new Error(`Please use 'base64' encoding when using LiteSVM RPC. Requested encoding: ${encoding}`);
    }
}

type GetProgramAccountsConfig = {
    dataSlice?: DataSlice;
    encoding?: Encoding;
    filters?: readonly (GetProgramAccountsDatasizeFilter | GetProgramAccountsMemcmpFilter)[];
    withContext?: boolean;
};

/**
 * Applies the `getProgramAccounts` `dataSize`/`memcmp` filters to an account's
 * data buffer, matching the semantics of the Solana JSON-RPC API. All filters
 * must match (logical AND).
 */
function matchesGetProgramAccountsFilters(
    data: ReadonlyUint8Array,
    filters: readonly (GetProgramAccountsDatasizeFilter | GetProgramAccountsMemcmpFilter)[],
): boolean {
    const base58Encoder = getBase58Encoder();
    const base64Encoder = getBase64Encoder();
    return filters.every(filter => {
        if ('dataSize' in filter) {
            return BigInt(data.length) === filter.dataSize;
        }
        const { offset, bytes, encoding } = filter.memcmp;
        const needle = encoding === 'base58' ? base58Encoder.encode(bytes) : base64Encoder.encode(bytes);
        const start = Number(offset);
        if (start + needle.length > data.length) {
            return false;
        }
        for (let i = 0; i < needle.length; i++) {
            if (data[start + i] !== needle[i]) {
                return false;
            }
        }
        return true;
    });
}

function sliceData(data: ReadonlyUint8Array, { offset, length }: DataSlice): ReadonlyUint8Array {
    return data.slice(offset, offset + length);
}
