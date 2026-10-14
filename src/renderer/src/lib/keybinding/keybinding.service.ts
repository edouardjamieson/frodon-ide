import { DEFAULT_KEYBINDINGS } from './keybinding.constant';
import type { Chord, CommandId } from './keybinding.def';

/**
 * Names for keys whose `KeyboardEvent.key` is longer than it needs to be in a
 * config file. `mod+shift+left` is what a person would write; `ArrowLeft` is
 * what the browser calls it.
 */
const KEY_ALIASES: Record<string, string> = {
  arrowleft: 'left',
  arrowright: 'right',
  arrowup: 'up',
  arrowdown: 'down',
  escape: 'esc',
  ' ': 'space',
};

function normalizeKey(key: string): string {
  const lower = key.toLowerCase();
  return KEY_ALIASES[lower] ?? lower;
}

/** `mod+shift+g` -> a chord. Unknown words are ignored rather than thrown on. */
export function parseChord(chord: string): Chord {
  const parts = chord.toLowerCase().split('+');
  // The key is the last part, so `mod++` — a binding on the plus key — still
  // parses, which splitting on the separator would otherwise make impossible.
  const key = normalizeKey(parts.pop() ?? '');

  return {
    mod: parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key,
  };
}

/**
 * The chord a key event represents, or null when it is not one we can match.
 *
 * Null for the *other* platform's modifier: Cmd+Ctrl+W on macOS is a chord
 * somebody meant for something else, and must not be mistaken for `mod+w`.
 *
 * `event.key` rather than `event.code`, so a binding follows the letter
 * printed on the key. On a layout where that moves, the binding moves with it
 * — which is the behaviour to want unless the key is being used positionally,
 * and none of these are.
 */
export function chordOfEvent(event: KeyboardEvent, mac: boolean): Chord | null {
  if (mac ? event.ctrlKey : event.metaKey) return null;

  return {
    mod: mac ? event.metaKey : event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    key: normalizeKey(event.key),
  };
}

export function sameChord(a: Chord, b: Chord): boolean {
  return (
    a.mod === b.mod && a.shift === b.shift && a.alt === b.alt && a.key === b.key
  );
}

/**
 * The table, parsed once at module load rather than per keystroke. Typing in
 * an editor runs the lookup below on every character.
 */
const PARSED = DEFAULT_KEYBINDINGS.map((binding) => ({
  chord: parseChord(binding.chord),
  command: binding.command,
}));

/** Which command a chord runs, or null. First match wins. */
export function commandFor(chord: Chord): CommandId | null {
  return (
    PARSED.find((binding) => sameChord(binding.chord, chord))?.command ?? null
  );
}
