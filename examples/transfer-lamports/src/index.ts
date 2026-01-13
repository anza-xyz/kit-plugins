import {
    generateKeyPairSigner,
    getSolanaErrorFromTransactionError,
    isSolanaError,
    lamports,
    SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
    SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_COMPUTE_LIMIT,
    summarizeTransactionPlanResult,
    type TransactionError,
    type TransactionPlanResult,
} from '@solana/kit';
import { createDefaultLocalhostRpcClient } from '@solana/kit-plugins';
import { getSystemErrorMessage, getTransferSolInstruction, isSystemError } from '@solana-program/system';

const client = await createDefaultLocalhostRpcClient();

// Generate a random recipient address
const destinationAccountAddress = (await generateKeyPairSigner()).address;

try {
    const result = await client.send(
        getTransferSolInstruction({
            amount: lamports(10_000_000n),
            // 0.01 SOL
            destination: destinationAccountAddress,
            // Automatically generated account, already airdropped SOL when the client was created
            source: client.payer,
        }),
    );

    const summary = summarizeTransactionPlanResult(result);
    if (summary.successful) {
        const [transaction] = summary.successfulTransactions;
        const { signature } = transaction.status;
        console.log(
            `Transaction successful! https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899}`,
        );
    } else {
        if (summary.canceledTransactions.length > 0) {
            console.log('Transaction was cancelled');
        } else {
            console.log('Transaction failed');
            throw summary.failedTransactions[0].status.error;
        }
    }
} catch (e) {
    if (isSolanaError(e, SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN)) {
        if (isSolanaError(e.cause, SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_COMPUTE_LIMIT)) {
            const transactionPlanResult = e.context.transactionPlanResult as TransactionPlanResult;
            const summary = summarizeTransactionPlanResult(transactionPlanResult);
            const transactionMessage = summary.failedTransactions[0].message;

            const transactionError = e.cause.cause as TransactionError;
            const nestedError = getSolanaErrorFromTransactionError(transactionError);

            if (isSystemError(nestedError, transactionMessage)) {
                console.error(getSystemErrorMessage(nestedError.context.code));
                process.exit(1);
            }
        }
        throw e.cause;
    }
    throw e;
}
