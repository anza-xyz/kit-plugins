import { createClient, KeyPairSigner } from '@solana/kit';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { identityFromFile, payerFromFile, signerFromFile } from '../src';

const MOCK_KEYPAIR_PATH = 'test/mock_payer.json';
const EXPECTED_ADDRESS = '3b7YkAKJ9H2qAAaQp3xYeTWguN9Cha52SegAZLZUWQsZ';

describe('signerFromFile', () => {
    if (__NODEJS__) {
        it('loads a keypair from file and sets it as both payer and identity', async () => {
            const client = await createClient().use(signerFromFile(MOCK_KEYPAIR_PATH));
            expect(client).toHaveProperty('payer');
            expect(client).toHaveProperty('identity');
            expect(client.payer).toBeTypeOf('object');
            expect(client.payer).toBe(client.identity);
            expectTypeOf(client.payer).toEqualTypeOf<KeyPairSigner>();
            expect(client.payer.address).toBe(EXPECTED_ADDRESS);
            expect(client.identity.address).toBe(EXPECTED_ADDRESS);
        });
    } else {
        it('throws an error when used in non-Node.js environments', () => {
            expect(() => signerFromFile(MOCK_KEYPAIR_PATH)).toThrowError(
                '`signerFromFile` is only supported in Node.js environments',
            );
        });
    }
});

describe('payerFromFile', () => {
    if (__NODEJS__) {
        it('loads a keypair from file and sets it as payer', async () => {
            const client = await createClient().use(payerFromFile(MOCK_KEYPAIR_PATH));
            expect(client).toHaveProperty('payer');
            expect(client.payer).toBeTypeOf('object');
            expectTypeOf(client.payer).toEqualTypeOf<KeyPairSigner>();
            expect(client.payer.address).toBe(EXPECTED_ADDRESS);
        });
    } else {
        it('throws an error when used in non-Node.js environments', () => {
            expect(() => payerFromFile(MOCK_KEYPAIR_PATH)).toThrowError(
                '`payerFromFile` is only supported in Node.js environments',
            );
        });
    }
});

describe('identityFromFile', () => {
    if (__NODEJS__) {
        it('loads a keypair from file and sets it as identity', async () => {
            const client = await createClient().use(identityFromFile(MOCK_KEYPAIR_PATH));
            expect(client).toHaveProperty('identity');
            expect(client.identity).toBeTypeOf('object');
            expectTypeOf(client.identity).toEqualTypeOf<KeyPairSigner>();
            expect(client.identity.address).toBe(EXPECTED_ADDRESS);
        });
    } else {
        it('throws an error when used in non-Node.js environments', () => {
            expect(() => identityFromFile(MOCK_KEYPAIR_PATH)).toThrowError(
                '`identityFromFile` is only supported in Node.js environments',
            );
        });
    }
});
