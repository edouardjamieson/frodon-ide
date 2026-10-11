/**
 * What a terminal session looks like from either side of the boundary.
 *
 * The renderer names the session; main spawns the shell and keys its registry
 * by that name. Doing it the other way round — main minting the id and
 * returning it — would leave the tab without an identity for the round trip,
 * and every tab in the UI needs one the moment it is drawn.
 */
export interface TerminalInfo {
  id: string;
  /** The shell's process id. Also its process *group*, which is what gets signalled. */
  pid: number;
  /** The program that was spawned, e.g. `/bin/zsh`. */
  shell: string;
}

/** A batch of output. Many PTY writes are coalesced into one of these. */
export interface TerminalData {
  id: string;
  data: string;
}

/** The shell exited, on its own or because it was killed. */
export interface TerminalExit {
  id: string;
  exitCode: number;
  signal?: number;
}
