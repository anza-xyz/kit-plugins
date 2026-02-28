import type { LiteSVM } from '@loris-sandbox/litesvm-kit';
import {
    AccountInfoBase,
    AccountInfoWithBase64EncodedData,
    Address,
    Base64EncodedBytes,
    GetAccountInfoApi,
    GetBalanceApi,
    getBase58Decoder,
    getBase64Decoder,
    GetEpochScheduleApi,
    GetLatestBlockhashApi,
    GetMinimumBalanceForRentExemptionApi,
    GetMultipleAccountsApi,
    GetSlotApi,
    Lamports,
    lamports,
    MaybeEncodedAccount,
    PendingRpcRequest,
    RequestAirdropApi,
    Rpc,
    signature as toSignature,
    SolanaRpcResponse,
} from '@solana/kit';

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
 * import { LiteSVM } from '@loris-sandbox/litesvm-kit';
 * import { createRpcFromSvm } from '@solana/kit-plugin-litesvm';
 *
 * const svm = new LiteSVM();
 * const rpc = createRpcFromSvm(svm);
 * const { value: balance } = await rpc.getBalance(myAddress).send();
 * ```
 */
export function createRpcFromSvm(svm: LiteSVM): Rpc<LiteSvmRpcApi> {
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

    const base58Decoder = getBase58Decoder();

    return {
        getAccountInfo: (address: Address, config?: { encoding?: Encoding }) => {
            assertEncodingIsBase64(config?.encoding);
            const response = convertMaybeEncodedAccount(svm.getAccount(address));
            return wrapInPendingRpcRequest(wrapInSolanaRpcResponse(response, svm.getClock().slot));
        },
        getBalance: (address: Address) => {
            const response = svm.getBalance(address) ?? lamports(0n);
            return wrapInPendingRpcRequest(wrapInSolanaRpcResponse(response, svm.getClock().slot));
        },
        getEpochSchedule: () => {
            const schedule = svm.getEpochSchedule();
            const response = {
                firstNormalEpoch: schedule.firstNormalEpoch,
                firstNormalSlot: schedule.firstNormalSlot,
                leaderScheduleSlotOffset: schedule.leaderScheduleSlotOffset,
                slotsPerEpoch: schedule.slotsPerEpoch,
                warmup: schedule.warmup,
            };
            return wrapInPendingRpcRequest(response);
        },
        getLatestBlockhash: () => {
            const response = { blockhash: svm.latestBlockhash(), lastValidBlockHeight: 0n };
            return wrapInPendingRpcRequest(wrapInSolanaRpcResponse(response, svm.getClock().slot));
        },
        getMinimumBalanceForRentExemption: (size: bigint) => {
            const response = lamports(svm.minimumBalanceForRentExemption(size));
            return wrapInPendingRpcRequest(response);
        },
        getMultipleAccounts: (addresses: readonly Address[], config?: { encoding?: Encoding }) => {
            assertEncodingIsBase64(config?.encoding);
            const response = addresses.map(address => convertMaybeEncodedAccount(svm.getAccount(address)));
            return wrapInPendingRpcRequest(wrapInSolanaRpcResponse(response, svm.getClock().slot));
        },
        getSlot: () => {
            return wrapInPendingRpcRequest(svm.getClock().slot);
        },
        requestAirdrop: (recipientAddress: Address, amount: Lamports) => {
            const result = svm.airdrop(recipientAddress, amount);
            if (result == null) {
                throw new Error(`Airdrop to ${recipientAddress} failed: returned null`);
            }
            if (isFailedTransaction(result)) {
                throw getSolanaErrorFromLiteSvmFailure(result);
            }
            const sig = toSignature(base58Decoder.decode(result.signature()));
            return wrapInPendingRpcRequest(sig);
        },
    } as Rpc<LiteSvmRpcApi>;
}

function wrapInPendingRpcRequest<T>(response: T): PendingRpcRequest<T> {
    return { send: () => Promise.resolve(response) };
}

function wrapInSolanaRpcResponse<T>(value: T, slot: bigint): SolanaRpcResponse<T> {
    return { context: { slot }, value };
}

function assertEncodingIsBase64(encoding: Encoding | undefined) {
    if (encoding && encoding !== 'base64') {
        throw new Error(`Please use 'base64' encoding when using LiteSVM RPC. Requested encoding: ${encoding}`);
    }
}
