export class CliArgumentError extends Error {}

export function parseFlagArgs(argv: string[]): {
  flags: Map<string, string | true>;
  positionals: string[];
} {
  const flags = new Map<string, string | true>();
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }

    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (arg === "-h") {
      flags.set("help", true);
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new CliArgumentError(`Unknown short option: ${arg}`);
    }

    const [name, inlineValue] = arg.slice(2).split("=", 2);
    if (name.length === 0) throw new CliArgumentError("Invalid option: --");

    if (inlineValue != null) {
      flags.set(name, inlineValue);
      continue;
    }

    const next = argv[i + 1];
    if (next == null || next.startsWith("-")) {
      flags.set(name, true);
      continue;
    }

    flags.set(name, next);
    i += 1;
  }

  return { flags, positionals };
}

export function requireStringFlag(flags: Map<string, string | true>, name: string): string | null {
  const value = flags.get(name);
  if (value == null) return null;
  if (value === true) throw new CliArgumentError(`--${name} requires a value`);
  return value;
}
