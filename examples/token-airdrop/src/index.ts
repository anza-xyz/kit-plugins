import {
    flattenTransactionPlanResult,
    generateKeyPairSigner,
    isInstructionWithData,
    parallelInstructionPlan,
    passthroughFailedTransactionPlanExecution,
    sequentialInstructionPlan,
} from '@solana/kit';
import { createLocalClient } from '@solana/kit-client-rpc';
import {
    getSystemErrorMessage,
    isSystemError,
    parseSystemInstruction,
    SystemInstruction,
} from '@solana-program/system';
import {
    getCreateMintInstructionPlan,
    getMintToATAInstructionPlanAsync,
    getTokenErrorMessage,
    isTokenError,
    parseTokenInstruction,
    TokenInstruction,
} from '@solana-program/token';

// Use `pnpm start --fail` to make the example fail and see error handling
const shouldFail = process.argv.includes('--fail');

const client = await createLocalClient();
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

// When we use --fail, we will use a wrong mint authority for one of the transactions, which will make that transaction fail.
const wrongMintAuthority = await generateKeyPairSigner();

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
            destinationAddresses.map(async (address, index) => {
                return await getMintToATAInstructionPlanAsync({
                    amount: 1_000n * 10n ** 6n,
                    // 1,000 tokens, with 6 decimals
                    decimals: 6,
                    mint: tokenMint.address,
                    // Simulate a failure on the 51st address when --fail is used
                    mintAuthority: index === 50 && shouldFail ? wrongMintAuthority : payer,
                    owner: address,
                    payer,
                });
            }),
        ),
    ),
]);

// We send the transaction plan, and catch a `SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN` error using `passthroughFailedTransactionPlanExecution`
// This means that if there is an error in some transactions, we still get the full transaction plan result back
const result = await passthroughFailedTransactionPlanExecution(client.sendTransactions(instructionPlan));

// Flatten the transaction plan result to get an array of all individual transaction results
const results = flattenTransactionPlanResult(result);

console.log(`Airdrop to ${destinationAddresses.length} addresses from ${payer.address} complete.`);
results.forEach((r, i) => {
    if (r.status === 'successful') {
        // For a successful status we are guaranteed to have a signature
        const signature = r.context.signature;
        console.log(
            i,
            `Transaction successful: https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent('http://127.0.0.1:8899')}`,
        );
    } else if (r.status === 'canceled') {
        if (r.context.signature) {
            console.error(
                i,
                `Transaction canceled: https://explorer.solana.com/tx/${r.context.signature}?cluster=custom&customUrl=${encodeURIComponent('http://127.0.0.1:8899')}`,
            );
        } else {
            console.error(i, 'Transaction canceled before being signed');
        }
    } else if (r.status === 'failed') {
        const signature = r.context.signature;
        if (signature) {
            console.error(
                i,
                `Transaction failed: https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent('http://127.0.0.1:8899')}`,
            );
        } else {
            console.error(i, 'Transaction failed before being signed');
        }

        const transactionMessage = r.context.message ?? r.plannedMessage;
        const error = r.error;

        if (isSystemError(error, transactionMessage)) {
            const failedInstruction = transactionMessage.instructions[error.context.index];
            console.error(`System Program Error: ${getSystemErrorMessage(error.context.code)}`);

            if (isInstructionWithData(failedInstruction)) {
                const parsedInstruction = parseSystemInstruction(failedInstruction);
                console.error({
                    ...parsedInstruction,
                    instructionType: SystemInstruction[parsedInstruction.instructionType],
                });
            }
        }

        if (isTokenError(error, transactionMessage)) {
            const failedInstruction = transactionMessage.instructions[error.context.index];
            console.error(`Token Program Error: ${getTokenErrorMessage(error.context.code)}`);

            if (isInstructionWithData(failedInstruction)) {
                const parsedInstruction = parseTokenInstruction(failedInstruction);
                console.error({
                    ...parsedInstruction,
                    instructionType: TokenInstruction[parsedInstruction.instructionType],
                });
            }
        }
    }
});

const allSuccessful = results.every(r => r.status === 'successful');
process.exit(allSuccessful ? 0 : 1);
