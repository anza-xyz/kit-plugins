/**
 * TODO(move-to-kit): `isAbortError` has been merged into Kit but not yet
 * released in the `@solana/kit` version this repo pins. Delete this file
 * and re-export from `@solana/kit` directly once the Kit release lands.
 */

/**
 * Returns `true` if the given value is an `AbortError`, thrown by an
 * `AbortSignal` whose `abort()` was called.
 *
 * Use this to filter supersede rejections when you `await` the result of
 * an {@link ActionResult.send} call.
 *
 * @param error - The value to test.
 * @return `true` if `error` is an abort-originated `Error`, `false` otherwise.
 *
 * @example
 * ```tsx
 * try {
 *     const result = await send(instruction);
 *     navigate(`/tx/${result.context.signature}`);
 * } catch (err) {
 *     if (isAbortError(err)) return; // superseded, the store already reflects the newer call
 *     throw err;
 * }
 * ```
 */
export function isAbortError(error: unknown): boolean {
    return error instanceof Error && (error.name === 'AbortError' || (error as { code?: string }).code === 'ABORT_ERR');
}
