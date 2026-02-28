import { address, createEmptyClient, generateKeyPairSigner, lamports } from '@solana/kit';
import { describe, expect, it } from 'vitest';

import { litesvm as nodeLitesvm } from '../src/index';
import { litesvm as browserLitesvm } from '../src/index.browser';
const litesvm = __NODEJS__ ? nodeLitesvm : browserLitesvm;

describe('createRpcFromSvm', () => {
    if (!__NODEJS__) {
        it.todo('skipped in browser builds');
        return;
    }

    it('can fetch an account set on the svm', async () => {
        const client = createEmptyClient().use(litesvm());
        const accountAddress = await generateKeyPairSigner().then(signer => signer.address);

        client.svm.setAccount({
            address: accountAddress,
            data: new Uint8Array([1, 1]),
            executable: false,
            lamports: lamports(1_000_000n),
            programAddress: address('11111111111111111111111111111111'),
            space: 2n,
        });

        const { value } = await client.rpc.getAccountInfo(accountAddress).send();
        expect(value).toEqual({
            data: ['AQE=', 'base64'],
            executable: false,
            lamports: lamports(1_000_000n),
            owner: address('11111111111111111111111111111111'),
            space: 2n,
        });
    });

    it('can fetch a missing account on the svm', async () => {
        const client = createEmptyClient().use(litesvm());
        const missingAddress = await generateKeyPairSigner().then(signer => signer.address);

        const { value } = await client.rpc.getAccountInfo(missingAddress).send();
        expect(value).toBeNull();
    });

    it('can fetch multiple accounts set on the svm', async () => {
        const client = createEmptyClient().use(litesvm());

        const [addressA, addressB, missingAddressC] = await Promise.all([
            generateKeyPairSigner().then(signer => signer.address),
            generateKeyPairSigner().then(signer => signer.address),
            generateKeyPairSigner().then(signer => signer.address),
        ]);

        client.svm.setAccount({
            address: addressA,
            data: new Uint8Array([1, 1]),
            executable: false,
            lamports: lamports(1_000_000n),
            programAddress: address('11111111111111111111111111111111'),
            space: 2n,
        });
        client.svm.setAccount({
            address: addressB,
            data: new Uint8Array([2, 2, 2, 2]),
            executable: false,
            lamports: lamports(2_000_000n),
            programAddress: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
            space: 4n,
        });

        const { value } = await client.rpc.getMultipleAccounts([addressA, addressB, missingAddressC]).send();

        expect(value).toHaveLength(3);
        expect(value[0]).toEqual({
            data: ['AQE=', 'base64'],
            executable: false,
            lamports: lamports(1_000_000n),
            owner: address('11111111111111111111111111111111'),
            space: 2n,
        });
        expect(value[1]).toEqual({
            data: ['AgICAg==', 'base64'],
            executable: false,
            lamports: lamports(2_000_000n),
            owner: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
            space: 4n,
        });
        expect(value[2]).toBeNull();
    });

    it('can fetch the balance of an account set on the svm', async () => {
        const client = createEmptyClient().use(litesvm());
        const accountAddress = await generateKeyPairSigner().then(signer => signer.address);

        client.svm.setAccount({
            address: accountAddress,
            data: new Uint8Array([]),
            executable: false,
            lamports: lamports(5_000_000n),
            programAddress: address('11111111111111111111111111111111'),
            space: 0n,
        });

        const { value } = await client.rpc.getBalance(accountAddress).send();
        expect(value).toBe(lamports(5_000_000n));
    });

    it('returns zero balance for a missing account', async () => {
        const client = createEmptyClient().use(litesvm());
        const missingAddress = await generateKeyPairSigner().then(signer => signer.address);

        const { value } = await client.rpc.getBalance(missingAddress).send();
        expect(value).toBe(lamports(0n));
    });

    it('can fetch the epoch schedule', async () => {
        const client = createEmptyClient().use(litesvm());

        const response = await client.rpc.getEpochSchedule().send();
        expect(typeof response.firstNormalEpoch).toBe('bigint');
        expect(typeof response.firstNormalSlot).toBe('bigint');
        expect(typeof response.leaderScheduleSlotOffset).toBe('bigint');
        expect(typeof response.slotsPerEpoch).toBe('bigint');
        expect(typeof response.warmup).toBe('boolean');
    });

    it('can fetch the latest blockhash', async () => {
        const client = createEmptyClient().use(litesvm());

        const { value } = await client.rpc.getLatestBlockhash({ commitment: 'finalized' }).send();
        expect(value).toStrictEqual({
            blockhash: client.svm.latestBlockhash(),
            lastValidBlockHeight: 0n,
        });
    });

    it('can fetch the minimum balance for rent exemption', async () => {
        const client = createEmptyClient().use(litesvm());

        const response = await client.rpc.getMinimumBalanceForRentExemption(100n).send();
        expect(response).toBeGreaterThan(0n);
        expect(typeof response).toBe('bigint');
    });

    it('can fetch the current slot', async () => {
        const client = createEmptyClient().use(litesvm());

        const slot = await client.rpc.getSlot().send();
        expect(typeof slot).toBe('bigint');
        expect(slot).toBeGreaterThanOrEqual(0n);
    });

    it('can request an airdrop', async () => {
        const client = createEmptyClient().use(litesvm());
        const recipientAddress = await generateKeyPairSigner().then(signer => signer.address);

        const signature = await client.rpc.requestAirdrop(recipientAddress, lamports(1_000_000_000n)).send();
        expect(typeof signature).toBe('string');
        expect(signature.length).toBeGreaterThan(0);

        // Verify the balance increased.
        const { value: balance } = await client.rpc.getBalance(recipientAddress).send();
        expect(balance).toBe(lamports(1_000_000_000n));
    });
});
