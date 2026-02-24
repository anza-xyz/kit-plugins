export type { FailedTransactionMetadata, TransactionMetadata } from '@loris-sandbox/litesvm-kit';
export type { LiteSVM, LiteSvmRpcApi } from './litesvm';

export function litesvm(): <T extends object>(_client: T) => never {
    throw new Error(
        'The `litesvm` plugin is unavailable in browser and react-native. ' +
            'Use this plugin in a node environment instead.',
    );
}

export * from './transaction-error';
export * from './transaction-plan-executor';
export * from './transaction-planner';
