import { cn } from 'cn';
import {
  ChevronLeft,
  ChevronRight,
  FolderClosed,
  FolderGit2,
  GitBranch,
  PencilRuler,
  Search,
  Settings,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useProject } from '~/lib/project';
import {
  useSidebar,
  useSidebarResize,
  type SidebarModule,
} from '~/lib/sidebar';
import { useOpenSettings } from '~/lib/settings';
import { useOpenGit } from '~/lib/window';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../ui';
import Boards from './boards';
import Explorer from './explorer';
import GlobalSearch from './search';
import Worktrees from './worktrees';

interface SidebarMenuItem {
  icon: ReactNode;
  onClick: () => void;
  label: string;
  focused?: boolean;
  shortcut?: string[];
}

export default function Sidebar() {
  const { files } = useProject();
  const { width, collapsed, module } = useSidebar();

  const Module = useMemo(() => {
    switch (module) {
      case 'EXPLORER':
        return <Explorer files={files} />;
      case 'SEARCH':
        return <GlobalSearch />;
      case 'BOARDS':
        return <Boards />;
      case 'WORKTREES':
        return <Worktrees />;
      default:
        return null;
    }
  }, [module, files]);

  return (
    // Width is inline because it is a dragged pixel value, not one of a set of
    // states a class could name. Collapsed falls back to the rail's own width,
    // so the icons stay reachable and the panel is the only thing that goes.
    <aside
      style={collapsed ? undefined : { width }}
      className={cn('relative flex h-full shrink-0 gap-2', {
        'w-8': collapsed,
      })}
    >
      <SidebarMenu collapsed={collapsed} />

      {collapsed ? null : (
        <>
          <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-project/15 bg-sidebar">
            {Module}
          </div>
          <SidebarResizer />
        </>
      )}
    </aside>
  );
}

/**
 * The drag handle, sitting in the gap between the sidebar and the workbench.
 *
 * Same idea as the window gutters: the 8px gap the panels are drawn inside
 * *is* the thing you grab, so resizing costs no layout of its own. It is
 * positioned outside the aside's right edge, which is why the aside no longer
 * clips its overflow — the rounded panel does that for itself now.
 */
function SidebarResizer() {
  const { resizing, ...handlers } = useSidebarResize();

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className="group absolute inset-y-0 -right-2 z-10 flex w-2 cursor-col-resize justify-center"
      {...handlers}
    >
      <div
        className={cn(
          'h-full w-0.5 rounded-full transition-colors',
          resizing ? 'bg-neutral-600' : 'group-hover:bg-neutral-600'
        )}
      />
    </div>
  );
}

function SidebarMenu({ collapsed }: { collapsed: boolean }) {
  const { toggleCollapsed, setModule, module } = useSidebar();
  // Source control is the one rail item that is not a sidebar module: it
  // opens a window in the workbench, because a graph log and a diff want the
  // width the sidebar does not have. Clicking it again focuses that window
  // rather than opening a second.
  const openGit = useOpenGit();
  // Neither a module nor a window: a dialog over everything. It sits at the
  // bottom with the collapse toggle, away from the four things that change
  // what the panel is showing.
  const openSettings = useOpenSettings();

  const toggleModule = (newModule: SidebarModule) => {
    if (module === newModule) {
      toggleCollapsed();
    } else {
      setModule(newModule);
      if (collapsed) {
        toggleCollapsed();
      }
    }
  };

  const items: SidebarMenuItem[] = [
    {
      icon: <FolderClosed className="size-5" />,
      onClick: () => toggleModule('EXPLORER'),
      label: 'Explorer',
      focused: module === 'EXPLORER' && !collapsed,
      shortcut: ['mod', 'shift', 'e'],
    },
    {
      icon: <Search className="size-5" />,
      onClick: () => toggleModule('SEARCH'),
      label: 'Search',
      focused: module === 'SEARCH' && !collapsed,
      shortcut: ['mod', 'shift', 'f'],
    },
    {
      icon: <PencilRuler className="size-5" />,
      onClick: () => toggleModule('BOARDS'),
      label: 'Boards',
      focused: module === 'BOARDS' && !collapsed,
      shortcut: ['mod', 'shift', 'b'],
    },
    {
      icon: <GitBranch className="size-5" />,
      onClick: openGit,
      label: 'Source control',
      focused: false,
      shortcut: ['mod', 'shift', 'g'],
    },
    {
      icon: <FolderGit2 className="size-5" />,
      onClick: () => toggleModule('WORKTREES'),
      label: 'Worktrees',
      focused: module === 'WORKTREES' && !collapsed,
      shortcut: ['mod', 'shift', 'w'],
    },
  ];

  return (
    <div className="w-8 h-full flex flex-col gap-3 pt-1 shrink-0">
      {items.map((item, i) => (
        <SidebarMenuItem key={i} item={item} />
      ))}
      <SidebarMenuItem
        item={{
          icon: <Settings className="size-5" />,
          onClick: () => openSettings(),
          label: 'Settings',
          shortcut: ['mod', ','],
        }}
        className="mt-auto"
      />
      <SidebarMenuItem
        item={{
          icon: collapsed ? (
            <ChevronRight className="size-5" />
          ) : (
            <ChevronLeft className="size-5" />
          ),
          onClick: toggleCollapsed,
          label: collapsed ? 'Show explorer' : 'Hide explorer',
          shortcut: ['mod', 'b'],
        }}
      />
    </div>
  );
}

function SidebarMenuItem({
  item,
  className,
}: {
  item: SidebarMenuItem;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={item.onClick}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-lg opacity-60 hover:opacity-100 transition-all cursor-pointer',
            {
              'bg-project/80 opacity-100': item.focused,
              'hover:bg-project/20': !item.focused,
            },
            className
          )}
        >
          {item.icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" shortcut={item.shortcut}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}
