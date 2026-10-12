export interface SidebarStore {
  /** Width of the whole sidebar — icon rail included — in pixels. */
  width: number;
  /** Hidden sidebars keep their width, so showing one again restores it. */
  collapsed: boolean;

  module: SidebarModule;

  /** Clamped to [`MIN_SIDEBAR_WIDTH`, `MAX_SIDEBAR_WIDTH`] on the way in. */
  setWidth: (width: number) => void;
  toggleCollapsed: () => void;
  setModule: (module: SidebarModule) => void;
}

export type SidebarModule = 'EXPLORER' | 'SEARCH';
