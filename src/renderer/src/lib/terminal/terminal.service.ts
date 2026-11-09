/**
 * How to read each terminal tab's recent output, by session id.
 *
 * The editor selection's arrangement, for the same reason: what a terminal
 * shows changes with every byte the shell prints, and is wanted only when an
 * agent asks — so each tab registers a reader of its own emulator's buffer,
 * and nothing is copied anywhere until then.
 */
const outputs = new Map<string, () => string>();

/** Registers a tab's reader. Returns the unregister, which removes only it. */
export function provideTerminalOutput(
  sessionId: string,
  read: () => string
): () => void {
  outputs.set(sessionId, read);
  return () => {
    if (outputs.get(sessionId) === read) outputs.delete(sessionId);
  };
}

/** What a terminal tab has printed lately, or null when it has no reader. */
export function terminalOutputOf(sessionId: string): string | null {
  return outputs.get(sessionId)?.() ?? null;
}
