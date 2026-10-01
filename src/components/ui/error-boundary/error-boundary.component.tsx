import { Component, type ErrorInfo } from 'react';
import { useKeyboard, useRenderer } from '@opentui/react';
import { TextAttributes } from '@opentui/core';
import { useTheme } from '~/lib/theme';
import Logger from '~/lib/logger/logger.service';
import { restoreTerminal } from '~/lib/crash';
import type {
  ErrorBoundaryProps,
  ErrorBoundaryState,
  ErrorFallbackProps,
} from './error-boundary.def';

/**
 * What a caught render error looks like in the terminal. Kept to the message
 * and a couple of stack frames: the whole stack is in ./test.log, and this has
 * to stay readable inside a single pane.
 */
export function ErrorFallback({
  error,
  label,
  fatal,
  onRetry,
}: ErrorFallbackProps) {
  const renderer = useRenderer();
  const { colors } = useTheme();

  // Only the app-level boundary takes the keyboard. A window-level fallback
  // that grabbed bare `q`/`r` would swallow them from every other window's
  // editor, so those keep the shortcuts they already had.
  useKeyboard((key) => {
    if (!fatal) return;
    if (key.name === 'r') onRetry();
    if (key.name === 'q') {
      restoreTerminal(renderer);
      process.exit(1);
    }
  });

  const frames = (error.stack ?? '')
    .split('\n')
    .slice(1, 4)
    .map((line) => line.trim());

  return (
    <box
      flexGrow={1}
      padding={1}
      gap={1}
      border
      borderColor={colors.errorBorder}
      backgroundColor={colors.appBg}
    >
      <text fg={colors.errorTitleFg} attributes={TextAttributes.BOLD}>
        {label ?? 'Something broke'}
      </text>

      <text fg={colors.fg}>{error.message || String(error)}</text>

      {frames.length > 0 && (
        <box>
          {frames.map((frame, i) => (
            <text key={i} fg={colors.fgSubtle}>
              {frame}
            </text>
          ))}
        </box>
      )}

      <text fg={colors.fgMuted} attributes={TextAttributes.DIM}>
        {fatal
          ? 'r to retry  ·  q to quit  ·  full stack in ./test.log'
          : 'Ctrl+W to close this window  ·  full stack in ./test.log'}
      </text>
    </box>
  );
}

/**
 * Stops one broken subtree from taking down the whole editor.
 *
 * Without this, any render error unmounts the entire React tree: the terminal
 * is left on the alternate screen showing nothing, with the process still
 * alive. Wrapping each window means a crash in one editor pane is contained to
 * that pane, and the app-level boundary catches whatever escapes.
 *
 * Has to be a class — `getDerivedStateFromError` has no hook equivalent.
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // console.* would corrupt the render, so the component stack goes to the
    // file log — it's the part that actually says which component threw.
    Logger.log(
      `error-boundary${this.props.label ? ` (${this.props.label})` : ''}: ` +
        `${error.stack ?? error.message}\n${info.componentStack ?? ''}`
    );
    this.props.onError?.(error);
  }

  reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <ErrorFallback
        error={error}
        label={this.props.label}
        fatal={this.props.fatal}
        onRetry={this.reset}
      />
    );
  }
}
