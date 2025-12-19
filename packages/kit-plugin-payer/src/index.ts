import { readFileSync } from 'node:fs';

import { createKeyPairSignerFromBytes, generateKeyPairSigner, Lamports, TransactionSigner } from '@solana/kit';
import type { AirdropFunction } from '@solana/kit-plugin-airdrop';

/**
 * Sets the provided `TransactionSigner` as the `payer` property on the client.
 *
 * @param payer - The `TransactionSigner` to set as the payer.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { payer } from '@solana/kit-plugins';
 *
 * // Install the payer plugin with your signer.
 * const client = createEmptyClient().use(payer(mySigner));
 *
 * // Use the payer in your client.
 * console.log(client.payer.address);
 * setTransactionFeePayerSigner(client.payer, transactionMessage);
 * ```
 */
export function payer(payer: TransactionSigner) {
    return <T extends object>(client: T) => ({ ...client, payer });
}

/**
 * Generates a new `KeyPairSigner` and sets it as the `payer` property on the client.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { generatedPayer } from '@solana/kit-plugins';
 *
 * // Install the generatedPayer plugin.
 * const client = await createEmptyClient().use(generatedPayer());
 *
 * // Use the payer in your client.
 * console.log(client.payer.address);
 * setTransactionFeePayerSigner(client.payer, transactionMessage);
 * ```
 */
export function generatedPayer() {
    return async <T extends object>(client: T) => ({ ...client, payer: await generateKeyPairSigner() });
}

/**
 * Generates a new `KeyPairSigner`, funds it with the specified
 * amount of lamports using the client's `airdrop` function,
 * and sets it as the `payer` property on the client.
 *
 * @param amount - The amount of lamports to airdrop to the generated payer.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { generatedPayerWithSol } from '@solana/kit-plugins';
 *
 * // Install the generatedPayerWithSol plugin.
 * const amount = lamports(10_000_000_000n); // 10 SOL.
 * const client = await createEmptyClient().use(generatedPayerWithSol(amount));
 *
 * // Use the payer in your client.
 * console.log(client.payer.address);
 * setTransactionFeePayerSigner(client.payer, transactionMessage);
 * ```
 */
export function generatedPayerWithSol(amount: Lamports) {
    const generatedPayerPlugin = generatedPayer();
    return async <T extends { airdrop: AirdropFunction }>(client: T) => {
        const clientWithPayer = await generatedPayerPlugin<T>(client);
        if (!clientWithPayer.airdrop) {
            throw new Error('generatedPayerWithSol requires an airdrop function on the client');
        }
        await clientWithPayer.airdrop(clientWithPayer.payer.address, amount);
        return clientWithPayer;
    };
}

/**
 * Reads a JSON file containing the byte array of a keypair,
 * creates a `KeyPairSigner` from those bytes, and sets it
 * as the `payer` property on the client.
 *
 * @param path - The file path to the JSON file containing the keypair bytes.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { payerFromFile } from '@solana/kit-plugins';
 *
 * // Install the payerFromFile plugin.
 * const client = createEmptyClient().use(payerFromFile('path/to/keypair.json'));
 *
 * // Use the payer in your client.
 * console.log(client.payer.address);
 * setTransactionFeePayerSigner(client.payer, transactionMessage);
 * ```
 */
export function payerFromFile(path: string) {
    if (!__NODEJS__) {
        throw new Error('payerFromFile is only supported in Node.js environments');
    }

    return async <T extends object>(client: T) => {
        const bytes = JSON.parse(readFileSync(path, 'utf-8')) as number[];
        const payer = await createKeyPairSignerFromBytes(new Uint8Array(bytes));
        return { ...client, payer };
    };
}
