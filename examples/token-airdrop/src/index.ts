import {
    generateKeyPairSigner,
    getSolanaErrorFromTransactionError,
    isSolanaError,
    parallelInstructionPlan,
    sequentialInstructionPlan,
    SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
    SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_COMPUTE_LIMIT,
    summarizeTransactionPlanResult,
    type TransactionError,
    type TransactionPlanResult,
} from '@solana/kit';
import { createDefaultLocalhostRpcClient } from '@solana/kit-plugins';
import { getSystemErrorMessage, isSystemError } from '@solana-program/system';
import {
    getCreateMintInstructionPlan,
    getMintToATAInstructionPlanAsync,
    getTokenErrorMessage,
    isTokenError,
} from '@solana-program/token';

const client = await createDefaultLocalhostRpcClient();
const { payer } = client;

// Generate 100 random recipient addresses
const destinationAddresses = await Promise.all(
    Array.from({ length: 100 }, async () => {
        const signer = await generateKeyPairSigner();
        return signer.address;
    }),
);

// We will create a new token mint for this airdrop.
// Note that the new mint must sign the transaction that initializes it, so we use a signer.
const tokenMint = await generateKeyPairSigner();

const instructionPlan = sequentialInstructionPlan([
    /**
     * This helper returns an instruction plan including all the instructions necessary to create a mint.
     * It is itself a `SequentialInstructionPlan`.
     */
    getCreateMintInstructionPlan({
        decimals: 6,
        mintAuthority: payer.address,
        newMint: tokenMint,
        payer,
    }),
    // Here we mint to all destination addresses in parallel
    parallelInstructionPlan(
        /**
         * When we mint tokens for a destination address, we mint them to the associated token account (ATA)
         * for that address. This helper returns an instruction plan to mint to the ATA, creating it on-chain
         * first if it does not already exist.
         *
         * It is async because it first derives the address of the ATA for us.
         * We can do this in parallel for all destination addresses, using `Promise.all`.
         *
         * We then pass these instruction plans to `parallelInstructionPlan`, as we will later execute these
         * instructions for all destination addresses in parallel.
         *
         * Note that again the returned instruction plan is itself a `SequentialInstructionPlan`.
         */
        await Promise.all(
            destinationAddresses.map(address => {
                return getMintToATAInstructionPlanAsync({
                    amount: 1_000_000_000n,
                    // 1,000 tokens, with 6 decimals
                    decimals: 6,
                    mint: tokenMint.address,
                    mintAuthority: payer, // Simulate a failure on the 81st address
                    owner: address,
                    payer,
                });
            }),
        ),
    ),
]);

try {
    const result = await client.send(instructionPlan);

    const summary = summarizeTransactionPlanResult(result);
    if (summary.successful) {
        console.log(`Airdropped tokens to ${destinationAddresses.length} addresses from ${payer.address}`);
        for (const transaction of summary.successfulTransactions) {
            const { signature } = transaction.status;
            console.log(
                `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899}`,
            );
        }
    } else {
        const successfulTransactions = summary.successfulTransactions.length;
        if (summary.failedTransactions.length > 0) {
            console.error(`Airdrop failed after ${successfulTransactions} successful transactions`);
        } else if (summary.canceledTransactions.length > 0) {
            console.error(`Airdrop was cancelled after ${successfulTransactions} successful transactions`);
        }
    }
} catch (e) {
    if (isSolanaError(e, SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN)) {
        const transactionPlanResult = e.context.transactionPlanResult as TransactionPlanResult;
        const summary = summarizeTransactionPlanResult(transactionPlanResult);
        const successfulTransactions = summary.successfulTransactions.length;

        if (summary.failedTransactions.length > 0) {
            console.error(`Airdrop failed after ${successfulTransactions} successful transactions`);
        } else if (summary.canceledTransactions.length > 0) {
            console.error(`Airdrop was cancelled after ${successfulTransactions} successful transactions`);
        }

        if (summary.failedTransactions.length > 0) {
            for (const failure of summary.failedTransactions) {
                const error = failure.status.error;

                if (isSolanaError(error, SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_COMPUTE_LIMIT)) {
                    // Failure from a nested simulation error, we can access the transaction error
                    const transactionMessage = failure.message;

                    const transactionError = error.cause as TransactionError;
                    const nestedError = getSolanaErrorFromTransactionError(transactionError);

                    if (isSystemError(nestedError, transactionMessage)) {
                        console.error(getSystemErrorMessage(nestedError.context.code), {
                            instruction: transactionMessage.instructions[nestedError.context.index],
                        });
                    }
                    if (isTokenError(nestedError, transactionMessage)) {
                        console.error(getTokenErrorMessage(nestedError.context.code), {
                            instruction: transactionMessage.instructions[nestedError.context.index],
                        });
                    }
                } else {
                    throw e;
                }
            }
            process.exit(1);
        }

        throw e;
    }
}
