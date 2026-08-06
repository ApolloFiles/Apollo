import { browser } from '$app/environment';

export type ClientErrorLogEntry = {
  timestamp: string,
  message: string,
};

const MAX_ENTRIES = 20;
const MAX_MESSAGE_LENGTH = 2000;

const entries: ClientErrorLogEntry[] = [];
let installed = false;

function pushEntry(message: string): void {
  entries.push({
    timestamp: new Date().toISOString(),
    message: message.slice(0, MAX_MESSAGE_LENGTH),
  });

  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }
}

function stringifyUnknownError(reason: unknown): string {
  if (reason instanceof Error) {
    return `${reason.name}: ${reason.message}`;
  }

  try {
    return typeof reason === 'string' ? reason : JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

/**
 * Keeps a small in-memory ring buffer of recent client-side errors,
 * so they can be attached to feedback reports (see {@link getClientErrorLog}).
 */
export function installClientErrorLog(): void {
  if (!browser) {
    // This module holds module-level state, which would be shared between all requests/users on the server
    throw new Error('installClientErrorLog must only be called in the browser (e.g. inside onMount)');
  }

  if (installed) {
    return;
  }
  installed = true;

  window.addEventListener('error', (event) => {
    const location = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : '';
    pushEntry(`${event.message}${location}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    pushEntry(`Unhandled promise rejection: ${stringifyUnknownError(event.reason)}`);
  });

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]): void => {
    originalConsoleError(...args);
    pushEntry(args.map(stringifyUnknownError).join(' '));
  };
}

export function getClientErrorLog(): ReadonlyArray<ClientErrorLogEntry> {
  return entries;
}
