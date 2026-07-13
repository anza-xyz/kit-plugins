---
'@solana/kit-plugin-wallet': minor
---

Add a `@solana/kit-plugin-wallet/react` subpath exposing React hooks for wallet state and actions. State hooks (`useWalletStatus`, `useConnectedWallet`, `useWallets`) subscribe to individual slices of `WalletState` via `useSyncExternalStore`; action hooks (`useConnect`, `useDisconnect`, `useSignIn`, `useSignMessage`, `useSelectAccount`) wrap the wallet actions. `react` and `@solana/react` are optional peer dependencies, so the default entry point is unchanged.

```tsx
import { useConnect, useConnectedWallet, useWallets, useWalletStatus } from '@solana/kit-plugin-wallet/react';

function WalletButton() {
    const status = useWalletStatus();
    const wallets = useWallets();
    const connected = useConnectedWallet();
    const { dispatch: connect, isRunning } = useConnect();

    if (status === 'pending') return null;
    if (connected) return <p>Connected: {connected.account.address}</p>;

    return wallets.map(wallet => (
        <button key={wallet.name} disabled={isRunning} onClick={() => connect(wallet)}>
            Connect {wallet.name}
        </button>
    ));
}
```
