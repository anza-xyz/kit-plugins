# Review 4: `@solana/kit-react` and `@solana/kit-react-wallet`

Focus: **beginner DX, general DX, API flexibility, CLAUDE.md criteria, code quality.**
Scope: the spec at [react-lib-spec.md](react-lib-spec.md), the prototype in [packages/kit-react/](packages/kit-react/) and [packages/kit-react-wallet/](packages/kit-react-wallet/), and the (still-unimplemented) SWR / TanStack adapter sections of the spec.

This is a fresh pass — reviews 1–3 landed the big structural items (read-only path, StrictMode disposal, `useConnectedWallet` / `useWalletSigner` split, `useClientCapability` export, provider churn warnings, `useAction` ref-during-render, conditional throws → assertion hooks). Those aren't revisited here. This review concentrates on items those passes didn't surface.

---

## TL;DR

- The library is shaping up well — layered, hooks-first, the error messages are good, and the wallet / read-only / test stacks are all expressible without abstraction cliffs. Nothing here is structural.
- Biggest real bug: [spec.md:146](react-lib-spec.md#L146) and [kit-react/README.md:79](packages/kit-react/README.md#L79) both advertise `priorityFees` as a direct `<RpcProvider>` prop — it isn't. It moved into `transactionConfig.priorityFees` at the plugin level, and both docs missed the update.
- Biggest DX gap: **test coverage for the live-data and transaction hooks is thin.** `useBalance`, `useAccount`, `useTransactionConfirmation`, `useLiveQuery`, `useSubscription`, `useSendTransaction`, `useSendTransactions`, `usePlanTransaction`, `usePlanTransactions`, and all five wallet-action hooks have no dedicated tests — the internal primitives they wrap are tested, the wrappers are not.
- Biggest ergonomic wart that recurs everywhere: `AbortError` filtering. Every `useAction`-based example contains `if ((err as Error).name === 'AbortError') return;`. The unchecked `err as Error` cast is copy-pasted across the spec, the READMEs, and the source docblocks. A tiny `isAbortError(err)` helper would erase it.
- SWR / TanStack adapters are still spec-only. The core is ready for them, but two questions deserve an answer before implementation starts (import ambiguity, and whether the adapter mutation hooks should keep `{send, status}` or switch to cache-library-native `{mutateAsync, isPending}`).

---

## Beginner developer experience

### Entry point is confusingly split between two packages

The quickstart pattern for an app with a user wallet is:

```tsx
import { KitClientProvider, RpcProvider, useBalance } from '@solana/kit-react';
import { WalletProvider, useConnectedWallet } from '@solana/kit-react-wallet';
```

A newcomer has to learn **which package a given name lives in** before they can import anything. The spec calls out the policy (core = wallet-agnostic; wallet stuff = wallet package), and the README has a "Looking for wallet hooks?" callout — but that's only visible once you're already reading the kit-react README.

Concretely, every one of these is a plausible "I wanted it from `kit-react`" fumble for a newcomer:

- `useWallets` / `useConnectedWallet` / `useConnectWallet` / `useWalletSigner` / `useWalletStatus`
- `useSignMessage` / `useSignIn` / `useSelectAccount` / `useDisconnectWallet`
- `<WalletProvider>`

And these stay in core even though they sound wallet-adjacent:

- `usePayer` / `useIdentity` (because the subscribe convention is wallet-agnostic)

Options, roughly ordered by cost:

1. **Re-export wallet hooks from `@solana/kit-react` as a convenience.** Trivially satisfies the "one-package-to-import-from" mental model most beginners start with. Pure adds: no breaking change, no extra maintenance. The downside is a slightly blurred package boundary — someone who `pnpm add`s only `@solana/kit-react` would get a type-only reference that fails at runtime. A small note in the docblocks plus the existing peer-dep on `@solana/kit-plugin-wallet` handles that, same pattern as many ecosystem libs.
2. **Add a combined "Which package exports what?" table** to both READMEs. Cheap, zero runtime cost, doesn't help IDE autocomplete but does help stack-trace-first debugging.
3. **Leave it alone** — the current hard split is principled, and the wallet package is its own README.

The `@solana/kit` ecosystem is pitched as beginner-friendlier than wallet-adapter. A re-export layer would close the gap with wagmi's single-entry-point DX without giving up the structural split.

### The quickstart assumes components you haven't defined yet

[kit-react/README.md:42](packages/kit-react/README.md#L42):

```tsx
if (!connected) return <ConnectButton />;
```

`ConnectButton` is referenced but never defined. A beginner copying the snippet gets `'ConnectButton' is not defined`. The kit-react-wallet README does define one (good) — the kit-react quickstart should either inline it or defer to the wallet-package quickstart with a clear "when you're ready to connect a wallet, see …" pointer.

Minor enough to fix once; noted here because the quickstart is the first impression.

### `useBalance(null)` is clever but surprising

Passing `null` to disable is consistent with react-query / SWR and is explained in the docblock — but a beginner coming from wallet-adapter (`useConnection()` + `connection.getBalance(pubkey)`) is more likely to write:

```tsx
if (!connected) return <ConnectButton />;
const { data } = useBalance(connected.account.address);
```

…which violates rules-of-hooks. The docblock example does show the right pattern (`useBalance(connected?.account.address ?? null)`), but there's no runtime or lint-time guard against the naïve form. Worth an explicit "don't early-return before `useBalance`" callout in the README. Minor.

### The first-render loading state isn't discussed end-to-end

`useBalance`, `useAccount`, `useTransactionConfirmation`, `useLiveQuery`, and `useSubscription` all distinguish three cases (disabled / active-loading / server-render). That's a nice invariant, but the beginner DX asks the reverse question: "what does my UI show during the transition from `isLoading: true` → `data: X`?". The docblocks explain the invariant but don't walk through a `{isLoading && <Spinner/>} {data && <View data={data}/>}` pattern. A single three-line snippet in the README under "Live data" would save every beginner from discovering the shape empirically.

### `useAction` examples are intimidating

Every `useAction`-using docblock now shows:

```tsx
try {
    await send(...);
} catch (err) {
    if ((err as Error).name === 'AbortError') return; // superseded
    toast.error(String(err));
}
```

For a newcomer trying to send their first transaction, the boilerplate reads like "you must understand abortable promises before you can transfer SOL". The policy (AbortError is legitimate signal) is right, but the example shape can be friendlier — see the "unchecked `err as Error` cast everywhere" item in the next section for a concrete proposal. Put a short-form example up top ("just want to fire-and-forget? status will reflect errors") and reserve the try/catch form for the advanced section.

---

## General DX

### Unchecked `err as Error` cast in every AbortError filter

All five `useAction`-based hooks (`useAction`, `useSendTransaction`, `useSendTransactions`, `usePlanTransaction`, `usePlanTransactions`) show the `if ((err as Error).name === 'AbortError') return;` pattern in their primary example. That's:

1. An unchecked cast (`catch` gives `unknown`; `err` might not actually be an `Error`).
2. Repetitive — ten+ occurrences across spec, READMEs, and source docblocks.
3. Easy to miss one site.

A one-line helper, exported alongside `useAction`, cleans this up:

```ts
// src/hooks/use-action.ts (or a sibling)
/** `true` if the given error came from an aborted send()/reset() in a useAction-based hook. */
export function isAbortError(err: unknown): boolean {
    return err instanceof Error && err.name === 'AbortError';
}
```

Callers then write:

```tsx
try {
    await send(...);
} catch (err) {
    if (isAbortError(err)) return; // superseded
    toast.error(String(err));
}
```

Much friendlier for beginners and removes the unchecked cast. Non-breaking; the primary example in every docblock can migrate at the same time.

### `useAction`'s `status` leaks to user conditionals

The four-value union `'idle' | 'running' | 'success' | 'error'` is correct, but most call sites want booleans (`isRunning`, `isError`). That's 4× checks vs 1× check. Both SWR (`isLoading`, `isValidating`, `error`) and TanStack (`isPending`, `isError`, `isSuccess`) lean on booleans for this reason.

Additive derived fields (`isIdle`, `isRunning`, `isSuccess`, `isError`) cost one `useMemo` entry and would make the common `{isRunning && <Spinner/>}` pattern idiomatic. The existing `status` string stays for anyone who prefers pattern-matching. Non-breaking.

### `useSubscription` is the only live hook without `slot`

`LiveQueryResult<T>` now surfaces `slot` (good!). `useSubscription` returns `{ data, error }` without it. For subscription-only data where the notification carries a slot (most of them do — `slotNotifications`, `blockNotifications`, `rootNotifications`), callers can't pull the slot through without building a bespoke tuple inside `rpcSubscriptionValueMapper`. Either:

- Widen `UseSubscriptionResult<T>` to include `slot: Slot | undefined`, reading from the notification envelope when present, or
- Leave it alone and document that "for slot-aware subscriptions, use `useLiveQuery` with the same RPC pair" — but most of the subscription-only methods don't have an RPC counterpart.

Small, but it'd be nice to have the same-shape live-data contract across all three subscription hooks. Could be deferred — flag it for the futures section.

### Factory/deps contract is subtly different across generic hooks

`useLiveQuery`'s factory is `() => UseLiveQueryConfig<…>` — no abort signal.
`useSubscription`'s factory is `(signal: AbortSignal) => PendingRpcSubscriptionsRequest | null` — has the signal.

Both rebuild on deps change, both abort the previous request, both opt into the same `react-hooks/exhaustive-deps` `additionalHooks` list. But callers who want to use the signal in `useLiveQuery` (e.g. to cancel a side-effect they run in the mapper) can't.

Upstream constraint: `createReactiveStoreWithInitialValueAndSlotTracking` takes its own `abortSignal`, so `useLiveStore` passes it to the store, not the factory. Bringing the signal into the factory would mean "here's the signal if you want to use it for side work" without changing the store's lifecycle — additive, low-risk.

Worth doing for consistency even if no one uses it immediately. Symmetry with `useSubscription` is the point.

### `useSelectAccount` returns `void`, not `Promise<void>`

[wallet-actions.ts:52](packages/kit-react-wallet/src/hooks/wallet-actions.ts#L52):

```ts
export function useSelectAccount(): (account: UiWalletAccount) => void {
```

Every other action hook returns a `Promise<…>` — `useConnectWallet`, `useDisconnectWallet`, `useSignMessage`, `useSignIn`. If the underlying `client.wallet.selectAccount` is synchronous (looks like it, from the store impl), that's fine. But from a caller's perspective it's an inconsistency — they have to remember which action hooks they can `await` and which they can't, and the distinction doesn't map cleanly to a conceptual difference (selecting an account can imply a refresh that's async-in-other-impls).

Either document the sync contract explicitly in the hook docblock, or wrap the plugin call in `Promise.resolve(…)` to normalize the shape. I'd lean "document it" since the underlying plugin's contract is the source of truth.

### Error channel quality is uneven

Core hooks get three channels:

- Missing provider (thrown from `useClient` — `KitClientProvider`).
- Missing capability (thrown from `useClientCapability` — `<RpcProvider>`, etc.).
- Hook-level error (reactive `error` field — network failure, plugin rejection).

Wallet action hooks only get the first two — an errant `await connect(wallet)` surfaces through the promise and there's no reactive `{status, error}` channel unless the caller wraps in `useAction`. That's documented ("fire-and-forget; wrap in `useAction` when you want status tracking"), but none of the `useConnectWallet` / `useSignMessage` / `useSignIn` docblocks show the "how to wrap in useAction" example inline. Beginners who want a loading spinner on the connect button will bounce off this.

Either:

1. Add a three-line `useAction(…useConnectWallet())` snippet to each action hook's docblock.
2. Ship a ready-made `useConnectWalletAction()` / `useSignMessageAction()` alongside. These would be minimal — `useAction((signal, …args) => cb(…args))` — but they eliminate the wrapping ceremony for the common case.

(1) is lighter; (2) matches wallet-adapter's ergonomics more closely.

### No convenience for "send then watch confirmation"

The most common pattern after `useSendTransaction` is:

```tsx
const { send, data } = useSendTransaction();
const signature = data?.signature;
const { data: confirmation } = useTransactionConfirmation(signature ?? null);
```

It's four lines and it works, but it's also the ~90% flow. A composed hook (`useSendAndConfirmTransaction`, returning `{ send, status, signature, confirmation }`) would shave boilerplate off every transaction UI. Fine to defer, but it's the next obvious named hook, and it earns its place by combining the two existing ones into a more useful shape for the common UI. Flag it for the futures section alongside `useBalances`.

---

## API flexibility

### `PluginProvider` single-vs-array prop is a mild friction

The discriminated-union prop shape (`plugin` xor `plugins`) is TypeScript-correct and tests the type system nicely. In practice the one-vs-many split is almost never load-bearing — authors with one plugin pass `plugin={…}`, authors with many pass `plugins={[…]}`, nothing ever dispatches on it.

A single `plugins: readonly ClientPlugin[]` prop (accepting `[singlePlugin]` for the common case) would simplify both the prop shape and the churn-warning diff. The one-plugin case would cost a `[]` wrap — six characters — and the discriminated-union types go away. Not urgent; flag for when someone touches this file next.

### `useLiveQuery` three-generic surface is awkward

`useLiveQuery<TRpcValue, TSubscriptionValue, TItem>` requires the caller to specify three generics when inference can't carry them, which is any non-trivial mapper. Most call sites want to specify `TItem` only. Ordering matters for partial inference — `TItem` last means you'd have to explicitly spell the first two to specify the third.

Since `TRpcValue` and `TSubscriptionValue` come from the `factory` return value, they should infer from `rpcRequest` / `rpcSubscriptionRequest`. When they don't (caller's types are messy), the friendliest API accepts `<TItem>` alone and leaves the other two inferred. Swapping the generic order puts `TItem` first:

```ts
export function useLiveQuery<TItem, TRpcValue = unknown, TSubscriptionValue = TRpcValue>(
    factory: () => UseLiveQueryConfig<TRpcValue, TSubscriptionValue, TItem>,
    deps: DependencyList,
): LiveQueryResult<TItem>;
```

With this shape a caller who only knows `TItem` writes `useLiveQuery<MyGame>(factory, deps)` and lets the rest infer. Low-risk refactor; the existing test-less state of the hook means you could land it with new tests in the same PR.

### `<WalletProvider>`'s `role` prop is a single axis; real apps sometimes want two

The `WalletRole` enum covers four useful combinations of (installs payer?) × (installs identity?). But:

- `role="signer"` means wallet = payer and wallet = identity.
- `role="identity"` means wallet = identity only, and a separate `<PayerProvider>` supplies the payer.

There's no shorthand for "wallet = payer; no identity" beyond `role="payer"` (which is correct) and "wallet = identity, wallet = payer" beyond `role="signer"`. That's fine. The subtle gap: for `role="identity"` users, the error path when they forget to mount `<PayerProvider>` downstream is "`<RpcProvider>` requires a payer" — which is correct but doesn't mention the `role="identity"` combination. Worth an extra sentence in the `RpcProvider` error for the `role="identity"` case: "Add a `<PayerProvider signer={…}>` between `<WalletProvider role='identity'>` and `<RpcProvider>`, or change the wallet role to `'signer'` / `'payer'`."

### The "third-party providers" story has a small gap

`useClientCapability` is the recommended path for third-party hook authors. Good. But the spec only covers third-party **plugin authors** who ship React bindings for their own plugin — what about app authors who want to install *kit-plugin-wallet-like* behavior with their own reactive `client.foo`? The `subscribeTo<Capability>` convention is documented as "observed by `usePayer` / `useIdentity`" — there's no generic hook like `useCapability<K>('foo', …)` that subscribes to `subscribeToFoo` out of the box.

A `useReactiveCapability<TCap, TKey>` would close this gap:

```ts
function useReactiveCapability<TKey extends string, TValue>(options: {
    capability: TKey;
    hookName: string;
    providerHint: string;
}): TValue | null;
```

…and internally dispatch on `subscribeTo${Capitalize<TKey>}`. Third parties get the same reactive contract for free. Flag for the futures section — there's no concrete use case yet.

---

## CLAUDE.md criteria

### Docblocks — ✅ thorough

Every exported symbol has a JSDoc docblock. The style (`{@link}`, `@see`, `@example`, `@throws`, `@typeParam`) is consistent. Internal helpers are marked `@internal` explicitly. The prose is high quality and explains *why*, not *what* — on par with what the `ts-docblocks` skill aims for.

Two small snags:

- [rpc-read-only-provider.tsx:8–15](packages/kit-react/src/providers/rpc-read-only-provider.tsx#L8-L15) references `SolanaRpcReadOnlyConfig` in the docblock but the `{@link ...}` target is unresolved because the import type is erased at type-generation time. Check that typedoc / api-extractor still links it.
- [use-action.ts:63](packages/kit-react/src/hooks/use-action.ts#L63) — the `@example` block is a reasonable 20+ line snippet; beginners would benefit from a shorter "fire-and-forget" primary example with the try/catch version under "Advanced usage". See beginner-DX section above.

### Tests — ⚠️ real gaps

Existing tests:

| Package            | File                                         | Covers                                                           |
| ------------------ | -------------------------------------------- | ---------------------------------------------------------------- |
| `kit-react`        | `client-context.test.tsx`                    | `KitClientProvider` + StrictMode + client ownership, `disposeClient` |
| `kit-react`        | `providers.test.tsx`                         | `PayerProvider`, `IdentityProvider`, `RpcProvider` throw, `LiteSvmProvider` throw, `RpcReadOnlyProvider`, `PluginProvider` single/multiple/churn |
| `kit-react`        | `signers.test.tsx`                           | `usePayer` / `useIdentity` static, wallet-backed, reactive, SSR  |
| `kit-react`        | `live-store.test.tsx`                        | `useLiveStore` (abort-on-deps, abort-on-unmount), `useLiveQueryResult`, `nullLiveStore` |
| `kit-react`        | `use-action.test.tsx`                        | Lifecycle, error, reset, supersede, abort, stability             |
| `kit-react-wallet` | `wallet-state.test.tsx`                      | `useWallets`, `useWalletStatus`, `useConnectedWallet` (incl. memoization), `useWalletSigner`, `useWalletState` |
| `kit-react-wallet` | `wallet-provider.test.tsx`                   | `filter` churn warning, double-install throw                     |

Missing coverage, each a hook with non-trivial behavior:

- `useBalance` — no test covers null-gate, server render, slot-dedup, or switching `address`.
- `useAccount` — same, plus the decoder overload (decoded vs encoded).
- `useTransactionConfirmation` — same, plus the default commitment.
- `useLiveQuery` — the factory-returning-config contract has no coverage.
- `useSubscription` — null gate, abort-on-deps-change, error handling.
- `useSendTransaction` / `useSendTransactions` — no test verifies the hook threads the signal into `client.sendTransaction`'s config or that the capability check fires for a missing plugin.
- `usePlanTransaction` / `usePlanTransactions` — same.
- `useConnectWallet` / `useDisconnectWallet` / `useSelectAccount` / `useSignMessage` / `useSignIn` — no test verifies the `useCallback` deps or that the plugin method is called with the right args.
- `useChain` — covered indirectly in `client-context.test.tsx`, but no test for the custom IdentifierString generic widening.
- `useClientCapability` — no direct test; covered indirectly through the internal helpers.

The live-data hooks are where the most logic lives (null-gate, SSR stub, decoder, slot-dedup). Adding a focused test per hook that uses a stub RPC + a stub subscription would meaningfully raise confidence. The primitives (`useLiveStore`, `useLiveQueryResult`) are tested, but the named hooks stack several behaviors on top and the integration isn't covered.

Concrete suggestion: a shared `createStubRpcClient()` helper in a `_setup.ts` (similar to `kit-react-wallet`'s `createFakeWallet`) would make writing these tests mostly mechanical.

### READMEs — ✅ mostly solid, one drift

Both packages have structured, on-brand READMEs with brief intros, installation, usage, and deep-dive sections. Code snippets are TypeScript and realistic.

One concrete drift, same as the spec:

- [kit-react/README.md:79](packages/kit-react/README.md#L79) advertises `priorityFees` as a direct `<RpcProvider>` prop: _"(`rpcUrl`, `rpcSubscriptionsUrl`, `priorityFees`, `maxConcurrency`, …)"_.
- The plugin's actual `SolanaRpcConfig` (in [kit-plugin-rpc/src/solana-rpc.ts:25–59](packages/kit-plugin-rpc/src/solana-rpc.ts#L25-L59)) does **not** have `priorityFees` at the top level. Priority fees live inside `transactionConfig: TransactionPlannerConfig`.
- [kit-react/src/providers/rpc-provider.tsx:70–78](packages/kit-react/src/providers/rpc-provider.tsx#L70-L78) destructures `transactionConfig` correctly but doesn't accept a top-level `priorityFees`.

So users who type `<RpcProvider priorityFees={…}>` get a TypeScript error; users who try to infer it from docs are misled. Fix by removing `priorityFees` from both docs and replacing it with `transactionConfig`.

(This was listed as "resolved (deferred)" in [review-3.md:75–76](react-lib-review-3.md) on the basis that `RpcProvider` extends `SolanaRpcConfig`, which is zero-drift — but the doc text hardcodes the list and missed the downstream plugin change. The code itself is correct.)

### Umbrella package — ✅

Per CLAUDE.md the umbrella package is deprecated; no new exports should land there. Checked [kit-plugins/package.json](packages/kit-plugins/package.json) — no `kit-react` or `kit-react-wallet` entries, correct.

### Lint / build / tests — not run (advisory only)

The tsup + vitest + tsc-declarations setup matches the other packages in the monorepo and should be picked up by `pnpm lint` / `pnpm test` / `pnpm build` without bespoke wiring. Advisory; worth running before the prototype graduates.

---

## Code quality

### `useConnectedWallet`'s ref-based memoization is load-bearing and well-commented

[wallet-state.ts:94–110](packages/kit-react-wallet/src/hooks/wallet-state.ts#L94-L110). The projection cache (return previous object when `account` and `wallet` haven't changed) is exactly right for `useSyncExternalStore`'s "skip the re-render when snapshot is referentially equal" contract, and the test at [wallet-state.test.tsx:56–76](packages/kit-react-wallet/test/wallet-state.test.tsx#L56-L76) covers it.

One subtle concern: the ref is mutated during render (via `lastRef.current = next`). That's sort of OK here because the mutation is a pure function of the snapshot (idempotent, no side effects on the React tree), but it's still a render-phase side effect. Moving the cache into a closure owned by `getSnapshot` (via `useRef(getSnapshot)` with a setup effect) would be stricter-concurrent-safe. Not critical — the `useAction` fix already makes us concurrency-aware and this one is much less exposed since it's pure. Flag it if StrictMode ever surfaces a regression here.

### `useSubscription` has a subtle data-reset quirk

[use-subscription.ts:52–56](packages/kit-react/src/hooks/use-subscription.ts#L52-L56):

```ts
useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setError(undefined);

    const request = factory(controller.signal);
    if (request === null) { ... }
```

The `setData(undefined)` / `setError(undefined)` on every deps change correctly clears stale data, but it also flashes the UI to "no data yet" for the one render after deps change — which is indistinguishable from the first-load state, so users who render `{data ? <X data={data}/> : <Spinner/>}` will see the spinner again on every dep change.

Options:

1. Add `loading` discriminator to `UseSubscriptionResult<T>` (matching `LiveQueryResult`) so the caller can tell "disabled / loading / error / have-data" apart — same contract as the other live hooks.
2. Only reset on dep change if the new factory returns non-null, so toggling `enabled=false` doesn't flash.
3. Leave it alone and document the flash behavior.

(1) is the most consistent — and it closes the "no slot / no isLoading on `useSubscription`" gap noted above. Worth doing once you widen the result type.

### `useAction`'s internal state machine is correct; `data` typing could tighten

[use-action.ts:34–38](packages/kit-react/src/hooks/use-action.ts#L34-L38):

```ts
type InternalState<TResult> =
    | { data: TResult; error: undefined; status: 'success' }
    | { data: undefined; error: undefined; status: 'idle' | 'running' }
    | { data: undefined; error: unknown; status: 'error' };
```

Good — discriminated union enforces the invariants. But the public `ActionState<TArgs, TResult>` loosens to the classic `{data: TResult | undefined, error: unknown, status: ActionStatus}` flat shape:

```ts
export type ActionState<TArgs extends unknown[], TResult> = {
    readonly data: TResult | undefined;
    readonly error: unknown;
    // ...
    readonly status: ActionStatus;
};
```

…which gives callers `data: TResult | undefined` in all branches, even under `if (status === 'success')`. A discriminated-union public type (`ActionStateSuccess<TResult> | ActionStateError | ActionStateIdle | ActionStateRunning`) would let `if (status === 'success') { data.foo }` narrow without a non-null assertion. SWR / TanStack both expose discriminated-union results.

Non-breaking if you keep the flat shape and add a `isSuccess` / `isError` / `isIdle` / `isRunning` discriminator (see the earlier DX note) — the discriminator narrowing works with TS.

### Public / internal export hygiene

A few items in `kit-react/src/internal` are effectively public because `kit-react-wallet` consumes them through the published interface — they're just not called out as such:

- `useClientCapability` — public via `src/client-capability.ts`. ✅
- `useIdentityChurnWarning` — public via `src/dev-warnings.ts`. ✅ (and the docblock scopes it correctly to providers).

Internal items that are *actually* internal:

- `useParentWithPayer` / `useParentWithoutWallet` — used only by providers in their own packages. ✅
- `useRpcClient` / `useClientWithSendTransaction` / etc. — used only by hooks in their own package. ✅
- `disposeClient` — internal but tested directly. `test/client-context.test.tsx` imports from `src/internal/dispose` — fine for tests, but means `src/internal/**` has to stay reachable from `test/**`. Watch that any future `exports` restriction doesn't break this.

One oddity: `useIdentityChurnWarning` is exported publicly but third-party authors probably don't know that. Either add a "For plugin authors shipping custom providers" paragraph to [kit-react/README.md#285](packages/kit-react/README.md#L285) (Third-party extensions) or leave it as a "discover via the types" feature. A one-liner in the README would close the gap.

### Minor: `useLiveStore`'s abortRef → controllerRef naming

The spec ([spec.md:725–737](react-lib-spec.md#L725-L737)) uses `abortRef`; the impl ([live-store.ts:108](packages/kit-react/src/internal/live-store.ts#L108)) uses `controllerRef`. Not a drift — the impl name is clearer (the ref holds a controller, not a signal or an abort fn) — but if you circulate the spec, the sketch should match.

---

## SWR / TanStack Query adapters

Both adapters are currently spec-only. Impl hasn't started. Before it does, two questions are worth pinning down:

### Same hook name (`useSendTransaction`) across entry points

The spec proposes that the core, SWR, and TanStack adapters all export `useSendTransaction` — disambiguated by import path (`@solana/kit-react` vs `/swr` vs `/query`). IDE autocomplete in a mixed project will surface three `useSendTransaction` entries and leave the user to pick. The spec argues this is fine ("import path disambiguates") and it keeps the rename cost low for users switching adapter.

Alternatives:

1. **Keep the name shared** (current spec) — minimum friction for migration, maximum IDE ambiguity.
2. **Rename in adapters**: `useSwrSendTransaction`, `useQuerySendTransaction`. Unambiguous, verbose, loses the migration parity.
3. **Drop the core version when an adapter is in use**, document "if you have SWR / TanStack, use their version; core's is for the no-cache case". Forces an explicit choice, clearest mental model, doesn't force a rename since name collisions only matter when you `import` both.

I'd lean (3). The core hook is genuinely a different shape (`{send, status, data, error, reset}` vs SWR's `{trigger, isMutating, error}` vs TanStack's `{mutateAsync, isPending, error}`), so "which one did I import?" is load-bearing. Re-exporting the adapter hooks from `@solana/kit-react/swr` only, and telling users "import it from there" rather than "import it from here too", avoids the three-entries-in-autocomplete problem.

### Adapter mutation hook shape

The spec mutates the return shape:

- Core: `{send, status, data, error, reset}`.
- SWR adapter: `{trigger, isMutating, error}` (native SWR).
- TanStack adapter: `{mutateAsync, isPending, error}` (native TanStack).

That's the right call. Switching from core → SWR is a one-line import change *plus* a call-site rewrite (`send(…)` → `trigger(…)`). A user who's already using SWR elsewhere will expect the native shape; wrapping it in the core `{send, status}` shape would make the hook look like a one-off. Keep as spec'd.

But do make the migration cost visible — the SWR/Query sections should open with a "Differences from `@solana/kit-react`'s `useSendTransaction`" callout so users doing the switch aren't surprised at call sites.

### Generic bridge naming drift

Spec [spec.md:1196](react-lib-spec.md#L1196):

```ts
function useLiveSwr<T>(key: SWRKey, config: CreateReactiveStoreConfig): SWRResponse<T>;
```

Spec [spec.md:1289](react-lib-spec.md#L1289):

```ts
function useLiveQuery<T>(key: QueryKey, config: CreateReactiveStoreConfig, options?: UseQueryOptions): UseQueryResult<T>;
```

The TanStack bridge is called `useLiveQuery` — **same name as the core's generic live hook**. Either rename the TanStack one (`useLiveReactQuery`? `useReactQueryLive`?) or rename the core's existing `useLiveQuery` (`useLiveReactiveStore`?). Collision is a real risk — a user with both imports will get conflicting names and have to alias.

The core's `useLiveQuery` is the more established name by now. Renaming the TanStack adapter is the smaller ask. `useLiveQueryTanstack` or `useTanstackLiveQuery` both read oddly; `useLiveReactQuery` reads naturally given TanStack's origin as react-query. I'd go with **`useLiveReactQuery`** in the TanStack adapter.

### Peer-deps have to handle the adapter entry points

The spec lists SWR/TanStack as peer deps of the adapters, not of core. Good. But the core `package.json` exports don't currently carve out `./swr` / `./query` subpaths — they'll need to be added when the adapters land, with their own bundle outputs from tsup. Worth a pre-emptive ADR-style note in the spec so the build setup doesn't surprise the implementer.

---

## Summary

Three items are actually worth filing a fix for:

1. **`priorityFees` doc drift** ([kit-react/README.md:79](packages/kit-react/README.md#L79), [spec.md:146](react-lib-spec.md#L146)) — the prop doesn't exist at the `<RpcProvider>` level; it lives inside `transactionConfig`. Two-line doc fix.
2. **`isAbortError` helper** — adds a one-line export, simplifies every `useAction`-based example, and removes the unchecked `err as Error` cast from ten+ places. Non-breaking. Net positive.
3. **Test-coverage pass on the live-data and transaction hooks** — the primitives are covered, the hooks on top aren't. A `createStubRpcClient()` helper + one focused test per hook closes the gap with ~300 lines.

A handful of smaller DX items are worth considering as a batch:

- Re-export wallet hooks from `@solana/kit-react` (or at least add a cross-package name table).
- `useAction` shorthand discriminators (`isRunning`, `isError`, …) — ergonomic-only.
- `useLiveQuery` generic reordering so `<TItem>` is first.
- `useSubscription` → full `LiveQueryResult<T>` shape (surface `slot` + `isLoading`).
- A `useSendAndConfirmTransaction` composed hook (or a spec note showing the idiomatic compose).

And three questions to answer before the SWR / TanStack adapter implementation starts:

- Shared `useSendTransaction` name across entry points — keep (ambiguity cost) or rename in adapters (rename cost)?
- TanStack generic bridge collision with the core's `useLiveQuery` — rename to `useLiveReactQuery`?
- Carving out `./swr` / `./query` subpath exports in `@solana/kit-react`'s `package.json`.

Structurally, the library is in good shape — the remaining items are polish, not redesign.
