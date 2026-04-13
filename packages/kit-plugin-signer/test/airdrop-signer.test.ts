import { createClient, generateKeyPairSigner, lamports } from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';

import { airdropIdentity, airdropPayer, airdropSigner, identity, payer, signer } from '../src';

describe('airdropSigner', () => {
    it('airdrops to the shared payer/identity signer', async () => {
        const amount = lamports(1_000_000_000n);
        const airdrop = vi.fn();
        const mySigner = await generateKeyPairSigner();
        const client = await createClient()
            .use(() => ({ airdrop }))
            .use(signer(mySigner))
            .use(airdropSigner(amount));

        expect(airdrop).toHaveBeenCalledExactlyOnceWith(mySigner.address, amount);
        expect(client.payer).toBe(mySigner);
        expect(client.identity).toBe(mySigner);
    });

    it('throws when payer and identity are different signers', async () => {
        const amount = lamports(1_000_000_000n);
        const airdrop = vi.fn();
        const myPayer = await generateKeyPairSigner();
        const myIdentity = await generateKeyPairSigner();

        await expect(
            createClient()
                .use(() => ({ airdrop }))
                .use(payer(myPayer))
                .use(identity(myIdentity))
                .use(airdropSigner(amount)),
        ).rejects.toThrowError('`airdropSigner` requires the payer and identity to be the same signer on the client.');
        expect(airdrop).not.toHaveBeenCalled();
    });
});

describe('airdropPayer', () => {
    it('airdrops to the payer', async () => {
        const amount = lamports(1_000_000_000n);
        const airdrop = vi.fn();
        const myPayer = await generateKeyPairSigner();
        const client = await createClient()
            .use(() => ({ airdrop }))
            .use(payer(myPayer))
            .use(airdropPayer(amount));

        expect(airdrop).toHaveBeenCalledExactlyOnceWith(myPayer.address, amount);
        expect(client.payer).toBe(myPayer);
    });
});

describe('airdropIdentity', () => {
    it('airdrops to the identity', async () => {
        const amount = lamports(1_000_000_000n);
        const airdrop = vi.fn();
        const myIdentity = await generateKeyPairSigner();
        const client = await createClient()
            .use(() => ({ airdrop }))
            .use(identity(myIdentity))
            .use(airdropIdentity(amount));

        expect(airdrop).toHaveBeenCalledExactlyOnceWith(myIdentity.address, amount);
        expect(client.identity).toBe(myIdentity);
    });
});
