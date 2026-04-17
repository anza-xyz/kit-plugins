# `@solana/kit-react` — Review Pass

A review of the spec ([react-lib-spec.md](./react-lib-spec.md)) and the current implementation in [packages/kit-react/](./packages/kit-react/), focused on **developer experience** and **flexibility**. Ordered from highest to lowest priority so you can decide how deep to go.

---

## Highlights that are working well

- **Root model is clear.** `KitClientProvider` as the single root that owns the client + chain is easy to explain in one sentence. The plugin-chain-as-provider-nesting mapping is a concept that sticks.
- **`ChainIdentifier` escape hatch.** `SolanaChain | (IdentifierString & {})` gives literal autocomplete for the 99% case without locking out L2s. Verified compiles and preserves autocomplete.
- **Live-data hooks earn their place.** `useBalance` / `useAccount` / `useTransactionConfirmation` all hide RPC+subscription pairing, slot dedup, and response mapping — the exact complexity that justifies a named hook.
- **Escape hatches are consistent.** `useClient<TClient>()`, `PluginProvider`, `useAction`, `useLiveQuery`, `useSubscription` — there's always a lower layer to drop down to when the named hook doesn't fit.
- **Granular wallet state.** Splitting into `useWallets`, `useWalletStatus`, `useConnectedWallet` is the right move for re-render cost. Framework-kit/wallet-adapter both get this wrong with a single mega-hook.

---

## Dev ex

### 1. `useChain()` widens the type — and every caller pays for it ✅ RESOLVED

`useChain(): ChainIdentifier` was honest but forced every caller to cast. Fixed by making `useChain` generic: `useChain<T extends IdentifierString = SolanaChain>(): T`. Default return is `SolanaChain` (narrow, autocompletes literally, no casts for the 99% case); opt-in widen via `useChain<IdentifierString>()` for the escape hatch. Same escape-hatch pattern as `useClient<T>()`.

### 2. `WalletProvider` silently casts `ChainIdentifier` → `SolanaChain` ✅ RESOLVED AT PLUGIN LAYER

Fixed at the source: widened `WalletPluginConfig.chain` in `@solana/kit-plugin-wallet` to `SolanaChain | (IdentifierString & {})`, matching wallet-standard's native `UiWallet.chains: IdentifierString[]`. The plugin's runtime was already chain-agnostic (string `.includes()` for discovery, `tryCreateSigner` already returns `null` when `createSignerFromWalletAccount` throws for unsupported chains — which includes non-Solana chains). `WalletProvider` no longer casts; chain flows end-to-end as `IdentifierString`, with `createSignerFromWalletAccount`'s throw → `null` graceful degradation handling custom chains automatically.

### 3. `RpcProvider` error message doesn't mention `LiteSvmProvider` ✅ RESOLVED (capability-led)

Reframed the three internal client helpers (`useRpcClient`, `useSendingClient`, `useWalletClient`) to throw **capability-led** errors via a new `throwMissingCapability` helper. The message names the missing capability first and lists common providers as concrete fixes with an "or any provider that installs..." hedge for custom plugin stacks. Example: *"useBalance() requires `client.rpc` and `client.rpcSubscriptions`. Usually supplied by <RpcProvider> (remote RPC) or <LiteSvmProvider> (local/test) — or any provider that installs the RPC + subscriptions plugins."* The simple `throwMissingProvider` helper is kept for cases where there's exactly one provider (e.g. `useClient` / `useChain` → `KitClientProvider`).

### 4. `useSignIn` spec/impl divergence ✅ RESOLVED (spec updated)

Dropped the `(input?)` overload from the spec. `useSignIn` now types as `(wallet: UiWallet, input?: SolanaSignInInput) => Promise<SolanaSignInOutput>`, matching the underlying `kit-plugin-wallet` decision to simplify `client.wallet.signIn(wallet, input)` to a single shape. Callers pass `useConnectedWallet()?.wallet` for SIWS with the current wallet.

### 5. `useAction` dev-ex: `send` closes over the initial `fn` ✅ RESOLVED (doc simplified)

Dropped the `useCallback` from the docblock example — it was noise given the internal `fnRef.current = fn` pattern. Added a line explaining why: *"The wrapped function does not need to be memoized — an internal ref keeps `send` stable while always calling the latest closure."*

### 6. Provider ordering isn't type-enforced

`RpcProvider` / `LiteSvmProvider` do a runtime `'payer' in client` check and throw if missing. That's the right tradeoff (type-level enforcement would require threading generics through every provider), but new users will hit this error before reading docs. Error message is already good — this is just to flag that it's a common stumble.

**Optional:** consider a `<SetupCheck />` dev-only component that audits the tree at mount and logs a single "here's your plugin chain" message. Probably overkill; flagging for awareness.

### 7. `useLiveQuery` config reads stale on dep-stable changes ✅ RESOLVED (doc updated)

Updated the docblock to call out the hazard explicitly: *"any value that `config` closes over must appear in `deps`, otherwise the store will silently keep using a stale config."* With the reason why the `config`/`deps` split makes this easier to miss than a single factory that captures directly.

---

## Flexibility

### 1. `KitClientProvider` can't accept a pre-built client ✅ RESOLVED

Added optional `client` prop to `KitClientProvider`. When provided, the provider uses it directly and leaves disposal to the caller; when omitted (the common case), the provider creates a fresh client via `createClient()` and disposes it on unmount via `client[Symbol.dispose]?.()`. Ownership is decided at mount via lazy `useState` — toggling the prop across renders isn't supported and is noted in the docblock.

Double-install risk (pre-built client with `walletSigner()` baked in + `<WalletProvider>` mounted below) is caught by a dev-mode `console.warn` emitted from `WalletProvider` when `'wallet' in parent` — the warning explains the issue and tells the caller to either drop the React provider or rebuild the client without the baked-in plugin.

This unlocks SSR hydration, custom client factories (telemetry, instrumentation), and shared clients across trees — see [client-context.tsx](packages/kit-react/src/client-context.tsx) + the "Pre-built client" example in [README.md](packages/kit-react/README.md).

### 2. No way to swap `createClient()` for a test fake ✅ RESOLVED (#1)

Same change as #1 — the `client` prop doubles as a test seam. Tests can construct a stub client (or use `createClient()` with custom plugins) and inject it directly.

### 3. `WalletProvider` can't opt out of reading from context ✅ PARKED (by design)

Decision: leave as-is. Mixing chains in a single tree is confusing and the "which chain wins?" ambiguity outweighs the flexibility. Callers who genuinely need multi-chain setups use separate `KitClientProvider` trees — matches the "one client = one chain" invariant documented elsewhere.

### 4. `PluginProvider` requires stable plugin identity — dev-ex footgun ✅ RESOLVED

Added a dev-only identity-churn detector to [plugin-provider.tsx](packages/kit-react/src/providers/plugin-provider.tsx). A `useEffect` (gated by `process.env.NODE_ENV !== 'production'`) tracks the previous plugin list via `useRef`; an identity mismatch increments a counter, a stable render resets it. After 2 consecutive churning renders it emits a single `console.warn` telling the caller to memoize or hoist to module scope. Considered moving to a `factory + deps` API shape (matching `useLiveQuery` / `useSubscription`) but rejected as un-idiomatic for React component props — Apollo, TanStack, and Zustand all follow the "pass a stable instance, document memoization" pattern, so we match that. Tests verify the warning fires once on churn and never on a stable reference.

### 5. No hook for `client.payer` / `client.identity` ✅ RESOLVED

Added `usePayer()` and `useIdentity()` in [packages/kit-react/src/hooks/signers.ts](packages/kit-react/src/hooks/signers.ts). Both return `TransactionSigner | null`, throw a capability error if the relevant plugin isn't installed at all, and subscribe to wallet state (when a wallet plugin is present) so they stay reactive through connect/disconnect. The wallet-backed case catches the dynamic getter's "no signer connected" throw and returns `null`, so the hooks are always safe to call during render.

Tests cover: capability error for missing plugin, static-signer happy path, wallet-backed disconnected (null), wallet-backed connected (signer returned), and reactivity on connect.

### 6. No way to observe plugin-chain changes ✅ PARKED (not needed)

No dedicated callback is warranted — React already provides the idiom: `useEffect(() => { ... }, [client])` with `client = useClient()`. Downstream providers create new client refs via `.use()` when the chain changes, so the effect fires automatically. Matches what Apollo, TanStack Query, Redux, and Zustand all do (no "observe client recreated" hook). If a real use case surfaces we can revisit, but for now watching `useClient()` identity in `useEffect` is the correct pattern.

### 7. SSR story isn't documented ✅ RESOLVED (and live-data hooks fixed)

Discovered while writing the docs: the live-data hooks (`useBalance` / `useAccount` / `useTransactionConfirmation` / `useLiveQuery` / `useSubscription`) were **not** SSR-safe — `createReactiveStoreWithInitialValueAndSlotTracking` fires `rpcRequest.send(...)` and `rpcSubscriptionRequest.subscribe(...)` synchronously at construction, and `useLiveStore` calls that inside a `useMemo` that runs on the server. Each mounted hook leaked an HTTP request + open WebSocket per SSR pass (effects don't run on the server, so the abort-on-unmount cleanup never registered).

Fix: added a compile-time SSR guard to [`useLiveStore`](packages/kit-react/src/internal/live-store.ts) — `if (!__BROWSER__ && !__REACTNATIVE__) return nullLiveStore()`. In the Node bundle the factory is dead-code-eliminated and the hook returns a stable inert store; in the browser bundle the real hooks run as before. Both server and initial client render emit the same `{ data: undefined, isLoading: true }` snapshot so hydration matches cleanly. Rejected the "prefetch on the server" alternative because on-chain state moves fast enough that a prefetched value would usually mismatch the first client snapshot — the hydration failure is worse than a brief loading flicker.

Docs: added a "Server-side rendering" section to [README.md](packages/kit-react/README.md) explaining what's SSR-safe, the `'pending'` status gate, the per-request `client` prop for Next.js / Remix, and a concrete gate-on-pending pattern. Added a matching design-decisions entry in the [spec](react-lib-spec.md).

### 8. No batched live-query hook

Common pattern: "subscribe to 5 token balances at once." Currently you'd call `useBalance` 5 times, which creates 5 subscriptions. `useLiveQuery` doesn't fundamentally solve this either.

This is the kind of thing higher-level libs (wagmi's `useContracts`) add. Probably not core's job — but worth calling out in the spec as intentionally delegated.

---

## Spec clarity / nitpicks

- **The "Library, not a plugin" design-decisions entry** is long and buried. It's a critical architectural explanation — consider pulling it up near the top of the architecture section, or shortening.
- **The Comparison sections** (framework-kit / connectorkit / wallet-ui / wallet-adapter) are ~400 lines of the spec. Extremely useful for reviewers, but consider moving to an appendix so the main spec reads faster.
- **Spec still uses `useMemo`-based examples in "Getting a kit signer from a wallet account"** — consistent with the rest, but it's the only spot where the user has to reach for React primitives. Worth a one-line note that this intentionally doesn't have a named hook, matching the "no one-shot read hook" philosophy.
- **Spec line 1296** claims granular hooks are a kit-react advantage over wallet-adapter. True, but wallet-adapter's `useWallet` returning everything is also arguably simpler for learners. Consider balancing ("granular hooks trade discoverability for re-render cost — advanced apps benefit more").

---

## Recommended changes — status

- ~~**Generic-narrow `useChain<T>()`**~~ ✅ Done.
- ~~**Fix `WalletProvider` silent-cast footgun** — resolved by widening the plugin's chain type~~ ✅ Done.
- ~~**Capability-led error messages + `useSignIn` spec/impl mismatch + `useAction` docblock + `useLiveQuery` deps note.**~~ ✅ Done.
- ~~**Optional `client` prop on `KitClientProvider`** — unlocks SSR, custom factories, testability.~~ ✅ Done.
- ~~**`PluginProvider` identity-churn dev warning.**~~ ✅ Done.
- ~~**`usePayer()` / `useIdentity()` hooks.**~~ ✅ Done.
- ~~**SSR docs (and underlying live-data SSR safety).**~~ ✅ Done.
- **WalletProvider chain override** (flex #3): parked by design — mixing chains in one tree is confusing.
- **Observe plugin-chain changes** (flex #6): parked — React's `useEffect(() => ..., [useClient()])` is the idiomatic pattern.

Remaining flexibility items (#8 batched live-query) is the last open item.
