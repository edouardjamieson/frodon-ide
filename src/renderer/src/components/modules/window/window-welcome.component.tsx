import { FileCode, FolderGit2, Globe, SquareTerminal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Silk } from '~/components/ui';
import AnimatedLogo from '~/components/utils/animated-logo';
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
      <AnimatedLogo className="w-20 z-10" />
      <p className="text-[12px] text-white text-center">
        Select one of the options below to get started
      </p>

      <div className="grid grid-cols-2 items-center gap-2 z-10">
        <Choice type="editor" label="Code editor" onPick={setType}>
          <FileCode className="size-4" />
        </Choice>
        <Choice type="terminal" label="Terminal" onPick={setType}>
          <SquareTerminal className="size-4" />
        </Choice>
        <Choice type="git" label="Source control" onPick={setType}>
          <FolderGit2 className="size-4" />
        </Choice>
        <Choice type="browser" label="Browser" onPick={setType}>
          <Globe className="size-4" />
        </Choice>
      </div>

      {/*
       * Silk rather than a flat wash, for the same reason the welcome screen
       * dithers: a window that has not been told what it is should look
       * unfinished rather than broken. No background color is handed over —
       * Silk draws premultiplied alpha, so the window's own themed surface
       * stays underneath and only the folds are added on top.
       *
       * The folds take the project color, so an empty window says which
       * repository it belongs to in the same hue as the rest of the chrome.
       * `lightMode` is the theme's, not a guess: the shader shades pale silk
       * over light backgrounds and dark silk over dark ones.
       */}
      <div className="w-full h-full absolute opacity-10 z-0 pointer-events-none">
        <Silk
          color={color}
          sheenColor={theme.colors.fg}
          lightMode={!theme.dark}
          className="pointer-events-none"
          speed={2}
          scale={0.7}
          noiseIntensity={1.2}
          depth={0.6}
          glow={0.25}
          sheen={0.4}
          ripple={1.4}
          fade={0.35}
          mouseInteraction={false}
          clickRipple={false}
          intro
        />
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
    <Button
      className="cursor-pointer"
      variant={'outline'}
      onClick={() => onPick(type)}
    >
      {children}
      {label}
    </Button>
  );
}
