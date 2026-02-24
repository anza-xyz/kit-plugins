import {
    generateKeyPairSigner,
    getFirstFailedSingleTransactionPlanResult,
    isInstructionWithData,
    isSolanaError,
    lamports,
    SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
    type TransactionPlanResult,
} from '@solana/kit';
import { createLocalClient } from '@solana/kit-client-rpc';
import {
    getSystemErrorMessage,
    getTransferSolInstruction,
    isSystemError,
    parseSystemInstruction,
    SystemInstruction,
} from '@solana-program/system';

// Use `pnpm start --fail` to make the example fail and see error handling
const shouldFail = process.argv.includes('--fail');

const client = await createLocalClient();

// Generate a random recipient address
const destinationAccountAddress = (await generateKeyPairSigner()).address;

const payer = shouldFail
    ? // Create a new random account with no SOL to force a failure
      await generateKeyPairSigner()
    : // Automatically generated account, already airdropped SOL when the client was created
      client.payer;

try {
    const result = await client.sendTransaction(
        getTransferSolInstruction({
            amount: lamports(10_000_000n), // 0.01 SOL
            destination: destinationAccountAddress,
            source: payer,
        }),
    );

    console.log(
        `Transaction successful! https://explorer.solana.com/tx/${result.context.signature}?cluster=custom&customUrl=${encodeURIComponent('http://127.0.0.1:8899')}`,
    );
} catch (e) {
    if (isSolanaError(e, SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN)) {
        const transactionPlanResult = e.context.transactionPlanResult as TransactionPlanResult;
        const failedTransaction = getFirstFailedSingleTransactionPlanResult(transactionPlanResult);
        const error = failedTransaction.error;
        const transactionMessage = failedTransaction.context.message ?? failedTransaction.plannedMessage;
        const signature = failedTransaction.context.signature;

        if (signature) {
            console.error(
                `Transaction failed: https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent('http://127.0.0.1:8899')}`,
            );
        }

        if (isSystemError(error, transactionMessage)) {
            console.error(`System Program Error: ${getSystemErrorMessage(error.context.code)}`);
            const failedInstruction = transactionMessage.instructions[error.context.index];
            if (isInstructionWithData(failedInstruction)) {
                const parsedInstruction = parseSystemInstruction(failedInstruction);
                console.error({
                    ...parsedInstruction,
                    instructionType: SystemInstruction[parsedInstruction.instructionType],
                });
            }
            process.exit(1);
        }

        throw e;
    }
}
