import { getSolanaErrorFromTransactionError } from '@solana/kit';

/**
 * A duck-typed interface for `FailedTransactionMetadata` from
 * `@loris-sandbox/litesvm-kit`. We avoid importing the class directly
 * because LiteSVM is a Node-only native module and this file must be
 * resolvable in browser builds.
 */
export type FailedTransactionResult = {
    err: () => unknown;
};

/**
 * The ordered names of the `TransactionErrorFieldless` enum variants
 * from `@loris-sandbox/litesvm-kit`. Each index corresponds to the
 * enum's numeric value and maps to the string name expected by
 * {@link getSolanaErrorFromTransactionError}.
 */
const TRANSACTION_ERROR_NAMES: readonly string[] = [
    'AccountInUse',
    'AccountLoadedTwice',
    'AccountNotFound',
    'ProgramAccountNotFound',
    'InsufficientFundsForFee',
    'InvalidAccountForFee',
    'AlreadyProcessed',
    'BlockhashNotFound',
    'CallChainTooDeep',
    'MissingSignatureForFee',
    'InvalidAccountIndex',
    'SignatureFailure',
    'InvalidProgramForExecution',
    'SanitizeFailure',
    'ClusterMaintenance',
    'AccountBorrowOutstanding',
    'WouldExceedMaxBlockCostLimit',
    'UnsupportedVersion',
    'InvalidWritableAccount',
    'WouldExceedMaxAccountCostLimit',
    'WouldExceedAccountDataBlockLimit',
    'TooManyAccountLocks',
    'AddressLookupTableNotFound',
    'InvalidAddressLookupTableOwner',
    'InvalidAddressLookupTableData',
    'InvalidAddressLookupTableIndex',
    'InvalidRentPayingAccount',
    'WouldExceedMaxVoteCostLimit',
    'WouldExceedAccountDataTotalLimit',
    'MaxLoadedAccountsDataSizeExceeded',
    'ResanitizationNeeded',
    'InvalidLoadedAccountsDataSizeLimit',
    'UnbalancedTransaction',
    'ProgramCacheHitMaxLimit',
    'CommitCancelled',
];

/**
 * The ordered names of the `InstructionErrorFieldless` enum variants
 * from `@loris-sandbox/litesvm-kit`. Each index corresponds to the
 * enum's numeric value and maps to the string name expected by
 * {@link getSolanaErrorFromTransactionError}.
 */
const INSTRUCTION_ERROR_NAMES: readonly string[] = [
    'GenericError',
    'InvalidArgument',
    'InvalidInstructionData',
    'InvalidAccountData',
    'AccountDataTooSmall',
    'InsufficientFunds',
    'IncorrectProgramId',
    'MissingRequiredSignature',
    'AccountAlreadyInitialized',
    'UninitializedAccount',
    'UnbalancedInstruction',
    'ModifiedProgramId',
    'ExternalAccountLamportSpend',
    'ExternalAccountDataModified',
    'ReadonlyLamportChange',
    'ReadonlyDataModified',
    'DuplicateAccountIndex',
    'ExecutableModified',
    'RentEpochModified',
    'NotEnoughAccountKeys',
    'AccountDataSizeChanged',
    'AccountNotExecutable',
    'AccountBorrowFailed',
    'AccountBorrowOutstanding',
    'DuplicateAccountOutOfSync',
    'InvalidError',
    'ExecutableDataModified',
    'ExecutableLamportChange',
    'ExecutableAccountNotRentExempt',
    'UnsupportedProgramId',
    'CallDepth',
    'MissingAccount',
    'ReentrancyNotAllowed',
    'MaxSeedLengthExceeded',
    'InvalidSeeds',
    'InvalidRealloc',
    'ComputationalBudgetExceeded',
    'PrivilegeEscalation',
    'ProgramEnvironmentSetupFailure',
    'ProgramFailedToComplete',
    'ProgramFailedToCompile',
    'Immutable',
    'IncorrectAuthority',
    'AccountNotRentExempt',
    'InvalidAccountOwner',
    'ArithmeticOverflow',
    'UnsupportedSysvar',
    'IllegalOwner',
    'MaxAccountsDataAllocationsExceeded',
    'MaxAccountsExceeded',
    'MaxInstructionTraceLengthExceeded',
    'BuiltinProgramsMustConsumeComputeUnits',
    'BorshIoError',
];

/**
 * Converts a failed transaction result from LiteSVM into a `SolanaError`
 * using the same error codes that the RPC would produce.
 *
 * This allows consumers to handle transaction errors consistently
 * regardless of whether they are using an RPC or LiteSVM executor.
 *
 * @param failed - The failed transaction result from LiteSVM.
 * @returns A `SolanaError` with the appropriate transaction error code.
 */
export function getSolanaErrorFromLiteSvmFailure(failed: FailedTransactionResult) {
    const err = failed.err();
    const transactionError = convertTransactionError(err);
    return getSolanaErrorFromTransactionError(transactionError);
}

/**
 * Converts a LiteSVM transaction error into the format expected by
 * `getSolanaErrorFromTransactionError` from `@solana/errors`.
 *
 * The format mirrors the JSON encoding of Rust's `TransactionError` enum
 * as returned by the Solana RPC:
 * - Fieldless variants become plain strings (e.g. `"AccountNotFound"`).
 * - `InstructionError` becomes `{ InstructionError: [index, innerErr] }`.
 * - `DuplicateInstruction` becomes `{ DuplicateInstruction: index }`.
 * - `InsufficientFundsForRent` / `ProgramExecutionTemporarilyRestricted`
 *   become `{ VariantName: { account_index: n } }`.
 */
function convertTransactionError(err: unknown): string | { [key: string]: unknown } {
    // Fieldless enum variant — a plain number at runtime.
    if (typeof err === 'number') {
        return TRANSACTION_ERROR_NAMES[err] ?? `Unknown(${err})`;
    }

    if (typeof err !== 'object' || err === null) {
        return String(err);
    }

    // Class-based variants — use constructor name to distinguish.
    // This is safe because LiteSVM is a Node-only native module
    // and Node code is not subject to minification.
    const name = err.constructor.name;

    if (name === 'TransactionErrorInstructionError') {
        const instructionErr = err as { err: () => unknown; index: number };
        return { InstructionError: [instructionErr.index, convertInstructionError(instructionErr.err())] };
    }

    if (name === 'TransactionErrorDuplicateInstruction') {
        return { DuplicateInstruction: (err as { index: number }).index };
    }

    if (name === 'TransactionErrorInsufficientFundsForRent') {
        return { InsufficientFundsForRent: { account_index: (err as { accountIndex: number }).accountIndex } };
    }

    if (name === 'TransactionErrorProgramExecutionTemporarilyRestricted') {
        return {
            ProgramExecutionTemporarilyRestricted: {
                account_index: (err as { accountIndex: number }).accountIndex,
            },
        };
    }

    // Fallback — should not be reached.
    return `Unknown(${err.constructor.name})`;
}

/**
 * Converts a LiteSVM instruction error into the format expected by
 * `getSolanaErrorFromTransactionError` from `@solana/errors`.
 *
 * - Fieldless variants become plain strings (e.g. `"InvalidInstructionData"`).
 * - Custom program errors become `{ Custom: code }`.
 * - BorshIo errors become `{ BorshIoError: msg }`.
 */
function convertInstructionError(err: unknown): string | { [key: string]: unknown } {
    // Fieldless enum variant — a plain number at runtime.
    if (typeof err === 'number') {
        return INSTRUCTION_ERROR_NAMES[err] ?? `Unknown(${err})`;
    }

    if (typeof err === 'object' && err !== null) {
        const name = err.constructor.name;

        if (name === 'InstructionErrorCustom') {
            return { Custom: (err as { code: number }).code };
        }

        if (name === 'InstructionErrorBorshIo') {
            return { BorshIoError: (err as { msg: string }).msg };
        }
    }

    // Fallback — should not be reached.
    return String(err);
}
