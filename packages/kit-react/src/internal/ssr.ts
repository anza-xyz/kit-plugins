/**
 * `true` when the current bundle target is a live client (browser or
 * React Native). On server targets returns `false` so SSR paths can
 * return static "not yet available" snapshots without firing HTTP or
 * opening WebSockets.
 *
 * The flags `__BROWSER__` / `__REACTNATIVE__` are defined at build time
 * by tsup / vitest — see `tsup.config.base.ts` and
 * `vitest.config.base.mts` at the repo root.
 *
 * @internal
 */
export const IS_LIVE_CLIENT: boolean = __BROWSER__ || __REACTNATIVE__;
