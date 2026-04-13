import { ClientWithAirdrop, ClientWithIdentity, ClientWithPayer, Lamports } from '@solana/kit';

/**
 * Airdrops the specified amount of lamports to the client's signer
 * using the client's `airdrop` function.
 *
 * This requires the `payer` and `identity` on the client to be the
 * same signer. If they differ, use {@link airdropPayer} and/or
 * {@link airdropIdentity} instead.
 *
 * This is particularly useful when the airdrop function is provided by
 * a plugin that requires a signer to already be installed on the client
 * (e.g. `solanaLocalRpc`). In that case, you can generate the signer
 * first, then install the RPC plugin, and then airdrop to the signer.
 *
 * @param amount - The amount of lamports to airdrop.
 *
 * @example
 * ```ts
 * import { createClient, lamports } from '@solana/kit';
 * import { solanaLocalRpc } from '@solana/kit-plugin-rpc';
 * import { generatedSigner, airdropSigner } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient()
 *     .use(generatedSigner())
 *     .use(solanaLocalRpc())
 *     .use(airdropSigner(lamports(1_000_000_000n)));
 * ```
 *
 * @throws Throws if the `payer` and `identity` on the client are not the same signer.
 *
 * @see {@link airdropPayer}
 * @see {@link airdropIdentity}
 */
export function airdropSigner(amount: Lamports) {
    return async <T extends ClientWithAirdrop & ClientWithIdentity & ClientWithPayer>(client: T) => {
        if (client.payer !== client.identity) {
            throw new Error(
                '`airdropSigner` requires the payer and identity to be the same signer on the client. ' +
                    'Use `airdropPayer` and/or `airdropIdentity` if you want ' +
                    'to airdrop to the payer and/or identity, respectively.',
            );
        }
        if (!client.airdrop) {
            throw new Error('`airdropSigner` requires an airdrop function on the client');
        }
        await client.airdrop(client.payer.address, amount);
        return client;
    };
}

/**
 * Airdrops the specified amount of lamports to the client's `payer`
 * using the client's `airdrop` function.
 *
 * @param amount - The amount of lamports to airdrop.
 *
 * @example
 * ```ts
 * import { createClient, lamports } from '@solana/kit';
 * import { solanaLocalRpc } from '@solana/kit-plugin-rpc';
 * import { generatedPayer, airdropPayer } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient()
 *     .use(generatedPayer())
 *     .use(solanaLocalRpc())
 *     .use(airdropPayer(lamports(1_000_000_000n)));
 * ```
 *
 * @see {@link airdropIdentity}
 * @see {@link airdropSigner}
 */
export function airdropPayer(amount: Lamports) {
    return async <T extends ClientWithAirdrop & ClientWithPayer>(client: T) => {
        if (!client.airdrop) {
            throw new Error('`airdropPayer` requires an airdrop function on the client');
        }
        await client.airdrop(client.payer.address, amount);
        return client;
    };
}

/**
 * Airdrops the specified amount of lamports to the client's `identity`
 * using the client's `airdrop` function.
 *
 * @param amount - The amount of lamports to airdrop.
 *
 * @example
 * ```ts
 * import { createClient, lamports } from '@solana/kit';
 * import { solanaLocalRpc } from '@solana/kit-plugin-rpc';
 * import { generatedIdentity, airdropIdentity } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient()
 *     .use(generatedIdentity())
 *     .use(solanaLocalRpc())
 *     .use(airdropIdentity(lamports(1_000_000_000n)));
 * ```
 *
 * @see {@link airdropPayer}
 * @see {@link airdropSigner}
 */
export function airdropIdentity(amount: Lamports) {
    return async <T extends ClientWithAirdrop & ClientWithIdentity>(client: T) => {
        if (!client.airdrop) {
            throw new Error('`airdropIdentity` requires an airdrop function on the client');
        }
        await client.airdrop(client.identity.address, amount);
        return client;
    };
}
