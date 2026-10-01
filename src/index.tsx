/**
 * The entry point, and nothing but the runtime gate.
 *
 * Every import declaration in a module is evaluated before the module's first
 * statement, so a check written at the top of `main.tsx` would still run after
 * `@opentui/core` and the rest had initialised — on an unsupported runtime,
 * after one of them had already thrown something unreadable. Keeping the app
 * behind a dynamic import makes the order explicit: check, then load.
 */
import { assertSupportedRuntime } from '~/lib/preflight';

assertSupportedRuntime();

await import('./main');
