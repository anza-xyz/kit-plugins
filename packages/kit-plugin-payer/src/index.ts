import { readFileSync } from 'node:fs';

import {
    ClientWithAirdrop,
    ClientWithPayer,
    createKeyPairSignerFromBytes,
    extendClient,
    generateKeyPairSigner,
    Lamports,
    lamports,
    TransactionSigner,
} from '@solana/kit';

/**
 * Sets the provided `TransactionSigner` as the `payer` property on the client.
 *
 * @param payer - The `TransactionSigner` to set as the payer.
 *
 * @deprecated Use `payer` from `@solana/kit-plugin-signer` instead.
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { payer } from '@solana/kit-plugin-signer';
 *
 * const client = createClient().use(payer(mySigner));
 * ```
 */
export function payer(payer: TransactionSigner) {
    return <T extends object>(client: T) => extendClient(client, { payer });
}

/**
 * Generates a new `KeyPairSigner` and sets it as the `payer` property on the client.
 *
 * @deprecated Use `generatedPayer` from `@solana/kit-plugin-signer` instead.
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { generatedPayer } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient().use(generatedPayer());
 * ```
 */
export function generatedPayer() {
    return async <T extends object>(client: T) => extendClient(client, { payer: await generateKeyPairSigner() });
}

/**
 * Generates a new `KeyPairSigner`, funds it with the specified
 * amount of lamports using the client's `airdrop` function,
 * and sets it as the `payer` property on the client.
 *
 * @param amount - The amount of lamports to airdrop to the generated payer.
 *
 * @deprecated Use `generatedPayerWithSol` from `@solana/kit-plugin-signer` instead.
 * ```ts
 * import { createClient, lamports } from '@solana/kit';
 * import { generatedPayerWithSol } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient()
 *     .use(generatedPayerWithSol(lamports(10_000_000_000n)));
 * ```
 */
export function generatedPayerWithSol(amount: Lamports) {
    const generatedPayerPlugin = generatedPayer();
    return async <T extends ClientWithAirdrop>(client: T) => {
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
 * @deprecated Use `payerFromFile` from `@solana/kit-plugin-signer` instead.
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { payerFromFile } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient().use(payerFromFile('path/to/keypair.json'));
 * ```
 */
export function payerFromFile(path: string) {
    if (!__NODEJS__) {
        throw new Error('payerFromFile is only supported in Node.js environments');
    }

    return async <T extends object>(client: T) => {
        const bytes = JSON.parse(readFileSync(path, 'utf-8')) as number[];
        const payer = await createKeyPairSignerFromBytes(new Uint8Array(bytes));
        return extendClient(client, { payer });
    };
}

/**
 * Uses the provided `TransactionSigner` as the `payer` if one is given.
 * Otherwise, generates a new `KeyPairSigner`, funds it with 100 SOL
 * using the client's `airdrop` function, and sets it as the `payer`.
 *
 * This is useful when you want to optionally accept a payer from the
 * caller but fall back to a generated and funded payer for convenience
 * (e.g. in testing or local development).
 *
 * @param explicitPayer - An optional `TransactionSigner` to use as the payer.
 *                        When `undefined`, a new payer is generated and airdropped 100 SOL.
 *
 * @deprecated Use `payer` and/or `generatedPayerWithSol` from `@solana/kit-plugin-signer` instead.
 * ```ts
 * import { createClient, lamports } from '@solana/kit';
 * import { solanaRpcConnection, rpcAirdrop } from '@solana/kit-plugin-rpc';
 * import { payer, generatedPayerWithSol } from '@solana/kit-plugin-signer';
 *
 * // With an explicit payer.
 * const client = createClient().use(payer(mySigner));
 *
 * // With a generated payer funded with SOL.
 * const client = await createClient()
 *     .use(solanaRpcConnection({ rpcUrl: 'http://127.0.0.1:8899' }))
 *     .use(rpcAirdrop())
 *     .use(generatedPayerWithSol(lamports(100_000_000_000n)));
 * ```
 */
export function payerOrGeneratedPayer(explicitPayer: TransactionSigner | undefined) {
    return <T extends ClientWithAirdrop>(client: T): Promise<ClientWithPayer & Omit<T, 'payer'>> => {
        if (explicitPayer) {
            return Promise.resolve(payer(explicitPayer)(client));
        }
        return generatedPayerWithSol(lamports(100_000_000_000n))(client);
    };
}
