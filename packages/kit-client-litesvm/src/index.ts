import { createEmptyClient, TransactionSigner } from '@solana/kit';
import { airdrop } from '@solana/kit-plugin-airdrop';
import {
    defaultTransactionPlannerAndExecutorFromLitesvm,
    planAndSendTransactions,
} from '@solana/kit-plugin-instruction-plan';
import { litesvm } from '@solana/kit-plugin-litesvm';
import { payerOrGeneratedPayer } from '@solana/kit-plugin-payer';

/**
 * Creates a default LiteSVM client for local blockchain simulation.
 *
 * This function sets up a client with an embedded LiteSVM instance for fast
 * local blockchain simulation, airdrop functionality, automatic payer generation
 * (if not provided), and all essential transaction capabilities. Ideal for testing
 * and development without requiring a live network connection.
 *
 * @param config - Optional configuration object with an optional payer.
 * @returns A fully configured client ready for local blockchain simulation.
 *
 * @example
 * ```ts
 * import { createDefaultLiteSVMClient } from '@solana/kit-client-litesvm';
 *
 * // Creates a client with auto-generated and funded payer
 * const client = await createDefaultLiteSVMClient();
 *
 * // Set up accounts and programs
 * client.svm.setAccount(myAccount);
 * client.svm.addProgramFromFile(myProgramAddress, 'program.so');
 *
 * // Use the client
 * const result = await client.sendTransaction([myInstruction]);
 * ```
 *
 * @example
 * Using a custom payer.
 * ```ts
 * import { createDefaultLiteSVMClient } from '@solana/kit-client-litesvm';
 * import { generateKeyPairSigner } from '@solana/kit';
 *
 * const customPayer = await generateKeyPairSigner();
 * const client = await createDefaultLiteSVMClient({ payer: customPayer });
 * ```
 */
export function createDefaultLiteSVMClient(config: { payer?: TransactionSigner } = {}) {
    return createEmptyClient()
        .use(litesvm())
        .use(airdrop())
        .use(payerOrGeneratedPayer(config.payer))
        .use(defaultTransactionPlannerAndExecutorFromLitesvm())
        .use(planAndSendTransactions());
}
