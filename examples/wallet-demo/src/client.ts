/**
 * Shared client for all wallet demo examples.
 *
 * A single client instance is created once and shared across the app.
 * The walletAsPayer plugin populates client.payer dynamically when connected.
 * client.payer is undefined when disconnected, so sendTransaction will fail
 * explicitly if called without a connected wallet.
 */
import { createEmptyClient } from '@solana/kit';
import { planAndSendTransactions } from '@solana/kit-plugin-instruction-plan';
import { rpc, rpcTransactionPlanExecutor, rpcTransactionPlanner } from '@solana/kit-plugin-rpc';
import { walletAsPayer } from '@solana/kit-plugin-wallet';

export const client = createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(walletAsPayer({ chain: 'solana:localnet' }))
    .use(rpcTransactionPlanner())
    .use(rpcTransactionPlanExecutor())
    .use(planAndSendTransactions());

export type AppClient = typeof client;
