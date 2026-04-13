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
