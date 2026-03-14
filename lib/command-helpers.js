import { readFile, writeFile } from 'node:fs/promises';

import { readStream } from './read-stream.js';

export function requireAtlassianCredentials(globalOptions) {
  const { user, token } = globalOptions;

  if (!user) {
    throw new Error('Missing Atlassian user. Set ATLASSIAN_USER or pass --user=USER.');
  }

  if (!token) {
    throw new Error('Missing Atlassian token. Set ATLASSIAN_TOKEN or pass --token=TOKEN.');
  }

  return { token, user };
}

export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function readTextInput({ input, stdin }) {
  if (input) {
    return readFile(input, 'utf8');
  }

  return readStream(stdin);
}

export async function writeTextOutput({ output, stdout, text }) {
  if (output) {
    await writeFile(output, text, 'utf8');
    return;
  }

  stdout.write(text);
}
