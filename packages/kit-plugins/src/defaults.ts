import { litesvm } from '@solana/kit-plugin-litesvm';
import { localhostRpc } from '@solana/kit-plugin-rpc';
import { createEmptyClient } from '@solana/plugin-core';

export function createDefaultLocalhostClient() {
    return createEmptyClient().use(localhostRpc());
}

export function createDefaultLiteSVMClient() {
    return createEmptyClient().use(litesvm());
}
