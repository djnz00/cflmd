import { Command, CommanderError } from 'commander';

import { CommandLineError } from './command-line-error.js';

const QUIET_OUTPUT = {
  writeErr() {},
  writeOut() {}
};

export function parseRootArguments(argv) {
  const { leadingOptions, remainder } = splitRootArguments(argv);
  const parser = createParser();

  parser
    .option('--help')
    .option('-v, --version')
    .option('--token <token>')
    .option('--user <user>');

  parseWithCommandLineErrors(parser, leadingOptions);

  const options = validateOptionValues(parser.opts(), {
    token: '--token',
    user: '--user'
  });

  return {
    command: remainder[0],
    commandArgs: remainder.slice(1),
    help: Boolean(options.help),
    globalOptions: {
      token: options.token,
      user: options.user
    },
    version: Boolean(options.version)
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

export function parsePullArguments(argv) {
  return parseCommandArguments(argv, {
    allowManifest: true
  });
}

export function parsePushArguments(argv) {
  return parseCommandArguments(argv, {
    allowForce: true,
    allowManifest: true
  });
}

function parseCommandArguments(
  argv,
  {
    allowForce = false,
    allowInput = false,
    allowManifest = false,
    allowOutput = false
  } = {}
) {
  const parser = createParser();

  parser.option('--help');

  if (allowForce) {
    parser.option('--force');
  }

  if (allowInput) {
    parser.option('-i, --input <path>');
  }

  if (allowManifest) {
    parser.option('-f, --manifest <path>');
  }

  if (allowOutput) {
    parser.option('-o, --output <path>');
  }

  parseWithCommandLineErrors(parser, argv);

  const options = validateOptionValues(parser.opts(), {
    input: '--input',
    manifest: '--manifest',
    output: '--output'
  });

  return {
    force: Boolean(options.force),
    help: Boolean(options.help),
    input: options.input,
    manifest: options.manifest,
    output: options.output,
    positionals: parser.args
  };
}

function createParser() {
  return new Command()
    .allowExcessArguments(true)
    .configureOutput(QUIET_OUTPUT)
    .exitOverride()
    .helpOption(false);
}

function parseWithCommandLineErrors(parser, argv) {
  try {
    parser.parse(argv, { from: 'user' });
  } catch (error) {
    throw normalizeParseError(error);
  }
}

function normalizeParseError(error) {
  if (!(error instanceof CommanderError)) {
    throw error;
  }

  if (error.code === 'commander.unknownOption') {
    const optionName = extractOptionName(error.message);
    const misplacedGlobalOption = normalizeGlobalOptionName(optionName);

    if (misplacedGlobalOption) {
      return new CommandLineError(
        `Global option ${misplacedGlobalOption} must appear before the subcommand.`
      );
    }

    return new CommandLineError(`Unknown option: ${optionName}`);
  }

  if (error.code === 'commander.optionMissingArgument') {
    return new CommandLineError(`Missing value for ${extractOptionName(error.message)}.`);
  }

  return new CommandLineError(stripErrorPrefix(error.message));
}

function validateOptionValues(options, optionNames) {
  for (const [propertyName, optionName] of Object.entries(optionNames)) {
    if (options[propertyName] === '') {
      throw new CommandLineError(`Missing value for ${optionName}.`);
    }
  }

  return options;
}

function splitRootArguments(argv) {
  const leadingOptions = [];
  let index = 0;

  while (index < argv.length) {
    const argument = argv[index];

    if (!argument.startsWith('-')) {
      break;
    }

    leadingOptions.push(argument);
    index += 1;

    if ((argument === '--token' || argument === '--user') && shouldConsumeRootOptionValue(argv[index])) {
      leadingOptions.push(argv[index]);
      index += 1;
    }
  }

  return {
    leadingOptions,
    remainder: argv.slice(index)
  };
}

function shouldConsumeRootOptionValue(argument) {
  return Boolean(argument) && !argument.startsWith('--');
}

function normalizeGlobalOptionName(optionName) {
  if (optionName === '--token' || optionName.startsWith('--token=')) {
    return '--token';
  }

  if (optionName === '--user' || optionName.startsWith('--user=')) {
    return '--user';
  }

  return null;
}

function extractOptionName(message) {
  return (
    message.match(/--[a-z-]+(?:=[^\s']*)?/)?.[0] ??
    message.match(/'([^']+)'/)?.[1] ??
    stripErrorPrefix(message)
  );
}

function stripErrorPrefix(message) {
  return message.replace(/^error:\s*/, '');
}
