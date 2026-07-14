import type { ReadonlyUint8Array, SignatureBytes } from '@solana/kit';
import type { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
import type { ReactNode } from 'react';

import type { ClientWithWallet, WalletState, WalletStatus } from '../../types';
import {
    useConnect,
    useConnectedWallet,
    useDisconnect,
    useIsWalletReady,
    useSelectAccount,
    useSignIn,
    useSignMessage,
    useWallets,
    WalletReadyGate,
    type WalletReadyGateProps,
    useWalletStatus,
} from '../index';

// NB: hooks are only type-checked here, never executed.

// Every hook takes the client with a wallet plugin installed as its first argument.
const client = null as unknown as ClientWithWallet;

// [DESCRIBE] useWalletStatus
{
    const status = useWalletStatus(client);
    status satisfies WalletStatus;
    // @ts-expect-error the client argument is required.
    useWalletStatus();
}

// [DESCRIBE] useIsWalletReady
{
    const isReady = useIsWalletReady(client);
    isReady satisfies boolean;
}

// [DESCRIBE] WalletReadyGate
{
    // `children`, `client`, and `fallback` are all required props.
    ({ children: 'ready', client, fallback: 'loading' }) satisfies WalletReadyGateProps;
    // The gate is callable and its return type is assignable to `ReactNode`.
    const rendered: ReactNode = WalletReadyGate({ children: null, client, fallback: null });
    void rendered;
}
{
    // @ts-expect-error `client` is required.
    ({ children: null, fallback: null }) satisfies WalletReadyGateProps;
}
{
    // @ts-expect-error `fallback` is required.
    ({ children: null, client }) satisfies WalletReadyGateProps;
}

// [DESCRIBE] useConnectedWallet
{
    const connected = useConnectedWallet(client);
    connected satisfies WalletState['connected'];
    // The connection is nullable when disconnected.
    connected satisfies { account: UiWalletAccount } | null;
}

// [DESCRIBE] useWallets
{
    const wallets = useWallets(client);
    wallets satisfies readonly UiWallet[];
}

// [DESCRIBE] useConnect
{
    const action = useConnect(client);
    action.dispatch(null as unknown as UiWallet);
    action.data satisfies readonly UiWalletAccount[] | undefined;
    // @ts-expect-error dispatch requires the wallet argument.
    action.dispatch();
}

// [DESCRIBE] useDisconnect
{
    const action = useDisconnect(client);
    // The wallet argument is optional — omit it to disconnect the active wallet.
    action.dispatch();
    // Or pass a specific wallet to deauthorize.
    action.dispatch(null as unknown as UiWallet);
    action.data satisfies void | undefined;
}

// [DESCRIBE] useSignIn
{
    const action = useSignIn(client);
    action.dispatch(null as unknown as UiWallet, null as unknown as SolanaSignInInput);
    action.data satisfies SolanaSignInOutput | undefined;
    // @ts-expect-error dispatch requires both the wallet and the sign-in input.
    action.dispatch(null as unknown as UiWallet);
}

// [DESCRIBE] useSignMessage
{
    const action = useSignMessage(client);
    action.dispatch(new Uint8Array());
    action.data satisfies SignatureBytes | undefined;
}
{
    // dispatch accepts a ReadonlyUint8Array (e.g. codec output) without a cast.
    const action = useSignMessage(client);
    action.dispatch(null as unknown as ReadonlyUint8Array);
}

// [DESCRIBE] useSelectAccount
{
    const selectAccount = useSelectAccount(client);
    selectAccount(null as unknown as UiWalletAccount) satisfies void;
    // @ts-expect-error selectAccount requires the account argument.
    selectAccount();
}
