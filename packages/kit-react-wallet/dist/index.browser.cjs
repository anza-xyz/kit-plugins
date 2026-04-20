'use strict';

var kitPluginWallet = require('@solana/kit-plugin-wallet');
var kitReact = require('@solana/kit-react');
var react = require('react');
var jsxRuntime = require('react/jsx-runtime');

// src/wallet-provider.tsx
function WalletProvider({
  autoConnect,
  children,
  filter,
  role = "signer",
  storage,
  storageKey
}) {
  const chain = kitReact.useChain();
  const parent = kitReact.useClient();
  const hasWallet = "wallet" in parent;
  react.useEffect(() => {
    if (process.env.NODE_ENV !== "production" && hasWallet) {
      console.warn(
        "<WalletProvider>: a wallet plugin is already installed on the client (detected `client.wallet`). Mounting WalletProvider on top of a client that already has a wallet plugin installs it twice and may produce inconsistent state. Either drop the <WalletProvider>, or build a KitClientProvider `client` without the baked-in wallet plugin."
      );
    }
  }, [hasWallet]);
  kitReact.useIdentityChurnWarning({
    consequence: "the wallet plugin is rebuilt on every render, which re-creates the wallet store and tears down discovery / the active connection.",
    props: { filter, storage, storageKey },
    providerName: "<WalletProvider>"
  });
  const plugin = react.useMemo(() => {
    const config = { autoConnect, chain, filter, storage, storageKey };
    switch (role) {
      case "identity":
        return kitPluginWallet.walletIdentity(config);
      case "none":
        return kitPluginWallet.walletWithoutSigner(config);
      case "payer":
        return kitPluginWallet.walletPayer(config);
      case "signer":
        return kitPluginWallet.walletSigner(config);
    }
  }, [role, chain, autoConnect, storage, storageKey, filter]);
  return /* @__PURE__ */ jsxRuntime.jsx(kitReact.PluginProvider, { plugin, children });
}
function useWalletClient(hookName) {
  return kitReact.useClientCapability({
    capability: "wallet",
    hookName,
    providerHint: "Usually supplied by <WalletProvider> \u2014 or any provider that installs a wallet plugin."
  });
}

// src/hooks/wallet-state.ts
function useWallets() {
  const client = useWalletClient("useWallets");
  return react.useSyncExternalStore(
    client.wallet.subscribe,
    () => client.wallet.getState().wallets,
    () => client.wallet.getState().wallets
  );
}
function useWalletStatus() {
  const client = useWalletClient("useWalletStatus");
  return react.useSyncExternalStore(
    client.wallet.subscribe,
    () => client.wallet.getState().status,
    () => client.wallet.getState().status
  );
}
function useConnectedWallet() {
  const client = useWalletClient("useConnectedWallet");
  const lastRef = react.useRef(null);
  const getSnapshot = () => {
    const connected = client.wallet.getState().connected;
    if (connected === null) {
      lastRef.current = null;
      return null;
    }
    const prev = lastRef.current;
    if (prev !== null && prev.account === connected.account && prev.wallet === connected.wallet) {
      return prev;
    }
    const next = { account: connected.account, wallet: connected.wallet };
    lastRef.current = next;
    return next;
  };
  return react.useSyncExternalStore(client.wallet.subscribe, getSnapshot, getSnapshot);
}
function useWalletSigner() {
  const client = useWalletClient("useWalletSigner");
  const getSnapshot = () => client.wallet.getState().connected?.signer ?? null;
  return react.useSyncExternalStore(client.wallet.subscribe, getSnapshot, getSnapshot);
}
function useWalletState() {
  const client = useWalletClient("useWalletState");
  return react.useSyncExternalStore(client.wallet.subscribe, client.wallet.getState, client.wallet.getState);
}
function useConnectWallet() {
  const client = useWalletClient("useConnectWallet");
  return react.useCallback((wallet) => client.wallet.connect(wallet), [client]);
}
function useDisconnectWallet() {
  const client = useWalletClient("useDisconnectWallet");
  return react.useCallback(() => client.wallet.disconnect(), [client]);
}
function useSelectAccount() {
  const client = useWalletClient("useSelectAccount");
  return react.useCallback((account) => client.wallet.selectAccount(account), [client]);
}
function useSignMessage() {
  const client = useWalletClient("useSignMessage");
  return react.useCallback((message) => client.wallet.signMessage(message), [client]);
}
function useSignIn() {
  const client = useWalletClient("useSignIn");
  return react.useCallback(
    (wallet, input = {}) => client.wallet.signIn(wallet, input),
    [client]
  );
}

exports.WalletProvider = WalletProvider;
exports.useConnectWallet = useConnectWallet;
exports.useConnectedWallet = useConnectedWallet;
exports.useDisconnectWallet = useDisconnectWallet;
exports.useSelectAccount = useSelectAccount;
exports.useSignIn = useSignIn;
exports.useSignMessage = useSignMessage;
exports.useWalletSigner = useWalletSigner;
exports.useWalletState = useWalletState;
exports.useWalletStatus = useWalletStatus;
exports.useWallets = useWallets;
//# sourceMappingURL=index.browser.cjs.map
//# sourceMappingURL=index.browser.cjs.map