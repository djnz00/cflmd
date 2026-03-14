import { CommandLineError } from './command-line-error.js';

export function parseRootArguments(argv) {
  let help = false;
  let token;
  let user;
  let index = 0;

  while (index < argv.length) {
    const argument = argv[index];

    if (argument === '--help') {
      help = true;
      index += 1;
      continue;
    }

    if (argument === '--token') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new CommandLineError('Missing value for --token.');
      }
      token = value;
      index += 2;
      continue;
    }

    if (argument === '--user') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new CommandLineError('Missing value for --user.');
      }
      user = value;
      index += 2;
      continue;
    }

    if (argument.startsWith('--token=')) {
      token = readEqualsValue(argument, '--token=');
      index += 1;
      continue;
    }

    if (argument.startsWith('--user=')) {
      user = readEqualsValue(argument, '--user=');
      index += 1;
      continue;
    }

    if (argument.startsWith('--')) {
      throw new CommandLineError(`Unknown option: ${argument}`);
    }

    break;
  }

  return {
    command: argv[index],
    commandArgs: argv.slice(index + 1),
    help,
    globalOptions: {
      token,
      user
    }
  };
}

export function parseGetArguments(argv) {
  return parseCommandArguments(argv, {
    allowOutput: true
  });
}

export function parseExportArguments(argv) {
  return parseCommandArguments(argv, {
    allowInput: true,
    allowOutput: true
  });
}

export function parseImportArguments(argv) {
  return parseCommandArguments(argv, {
    allowForce: true,
    allowInput: true,
    allowOutput: true
  });
}

export function parsePutArguments(argv) {
  return parseCommandArguments(argv, {
    allowForce: true,
    allowInput: true
  });
}

function parseCommandArguments(
  argv,
  {
    allowForce = false,
    allowInput = false,
    allowOutput = false
  } = {}
) {
  let help = false;
  let force = false;
  let input;
  let output;
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help') {
      help = true;
      continue;
    }

    const misplacedGlobalOption = getMisplacedGlobalOptionName(argument);
    if (misplacedGlobalOption) {
      throw new CommandLineError(
        `Global option ${misplacedGlobalOption} must appear before the subcommand.`
      );
    }

    if (allowForce && argument === '--force') {
      force = true;
      continue;
    }

    if (allowInput && (argument === '-i' || argument === '--input')) {
      input = readNextValue(argv, index, argument);
      index += 1;
      continue;
    }

    if (allowInput && argument.startsWith('--input=')) {
      input = readEqualsValue(argument, '--input=');
      continue;
    }

    if (allowOutput && (argument === '-o' || argument === '--output')) {
      output = readNextValue(argv, index, argument);
      index += 1;
      continue;
    }

    if (allowOutput && argument.startsWith('--output=')) {
      output = readEqualsValue(argument, '--output=');
      continue;
    }

    if (argument.startsWith('--')) {
      throw new CommandLineError(`Unknown option: ${argument}`);
    }

    positionals.push(argument);
  }

  return { force, help, input, output, positionals };
}

function readNextValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new CommandLineError(`Missing value for ${optionName}.`);
  }
  return value;
}

function getMisplacedGlobalOptionName(argument) {
  if (argument === '--token' || argument.startsWith('--token=')) {
    return '--token';
  }

  if (argument === '--user' || argument.startsWith('--user=')) {
    return '--user';
  }

  return null;
}

function readEqualsValue(argument, prefix) {
  const value = argument.slice(prefix.length);
  if (!value) {
    throw new CommandLineError(`Missing value for ${prefix.slice(0, -1)}.`);
  }
  return value;
}
