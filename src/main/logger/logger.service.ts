/**
 * Logging, which is no longer a problem.
 *
 * The TUI owned the terminal, so `console.log` corrupted the render and every
 * diagnostic had to be appended to ./test.log and tailed from another window.
 * Electron gives both halves a real console back: main-process output goes to
 * the terminal running `npm run dev`, renderer output to Chrome DevTools.
 *
 * This wrapper exists only to tag which subsystem spoke, since both streams
 * now carry a lot more traffic than one file ever did.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const sink: Record<Level, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

export function createLogger(scope: string) {
  const emit =
    (level: Level) =>
    (message: string, ...rest: unknown[]) =>
      sink[level](`[${scope}] ${message}`, ...rest);

  return {
    debug: emit('debug'),
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
  };
}
