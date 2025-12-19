import { Rpc, RpcSubscriptions, SolanaRpcApi, SolanaRpcSubscriptionsApi } from '@solana/kit';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { createDefaultLiteSVMClient, createDefaultLocalhostClient, type LiteSVM, RpcFromLiteSVM } from '../src';

describe('createDefaultLocalhostClient', () => {
    it('it offers an RPC client', () => {
        const client = createDefaultLocalhostClient();
        expect(client.rpc).toBeTypeOf('object');
        expectTypeOf(client.rpc).toEqualTypeOf<Rpc<SolanaRpcApi>>();
    });

    it('it offers an RPC Subscriptions client', () => {
        const client = createDefaultLocalhostClient();
        expect(client.rpcSubscriptions).toBeTypeOf('object');
        expectTypeOf(client.rpcSubscriptions).toEqualTypeOf<RpcSubscriptions<SolanaRpcSubscriptionsApi>>();
    });
});

describe('createDefaultLiteSVMClient', () => {
    it('it offers a LiteSVM instance', () => {
        const client = createDefaultLiteSVMClient();
        expect(client.svm).toBeTypeOf('object');
        expectTypeOf(client.svm).toEqualTypeOf<LiteSVM>();
    });

    it('it offers an RPC subset', () => {
        const client = createDefaultLiteSVMClient();
        expect(client.rpc).toBeTypeOf('object');
        expectTypeOf(client.rpc).toEqualTypeOf<RpcFromLiteSVM>();
    });
});
