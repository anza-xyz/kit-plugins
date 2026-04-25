// Client + chain context
export {
    ChainContext,
    ClientContext,
    KitClientProvider,
    useChain,
    useClient,
    type ChainIdentifier,
    type KitClientProviderProps,
    type SolanaChain,
} from './client-context';

// Runtime-checked capability narrowing
export { useClientCapability, type UseClientCapabilityOptions } from './client-capability';

// Errors
export { isAbortError } from './kit-prereqs';

// Signer hooks
export { useIdentity, usePayer } from './hooks/signers';

// Live data
export { useBalance, createBalanceLiveData } from './hooks/use-balance';
export { useAccount, createAccountLiveData } from './hooks/use-account';
export {
    createTransactionConfirmationLiveData,
    useTransactionConfirmation,
    type TransactionConfirmationStatus,
    type UseTransactionConfirmationOptions,
} from './hooks/use-transaction-confirmation';
export { createLiveDataSpec, useLiveData, type LiveDataSpec } from './hooks/use-live-data';
export { useSubscription, type ReactiveStreamSource } from './hooks/use-subscription';
export { useRequest, type ReactiveActionSource } from './hooks/use-request';
export type { LiveQueryResult } from './internal/live-query-result';
export type { UnwrapRpcResponse } from './internal/subscription-result';
export type { RequestResult } from './internal/request-result';

// Actions
export { useAction, type ActionResult } from './hooks/use-action';
export { useSendTransaction, useSendTransactions } from './hooks/use-send-transaction';
export { usePlanTransaction, usePlanTransactions } from './hooks/use-plan-transaction';
