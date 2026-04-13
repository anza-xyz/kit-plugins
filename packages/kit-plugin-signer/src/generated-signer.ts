import { generateKeyPairSigner } from '@solana/kit';

import { identity, payer, signer } from './signer';

/**
 * Generates a new `KeyPairSigner` and sets it as both the `payer`
 * and `identity` properties on the client.
 *
 * This is a convenience shorthand for installing {@link generatedPayer}
 * and {@link generatedIdentity} with the same generated signer.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { generatedSigner } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient().use(generatedSigner());
 * ```
 *
 * @see {@link generatedPayer}
 * @see {@link generatedIdentity}
 */
export function generatedSigner() {
    return async <T extends object>(client: T) => signer(await generateKeyPairSigner())(client);
}

/**
 * Generates a new `KeyPairSigner` and sets it as the `payer` property on the client.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { generatedPayer } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient().use(generatedPayer());
 * ```
 *
 * @see {@link generatedIdentity}
 * @see {@link generatedSigner}
 */
export function generatedPayer() {
    return async <T extends object>(client: T) => payer(await generateKeyPairSigner())(client);
}

/**
 * Generates a new `KeyPairSigner` and sets it as the `identity` property on the client.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { generatedIdentity } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient().use(generatedIdentity());
 * ```
 *
 * @see {@link generatedPayer}
 * @see {@link generatedSigner}
 */
export function generatedIdentity() {
    return async <T extends object>(client: T) => identity(await generateKeyPairSigner())(client);
}
