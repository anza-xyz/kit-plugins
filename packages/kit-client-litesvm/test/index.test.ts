import {
    ClientWithAirdrop,
    ClientWithRpc,
    TransactionPlanExecutor,
    TransactionPlanner,
    TransactionSigner,
} from '@solana/kit';
import type {
    FailedTransactionMetadata,
    LiteSVM,
    LiteSvmRpcApi,
    TransactionMetadata,
} from '@solana/kit-plugin-litesvm';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { createClient as nodeCreateClient } from '../src/index';
import { createClient as browserCreateClient } from '../src/index.browser';
const createClient = __NODEJS__ ? nodeCreateClient : browserCreateClient;

describe('createClient', () => {
    if (!__NODEJS__) {
        it('it throws in browser builds', () => {
            expect(() => createClient()).toThrow(
                'The LiteSVM `createClient` function is unavailable in browser and react-native',
            );
        });
        return;
    }

    it('it offers a LiteSVM instance', async () => {
        const client = await createClient();
        expect(client.svm).toBeTypeOf('object');
        expectTypeOf(client.svm).toEqualTypeOf<LiteSVM>();
    });

    it('it offers an RPC subset', async () => {
        const client = await createClient();
        expect(client.rpc).toBeTypeOf('object');
        expectTypeOf(client).toMatchObjectType<ClientWithRpc<LiteSvmRpcApi>>();
    });

    it('it offers an airdrop function', async () => {
        const client = await createClient();
        expect(client.airdrop).toBeTypeOf('function');
        expectTypeOf(client).toMatchObjectType<ClientWithAirdrop>();
    });

    it('it generates a new payer by default', async () => {
        const client = await createClient();
        expect(client.payer).toBeTypeOf('object');
        expectTypeOf(client.payer).toEqualTypeOf<TransactionSigner>();
    });

    it('it uses the provided payer', async () => {
        const payer = {} as TransactionSigner;
        const client = await createClient({ payer });
        expect(client.payer).toBe(payer);
    });

    it('it offers a default transaction planner', async () => {
        const client = await createClient();
        expect(client.transactionPlanner).toBeTypeOf('function');
        expectTypeOf(client.transactionPlanner).toEqualTypeOf<TransactionPlanner>();
    });

    it('it offers a default transaction plan executor', async () => {
        const client = await createClient();
        expect(client.transactionPlanExecutor).toBeTypeOf('function');
        expectTypeOf(client.transactionPlanExecutor).toEqualTypeOf<
            TransactionPlanExecutor<{ transactionMetadata: FailedTransactionMetadata | TransactionMetadata }>
        >();
    });

    it('it provide helper functions to send transactions', async () => {
        const client = await createClient();
        expect(client.sendTransactions).toBeTypeOf('function');
        expect(client.sendTransaction).toBeTypeOf('function');
    });
});
