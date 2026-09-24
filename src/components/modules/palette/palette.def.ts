export interface PaletteGroup {
  name: string;
  items: PaletteItem[];
}

export interface PaletteItem {
  id: string;
  type: 'MODULE' | 'ACTION';

  icon?: string;
  title?: string;
  description?: string;
  shortcut?: `ctrl+${string}`;

  execute?: () => void;
}

export interface PaletteStore {
  open: boolean;
  setOpen: (open: boolean, activeModule?: string) => void;
  close: () => void;

  activeModule: string;
  setActiveModule: (activeModule: string) => void;

  search: string;
  setSearch: (search: string) => void;
}

export interface PaletteModuleProps {
  item: PaletteItem;
}
