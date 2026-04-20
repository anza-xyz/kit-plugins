'use strict';

var kit = require('@solana/kit');
var react = require('react');
var jsxRuntime = require('react/jsx-runtime');
var kitPluginSigner = require('@solana/kit-plugin-signer');
var kitPluginRpc = require('@solana/kit-plugin-rpc');
var kitPluginLitesvm = require('@solana/kit-plugin-litesvm');
var promises = require('@solana/promises');

// src/client-context.tsx
var CHURN_WARNING_THRESHOLD = 2;
function useIdentityChurnWarning({ consequence, providerName, props }) {
  const previousPropsRef = react.useRef(null);
  const churnCountRef = react.useRef(0);
  const warnedRef = react.useRef(false);
  react.useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const previous = previousPropsRef.current;
    previousPropsRef.current = props;
    if (previous === null) return;
    const changed = diffIdentity(previous, props);
    if (changed.length === 0) {
      churnCountRef.current = 0;
      return;
    }
    churnCountRef.current++;
    if (churnCountRef.current >= CHURN_WARNING_THRESHOLD && !warnedRef.current) {
      warnedRef.current = true;
      const label = changed.map((p) => `\`${p}\``).join(", ");
      const subject = changed.length === 1 ? `prop identity for ${label} is` : `prop identities for ${label} are`;
      console.warn(
        `${providerName}: ${subject} changing across renders. Wrap in useMemo or hoist to module scope \u2014 otherwise ` + consequence
      );
    }
  });
}
function diffIdentity(prev, next) {
  const changed = [];
  for (const key of Object.keys(next)) {
    if (!valueIsIdentical(prev[key], next[key])) {
      changed.push(key);
    }
  }
  return changed;
}
function valueIsIdentical(prev, next) {
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length !== next.length) return false;
    for (let i = 0; i < prev.length; i++) {
      if (!Object.is(prev[i], next[i])) return false;
    }
    return true;
  }
  return Object.is(prev, next);
}

// src/internal/dispose.ts
var DISPOSED = /* @__PURE__ */ new WeakSet();
function disposeClient(client) {
  if (DISPOSED.has(client)) return;
  DISPOSED.add(client);
  if (typeof client[Symbol.dispose] === "function") {
    client[Symbol.dispose]();
  }
}

// src/internal/errors.ts
function throwMissingProvider(hookName, providerName) {
  throw new Error(
    `${hookName}() must be used within <${providerName}>. Wrap your component tree in <${providerName}> (or an ancestor provider that includes it).`
  );
}
function throwMissingCapability(hookName, capability, providerHint) {
  throw new Error(`${hookName}() requires ${capability}. ${providerHint}`);
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
function KitClientProvider({ chain, children, client: providedClient }) {
  const owned = react.useMemo(() => providedClient ? null : kit.createClient(), [providedClient]);
  const client = providedClient ?? owned;
  react.useEffect(() => {
    if (owned === null) return;
    return () => disposeClient(owned);
  }, [owned]);
  useIdentityChurnWarning({
    consequence: "every downstream hook receives a new client on each render, tearing down subscriptions and in-flight work.",
    props: { client: providedClient },
    providerName: "<KitClientProvider>"
  });
  return /* @__PURE__ */ jsxRuntime.jsx(ChainContext.Provider, { value: chain, children: /* @__PURE__ */ jsxRuntime.jsx(ClientContext.Provider, { value: client, children }) });
}

// src/client-capability.ts
function useClientCapability({
  capability,
  hookName,
  providerHint
}) {
  const client = useClient();
  const keys = typeof capability === "string" ? [capability] : capability;
  for (const key of keys) {
    if (!(key in client)) {
      throwMissingCapability(hookName, formatCapabilityLabel(keys), providerHint);
    }
  }
  return client;
}
function formatCapabilityLabel(keys) {
  const labels = keys.map((k) => `\`client.${k}\``);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
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
  useIdentityChurnWarning({
    consequence: "a fresh client is rebuilt on every render, dropping subscriptions and cached state.",
    props: { plugins: list },
    providerName: "<PluginProvider>"
  });
  return /* @__PURE__ */ jsxRuntime.jsx(ClientContext.Provider, { value: extended, children });
}
function PayerProvider({ children, signer }) {
  const plugin = react.useMemo(() => kitPluginSigner.payer(signer), [signer]);
  useIdentityChurnWarning({
    consequence: "the payer plugin is rebuilt every render, replacing `client.payer` on each render.",
    props: { signer },
    providerName: "<PayerProvider>"
  });
  return /* @__PURE__ */ jsxRuntime.jsx(PluginProvider, { plugin, children });
}
function IdentityProvider({ children, signer }) {
  const plugin = react.useMemo(() => kitPluginSigner.identity(signer), [signer]);
  useIdentityChurnWarning({
    consequence: "the identity plugin is rebuilt every render, replacing `client.identity` on each render.",
    props: { signer },
    providerName: "<IdentityProvider>"
  });
  return /* @__PURE__ */ jsxRuntime.jsx(PluginProvider, { plugin, children });
}
function RpcProvider({ children, ...config }) {
  const parent = useClient();
  if (!("payer" in parent)) {
    throw new Error(
      "RpcProvider requires a payer. Wrap it in a WalletProvider (with role 'signer' or 'payer') or a PayerProvider. For read-only apps that only need RPC reads, skip RpcProvider and use PluginProvider with solanaRpcConnection + solanaRpcSubscriptionsConnection instead."
    );
  }
  const {
    maxConcurrency,
    priorityFees,
    rpcConfig,
    rpcSubscriptionsConfig,
    rpcSubscriptionsUrl,
    rpcUrl,
    skipPreflight
  } = config;
  const client = react.useMemo(
    () => parent.use(
      kitPluginRpc.solanaRpc({
        maxConcurrency,
        priorityFees,
        rpcConfig,
        rpcSubscriptionsConfig,
        rpcSubscriptionsUrl,
        rpcUrl,
        skipPreflight
      })
    ),
    [
      parent,
      rpcUrl,
      rpcSubscriptionsUrl,
      maxConcurrency,
      priorityFees,
      skipPreflight,
      rpcConfig,
      rpcSubscriptionsConfig
    ]
  );
  useIdentityChurnWarning({
    consequence: "the RPC plugin chain is rebuilt on every render, tearing down the subscriptions connection and any in-flight transactions.",
    props: { rpcConfig, rpcSubscriptionsConfig },
    providerName: "<RpcProvider>"
  });
  return /* @__PURE__ */ jsxRuntime.jsx(ClientContext.Provider, { value: client, children });
}
function RpcReadOnlyProvider({ children, ...config }) {
  const parent = useClient();
  const { rpcConfig, rpcSubscriptionsConfig, rpcSubscriptionsUrl, rpcUrl } = config;
  const client = react.useMemo(
    () => parent.use(
      kitPluginRpc.solanaRpcReadOnly({
        rpcConfig,
        rpcSubscriptionsConfig,
        rpcSubscriptionsUrl,
        rpcUrl
      })
    ),
    [parent, rpcUrl, rpcSubscriptionsUrl, rpcConfig, rpcSubscriptionsConfig]
  );
  useIdentityChurnWarning({
    consequence: "the read-only RPC plugin chain is rebuilt on every render, tearing down the subscriptions connection.",
    props: { rpcConfig, rpcSubscriptionsConfig },
    providerName: "<RpcReadOnlyProvider>"
  });
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
var NOOP_SUBSCRIBE = () => () => {
};
function readOptional(read) {
  try {
    return read() ?? null;
  } catch {
    return null;
  }
}
function usePayer() {
  const client = useClient();
  const getSnapshot = () => readOptional(() => client.payer);
  const payer2 = react.useSyncExternalStore(client.subscribeToPayer ?? NOOP_SUBSCRIBE, getSnapshot, getSnapshot);
  if (!("payer" in client)) {
    throwMissingCapability(
      "usePayer",
      "`client.payer`",
      'Usually supplied by <WalletProvider> (with role "signer" or "payer") or <PayerProvider> \u2014 or any provider that installs a payer plugin.'
    );
  }
  return payer2;
}
function useIdentity() {
  const client = useClient();
  const getSnapshot = () => readOptional(() => client.identity);
  const identity2 = react.useSyncExternalStore(client.subscribeToIdentity ?? NOOP_SUBSCRIBE, getSnapshot, getSnapshot);
  if (!("identity" in client)) {
    throwMissingCapability(
      "useIdentity",
      "`client.identity`",
      'Usually supplied by <WalletProvider> (with role "signer" or "identity") or <IdentityProvider> \u2014 or any provider that installs an identity plugin.'
    );
  }
  return identity2;
}
var NULL_SUBSCRIBE = () => () => {
};
var NULL_GET = () => void 0;
var DISABLED = /* @__PURE__ */ Symbol("DisabledLiveStore");
function nullLiveStore() {
  return {
    getError: NULL_GET,
    getState: NULL_GET,
    subscribe: NULL_SUBSCRIBE
  };
}
function disabledLiveStore() {
  return {
    [DISABLED]: true,
    getError: NULL_GET,
    getState: NULL_GET,
    subscribe: NULL_SUBSCRIBE
  };
}
function isDisabledLiveStore(store) {
  return store[DISABLED] === true;
}
function useLiveStore(factory, deps) {
  const controllerRef = react.useRef(null);
  const store = react.useMemo(
    () => {
      {
        return nullLiveStore();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- library passthrough: `factory` is caller-controlled; deps list is the contract.
    deps
  );
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
  const disabled = isDisabledLiveStore(store);
  return react.useMemo(
    () => ({
      data: state?.value,
      error,
      isLoading: !disabled && state === void 0 && error === void 0
    }),
    [state, error, disabled]
  );
}

// src/internal/rpc-client.ts
function useRpcClient(hookName) {
  return useClientCapability({
    capability: ["rpc", "rpcSubscriptions"],
    hookName,
    providerHint: "Usually supplied by <RpcProvider> (remote RPC) or <LiteSvmProvider> (local/test) \u2014 or any provider that installs the RPC + subscriptions plugins."
  });
}

// src/hooks/use-balance.ts
function useBalance(address) {
  const client = useRpcClient("useBalance");
  const store = useLiveStore(
    (signal) => {
      if (address == null) {
        return disabledLiveStore();
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
        return disabledLiveStore();
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
        return disabledLiveStore();
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
function useLiveQuery(factory, deps) {
  const store = useLiveStore(
    (signal) => kit.createReactiveStoreWithInitialValueAndSlotTracking({ ...factory(), abortSignal: signal }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- library passthrough: `factory` is caller-controlled; deps list is the contract.
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
    const request = factory(controller.signal);
    if (request === null) {
      return () => controller.abort();
    }
    void (async () => {
      try {
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
  react.useEffect(() => {
    fnRef.current = fn;
  });
  const currentControllerRef = react.useRef(null);
  const send = react.useCallback(async (...args) => {
    currentControllerRef.current?.abort();
    const controller = new AbortController();
    currentControllerRef.current = controller;
    setState({ data: void 0, error: void 0, status: "running" });
    try {
      const data = await promises.getAbortablePromise(fnRef.current(controller.signal, ...args), controller.signal);
      if (!controller.signal.aborted) {
        setState({ data, error: void 0, status: "success" });
      }
      return data;
    } catch (error) {
      if (controller.signal.aborted) {
        throw error;
      }
      setState({ data: void 0, error, status: "error" });
      throw error;
    }
  }, []);
  const reset = react.useCallback(() => {
    currentControllerRef.current?.abort();
    currentControllerRef.current = null;
    setState(IDLE);
  }, []);
  return react.useMemo(
    () => ({ data: state.data, error: state.error, reset, send, status: state.status }),
    [state, reset, send]
  );
}

// src/internal/sending-client.ts
var SENDING_HINT = "Usually supplied by <RpcProvider> or <LiteSvmProvider> \u2014 or any provider that installs the transaction-sending plugin.";
var PLANNING_HINT = "Usually supplied by <RpcProvider> or <LiteSvmProvider> \u2014 or any provider that installs the transaction-planning plugin.";
function useClientWithSendTransaction(hookName) {
  return useClientCapability({
    capability: "sendTransaction",
    hookName,
    providerHint: SENDING_HINT
  });
}
function useClientWithSendTransactions(hookName) {
  return useClientCapability({
    capability: "sendTransactions",
    hookName,
    providerHint: SENDING_HINT
  });
}
function useClientWithPlanTransaction(hookName) {
  return useClientCapability({
    capability: "planTransaction",
    hookName,
    providerHint: PLANNING_HINT
  });
}
function useClientWithPlanTransactions(hookName) {
  return useClientCapability({
    capability: "planTransactions",
    hookName,
    providerHint: PLANNING_HINT
  });
}

// src/hooks/use-send-transaction.ts
function useSendTransaction() {
  const client = useClientWithSendTransaction("useSendTransaction");
  const fn = react.useCallback(
    (signal, input, config) => client.sendTransaction(input, { ...config, abortSignal: signal }),
    [client]
  );
  return useAction(fn);
}
function useSendTransactions() {
  const client = useClientWithSendTransactions("useSendTransactions");
  const fn = react.useCallback(
    (signal, input, config) => client.sendTransactions(input, { ...config, abortSignal: signal }),
    [client]
  );
  return useAction(fn);
}
function usePlanTransaction() {
  const client = useClientWithPlanTransaction("usePlanTransaction");
  const fn = react.useCallback(
    (signal, input, config) => client.planTransaction(input, { ...config, abortSignal: signal }),
    [client]
  );
  return useAction(fn);
}
function usePlanTransactions() {
  const client = useClientWithPlanTransactions("usePlanTransactions");
  const fn = react.useCallback(
    (signal, input, config) => client.planTransactions(input, { ...config, abortSignal: signal }),
    [client]
  );
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
exports.RpcReadOnlyProvider = RpcReadOnlyProvider;
exports.useAccount = useAccount;
exports.useAction = useAction;
exports.useBalance = useBalance;
exports.useChain = useChain;
exports.useClient = useClient;
exports.useClientCapability = useClientCapability;
exports.useIdentity = useIdentity;
exports.useIdentityChurnWarning = useIdentityChurnWarning;
exports.useLiveQuery = useLiveQuery;
exports.usePayer = usePayer;
exports.usePlanTransaction = usePlanTransaction;
exports.usePlanTransactions = usePlanTransactions;
exports.useSendTransaction = useSendTransaction;
exports.useSendTransactions = useSendTransactions;
exports.useSubscription = useSubscription;
exports.useTransactionConfirmation = useTransactionConfirmation;
//# sourceMappingURL=index.node.cjs.map
//# sourceMappingURL=index.node.cjs.map