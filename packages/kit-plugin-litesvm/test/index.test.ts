import { LiteSVM } from '@loris-sandbox/litesvm-kit';
import {
    address,
    generateKeyPairSigner,
    GetAccountInfoApi,
    GetLatestBlockhashApi,
    GetMultipleAccountsApi,
    lamports,
    Rpc,
} from '@solana/kit';
import { createEmptyClient } from '@solana/plugin-core';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { litesvm } from '../src';

describe('litesvm', () => {
    it('instantiates and attaches a new LiteSVM client', () => {
        const client = createEmptyClient().use(litesvm());
        expect(client).toHaveProperty('svm');
        expect(client.svm).toBeInstanceOf(LiteSVM);
    });

    it('derives a small RPC from the LiteSVM client', () => {
        const client = createEmptyClient().use(litesvm());
        expect(client).toHaveProperty('rpc');
        expect(client.rpc).toBeTypeOf('object');
        expect(client.rpc.getAccountInfo).toBeTypeOf('function');
        expect(client.rpc.getLatestBlockhash).toBeTypeOf('function');
        expect(client.rpc.getMultipleAccounts).toBeTypeOf('function');
        expectTypeOf(client.rpc).toEqualTypeOf<
            Rpc<GetAccountInfoApi & GetLatestBlockhashApi & GetMultipleAccountsApi>
        >();
    });

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

    it('can fetch a the latest blockhash', async () => {
        const client = createEmptyClient().use(litesvm());

        const { value } = await client.rpc.getLatestBlockhash({ commitment: 'finalized' }).send();
        expect(value).toStrictEqual({
            blockhash: client.svm.latestBlockhash(),
            lastValidBlockHeight: 0n,
        });
    });
});
