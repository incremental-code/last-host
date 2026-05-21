#!/usr/bin/env node
import { runCli } from '../src/cli.js';

runCli(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`status=error\nfailedStep=cli\nmessage=${error.message}\n`);
  process.exit(1);
});
