import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const skillCommand = new Command('skill')
  .description('Print full skill documentation for LLM capability discovery')
  .action(() => {
    try {
      const skillPath = resolve(__dirname, '../../../skills/tali/SKILL.md');
      const content = readFileSync(skillPath, 'utf-8');
      console.log(content);
    } catch {
      console.log('tali-cli: personal finance layer for crypto-active Southeast Asians.');
      console.log('Commands: networth, log, rules, wallet');
      console.log('Run `tali-cli --help` for details.');
    }
  });
