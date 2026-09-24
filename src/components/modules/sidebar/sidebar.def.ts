export interface SidebarStore {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;

  showIcons: boolean;
  setShowIcons: (show: boolean) => void;

  showToolbar: boolean;
  setShowToolbar: (show: boolean) => void;
}
