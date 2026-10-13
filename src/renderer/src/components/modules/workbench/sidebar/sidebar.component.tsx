import { cn } from 'cn';
import {
  ChevronLeft,
  ChevronRight,
  FolderClosed,
  FolderGit2,
  LayoutTemplate,
  PencilRuler,
  Search,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useProject } from '~/lib/project';
import {
  useSidebar,
  useSidebarResize,
  type SidebarModule,
} from '~/lib/sidebar';
import { useOpenGit } from '~/lib/window';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../ui';
import Boards from './boards';
import Explorer from './explorer';
import GlobalSearch from './search';
import AnimatedLogo from '~/components/utils/animated-logo';

interface SidebarMenuItem {
  icon: ReactNode;
  onClick: () => void;
  label: string;
  focused?: boolean;
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
    },
    {
      icon: <Search className="size-5" />,
      onClick: () => toggleModule('SEARCH'),
      label: 'Search',
      focused: module === 'SEARCH' && !collapsed,
    },
    {
      icon: <PencilRuler className="size-5" />,
      onClick: () => toggleModule('BOARDS'),
      label: 'Boards',
      focused: module === 'BOARDS' && !collapsed,
    },
    {
      icon: <FolderGit2 className="size-5" />,
      onClick: openGit,
      label: 'Source control',
      focused: false,
    },
    {
      icon: <LayoutTemplate className="size-5" />,
      onClick: () => {},
      label: 'Manage windows',
      focused: false,
    },
  ];

  return (
    <div className="w-8 h-full flex flex-col gap-3 pt-1 shrink-0">
      {items.map((item, i) => (
        <SidebarMenuItem key={i} item={item} />
      ))}
      <SidebarMenuItem
        item={{
          icon: collapsed ? (
            <ChevronRight className="size-5" />
          ) : (
            <ChevronLeft className="size-5" />
          ),
          onClick: toggleCollapsed,
          label: collapsed ? 'Show explorer' : 'Hide explorer',
        }}
        className="mt-auto"
      />
      <div className="w-full flex justify-center">
        <AnimatedLogo className="w-6" />
      </div>
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
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
