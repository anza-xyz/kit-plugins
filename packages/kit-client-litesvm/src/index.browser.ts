import { TransactionSigner } from '@solana/kit';

// Re-export types that appear in the `createClient` return type to make them type-portable.
export type {
    FailedTransactionMetadata,
    LiteSVM,
    LiteSvmRpcApi,
    TransactionMetadata,
} from '@solana/kit-plugin-litesvm';

/**
 * Creates a default LiteSVM client for local blockchain simulation.
 *
 * @throws Always throws in browser and React Native environments because LiteSVM
 * relies on Node.js APIs.
 */
export function createClient(_config?: { payer?: TransactionSigner }): never {
    throw new Error(
        'The LiteSVM `createClient` function is unavailable in browser and react-native. ' +
            'Use this function in a node environment instead.',
    );
}
