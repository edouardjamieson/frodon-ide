import type { ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Names what failed, e.g. `The editor`. Shown in the default fallback. */
  label?: string;
  /**
   * Marks this as the boundary of last resort — the one wrapping the whole
   * app. Its fallback binds its own keys, which only makes sense when nothing
   * else is left listening for them.
   */
  fatal?: boolean;
  /** Replaces the default fallback. `reset` re-renders the subtree. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error) => void;
}

export interface ErrorBoundaryState {
  error: Error | null;
}

export interface ErrorFallbackProps {
  error: Error;
  label?: string;
  fatal?: boolean;
  onRetry: () => void;
}
