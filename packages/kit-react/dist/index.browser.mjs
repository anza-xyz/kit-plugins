import { createClient, createReactiveStoreWithInitialValueAndSlotTracking, parseBase64RpcAccount, decodeAccount } from '@solana/kit';
import { createContext, useContext, useMemo, useSyncExternalStore, useCallback, useState, useEffect, useRef } from 'react';
import { jsx } from 'react/jsx-runtime';
import { payer, identity } from '@solana/kit-plugin-signer';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { litesvm } from '@solana/kit-plugin-litesvm';
import { walletSigner, walletPayer, walletWithoutSigner, walletIdentity } from '@solana/kit-plugin-wallet';

// src/client-context.tsx

// src/internal/errors.ts
function throwMissingProvider(hookName, providerName) {
  throw new Error(
    `${hookName}() must be used within <${providerName}>. Wrap your component tree in <${providerName}> (or an ancestor provider that includes it).`
  );
}
var ClientContext = createContext(null);
ClientContext.displayName = "ClientContext";
var ChainContext = createContext(null);
ChainContext.displayName = "ChainContext";
function useClient() {
  const client = useContext(ClientContext);
  if (client === null) {
    throwMissingProvider("useClient", "KitClientProvider");
  }
  return client;
}
function useChain() {
  const chain = useContext(ChainContext);
  if (chain === null) {
    throwMissingProvider("useChain", "KitClientProvider");
  }
  return chain;
}
function KitClientProvider({ chain, children }) {
  const client = useMemo(() => createClient(), []);
  return /* @__PURE__ */ jsx(ChainContext.Provider, { value: chain, children: /* @__PURE__ */ jsx(ClientContext.Provider, { value: client, children }) });
}
function PluginProvider({ children, plugin, plugins }) {
  const parent = useClient();
  const list = plugin ? [plugin] : plugins;
  const extended = useMemo(
    () => list.reduce((acc, p) => acc.use(p), parent),
    // We intentionally depend on `parent` and each plugin identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parent, ...list]
  );
  return /* @__PURE__ */ jsx(ClientContext.Provider, { value: extended, children });
}
function PayerProvider({ children, signer }) {
  const plugin = useMemo(() => payer(signer), [signer]);
  return /* @__PURE__ */ jsx(PluginProvider, { plugin, children });
}
function IdentityProvider({ children, signer }) {
  const plugin = useMemo(() => identity(signer), [signer]);
  return /* @__PURE__ */ jsx(PluginProvider, { plugin, children });
}
function RpcProvider({ children, maxConcurrency, priorityFees, skipPreflight, url, wsUrl }) {
  const parent = useClient();
  if (!("payer" in parent)) {
    throw new Error(
      "RpcProvider requires a payer. Wrap it in a WalletProvider (with role 'signer' or 'payer') or a PayerProvider."
    );
  }
  const client = useMemo(
    () => parent.use(
      solanaRpc({
        maxConcurrency,
        priorityFees,
        rpcSubscriptionsUrl: wsUrl,
        rpcUrl: url,
        skipPreflight
      })
    ),
    [parent, url, wsUrl, maxConcurrency, priorityFees, skipPreflight]
  );
  return /* @__PURE__ */ jsx(ClientContext.Provider, { value: client, children });
}
function LiteSvmProvider({ children }) {
  const parent = useClient();
  if (!("payer" in parent)) {
    throw new Error(
      "LiteSvmProvider requires a payer. Wrap it in a WalletProvider (with role 'signer' or 'payer') or a PayerProvider."
    );
  }
  const client = useMemo(() => parent.use(litesvm()), [parent]);
  return /* @__PURE__ */ jsx(ClientContext.Provider, { value: client, children });
}
function WalletProvider({
  autoConnect,
  children,
  filter,
  role = "signer",
  storage,
  storageKey
}) {
  const chain = useChain();
  const plugin = useMemo(() => {
    const config = { autoConnect, chain, filter, storage, storageKey };
    switch (role) {
      case "identity":
        return walletIdentity(config);
      case "none":
        return walletWithoutSigner(config);
      case "payer":
        return walletPayer(config);
      case "signer":
        return walletSigner(config);
    }
  }, [role, chain, autoConnect, storage, storageKey, filter]);
  return /* @__PURE__ */ jsx(PluginProvider, { plugin, children });
}

// src/internal/wallet-client.ts
function useWalletClient(hookName) {
  const client = useClient();
  if (!("wallet" in client)) {
    throwMissingProvider(hookName, "WalletProvider");
  }
  return client;
}

// src/hooks/wallet-state.ts
function useWallets() {
  const client = useWalletClient("useWallets");
  return useSyncExternalStore(
    client.wallet.subscribe,
    () => client.wallet.getState().wallets,
    () => client.wallet.getState().wallets
  );
}
function useWalletStatus() {
  const client = useWalletClient("useWalletStatus");
  return useSyncExternalStore(
    client.wallet.subscribe,
    () => client.wallet.getState().status,
    () => client.wallet.getState().status
  );
}
function useConnectedWallet() {
  const client = useWalletClient("useConnectedWallet");
  return useSyncExternalStore(
    client.wallet.subscribe,
    () => client.wallet.getState().connected,
    () => client.wallet.getState().connected
  );
}
function useWalletState() {
  const client = useWalletClient("useWalletState");
  return useSyncExternalStore(client.wallet.subscribe, client.wallet.getState, client.wallet.getState);
}
function useConnectWallet() {
  const client = useWalletClient("useConnectWallet");
  return useCallback((wallet) => client.wallet.connect(wallet), [client]);
}
function useDisconnectWallet() {
  const client = useWalletClient("useDisconnectWallet");
  return useCallback(() => client.wallet.disconnect(), [client]);
}
function useSelectAccount() {
  const client = useWalletClient("useSelectAccount");
  return useCallback((account) => client.wallet.selectAccount(account), [client]);
}
function useSignMessage() {
  const client = useWalletClient("useSignMessage");
  return useCallback((message) => client.wallet.signMessage(message), [client]);
}
function useSignIn() {
  const client = useWalletClient("useSignIn");
  return useCallback(
    (wallet, input = {}) => client.wallet.signIn(wallet, input),
    [client]
  );
}
var NULL_SUBSCRIBE = () => () => {
};
var NULL_GET = () => void 0;
function nullLiveStore() {
  return {
    getError: NULL_GET,
    getState: NULL_GET,
    subscribe: NULL_SUBSCRIBE
  };
}
function useLiveStore(factory, deps) {
  const controllerRef = useRef(null);
  const store = useMemo(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return factory(controller.signal);
  }, deps);
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    []
  );
  return store;
}
function useLiveQueryResult(store) {
  const subscribe = (listener) => store.subscribe(listener);
  const getState = () => store.getState();
  const getError = () => store.getError();
  const state = useSyncExternalStore(subscribe, getState, getState);
  const error = useSyncExternalStore(subscribe, getError, getError);
  return useMemo(
    () => ({
      data: state?.value,
      error,
      isLoading: state === void 0 && error === void 0
    }),
    [state, error]
  );
}

// src/internal/rpc-client.ts
function useRpcClient(hookName) {
  const client = useClient();
  if (!("rpc" in client) || !("rpcSubscriptions" in client)) {
    throwMissingProvider(hookName, "RpcProvider");
  }
  return client;
}

// src/hooks/use-balance.ts
function useBalance(address) {
  const client = useRpcClient("useBalance");
  const store = useLiveStore(
    (signal) => {
      if (address == null) {
        return nullLiveStore();
      }
      return createReactiveStoreWithInitialValueAndSlotTracking({
        abortSignal: signal,
        rpcRequest: client.rpc.getBalance(address),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address),
        rpcSubscriptionValueMapper: ({ lamports }) => lamports,
        rpcValueMapper: (lamports) => lamports
      });
    },
    [client, address]
  );
  return useLiveQueryResult(store);
}
function useAccount(address, decoder) {
  const client = useRpcClient("useAccount");
  const store = useLiveStore(
    (signal) => {
      if (address == null) {
        return nullLiveStore();
      }
      return createReactiveStoreWithInitialValueAndSlotTracking({
        abortSignal: signal,
        rpcRequest: client.rpc.getAccountInfo(address, { encoding: "base64" }),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address, { encoding: "base64" }),
        rpcSubscriptionValueMapper: (value) => {
          if (!value) return null;
          const encoded = parseBase64RpcAccount(address, value);
          return decoder ? decodeAccount(encoded, decoder) : encoded;
        },
        rpcValueMapper: (value) => {
          if (!value) return null;
          const encoded = parseBase64RpcAccount(address, value);
          return decoder ? decodeAccount(encoded, decoder) : encoded;
        }
      });
    },
    [client, address, decoder]
  );
  return useLiveQueryResult(store);
}
function useTransactionConfirmation(signature, options) {
  const client = useRpcClient("useTransactionConfirmation");
  const commitment = options?.commitment ?? "confirmed";
  const store = useLiveStore(
    (signal) => {
      if (signature == null) {
        return nullLiveStore();
      }
      return createReactiveStoreWithInitialValueAndSlotTracking({
        abortSignal: signal,
        rpcRequest: client.rpc.getSignatureStatuses([signature]),
        rpcSubscriptionRequest: client.rpcSubscriptions.signatureNotifications(signature, { commitment }),
        rpcSubscriptionValueMapper: (notification) => ({
          confirmationStatus: commitment,
          confirmations: null,
          err: notification.err
        }),
        rpcValueMapper: (statuses) => {
          const status = statuses[0];
          return status ? {
            confirmationStatus: status.confirmationStatus ?? null,
            confirmations: status.confirmations,
            err: status.err
          } : { confirmationStatus: null, confirmations: null, err: null };
        }
      });
    },
    [client, signature, commitment]
  );
  return useLiveQueryResult(store);
}
function useLiveQuery(config, deps) {
  const store = useLiveStore(
    (signal) => createReactiveStoreWithInitialValueAndSlotTracking({ ...config, abortSignal: signal }),
    deps
  );
  return useLiveQueryResult(store);
}
function useSubscription(factory, deps) {
  const [data, setData] = useState(void 0);
  const [error, setError] = useState(void 0);
  useEffect(() => {
    const controller = new AbortController();
    setData(void 0);
    setError(void 0);
    void (async () => {
      try {
        const request = factory(controller.signal);
        const iterable = await request.subscribe({ abortSignal: controller.signal });
        for await (const notification of iterable) {
          if (controller.signal.aborted) return;
          setData(notification);
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e);
      }
    })();
    return () => controller.abort();
  }, deps);
  return { data, error };
}
var IDLE = { data: void 0, error: void 0, status: "idle" };
function useAction(fn) {
  const [state, setState] = useState(IDLE);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const requestIdRef = useRef(0);
  const send = useCallback(async (...args) => {
    const requestId = ++requestIdRef.current;
    setState({ data: void 0, error: void 0, status: "sending" });
    try {
      const data = await fnRef.current(...args);
      if (requestId === requestIdRef.current) {
        setState({ data, error: void 0, status: "success" });
      }
      return data;
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setState({ data: void 0, error, status: "error" });
      }
      throw error;
    }
  }, []);
  const reset = useCallback(() => {
    requestIdRef.current++;
    setState(IDLE);
  }, []);
  return useMemo(
    () => ({ data: state.data, error: state.error, reset, send, status: state.status }),
    [state, reset, send]
  );
}

// src/internal/sending-client.ts
function useSendingClient(hookName) {
  const client = useClient();
  if (!("sendTransaction" in client) || !("sendTransactions" in client)) {
    throwMissingProvider(hookName, "RpcProvider");
  }
  return client;
}

// src/hooks/use-send-transaction.ts
function useSendTransaction() {
  const client = useSendingClient("useSendTransaction");
  const fn = useCallback((input, config) => client.sendTransaction(input, config), [client]);
  return useAction(fn);
}
function useSendTransactions() {
  const client = useSendingClient("useSendTransactions");
  const fn = useCallback((input, config) => client.sendTransactions(input, config), [client]);
  return useAction(fn);
}

export { ChainContext, ClientContext, IdentityProvider, KitClientProvider, LiteSvmProvider, PayerProvider, PluginProvider, RpcProvider, WalletProvider, useAccount, useAction, useBalance, useChain, useClient, useConnectWallet, useConnectedWallet, useDisconnectWallet, useLiveQuery, useSelectAccount, useSendTransaction, useSendTransactions, useSignIn, useSignMessage, useSubscription, useTransactionConfirmation, useWalletState, useWalletStatus, useWallets };
//# sourceMappingURL=index.browser.mjs.map
//# sourceMappingURL=index.browser.mjs.map