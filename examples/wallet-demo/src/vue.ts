/**
 * Vue wallet demo.
 *
 * Demonstrates binding client.wallet state to Vue using a shallowRef composable.
 *
 * Template usage (WalletDemo.vue):
 *
 * ```vue
 * <script setup lang="ts">
 * import { useWalletState } from './vue';
 * const { wallets, connected, status } = useWalletState();
 * </script>
 *
 * <template>
 *   <template v-if="status !== 'pending'">
 *     <div v-if="!connected">
 *       <h2>Connect a wallet</h2>
 *       <p v-if="wallets.length === 0">No wallets found. Install a Solana wallet extension.</p>
 *       <ul v-else>
 *         <li v-for="w in wallets" :key="w.name">
 *           <button @click="connect(w)">{{ w.name }}</button>
 *         </li>
 *       </ul>
 *     </div>
 *     <div v-else>
 *       <p>Connected: <code>{{ connected.account.address }}</code></p>
 *       <p v-if="!connected.signer">Read-only wallet — cannot sign transactions</p>
 *       <button v-else :disabled="pending" @click="sendTransfer">
 *         {{ pending ? 'Sending…' : 'Send 0.01 SOL' }}
 *       </button>
 *       <button @click="disconnect">Disconnect</button>
 *     </div>
 *   </template>
 * </template>
 * ```
 */
import { getTransferSolInstruction } from '@solana-program/system';
import { address, lamports } from '@solana/kit';
import { type WalletState } from '@solana/kit-plugin-wallet';
import { type ComputedRef, computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { client } from './client';

// Recipient for the demo transfer — in a real app this comes from a form.
const DEMO_RECIPIENT = address('4Nd1mBQtrMJVYVfKf2PX98RQ1VJdTkzEFnQfqXFsqMRC');

/**
 * Composable that binds client.wallet state to Vue reactive state.
 * Returns individual computed refs for easy destructuring in templates.
 */
export function useWalletState(): {
    wallets: ComputedRef<WalletState['wallets']>;
    connected: ComputedRef<WalletState['connected']>;
    status: ComputedRef<WalletState['status']>;
} {
    const snapshot = shallowRef<WalletState>(client.wallet.getState());

    onMounted(() => {
        const unsub = client.wallet.subscribe(() => {
            snapshot.value = client.wallet.getState();
        });
        onUnmounted(unsub);
    });

    return {
        wallets: computed(() => snapshot.value.wallets),
        connected: computed(() => snapshot.value.connected),
        status: computed(() => snapshot.value.status),
    };
}

/** Actions composable — keeps action logic separate from state binding. */
export function useWalletActions() {
    const pending = ref(false);

    function connect(w: WalletState['wallets'][number]) {
        client.wallet.connect(w);
    }

    function disconnect() {
        client.wallet.disconnect();
    }

    async function sendTransfer() {
        const signer = client.wallet.getState().connected?.signer;
        if (!signer) return; // wallet disconnected or read-only between render and click

        pending.value = true;
        try {
            await client.sendTransaction(
                getTransferSolInstruction({
                    source: signer,
                    destination: DEMO_RECIPIENT,
                    amount: lamports(10_000_000n), // 0.01 SOL
                }),
            );
            alert('Transfer sent!');
        } catch (e) {
            console.error(e);
            alert('Transfer failed. See console for details.');
        } finally {
            pending.value = false;
        }
    }

    return { connect, disconnect, pending, sendTransfer };
}
