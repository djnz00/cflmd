export class CommandLineError extends Error {
  constructor(message, { exitCode = 1 } = {}) {
    super(message);
    this.name = 'CommandLineError';
    this.exitCode = exitCode;
  }
}
