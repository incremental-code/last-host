import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArgv } from '../args.js';

test('parseArgv parses flags and positionals', () => {
  const parsed = parseArgv([
    'deploy',
    '--org',
    'acme',
    '--host=edge-a',
    '--custom-domain',
    'shop.acme.com',
    'extra',
  ]);

  assert.equal(parsed.command, 'deploy');
  assert.equal(parsed.flags.org, 'acme');
  assert.equal(parsed.flags.host, 'edge-a');
  assert.equal(parsed.flags['custom-domain'], 'shop.acme.com');
  assert.deepEqual(parsed.positionals, ['extra']);
});
