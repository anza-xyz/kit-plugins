import { ClientWithAirdrop, Lamports, pipe } from '@solana/kit';

import { airdropIdentity, airdropPayer, airdropSigner } from './airdrop-signer';
import { generatedIdentity, generatedPayer, generatedSigner } from './generated-signer';

/**
 * Generates a new `KeyPairSigner`, funds it with the specified
 * amount of lamports using the client's `airdrop` function,
 * and sets it as both the `payer` and `identity` properties on the client.
 *
 * This is a convenience shorthand for installing {@link generatedPayerWithSol}
 * and {@link generatedIdentityWithSol} with the same generated signer.
 *
 * @param amount - The amount of lamports to airdrop to the generated signer.
 *
 * @example
 * ```ts
 * import { createClient, lamports } from '@solana/kit';
 * import { rpcAirdrop, solanaRpcConnection, solanaRpcSubscriptionsConnection } from '@solana/kit-plugin-rpc';
 * import { generatedSignerWithSol } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient()
 *     .use(solanaRpcConnection('http://127.0.0.1:8899'))
 *     .use(solanaRpcSubscriptionsConnection('ws://127.0.0.1:8900'))
 *     .use(rpcAirdrop())
 *     .use(generatedSignerWithSol(lamports(10_000_000_000n)));
 * ```
 *
 * @see {@link generatedPayerWithSol}
 * @see {@link generatedIdentityWithSol}
 */
export function generatedSignerWithSol(amount: Lamports) {
    return async <T extends ClientWithAirdrop>(client: T) =>
        await pipe(client, generatedSigner(), async client => await airdropSigner(amount)(await client));
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
 * import { createClient, lamports } from '@solana/kit';
 * import { rpcAirdrop, solanaRpcConnection, solanaRpcSubscriptionsConnection } from '@solana/kit-plugin-rpc';
 * import { generatedPayerWithSol } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient()
 *     .use(solanaRpcConnection('http://127.0.0.1:8899'))
 *     .use(solanaRpcSubscriptionsConnection('ws://127.0.0.1:8900'))
 *     .use(rpcAirdrop())
 *     .use(generatedPayerWithSol(lamports(10_000_000_000n)));
 * ```
 *
 * @see {@link generatedIdentityWithSol}
 * @see {@link generatedSignerWithSol}
 */
export function generatedPayerWithSol(amount: Lamports) {
    return async <T extends ClientWithAirdrop>(client: T) =>
        await pipe(client, generatedPayer(), async client => await airdropPayer(amount)(await client));
}

/**
 * Generates a new `KeyPairSigner`, funds it with the specified
 * amount of lamports using the client's `airdrop` function,
 * and sets it as the `identity` property on the client.
 *
 * @param amount - The amount of lamports to airdrop to the generated identity.
 *
 * @example
 * ```ts
 * import { createClient, lamports } from '@solana/kit';
 * import { rpcAirdrop, solanaRpcConnection, solanaRpcSubscriptionsConnection } from '@solana/kit-plugin-rpc';
 * import { generatedIdentityWithSol } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient()
 *     .use(solanaRpcConnection('http://127.0.0.1:8899'))
 *     .use(solanaRpcSubscriptionsConnection('ws://127.0.0.1:8900'))
 *     .use(rpcAirdrop())
 *     .use(generatedIdentityWithSol(lamports(10_000_000_000n)));
 * ```
 *
 * @see {@link generatedPayerWithSol}
 * @see {@link generatedSignerWithSol}
 */
export function generatedIdentityWithSol(amount: Lamports) {
    return async <T extends ClientWithAirdrop>(client: T) =>
        await pipe(client, generatedIdentity(), async client => await airdropIdentity(amount)(await client));
}
