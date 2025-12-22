import { createEmptyClient } from '@solana/kit';
import { airdrop } from '@solana/kit-plugin-airdrop';
import { litesvm } from '@solana/kit-plugin-litesvm';
import { localhostRpc } from '@solana/kit-plugin-rpc';

export function createDefaultLocalhostClient() {
    return createEmptyClient().use(localhostRpc()).use(airdrop());
}

export function createDefaultLiteSVMClient() {
    return createEmptyClient().use(litesvm()).use(airdrop());
}
