import {
    generateKeyPairSigner,
    isSolanaError,
    lamports,
    SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
    summarizeTransactionPlanResult,
    type TransactionPlanResult,
} from '@solana/kit';
import { createDefaultLocalhostRpcClient } from '@solana/kit-plugins';
import { getSystemErrorMessage, getTransferSolInstruction, isSystemError } from '@solana-program/system';

const client = await createDefaultLocalhostRpcClient();

// Generate a random recipient address
const destinationAccountAddress = (await generateKeyPairSigner()).address;

try {
    const result = await client.sendTransaction(
        getTransferSolInstruction({
            amount: lamports(10_000_000n),
            // 0.01 SOL
            destination: destinationAccountAddress,
            // Automatically generated account, already airdropped SOL when the client was created
            source: client.payer,
        }),
    );

    if (result.kind === 'successful') {
        const { signature } = result;
        console.log(
            `Transaction successful! https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899}`,
        );
    } else {
        if (result.kind === 'canceled') {
            console.log('Transaction was cancelled');
        } else {
            console.log('Transaction failed');
            throw result.error;
        }
    }
} catch (e) {
    if (isSolanaError(e, SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN)) {
        const transactionPlanResult = e.context.transactionPlanResult as TransactionPlanResult;
        const summary = summarizeTransactionPlanResult(transactionPlanResult);
        const transactionMessage = summary.failedTransactions[0].message;

        if (isSystemError(e.cause, transactionMessage)) {
            console.error(getSystemErrorMessage(e.cause.context.code));
            process.exit(1);
        }
    }
    throw e;
}
