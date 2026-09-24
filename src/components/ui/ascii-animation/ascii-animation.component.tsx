import type { ColorInput } from '@opentui/core';
import type { AsciiAnimationProps } from './ascii-animation.def';
import { useAsciiAnimation } from './ascii-animation.hook';

export default function AsciiAnimation(props: AsciiAnimationProps) {
  const { animation, playing = true, onComplete, boxProps } = props;
  const { frame, font, color } = useAsciiAnimation(
    animation,
    playing,
    onComplete
  );

  if (!frame) return null;

  // Raw multi-line ASCII art (e.g. the spinning globe): render each line as its
  // own <text> so newlines are preserved and the block stays rectangular.
  if (animation.render === 'text') {
    const lines = frame.text.split('\n');
    return (
      <box alignItems="center" justifyContent="center" {...boxProps}>
        <box flexDirection="column">
          {lines.map((line, i) => (
            <text key={i} fg={color as ColorInput} wrapMode="none">
              {line}
            </text>
          ))}
        </box>
      </box>
    );
  }

  return (
    <box alignItems="center" justifyContent="center" {...boxProps}>
      <ascii-font font={font} text={frame.text} color={color} />
    </box>
  );
}
