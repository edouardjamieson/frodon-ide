import { FileCode, FolderGit2, SquareTerminal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dither } from '~/components/ui';
import { useProjectColor } from '~/lib/project';
import { useTheme } from '~/lib/theme';
import { useWindow, type EmptyWindow, type WindowType } from '~/lib/window';

/**
 * What a window shows before it has been told what it is.
 *
 * A window is spawned empty rather than guessing, because the split that
 * creates it says nothing about what it is for. Picking here is the one moment
 * the type is chosen: after that it is fixed, and closing the window is how it
 * changes.
 */
export function EmptyWindowHeader() {
  return (
    <span className="self-center pl-3 text-[12px] text-fg-muted">
      New window
    </span>
  );
}

export function EmptyWindowBody({ window: win }: { window: EmptyWindow }) {
  const { setType } = useWindow(win);
  const theme = useTheme();
  const color = useProjectColor();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 relative">
      <p className="text-[12px] text-fg-subtle">
        Open a code editor, a terminal or the repository to get started.
      </p>

      <div className="w-full h-full absolute opacity-10 z-0 pointer-events-none">
        <Dither
          waveColor={color}
          backgroundColor={theme.colors.appBg}
          ditherMode="bayer"
          className="pointer-events-none"
          colorNum={4}
          pixelSize={2}
          waveSpeed={0.05}
          waveFrequency={3}
          waveAmplitude={0.24}
          mouseEffect="reveal"
          mouseRadius={0.3}
          palette={[]}
          scale={1}
          contrast={1}
          brightness={-0.18}
          mouseStrength={0.3}
          trail={0.5}
          enableMouseInteraction={false}
          clickRipple={false}
          intro
          disableAnimation={false}
        />
      </div>

      <div className="flex items-center gap-2">
        <Choice type="editor" label="Code editor" onPick={setType}>
          <FileCode className="size-4" />
        </Choice>
        <Choice type="terminal" label="Terminal" onPick={setType}>
          <SquareTerminal className="size-4" />
        </Choice>
        <Choice type="git" label="Source control" onPick={setType}>
          <FolderGit2 className="size-4" />
        </Choice>
      </div>
    </div>
  );
}

function Choice({
  type,
  label,
  onPick,
  children,
}: {
  type: WindowType;
  label: string;
  onPick: (type: WindowType) => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={() => onPick(type)}
      className="flex cursor-pointer items-center gap-2 rounded-lg border border-pane-border bg-button px-3 py-2 text-[12px] text-button-fg transition-colors hover:border-pane-border-focused hover:bg-button-hover"
    >
      {children}
      {label}
    </button>
  );
}
