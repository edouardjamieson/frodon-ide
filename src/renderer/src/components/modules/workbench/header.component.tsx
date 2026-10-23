import { useProject } from '~/lib/project';
import { useOpenSettings } from '~/lib/settings';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui';
import GitControls from '~/components/modules/git';
import { useBranchLabel, useIsWorktree } from '~/lib/git';
import { FolderGit2 } from 'lucide-react';

export default function Header() {
  const { name, icon, isOpen } = useProject();
  const openSettings = useOpenSettings();
  const branchLabel = useBranchLabel();
  const isWorktree = useIsWorktree();

  if (!isOpen) return <header className="h-12 shrink-0" />;

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 pl-[96px] pr-2">
      {/* The badge is the project's three settings drawn together — its
          icon, in its color, beside its name — so it is also the way into
          them. Opening on `project.general` rather than wherever the dialog
          was last left: a click here means *this*. */}
      <div className="flex items-center gap-1 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => openSettings('project.general')}
              className="group flex shrink-0 cursor-pointer items-center gap-2 rounded-md py-1 pl-1 pr-2 text-left transition-colors hover:bg-project/15"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-project text-sm font-bold text-shadow-lg">
                {icon}
              </div>
              <span className="text-xs font-semibold">{name}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" shortcut={['mod', ',']}>
            Project settings
          </TooltipContent>
        </Tooltip>
        {isWorktree && <span className="font-bold text-neutral-500">/</span>}
        {isWorktree && (
          <div className="flex shrink-0 items-center gap-1.5 pl-2">
            <FolderGit2 className="size-4 text-project" />
            <span className="text-neutral-100 font-semibold">
              {branchLabel}
            </span>
          </div>
        )}
      </div>

      <div className="w-full h-full [-webkit-app-region:drag]"></div>

      <GitControls />
    </header>
  );
}
