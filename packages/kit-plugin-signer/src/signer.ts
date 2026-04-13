import { extendClient, TransactionSigner } from '@solana/kit';

/**
 * Sets the provided `TransactionSigner` as both the `payer` and
 * `identity` properties on the client.
 *
 * This is a convenience shorthand for installing {@link payer} and
 * {@link identity} with the same signer.
 *
 * @param signer - The `TransactionSigner` to set as both payer and identity.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { signer } from '@solana/kit-plugin-signer';
 *
 * const client = createClient().use(signer(mySigner));
 * ```
 *
 * @see {@link payer}
 * @see {@link identity}
 */
export function signer<TSigner extends TransactionSigner>(signer: TSigner) {
    return <T extends object>(client: T) => extendClient(client, { identity: signer, payer: signer });
}

/**
 * Sets the provided `TransactionSigner` as the `payer` property on the client.
 *
 * The payer is the signer responsible for paying transaction fees and
 * storage costs (i.e. rent for newly created accounts).
 *
 * @param payer - The `TransactionSigner` to set as the payer.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { payer } from '@solana/kit-plugin-signer';
 *
 * const client = createClient().use(payer(mySigner));
 * ```
 *
 * @see {@link identity}
 * @see {@link signer}
 */
export function payer<TSigner extends TransactionSigner>(payer: TSigner) {
    return <T extends object>(client: T) => extendClient(client, { payer });
}

/**
 * Sets the provided `TransactionSigner` as the `identity` property on the client.
 *
 * The identity is the signer representing the wallet that owns things in
 * the application, such as the authority over accounts, tokens, or other
 * on-chain assets.
 *
 * @param identity - The `TransactionSigner` to set as the identity.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { identity } from '@solana/kit-plugin-signer';
 *
 * const client = createClient().use(identity(mySigner));
 * ```
 *
 * @see {@link payer}
 * @see {@link signer}
 */
export function identity<TSigner extends TransactionSigner>(identity: TSigner) {
    return <T extends object>(client: T) => extendClient(client, { identity });
}
