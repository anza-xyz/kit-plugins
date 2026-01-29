import {
    generateKeyPairSigner,
    getFirstFailedSingleTransactionPlanResult,
    isSolanaError,
    lamports,
    SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
    type TransactionPlanResult,
} from '@solana/kit';
import { createDefaultLocalhostRpcClient } from '@solana/kit-plugins';
import { getSystemErrorMessage, getTransferSolInstruction, isSystemError } from '@solana-program/system';

// Use `pnpm start --fail` to make the example fail and see error handling
const shouldFail = process.argv.includes('--fail');

const client = await createDefaultLocalhostRpcClient();

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
        `Transaction successful! https://explorer.solana.com/tx/${result.status.signature}?cluster=custom&customUrl=${encodeURIComponent('http://127.0.0.1:8899')}`,
    );
} catch (e) {
    if (isSolanaError(e, SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN)) {
        const transactionPlanResult = e.context.transactionPlanResult as TransactionPlanResult;
        const failedTransaction = getFirstFailedSingleTransactionPlanResult(transactionPlanResult);
        const error = failedTransaction.status.error;
        const transactionMessage = failedTransaction.message;

        if (isSystemError(error, transactionMessage)) {
            console.error(getSystemErrorMessage(error.context.code));
            // TODO: add `parseSystemInstruction` after https://github.com/solana-program/system/pull/69
            // const failedInstruction = transactionMessage.instructions[error.context.index];
            process.exit(1);
        }

        throw e;
    }
}
