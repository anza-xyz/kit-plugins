import type { ClientWithTransactionPlanning, ClientWithTransactionSending } from '@solana/kit';

import { usePlanTransaction, usePlanTransactions, useSendTransaction, useSendTransactions } from '../index';

// NB: hooks are only type-checked here, never executed.

// [DESCRIBE] useSendTransaction
{
    const action = useSendTransaction();
    // dispatch takes exactly the send input; data matches the client method's resolved value.
    type Input = Parameters<ClientWithTransactionSending['sendTransaction']>[0];
    type Result = Awaited<ReturnType<ClientWithTransactionSending['sendTransaction']>>;
    action.dispatch(null as unknown as Input);
    action.data satisfies Result | undefined;
    // @ts-expect-error dispatch requires the input argument.
    action.dispatch();
    // @ts-expect-error dispatch takes only the input; there is no per-call config (the hook owns the abort signal).
    action.dispatch(null as unknown as Input, {});
}

// [DESCRIBE] useSendTransactions
{
    const action = useSendTransactions();
    type Input = Parameters<ClientWithTransactionSending['sendTransactions']>[0];
    type Result = Awaited<ReturnType<ClientWithTransactionSending['sendTransactions']>>;
    action.dispatch(null as unknown as Input);
    action.data satisfies Result | undefined;
}

// [DESCRIBE] usePlanTransaction
{
    const action = usePlanTransaction();
    type Input = Parameters<ClientWithTransactionPlanning['planTransaction']>[0];
    type Result = Awaited<ReturnType<ClientWithTransactionPlanning['planTransaction']>>;
    action.dispatch(null as unknown as Input);
    action.data satisfies Result | undefined;
}

// [DESCRIBE] usePlanTransactions
{
    const action = usePlanTransactions();
    type Input = Parameters<ClientWithTransactionPlanning['planTransactions']>[0];
    type Result = Awaited<ReturnType<ClientWithTransactionPlanning['planTransactions']>>;
    action.dispatch(null as unknown as Input);
    action.data satisfies Result | undefined;
}
