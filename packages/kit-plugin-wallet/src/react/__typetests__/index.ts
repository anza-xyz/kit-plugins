import type { SignatureBytes } from '@solana/kit';
import type { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';

import type { WalletState, WalletStatus } from '../../types';
import {
    useConnect,
    useConnectedWallet,
    useDisconnect,
    useSelectAccount,
    useSignIn,
    useSignMessage,
    useWallets,
    useWalletStatus,
} from '../index';

// NB: hooks are only type-checked here, never executed.

// [DESCRIBE] useWalletStatus
{
    const status = useWalletStatus();
    status satisfies WalletStatus;
}

// [DESCRIBE] useConnectedWallet
{
    const connected = useConnectedWallet();
    connected satisfies WalletState['connected'];
    // The connection is nullable when disconnected.
    connected satisfies { account: UiWalletAccount } | null;
}

// [DESCRIBE] useWallets
{
    const wallets = useWallets();
    wallets satisfies readonly UiWallet[];
}

// [DESCRIBE] useConnect
{
    const action = useConnect();
    action.dispatch(null as unknown as UiWallet);
    action.data satisfies readonly UiWalletAccount[] | undefined;
    // @ts-expect-error dispatch requires the wallet argument.
    action.dispatch();
}

// [DESCRIBE] useDisconnect
{
    const action = useDisconnect();
    action.dispatch();
    action.data satisfies void | undefined;
}

// [DESCRIBE] useSignIn
{
    const action = useSignIn();
    action.dispatch(null as unknown as UiWallet, null as unknown as SolanaSignInInput);
    action.data satisfies SolanaSignInOutput | undefined;
    // @ts-expect-error dispatch requires both the wallet and the sign-in input.
    action.dispatch(null as unknown as UiWallet);
}

// [DESCRIBE] useSignMessage
{
    const action = useSignMessage();
    action.dispatch(new Uint8Array());
    action.data satisfies SignatureBytes | undefined;
}

// [DESCRIBE] useSelectAccount
{
    const selectAccount = useSelectAccount();
    selectAccount(null as unknown as UiWalletAccount) satisfies void;
    // @ts-expect-error selectAccount requires the account argument.
    selectAccount();
}
