import { getTransferSolInstruction } from '@solana-program/system';
import {
    Address,
    address,
    appendTransactionMessageInstruction,
    createClient,
    createTransactionMessage,
    extendClient,
    flattenTransactionPlanResult,
    generateKeyPairSigner,
    getBase64EncodedWireTransaction,
    getSignatureFromTransaction,
    isSolanaError,
    lamports,
    Nonce,
    parallelTransactionPlan,
    passthroughFailedTransactionPlanExecution,
    sequentialTransactionPlan,
    setTransactionMessageFeePayer,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    singleInstructionPlan,
    singleTransactionPlan,
    SingleTransactionPlan,
    SingleTransactionPlanResult,
    SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_INSTRUCTION_DATA,
    SOLANA_ERROR__FAILED_TO_SIGN_TRANSACTIONS,
    SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
    SOLANA_ERROR__TRANSACTION_ERROR__ACCOUNT_NOT_FOUND,
    SolanaError,
    Transaction,
    TransactionModifyingSigner,
    TransactionPlanResult,
    TransactionSigner,
    TransactionWithinSizeLimit,
    TransactionWithLifetime,
    type Blockhash,
} from '@solana/kit';
import type { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from 'litesvm';
import { assert, describe, expect, it, vi } from 'vitest';

import {
    isFailedTransaction,
    litesvmConnection,
    litesvmTransactionPlanExecutor,
    litesvmTransactionPlanner,
    litesvmTransactionPlanSendingExecutor,
    litesvmTransactionPlanSigningExecutor,
    type LiteSvmSignContext,
    type LiteSvmSendContext,
} from '../src';

const MOCK_INSTRUCTION = { programAddress: '11111111111111111111111111111111' as Address };
const MOCK_BLOCKHASH = {
    blockhash: '11111111111111111111111111111111' as Blockhash,
    lastValidBlockHeight: 0n,
};

function createMockSetLifetime() {
    return vi.fn().mockImplementation(message => setTransactionMessageLifetimeUsingBlockhash(MOCK_BLOCKHASH, message));
}

describe('litesvmTransactionPlanSendingExecutor', () => {
    describe('with mocks', () => {
        it('adds sendTransaction and sendTransactions to the client', async () => {
            const payer = await generateKeyPairSigner();
            const svm = {} as LiteSVM;
            const client = createClient()
                .use(() => ({ payer, svm }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanSendingExecutor());
            expect(client).toHaveProperty('sendTransaction');
            expect(client).toHaveProperty('sendTransactions');
            expect(client).toHaveProperty('transactionPlanExecutor');
        });

        it('uses the SVM instance to send transactions', async () => {
            const payer = await generateKeyPairSigner();
            const setTransactionMessageLifetimeUsingLatestBlockhash = vi.fn().mockImplementation(<T>(m: T) => m);
            // Return a success result (no `.err` property).
            const sendTransaction = vi.fn().mockReturnValue({ signature: () => new Uint8Array(64) });
            const svm = { sendTransaction, setTransactionMessageLifetimeUsingLatestBlockhash } as unknown as LiteSVM;
            const client = createClient()
                .use(() => ({ payer, svm }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanSendingExecutor());

            const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
            const transactionPlan = await client.transactionPlanner(instructionPlan);
            const transactionPlanResult = (await client.transactionPlanExecutor(
                transactionPlan,
            )) as SingleTransactionPlanResult;
            expect(transactionPlanResult.kind).toBe('single');
            expect(setTransactionMessageLifetimeUsingLatestBlockhash).toHaveBeenCalledOnce();
            expect(sendTransaction).toHaveBeenCalledOnce();
        });

        it('includes transactionMetadata in the result context on success', async () => {
            const payer = await generateKeyPairSigner();
            const setTransactionMessageLifetimeUsingLatestBlockhash = vi.fn().mockImplementation(<T>(m: T) => m);
            const mockMetadata = { logs: () => ['log1'], signature: () => new Uint8Array(64) };
            const sendTransaction = vi.fn().mockReturnValue(mockMetadata);
            const svm = { sendTransaction, setTransactionMessageLifetimeUsingLatestBlockhash } as unknown as LiteSVM;
            const client = createClient()
                .use(() => ({ payer, svm }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanSendingExecutor());

            const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
            const transactionPlan = await client.transactionPlanner(instructionPlan);
            const result = (await client.transactionPlanExecutor(transactionPlan)) as SingleTransactionPlanResult;
            expect(result.context.transactionMetadata).toBe(mockMetadata);
        });

        it('reports the signature and the transaction in the result context on success', async () => {
            const payer = await generateKeyPairSigner();
            const setTransactionMessageLifetimeUsingLatestBlockhash = vi.fn().mockImplementation(<T>(m: T) => m);
            const sendTransaction = vi.fn().mockReturnValue({ signature: () => new Uint8Array(64) });
            const svm = { sendTransaction, setTransactionMessageLifetimeUsingLatestBlockhash } as unknown as LiteSVM;
            const client = createClient()
                .use(() => ({ payer, svm }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanSendingExecutor());

            const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
            const transactionPlan = await client.transactionPlanner(instructionPlan);
            const result = (await client.transactionPlanExecutor(transactionPlan)) as SingleTransactionPlanResult;
            expect(result.status).toBe('successful');
            expect(result.context.transaction).toBeDefined();
            expect(result.context.signature).toBe(getSignatureFromTransaction(result.context.transaction!));
        });

        it('includes transactionMetadata in the result context on failure', async () => {
            const payer = await generateKeyPairSigner();
            const setTransactionMessageLifetimeUsingLatestBlockhash = vi.fn().mockImplementation(<T>(m: T) => m);
            const mockMetadata = { err: () => 2 };
            const sendTransaction = vi.fn().mockReturnValue(mockMetadata);
            const svm = { sendTransaction, setTransactionMessageLifetimeUsingLatestBlockhash } as unknown as LiteSVM;
            const client = createClient()
                .use(() => ({ payer, svm }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanSendingExecutor());

            const transactionPlan = singleTransactionPlan(
                setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 })),
            );
            const result = (await passthroughFailedTransactionPlanExecution(
                client.transactionPlanExecutor(transactionPlan),
            )) as SingleTransactionPlanResult;
            expect(result.status).toBe('failed');
            expect(result.context.transactionMetadata).toBe(mockMetadata);
        });

        it('throws a SolanaError when the transaction fails', async () => {
            const payer = await generateKeyPairSigner();
            const setTransactionMessageLifetimeUsingLatestBlockhash = vi.fn().mockImplementation(<T>(m: T) => m);
            // Return a failed result with a fieldless error (AccountNotFound = 2).
            const sendTransaction = vi.fn().mockReturnValue({ err: () => 2 });
            const svm = { sendTransaction, setTransactionMessageLifetimeUsingLatestBlockhash } as unknown as LiteSVM;
            const client = createClient()
                .use(() => ({ payer, svm }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanSendingExecutor());

            const transactionPlan = singleTransactionPlan(
                setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 })),
            );
            try {
                await client.transactionPlanExecutor(transactionPlan);
                expect.unreachable();
            } catch (error) {
                expect(isSolanaError(error, SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN)).toBe(
                    true,
                );
                expect(
                    isSolanaError((error as SolanaError).cause, SOLANA_ERROR__TRANSACTION_ERROR__ACCOUNT_NOT_FOUND),
                ).toBe(true);
            }
        });

        it('throws a SolanaError for instruction errors', async () => {
            const payer = await generateKeyPairSigner();
            const setTransactionMessageLifetimeUsingLatestBlockhash = vi.fn().mockImplementation(<T>(m: T) => m);
            // Return a failed result with an instruction error.
            const instructionError = {
                constructor: { name: 'TransactionErrorInstructionError' },
                err: () => 2, // InstructionErrorFieldless.InvalidInstructionData
                index: 0,
            };
            const sendTransaction = vi.fn().mockReturnValue({ err: () => instructionError });
            const svm = { sendTransaction, setTransactionMessageLifetimeUsingLatestBlockhash } as unknown as LiteSVM;
            const client = createClient()
                .use(() => ({ payer, svm }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanSendingExecutor());

            const transactionPlan = singleTransactionPlan(
                setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 })),
            );
            try {
                await client.transactionPlanExecutor(transactionPlan);
                expect.unreachable();
            } catch (error) {
                expect(isSolanaError(error, SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN)).toBe(
                    true,
                );
                expect(
                    isSolanaError(
                        (error as SolanaError).cause,
                        SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_INSTRUCTION_DATA,
                    ),
                ).toBe(true);
            }
        });

        it('requires an svm instance on the client', () => {
            // @ts-expect-error Missing svm instance on the client.
            expect(() => createClient().use(litesvmTransactionPlanSendingExecutor())).toThrow();
        });
    });

    describe('with a real LiteSVM instance', () => {
        if (!__NODEJS__) {
            it('is skipped in non-Node environments', () => {
                expect(true).toBe(true);
            });
            return;
        }

        it('sends a real transaction successfully', async () => {
            const payer = await generateKeyPairSigner();
            const client = createClient()
                .use(litesvmConnection())
                .use(client => extendClient(client, { payer }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanSendingExecutor());
            client.svm.airdrop(payer.address, lamports(1_000_000_000n));

            const transactionPlan = singleTransactionPlan(
                setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 })),
            );
            const result = (await client.transactionPlanExecutor(transactionPlan)) as SingleTransactionPlanResult;
            expect(result.kind).toBe('single');
        });

        it('successfully executes a planned instruction plan', async () => {
            const payer = await generateKeyPairSigner();
            const destination = await generateKeyPairSigner();
            const client = createClient()
                .use(litesvmConnection())
                .use(client => extendClient(client, { payer }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanSendingExecutor());
            client.svm.airdrop(payer.address, lamports(1_000_000_000n)); // 1 SOL

            const instruction = getTransferSolInstruction({
                amount: lamports(100_000_000n), // 0.1 SOL
                destination: destination.address,
                source: payer,
            });
            const instructionPlan = singleInstructionPlan(instruction);
            const transactionPlan = await client.transactionPlanner(instructionPlan);
            const result = (await client.transactionPlanExecutor(transactionPlan)) as SingleTransactionPlanResult;
            expect(result.kind).toBe('single');
        });

        it('plans and executes a version 1 transaction', async () => {
            const payer = await generateKeyPairSigner();
            const destination = await generateKeyPairSigner();
            const client = createClient()
                .use(litesvmConnection())
                .use(client => extendClient(client, { payer }))
                .use(litesvmTransactionPlanner({ version: 1 }))
                .use(litesvmTransactionPlanSendingExecutor());
            client.svm.airdrop(payer.address, lamports(1_000_000_000n)); // 1 SOL

            const instruction = getTransferSolInstruction({
                amount: lamports(100_000_000n), // 0.1 SOL
                destination: destination.address,
                source: payer,
            });
            const instructionPlan = singleInstructionPlan(instruction);
            const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
            expect(transactionPlan.message.version).toBe(1);
            const result = (await client.transactionPlanExecutor(transactionPlan)) as SingleTransactionPlanResult;
            expect(result.status).toBe('successful');
            expect(client.svm.getBalance(destination.address)).toBe(lamports(100_000_000n));
        });

        it('throws a SolanaError when a real transaction fails with an instruction error', async () => {
            const payer = await generateKeyPairSigner();
            const client = createClient()
                .use(litesvmConnection())
                .use(client => extendClient(client, { payer }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanSendingExecutor());
            client.svm.airdrop(payer.address, lamports(1_000_000_000n));

            // Send an instruction with invalid data to the system program.
            const transactionMessage = appendTransactionMessageInstruction(
                {
                    accounts: [{ address: payer.address, role: 3 as const }],
                    data: new Uint8Array([255, 255, 255, 255]),
                    programAddress: '11111111111111111111111111111111' as Address,
                },
                setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 })),
            );
            const transactionPlan = singleTransactionPlan(transactionMessage);
            try {
                await client.transactionPlanExecutor(transactionPlan);
                expect.unreachable();
            } catch (error) {
                expect(isSolanaError(error, SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN)).toBe(
                    true,
                );
                expect(
                    isSolanaError(
                        (error as SolanaError).cause,
                        SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_INSTRUCTION_DATA,
                    ),
                ).toBe(true);
            }
        });

        it('throws a SolanaError when the payer has no account', async () => {
            const payer = await generateKeyPairSigner();
            const client = createClient()
                .use(litesvmConnection())
                .use(client => extendClient(client, { payer }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanSendingExecutor());
            // Do NOT airdrop — payer account doesn't exist.

            const transactionPlan = singleTransactionPlan(
                setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 })),
            );
            try {
                await client.transactionPlanExecutor(transactionPlan);
                expect.unreachable();
            } catch (error) {
                expect(isSolanaError(error, SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN)).toBe(
                    true,
                );
                expect(
                    isSolanaError((error as SolanaError).cause, SOLANA_ERROR__TRANSACTION_ERROR__ACCOUNT_NOT_FOUND),
                ).toBe(true);
            }
        });

        it('includes transactionMetadata with expected methods on success', async () => {
            const payer = await generateKeyPairSigner();
            const client = createClient()
                .use(litesvmConnection())
                .use(client => extendClient(client, { payer }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanSendingExecutor());
            client.svm.airdrop(payer.address, lamports(1_000_000_000n));

            const transactionPlan = singleTransactionPlan(
                setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 })),
            );
            const result = (await client.transactionPlanExecutor(
                transactionPlan,
            )) as SingleTransactionPlanResult<LiteSvmSendContext>;
            const metadata = result.context.transactionMetadata as TransactionMetadata;
            expect(metadata).toBeDefined();
            expect(metadata.logs()).toEqual(expect.any(Array));
            expect(metadata.computeUnitsConsumed()).toEqual(expect.any(BigInt));
            expect(metadata.signature()).toEqual(expect.any(Uint8Array));
        });

        it('includes transactionMetadata in the result context on failure', async () => {
            const payer = await generateKeyPairSigner();
            const client = createClient()
                .use(litesvmConnection())
                .use(client => extendClient(client, { payer }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanSendingExecutor());
            // Do NOT airdrop — payer account doesn't exist.

            const transactionPlan = singleTransactionPlan(
                setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 })),
            );
            const result = (await passthroughFailedTransactionPlanExecution(
                client.transactionPlanExecutor(transactionPlan),
            )) as SingleTransactionPlanResult<LiteSvmSendContext>;
            expect(result.status).toBe('failed');
            const metadata = result.context.transactionMetadata as FailedTransactionMetadata;
            expect(metadata).toBeDefined();
            expect(metadata.err()).toBeDefined();
        });
    });
});

describe('litesvmTransactionPlanSigningExecutor', () => {
    it('adds signing functions without adding sending functions', async () => {
        const payer = await generateKeyPairSigner();
        const svm = {} as LiteSVM;
        const client = createClient()
            .use(() => ({ payer, svm }))
            .use(litesvmTransactionPlanner())
            .use(litesvmTransactionPlanSigningExecutor());

        expect(client.signTransaction).toBeTypeOf('function');
        expect(client.signTransactions).toBeTypeOf('function');
        expect(client).not.toHaveProperty('sendTransaction');
        expect(client).not.toHaveProperty('transactionPlanExecutor');
    });

    it('partially signs and simulates a fully signed transaction without sending it', async () => {
        const payer = await generateKeyPairSigner();
        const setTransactionMessageLifetimeUsingLatestBlockhash = createMockSetLifetime();
        const transactionMetadata = { logs: () => ['simulated'] } as TransactionMetadata;
        const simulateTransaction = vi.fn().mockReturnValue({ meta: () => transactionMetadata });
        const sendTransaction = vi.fn();
        const svm = {
            sendTransaction,
            setTransactionMessageLifetimeUsingLatestBlockhash,
            simulateTransaction,
        } as unknown as LiteSVM;
        const client = createClient()
            .use(() => ({ payer, svm }))
            .use(litesvmTransactionPlanner())
            .use(litesvmTransactionPlanSigningExecutor());

        const result = await client.signTransaction(singleInstructionPlan(MOCK_INSTRUCTION));

        expect(result.context.message.lifetimeConstraint).toEqual(MOCK_BLOCKHASH);
        expect(result.context.transaction).toBeDefined();
        expect(result.context.transactionBase64).toBe(getBase64EncodedWireTransaction(result.context.transaction));
        expect(result.context.signature).toBe(getSignatureFromTransaction(result.context.transaction));
        expect(result.context.transactionMetadata).toBe(transactionMetadata);
        expect(setTransactionMessageLifetimeUsingLatestBlockhash).toHaveBeenCalledOnce();
        expect(simulateTransaction).toHaveBeenCalledExactlyOnceWith(result.context.transaction);
        expect(sendTransaction).not.toHaveBeenCalled();
    });

    it('returns a partial transaction without simulation metadata when signatures are missing', async () => {
        const payer = await generateKeyPairSigner();
        const unsignedFeePayer = address('11111111111111111111111111111111');
        const simulateTransaction = vi.fn();
        const svm = {
            setTransactionMessageLifetimeUsingLatestBlockhash: createMockSetLifetime(),
            simulateTransaction,
        } as unknown as LiteSVM;
        const client = createClient()
            .use(() => ({ payer, svm }))
            .use(litesvmTransactionPlanner())
            .use(litesvmTransactionPlanSigningExecutor());
        const message = setTransactionMessageFeePayer(unsignedFeePayer, createTransactionMessage({ version: 0 }));

        const result = await client.signTransaction(message);

        expect(result.context.transaction.signatures[unsignedFeePayer]).toBeNull();
        expect(result.context.transactionBase64).toBe(getBase64EncodedWireTransaction(result.context.transaction));
        expect(result.context.signature).toBeUndefined();
        expect(result.context.transactionMetadata).toBeUndefined();
        expect(result.context).not.toHaveProperty('transactionMetadata');
        expect(simulateTransaction).not.toHaveBeenCalled();
    });

    it('retains failed simulation metadata in a successful result context', async () => {
        const payer = await generateKeyPairSigner();
        const transactionMetadata = { err: () => 2 } as FailedTransactionMetadata;
        const svm = {
            setTransactionMessageLifetimeUsingLatestBlockhash: createMockSetLifetime(),
            simulateTransaction: vi.fn().mockReturnValue(transactionMetadata),
        } as unknown as LiteSVM;
        const client = createClient()
            .use(() => ({ payer, svm }))
            .use(litesvmTransactionPlanner())
            .use(litesvmTransactionPlanSigningExecutor());
        const message = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));

        const result = await client.signTransaction(message);

        expect(result.context.transactionMetadata).toBe(transactionMetadata);
    });

    it('does not fail sequential plans when their simulations fail', async () => {
        const payer = await generateKeyPairSigner();
        const transactionMetadata = { err: () => 2 } as FailedTransactionMetadata;
        const svm = {
            setTransactionMessageLifetimeUsingLatestBlockhash: createMockSetLifetime(),
            simulateTransaction: vi.fn().mockReturnValue(transactionMetadata),
        } as unknown as LiteSVM;
        const client = createClient()
            .use(() => ({ payer, svm }))
            .use(litesvmTransactionPlanner())
            .use(litesvmTransactionPlanSigningExecutor());
        const message = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));

        const result = await client.signTransactions(sequentialTransactionPlan([message, message]));
        const leaves = flattenTransactionPlanResult(result);

        expect(leaves.map(leaf => leaf.status)).toEqual(['successful', 'successful']);
        expect(leaves.map(leaf => leaf.context.transactionMetadata)).toEqual([
            transactionMetadata,
            transactionMetadata,
        ]);
    });

    it('preserves a lifetime changed by a transaction-modifying signer', async () => {
        const nonceAccountAddress = address('11111111111111111111111111111111');
        const lifetimeConstraint = {
            nonce: '11111111111111111111111111111111' as Nonce,
            nonceAccountAddress,
        };
        const modifyingPayer = {
            address: nonceAccountAddress,
            modifyAndSignTransactions: vi.fn(
                (transactions: readonly (Transaction | (Transaction & TransactionWithLifetime))[]) =>
                    Promise.resolve(
                        transactions.map(
                            transaction =>
                                ({
                                    ...transaction,
                                    lifetimeConstraint,
                                }) as Transaction & TransactionWithinSizeLimit & TransactionWithLifetime,
                        ),
                    ),
            ),
        } satisfies TransactionModifyingSigner;
        const svm = {
            setTransactionMessageLifetimeUsingLatestBlockhash: createMockSetLifetime(),
            simulateTransaction: vi.fn(),
        } as unknown as LiteSVM;
        const client = createClient()
            .use(() => ({ payer: modifyingPayer, svm }))
            .use(litesvmTransactionPlanner())
            .use(litesvmTransactionPlanSigningExecutor());
        const message = setTransactionMessageFeePayerSigner(modifyingPayer, createTransactionMessage({ version: 0 }));

        const result = await client.signTransaction(message);

        expect(result.context.message.lifetimeConstraint).toEqual(MOCK_BLOCKHASH);
        expect(result.context.transaction.lifetimeConstraint).toEqual(lifetimeConstraint);
        expect(modifyingPayer.modifyAndSignTransactions).toHaveBeenCalledOnce();
    });

    it('attempts every sequential leaf and reports successful siblings when one signer fails', async () => {
        const payer = await generateKeyPairSigner();
        const signingError = new Error('signing failed');
        const failingPayer = {
            address: address('11111111111111111111111111111111'),
            signTransactions: vi.fn().mockRejectedValue(signingError),
        } satisfies TransactionSigner;
        const svm = {
            setTransactionMessageLifetimeUsingLatestBlockhash: createMockSetLifetime(),
            simulateTransaction: vi.fn().mockReturnValue({ meta: () => ({}) }),
        } as unknown as LiteSVM;
        const client = createClient()
            .use(() => ({ payer, svm }))
            .use(litesvmTransactionPlanner())
            .use(litesvmTransactionPlanSigningExecutor());
        const failingMessage = setTransactionMessageFeePayerSigner(
            failingPayer,
            createTransactionMessage({ version: 0 }),
        );
        const successfulMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
        const transactionPlan = sequentialTransactionPlan([failingMessage, successfulMessage]);

        const error = await client.signTransactions(transactionPlan).catch((error: unknown) => error);

        assert(isSolanaError(error, SOLANA_ERROR__FAILED_TO_SIGN_TRANSACTIONS));
        const result = (error.context as { transactionPlanResult: TransactionPlanResult<LiteSvmSignContext> })
            .transactionPlanResult;
        expect(flattenTransactionPlanResult(result).map(leaf => leaf.status)).toEqual(['failed', 'successful']);
        expect(failingPayer.signTransactions).toHaveBeenCalledOnce();
    });

    it('preserves the context recorded before a signer failure on the failed result', async () => {
        const signingError = new Error('signing failed');
        const failingPayer = {
            address: address('11111111111111111111111111111111'),
            signTransactions: vi.fn().mockRejectedValue(signingError),
        } satisfies TransactionSigner;
        const svm = {
            setTransactionMessageLifetimeUsingLatestBlockhash: createMockSetLifetime(),
            simulateTransaction: vi.fn(),
        } as unknown as LiteSVM;
        const client = createClient()
            .use(() => ({ payer: failingPayer, svm }))
            .use(litesvmTransactionPlanner())
            .use(litesvmTransactionPlanSigningExecutor());
        const message = setTransactionMessageFeePayerSigner(failingPayer, createTransactionMessage({ version: 0 }));

        const error = await client.signTransactions(message).catch((error: unknown) => error);

        assert(isSolanaError(error, SOLANA_ERROR__FAILED_TO_SIGN_TRANSACTIONS));
        const result = (error.context as { transactionPlanResult: TransactionPlanResult<LiteSvmSignContext> })
            .transactionPlanResult;
        const [failedLeaf] = flattenTransactionPlanResult(result);
        assert(failedLeaf.status === 'failed');
        expect(failedLeaf.error).toBe(signingError);
        expect(failedLeaf.context.message?.lifetimeConstraint).toEqual(MOCK_BLOCKHASH);
        expect(failedLeaf.context.transaction).toBeUndefined();
        expect(failedLeaf.context.transactionBase64).toBeUndefined();
        expect(failedLeaf.context.signature).toBeUndefined();
    });

    it('preserves nested transaction plan shape while signing every leaf', async () => {
        const payer = await generateKeyPairSigner();
        const svm = {
            setTransactionMessageLifetimeUsingLatestBlockhash: createMockSetLifetime(),
            simulateTransaction: vi.fn().mockReturnValue({ meta: () => ({}) }),
        } as unknown as LiteSVM;
        const client = createClient()
            .use(() => ({ payer, svm }))
            .use(litesvmTransactionPlanner())
            .use(litesvmTransactionPlanSigningExecutor());
        const message = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
        const transactionPlan = parallelTransactionPlan([
            sequentialTransactionPlan([message, message]),
            sequentialTransactionPlan([message, message]),
        ]);

        const result = await client.signTransactions(transactionPlan);

        expect(result.kind).toBe('parallel');
        expect(flattenTransactionPlanResult(result)).toHaveLength(4);
        expect(flattenTransactionPlanResult(result).every(leaf => leaf.status === 'successful')).toBe(true);
    });

    if (__NODEJS__) {
        it('simulates a real fully signed transaction without committing state', async () => {
            const payer = await generateKeyPairSigner();
            const destination = await generateKeyPairSigner();
            const client = createClient()
                .use(litesvmConnection())
                .use(client => extendClient(client, { payer }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanSigningExecutor());
            client.svm.airdrop(payer.address, lamports(1_000_000_000n));
            const instruction = getTransferSolInstruction({
                amount: lamports(100_000_000n),
                destination: destination.address,
                source: payer,
            });

            const result = await client.signTransaction(instruction);

            expect(result.context.transactionMetadata).toBeDefined();
            expect(isFailedTransaction(result.context.transactionMetadata!)).toBe(false);
            expect(client.svm.getBalance(destination.address)).toBeNull();
        });
    }

    it('requires an svm instance on the client', async () => {
        const payer = await generateKeyPairSigner();
        expect(() =>
            createClient()
                .use(() => ({ payer }))
                .use(litesvmTransactionPlanner())
                // @ts-expect-error Missing svm on the client.
                .use(litesvmTransactionPlanSigningExecutor()),
        ).toThrow(/A LiteSVM instance is required/);
    });
});

describe('litesvmTransactionPlanExecutor', () => {
    it('sets the deprecated transactionPlanExecutor field without requiring a planner', () => {
        const svm = { sendTransaction: vi.fn() } as unknown as LiteSVM;
        const client = createClient()
            .use(() => ({ svm }))
            .use(litesvmTransactionPlanExecutor());
        expect(client).toHaveProperty('transactionPlanExecutor');
        expect(client).not.toHaveProperty('sendTransaction');
        expect(client).not.toHaveProperty('sendTransactions');
    });

    it('requires an svm instance on the client', () => {
        // @ts-expect-error Missing svm on the client.
        expect(() => createClient().use(litesvmTransactionPlanExecutor())).toThrow(/A LiteSVM instance is required/);
    });
});
