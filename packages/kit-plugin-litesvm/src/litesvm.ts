import { LiteSVM } from '@loris-sandbox/litesvm-kit';

import { createRpcFromSvm } from './litesvm-to-rpc';

// Re-export the LiteSVM type to make the `litesvm` plugin type-portable.
export type { LiteSVM } from '@loris-sandbox/litesvm-kit';

/**
 * A Kit plugin that adds LiteSVM functionality to your client.
 *
 * This plugin starts a new LiteSVM instance within your Kit client,
 * allowing you to simulate Solana programs and accounts locally.
 * Additionally, it derives a small RPC subset that interacts with the
 * LiteSVM instance instead of making network requests.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { litesvm } from '@solana/kit-plugin-litesvm';
 *
 * // Install the LiteSVM plugin.
 * const client = createEmptyClient().use(litesvm());
 *
 * // Use LiteSVM to set up accounts and programs.
 * client.svm.setAccount(myAccount);
 * client.svm.addProgramFromFile(myProgramAddress, 'my_program.so');
 *
 * // Make some RPC calls.
 * const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
 * ```
 */
export function litesvm() {
    return <T extends object>(client: T) => {
        const svm = new LiteSVM();
        const rpc = createRpcFromSvm(svm);
        return { ...client, rpc, svm };
    };
}
