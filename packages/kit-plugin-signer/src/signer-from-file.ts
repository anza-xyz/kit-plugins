import { existsSync, readFileSync } from 'node:fs';

import { createKeyPairSignerFromBytes, generateKeyPairSigner, writeKeyPairSigner } from '@solana/kit';

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
 * @param config - Optional {@link SignerFromFileConfig}, e.g. to create the file when it is missing.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { signerFromFile } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient().use(signerFromFile('path/to/keypair.json'));
 * ```
 *
 * @example
 * Generate and save a new keypair on the first run.
 * ```ts
 * const client = await createClient().use(signerFromFile('wallet.json', { createIfMissing: true }));
 * ```
 *
 * @throws Throws an error if used outside of a Node.js environment.
 *
 * @see {@link payerFromFile}
 * @see {@link identityFromFile}
 */
export function signerFromFile(path: string, config: SignerFromFileConfig = {}) {
    if (!__NODEJS__) {
        throw new Error('`signerFromFile` is only supported in Node.js environments');
    }
    return async <T extends object>(client: T) => signer(await getKeyPairSignerFromFile(path, config))(client);
}

/**
 * Reads a JSON file containing the byte array of a keypair,
 * creates a `KeyPairSigner` from those bytes, and sets it
 * as the `payer` property on the client.
 *
 * @param path - The file path to the JSON file containing the keypair bytes.
 * @param config - Optional {@link SignerFromFileConfig}, e.g. to create the file when it is missing.
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
export function payerFromFile(path: string, config: SignerFromFileConfig = {}) {
    if (!__NODEJS__) {
        throw new Error('`payerFromFile` is only supported in Node.js environments');
    }
    return async <T extends object>(client: T) => payer(await getKeyPairSignerFromFile(path, config))(client);
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
 * @param config - Optional {@link SignerFromFileConfig}, e.g. to create the file when it is missing.
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
export function identityFromFile(path: string, config: SignerFromFileConfig = {}) {
    if (!__NODEJS__) {
        throw new Error('`identityFromFile` is only supported in Node.js environments');
    }
    return async <T extends object>(client: T) => identity(await getKeyPairSignerFromFile(path, config))(client);
}

/**
 * Configuration for {@link signerFromFile}, {@link payerFromFile} and {@link identityFromFile}.
 */
export type SignerFromFileConfig = {
    /**
     * When `true` and no file exists at the given path, a new keypair is generated and
     * written there (using `solana-keygen`'s JSON format and `0600` permissions) before
     * being loaded. Useful for local scripts that should bootstrap their own wallet on the
     * first run. Existing files are never overwritten. Concurrent calls creating the same
     * file are not supported.
     *
     * @defaultValue `false`
     */
    createIfMissing?: boolean;
};

async function getKeyPairSignerFromFile(path: string, config: SignerFromFileConfig) {
    if (config.createIfMissing && !existsSync(path)) {
        await writeKeyPairSigner(await generateKeyPairSigner(true), path);
    }
    const bytes = JSON.parse(readFileSync(path, 'utf-8')) as number[];
    return await createKeyPairSignerFromBytes(new Uint8Array(bytes));
}
