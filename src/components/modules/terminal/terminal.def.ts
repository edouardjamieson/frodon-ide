import type { EmbeddedTerminalRenderable } from '@opentui/core';

export interface TerminalProps {
  /** Whether this terminal receives keyboard input. Defaults to true. */
  focused?: boolean;
  /**
   * Whether this terminal's tab is the active one in its window. Inactive
   * terminals stay mounted (so their shell keeps running) but are hidden via
   * `display: none`, freeing their layout space for the active one. Defaults
   * to true.
   */
  active?: boolean;
  /**
   * Asked for when the user clicks inside the terminal, so the owning window can
   * take focus. The click can't reach the window's own focus handler by
   * bubbling: a foreground program with mouse reporting on (e.g. Claude) makes
   * the embedded terminal consume the event, so this is bridged from the
   * renderable's own mouse-down instead.
   */
  onFocusRequest?: () => void;
}

/**
 * Teach the OpenTUI React reconciler about the `<embeddedTerminal>` intrinsic
 * that `terminal.component.tsx` registers via `extend`. Merges into the
 * catalogue's augmentation interface so JSX gets the renderable's prop types.
 */
declare module '@opentui/react' {
  interface OpenTUIComponents {
    embeddedTerminal: typeof EmbeddedTerminalRenderable;
  }
}
