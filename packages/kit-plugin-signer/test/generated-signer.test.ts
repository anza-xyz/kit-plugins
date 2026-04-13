import { createClient, KeyPairSigner } from '@solana/kit';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { generatedIdentity, generatedPayer, generatedSigner } from '../src';

describe('generatedSigner', () => {
    it('generates a new signer and sets it as both payer and identity on the client', async () => {
        const client = await createClient().use(generatedSigner());
        expect(client).toHaveProperty('payer');
        expect(client).toHaveProperty('identity');
        expect(client.payer).toBeTypeOf('object');
        expect(client.identity).toBeTypeOf('object');
        expect(client.payer).toBe(client.identity);
        expectTypeOf(client.payer).toEqualTypeOf<KeyPairSigner>();
        expectTypeOf(client.identity).toEqualTypeOf<KeyPairSigner>();
    });
});

describe('generatedPayer', () => {
    it('generates a new signer and sets it as payer on the client', async () => {
        const client = await createClient().use(generatedPayer());
        expect(client).toHaveProperty('payer');
        expect(client.payer).toBeTypeOf('object');
        expectTypeOf(client.payer).toEqualTypeOf<KeyPairSigner>();
    });
});

describe('generatedIdentity', () => {
    it('generates a new signer and sets it as identity on the client', async () => {
        const client = await createClient().use(generatedIdentity());
        expect(client).toHaveProperty('identity');
        expect(client.identity).toBeTypeOf('object');
        expectTypeOf(client.identity).toEqualTypeOf<KeyPairSigner>();
    });
});
