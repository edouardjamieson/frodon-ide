/**
 * How long a setting has to sit still before it is written down.
 *
 * Shorter than the layout's second, because a settings dialog is a place
 * where somebody is watching for their change to take, and longer than the
 * search debounce, because nothing here is racing a keystroke to a result.
 * Its only job is to make typing a project's name one write instead of
 * eleven.
 */
export const CONFIG_SAVE_MS = 400;
