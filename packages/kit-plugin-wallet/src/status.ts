import type { WalletStatus } from './types';

/**
 * Reports whether a {@link WalletStatus} belongs to the initial auto-reconnect
 * "warm-up": `'pending'` (before auto-reconnect has resolved) and
 * `'reconnecting'` (silently re-establishing a persisted connection). During
 * this window a persisted wallet is on its way back, so wallet-dependent UI
 * should usually hold rather than flash a "disconnected" state.
 *
 * User-initiated `'connecting'` / `'disconnecting'` are deliberately excluded —
 * a normal connect or disconnect is not a warm-up and must stay interactive.
 *
 * This is the single source of truth for "warm-up" across the plugin: the
 * store's {@link WalletNamespace.whenReady} waits for the status to leave this set, and the
 * React `useIsWalletReady` hook and `WalletReadyGate` component gate on its
 * negation. Use it directly to gate on warm-up from a non-React consumer.
 *
 * @param status - A status from `client.wallet.getState().status`.
 * @returns `true` while the client is warming up, otherwise `false`.
 *
 * @example
 * ```ts
 * client.wallet.subscribe(() => {
 *     const { status } = client.wallet.getState();
 *     setLoading(isWalletWarmingUp(status));
 * });
 * ```
 *
 * @see {@link WalletNamespace.whenReady} — the imperative (promise-based) counterpart.
 */
export function isWalletWarmingUp(status: WalletStatus): boolean {
    return status === 'pending' || status === 'reconnecting';
}
