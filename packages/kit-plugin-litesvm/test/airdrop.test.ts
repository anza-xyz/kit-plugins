import { address, createEmptyClient, lamports } from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';

import { litesvm, litesvmAirdrop } from '../src';

describe('litesvmAirdrop', () => {
    it('provides an airdrop function that relies on a LiteSVM instance', async () => {
        const mockSignature = new Uint8Array(64).fill(1);
        const svm = {
            airdrop: vi.fn().mockReturnValue({
                signature: () => mockSignature,
            }),
        };
        const client = createEmptyClient()
            .use(() => ({ svm }))
            .use(litesvmAirdrop());
        expect(client).toHaveProperty('airdrop');
        expect(client.airdrop).toBeTypeOf('function');

        const receiver = address('HQVxiMVDoV9jzG4tpoxmDZsNfWvaHXm8DGGv93Gka75v');
        const amount = lamports(1_000_000_000n);
        const sig = await client.airdrop(receiver, amount);
        expect(svm.airdrop).toHaveBeenCalledWith(receiver, amount);
        expect(sig).toBeTypeOf('string');
    });

    it('throws when the airdrop returns null', () => {
        const svm = { airdrop: vi.fn().mockReturnValue(null) };
        const client = createEmptyClient()
            .use(() => ({ svm }))
            .use(litesvmAirdrop());

        const receiver = address('HQVxiMVDoV9jzG4tpoxmDZsNfWvaHXm8DGGv93Gka75v');
        expect(() => client.airdrop(receiver, lamports(1n))).toThrow('returned null');
    });

    it('throws a SolanaError when the airdrop fails', () => {
        const svm = {
            airdrop: vi.fn().mockReturnValue({
                err: () => 2, // AccountNotFound
            }),
        };
        const client = createEmptyClient()
            .use(() => ({ svm }))
            .use(litesvmAirdrop());

        const receiver = address('HQVxiMVDoV9jzG4tpoxmDZsNfWvaHXm8DGGv93Gka75v');
        expect(() => client.airdrop(receiver, lamports(1n))).toThrow();
    });

    if (__NODEJS__) {
        it('works with a LiteSVM instance', async () => {
            const client = createEmptyClient().use(litesvm()).use(litesvmAirdrop());
            expect(client).toHaveProperty('airdrop');

            const receiver = address('HQVxiMVDoV9jzG4tpoxmDZsNfWvaHXm8DGGv93Gka75v');
            const sig = await client.airdrop(receiver, lamports(1_000_000_000n));
            expect(sig).toBeTypeOf('string');
        });
    }
});
