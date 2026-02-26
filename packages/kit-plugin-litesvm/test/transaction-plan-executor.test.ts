import type { LiteSVM } from '@loris-sandbox/litesvm-kit';
import {
    Address,
    appendTransactionMessageInstruction,
    createEmptyClient,
    createTransactionMessage,
    generateKeyPairSigner,
    isSolanaError,
    lamports,
    setTransactionMessageFeePayerSigner,
    singleInstructionPlan,
    singleTransactionPlan,
    SingleTransactionPlanResult,
    SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_INSTRUCTION_DATA,
    SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
    SOLANA_ERROR__TRANSACTION_ERROR__ACCOUNT_NOT_FOUND,
    SolanaError,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import { describe, expect, it, vi } from 'vitest';

import { litesvm, litesvmTransactionPlanExecutor, litesvmTransactionPlanner } from '../src';

const MOCK_BLOCKHASH = { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 0n };
const MOCK_INSTRUCTION = {
    programAddress: '11111111111111111111111111111111' as Address,
};

describe('litesvmTransactionPlanExecutor', () => {
    describe('with mocks', () => {
        it('provides a transactionPlanExecutor on the client', () => {
            const svm = {} as LiteSVM;
            const client = createEmptyClient()
                .use(() => ({ svm }))
                .use(litesvmTransactionPlanExecutor());
            expect(client).toHaveProperty('transactionPlanExecutor');
        });

        it('uses the SVM instance to send transactions', async () => {
            const payer = await generateKeyPairSigner();
            const latestBlockhashLifetime = vi.fn().mockReturnValueOnce(MOCK_BLOCKHASH);
            // Return a success result (no `.err` property).
            const sendTransaction = vi.fn().mockReturnValue({ signature: () => new Uint8Array(64) });
            const svm = { latestBlockhashLifetime, sendTransaction } as unknown as LiteSVM;
            const client = createEmptyClient()
                .use(() => ({ payer, svm }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanExecutor());

            const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
            const transactionPlan = await client.transactionPlanner(instructionPlan);
            const transactionPlanResult = (await client.transactionPlanExecutor(
                transactionPlan,
            )) as SingleTransactionPlanResult;
            expect(transactionPlanResult.kind).toBe('single');
            expect(latestBlockhashLifetime).toHaveBeenCalledOnce();
            expect(sendTransaction).toHaveBeenCalledOnce();
        });

        it('throws a SolanaError when the transaction fails', async () => {
            const payer = await generateKeyPairSigner();
            const latestBlockhashLifetime = vi.fn().mockReturnValueOnce(MOCK_BLOCKHASH);
            // Return a failed result with a fieldless error (AccountNotFound = 2).
            const sendTransaction = vi.fn().mockReturnValue({ err: () => 2 });
            const svm = { latestBlockhashLifetime, sendTransaction } as unknown as LiteSVM;
            const client = createEmptyClient()
                .use(() => ({ payer, svm }))
                .use(litesvmTransactionPlanExecutor());

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
            const latestBlockhashLifetime = vi.fn().mockReturnValueOnce(MOCK_BLOCKHASH);
            // Return a failed result with an instruction error.
            const instructionError = {
                constructor: { name: 'TransactionErrorInstructionError' },
                err: () => 2, // InstructionErrorFieldless.InvalidInstructionData
                index: 0,
            };
            const sendTransaction = vi.fn().mockReturnValue({ err: () => instructionError });
            const svm = { latestBlockhashLifetime, sendTransaction } as unknown as LiteSVM;
            const client = createEmptyClient()
                .use(() => ({ payer, svm }))
                .use(litesvmTransactionPlanExecutor());

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
            expect(() => createEmptyClient().use(litesvmTransactionPlanExecutor())).toThrow();
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
            const client = createEmptyClient()
                .use(litesvm())
                .use(client => ({ ...client, payer }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanExecutor());
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
            const client = createEmptyClient()
                .use(litesvm())
                .use(client => ({ ...client, payer }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanExecutor());
            client.svm.airdrop(payer.address, lamports(1_000_000_000n));

            const instruction = getTransferSolInstruction({
                amount: lamports(1_000n),
                destination: destination.address,
                source: payer,
            });
            const instructionPlan = singleInstructionPlan(instruction);
            const transactionPlan = await client.transactionPlanner(instructionPlan);
            const result = (await client.transactionPlanExecutor(transactionPlan)) as SingleTransactionPlanResult;
            expect(result.kind).toBe('single');
        });

        it('throws a SolanaError when a real transaction fails with an instruction error', async () => {
            const payer = await generateKeyPairSigner();
            const client = createEmptyClient()
                .use(litesvm())
                .use(client => ({ ...client, payer }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanExecutor());
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
            const client = createEmptyClient()
                .use(litesvm())
                .use(client => ({ ...client, payer }))
                .use(litesvmTransactionPlanner())
                .use(litesvmTransactionPlanExecutor());
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
    });
});
