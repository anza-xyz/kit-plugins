import { createClient as createLiteSVMClient } from '@solana/kit-client-litesvm';
import { createClient as createRpcClient, createLocalClient } from '@solana/kit-client-rpc';

/** @deprecated Use `createClient` from `@solana/kit-client-rpc` instead. */
export const createDefaultRpcClient = createRpcClient;

/** @deprecated Use `createLocalClient` from `@solana/kit-client-rpc` instead. */
export const createDefaultLocalhostRpcClient = createLocalClient;

/** @deprecated Use `createClient` from `@solana/kit-client-litesvm` instead. */
export const createDefaultLiteSVMClient = createLiteSVMClient;
