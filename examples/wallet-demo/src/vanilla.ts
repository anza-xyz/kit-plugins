/**
 * Vanilla JS wallet demo.
 *
 * Expected HTML:
 *
 * ```html
 * <div id="wallet-list"></div>
 *
 * <div id="connected" hidden>
 *   <p>Connected: <span id="address"></span></p>
 *   <p id="readonly-badge" hidden>Read-only wallet — cannot sign transactions</p>
 *   <button id="send-button">Send 0.01 SOL</button>
 *   <button id="disconnect-button">Disconnect</button>
 * </div>
 * ```
 */
import { getTransferSolInstruction } from '@solana-program/system';
import { address, lamports } from '@solana/kit';
import { client } from './client';

const walletListEl = document.getElementById('wallet-list')!;
const connectedEl = document.getElementById('connected')!;
const addressEl = document.getElementById('address')!;
const readonlyBadge = document.getElementById('readonly-badge')!;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const disconnectButton = document.getElementById('disconnect-button') as HTMLButtonElement;

// Recipient for the demo transfer — in a real app this comes from a form.
const DEMO_RECIPIENT = address('4Nd1mBQtrMJVYVfKf2PX98RQ1VJdTkzEFnQfqXFsqMRC');

function render(): void {
    const { wallets, connected, status } = client.wallet.getState();

    // Don't render anything until the plugin has checked storage.
    // This avoids flashing a connect button before auto-reconnect fires.
    if (status === 'pending') return;

    if (!connected) {
        connectedEl.hidden = true;
        walletListEl.hidden = false;
        walletListEl.innerHTML = '';

        if (wallets.length === 0) {
            walletListEl.textContent = 'No wallets found. Install a Solana wallet extension.';
            return;
        }

        for (const w of wallets) {
            const btn = document.createElement('button');
            btn.textContent = w.name;
            btn.onclick = () => client.wallet.connect(w);
            walletListEl.appendChild(btn);
        }
    } else {
        walletListEl.hidden = true;
        connectedEl.hidden = false;
        addressEl.textContent = connected.account.address;
        readonlyBadge.hidden = connected.signer !== null;
        sendButton.hidden = connected.signer === null;
    }
}

// Re-render whenever wallet state changes.
client.wallet.subscribe(render);
render();

disconnectButton.addEventListener('click', () => {
    client.wallet.disconnect();
});

sendButton.addEventListener('click', async () => {
    const signer = client.wallet.getState().connected?.signer;
    if (!signer) return; // wallet disconnected or read-only between render and click

    sendButton.disabled = true;
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
        sendButton.disabled = false;
    }
});
