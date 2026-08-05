import {
    AccountRole,
    Address,
    appendTransactionMessageInstruction,
    createTransactionMessage,
    generateKeyPairSigner,
    getTransactionMessageComputeUnitLimit,
    GetLatestBlockhashApi,
    isFullySignedTransaction,
    pipe,
    Rpc,
    setTransactionMessageFeePayerSigner,
    SimulateTransactionApi,
    singleTransactionPlan,
} from '@solana/kit';
import { assert, describe, expect, it, vi, type Mock } from 'vitest';

import { createRpcTransactionSigningExecutor } from '../src';

const MOCK_BLOCKHASH = { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 0n };

// `createRpcTransactionSigningExecutor`'s config only requires `GetLatestBlockhashApi` and
// `SimulateTransactionApi`, so the mock RPC below implements exactly those two, plus a
// `sendTransaction` spy purely so tests can assert it was never reached for.
function createMockRpc(): Rpc<GetLatestBlockhashApi & SimulateTransactionApi> & { sendTransaction: Mock } {
    return {
        getLatestBlockhash: () => ({ send: vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH }) }),
        sendTransaction: vi.fn(),
        simulateTransaction: () => ({ send: vi.fn().mockResolvedValue({ value: { unitsConsumed: 42n } }) }),
    } as unknown as Rpc<GetLatestBlockhashApi & SimulateTransactionApi> & { sendTransaction: Mock };
}

async function createMockMessage() {
    const payer = await generateKeyPairSigner();
    return setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
}

describe('createRpcTransactionSigningExecutor', () => {
    it('signs the transaction without sending it', async () => {
        const rpc = createMockRpc();
        const executor = createRpcTransactionSigningExecutor({
            estimateResourceLimits: false,
            rpc,
        });

        const message = await createMockMessage();
        const result = await executor(singleTransactionPlan(message));

        assert(result.kind === 'single' && result.status === 'successful');
        expect(result.context.transaction).toBeDefined();
        expect(result.context.signature).toBeDefined();
        // The executor's config type doesn't even include `SendTransactionApi`, but nothing
        // stops a runtime caller from reaching for it anyway, so we spy on it directly.
        expect(rpc.sendTransaction).not.toHaveBeenCalled();
    });

    it('signs partially rather than fully, leaving a signature the executor cannot produce unset', async () => {
        // A message with an account marked as a signer but with no `TransactionSigner`
        // attached: `partiallySignTransactionMessageWithSigners` leaves its signature slot
        // `null`, whereas `signTransactionMessageWithSigners` would throw, because it asserts
        // the result is fully signed. A regression that swapped in the full-signing function
        // would fail this test (verified manually — see the task report).
        const payer = await generateKeyPairSigner();
        const unresolvedSigner = await generateKeyPairSigner();
        const message = pipe(
            createTransactionMessage({ version: 0 }),
            tx => setTransactionMessageFeePayerSigner(payer, tx),
            tx =>
                appendTransactionMessageInstruction(
                    {
                        accounts: [{ address: unresolvedSigner.address, role: AccountRole.READONLY_SIGNER }],
                        programAddress: '11111111111111111111111111111111' as Address,
                    },
                    tx,
                ),
        );

        const executor = createRpcTransactionSigningExecutor({
            estimateResourceLimits: false,
            rpc: createMockRpc(),
        });
        const result = await executor(singleTransactionPlan(message));

        assert(result.kind === 'single' && result.status === 'successful');
        const transaction = result.context.transaction!;
        expect(transaction.signatures[unresolvedSigner.address]).toBeNull();
        expect(isFullySignedTransaction(transaction)).toBe(false);
    });

    it('records the lifetime-assigned message on the context', async () => {
        const executor = createRpcTransactionSigningExecutor({
            estimateResourceLimits: false,
            rpc: createMockRpc(),
        });

        const message = await createMockMessage();
        const result = await executor(singleTransactionPlan(message));

        assert(result.kind === 'single' && result.status === 'successful');
        expect(result.context.message).toHaveProperty('lifetimeConstraint');
    });

    it('estimates and sets resource limits by simulating when enabled', async () => {
        // Neither test above exercises estimation: both disable it. This one leaves
        // `estimateResourceLimits` at its default (`true`) so the mock's `simulateTransaction`
        // is actually invoked.
        const executor = createRpcTransactionSigningExecutor({ rpc: createMockRpc() });

        const message = await createMockMessage();
        const result = await executor(singleTransactionPlan(message));

        assert(result.kind === 'single' && result.status === 'successful');
        // The mock simulation reports 42 consumed units; the default buffer for such a small
        // estimate is the flat 300-unit floor, so 42 + 300 = 342.
        expect(getTransactionMessageComputeUnitLimit(result.context.message!)).toBe(342);
    });

    it('does not require rpcSubscriptions', () => {
        // Signing never broadcasts, so the executor is constructible from an RPC alone.
        expect(() => createRpcTransactionSigningExecutor({ rpc: createMockRpc() })).not.toThrow();
    });
});
