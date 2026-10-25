/**
 * Junk hidden regardless of configuration. Ported from the TUI unchanged —
 * none of it was ever terminal-specific.
 *
 * The list itself lives in `@shared/config.def` now, because the settings
 * page prints it beside the project's own patterns. This name stays so the
 * matcher reads the way it always did.
 */
export { ALWAYS_EXCLUDED as ALWAYS_IGNORED } from '@shared/config.def';
