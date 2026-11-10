import {
  Bot,
  ChevronRight,
  FileCode,
  FolderGit2,
  Globe,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { Silk } from '~/components/ui';
import AnimatedLogo from '~/components/utils/animated-logo';
import { useProjectColor } from '~/lib/project';
import { useTheme } from '~/lib/theme';
import {
  useWindow,
  useWindowBreakpoints,
  type EmptyWindow,
  type WindowType,
} from '~/lib/window';

/**
 * What an empty window can become, in the order offered.
 *
 * A list and not a grid: five things never fill two columns evenly, and a
 * grid of buttons sized to their labels squeezes into a ragged block as the
 * tile narrows. One column of full-width rows stays aligned at any width and
 * has room to say, in a few words, what each choice is for.
 */
const CHOICES: {
  type: WindowType;
  label: string;
  hint: string;
  icon: LucideIcon;
}[] = [
  {
    type: 'editor',
    label: 'Code editor',
    hint: 'Open files in tabs',
    icon: FileCode,
  },
  {
    type: 'terminal',
    label: 'Terminal',
    hint: 'A shell in the project',
    icon: SquareTerminal,
  },
  {
    type: 'git',
    label: 'Source control',
    hint: 'Changes, history and branches',
    icon: FolderGit2,
  },
  {
    type: 'browser',
    label: 'Browser',
    hint: 'A web page beside your code',
    icon: Globe,
  },
  {
    type: 'agent',
    label: 'Agent',
    hint: 'A conversation with a coding agent',
    icon: Bot,
  },
];

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

  // What a small tile gives up, in order: the line under each choice when it
  // is narrow or short, then the logo and the prompt when it is short. The
  // five rows are the point and are the last thing to go — past that the
  // list scrolls rather than squeezing.
  const { atLeast, atLeastTall } = useWindowBreakpoints(win.id);
  const roomy = atLeast('sm') && atLeastTall('sm');
  const tall = atLeastTall('md');

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="relative z-10 flex min-h-full flex-col items-center justify-center gap-4 p-4">
        {tall ? (
          <>
            <AnimatedLogo className="w-16 z-10" />
            <p className="z-10 text-center text-[12px] text-fg-muted">
              What should this window be?
            </p>
          </>
        ) : null}

        <div className="z-10 flex w-full max-w-72 flex-col gap-0.5 rounded-lg border border-pane-border bg-editor/70 p-1 backdrop-blur-sm">
          {CHOICES.map((choice) => (
            <Choice
              key={choice.type}
              {...choice}
              hint={roomy ? choice.hint : null}
              onPick={setType}
            />
          ))}
        </div>
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
      <div className="w-full h-full absolute inset-0 opacity-10 z-0 pointer-events-none">
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
  hint,
  icon: Icon,
  onPick,
}: {
  type: WindowType;
  label: string;
  /** Null when the tile is too small to spare the line. */
  hint: string | null;
  icon: LucideIcon;
  onPick: (type: WindowType) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(type)}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-row-hover focus-visible:bg-row-hover focus-visible:outline-none',
        hint ? 'py-2' : 'py-1.5'
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-pane-border text-fg-muted transition-colors group-hover:text-fg-accent group-focus-visible:text-fg-accent">
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] text-fg">{label}</span>
        {hint ? (
          <span className="truncate text-[11px] text-fg-subtle">{hint}</span>
        ) : null}
      </span>
      <ChevronRight className="size-3.5 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  );
}
