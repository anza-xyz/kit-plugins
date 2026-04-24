import { createClient, generateKeyPairSigner } from '@solana/kit';
import { describe, expect, it } from 'vitest';

import { identity, payer, signer } from '../src';

describe('signer', () => {
    it('sets both the payer and identity attributes with the provided signer', async () => {
        const mySigner = await generateKeyPairSigner();
        const client = createClient().use(signer(mySigner));
        expect(client).toHaveProperty('payer');
        expect(client).toHaveProperty('identity');
        expect(client.payer).toBe(mySigner);
        expect(client.identity).toBe(mySigner);
    });
});

describe('payer', () => {
    it('sets the payer attribute with the provided signer', async () => {
        const mySigner = await generateKeyPairSigner();
        const client = createClient().use(payer(mySigner));
        expect(client).toHaveProperty('payer');
        expect(client.payer).toBe(mySigner);
    });
});

describe('identity', () => {
    it('sets the identity attribute with the provided signer', async () => {
        const mySigner = await generateKeyPairSigner();
        const client = createClient().use(identity(mySigner));
        expect(client).toHaveProperty('identity');
        expect(client.identity).toBe(mySigner);
    });
});

describe('override behavior', () => {
    it('allows payer() to override a payer previously set by signer()', async () => {
        const userSigner = await generateKeyPairSigner();
        const feePayer = await generateKeyPairSigner();

        const client = createClient().use(signer(userSigner)).use(payer(feePayer));

        expect(client.identity).toBe(userSigner);
        expect(client.payer).toBe(feePayer);
    });

    it('allows identity() to override an identity previously set by signer()', async () => {
        const originalSigner = await generateKeyPairSigner();
        const newIdentity = await generateKeyPairSigner();

        const client = createClient().use(signer(originalSigner)).use(identity(newIdentity));

        expect(client.payer).toBe(originalSigner);
        expect(client.identity).toBe(newIdentity);
    });

    it('allows signer() to override both fields set by an earlier signer()', async () => {
        const originalSigner = await generateKeyPairSigner();
        const replacementSigner = await generateKeyPairSigner();

        const client = createClient().use(signer(originalSigner)).use(signer(replacementSigner));

        expect(client.payer).toBe(replacementSigner);
        expect(client.identity).toBe(replacementSigner);
    });
});
