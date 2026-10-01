import { EmbeddedTerminalRenderable, TextAttributes } from '@opentui/core';
import { extend } from '@opentui/react';
import { useTheme } from '~/lib/theme';
import { useTerminal } from './terminal.hook';
import type { TerminalProps } from './terminal.def';
import { usePaletteStore } from '../palette/palette.store';

// Register OpenTUI's VT-emulator renderable as the `<embeddedTerminal>`
// intrinsic. Runs once on import; `extend` is idempotent per key.
extend({ embeddedTerminal: EmbeddedTerminalRenderable });

export default function Terminal({
  focused = true,
  active = true,
  onFocusRequest,
}: TerminalProps) {
  const { terminalRef, exited, handleData, handleResize } = useTerminal(
    focused,
    onFocusRequest
  );

  const { open: paletteOpen } = usePaletteStore();
  const { colors } = useTheme();

  // useKeyboard((e) => {
  //   if (e.ctrl && e.name === 'c') {
  //     e.preventDefault();
  //     e.stopPropagation();
  //   }
  // });

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      backgroundColor={colors.terminalBg}
      visible={active}
    >
      <embeddedTerminal
        ref={terminalRef}
        flexGrow={1}
        width={'100%'}
        onData={handleData}
        onTerminalResize={handleResize}
        visible={!paletteOpen}
      />
      {exited && (
        <box flexShrink={0} paddingX={1}>
          <text fg={colors.fgMuted} attributes={TextAttributes.DIM}>
            Session ended — close this window to dismiss.
          </text>
        </box>
      )}
    </box>
  );
}
