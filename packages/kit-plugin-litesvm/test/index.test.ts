import { LiteSVM } from '@loris-sandbox/litesvm-kit';
import {
    createEmptyClient,
    GetAccountInfoApi,
    GetBalanceApi,
    GetEpochScheduleApi,
    GetLatestBlockhashApi,
    GetMinimumBalanceForRentExemptionApi,
    GetMultipleAccountsApi,
    GetSlotApi,
    RequestAirdropApi,
    Rpc,
} from '@solana/kit';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { litesvm as nodeLitesvm } from '../src/index';
import { litesvm as browserLitesvm } from '../src/index.browser';
const litesvm = __NODEJS__ ? nodeLitesvm : browserLitesvm;

describe('litesvm', () => {
    if (!__NODEJS__) {
        it('it throws in browser builds', () => {
            expect(() => litesvm()).toThrow('The `litesvm` plugin is unavailable in browser and react-native');
        });
        return;
    }

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
        expect(client.rpc.getBalance).toBeTypeOf('function');
        expect(client.rpc.getEpochSchedule).toBeTypeOf('function');
        expect(client.rpc.getLatestBlockhash).toBeTypeOf('function');
        expect(client.rpc.getMinimumBalanceForRentExemption).toBeTypeOf('function');
        expect(client.rpc.getMultipleAccounts).toBeTypeOf('function');
        expect(client.rpc.getSlot).toBeTypeOf('function');
        expect(client.rpc.requestAirdrop).toBeTypeOf('function');
        expectTypeOf(client.rpc).toEqualTypeOf<
            Rpc<
                GetAccountInfoApi &
                    GetBalanceApi &
                    GetEpochScheduleApi &
                    GetLatestBlockhashApi &
                    GetMinimumBalanceForRentExemptionApi &
                    GetMultipleAccountsApi &
                    GetSlotApi &
                    RequestAirdropApi
            >
        >();
    });
});
