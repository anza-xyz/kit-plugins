import { TransactionSigner } from '@solana/kit';

/**
 * Creates a default LiteSVM client for local blockchain simulation.
 *
 * @throws Always throws in browser and React Native environments because LiteSVM
 * relies on Node.js APIs.
 */
export function createDefaultLiteSVMClient(_config?: { payer?: TransactionSigner }): never {
    throw new Error(
        'The `createDefaultLiteSVMClient` function is unavailable in browser and react-native. ' +
            'Use this function in a node environment instead.',
    );
}
