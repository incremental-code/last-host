export function parseArgv(argv = []) {
  const [command = '', ...rest] = argv;
  const flags = {};
  const positionals = [];

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const [, rawKey, inlineValue] = token.match(/^--([^=]+)(?:=(.*))?$/) || [];
    if (!rawKey) continue;

    if (inlineValue !== undefined) {
      flags[rawKey] = inlineValue;
      continue;
    }

    const next = rest[i + 1];
    if (!next || next.startsWith('--')) {
      flags[rawKey] = 'true';
      continue;
    }

    flags[rawKey] = next;
    i += 1;
  }

  return { command, flags, positionals };
}
