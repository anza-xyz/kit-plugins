import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { createClient, KeyPairSigner } from '@solana/kit';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { identityFromFile, payerFromFile, signerFromFile } from '../src';

vi.mock('node:os', async () => {
    const actual = await vi.importActual<typeof import('node:os')>('node:os');
    return { ...actual, homedir: vi.fn(actual.homedir) };
});

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

        it('expands a leading `~` to the home directory', async () => {
            vi.stubEnv('HOME', resolve('test'));
            vi.stubEnv('USERPROFILE', resolve('test'));
            try {
                const client = await createClient().use(signerFromFile('~/mock_payer.json'));
                expect(client.payer.address).toBe(EXPECTED_ADDRESS);
            } finally {
                vi.unstubAllEnvs();
            }
        });

        it('throws when `~` cannot be expanded because the home directory is unknown', async () => {
            vi.mocked(homedir).mockReturnValueOnce('');
            await expect(createClient().use(signerFromFile('~/mock_payer.json'))).rejects.toThrow(
                'Cannot expand `~` in `~/mock_payer.json`: the home directory could not be determined.',
            );
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
