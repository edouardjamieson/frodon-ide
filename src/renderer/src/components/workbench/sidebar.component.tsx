import { cn } from 'cn';
import { FolderClosed, FolderGit2, LayoutTemplate, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useProject } from '~/lib/project';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui';
import Explorer from '../explorer';

interface SidebarMenuItem {
  icon: ReactNode;
  onClick: () => void;
  label: string;
}

export default function Sidebar() {
  const { files } = useProject();

  return (
    <aside className="flex w-[300px] overflow-hidden shrink-0 h-full gap-2">
      <SidebarMenu />
      <div className="flex flex-col  bg-sidebar border border-project/15 w-full h-full rounded-xl">
        <Explorer files={files} />
      </div>
    </aside>
  );
}

function SidebarMenu() {
  const items: SidebarMenuItem[] = [
    {
      icon: <FolderClosed className="size-5" />,
      onClick: () => {},
      label: 'Explorer',
    },
    {
      icon: <Search className="size-5" />,
      onClick: () => {},
      label: 'Search',
    },
    {
      icon: <FolderGit2 className="size-5" />,
      onClick: () => {},
      label: 'Source Control',
    },
    {
      icon: <LayoutTemplate className="size-5" />,
      onClick: () => {},
      label: 'Manage windows',
    },
  ];

  return (
    <div className="w-8 h-full flex flex-col gap-3 pt-1">
      {items.map((item, i) => (
        <SidebarMenuItem key={i} item={item} focused={i === 0} />
      ))}
    </div>
  );
}

function SidebarMenuItem({
  item,
  focused,
}: {
  item: SidebarMenuItem;
  focused: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-lg opacity-60 hover:opacity-100 transition-all cursor-pointer',
            {
              'bg-project/80 opacity-100': focused,
              'hover:bg-project/20': !focused,
            }
          )}
        >
          {item.icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
