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
