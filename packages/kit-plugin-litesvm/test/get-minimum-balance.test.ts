import { BASE_ACCOUNT_SIZE, createClient, lamports } from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';

import { litesvmConnection, litesvmGetMinimumBalance } from '../src';

// Default Solana rent: 3_480 lamports/byte/year * 2 years exemption threshold = 6_960 lamports/byte.
const LAMPORTS_PER_BYTE = 6_960n;

describe('litesvmGetMinimumBalance', () => {
    it('provides a getMinimumBalance function that relies on a LiteSVM instance', () => {
        const minimumBalanceForRentExemption = vi.fn();
        const client = createClient()
            .use(() => ({ svm: { minimumBalanceForRentExemption } }))
            .use(litesvmGetMinimumBalance());
        expect(client).toHaveProperty('getMinimumBalance');
        expect(client.getMinimumBalance).toBeTypeOf('function');
    });

    it('calls svm with the space as data length by default', async () => {
        const minimumBalanceForRentExemption = vi.fn().mockReturnValue(42n);
        const client = createClient()
            .use(() => ({ svm: { minimumBalanceForRentExemption } }))
            .use(litesvmGetMinimumBalance());

        const result = await client.getMinimumBalance(100);
        expect(minimumBalanceForRentExemption).toHaveBeenCalledWith(100n);
        expect(result).toBe(lamports(42n));
    });

    it('computes the per-byte rate when withoutHeader is true', async () => {
        const headerBalance = LAMPORTS_PER_BYTE * BigInt(BASE_ACCOUNT_SIZE);
        const minimumBalanceForRentExemption = vi.fn().mockReturnValue(headerBalance);
        const client = createClient()
            .use(() => ({ svm: { minimumBalanceForRentExemption } }))
            .use(litesvmGetMinimumBalance());

        const space = 100;
        const result = await client.getMinimumBalance(space, { withoutHeader: true });
        expect(minimumBalanceForRentExemption).toHaveBeenCalledWith(0n);
        expect(result).toBe(lamports(LAMPORTS_PER_BYTE * BigInt(space)));
    });

    if (__NODEJS__) {
        it('works with a LiteSVM instance', async () => {
            const client = createClient().use(litesvmConnection()).use(litesvmGetMinimumBalance());
            expect(client).toHaveProperty('getMinimumBalance');

            const balance = await client.getMinimumBalance(100);
            expect(balance).toBeGreaterThan(0n);
        });
    }
});
