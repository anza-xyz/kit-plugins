import { readFileSync } from 'node:fs';

import { createKeyPairSignerFromBytes } from '@solana/kit';

import { identity, payer, signer } from './signer';

/**
 * Reads a JSON file containing the byte array of a keypair,
 * creates a `KeyPairSigner` from those bytes, and sets it
 * as both the `payer` and `identity` properties on the client.
 *
 * This plugin requires access to the local filesystem and therefore
 * can only work in Node.js environments. Other environments will
 * throw an error.
 *
 * @param path - The file path to the JSON file containing the keypair bytes.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { signerFromFile } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient().use(signerFromFile('path/to/keypair.json'));
 * ```
 *
 * @throws Throws an error if used outside of a Node.js environment.
 *
 * @see {@link payerFromFile}
 * @see {@link identityFromFile}
 */
export function signerFromFile(path: string) {
    if (!__NODEJS__) {
        throw new Error('`signerFromFile` is only supported in Node.js environments');
    }
    return async <T extends object>(client: T) => signer(await getKeyPairSignerFromFile(path))(client);
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
 * import { createClient } from '@solana/kit';
 * import { payerFromFile } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient().use(payerFromFile('path/to/keypair.json'));
 * ```
 *
 * @throws Throws an error if used outside of a Node.js environment.
 *
 * @see {@link identityFromFile}
 * @see {@link signerFromFile}
 */
export function payerFromFile(path: string) {
    if (!__NODEJS__) {
        throw new Error('`payerFromFile` is only supported in Node.js environments');
    }
    return async <T extends object>(client: T) => payer(await getKeyPairSignerFromFile(path))(client);
}

/**
 * Reads a JSON file containing the byte array of a keypair,
 * creates a `KeyPairSigner` from those bytes, and sets it
 * as the `identity` property on the client.
 *
 * This plugin requires access to the local filesystem and therefore
 * can only work in Node.js environments. Other environments will
 * throw an error.
 *
 * @param path - The file path to the JSON file containing the keypair bytes.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { identityFromFile } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient().use(identityFromFile('path/to/keypair.json'));
 * ```
 *
 * @throws Throws an error if used outside of a Node.js environment.
 *
 * @see {@link payerFromFile}
 * @see {@link signerFromFile}
 */
export function identityFromFile(path: string) {
    if (!__NODEJS__) {
        throw new Error('`identityFromFile` is only supported in Node.js environments');
    }
    return async <T extends object>(client: T) => identity(await getKeyPairSignerFromFile(path))(client);
}

async function getKeyPairSignerFromFile(path: string) {
    const bytes = JSON.parse(readFileSync(path, 'utf-8')) as number[];
    return await createKeyPairSignerFromBytes(new Uint8Array(bytes));
}
