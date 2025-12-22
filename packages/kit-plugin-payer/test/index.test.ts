import { createEmptyClient, generateKeyPairSigner, KeyPairSigner, lamports } from '@solana/kit';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { generatedPayer, generatedPayerWithSol, payer, payerFromFile } from '../src';

describe('payer', () => {
    it('sets the payer attribute with the provided signer', async () => {
        const signer = await generateKeyPairSigner();
        const client = createEmptyClient().use(payer(signer));
        expect(client).toHaveProperty('payer');
        expect(client.payer).toBe(signer);
    });
});

describe('generatedPayer', () => {
    it('generates a new payer and set it on the client', async () => {
        const client = await createEmptyClient().use(generatedPayer());
        expect(client).toHaveProperty('payer');
        expect(client.payer).toBeTypeOf('object');
        expectTypeOf(client.payer).toEqualTypeOf<KeyPairSigner>();
    });
});

describe('generatedPayerWithSol', () => {
    it('generates a new payer with some initial SOL using the airdrop plugin', async () => {
        const amount = lamports(1_000_000_000n);
        const airdrop = vi.fn();
        const client = await createEmptyClient()
            .use(() => ({ airdrop }))
            .use(generatedPayerWithSol(amount));

        expect(client).toHaveProperty('payer');
        expect(client.payer).toBeTypeOf('object');
        expectTypeOf(client.payer).toEqualTypeOf<KeyPairSigner>();
        expect(airdrop).toHaveBeenCalledExactlyOnceWith(client.payer.address, amount);
    });
});

describe('payerFromFile', () => {
    if (__NODEJS__) {
        it('generates a new payer and set it on the client', async () => {
            const client = await createEmptyClient().use(payerFromFile('test/mock_payer.json'));
            expect(client).toHaveProperty('payer');
            expect(client.payer).toBeTypeOf('object');
            expectTypeOf(client.payer).toEqualTypeOf<KeyPairSigner>();
            expect(client.payer.address).toBe('3b7YkAKJ9H2qAAaQp3xYeTWguN9Cha52SegAZLZUWQsZ');
        });
    } else {
        it('throws an error when used in non-Node.js environments', () => {
            expect(() => payerFromFile('test/mock_payer.json')).toThrowError(
                'payerFromFile is only supported in Node.js environments',
            );
        });
    }
});
