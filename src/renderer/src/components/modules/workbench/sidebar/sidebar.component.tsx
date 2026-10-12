import { cn } from 'cn';
import {
  ChevronLeft,
  ChevronRight,
  FolderClosed,
  FolderGit2,
  LayoutTemplate,
  Search,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useProject } from '~/lib/project';
import { useSidebar, useSidebarResize } from '~/lib/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../ui';
import Explorer from '../../explorer';

interface SidebarMenuItem {
  icon: ReactNode;
  onClick: () => void;
  label: string;
}

export default function Sidebar() {
  const { files } = useProject();
  const { width, collapsed, toggleCollapsed } = useSidebar();

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
      <SidebarMenu collapsed={collapsed} onToggle={toggleCollapsed} />

      {collapsed ? null : (
        <>
          <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-project/15 bg-sidebar">
            <Explorer files={files} />
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

function SidebarMenu({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { toggleCollapsed } = useSidebar();

  const items: SidebarMenuItem[] = [
    {
      icon: <FolderClosed className="size-5" />,
      // Clicking the panel you are already looking at hides it, the way every
      // other activity bar behaves. With no keybinding registry yet (see
      // `docs/migration.md`) this is the only way back and forth.
      onClick: onToggle,
      label: collapsed ? 'Show explorer' : 'Hide explorer',
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
    <div className="w-8 h-full flex flex-col gap-3 pt-1 shrink-0">
      {items.map((item, i) => (
        <SidebarMenuItem key={i} item={item} focused={i === 0 && !collapsed} />
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
        focused={false}
        className="mt-auto"
      />
    </div>
  );
}

function SidebarMenuItem({
  item,
  focused,
  className,
}: {
  item: SidebarMenuItem;
  focused: boolean;
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
              'bg-project/80 opacity-100': focused,
              'hover:bg-project/20': !focused,
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
