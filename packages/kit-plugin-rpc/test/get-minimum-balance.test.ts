import { BASE_ACCOUNT_SIZE, createClient, lamports } from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';

import { rpcGetMinimumBalance, solanaRpcConnection } from '../src';

// Default Solana rent: 3_480 lamports/byte/year * 2 years exemption threshold = 6_960 lamports/byte.
const LAMPORTS_PER_BYTE = 6_960n;

describe('rpcGetMinimumBalance', () => {
    it('provides a getMinimumBalance function that relies on RPCs', () => {
        const getMinimumBalanceForRentExemption = vi.fn();
        const client = createClient()
            .use(() => ({
                rpc: { getMinimumBalanceForRentExemption },
            }))
            .use(rpcGetMinimumBalance());
        expect(client).toHaveProperty('getMinimumBalance');
        expect(client.getMinimumBalance).toBeTypeOf('function');
    });

    it('works with a Solana RPC connection', () => {
        const client = createClient()
            .use(solanaRpcConnection({ rpcUrl: 'https://my-rpc.com' }))
            .use(rpcGetMinimumBalance());
        expect(client).toHaveProperty('getMinimumBalance');
    });

    it('calls the RPC with the space as data length by default', async () => {
        const send = vi.fn().mockResolvedValue(lamports(42n));
        const getMinimumBalanceForRentExemption = vi.fn().mockReturnValue({ send });
        const client = createClient()
            .use(() => ({
                rpc: { getMinimumBalanceForRentExemption },
            }))
            .use(rpcGetMinimumBalance());

        const result = await client.getMinimumBalance(100);
        expect(getMinimumBalanceForRentExemption).toHaveBeenCalledWith(100n);
        expect(result).toBe(lamports(42n));
    });

    it('computes the per-byte rate when withoutHeader is true', async () => {
        const headerBalance = lamports(LAMPORTS_PER_BYTE * BigInt(BASE_ACCOUNT_SIZE));
        const send = vi.fn().mockResolvedValue(headerBalance);
        const getMinimumBalanceForRentExemption = vi.fn().mockReturnValue({ send });
        const client = createClient()
            .use(() => ({
                rpc: { getMinimumBalanceForRentExemption },
            }))
            .use(rpcGetMinimumBalance());

        const space = 100;
        const result = await client.getMinimumBalance(space, { withoutHeader: true });
        expect(getMinimumBalanceForRentExemption).toHaveBeenCalledWith(0n);
        expect(result).toBe(lamports(LAMPORTS_PER_BYTE * BigInt(space)));
    });
});
