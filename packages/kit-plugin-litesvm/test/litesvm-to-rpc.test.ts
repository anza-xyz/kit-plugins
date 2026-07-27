import {
    address,
    Address,
    Base58EncodedBytes,
    createClient,
    EncodedAccount,
    generateKeyPairSigner,
    getBase58Decoder,
    lamports,
    Rpc,
} from '@solana/kit';
import { describe, expect, it } from 'vitest';

import { litesvmConnection as nodeLitesvm } from '../src/index';
import { litesvmConnection as browserLitesvm } from '../src/index.browser';
const litesvm = __NODEJS__ ? nodeLitesvm : browserLitesvm;

describe('createRpcFromSvm', () => {
    if (!__NODEJS__) {
        it('throws in browser builds', () => {
            expect(litesvm).toThrow('The `litesvmConnection` plugin is unavailable in browser and react-native');
        });
        return;
    }

    it('can fetch an account set on the svm', async () => {
        const client = createClient().use(litesvm());
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
        const client = createClient().use(litesvm());
        const missingAddress = await generateKeyPairSigner().then(signer => signer.address);

        const { value } = await client.rpc.getAccountInfo(missingAddress).send();
        expect(value).toBeNull();
    });

    it('can fetch multiple accounts set on the svm', async () => {
        const client = createClient().use(litesvm());

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
        const client = createClient().use(litesvm());
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
        const client = createClient().use(litesvm());
        const missingAddress = await generateKeyPairSigner().then(signer => signer.address);

        const { value } = await client.rpc.getBalance(missingAddress).send();
        expect(value).toBe(lamports(0n));
    });

    it('can fetch the epoch schedule', async () => {
        const client = createClient().use(litesvm());

        const response = await client.rpc.getEpochSchedule().send();
        expect(typeof response.firstNormalEpoch).toBe('bigint');
        expect(typeof response.firstNormalSlot).toBe('bigint');
        expect(typeof response.leaderScheduleSlotOffset).toBe('bigint');
        expect(typeof response.slotsPerEpoch).toBe('bigint');
        expect(typeof response.warmup).toBe('boolean');
    });

    it('can fetch the latest blockhash', async () => {
        const client = createClient().use(litesvm());

        const { value } = await client.rpc.getLatestBlockhash({ commitment: 'finalized' }).send();
        expect(value).toStrictEqual({
            blockhash: client.svm.latestBlockhash(),
            lastValidBlockHeight: 0n,
        });
    });

    it('can fetch the minimum balance for rent exemption', async () => {
        const client = createClient().use(litesvm());

        const response = await client.rpc.getMinimumBalanceForRentExemption(100n).send();
        expect(response).toBeGreaterThan(0n);
        expect(typeof response).toBe('bigint');
    });

    it('can fetch the current slot', async () => {
        const client = createClient().use(litesvm());

        const slot = await client.rpc.getSlot().send();
        expect(typeof slot).toBe('bigint');
        expect(slot).toBeGreaterThanOrEqual(0n);
    });

    it('can request an airdrop', async () => {
        const client = createClient().use(litesvm());
        const recipientAddress = await generateKeyPairSigner().then(signer => signer.address);

        const signature = await client.rpc.requestAirdrop(recipientAddress, lamports(1_000_000_000n)).send();
        expect(typeof signature).toBe('string');
        expect(signature.length).toBeGreaterThan(0);

        // Verify the balance increased.
        const { value: balance } = await client.rpc.getBalance(recipientAddress).send();
        expect(balance).toBe(lamports(1_000_000_000n));
    });

    it('can fetch the accounts owned by a program', async () => {
        const client = createClient().use(litesvm());
        const [ownedA, ownedB, ownedOther] = await Promise.all([
            generateKeyPairSigner().then(signer => signer.address),
            generateKeyPairSigner().then(signer => signer.address),
            generateKeyPairSigner().then(signer => signer.address),
        ]);
        const programAddress = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
        const otherProgram = address('11111111111111111111111111111111');

        client.svm.setAccount(makeAccount(ownedA, new Uint8Array([1, 2, 3, 4]), programAddress));
        client.svm.setAccount(makeAccount(ownedB, new Uint8Array([5, 6]), programAddress));
        client.svm.setAccount(makeAccount(ownedOther, new Uint8Array([9]), otherProgram));

        const accounts = await client.rpc.getProgramAccounts(programAddress, { encoding: 'base64' }).send();
        expect(new Set(accounts.map(a => a.pubkey))).toStrictEqual(new Set([ownedA, ownedB]));
        for (const { account } of accounts) {
            expect(account.owner).toBe(programAddress);
            expect(account.data[1]).toBe('base64');
        }
    });

    it('applies a dataSize filter to the accounts owned by a program', async () => {
        const client = createClient().use(litesvm());
        const [addressA, addressB] = await Promise.all([
            generateKeyPairSigner().then(signer => signer.address),
            generateKeyPairSigner().then(signer => signer.address),
        ]);
        const programAddress = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

        client.svm.setAccount(makeAccount(addressA, new Uint8Array([1, 2, 3, 4]), programAddress));
        client.svm.setAccount(makeAccount(addressB, new Uint8Array([1, 2]), programAddress));

        const accounts = await client.rpc
            .getProgramAccounts(programAddress, { encoding: 'base64', filters: [{ dataSize: 4n }] })
            .send();
        expect(accounts).toHaveLength(1);
        expect(accounts[0].pubkey).toBe(addressA);
    });

    it('applies a memcmp filter to the accounts owned by a program', async () => {
        const client = createClient().use(litesvm());
        const [addressA, addressB] = await Promise.all([
            generateKeyPairSigner().then(signer => signer.address),
            generateKeyPairSigner().then(signer => signer.address),
        ]);
        const programAddress = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

        client.svm.setAccount(makeAccount(addressA, new Uint8Array([7, 8, 9, 10]), programAddress));
        client.svm.setAccount(makeAccount(addressB, new Uint8Array([0, 0, 9, 10]), programAddress));

        const bytes = getBase58Decoder().decode(new Uint8Array([9, 10])) as Base58EncodedBytes;
        const accounts = await client.rpc
            .getProgramAccounts(programAddress, {
                encoding: 'base64',
                filters: [{ memcmp: { bytes, encoding: 'base58', offset: 2n } }],
            })
            .send();
        expect(new Set(accounts.map(a => a.pubkey))).toStrictEqual(new Set([addressA, addressB]));

        const noMatch = await client.rpc
            .getProgramAccounts(programAddress, {
                encoding: 'base64',
                filters: [{ memcmp: { bytes, encoding: 'base58', offset: 0n } }],
            })
            .send();
        expect(noMatch).toHaveLength(0);
    });

    it('slices the data of the accounts owned by a program while preserving the full account space', async () => {
        const client = createClient().use(litesvm());
        const accountAddress = await generateKeyPairSigner().then(signer => signer.address);
        const programAddress = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

        client.svm.setAccount(makeAccount(accountAddress, new Uint8Array([10, 20, 30, 40]), programAddress));

        const accounts = await client.rpc
            .getProgramAccounts(programAddress, { dataSlice: { length: 2, offset: 1 }, encoding: 'base64' })
            .send();
        expect(accounts).toHaveLength(1);
        expect(accounts[0].account.data).toStrictEqual(['FB4=', 'base64']);
        expect(accounts[0].account.space).toBe(4n);
    });

    it('throws when requesting a non-base64 encoding for the accounts owned by a program', async () => {
        const client = createClient().use(litesvm());
        const accountAddress = await generateKeyPairSigner().then(signer => signer.address);
        const programAddress = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

        client.svm.setAccount(makeAccount(accountAddress, new Uint8Array([1, 2, 3, 4]), programAddress));

        const promise = client.rpc.getProgramAccounts(programAddress, { encoding: 'base58' }).send();
        await expect(promise).rejects.toThrow("Please use 'base64' encoding when using LiteSVM RPC");
    });

    it('wraps the accounts owned by a program result in a context when withContext is true', async () => {
        const client = createClient().use(litesvm());
        const accountAddress = await generateKeyPairSigner().then(signer => signer.address);
        const programAddress = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

        client.svm.setAccount(makeAccount(accountAddress, new Uint8Array([1]), programAddress));

        const response = await client.rpc
            .getProgramAccounts(programAddress, { encoding: 'base64', withContext: true })
            .send();
        expect(typeof response.context.slot).toBe('bigint');
        expect(response.value).toHaveLength(1);
    });

    it('throws when calling an unsupported RPC method', async () => {
        const client = createClient().use(litesvm());
        const rpc = client.rpc as unknown as Rpc<{ unsupportedMethod: () => unknown }>;
        const promise = rpc.unsupportedMethod().send();
        await expect(promise).rejects.toThrow('Unsupported RPC method for LiteSVM client: unsupportedMethod');
    });
});

function makeAccount(address: Address, data: Uint8Array, programAddress: Address): EncodedAccount {
    return {
        address,
        data,
        executable: false,
        lamports: lamports(1_000_000n),
        programAddress,
        space: BigInt(data.length),
    };
}
