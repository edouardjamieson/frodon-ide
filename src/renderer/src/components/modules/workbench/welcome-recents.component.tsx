import { X } from 'lucide-react';
import { useHome } from '~/lib/app';
import {
  resolveProjectColor,
  resolveProjectIcon,
  resolveProjectName,
  shortenPath,
  useProject,
  useRecentProjects,
} from '~/lib/project';
import { useTheme } from '~/lib/theme';
import type { RecentProject } from '@shared/project.def';

/**
 * The way back into the last few projects, under the launcher's button.
 *
 * Opening from here goes through the same `openPath` the picker ends in, so
 * a project opened from a row is indistinguishable downstream from one
 * opened from the dialog — same recording, same window, same everything.
 *
 * Draws nothing at all on a first run. An empty list with a heading over it
 * would be a promise that the app has a history it does not have yet.
 */

interface WelcomeRecentsProps {
  onColorChange: (color: string | null) => void;
}

export default function WelcomeRecents({ onColorChange }: WelcomeRecentsProps) {
  const { recents, forget } = useRecentProjects();
  const { openPath, opening } = useProject();

  if (recents.length === 0) return null;

  return (
    <div
      className="z-10 flex w-80 flex-col gap-1"
      onMouseLeave={() => onColorChange(null)}
    >
      <p className="px-2 text-[11px] font-medium tracking-wide text-fg-subtle">
        Recent
      </p>

      {recents.map((recent) => (
        <Row
          key={recent.path}
          recent={recent}
          disabled={opening}
          onOpen={() => void openPath(recent.path)}
          onForget={() => void forget(recent.path)}
          onMouseOver={onColorChange}
        />
      ))}
    </div>
  );
}

/**
 * One project: its color, its name, where it is, and a way to forget it.
 *
 * Two buttons side by side rather than one with the other nested inside it —
 * a button inside a button is invalid, and the two do genuinely different
 * things to the same row. The forget button stays hidden until the row is
 * hovered or something in it has focus, so five rows read as five projects
 * rather than as five projects and five ways to lose them.
 */
function Row({
  recent,
  disabled,
  onOpen,
  onForget,
  onMouseOver,
}: {
  recent: RecentProject;
  disabled: boolean;
  onOpen: () => void;
  onForget: () => void;
  onMouseOver: (color: string) => void;
}) {
  const home = useHome();
  const dark = useTheme().dark;

  // Resolved through the same three functions the open project goes through,
  // against the config main read out of that project on its way here. A
  // project that renamed itself is listed under the name it chose, which is
  // the only reason `RecentProject` carries a config at all.
  const name = resolveProjectName(recent.path, recent.config);
  const color = resolveProjectColor(name, recent.config, dark);
  const icon = resolveProjectIcon(name, recent.config);

  return (
    <div
      className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-row-hover border"
      onMouseEnter={() => onMouseOver(color)}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        title={recent.path}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-focus-ring/50 disabled:opacity-50"
      >
        {/* Chosen if the project chose one, hashed from its name otherwise —
            the same answer the header and the backdrop will give, so a
            project is the same color here as it will be once it is open. The
            one legitimate reason for a color in JS; see `docs/theme.md`. */}
        <span
          aria-hidden
          style={{ backgroundColor: color }}
          className="flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-shadow-lg"
        >
          {icon}
        </span>
        <span className="truncate text-[13px] text-fg">{name}</span>
        <span className="min-w-0 flex-1 truncate text-right text-[11px] text-fg-subtle">
          {shortenPath(recent.path, home)}
        </span>
      </button>

      <button
        type="button"
        onClick={onForget}
        aria-label={`Forget ${name}`}
        title="Remove from recents"
        className="cursor-pointer rounded-md p-1 text-fg-subtle opacity-0 transition-opacity outline-none hover:text-fg focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-focus-ring/50 group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
