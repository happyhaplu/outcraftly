const originalError = console.error;

const formatStack = (title, stack) => {
  if (!stack) {
    originalError(title, '(no stack available)');
    return;
  }

  const trimmed = stack.split('\n').slice(0, 15).join('\n');
  originalError(title);
  originalError(trimmed);
};

console.error = (...args) => {
  try {
    const trace = new Error('console.error trace');
    originalError('\n[console.error captured]\n');
    formatStack('Hook stack trace:', trace.stack);

    args.forEach((arg, index) => {
      if (arg instanceof Error) {
        formatStack(`Arg[${index}] error stack:`, arg.stack ?? String(arg));
      } else {
        originalError(`Arg[${index}]:`, arg);
      }
    });

    originalError('[/console.error captured]\n');
  } catch (hookError) {
    originalError('console.error hook failed', hookError);
    originalError(...args);
  }
};

const logUnhandled = (type, error) => {
  originalError(`\n[${type} captured]\n`);
  if (error instanceof Error) {
    formatStack(`${type} stack:`, error.stack ?? String(error));
  } else {
    originalError(`${type}:`, error);
  }
  originalError(`[/${type} captured]\n`);
};

process.on('unhandledRejection', (reason) => {
  logUnhandled('unhandledRejection', reason);
});

process.on('uncaughtException', (error) => {
  logUnhandled('uncaughtException', error);
});
