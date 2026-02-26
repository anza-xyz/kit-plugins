import { describe, expect, it } from 'vitest';

import { createDefaultLiteSVMClient, createDefaultLocalhostRpcClient, createDefaultRpcClient } from '../src';

describe('deprecated re-exports', () => {
    it('re-exports createDefaultRpcClient', () => {
        expect(createDefaultRpcClient).toBeTypeOf('function');
    });

    it('re-exports createDefaultLocalhostRpcClient', () => {
        expect(createDefaultLocalhostRpcClient).toBeTypeOf('function');
    });

    it('re-exports createDefaultLiteSVMClient', () => {
        expect(createDefaultLiteSVMClient).toBeTypeOf('function');
    });
});
