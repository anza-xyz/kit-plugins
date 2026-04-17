'use strict';

var kit = require('@solana/kit');
var react = require('react');
var jsxRuntime = require('react/jsx-runtime');
var kitPluginSigner = require('@solana/kit-plugin-signer');
var kitPluginRpc = require('@solana/kit-plugin-rpc');
var kitPluginLitesvm = require('@solana/kit-plugin-litesvm');
var kitPluginWallet = require('@solana/kit-plugin-wallet');

// src/client-context.tsx

// src/internal/errors.ts
function throwMissingProvider(hookName, providerName) {
  throw new Error(
    `${hookName}() must be used within <${providerName}>. Wrap your component tree in <${providerName}> (or an ancestor provider that includes it).`
  );
}
var ClientContext = react.createContext(null);
ClientContext.displayName = "ClientContext";
var ChainContext = react.createContext(null);
ChainContext.displayName = "ChainContext";
function useClient() {
  const client = react.useContext(ClientContext);
  if (client === null) {
    throwMissingProvider("useClient", "KitClientProvider");
  }
  return client;
}
function useChain() {
  const chain = react.useContext(ChainContext);
  if (chain === null) {
    throwMissingProvider("useChain", "KitClientProvider");
  }
  return chain;
}
function KitClientProvider({ chain, children }) {
  const client = react.useMemo(() => kit.createClient(), []);
  return /* @__PURE__ */ jsxRuntime.jsx(ChainContext.Provider, { value: chain, children: /* @__PURE__ */ jsxRuntime.jsx(ClientContext.Provider, { value: client, children }) });
}
function PluginProvider({ children, plugin, plugins }) {
  const parent = useClient();
  const list = plugin ? [plugin] : plugins;
  const extended = react.useMemo(
    () => list.reduce((acc, p) => acc.use(p), parent),
    // We intentionally depend on `parent` and each plugin identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parent, ...list]
  );
  return /* @__PURE__ */ jsxRuntime.jsx(ClientContext.Provider, { value: extended, children });
}
function PayerProvider({ children, signer }) {
  const plugin = react.useMemo(() => kitPluginSigner.payer(signer), [signer]);
  return /* @__PURE__ */ jsxRuntime.jsx(PluginProvider, { plugin, children });
}
function IdentityProvider({ children, signer }) {
  const plugin = react.useMemo(() => kitPluginSigner.identity(signer), [signer]);
  return /* @__PURE__ */ jsxRuntime.jsx(PluginProvider, { plugin, children });
}
function RpcProvider({ children, maxConcurrency, priorityFees, skipPreflight, url, wsUrl }) {
  const parent = useClient();
  if (!("payer" in parent)) {
    throw new Error(
      "RpcProvider requires a payer. Wrap it in a WalletProvider (with role 'signer' or 'payer') or a PayerProvider."
    );
  }
  const client = react.useMemo(
    () => parent.use(
      kitPluginRpc.solanaRpc({
        maxConcurrency,
        priorityFees,
        rpcSubscriptionsUrl: wsUrl,
        rpcUrl: url,
        skipPreflight
      })
    ),
    [parent, url, wsUrl, maxConcurrency, priorityFees, skipPreflight]
  );
  return /* @__PURE__ */ jsxRuntime.jsx(ClientContext.Provider, { value: client, children });
}
function LiteSvmProvider({ children }) {
  const parent = useClient();
  if (!("payer" in parent)) {
    throw new Error(
      "LiteSvmProvider requires a payer. Wrap it in a WalletProvider (with role 'signer' or 'payer') or a PayerProvider."
    );
  }
  const client = react.useMemo(() => parent.use(kitPluginLitesvm.litesvm()), [parent]);
  return /* @__PURE__ */ jsxRuntime.jsx(ClientContext.Provider, { value: client, children });
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
  return /* @__PURE__ */ jsxRuntime.jsx(PluginProvider, { plugin, children });
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
  return react.useSyncExternalStore(
    client.wallet.subscribe,
    () => client.wallet.getState().connected,
    () => client.wallet.getState().connected
  );
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
  const controllerRef = react.useRef(null);
  const store = react.useMemo(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return factory(controller.signal);
  }, deps);
  react.useEffect(
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
  const state = react.useSyncExternalStore(subscribe, getState, getState);
  const error = react.useSyncExternalStore(subscribe, getError, getError);
  return react.useMemo(
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
      return kit.createReactiveStoreWithInitialValueAndSlotTracking({
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
      return kit.createReactiveStoreWithInitialValueAndSlotTracking({
        abortSignal: signal,
        rpcRequest: client.rpc.getAccountInfo(address, { encoding: "base64" }),
        rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(address, { encoding: "base64" }),
        rpcSubscriptionValueMapper: (value) => {
          if (!value) return null;
          const encoded = kit.parseBase64RpcAccount(address, value);
          return decoder ? kit.decodeAccount(encoded, decoder) : encoded;
        },
        rpcValueMapper: (value) => {
          if (!value) return null;
          const encoded = kit.parseBase64RpcAccount(address, value);
          return decoder ? kit.decodeAccount(encoded, decoder) : encoded;
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
      return kit.createReactiveStoreWithInitialValueAndSlotTracking({
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
    (signal) => kit.createReactiveStoreWithInitialValueAndSlotTracking({ ...config, abortSignal: signal }),
    deps
  );
  return useLiveQueryResult(store);
}
function useSubscription(factory, deps) {
  const [data, setData] = react.useState(void 0);
  const [error, setError] = react.useState(void 0);
  react.useEffect(() => {
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
  const [state, setState] = react.useState(IDLE);
  const fnRef = react.useRef(fn);
  fnRef.current = fn;
  const requestIdRef = react.useRef(0);
  const send = react.useCallback(async (...args) => {
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
  const reset = react.useCallback(() => {
    requestIdRef.current++;
    setState(IDLE);
  }, []);
  return react.useMemo(
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
  const fn = react.useCallback((input, config) => client.sendTransaction(input, config), [client]);
  return useAction(fn);
}
function useSendTransactions() {
  const client = useSendingClient("useSendTransactions");
  const fn = react.useCallback((input, config) => client.sendTransactions(input, config), [client]);
  return useAction(fn);
}

exports.ChainContext = ChainContext;
exports.ClientContext = ClientContext;
exports.IdentityProvider = IdentityProvider;
exports.KitClientProvider = KitClientProvider;
exports.LiteSvmProvider = LiteSvmProvider;
exports.PayerProvider = PayerProvider;
exports.PluginProvider = PluginProvider;
exports.RpcProvider = RpcProvider;
exports.WalletProvider = WalletProvider;
exports.useAccount = useAccount;
exports.useAction = useAction;
exports.useBalance = useBalance;
exports.useChain = useChain;
exports.useClient = useClient;
exports.useConnectWallet = useConnectWallet;
exports.useConnectedWallet = useConnectedWallet;
exports.useDisconnectWallet = useDisconnectWallet;
exports.useLiveQuery = useLiveQuery;
exports.useSelectAccount = useSelectAccount;
exports.useSendTransaction = useSendTransaction;
exports.useSendTransactions = useSendTransactions;
exports.useSignIn = useSignIn;
exports.useSignMessage = useSignMessage;
exports.useSubscription = useSubscription;
exports.useTransactionConfirmation = useTransactionConfirmation;
exports.useWalletState = useWalletState;
exports.useWalletStatus = useWalletStatus;
exports.useWallets = useWallets;
//# sourceMappingURL=index.node.cjs.map
//# sourceMappingURL=index.node.cjs.map