#!/usr/bin/env node
import { Command } from 'commander';
import { closeDb } from '../db/index.js';
import { networthCommand } from './commands/networth.js';
import { historyCommand } from './commands/history.js';
import { logCommand } from './commands/log.js';
import { rulesCommand } from './commands/rules.js';
import { walletCommand } from './commands/wallet.js';
import { skillCommand } from './commands/skill.js';

const program = new Command();

program
  .name('tali-cli')
  .description(
    'Tali — personal finance layer for crypto-active Southeast Asians.\n' +
      'Unified IDR net worth, P2P reconciliation, and autonomous rules.\n' +
      'Pairs with byreal-cli for DeFi execution on Byreal/Solana.',
  )
  .version('0.1.0');

program.addCommand(networthCommand);
program.addCommand(historyCommand);
program.addCommand(logCommand);
program.addCommand(rulesCommand);
program.addCommand(walletCommand);
program.addCommand(skillCommand);

program.parseAsync(process.argv).finally(() => closeDb());
