import { createClient, KeyPairSigner, lamports } from '@solana/kit';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { generatedIdentityWithSol, generatedPayerWithSol, generatedSignerWithSol } from '../src';

describe('generatedSignerWithSol', () => {
    it('generates a new signer with some initial SOL and sets it as both payer and identity', async () => {
        const amount = lamports(1_000_000_000n);
        const airdrop = vi.fn();
        const client = await createClient()
            .use(() => ({ airdrop }))
            .use(generatedSignerWithSol(amount));

        expect(client).toHaveProperty('payer');
        expect(client).toHaveProperty('identity');
        expect(client.payer).toBeTypeOf('object');
        expect(client.payer).toBe(client.identity);
        expectTypeOf(client.payer).toEqualTypeOf<KeyPairSigner>();
        expect(airdrop).toHaveBeenCalledExactlyOnceWith(client.payer.address, amount);
    });
});

describe('generatedPayerWithSol', () => {
    it('generates a new payer with some initial SOL using the airdrop plugin', async () => {
        const amount = lamports(1_000_000_000n);
        const airdrop = vi.fn();
        const client = await createClient()
            .use(() => ({ airdrop }))
            .use(generatedPayerWithSol(amount));

        expect(client).toHaveProperty('payer');
        expect(client.payer).toBeTypeOf('object');
        expectTypeOf(client.payer).toEqualTypeOf<KeyPairSigner>();
        expect(airdrop).toHaveBeenCalledExactlyOnceWith(client.payer.address, amount);
    });
});

describe('generatedIdentityWithSol', () => {
    it('generates a new identity with some initial SOL using the airdrop plugin', async () => {
        const amount = lamports(1_000_000_000n);
        const airdrop = vi.fn();
        const client = await createClient()
            .use(() => ({ airdrop }))
            .use(generatedIdentityWithSol(amount));

        expect(client).toHaveProperty('identity');
        expect(client.identity).toBeTypeOf('object');
        expectTypeOf(client.identity).toEqualTypeOf<KeyPairSigner>();
        expect(airdrop).toHaveBeenCalledExactlyOnceWith(client.identity.address, amount);
    });
});
