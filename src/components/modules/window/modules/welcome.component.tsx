import { useWindowManagerStore } from '~/lib/window/window.store';
import type { WindowModuleProps } from './modules.def';
import Button from '~/components/ui/button';
import { WindowType } from '~/lib/window';
import { useKeyboard } from '@opentui/react';
import AsciiAnimation, {
  EXODIA_LOGO_ANIMATION,
  SPINNING_GLOBE_ANIMATION,
} from '~/components/ui/ascii-animation';
import { TextAttributes } from '@opentui/core';

export default function WindowWelcomePage(props: WindowModuleProps) {
  const { window, isFocused } = props;
  const { setWindowType } = useWindowManagerStore();

  useKeyboard((key) => {
    if (!isFocused) return;
    if (key.number && key.name === '1') {
      setWindowType(window.id, WindowType.CODE_EDITOR);
      return;
    }
    if (key.number && key.name === '2') {
      setWindowType(window.id, WindowType.TERMINAL);
      return;
    }
  });

  return (
    <box
      flexGrow={1}
      backgroundColor={'#000'}
      alignItems="center"
      justifyContent="center"
      gap={2}
    >
      <AsciiAnimation animation={EXODIA_LOGO_ANIMATION} />
      <text attributes={TextAttributes.DIM}>
        Open a code editor or a terminal to get started
      </text>
      <box flexDirection="row" gap={4} alignItems="center">
        <Button
          size="md"
          text="[1] New code editor"
          onClick={() => setWindowType(window.id, WindowType.CODE_EDITOR)}
        />
        <Button
          size="md"
          text="[2] New terminal"
          onClick={() => setWindowType(window.id, WindowType.TERMINAL)}
        />
      </box>
    </box>
  );
}
