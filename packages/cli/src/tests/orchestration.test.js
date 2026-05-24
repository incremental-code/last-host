import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildArtifact } from '../build.js';
import { deployApp } from '../deploy.js';

const fixtureCwd = '/tmp/last-host-cli-fixture';

function createMockShell({
  prepareStdout = 'status=ok\n',
  activateStdout = 'status=ok\nurl=https://shop.acme.com\n',
} = {}) {
  const calls = [];
  return {
    calls,
    async run(command, args = []) {
      calls.push({ command, args });

      if (command === 'ssh' && args.at(-1).includes('prepare-release')) {
        return { stdout: prepareStdout, stderr: '' };
      }

      if (command === 'ssh' && args.at(-1).includes('activate-release')) {
        return { stdout: activateStdout, stderr: '' };
      }

      return { stdout: '', stderr: '' };
    },
  };
}

const mockFs = {
  async readFile() {
    return JSON.stringify({
      name: '@acme/shop',
      scripts: { build: 'echo build' },
    });
  },
};

test('buildArtifact runs build and creates tarball', async () => {
  const shell = createMockShell();

  const result = await buildArtifact({
    cwd: fixtureCwd,
    shell,
    fs: mockFs,
    now: () => 1,
  });

  assert.equal(result.app, 'shop');
  assert.equal(shell.calls.some((call) => call.command === 'npm'), true);
  assert.equal(shell.calls.some((call) => call.command === 'tar'), true);
});

test('deployApp orchestrates build, upload and remote release activation', async () => {
  const shell = createMockShell();

  const result = await deployApp({
    cwd: fixtureCwd,
    flags: {
      org: 'Acme',
      host: 'LastJS.org',
      url: 'https://shop.acme.com',
      'ssh-user': 'deploy',
      'ssh-key': '/keys/deploy.pem',
      'remote-root': '/opt/last-host',
    },
    env: {},
    shell,
    fs: mockFs,
  });

  assert.equal(result.url, 'https://shop.acme.com');
  assert.equal(shell.calls.some((call) => call.command === 'scp'), true);
  assert.equal(
    shell.calls.some((call) => call.command === 'ssh' && call.args.at(-1).includes('prepare-release')),
    true,
  );
  assert.equal(
    shell.calls.some((call) => call.command === 'ssh' && call.args.at(-1).includes('activate-release')),
    true,
  );
  const prepareCommand = shell.calls.find(
    (call) => call.command === 'ssh' && call.args.at(-1).includes('prepare-release'),
  ).args.at(-1);
  assert.match(prepareCommand, /--url/);
  assert.match(prepareCommand, /--health-path/);
  assert.equal(shell.calls.some((call) => call.command === 'ssh' && call.args.includes('-i')), true);
});

test('deployApp supports path URLs', async () => {
  const shell = createMockShell({
    activateStdout: 'status=ok\nurl=https://lastjs.org/demo/ecommerce\n',
  });

  const result = await deployApp({
    cwd: fixtureCwd,
    flags: {
      org: 'demo',
      app: 'ecommerce',
      host: 'lastjs.org',
      url: 'https://lastjs.org/demo/ecommerce',
    },
    env: {},
    shell,
    fs: mockFs,
  });

  assert.equal(result.url, 'https://lastjs.org/demo/ecommerce');
  const prepareCommand = shell.calls.find(
    (call) => call.command === 'ssh' && call.args.at(-1).includes('prepare-release'),
  ).args.at(-1);
  assert.match(prepareCommand, /--url/);
  assert.match(prepareCommand, /\/demo\/ecommerce/);
});

test('deployApp stops when prepare-release returns error', async () => {
  const shell = createMockShell({ prepareStdout: 'status=error\nmessage=prepare failed\n' });

  await assert.rejects(
    () =>
      deployApp({
        cwd: fixtureCwd,
        flags: { org: 'acme', host: 'edge-a' },
        env: {},
        shell,
        fs: mockFs,
      }),
    /prepare failed/,
  );

  assert.equal(
    shell.calls.some((call) => call.command === 'ssh' && call.args.at(-1).includes('activate-release')),
    false,
  );
});

test('deployApp surfaces activate-release errors', async () => {
  const shell = createMockShell({ activateStdout: 'status=error\nmessage=activate failed\n' });

  await assert.rejects(
    () =>
      deployApp({
        cwd: fixtureCwd,
        flags: { org: 'acme', host: 'edge-a' },
        env: {},
        shell,
        fs: mockFs,
      }),
    /activate failed/,
  );
});
