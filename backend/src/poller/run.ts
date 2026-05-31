import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';
import { startMantleTestnetPoller } from './mantleTestnet.js';

if (!env.MANTLE_TESTNET_RPC) {
  logger.error('MANTLE_TESTNET_RPC is not set — poller cannot start');
  process.exit(1);
}

const stopPoller = startMantleTestnetPoller(env.MANTLE_TESTNET_RPC, env.POLL_INTERVAL_MS);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopPoller();
    process.exit(0);
  });
}
