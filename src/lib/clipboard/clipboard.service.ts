import Logger from '../logger/logger.service';

// The TUI owns the terminal, so it can't rely on the terminal emulator's own
// copy/paste. Instead it bridges to the macOS system clipboard through the
// `pbcopy` / `pbpaste` binaries.

/** Writes `text` to the system clipboard. Silently no-ops on failure. */
export async function writeClipboard(text: string): Promise<void> {
  try {
    const proc = Bun.spawn(['pbcopy'], { stdin: 'pipe' });
    proc.stdin.write(text);
    await proc.stdin.end();
    await proc.exited;
  } catch (error) {
    Logger.log(`clipboard: copy failed: ${error}`);
  }
}

/** Reads the system clipboard, returning '' if it's empty or unavailable. */
export async function readClipboard(): Promise<string> {
  try {
    const proc = Bun.spawn(['pbpaste'], { stdout: 'pipe' });
    const text = await new Response(proc.stdout).text();
    await proc.exited;
    return text;
  } catch (error) {
    Logger.log(`clipboard: paste failed: ${error}`);
    return '';
  }
}
