#!/usr/bin/env node
import { run } from '../src/index.js';

run(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`status=error\nmessage=${error.message}\n`);
  process.exit(1);
});
